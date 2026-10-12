import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Dog, Profile, Snapshot } from './model';
import { photoError } from './model';
import type { Repository } from './repository';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client = url && key && !url.includes('YOUR_PROJECT') ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export function cloudRepository(db: SupabaseClient = client!): Repository {
  // Session-scoped, memory-only caches: never persist private roster or photo URLs.
  const preparedDates = new Map<string, Promise<unknown>>();
  const photoLinks = new Map<string, { url: string; expires: number }>();
  const signing = new Map<string, Promise<void>>();
  let cacheGeneration = 0;
  const clearCaches = () => { cacheGeneration++; preparedDates.clear(); photoLinks.clear(); signing.clear(); };
  let cacheUser: string | undefined;
  async function sessionUser() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session?.user) { clearCaches(); throw new Error('Please sign in again.'); }
    if (cacheUser !== session.user.id) { clearCaches(); cacheUser = session.user.id; }
    return session.user;
  }
  async function rpc<T = void>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  return {
    demo: false,
    async profile() {
      // The session ID selects a row; RLS and every planner RPC still verify access on the server.
      const user = await sessionUser();
      const { data, error } = await db.from('staff_profiles').select('id,display_name,role,workspace_id').eq('id', user.id).single();
      if (error || !data) throw new Error('Your account needs staff access. Ask your manager to add your staff profile.');
      return data as Profile;
    },
    async snapshot(date) {
      await sessionUser();
      if (!preparedDates.has(date)) {
        const preparation = rpc('ensure_planning_day', { p_date: date }).catch(error => {
          preparedDates.delete(date); throw error;
        });
        preparedDates.set(date, preparation);
      }
      await preparedDates.get(date);
      const state = await rpc<Snapshot>('planning_snapshot', { p_date: date });
      if (!Array.isArray(state.rules)) throw new Error('The handling notes and interaction rules migration is required before using this version.');
      if (!('workspace_id' in state.day)) {
        throw new Error('Apply 003_workspace_history.sql before using the shared pilot.');
      }
      if (state.groups.some(g => g.run_version === undefined)) throw new Error('Apply 004_runs_markers.sql before using runs and dog markers.');
      if (state.assignments.some(a => !a.attendance_status)) {
        throw new Error('The attendance migration is required. Apply 002_attendance.sql before using this board.');
      }
      for (const dog of state.dogs) {
        const link = dog.photo_path ? photoLinks.get(dog.photo_path) : undefined;
        dog.photo_url = link && link.expires > Date.now() ? link.url : undefined;
      }
      return state;
    },
    async photos(state) {
      await sessionUser();
      const generation = cacheGeneration;
      const paths = [...new Set(state.dogs.map(d => d.photo_path).filter((p): p is string => !!p))];
      if (paths.length) {
        const now = Date.now();
        for (const [path, link] of photoLinks) if (link.expires <= now || !paths.includes(path)) photoLinks.delete(path);
        const missing = paths.filter(path => !photoLinks.has(path) && !signing.has(path));
        if (missing.length) {
          const request = (async () => {
            const { data } = await db.storage.from('dog-photos').createSignedUrls(missing, 3600);
            if (generation !== cacheGeneration) return;
            for (const link of data || []) if (link.path && link.signedUrl && !link.error) {
              photoLinks.set(link.path, { url: link.signedUrl, expires: now + 55 * 60_000 });
            }
          })().finally(() => {
            if (generation === cacheGeneration) for (const path of missing) signing.delete(path);
          });
          for (const path of missing) signing.set(path, request);
        }
        await Promise.all(paths.map(path => signing.get(path)));
      }
      // Never mutate an already-rendered snapshot or resurrect URLs after sign-out.
      return { ...state, dogs: state.dogs.map(dog => ({ ...dog, photo_url:
        generation === cacheGeneration && dog.photo_path ? photoLinks.get(dog.photo_path)?.url : undefined })) };
    },
    watch(date, changed, status) {
      const channel = db.channel(`board:${date}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_days', filter: `local_date=eq.${date}` }, changed)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dogs' }, changed)
        .subscribe(state => {
          status(state === 'SUBSCRIBED' ? 'online' : state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED' ? 'offline' : 'connecting');
        });
      return () => { void db.removeChannel(channel); };
    },
    add: (day, dog) => rpc('add_to_plan', { p_day: day, p_dog: dog }),
    move: (day, assignment, group, before, version) => rpc('move_assignment', { p_day: day, p_assignment: assignment, p_group: group, p_before: before, p_version: version }),
    remove: (day, assignment, version) => rpc('remove_assignment', { p_day: day, p_assignment: assignment, p_version: version }),
    attendance: (day, assignment, status, version) => rpc('set_attendance', { p_day: day, p_assignment: assignment, p_status: status, p_version: version }),
    rename: (day, group, name, useDefault) => rpc('rename_group', { p_day: day, p_group: group, p_name: name, p_default: useDefault }),
    clear: (day, revision) => rpc('clear_plan', { p_day: day, p_revision: revision }),
    markers: (dog, groomed, noWaterpark, version) => rpc('set_dog_markers', { p_dog: dog, p_groomed: groomed, p_no_waterpark: noWaterpark, p_version: version }),
    saveNotes: (dog, notes, version) => rpc('set_handling_notes', { p_dog: dog, p_notes: notes, p_version: version }),
    saveColour: (dog, colour, version) => rpc('set_dog_colour', { p_dog: dog, p_colour: colour, p_version: version }),
    saveRule: rule => rpc('save_interaction_rule', { p_id: rule.id || null, p_dog_a: rule.dogs[0], p_dog_b: rule.dogs[1], p_level: rule.level, p_note: rule.note, p_version: rule.version ?? null }),
    removeRule: (id, version) => rpc('remove_interaction_rule', { p_id: id, p_version: version }),
    assignRun: (day, group, run, version) => rpc('set_group_run', { p_day: day, p_group: group, p_run: run, p_version: version }),
    async saveDog(dog, photo) {
      const id = dog.id || crypto.randomUUID();
      let path = dog.photo_path || null;
      if (photo) {
        const validation = photoError(photo);
        if (validation) throw new Error(validation);
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.type];
        const workspace = await rpc<string>('current_workspace');
        if (!workspace) throw new Error('Workspace membership is required.');
        path = `${workspace}/${id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await db.storage.from('dog-photos').upload(path, photo, { upsert: false, contentType: photo.type });
        if (error) throw new Error(error.message);
      }
      // Initial uploads remain intact on ambiguous creation responses. Existing
      // photos are changed only through replacePhoto, never a stale profile save.
      await rpc('save_dog', { p_id: id, p_name: dog.name, p_photo: path, p_archived: dog.is_archived || false, p_breed: dog.breed?.trim() || null });
    },
    async replacePhoto(dog, photo) {
      const validation = photoError(photo); if (validation) throw new Error(validation);
      const body = new FormData(); body.set('dogId', dog.id); body.set('expectedPath', dog.photo_path || ''); body.set('photo', photo);
      const { data, error } = await db.functions.invoke('replace-dog-photo', { body });
      if (error) {
        let message = 'Photo replacement could not be confirmed. Review the refreshed photo before trying again.';
        try { message = (await error.context?.json())?.error || message; } catch { /* retain reconciliation guidance */ }
        throw new Error(message);
      }
      if (!data?.saved) throw new Error('Photo replacement was not confirmed. Refresh and try again.');
    },
    async signOut() { clearCaches(); const { error } = await db.auth.signOut(); if (error) throw error; },
  };
}
