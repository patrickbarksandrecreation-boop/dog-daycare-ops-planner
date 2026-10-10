import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export const SaveError = createContext('');
export function Modal({ title, children, close, wide = false }: {
  title: string; children: ReactNode; close: () => void; wide?: boolean;
}) {
  const error = useContext(SaveError);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return <dialog className={wide ? 'wide-dialog' : ''} ref={ref} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20}/></button></header>
    {error && <p className="error modal-error" role="alert">{error}</p>}
    {children}
  </dialog>;
}
