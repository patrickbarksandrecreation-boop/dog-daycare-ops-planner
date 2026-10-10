import type { Assignment, Dog, Snapshot } from './model';
import { lane, todayBrisbane } from './model';
import type { Repository } from './repository';
export type DemoScenario = 'morning' | 'planned' | 'four';
export function demoRepository(scenario: DemoScenario = 'morning'): Repository {
  const names = ['Alfie', 'Archie', 'Bailey', 'Bella', 'Biscuit', 'Bonnie', 'Charlie', 'Cleo', 'Daisy', 'Finn', 'Frankie', 'Hazel', 'Luna', 'Milo', 'Nala', 'Ollie', 'Poppy', 'Rosie', 'Teddy', 'Winston'];
  const surnames = ['Acorn', 'Birch', 'Cedar', 'Dune', 'Elm'];
  const dogs: Dog[] = Array.from({ length: 110 }, (_, i) => ({
    id: `demo-${i}`, name: i < 20 ? names[i] : `${names[i % 20]} ${surnames[Math.floor(i / 20) - 1]}`,
    photo_path: null, is_archived: false,
  }));
  const groups = Array.from({ length: scenario === 'four' ? 4 : 3 }, (_, i) => ({
    group_id: `group-${i + 1}`, displayed_name: `Group ${i + 1}`, display_order: i + 1,
  }));
  const days = new Map<string, Snapshot>();
  const listeners = new Set<() => void>();
  function day(date: string): Snapshot {
    if (!days.has(date)) days.set(date, {
      day: { id: date, local_date: date, revision: 0 },
      groups: structuredClone(groups), assignments: [], dogs,
    });
    return days.get(date)!;
  }
  function newBooking(dog: string, index: number): Assignment {
    return { id: crypto.randomUUID(), dog_id: dog, group_id: null, sort_order: index, version: 1,
      attendance_status: 'expected', arrived_at: null, departed_at: null };
  }
  day(todayBrisbane()).assignments = dogs.slice(0, 100).map((dog, i) => {
    const a = newBooking(dog.id, i);
    const perGroup = scenario === 'four' ? 22 : 30;
    if (scenario !== 'morning' && i < perGroup * groups.length) {
      a.group_id = groups[Math.floor(i / perGroup)].group_id;
      if (i % 3 === 0 || i === 31) {
        a.attendance_status = 'present';
        a.arrived_at = `${todayBrisbane()}T07:30:00+10:00`;
      }
    }
    return a;
  });
  function changed(date?: string) {
    if (date) day(date).day.revision++;
    listeners.forEach(fn => fn());
  }
  function checked(date: string, id: string, version: number) {
    const a = day(date).assignments.find(a => a.id === id);
    if (!a || a.version !== version) throw new Error('This dog has changed. Review the refreshed board and try again.');
    return a;
  }
  return {
    demo: true,
    async profile() { return { id: 'demo', display_name: 'Demo manager', role: 'manager' }; },
    async snapshot(date) { return structuredClone(day(date)); },
    watch(_date, fn, status) {
      listeners.add(fn); status('online'); return () => { listeners.delete(fn); };
    },
    async add(date, dogId) {
      if (!dogs.some(d => d.id === dogId && !d.is_archived)) throw new Error('Dog is archived or unavailable.');
      if (day(date).assignments.some(a => a.dog_id === dogId)) return;
      day(date).assignments.push(newBooking(dogId, day(date).assignments.length)); changed(date);
    },
    async move(date, id, group, before, version) {
      const a = checked(date, id, version);
      if (a.attendance_status === 'departed') throw new Error('Undo departure before moving this dog.');
      if (group && !day(date).groups.some(g => g.group_id === group)) throw new Error('Invalid destination.');
      if (before === id) return;
      const order = lane(day(date).assignments.filter(a => a.id !== id), group);
      const index = order.findIndex(a => a.id === before);
      if (before && index < 0) throw new Error('The destination changed. Please try again.');
      a.group_id = group; a.version++;
      order.splice(index < 0 ? order.length : index, 0, a);
      order.forEach((a, i) => { a.sort_order = i; }); changed(date);
    },
    async attendance(date, id, status, version) {
      const a = checked(date, id, version);
      if (a.attendance_status === status) return;
      if (!(a.attendance_status === 'present' ? status === 'departed' : status === 'present')) throw new Error('Invalid attendance transition.');
      a.attendance_status = status; a.arrived_at ||= new Date().toISOString();
      a.departed_at = status === 'departed' ? new Date().toISOString() : null;
      a.version++; changed(date);
    },
    async remove(date, id, version) {
      if (checked(date, id, version).attendance_status !== 'expected') throw new Error('Attendance records cannot be removed.');
      day(date).assignments = day(date).assignments.filter(a => a.id !== id); changed(date);
    },
    async rename(date, group, name, useDefault) {
      day(date).groups.find(g => g.group_id === group)!.displayed_name = name.trim();
      if (useDefault) groups.find(g => g.group_id === group)!.displayed_name = name.trim();
      changed(date);
    },
    async clear(date, revision) {
      if (day(date).day.revision !== revision) throw new Error('The plan has changed. Review it before clearing.');
      day(date).assignments = day(date).assignments.filter(a => a.attendance_status !== 'expected'); changed(date);
    },
    async saveDog(input, photo) {
      const existing = dogs.find(d => d.id === input.id);
      const dog: Dog = { id: input.id || crypto.randomUUID(), name: input.name.trim(), photo_path: null,
        is_archived: input.is_archived || false,
        photo_url: photo ? URL.createObjectURL(photo) : existing?.photo_url };
      if (existing) Object.assign(existing, dog); else dogs.push(dog);
      changed();
    },
    async signOut() {},
  };
}
