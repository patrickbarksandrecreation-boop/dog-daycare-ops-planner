// Used by Vite before bundling. Never include configuration values in errors.
export function validatePublicConfig(url?: string, key?: string): void {
  if (key?.startsWith('sb_secret_')) throw new Error('Privileged Supabase keys must not be used in VITE variables.');
  if (key?.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error('Privileged Supabase keys must not be used in VITE variables.');
    } catch { throw new Error('Use a Supabase publishable key or a valid legacy anon key.'); }
  }
  // Unconfigured builds intentionally retain the memory-only demo.
  if ((!url && !key) || (url?.includes('YOUR_PROJECT') && key?.startsWith('YOUR_PUBLIC_'))) return;
  if (!url || !key) throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  const parsed = new URL(url);
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))) {
    throw new Error('Use an HTTPS Supabase URL, or a local development URL.');
  }
  if (!key.startsWith('sb_publishable_') && key.split('.').length !== 3) throw new Error('Use a Supabase publishable key or a valid legacy anon key.');
}
