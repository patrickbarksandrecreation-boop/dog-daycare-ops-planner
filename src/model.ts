export type Dog = {
  id: string;
  name: string;
  photo_path: string | null;
  is_archived: boolean;
  photo_url?: string;
  groomed?: boolean;
  no_waterpark?: boolean;
  marker_version?: number;
};
export const runs = ['Water park', 'Playground', 'Farm', 'Small indoor', 'A-Frame'] as const;
export type Run = typeof runs[number];
export type Group = { group_id: string; displayed_name: string; display_order: number; run?: Run | null; run_version?: number };
export type Attendance = 'expected' | 'present' | 'departed';
export type Assignment = {
  id: string;
  dog_id: string;
  group_id: string | null;
  sort_order: number;
  version: number;
  attendance_status: Attendance;
  arrived_at: string | null;
  departed_at: string | null;
};
export type Snapshot = {
  day: { id: string; local_date: string; revision: number };
  groups: Group[];
  assignments: Assignment[];
  dogs: Dog[];
};
export type Profile = { id: string; display_name: string; role: 'manager' | 'staff' };
export type Connection = 'connecting' | 'online' | 'offline';
export const todayBrisbane = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
export const isActive = (a: Assignment) => a.attendance_status !== 'departed';
export const lane = (items: Assignment[], group: string | null) => items
  .filter(a => isActive(a) && a.group_id === group)
  .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
export const counts = (items: Assignment[]) => ({
  assigned: items.filter(a => isActive(a) && a.group_id !== null).length,
  unassigned: items.filter(a => isActive(a) && a.group_id === null).length,
  total: items.length,
  expected: items.filter(a => a.attendance_status === 'expected').length,
  present: items.filter(a => a.attendance_status === 'present').length,
  departed: items.filter(a => a.attendance_status === 'departed').length,
});
export const groupCounts = (items: Assignment[], group: string | null) => {
  const active = lane(items, group);
  return { planned: active.length, present: active.filter(a => a.attendance_status === 'present').length };
};
export function photoError(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  return file.size > 5 * 1024 * 1024 ? 'Photos must be smaller than 5 MB.' : null;
}
export const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
