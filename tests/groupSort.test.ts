import { expect, it } from 'vitest';
import { sortGroupAssignments } from '../src/groupSort';
import type { Assignment, Dog } from '../src/model';

const dog = (id: string, name: string, card_colour?: string): Dog => ({ id, name, card_colour, photo_path: null, is_archived: false });
const row = (id: string): Assignment => ({ id: `assignment-${id}`, dog_id: id, group_id: 'group-1', sort_order: 0, version: 1, attendance_status: 'expected', arrived_at: null, departed_at: null });
const ids = (items: Assignment[]) => items.map(a => a.dog_id);
it('uses the requested colour priority, then alphabetical names, without mutating records', () => {
  const dogs = new Map([
    dog('white', 'Aaron'), dog('blue', 'Blue', '#cfe5fa'), dog('purple-z', 'Zoe', '#E3D7F5'),
    dog('yellow', 'Yellow', '#fff1ae'), dog('green', 'Green', '#d5edce'), dog('purple-a', 'abby', '#e3d7f5'),
  ].map(d => [d.id, d]));
  const items = [...dogs.keys()].map(row), original = structuredClone(items);
  expect(ids(sortGroupAssignments(items, dogs, 'colour'))).toEqual(['purple-a', 'purple-z', 'yellow', 'green', 'blue', 'white']);
  expect(items).toEqual(original);
  expect(ids(sortGroupAssignments(items, dogs, 'alphabetical'))).toEqual(['white', 'purple-a', 'blue', 'green', 'yellow', 'purple-z']);
  expect(sortGroupAssignments(items, dogs, 'manual')).toBe(items);
});
it('treats absent/invalid colours as white, groups custom colours after the requested colours, and breaks duplicate names by ID', () => {
  const dogs = new Map([
    dog('z', 'Same', '#ffffff'), dog('a', 'same', 'invalid'), dog('missing', 'ZZ'),
    dog('pink', 'AA', '#f8d7e5'), dog('black', 'BB', '#000000'),
  ].map(d => [d.id, d]));
  expect(ids(sortGroupAssignments([...dogs.keys()].map(row), dogs, 'colour'))).toEqual(['a', 'z', 'missing', 'black', 'pink']);
});
