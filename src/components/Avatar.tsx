import { useEffect, useState } from 'react';
import type { Dog } from '../model';
export function Avatar({ dog }: { dog: Dog }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [dog.photo_url]);
  return <span className="avatar" aria-hidden="true">
    {dog.photo_url && !failed
      ? <img src={dog.photo_url} alt="" loading="lazy" onError={() => setFailed(true)}/>
      : dog.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
  </span>;
}
