import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { MAX_PHOTO_BYTES, replacePhoto } from './workflow.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in required' }, 401);
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return json({ error: 'Sign in required' }, 401);
  // Approved enrolled anonymous-auth sessions are staff; unauthenticated callers
  // and authenticated users without a staff membership cannot reserve an object.
  const actor = user.id;
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await service.rpc(name, { p_actor: actor, ...args });
    if (error) throw new Error(error.message);
    return data as T;
  }
  async function cleanup() {
    const paths = await rpc<string[]>('dog_photo_cleanup');
    if (!paths.length) return;
    const { error } = await service.storage.from('dog-photos').remove(paths);
    if (error) throw new Error('Photo cleanup will be retried.');
    await rpc('ack_dog_photo_cleanup', { p_paths: paths });
  }
  try {
    // A staff caller can explicitly retry its workspace's queued cleanup without
    // supplying file paths or uploading another photo.
    if (request.headers.get('Content-Type')?.startsWith('application/json')) {
      await cleanup(); return json({ cleaned: true });
    }
    // Bound even chunked multipart bodies before parsing into memory.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Image required' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_PHOTO_BYTES + 65536) { await reader.cancel(); return json({ error: 'Photo exceeds 5 MB' }, 413); }
      chunks.push(value);
    }
    const body = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
    const dog = form.get('dogId'); const expected = form.get('expectedPath'); const photo = form.get('photo');
    if (typeof dog !== 'string' || !/^[0-9a-f-]{36}$/i.test(dog) || typeof expected !== 'string' || !(photo instanceof File)) return json({ error: 'Dog and image required' }, 400);
    const result = await replacePhoto(new Uint8Array(await photo.arrayBuffer()), photo.type, {
      reserve: extension => rpc<string>('reserve_dog_photo', { p_dog: dog, p_extension: extension }),
      async upload(path, bytes, type) {
        const { error } = await service.storage.from('dog-photos').upload(path, bytes, { contentType: type, upsert: false });
        if (error) throw new Error('Photo upload failed. Please try again.');
      },
      commit: path => rpc('commit_dog_photo', { p_dog: dog, p_path: path, p_expected: expected || null }),
      retire: path => rpc('retire_dog_photo', { p_path: path }),
      cleanup,
    });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Photo replacement failed' }, 400);
  }
});
