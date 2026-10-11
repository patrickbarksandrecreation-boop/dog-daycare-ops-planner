import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection, Profile, Snapshot } from './model';
import type { Repository } from './repository';
export function usePlanner(repo: Repository, date: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [retry, setRetry] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const busyRef = useRef(false);
  const writePendingRef = useRef(false);
  useEffect(() => {
    const changed = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);
  useEffect(() => {
    let active = true, subscribed = false, dirty = false;
    let pending: Promise<void> | null = null;
    setConnection(browserOnline ? 'connecting' : 'offline');
    setSnapshot(previous => previous?.day.local_date === date ? previous : null);
    async function refresh() {
      if (!active || !browserOnline) return;
      dirty = true;
      if (pending) return pending;
      pending = (async () => {
        while (dirty && active) {
          dirty = false;
          try {
            const [user, state] = await Promise.all([repo.profile(), repo.snapshot(date)]);
            if (active) {
              setProfile(user); setSnapshot(state);
              setConnection(subscribed ? 'online' : 'connecting');
            }
          } catch (e) {
            if (active) { setConnection('offline'); setError(e instanceof Error ? e.message : 'Unable to load the board.'); }
            dirty = false;
          }
        }
      })().finally(() => { pending = null; });
      return pending;
    }
    refreshRef.current = refresh;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      // A local write always reconciles in run()'s finally block.
      if (writePendingRef.current || eventTimer) return;
      eventTimer = setTimeout(() => { eventTimer = undefined; if (!writePendingRef.current) void refresh(); }, 60);
    };
    const unsubscribe = browserOnline ? repo.watch(date, changed, status => {
      if (!active) return;
      subscribed = status === 'online';
      if (!subscribed) setConnection(status);
      else void refresh();
    }) : () => {};
    void refresh();
    // Revalidate after missed events, token refresh, device sleep, or a revoked staff profile.
    const poll = window.setInterval(() => { void refresh(); }, 30_000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { active = false; unsubscribe(); clearTimeout(eventTimer); clearInterval(poll); window.removeEventListener('focus', focus); };
  }, [repo, date, browserOnline, retry]);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current || connection !== 'online' || !browserOnline) return false;
    busyRef.current = true; writePendingRef.current = true; setBusy(true); setError('');
    let saved = false;
    try { await action(); saved = true; }
    catch (e) { setError(`${e instanceof Error ? e.message : 'Unable to save.'} The board will refresh to confirm server state.`); }
    finally { writePendingRef.current = false; await refreshRef.current(); busyRef.current = false; setBusy(false); }
    return saved;
  }, [connection, browserOnline]);
  return { snapshot, profile, connection, busy, error, setError, run, refresh: () => setRetry(value => value + 1), editable: connection === 'online' && browserOnline && !busy };
}
