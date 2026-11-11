import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Connection, Profile, Snapshot } from './model';
import type { Repository } from './repository';

export type AssignmentChange = { ids: string[]; preview: (state: Snapshot) => Snapshot };
type PendingChange = { id: number; change?: AssignmentChange; settled: boolean; failed?: boolean; previewHidden?: boolean };

export function usePlanner(repo: Repository, date: string) {
  // Keep server state separate from previews: rollback must never replace
  // another handler's newer state with a saved copy of the whole board.
  const [confirmed, setConfirmed] = useState<Snapshot | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const pendingRef = useRef(new Map<number, PendingChange>());
  const nextId = useRef(0);
  const exclusiveRef = useRef(false);
  const readyRef = useRef(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [retry, setRetry] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const publishPending = () => setPendingChanges([...pendingRef.current.values()]);

  useEffect(() => {
    const changed = () => {
      if (!navigator.onLine) {
        readyRef.current = false;
        for (const op of pendingRef.current.values()) op.previewHidden = true;
        publishPending();
      }
      setBrowserOnline(navigator.onLine);
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (pendingRef.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('online', changed); window.removeEventListener('offline', changed);
      window.removeEventListener('beforeunload', leaving);
    };
  }, []);

  useEffect(() => {
    let active = true, subscribed = false, dirty = false;
    let pending: Promise<void> | null = null;
    readyRef.current = false;
    setConnection(browserOnline ? 'connecting' : 'offline');
    setConfirmed(previous => previous?.day.local_date === date ? previous : null);
    setLoadError(''); setLoading(browserOnline);
    async function refresh(invalidate = true) {
      if (!active || !browserOnline) return;
      if (pending && !invalidate) return pending;
      dirty = true;
      if (pending) return pending;
      setLoading(true); setLoadError('');
      pending = (async () => {
        while (dirty && active) {
          dirty = false;
          // Only a read STARTED after a response can unlock its dogs. An older
          // in-flight read cannot clear or roll back an active preview.
          const settled = [...pendingRef.current.values()].filter(op => op.settled).map(op => op.id);
          try {
            const [user, state] = await Promise.all([repo.profile(), repo.snapshot(date)]);
            if (active) {
              for (const id of settled) pendingRef.current.delete(id);
              publishPending();
              setProfile(user); setConfirmed(state); setLoadError('');
              const ready = subscribed && ![...pendingRef.current.values()].some(op => op.failed);
              readyRef.current = ready;
              setConnection(ready ? 'online' : 'connecting');
              if (repo.photos) void repo.photos(state).then(enriched => {
                if (active) setConfirmed(current => current === state ? enriched : current);
              }).catch(() => { /* Initials remain usable; the next refresh retries signing. */ });
            }
          } catch (e) {
            if (active) {
              readyRef.current = false; setConnection('offline');
              setLoadError(e instanceof Error ? e.message : 'Unable to load the board.');
              // Show the last server state if confirmation fails. Keep locks
              // until retry succeeds; never imply an unconfirmed save is done.
              for (const op of pendingRef.current.values()) op.previewHidden = true;
              publishPending();
            }
            dirty = false;
          }
        }
      })().finally(() => { pending = null; if (active) setLoading(false); });
      return pending;
    }
    refreshRef.current = refresh;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      // In-flight writes will read after their response. During confirmation,
      // however, an event must dirty the read: its snapshot may predate it.
      if ([...pendingRef.current.values()].some(op => !op.settled) || eventTimer) return;
      eventTimer = setTimeout(() => { eventTimer = undefined; void refresh(); }, 60);
    };
    const unsubscribe = browserOnline ? repo.watch(date, changed, status => {
      if (!active) return;
      subscribed = status === 'online';
      if (!subscribed) { readyRef.current = false; setConnection(status); }
      else void refresh();
    }) : () => {};
    void refresh(false);
    const poll = window.setInterval(() => { void refresh(false); }, 30_000);
    const focus = () => { void refresh(false); };
    window.addEventListener('focus', focus);
    return () => {
      active = false; readyRef.current = false; unsubscribe(); clearTimeout(eventTimer);
      clearInterval(poll); window.removeEventListener('focus', focus);
    };
  }, [repo, date, browserOnline, retry]);

  const run = useCallback(async (action: () => Promise<void>, change?: AssignmentChange) => {
    if (!readyRef.current || !navigator.onLine || exclusiveRef.current) return false;
    if (change) {
      const locked = new Set([...pendingRef.current.values()].flatMap(op => op.change?.ids || []));
      if (change.ids.some(id => locked.has(id))) return false;
    } else if (pendingRef.current.size) return false;
    const op: PendingChange = { id: ++nextId.current, change, settled: false };
    pendingRef.current.set(op.id, op);
    if (!change) exclusiveRef.current = true;
    publishPending(); setError('');
    let saved = false;
    try { await action(); saved = true; }
    catch (e) {
      op.failed = true;
      readyRef.current = false; setConnection('connecting');
      setError(`${e instanceof Error ? e.message : 'Unable to save.'} Checking the saved board. Review it before trying again.`);
    } finally {
      op.settled = true; publishPending();
      await refreshRef.current();
      if (!change) exclusiveRef.current = false;
    }
    return saved;
  }, []);

  const snapshot = useMemo(() => confirmed ? pendingChanges.reduce((state, op) => op.previewHidden ? state : op.change?.preview(state) || state, confirmed) : null, [confirmed, pendingChanges]);
  const pendingIds = useMemo(() => new Set(pendingChanges.flatMap(op => op.change?.ids || [])), [pendingChanges]);
  return { snapshot, profile, connection, busy: pendingChanges.length > 0, pendingIds,
    loading, loadError, error: [error, loadError].filter(Boolean).join(' '), setError, run,
    refresh: () => { setError(''); setLoadError(''); setLoading(true); setRetry(value => value + 1); },
    editable: connection === 'online' && browserOnline && !pendingChanges.some(op => !op.change) };
}
