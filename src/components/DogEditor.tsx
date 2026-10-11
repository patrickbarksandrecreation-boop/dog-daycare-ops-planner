import { useState } from 'react';
import { Modal } from './Modal';
import { photoError, sameName } from '../model';
import type { Dog } from '../model';
export function DogEditor({ dog, dogs, save, close, editable }: {
  dog: Partial<Dog>; dogs: Dog[];
  save: (dog: Partial<Dog> & { name: string }, photo?: File) => Promise<boolean>;
  close: () => void; editable: boolean;
}) {
  const [name, setName] = useState(dog.name || '');
  const [breed, setBreed] = useState(dog.breed || '');
  const [photo, setPhoto] = useState<File>();
  const [error, setError] = useState('');
  const [archived, setArchived] = useState(dog.is_archived || false);
  const [acknowledged, setAcknowledged] = useState(false);
  const duplicates = dogs.filter(d => d.id !== dog.id && sameName(d.name, name));
  const needsAcknowledgement = !dog.id && duplicates.length > 0;
  return <Modal title={dog.id ? 'Edit dog' : 'New dog'} close={close}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!editable || !name.trim() || (needsAcknowledgement && !acknowledged)) return;
      if (await save({ ...dog, name: name.trim(), breed: breed.trim() || null, is_archived: archived }, photo)) close();
    }}>
      <label>Dog’s name<input autoFocus maxLength={80} required value={name}
        onChange={e => { setName(e.target.value); setAcknowledged(false); }}/></label>
      {needsAcknowledgement && <div className="duplicate-note">
        <p>A dog named {name.trim()} already exists. Use Dog database to book the existing dog.</p>
        <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>This is a different dog with the same name</label>
      </div>}
      <label>Breed (optional)<input maxLength={160} value={breed} placeholder="Full breed, mixed breed or unknown" onChange={e => setBreed(e.target.value)}/></label>
      {!dog.id && <><label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
        const file = e.target.files?.[0]; const message = file ? photoError(file) : null;
        setError(message || ''); setPhoto(message ? undefined : file);
      }}/></label>
      <small>JPG, PNG or WebP · up to 5 MB.</small></>}
      {dog.id && <p className="muted">Use Change photo in dog information to replace the photograph.</p>}
      {dog.id && <label className="check-label"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)}/>Archive this dog</label>}
      <p className="muted">{dog.id ? 'Saved plans and attendance records are retained.' : 'Creates a database record. Book this dog for a date separately.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!editable || !!error || !name.trim() || (needsAcknowledgement && !acknowledged)}>Save dog</button></footer>
    </form>
  </Modal>;
}
