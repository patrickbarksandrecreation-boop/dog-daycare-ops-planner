import { it, expect } from 'vitest';
import { validatePublicConfig } from '../src/publicConfig';
const url='https://example.supabase.co';
it('supports explicit demo builds and public keys',()=>{
  expect(()=>validatePublicConfig()).not.toThrow();
  expect(()=>validatePublicConfig('https://YOUR_PROJECT.supabase.co','YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY')).not.toThrow();
  expect(()=>validatePublicConfig(url,'sb_publishable_test')).not.toThrow();
  expect(()=>validatePublicConfig(url,`header.${btoa(JSON.stringify({role:'anon'}))}.signature`)).not.toThrow();
});
it('rejects privileged keys without printing their values',()=>{
  expect(()=>validatePublicConfig(url,'sb_secret_do_not_print')).toThrow(/Privileged/);
  expect(()=>validatePublicConfig(url,`header.${btoa(JSON.stringify({role:'service_role'}))}.signature`)).toThrow(/publishable/);
});
it('rejects partial configuration and unsafe remote URLs',()=>{
  expect(()=>validatePublicConfig(url)).toThrow(/both/);
  expect(()=>validatePublicConfig('http://example.supabase.co','sb_publishable_test')).toThrow(/HTTPS/);
  expect(()=>validatePublicConfig('https://user:pass@example.supabase.co','sb_publishable_test')).toThrow(/HTTPS/);
});
