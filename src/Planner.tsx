import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  pointerWithin, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowLeft, ArrowRight, CalendarDays, Database, History, LogOut, PawPrint, Pencil, Plus, Search, X } from 'lucide-react';
import { counts, groupCounts, isActive, lane, todayBrisbane, runs } from './model';
import type { Run } from './model';
import { Sparkles, DropletOff } from 'lucide-react';
import { runWarnings } from './runs';
import type { Assignment, Attendance, Dog, Group, Snapshot } from './model';
import type { Repository } from './repository';
import { demoNotes, demoRules, groupConflicts } from './behaviour';
import { usePlanner } from './usePlanner';
import { Modal, SaveError } from './components/Modal';
import { Avatar } from './components/Avatar';
import { DogCard } from './components/DogCard';
import { DogEditor } from './components/DogEditor';
import { PhotoEditor } from './components/PhotoEditor';
import { matchesDog, shortDogNames } from './dogLabels';
import { GroupLane } from './components/GroupLane';
import { PanelResize, usePanelSizes } from './components/PanelResize';

function DestinationTab({ id, name, active, moving, choose, summary }: {
  id: string; name: string; active: boolean; moving: boolean; choose: () => void; summary: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${id}`, data: { destination: id } });
  return <button ref={setNodeRef} className={`${active ? 'active' : ''} ${isOver ? 'drop-over' : ''}`}
    aria-label={moving ? `Send selected dog to ${name}` : `View ${name}`}
    aria-current={active && !moving ? 'page' : undefined} onClick={choose}>
    <span>{name}</span><small>{summary}</small>
  </button>;
}
function Unassigned({ count, search, setSearch, selected, move, children, tools, resize, style }: {
  count: number; search: string; setSearch: (s: string) => void; selected: boolean;
  move: () => void; children: ReactNode; tools: ReactNode; resize: ReactNode; style: CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });
  return <section ref={setNodeRef} className={`unassigned ${selected ? 'valid-target' : ''} ${isOver ? 'drop-over' : ''}`}
    data-testid="lane-unassigned" data-panel-id="unassigned" style={style} onClick={event => {
      if (selected && !(event.target as HTMLElement).closest('button,input,article')) move();
    }}>
    <div className="unassigned-toolbar">
      <button className="unassigned-heading" disabled={!selected} onClick={move} aria-label="Move selected dog to Unassigned">
        <h2>Unassigned</h2><span className="count">{count}</span>
      </button>
      <label className="search"><Search size={16}/><input aria-label="Search unassigned dogs" placeholder="Search unassigned…" value={search} onChange={e => setSearch(e.target.value)}/>
        {search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Clear unassigned search"><X size={14}/></button>}
      </label>
      <div className="directory-tools">{tools}</div>
    </div>
    <div className="unassigned-cards">{children}</div>
    {resize}
  </section>;
}
function Rename({ group, submit, close, editable }: {
  group: Group; submit: (name: string, future: boolean) => Promise<boolean>; close: () => void; editable: boolean;
}) {
  const [name, setName] = useState(group.displayed_name);
  const [future, setFuture] = useState(false);
  return <form className="inline-rename" onSubmit={async event => {
    event.preventDefault(); if (name.trim() && await submit(name.trim(), future)) close();
  }}>
    <label>Group name<input autoFocus required maxLength={40} value={name} onChange={e => setName(e.target.value)}/></label>
    <label className="check-label"><input type="checkbox" checked={future} onChange={e => setFuture(e.target.checked)}/>Also use for newly opened days</label>
    <div><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!editable || !name.trim()}>Save name</button></div>
  </form>;
}
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  // Prefer the specific card under the pointer to its enclosing lane.
  const cards = hits.filter(hit => args.droppableContainers.find(c => c.id === hit.id)?.data.current?.sortable);
  return cards.length ? cards : hits.length ? hits : closestCenter(args);
};

export function Planner({ repo, onExit }: { repo: Repository; onExit: () => void }) {
  const [date, setDate] = useState(todayBrisbane());
  const panels = usePanelSizes();
  const { snapshot: state, profile, connection, busy, error, setError, run, refresh, editable } = usePlanner(repo, date);
  const [view, setView] = useState('group-1');
  const [search, setSearch] = useState('');
  const [databaseSearch, setDatabaseSearch] = useState('');
  const [database, setDatabase] = useState(false);
  const [history, setHistory] = useState(false);
  const [editor, setEditor] = useState<Partial<Dog> | null>(null);
  const [photoDog, setPhotoDog] = useState<Dog | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [alertGroup, setAlertGroup] = useState<string | null>(null);
  const [selection, setSelection] = useState<Assignment | null>(null);
  const [drag, setDrag] = useState<Assignment | null>(null);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const [clearing, setClearing] = useState<Snapshot['day'] | null>(null);
  const totals = counts(state?.assignments || []);
  const manager = profile?.role === 'manager';
  const rules = repo.demo ? demoRules : [];
  const dogsById = new Map(state?.dogs.map(d => [d.id, d]));
  const photoTarget = photoDog ? dogsById.get(photoDog.id) : undefined;
  const shortNames = shortDogNames(state?.dogs || []);
  const infoDog = infoId ? dogsById.get(infoId) : undefined;
  const infoAssignment = state?.assignments.find(a => a.dog_id === infoId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    if (selection && !state?.assignments.some(a => a.id === selection.id && a.version === selection.version && isActive(a))) setSelection(null);
    if (!editable) setSelection(null);
  }, [state, editable, selection]);
  useEffect(() => {
    if (state && view !== 'unassigned' && !state.groups.some(g => g.group_id === view)) setView(state.groups[0]?.group_id || 'unassigned');
  }, [state, view]);
  function changeDate(next: string) {
    if (!next || busy) return;
    setDate(next); setSelection(null); setDrag(null); setRename(null); setInfoId(null);
    setHistory(false); setDatabase(false); setClearing(null); setRemoving(null); setSearch(''); setAlertGroup(null);
  }
  function offsetDate(amount: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + amount); changeDate(next.toISOString().slice(0, 10));
  }
  async function move(a: Assignment, group: string | null, before: string | null = null) {
    if (!state || !editable) return;
    if (await run(() => repo.move(state.day.id, a.id, group, before, a.version))) {
      setSelection(null); setView(group || 'unassigned');
    }
  }
  async function attendance(a: Assignment, status: Attendance) {
    if (!state) return false;
    return run(() => repo.attendance(state.day.id, a.id, status, a.version));
  }
  function showInfo(id: string) { setSelection(null); setInfoId(id); }
  function onDrop(event: DragEndEvent) {
    const source = drag; setDrag(null);
    if (!source || !state || !editable || !event.over || event.active.id === event.over.id) return;
    const over = state.assignments.find(a => a.id === event.over!.id);
    const destination = event.over.data.current?.destination || String(event.over.id);
    const group = over ? over.group_id : destination === 'unassigned' ? null : destination;
    let before = over?.id || null;
    if (over && source.group_id === group) {
      const items = lane(state.assignments, group);
      if (items.findIndex(a => a.id === source.id) < items.findIndex(a => a.id === over.id)) {
        before = items[items.findIndex(a => a.id === over.id) + 1]?.id || null;
      }
    }
    void move(source, group, before);
  }
  function cards(group: string | null) {
    const all = lane(state!.assignments, group);
    const filtered = group === null ? all.filter(a => dogsById.get(a.dog_id)!.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : all;
    return <SortableContext items={filtered.map(a => a.id)} strategy={rectSortingStrategy}>
      {filtered.map(a => <DogCard key={a.id} assignment={a} dog={dogsById.get(a.dog_id)!}
        shortName={shortNames.get(a.dog_id)!}
        selected={selection?.id === a.id} disabled={!editable}
        indicator={(state!.groups.some(g => runWarnings([a], state!.dogs, g).length) ? 'Water park warning — open dog information' : rules.some(r => r.active && r.dogs.includes(a.dog_id)) ? 'Interaction rule — open dog information' : undefined)}
        select={() => setSelection(selection?.id === a.id ? null : a)}
        info={() => showInfo(a.dog_id)} arrive={() => void attendance(a, 'present')}/>)}
      {group === null && !filtered.length && <p className="strip-empty">{search ? 'No matching unassigned dogs.' : 'All booked dogs are assigned. Book another dog using Dog database.'}</p>}
    </SortableContext>;
  }
  const selectedName = selection ? dogsById.get(selection.dog_id)?.name : undefined;
  const shortDate = new Date(`${date}T12:00:00+10:00`).toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short' });
  return <SaveError.Provider value={error}><div className="planner-shell">
    <header className="app-header">
      <div className="brand"><span className="brand-mark"><PawPrint size={21}/></span>dayboard<span className="brand-dot">.</span></div>
      <span className="workspace-label">Daily planning & arrivals</span>
      <div className="date-control">
        <button className="icon-button" aria-label="Previous day" disabled={busy} onClick={() => offsetDate(-1)}><ArrowLeft size={15}/></button>
        <label><CalendarDays size={16}/><input aria-label="Planning date" type="date" value={date} disabled={busy} onChange={e => changeDate(e.target.value)}/></label>
        <button className="icon-button" aria-label="Next day" disabled={busy} onClick={() => offsetDate(1)}><ArrowRight size={15}/></button>
        <button className="today" disabled={busy} onClick={() => changeDate(todayBrisbane())}>Today</button>
      </div>
      <span className={`connection ${connection}`} role="status"><i/>{busy ? 'Saving…' : connection === 'online' ? repo.demo ? 'Demo · session only' : 'Live · saved' : connection === 'offline' ? 'Offline · view only' : 'Connecting…'}</span>
      <button className="icon-button" aria-label={repo.demo ? 'Exit demo' : 'Sign out'} onClick={async () => {
        try { await repo.signOut(); onExit(); } catch (e) { setError(e instanceof Error ? e.message : 'Sign out failed.'); }
      }}><LogOut size={17}/></button>
    </header>
    <div className="day-summary">
      <div><strong>{shortDate}</strong><span className="timezone">Brisbane</span></div>
      <div className="day-counts">
        <span><b data-testid="booked-count">{totals.total}</b> booked</span>
        <span><i className="status-dot expected"/><b data-testid="expected-count">{totals.expected}</b> Expected</span>
        <span><i className="status-dot present"/><b data-testid="present-count">{totals.present}</b> Present</span>
        <span><i className="status-dot departed"/><b data-testid="departed-count">{totals.departed}</b> Departed</span>
      </div>
      <button className="text-button" onClick={() => setHistory(true)} disabled={!state}><History size={15}/>Day records</button>
    </div>
    {error && <div className="notice error" role="alert"><span>{error}</span><button onClick={() => { setError(''); refresh(); }}>Retry</button><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
    {connection === 'offline' && <div className="notice offline">Editing paused. Last loaded board shown; reconnect to save changes.</div>}
    {!state ? <main className="loading-board"><PawPrint size={35}/><h2>Opening the daily board…</h2><button onClick={refresh}>Retry connection</button></main> :
      <DndContext sensors={sensors} collisionDetection={collision}
        onDragStart={event => { setSelection(null); setDrag(state.assignments.find(a => a.id === event.active.id) || null); }}
        onDragCancel={() => setDrag(null)} onDragEnd={onDrop}>
        <div className="lane-layout" ref={panels.layoutRef} style={panels.columns(['unassigned', ...state.groups.map(g => g.group_id)])}>
          <Unassigned style={panels.style('unassigned')} resize={<><PanelResize id="unassigned" name="Unassigned" resize={panels.resize}/><PanelResize id="unassigned" name="Unassigned" resize={panels.resize} widthOnly/></>} count={totals.unassigned} search={search} setSearch={setSearch} selected={!!selection && editable}
            move={() => { if (selection) void move(selection, null); }}
            tools={<><button onClick={() => setDatabase(true)}><Database size={16}/>Dog database</button>
              <button className="primary" disabled={!editable} onClick={() => setEditor({})}><Plus size={17}/>New Dog</button></>}>
            {cards(null)}
          </Unassigned>
          <div className={`selection-bar ${selection ? 'has-selection' : ''}`}>
            <span>{selection ? <><strong>{selectedName}</strong> selected · choose a destination</> : 'Select a dog, then a group · Drag by the grip · Hold a card for details'}</span>
            {selection && <button className="text-button" aria-label="Cancel selection" onClick={() => setSelection(null)}><X size={14}/>Cancel</button>}
            <small>{repo.demo ? 'Fictional bookings, attendance & rules' : 'Synthetic pilot · no real records'}</small>
          </div>
          <nav className={`group-tabs ${selection || drag ? 'moving' : ''}`} aria-label="Group views and destinations">
            <DestinationTab id="unassigned" name="Unassigned" active={view === 'unassigned'} moving={!!selection || !!drag}
              summary={String(totals.unassigned)} choose={() => selection ? void move(selection, null) : setView('unassigned')}/>
            {state.groups.map(g => {
              const c = groupCounts(state.assignments, g.group_id);
              return <DestinationTab key={g.group_id} id={g.group_id} name={g.displayed_name} active={view === g.group_id}
                moving={!!selection || !!drag} summary={`${c.present} / ${c.planned}`}
                choose={() => selection ? void move(selection, g.group_id) : setView(g.group_id)}/>;
            })}
          </nav>
          <main className={`group-board ${view === 'unassigned' ? 'view-unassigned' : ''}`}
            style={{ '--group-count': state.groups.length } as CSSProperties}>
            {state.groups.map(g => {
              const c = groupCounts(state.assignments, g.group_id);
              return <div key={g.group_id} className={`group-wrapper ${view === g.group_id ? 'current-view' : ''}`} data-panel-id={g.group_id} style={panels.style(g.group_id)}>
                <GroupLane id={g.group_id} name={g.displayed_name} order={g.display_order} present={c.present} planned={c.planned}
                  selected={!!selection && editable} dragging={!!drag} destination={() => { if (selection) void move(selection, g.group_id); }}
                  rename={editable ? () => { setSelection(null); setRename(rename === g.group_id ? null : g.group_id); } : undefined}
                  warnings={[...groupConflicts(state.assignments, g.group_id, rules), ...runWarnings(state.assignments, state.dogs, g)]}
                  showWarnings={() => setAlertGroup(g.group_id)}
                  runSelector={<select className="run-select" aria-label={`Run for ${g.displayed_name}`} value={g.run || ''} disabled={!editable}
                    onChange={e => void run(() => repo.assignRun(state.day.id, g.group_id, (e.target.value || null) as Run | null, g.run_version || 1))}>
                    <option value="">Select run…</option>{runs.map(r => <option key={r}>{r}</option>)}
                  </select>}
                  editor={rename === g.group_id ? <Rename group={g} editable={editable} close={() => setRename(null)}
                    submit={(name, future) => run(() => repo.rename(state.day.id, g.group_id, name, future))}/> : undefined}>
                  {cards(g.group_id)}
                </GroupLane>
                <PanelResize id={g.group_id} name={g.displayed_name} resize={panels.resize}/>
                <PanelResize id={g.group_id} name={g.displayed_name} resize={panels.resize} widthOnly/>
              </div>;
            })}
            <p className="unassigned-view-note">Choose a dog in the strip above, then tap its destination. Swipe the strip to see more bookings.</p>
          </main>
        </div>
        <DragOverlay style={{ pointerEvents: 'none' }}>{drag && <div className="drag-preview"><Avatar dog={dogsById.get(drag.dog_id)!}/><strong>{dogsById.get(drag.dog_id)!.name}</strong><span>{drag.attendance_status}</span></div>}</DragOverlay>
      </DndContext>}
    <footer className="planner-footer"><span>{repo.demo ? 'Demo resets on refresh.' : 'Synthetic shared pilot.'} Assignment does not mark arrival.</span>
      {manager && <button className="text-button danger" disabled={!editable || totals.expected === 0} onClick={() => setClearing(state!.day)}>Clear expected bookings</button>}
    </footer>
    {database && state && <Modal title="Dog database" wide close={() => setDatabase(false)}>
      <p className="muted">Master records. Booking adds one Expected dog to this date’s Unassigned strip.</p>
      <label className="search"><Search size={17}/><input autoFocus aria-label="Search dog database" placeholder="Search name or breed…" value={databaseSearch} onChange={e => setDatabaseSearch(e.target.value)}/></label>
      <div className="database-list">{state.dogs.filter(d => !d.is_archived && matchesDog(d, databaseSearch)).sort((a, b) => a.name.localeCompare(b.name)).map(dog => {
        const booking = state.assignments.find(a => a.dog_id === dog.id);
        return <div className="database-row" key={dog.id}><Avatar dog={dog}/><strong>{dog.name}{dog.breed && <small className="database-breed">{dog.breed}</small>}</strong>
          <button aria-label={`Change photo for ${dog.name}`} disabled={!editable} onClick={() => { setDatabase(false); setPhotoDog(dog); }}>Photo</button>
          <button className="icon-button" aria-label={`Markers for ${dog.name}`} title="Dog markers" onClick={() => { setDatabase(false); showInfo(dog.id); }}><Sparkles size={16}/></button>
          {manager && <button className="icon-button" aria-label={`Edit ${dog.name}`} disabled={!editable} onClick={() => { setDatabase(false); setEditor(dog); }}><Pencil size={15}/></button>}
          <button disabled={!editable || !!booking} aria-label={booking ? `${dog.name} already booked` : `Book ${dog.name} for day`}
            onClick={() => void run(() => repo.add(state.day.id, dog.id))}>{booking ? booking.attendance_status === 'departed' ? 'Departed · recorded' : 'Already booked' : 'Book for day'}</button>
        </div>;
      })}</div>
    </Modal>}
    {photoTarget && <PhotoEditor dog={photoTarget} editable={editable} close={() => setPhotoDog(null)} save={photo => run(() => repo.replacePhoto(photoTarget, photo))}/>}
    {editor && state && <DogEditor dog={editor} dogs={state.dogs} editable={editable} close={() => setEditor(null)}
      save={async (dog, photo) => {
        const saved = await run(() => repo.saveDog(dog, photo));
        if (saved && !dog.id) { setDatabaseSearch(dog.name); setDatabase(true); }
        return saved;
      }}/>}
    {infoDog && state && <Modal title={infoDog.name} close={() => setInfoId(null)}>
      <div className="info-summary"><Avatar dog={infoDog}/><div><strong>{infoAssignment?.attendance_status || 'Not booked'}</strong>
        <p>{infoAssignment?.group_id ? state.groups.find(g => g.group_id === infoAssignment.group_id)?.displayed_name : 'Unassigned'}{infoDog.is_archived ? ' · Archived record' : ''}</p></div></div>
      {repo.demo && <p className="fixture-label">Fictional information · demonstration only</p>}
      <p className="dog-breed-detail">Breed: {infoDog.breed || 'Not recorded'}</p>
      <button disabled={!editable} onClick={() => { setInfoId(null); setPhotoDog(infoDog); }}>Change photo</button>
      <div className="marker-actions" aria-label="Dog markers">
        <button aria-pressed={!!infoDog.groomed} disabled={!editable} onClick={() => void run(() => repo.markers(infoDog.id, !infoDog.groomed, !!infoDog.no_waterpark, infoDog.marker_version || 1))}><Sparkles size={18}/>Groomed/bathed</button>
        <button aria-pressed={!!infoDog.no_waterpark} disabled={!editable} onClick={() => void run(() => repo.markers(infoDog.id, !!infoDog.groomed, !infoDog.no_waterpark, infoDog.marker_version || 1))}><DropletOff size={18}/>No water park</button>
      </div>
      <p className="muted">Markers stay on this dog until cleared. No water park records the owner’s request.</p>
      {state.groups.flatMap(g => runWarnings(state.assignments.filter(a => a.dog_id === infoDog.id), state.dogs, g)).map(w => <p role="alert" className="rule-note" key={w.id}>{w.note}</p>)}
      <h3>Handling notes</h3><p>{repo.demo ? demoNotes[infoDog.id] || 'No fictional handling notes for this dog.' : 'No handling notes configured.'}</p>
      <h3>Interaction rules</h3>
      {rules.filter(r => r.active && r.dogs.includes(infoDog.id)).map(r => <p className="rule-note" key={r.id}>{r.note}</p>)}
      {!rules.some(r => r.active && r.dogs.includes(infoDog.id)) && <p>No configured interaction rules. This is not a compatibility assessment.</p>}
      {infoAssignment?.arrived_at && <p className="timestamp">Arrived: {new Date(infoAssignment.arrived_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}</p>}
      {infoAssignment?.departed_at && <p className="timestamp">Departed: {new Date(infoAssignment.departed_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}</p>}
      {infoAssignment && isActive(infoAssignment) && <label>Move to<select aria-label="Move dog to" value={infoAssignment.group_id || ''} disabled={!editable}
        onChange={event => void move(infoAssignment, event.target.value || null)}>
        <option value="">Unassigned</option>{state.groups.map(g => <option key={g.group_id} value={g.group_id}>{g.displayed_name}</option>)}
      </select></label>}
      <footer className="info-actions">
        {manager && <button disabled={!editable} onClick={() => { setInfoId(null); setEditor(infoDog); }}>Edit dog</button>}
        {infoAssignment?.attendance_status === 'expected' && <><button className="danger" disabled={!editable} onClick={() => { setInfoId(null); setRemoving(infoAssignment); }}>Remove booking</button><button className="primary" disabled={!editable} onClick={() => void attendance(infoAssignment, 'present')}>Mark present</button></>}
        {infoAssignment?.attendance_status === 'present' && <button className="primary" disabled={!editable} onClick={async () => { if (await attendance(infoAssignment, 'departed')) setInfoId(null); }}>Mark departed</button>}
        {infoAssignment?.attendance_status === 'departed' && <button disabled={!editable} onClick={async () => { if (await attendance(infoAssignment, 'present')) setInfoId(null); }}>Undo departure</button>}
      </footer>
    </Modal>}
    {alertGroup && state && <Modal title={`Warnings · ${state.groups.find(g => g.group_id === alertGroup)?.displayed_name}`} close={() => setAlertGroup(null)}>
      {[...groupConflicts(state.assignments, alertGroup, rules), ...state.groups.filter(g => g.group_id === alertGroup).flatMap(g => runWarnings(state.assignments, state.dogs, g))].map(w => <p className="rule-note" key={w.id}><strong>{w.severity === 'present' ? 'Present' : 'Planned'}:</strong> {w.note}</p>)}
      <p className="muted">Warnings are advisory. Review the marked dogs before using this run.</p>
    </Modal>}
    {history && state && <Modal title="Day records" wide close={() => setHistory(false)}>
      <p className="muted">{totals.total} booked · {totals.present} Present · {totals.expected} Expected · {totals.departed} Departed. Departed dogs keep their last group.</p>
      <div className="records-list">{[...state.assignments].sort((a, b) => dogsById.get(a.dog_id)!.name.localeCompare(dogsById.get(b.dog_id)!.name)).map(a =>
        <button className="record-row" key={a.id} onClick={() => { setHistory(false); showInfo(a.dog_id); }}>
          <Avatar dog={dogsById.get(a.dog_id)!}/><strong>{dogsById.get(a.dog_id)!.name}</strong>
          <span>{state.groups.find(g => g.group_id === a.group_id)?.displayed_name || 'Unassigned'}</span>
          <span className={`record-status ${a.attendance_status}`}>{a.attendance_status}</span>
        </button>)}
      </div>
    </Modal>}
    {removing && state && <Modal title="Remove expected booking?" close={() => setRemoving(null)}>
      <p>This removes {dogsById.get(removing.dog_id)?.name} from this date only. Received dogs cannot be removed.</p>
      <footer><button onClick={() => setRemoving(null)}>Keep booking</button><button className="danger" disabled={!editable} onClick={async () => {
        if (await run(() => repo.remove(state.day.id, removing.id, removing.version))) setRemoving(null);
      }}>Remove booking</button></footer>
    </Modal>}
    {clearing && <Modal title="Clear expected bookings?" close={() => setClearing(null)}>
      <p>Remove all Expected bookings from {shortDate}? Present and Departed records are retained. This cannot be undone.</p>
      <footer><button onClick={() => setClearing(null)}>Keep plan</button><button className="danger" disabled={!editable} onClick={async () => {
        if (await run(() => repo.clear(clearing.id, clearing.revision))) setClearing(null);
      }}>Clear expected bookings</button></footer>
    </Modal>}
  </div></SaveError.Provider>;
}
