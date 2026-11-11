import type { Assignment, Dog } from './model';
import { validColour } from './dogColours';

export type GroupSort = 'manual' | 'colour' | 'alphabetical';
export const groupSortStorageKey = 'dayboard-group-sort-v1';
export const isGroupSort = (value: unknown): value is GroupSort =>
  value === 'manual' || value === 'colour' || value === 'alphabetical';
const colours = ['#e3d7f5', '#fff1ae', '#d5edce', '#cfe5fa', '#ffffff'];
const names = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true });
function colourKey(dog?: Dog): [number, string] {
  const colour = dog?.card_colour && validColour(dog.card_colour) ? dog.card_colour.toLowerCase() : '#ffffff';
  const rank = colours.indexOf(colour);
  // Other preset/custom colours follow the requested five, grouped by colour.
  return rank === -1 ? [colours.length, colour] : [rank, ''];
}
export function sortGroupAssignments(items: Assignment[], dogs: Map<string, Dog>, sort: GroupSort): Assignment[] {
  if (sort === 'manual') return items;
  return [...items].sort((a, b) => {
    const left = dogs.get(a.dog_id), right = dogs.get(b.dog_id);
    if (sort === 'colour') {
      const [lr, lc] = colourKey(left), [rr, rc] = colourKey(right);
      const byColour = lr - rr || lc.localeCompare(rc);
      if (byColour) return byColour;
    }
    return names.compare(left?.name.trim() || '', right?.name.trim() || '') || a.dog_id.localeCompare(b.dog_id);
  });
}
