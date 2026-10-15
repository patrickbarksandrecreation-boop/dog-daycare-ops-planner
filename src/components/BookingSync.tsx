import { useEffect, useRef, useState } from 'react';
import type { Repository, BookingSync as Sync } from '../repository';
import type { Dog } from '../model';
import { todayBrisbane } from '../model';
const messages: Record<string,string> = {
  login_required: 'Petboost login needs renewing on the sync worker.',
  incomplete_fetch: 'Petboost returned an incomplete or changing list. No bookings were imported.',
  identity_review: 'A dog identity needs linking or an archived dog needs review. No bookings were imported.',
  worker_error: 'Booking sync failed. Check the sync worker; the existing board is preserved.',
};
export function BookingSync({ repo, date, dogs, editable, refresh }: {
  repo: Repository; date: string; dogs: Dog[]; editable: boolean; refresh: () => void;
}) {
  const [sync,setSync]=useState<Sync|null>(null), [error,setError]=useState('');
  const [pending,setPending]=useState(false), [loaded,setLoaded]=useState(false);
  const refreshRef=useRef(refresh); refreshRef.current=refresh;
  useEffect(()=>{
    let alive=true, previous: string|null|undefined;
    setLoaded(false); setSync(null); setError('');
    async function load() {
      try {
        const next=await repo.bookingSync!(date);
        if(!alive) return;
        setSync(next); setError(''); setLoaded(true);
        if(previous!==undefined && next?.last_success_at!==previous) refreshRef.current();
        previous=next?.last_success_at;
      } catch(e) { if(alive) { setError(e instanceof Error?e.message:'Unable to read booking sync status.'); setLoaded(true); } }
    }
    void load(); const timer=setInterval(()=>void load(),20000);
    return ()=>{alive=false;clearInterval(timer);};
  },[repo,date]);
  const stamp=(value:string|null)=>value ? new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',dateStyle:'short',timeStyle:'short'}) : 'Never';
  const workerStale=sync?.enabled && (!sync.heartbeat_at || Date.now()-Date.parse(sync.heartbeat_at)>3*60_000);
  const running=sync?.lease_until && Date.parse(sync.lease_until)>Date.now();
  const stalled=sync?.lease_until && Date.parse(sync.lease_until)<=Date.now();
  const queued=sync?.requested_at && (!sync.claimed_request_at || sync.requested_at>sync.claimed_request_at);
  return <section className="booking-sync" aria-label="Petboost booking sync">
    <div><strong>Petboost</strong><span>Last successful sync: {stamp(sync?.last_success_at || null)} (Brisbane)</span>
      {!loaded ? <span>Loading sync status…</span> : !sync?.enabled ? <span>Automatic sync is not configured.</span> :
        <span>{running?'Syncing bookings…':queued?'Sync requested; waiting for worker…':'Weekdays · 06:30–11:30 hourly'}</span>}
    </div>
    <button disabled={!editable || !sync?.enabled || pending || !!running || !!queued || date!==todayBrisbane()}
      onClick={async()=>{
        setPending(true); setError('');
        try { await repo.requestBookingSync!(); setSync(await repo.bookingSync!(date)); }
        catch(e) { setError(e instanceof Error?e.message:'Sync request could not be confirmed.'); }
        finally { setPending(false); }
      }}>{pending?'Requesting…':'Sync bookings'}</button>
    {error && <p role="alert">{error}</p>}
    {sync?.last_error_code && <p role="alert">{messages[sync.last_error_code] || messages.worker_error}</p>}
    {workerStale && <p role="alert">Sync worker is not checking in. Automatic and manual sync may be delayed.</p>}
    {stalled && <p role="alert">The last sync did not finish. The existing board is preserved.</p>}
    {!!sync?.missingDogIds.length && <p role="alert">Cancelled or no longer in Petboost’s latest list — review: {sync.missingDogIds.map(id=>dogs.find(d=>d.id===id)?.name || 'Dog unavailable').join(', ')}. Their day records and staff changes are retained.</p>}
  </section>;
}
