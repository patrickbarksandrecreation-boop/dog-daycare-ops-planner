import PwaNotice from './PwaNotice'
import { useEffect, useRef, useState } from 'react'
import { addDog, countGroups, dogs, groupIds, moveDog, rosterFor, searchDogs } from './board'
import type { Board, Dog, GroupId, Placement } from './board'

type View = 'catalog' | 'board' | 'roster'
export default function App() {
  const [board, setBoard] = useState<Board>({})
  const [headings, setHeadings] = useState<Record<GroupId, string>>({ 'group-1': 'Group 1', 'group-2': 'Group 2', 'group-3': 'Group 3' })
  const [selected, setSelected] = useState<Placement | 'all'>('group-1')
  const [view, setView] = useState<View>('board')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [rosterQuery, setRosterQuery] = useState('')
  const [actionDog, setActionDog] = useState<Dog | null>(null)
  const [message, setMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const counts = countGroups(board)
  const total = rosterFor(board).length
  const label = (placement: Placement) => placement === 'unassigned' ? 'Unassigned' : headings[placement].trim() || `Group ${groupIds.indexOf(placement) + 1}`
  const roster = rosterFor(board, selected === 'all' ? undefined : selected)
  const filteredRoster = searchDogs(roster, rosterQuery)
  const catalog = searchDogs(dogs, catalogQuery)

  useEffect(() => {
    if (actionDog) dialog.current?.showModal()
  }, [actionDog])

  function openActions(dog: Dog, button: HTMLButtonElement) {
    trigger.current = button
    setActionDog(dog)
  }

  function closeActions() {
    dialog.current?.close()
    setActionDog(null)
    trigger.current?.focus()
  }

  function placeDog(placement: Placement) {
    if (!actionDog) return
    const isAdded = board[actionDog.id] !== undefined
    setBoard(current => isAdded ? moveDog(current, actionDog.id, placement) : addDog(current, actionDog.id, placement))
    setMessage(`${actionDog.name} ${isAdded ? 'moved to' : 'added to'} ${label(placement)}.`)
    closeActions()
  }

  function selectRoster(placement: Placement | 'all') {
    setSelected(placement)
    setRosterQuery('')
    setView('roster')
  }

  function dogList(list: readonly Dog[], source: string) {
    return <ul className="dog-list">{list.map(dog => <li key={dog.id}>
      <span className="avatar" aria-hidden="true">{dog.name.split(' ').map(part => part[0]).join('')}</span>
      <div className="dog-info"><strong>{dog.name}</strong><small>{dog.id} · {board[dog.id] === undefined ? 'Not selected' : label(board[dog.id]!)}</small></div>
      <button className="dog-action" aria-label={`${board[dog.id] === undefined ? 'Add' : 'Move'} ${dog.name} from ${source}`} onClick={event => openActions(dog, event.currentTarget)}>{board[dog.id] === undefined ? '+ Add' : 'Move'}</button>
    </li>)}</ul>
  }

  return <>
    <div className="demo-banner"><strong>DEMO / NOT LIVE</strong><span>Fictional dogs only · Local-only, no server or sync</span></div>
    <PwaNotice />
    <header className="page-header">
      <div><p className="eyebrow">DAYCARE PLANNER</p><h1>A little order.<br className="phone-break" /> A lot of paws.</h1><p className="subtitle">Today’s demo board <span aria-hidden="true">/</span> 3 groups, one place per dog</p></div>
      <button className="today-total" onClick={() => selectRoster('all')}><strong>{total}<span> / 100</span></strong><span>Today’s selected dogs →</span></button>
    </header>
    <div className="session-note">This session only. Reloading resets your selections and headings. Once loaded, the board needs no network connection.</div>
    <nav className="mobile-nav" aria-label="Board views">{(['catalog', 'board', 'roster'] as View[]).map(item => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item === 'catalog' ? 'Catalog' : item === 'board' ? 'Groups' : 'Roster'}</button>)}</nav>
    <main className="workspace">
      <section className={`panel catalog-panel ${view === 'catalog' ? 'mobile-active' : ''}`} aria-labelledby="catalog-title">
        <div className="panel-title"><div><p className="eyebrow">01 / FIND A FRIEND</p><h2 id="catalog-title">Dog catalog</h2></div><span className="badge">100</span></div>
        <label className="search-label" htmlFor="catalog-search">Search all fictional dogs</label>
        <input id="catalog-search" type="search" placeholder="Name or dog ID…" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} />
        <p className="list-caption">{catalog.length} of 100 dogs · Tap Add to choose a group</p>
        {catalog.length ? dogList(catalog, 'catalog') : <p className="empty">No dogs match your search.</p>}
      </section>
      <section className={`board-panel ${view === 'board' ? 'mobile-active' : ''}`} aria-labelledby="board-title">
        <div className="panel-title"><div><p className="eyebrow">02 / MAKE SOME SPACE</p><h2 id="board-title">Today’s groups</h2></div><span className="badge">{total} selected</span></div>
        <p className="board-help">Edit a heading. Select a group to see its dogs.</p>
        {groupIds.map((id, index) => <article className={`group-card group-${index + 1} ${selected === id ? 'selected' : ''}`} key={id}>
          <div className="group-top"><span className="group-number">0{index + 1}</span><label htmlFor={`${id}-heading`}>Group {index + 1} heading<input id={`${id}-heading`} value={headings[id]} maxLength={36} onChange={event => setHeadings(current => ({ ...current, [id]: event.target.value }))} onBlur={() => setHeadings(current => ({ ...current, [id]: current[id].trim() || `Group ${index + 1}` }))} /></label></div>
          <button className="group-select" aria-label={`View ${label(id)}, ${counts[id]} dogs`} aria-pressed={selected === id} onClick={() => selectRoster(id)}><span><strong>{counts[id]}</strong> dogs</span><span>View roster <span aria-hidden="true">→</span></span></button>
        </article>)}
        <button className="unassigned" onClick={() => selectRoster('unassigned')} aria-pressed={selected === 'unassigned'}><span>Unassigned <strong>{counts.unassigned}</strong></span><span>View →</span></button>
        <button className="browse-mobile" onClick={() => setView('catalog')}>+ Choose dogs from catalog</button>
      </section>
      <section className={`panel roster-panel ${view === 'roster' ? 'mobile-active' : ''}`} aria-labelledby="roster-title">
        <div className="panel-title"><div><p className="eyebrow">03 / WHO’S HERE</p><h2 id="roster-title">Selected roster</h2></div><span className="badge">{roster.length}</span></div>
        <label className="search-label" htmlFor="roster-filter">Show dogs in</label>
        <select id="roster-filter" value={selected} onChange={event => selectRoster(event.target.value as Placement | 'all')}><option value="all">All today’s selected dogs ({total})</option>{groupIds.map(id => <option key={id} value={id}>{label(id)} ({counts[id]})</option>)}<option value="unassigned">Unassigned ({counts.unassigned})</option></select>
        <label className="search-label" htmlFor="roster-search">Search selected roster</label>
        <input id="roster-search" type="search" placeholder="Name or dog ID…" value={rosterQuery} onChange={event => setRosterQuery(event.target.value)} />
        <p className="list-caption">{filteredRoster.length} shown / {roster.length} in {selected === 'all' ? 'today’s selection' : label(selected)}</p>
        {filteredRoster.length ? dogList(filteredRoster, 'roster') : <div className="empty"><span aria-hidden="true">☀</span><h3>{roster.length ? 'No matching dogs' : 'Room for a friend'}</h3><p>{roster.length ? 'Try another name or dog ID.' : 'Add dogs from the catalog, then use Move to change their group.'}</p><button className="browse-mobile" onClick={() => setView('catalog')}>Browse catalog</button></div>}
      </section>
    </main>
    <p className="feedback" role="status">{message || 'Ready when you are. Start by adding a fictional dog.'}</p>
    <footer>Fictional demo · No bookings, live attendance or shared updates</footer>
    <dialog ref={dialog} aria-labelledby="action-title" onCancel={event => { event.preventDefault(); closeActions() }}>
      {actionDog && <><p className="eyebrow">{board[actionDog.id] === undefined ? 'ADD TO TODAY' : 'CHANGE GROUP'}</p><h2 id="action-title">{actionDog.name}</h2><p className="dialog-description">{board[actionDog.id] === undefined ? 'Choose their first place on the demo board.' : `Currently in ${label(board[actionDog.id]!)}. Choose a new place.`}</p>
        <div className="placement-actions">{([...groupIds, 'unassigned'] as Placement[]).map(id => <button key={id} disabled={board[actionDog.id] === id} onClick={() => placeDog(id)}><span>{label(id)}</span><span>{board[actionDog.id] === id ? 'Current' : '→'}</span></button>)}</div>
        <button className="cancel" onClick={closeActions}>Cancel</button></>}
    </dialog>
  </>
}
