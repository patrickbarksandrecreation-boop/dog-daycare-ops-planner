import type { Assignment } from './model';

// Keep the version/location captured at selection, including across board refreshes.
// A changed record must invalidate the entire move, never silently rebase it.
export type SelectedAssignment = Pick<Assignment, 'id' | 'version' | 'group_id'>;
export function toggleSelection(selected: SelectedAssignment[], assignment: SelectedAssignment): SelectedAssignment[] {
  return selected.some(a => a.id === assignment.id)
    ? selected.filter(a => a.id !== assignment.id)
    : [...selected, { id: assignment.id, version: assignment.version, group_id: assignment.group_id }];
}
