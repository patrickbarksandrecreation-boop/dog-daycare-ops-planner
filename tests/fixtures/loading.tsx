// Local-only browser harness: real repository and board, controlled service latency.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Planner } from '../../src/Planner';
import { cloudRepository } from '../../src/supabase';
import { demoRepository } from '../../src/demo';
import { todayBrisbane } from '../../src/model';
import '../../src/styles.css';

const demo = demoRepository('morning');
const state = await demo.snapshot(todayBrisbane());
state.day.workspace_id = 'workspace';
state.groups.forEach(g => { g.run_version = 1; });
state.dogs[0].photo_path = 'workspace/dog/photo.png';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const params = new URLSearchParams(location.search);
const control = {
  state, fail: params.has('fail'), failWrite: false, ambiguous: false, photoDelay: Number(params.get('photoDelay') || 800),
  reads: 0, writes: 0, signs: 0, watches: 0, stops: 0,
  events: [] as { name: string; ms: number }[],
  changed: () => {}, status: (_s: string) => {},
};
Object.assign(window, { control });
const start = performance.now();
const event = (name: string) => control.events.push({ name, ms: Math.round(performance.now() - start) });
let seenBoard = false, saving = false;
new MutationObserver(() => {
  if (!seenBoard && document.querySelector('[data-testid="lane-unassigned"]')) { seenBoard = true; event('board-visible'); }
  const nextSaving = document.querySelector('.connection')?.textContent === 'Saving…';
  if (saving && !nextSaving) event('save-finished');
  saving = nextSaving;
}).observe(document.getElementById('root')!, { subtree: true, childList: true, characterData: true });
const db = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'staff' } } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => {
    await pause(100); return { data: { id: 'staff', display_name: 'Test staff', role: 'staff', workspace_id: 'workspace' } };
  } }) }) }),
  rpc: async (name: string, args: any) => {
    event(name);
    if (name === 'ensure_planning_day') { await pause(100); return { data: null }; }
    if (name === 'planning_snapshot') {
      control.reads++; const copy = structuredClone(control.state);
      copy.day.local_date = args.p_date;
      if (args.p_date !== todayBrisbane()) copy.assignments = [];
      await pause(Number(params.get('readDelay') || 200));
      return control.fail ? { error: { message: 'Injected read failure' } } : { data: copy };
    }
    control.writes++; await pause(150);
    if (control.failWrite) return { error: { message: 'Another staff member changed this record' } };
    if (name === 'move_assignments') {
      const rows = args.p_assignments.map((s: any) => control.state.assignments.find(a => a.id === s.id));
      if (rows.some((a: any, i: number) => !a || a.version !== args.p_assignments[i].version || a.group_id !== args.p_assignments[i].group_id || a.attendance_status === 'departed')) {
        return { error: { message: 'A selected dog changed. No selected dogs moved. Review the refreshed board and select again.' } };
      }
      rows.forEach((a: any) => { a.group_id = args.p_group; a.version++; });
      control.state.day.revision++;
    }
    if (name === 'set_attendance') {
      const a = control.state.assignments.find(a => a.id === args.p_assignment)!;
      if (a.version !== args.p_version) return { error: { message: 'Another staff member changed this record' } };
      a.attendance_status = args.p_status; a.version++; control.state.day.revision++;
    }
    control.changed();
    return control.ambiguous ? { error: { message: 'Response lost' } } : { data: null };
  },
  storage: { from: () => ({ createSignedUrls: async (paths: string[]) => {
    control.signs++; event('sign'); await pause(control.photoDelay);
    return { data: paths.map(path => ({ path, signedUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' })) };
  } }) },
  channel: () => {
    const channel = { on: (_event: string, _filter: unknown, changed: () => void) => { control.changed = changed; return channel; },
      subscribe: (status: (s: string) => void) => { control.watches++; control.status = status; setTimeout(() => status('SUBSCRIBED'), 50); return channel; } };
    return channel;
  },
  removeChannel: () => { control.stops++; },
};
const repo = cloudRepository(db as any);
// Reproduce the former snapshot -> signing critical path for paired timing runs.
const displayedRepo = params.has('blockingPhotos') ? { ...repo, photos: undefined,
  snapshot: async (date: string) => repo.photos!(await repo.snapshot(date)) } : repo;
createRoot(document.getElementById('root')!).render(<Planner repo={displayedRepo} onExit={() => {}}/>);
