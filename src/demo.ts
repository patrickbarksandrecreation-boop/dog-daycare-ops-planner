import type { Assignment, Dog, Snapshot } from './model';
import { lane, todayBrisbane, runs, photoError } from './model';
import type { Repository } from './repository';
import { demoNotes, demoRules } from './behaviour';
import type { InteractionRule } from './behaviour';
import { validColour } from './dogColours';
export type DemoScenario = 'morning' | 'planned' | 'four';
export function demoRepository(scenario: DemoScenario = 'morning'): Repository {
  const names = ['Alfie', 'Archie', 'Bailey', 'Bella', 'Biscuit', 'Bonnie', 'Charlie', 'Cleo', 'Daisy', 'Finn', 'Frankie', 'Hazel', 'Luna', 'Milo', 'Nala', 'Ollie', 'Poppy', 'Rosie', 'Teddy', 'Winston'];
  const surnames = ['Acorn', 'Birch', 'Cedar', 'Dune', 'Elm'];
  const dogs: Dog[] = Array.from({ length: 110 }, (_, i) => ({
    id: `demo-${i}`, name: i < 20 ? names[i] : `${names[i % 20]} ${surnames[Math.floor(i / 20) - 1]}`,
    photo_path: null, is_archived: false,
    handling_notes: demoNotes[`demo-${i}`] || '', notes_version: 1,
    breed: i % 5 === 0 ? null : ['Border Collie', 'Golden Retriever', 'Mixed breed', 'German Shepherd Dog'][i % 4],
  }));
  const groups = Array.from({ length: scenario === 'four' ? 4 : 3 }, (_, i) => ({
    group_id: `group-${i + 1}`, displayed_name: `Group ${i + 1}`, display_order: i + 1,
  }));
  const days = new Map<string, Snapshot>();
  const rules: InteractionRule[] = structuredClone(demoRules);
  const audit: unknown[] = [];
  // Only fictional notes/rules/colours are persisted; live private records remain memory-only.
  const storageKey = `dayboard-fictional-behaviour-v1-${scenario}`;
  function loadBehaviour() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const dog of saved.extraDogs || []) if (!dogs.some(d => d.id === dog.id)) dogs.push(dog);
    for (const dog of dogs) Object.assign(dog, saved.notes?.[dog.id] || {});
    for (const dog of dogs) Object.assign(dog, saved.colours?.[dog.id] || {});
    rules.splice(0, rules.length, ...saved.rules);
    audit.splice(0, audit.length, ...saved.audit);
  }
  function persistBehaviour(event: unknown) {
    const nextAudit = [...audit, event];
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify({
      notes: Object.fromEntries(dogs.map(d => [d.id, { handling_notes: d.handling_notes, notes_version: d.notes_version, notes_updated_at: d.notes_updated_at, notes_updated_by: d.notes_updated_by }])),
      colours: Object.fromEntries(dogs.map(d => [d.id, { card_colour: d.card_colour || '#ffffff', colour_version: d.colour_version || 1 }])),
      rules, audit: nextAudit,
      extraDogs: dogs.filter(d => !d.id.startsWith('demo-')).map(d => ({ ...d, photo_url: undefined })),
    }));
    audit.push(event); changed();
  }
  // Web Locks serialise competing same-origin demo tabs before checking versions.
  async function editBehaviour(action: () => void) {
    const edit = () => {
      loadBehaviour();
      const beforeDogs = structuredClone(dogs), beforeRules = structuredClone(rules), beforeAudit = structuredClone(audit);
      try { action(); } catch (error) {
        dogs.splice(0, dogs.length, ...beforeDogs); rules.splice(0, rules.length, ...beforeRules); audit.splice(0, audit.length, ...beforeAudit);
        throw error;
      }
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline · viewing only. Reconnect to edit.');
    if (typeof window !== 'undefined' && !navigator.locks) throw new Error('This browser cannot safely coordinate demo edits. Use a browser with Web Locks support.');
    if (typeof window !== 'undefined' && navigator.locks) await navigator.locks.request(storageKey, edit);
    else edit();
  }
  loadBehaviour();
  const listeners = new Set<() => void>();
  function day(date: string): Snapshot {
    if (!days.has(date)) days.set(date, {
      day: { id: date, local_date: date, revision: 0 },
      groups: structuredClone(groups), assignments: [], dogs, rules,
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
    async snapshot(date) { loadBehaviour(); return structuredClone(day(date)); },
    watch(_date, fn, status) {
      listeners.add(fn); status('online');
      const storage = (e: StorageEvent) => { if (e.key === storageKey) fn(); };
      if (typeof window !== 'undefined') window.addEventListener('storage', storage);
      return () => { listeners.delete(fn); if (typeof window !== 'undefined') window.removeEventListener('storage', storage); };
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
    async moveMany(date, selections, group) {
      if (!selections.length || new Set(selections.map(a => a.id)).size !== selections.length) throw new Error('Select distinct dogs before moving.');
      if (group !== null && !day(date).groups.some(g => g.group_id === group)) throw new Error('Invalid destination. No selected dogs moved.');
      const selected = selections.map(s => {
        const a = checked(date, s.id, s.version);
        if (a.group_id !== s.group_id || a.attendance_status === 'departed') throw new Error('A selected dog changed. No selected dogs moved. Review the refreshed board and select again.');
        return a;
      });
      const order = lane(day(date).assignments.filter(a => !selected.includes(a)), group);
      // All checks precede all writes, as in the server transaction.
      selected.forEach(a => { a.group_id = group; a.version++; });
      [...order, ...selected].forEach((a, i) => { a.sort_order = i; });
      changed(date);
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
    async markers(id, groomed, noWaterpark, version) {
      const dog = dogs.find(d => d.id === id);
      if (!dog || (dog.marker_version || 1) !== version) throw new Error('Dog markers changed. Refresh and try again.');
      Object.assign(dog, { groomed, no_waterpark: noWaterpark, marker_version: version + 1 }); changed();
    },
    async saveNotes(id, notes, version) {
      await editBehaviour(() => {
        const dog = dogs.find(d => d.id === id);
        if (!dog || dog.notes_version !== version) throw new Error('Handling notes changed. Cancel and reopen Edit notes to review the latest version. Your draft has not been saved.');
        if (notes.length > 5000) throw new Error('Handling notes must be at most 5000 characters.');
        const before = dog.handling_notes;
        Object.assign(dog, { handling_notes: notes.trim(), notes_version: version + 1, notes_updated_at: new Date().toISOString(), notes_updated_by: 'Demo manager' });
        persistBehaviour({ kind: 'notes', dog: id, before, after: dog.handling_notes, actor: 'Demo manager', at: dog.notes_updated_at });
      });
    },
    async saveColour(id, colour, version) {
      await editBehaviour(() => {
        const dog = dogs.find(d => d.id === id);
        if (!validColour(colour)) throw new Error('Choose a valid card colour.');
        if (!dog || (dog.colour_version || 1) !== version) throw new Error('Card colour changed or unavailable. Cancel and review the latest colour before trying again.');
        const before = dog.card_colour || '#ffffff';
        Object.assign(dog, { card_colour: colour.toLowerCase(), colour_version: version + 1 });
        persistBehaviour({ kind: 'colour', dog: id, before, after: dog.card_colour, actor: 'Demo manager', at: new Date().toISOString() });
      });
    },
    async saveRule(input) {
      await editBehaviour(() => {
        if (input.dogs[0] === input.dogs[1] || input.dogs.some(id => !dogs.some(d => d.id === id))) throw new Error('Choose two different available dogs.');
        if (!['hard', 'soft'].includes(input.level) || !input.note.trim() || input.note.length > 2000) throw new Error('Choose Hard or Soft and enter a note (1–2000 characters).');
        const existing = rules.find(r => r.id === input.id);
        if (input.id && (!existing || existing.version !== input.version)) throw new Error('Interaction rule changed or was removed. Cancel and reopen to review it. Your draft has not been saved.');
        if (rules.some(r => r.id !== input.id && input.dogs.every(id => r.dogs.includes(id)))) throw new Error('A rule already exists for this pair. Cancel and edit the existing rule.');
        if (existing && !input.dogs.every(id => existing.dogs.includes(id))) throw new Error('The dogs on an existing rule cannot change.');
        const before = existing ? structuredClone(existing) : null;
        const saved: InteractionRule = { ...input, id: existing?.id || crypto.randomUUID(), version: (existing?.version || 0) + 1, active: true, note: input.note.trim(), updated_by: 'Demo manager', updated_at: new Date().toISOString() };
        if (existing) Object.assign(existing, saved); else rules.push(saved);
        persistBehaviour({ kind: 'rule', before, after: saved, actor: 'Demo manager', at: saved.updated_at });
      });
    },
    async removeRule(id, version) {
      await editBehaviour(() => {
        const index = rules.findIndex(r => r.id === id && r.version === version);
        if (index < 0) throw new Error('Interaction rule changed or was removed. Cancel and review the latest rule before removing it.');
        const [before] = rules.splice(index, 1);
        persistBehaviour({ kind: 'removed', before, after: null, actor: 'Demo manager', at: new Date().toISOString() });
      });
    },
    async assignRun(date, id, run, version) {
      const group = day(date).groups.find(g => g.group_id === id);
      if (!group || (group.run_version || 1) !== version) throw new Error('Group run changed. Refresh and try again.');
      if (run !== null && !runs.includes(run)) throw new Error('Invalid run.');
      Object.assign(group, { run, run_version: version + 1 }); changed(date);
    },
    async saveDog(input, photo) {
      const existing = dogs.find(d => d.id === input.id);
      const dog: Dog = { id: input.id || crypto.randomUUID(), name: input.name.trim(), photo_path: null,
        handling_notes: existing?.handling_notes || '', notes_version: existing?.notes_version || 1,
        breed: input.breed?.trim() || null,
        is_archived: input.is_archived || false,
        photo_url: photo ? URL.createObjectURL(photo) : existing?.photo_url };
      if (existing) Object.assign(existing, dog); else dogs.push(dog);
      changed();
    },
    async replacePhoto(input, photo) {
      const error = photoError(photo); if (error) throw new Error(error);
      const dog = dogs.find(d => d.id === input.id);
      if (!dog || dog.photo_url !== input.photo_url) throw new Error('Photo changed. Refresh and try again.');
      if (dog.photo_url?.startsWith('blob:')) URL.revokeObjectURL(dog.photo_url);
      dog.photo_url = URL.createObjectURL(photo); changed();
    },
    async signOut() {},
  };
}
