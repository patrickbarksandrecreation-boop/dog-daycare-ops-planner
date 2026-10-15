import { useState } from 'react';
import type { Dog } from '../model';
import { photoError } from '../model';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

export function PhotoEditor({ dog, editable, save, close }: {
  dog: Dog; editable: boolean; save: (photo: File) => Promise<boolean>; close: () => void;
}) {
  const [photo, setPhoto] = useState<File>();
  const [error, setError] = useState('');
  return <Modal title={`Change photo · ${dog.name}`} close={close}>
    <div className="info-summary"><Avatar dog={dog}/><strong>{dog.name}</strong></div>
    <form onSubmit={async event => { event.preventDefault(); if (photo && editable && await save(photo)) close(); }}>
      <label>Choose or take a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.target.files?.[0]; const message = file ? photoError(file) : '';
        setError(message || ''); setPhoto(message ? undefined : file);
      }}/></label>
      <p className="muted">JPG, PNG or WebP · up to 8 MB. The current photo stays until the replacement is saved.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!editable || !photo || !!error}>Save photo</button></footer>
    </form>
  </Modal>;
}
