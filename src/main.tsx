import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PawPrint, ArrowRight } from 'lucide-react';
import { client, cloudRepository } from './supabase';
import { demoRepository } from './demo';
import type { DemoScenario } from './demo';
import type { Repository } from './repository';
import { Planner } from './Planner';
import './styles.css';
function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [checking, setChecking] = useState(!!client);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<DemoScenario>('morning');
  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setRepo(previous => session ? previous && !previous.demo ? previous : cloudRepository() : null);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  if (repo) return <Planner repo={repo} onExit={() => setRepo(null)} />;
  return <main className="welcome"><section className="welcome-card">
    <div className="brand"><span className="brand-mark"><PawPrint size={25}/></span>dayboard<span className="brand-dot">.</span></div>
    <span className="eyebrow">A GOOD DAY STARTS WITH A GOOD PLAN</span>
    <h1>A place for<br/>every personality.</h1>
    <p className="welcome-copy">Your dogs. Your groups. One shared plan.<br/>A little less admin, a lot more time with the pack.</p>
    {checking ? <p role="status">Checking your session…</p> : client ? <form onSubmit={async e => {
      e.preventDefault(); setError(''); setBusy(true);
      const form = new FormData(e.currentTarget);
      try { const { error } = await client!.auth.signInWithPassword({ email: String(form.get('email')), password: String(form.get('password')) }); if (error) throw error; }
      catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
      finally { setBusy(false); }
    }}>
      <label>Work email<input name="email" type="email" autoComplete="username" required/></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>
      <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to your daycare'}<ArrowRight size={18}/></button>
      <small>Access is by staff invitation. Ask your manager if you need an account or password reset.</small>
    </form> : <div className="setup-note"><strong>Your workspace is ready to connect.</strong><p>Follow README.md to configure your private Supabase project. Explore planning and arrivals with 100 fictional bookings.</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <label className="demo-scenario">Demo scenario<select aria-label="Demo scenario" value={scenario} onChange={e => setScenario(e.target.value as DemoScenario)}><option value="morning">Morning · 100 Expected, unassigned</option><option value="planned">Planned day · 3 groups + arrivals</option><option value="four">Future layout · 4 groups</option></select></label>
    <button className="demo-button" onClick={() => setRepo(demoRepository(scenario))}>Explore the demo <ArrowRight size={17}/></button>
    <small>Demo changes last for this session only. No real dog records.</small>
  </section><aside className="welcome-art" aria-hidden="true"><div className="art-paw"><PawPrint size={160}/></div><p>Different dogs.<br/>Happy groups.</p><span>MADE FOR THE PEOPLE WHO KNOW THEM BEST.</span></aside></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
