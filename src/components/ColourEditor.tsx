import { useState } from 'react';
import type { Dog } from '../model';
import { colourPresets, defaultColour, dogColourStyle } from '../dogColours';

export function ColourEditor({ dog, editable, save }: {
  dog: Dog; editable: boolean; save: (colour: string, version: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ colour: string; version: number } | null>(null);
  const [feedback, setFeedback] = useState('');
  const colour = draft?.colour || dog.card_colour || defaultColour;
  const changed = !!draft && draft.version !== (dog.colour_version || 1);
  const choose = (value: string) => {
    setFeedback('');
    setDraft({ colour: value, version: draft?.version ?? dog.colour_version ?? 1 });
  };
  return <form className="colour-editor" aria-label="Dog card colour" onSubmit={async event => {
    event.preventDefault();
    if (draft && await save(draft.colour, draft.version)) { setDraft(null); setFeedback('Card colour saved.'); }
  }}>
    <h3>Card colour</h3>
    <div className="colour-preview" style={dogColourStyle(colour)}>{dog.name}</div>
    <div className="colour-presets">{colourPresets.map(([name, value]) =>
      <button key={name} type="button" aria-label={`${name} card colour`} aria-pressed={colour.toLowerCase() === value}
        disabled={!editable} style={{ background: value }} onClick={() => choose(value)}>{name}</button>
    )}</div>
    <label>Custom colour<input type="color" aria-label="Custom card colour" value={colour} disabled={!editable} onChange={event => choose(event.target.value)}/></label>
    <p className="muted">This colour follows the dog across groups and dates.</p>
    {changed && <p role="alert">The saved colour changed while you were editing. Cancel to review it before trying again.</p>}
    <div className="behaviour-actions">
      <button type="button" disabled={!draft || !editable} onClick={() => { setDraft(null); setFeedback(''); }}>Cancel colour change</button>
      <button className="primary" disabled={!draft || !editable || changed}>Save colour</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </form>;
}
