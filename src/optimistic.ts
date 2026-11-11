import { lane, type Attendance, type Snapshot } from './model';
import type { SelectedAssignment } from './selection';

// Never predict versions. A newer authoritative row always wins; the server
// still checks each captured version and location before changing anything.
export function previewMove(state: Snapshot, selected: SelectedAssignment[], group: string | null, before: string | null = null): Snapshot {
  const ids = new Set(selected.map(a => a.id));
  const moving = selected.flatMap(s => {
    const a = state.assignments.find(a => a.id === s.id && a.version === s.version && a.group_id === s.group_id && a.attendance_status !== 'departed');
    return a ? [{ ...a, group_id: group }] : [];
  });
  // A stale batch must not preview a partial move.
  if (moving.length !== selected.length) return state;
  const order = lane(state.assignments.filter(a => !ids.has(a.id)), group);
  const index = before ? order.findIndex(a => a.id === before) : order.length;
  if (index < 0) return state;
  order.splice(index, 0, ...moving);
  const ranked = new Map(order.map((a, i) => [a.id, { ...a, sort_order: i }]));
  return { ...state, assignments: state.assignments.map(a => ranked.get(a.id) || a) };
}

export function previewAttendance(state: Snapshot, id: string, version: number, status: Attendance): Snapshot {
  return { ...state, assignments: state.assignments.map(a => a.id === id && a.version === version ? { ...a, attendance_status: status } : a) };
}
