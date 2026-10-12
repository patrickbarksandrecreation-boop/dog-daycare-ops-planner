import { useState } from 'react';
import type { Dog } from '../model';
import type { InteractionRule } from '../behaviour';
import { ruleLabel } from '../behaviour';
import type { Repository } from '../repository';
import { matchesDog } from '../dogLabels';
import { Avatar } from './Avatar';

export function BehaviourEditor({ dog, dogs, rules, editable, repo, run }: {
  dog: Dog; dogs: Dog[]; rules: InteractionRule[]; editable: boolean; repo: Repository;
  run: (action: () => Promise<void>) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState<{ text: string; version: number } | null>(null);
  const [draft, setDraft] = useState<{ id?: string; version?: number; other: string; level: 'hard' | 'soft'; note: string } | null>(null);
  const [removing, setRemoving] = useState<InteractionRule | null>(null);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');
  const ownRules = rules.filter(r => r.active && r.dogs.includes(dog.id));
  const otherName = (rule: InteractionRule) => dogs.find(d => d.id === rule.dogs.find(id => id !== dog.id))?.name || 'Unavailable dog';
  const editing = !!notes || !!draft || !!removing;
  return <section className="behaviour-editor" aria-label="Handling notes and interaction rules">
    <h3>Handling notes</h3>
    <p className="preserve-lines">{dog.handling_notes || 'No handling notes recorded.'}</p>
    {dog.notes_updated_at && <small>Updated {new Date(dog.notes_updated_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} · {dog.notes_updated_by}</small>}
    {!notes ? <button disabled={!editable || editing} onClick={() => { setFeedback(''); setNotes({ text: dog.handling_notes || '', version: dog.notes_version || 1 }); }}>Edit notes</button> :
      <form onSubmit={async e => {
        e.preventDefault();
        if (await run(() => repo.saveNotes(dog.id, notes.text, notes.version))) { setNotes(null); setFeedback('Handling notes saved.'); }
      }}>
        <label>Handling notes<textarea aria-label="Handling notes" autoFocus rows={5} maxLength={5000} value={notes.text} disabled={!editable} onChange={e => setNotes({ ...notes, text: e.target.value })}/></label>
        <small>{notes.text.length}/5000 characters. Clear the field to remove the notes.</small>
        {(dog.notes_version || 1) !== notes.version && <p role="alert">These notes changed while you were editing. Your draft is kept here. Copy it if needed, then Cancel and reopen Edit notes to review the latest version.</p>}
        <div className="behaviour-actions"><button type="button" onClick={() => setNotes(null)}>Cancel</button><button className="primary" disabled={!editable || (dog.notes_version || 1) !== notes.version}>Save notes</button></div>
      </form>}
    <h3>Interaction rules</h3>
    <p className="muted">Rules are staff instructions, not a compatibility assessment. Hard and Soft describe the rule; Planned and Present describe attendance.</p>
    {ownRules.length === 0 && <p>No configured interaction rules.</p>}
    {ownRules.map(rule => <article className={`rule-note rule-${rule.level}`} key={rule.id}>
      <strong>{otherName(rule)} — {ruleLabel(rule.level)}</strong>
      <p className="preserve-lines">{rule.note}</p>
      {rule.updated_at && <small>Updated {new Date(rule.updated_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} · {rule.updated_by}</small>}
      <div className="behaviour-actions">
        <button aria-label={`Edit rule with ${otherName(rule)}`} disabled={!editable || editing} onClick={() => { setFeedback(''); setDraft({ id: rule.id, version: rule.version, other: rule.dogs.find(id => id !== dog.id)!, level: rule.level, note: rule.note }); }}>Edit rule</button>
        <button className="danger" aria-label={`Remove rule with ${otherName(rule)}`} disabled={!editable || editing} onClick={() => { setFeedback(''); setRemoving(structuredClone(rule)); }}>Remove rule</button>
      </div>
    </article>)}
    {!draft && <button disabled={!editable || editing} onClick={() => { setFeedback(''); setSearch(''); setDraft({ other: '', level: 'hard', note: '' }); }}>Add rule</button>}
    {draft && <form className="rule-form" onSubmit={async e => {
      e.preventDefault();
      if (!draft.other || !draft.note.trim()) return;
      if (await run(() => repo.saveRule({ id: draft.id, version: draft.version, dogs: [dog.id, draft.other], level: draft.level, note: draft.note }))) { setDraft(null); setFeedback('Interaction rule saved on both dogs’ profiles.'); }
    }}>
      <h3>{draft.id ? 'Edit interaction rule' : 'Add interaction rule'}</h3>
      {!draft.id && !draft.other && <>
        <label>Search dogs<input autoFocus type="search" placeholder="Search name or breed…" value={search} disabled={!editable} onChange={e => setSearch(e.target.value)}/></label>
        <div className="rule-dog-list" aria-label="Choose another dog">
          {dogs.filter(d => d.id !== dog.id && !d.is_archived && matchesDog(d, search)).sort((a, b) => a.name.localeCompare(b.name)).map(d => {
            const exists = ownRules.some(r => r.dogs.includes(d.id));
            return <button type="button" key={d.id} disabled={!editable || exists} aria-label={`Choose ${d.name}${exists ? ' · rule already exists' : ''}`} onClick={() => setDraft({ ...draft, other: d.id })}>
              <Avatar dog={d}/><span><strong>{d.name}</strong><small>{d.breed || 'Breed not recorded'}{exists && ' · Rule already exists'}</small></span>
            </button>;
          })}
          {!dogs.some(d => d.id !== dog.id && !d.is_archived && matchesDog(d, search)) && <p>No matching dogs.</p>}
        </div>
      </>}
      {draft.other && <>
        <p><strong>{dog.name} + {dogs.find(d => d.id === draft.other)?.name}</strong></p>
        {!draft.id && <button type="button" disabled={!editable} onClick={() => setDraft({ ...draft, other: '' })}>Choose a different dog</button>}
        <label>Rule level<select value={draft.level} disabled={!editable} onChange={e => setDraft({ ...draft, level: e.target.value as 'hard' | 'soft' })}>
          <option value="hard">Hard — Must not mix.</option><option value="soft">Soft — Monitor closely and assess.</option>
        </select></label>
        <label>Rule note<textarea aria-label="Rule note" rows={3} required maxLength={2000} value={draft.note} disabled={!editable} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label>
        <small>{draft.note.length}/2000 characters. Explain the handling instruction.</small>
      </>}
      {draft.id && !rules.some(r => r.id === draft.id && r.version === draft.version) && <p role="alert">This rule changed or was removed. Your draft is kept here. Cancel and review the latest rule before editing again.</p>}
      <div className="behaviour-actions"><button type="button" onClick={() => setDraft(null)}>Cancel</button><button className="primary" disabled={!editable || !draft.other || !draft.note.trim() || (!!draft.id && !rules.some(r => r.id === draft.id && r.version === draft.version))}>Save rule</button></div>
    </form>}
    {removing && <section className="rule-form" aria-label="Confirm rule removal">
      <h3>Remove interaction rule?</h3>
      <p>{dog.name} + {otherName(removing)} — {ruleLabel(removing.level)}</p><p className="preserve-lines">{removing.note}</p>
      <p>This removes the rule from both profiles. Its audit history is retained.</p>
      {!rules.some(r => r.id === removing.id && r.version === removing.version) && <p role="alert">This rule changed. Cancel and review it before removing.</p>}
      <div className="behaviour-actions"><button onClick={() => setRemoving(null)}>Cancel</button><button className="danger" disabled={!editable || !rules.some(r => r.id === removing.id && r.version === removing.version)} onClick={async () => {
        if (await run(() => repo.removeRule(removing.id, removing.version))) { setRemoving(null); setFeedback('Interaction rule removed from both profiles.'); }
      }}>Confirm removal</button></div>
    </section>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
