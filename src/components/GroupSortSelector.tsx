import type { GroupSort } from '../groupSort';
import { isGroupSort } from '../groupSort';

export function GroupSortSelector({ value, change }: { value: GroupSort; change: (sort: GroupSort) => void }) {
  return <label className="group-sort-selector"><span>Sort groups</span>
    <select aria-label="Sort groups" value={value} title={value === 'colour' ? 'Purple → Yellow → Green → Blue → White; alphabetical within each colour' : 'Choose the order of dogs within groups'}
      onChange={event => { if (isGroupSort(event.target.value)) change(event.target.value); }}>
      <option value="manual">Manual order</option>
      <option value="colour">Colour</option>
      <option value="alphabetical">Alphabetical</option>
    </select>
  </label>;
}
