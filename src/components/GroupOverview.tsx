import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Connection, Dog, Group } from '../model';
import { Avatar } from './Avatar';
import { breedLabel } from '../dogLabels';
import { dogColourStyle } from '../dogColours';

export function GroupOverview({ group, groups, dogs, shortNames, date, connection, loading, busy, demo, error, close, choose }: {
  group: Group; groups: Group[]; dogs: Dog[]; shortNames: Map<string, string>; date: string;
  connection: Connection; loading: boolean; busy: boolean; demo: boolean; error: string;
  close: () => void; choose: (id: string) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [close]);
  const status = connection === 'offline' ? 'Offline · last loaded'
    : error ? 'Unable to refresh · last loaded' : busy ? 'Saving…' : loading ? 'Refreshing…'
    : connection === 'online' ? demo ? 'Demo · fictional data' : 'Live' : 'Connecting…';
  return <main className="group-overview" aria-label="Entire group overview">
    <header className="overview-header">
      <button ref={back} onClick={close}><ArrowLeft size={16}/>Back to operations</button>
      <label className="overview-group-picker">
        <select aria-label="Overview group" value={group.group_id} onChange={event => choose(event.target.value)}>
          {groups.map(item => <option key={item.group_id} value={item.group_id}>{item.displayed_name}</option>)}
        </select>
      </label>
      <div className="overview-summary"><h1>{group.displayed_name} <span>· {dogs.length} dogs</span></h1>
        <span>{date}{group.run ? ` · ${group.run}` : ''}</span></div>
      <span className={`overview-status ${connection}`} role="status">{status}</span>
    </header>
    {dogs.length ? <div className="overview-grid" style={{
      '--portrait-rows': Math.max(8, Math.ceil(dogs.length / 5)),
      '--wide-rows': Math.max(4, Math.ceil(dogs.length / 10)),
    } as CSSProperties}>
      {dogs.map(dog => <article className="overview-card" key={dog.id} data-dog-id={dog.id}
        style={dogColourStyle(dog.card_colour)} aria-label={`${dog.name}, ${dog.breed || 'Breed not recorded'}`}>
        <Avatar dog={dog}/>
        <strong title={dog.name}>{shortNames.get(dog.id) || dog.name}</strong>
        <span title={dog.breed || 'Breed not recorded'}>{breedLabel(dog.breed) || '—'}</span>
      </article>)}
    </div> : <p className="overview-empty">No dogs assigned to this group.</p>}
  </main>;
}
