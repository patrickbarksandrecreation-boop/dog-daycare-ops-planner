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
  const clearCaches = () => { preparedDates.clear(); photoLinks.clear(); };
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
      if (!('workspace_id' in state.day)) {
        throw new Error('Apply 003_workspace_history.sql before using the shared pilot.');
      }
      if (state.groups.some(g => g.run_version === undefined)) throw new Error('Apply 004_runs_markers.sql before using runs and dog markers.');
      if (state.assignments.some(a => !a.attendance_status)) {
        throw new Error('The attendance migration is required. Apply 002_attendance.sql before using this board.');
      }
      const paths = [...new Set(state.dogs.map(d => d.photo_path).filter((p): p is string => !!p))];
      if (paths.length) {
        const now = Date.now();
        for (const [path, link] of photoLinks) if (link.expires <= now || !paths.includes(path)) photoLinks.delete(path);
        const missing = paths.filter(path => !photoLinks.has(path));
        if (missing.length) {
          const { data } = await db.storage.from('dog-photos').createSignedUrls(missing, 3600);
          for (const link of data || []) if (link.path && link.signedUrl && !link.error) {
            photoLinks.set(link.path, { url: link.signedUrl, expires: now + 55 * 60_000 });
          }
        }
        for (const dog of state.dogs) dog.photo_url = dog.photo_path ? photoLinks.get(dog.photo_path)?.url : undefined;
      }
      return state;
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
      // Retain previous objects: a failed/ambiguous network response must never delete an image a committed record references.
      await rpc('save_dog', { p_id: id, p_name: dog.name, p_photo: path, p_archived: dog.is_archived || false });
    },
    async signOut() { clearCaches(); const { error } = await db.auth.signOut(); if (error) throw error; },
  };
}
