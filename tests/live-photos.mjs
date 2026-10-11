// Opt-in hosted acceptance. Retains explicitly synthetic dogs and staff identities.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.LIVE_TEST_CONFIRM, 'synthetic-pilot');
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key);
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
const [a, b, outsider] = [client(), client(), client()];
for (const [i, db] of [a, b, outsider].entries()) {
  assert.equal((await db.auth.signInAnonymously()).error, null);
  if (i < 2) assert.equal((await db.rpc('join_synthetic_pilot', { p_display_name: `Synthetic photo release ${i + 1}` })).error, null);
}
const id = crypto.randomUUID(), name = `Synthetic photo release ${id.slice(0, 8)}`;
assert.equal((await a.rpc('save_dog', { p_id: id, p_name: name, p_photo: null, p_archived: false, p_breed: 'Synthetic test breed' })).error, null);
const dog = async db => { const r = await db.from('dogs').select('*').eq('id', id).single(); assert.equal(r.error, null); return r.data; };
const bytes = await readFile('public/icon-192.png');
const replace = async (db, expected = '', payload = bytes, type = 'image/png') => {
  const body = new FormData(); body.set('dogId', id); body.set('expectedPath', expected); body.set('photo', new Blob([payload], { type }), 'synthetic.png');
  return db.functions.invoke('replace-dog-photo', { body });
};
const browser = await chromium.launch();
try {
  const pages = [];
  for (const db of [a, b]) {
    const context = await browser.newContext();
    const { data: { session } } = await db.auth.getSession();
    await context.addInitScript(({ session, ref }) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)), { session, ref: new URL(url).hostname.split('.')[0] });
    const page = await context.newPage(); await page.goto(process.env.TEST_APP_URL || 'http://127.0.0.1:5174');
    await page.locator('.connection.online').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Dog database', exact: true }).click();
    await page.getByLabel('Search dog database').fill(name); pages.push(page);
  }
  await pages[0].getByRole('button', { name: `Change photo for ${name}`, exact: true }).click();
  await pages[0].getByLabel('Choose or take a photo').setInputFiles('public/icon-192.png');
  await pages[0].getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(pages[0].getByLabel('Choose or take a photo')).toHaveCount(0, { timeout: 30000 });
  await pages[0].getByRole('button', { name: 'Dog database', exact: true }).click();
  await pages[0].getByLabel('Search dog database').fill(name);
  for (const page of pages) {
    await expect(page.locator('.database-row img')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.locator('.database-row img').evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
  }
  const first = (await dog(a)).photo_path; assert.ok(first);
  await pages[1].reload(); await pages[1].locator('.connection.online').waitFor({ timeout: 30000 });
  await pages[1].getByRole('button', { name: 'Dog database', exact: true }).click();
  await pages[1].getByLabel('Search dog database').fill(name);
  await expect(pages[1].locator('.database-row img')).toBeVisible();
  const oldSrc = await pages[1].locator('.database-row img').getAttribute('src');
  const competing = await Promise.all([replace(a, first), replace(b, first)]);
  assert.equal(competing.filter(r => !r.error && r.data?.saved).length, 1);
  assert.equal(competing.filter(r => r.error).length, 1);
  const current = (await dog(b)).photo_path; assert.notEqual(current, first);
  await expect(pages[1].locator('.database-row img')).not.toHaveAttribute('src', oldSrc, { timeout: 30000 });
  assert.ok((await replace(a, current, Buffer.from('invalid'))).error);
  assert.equal((await dog(a)).photo_path, current);
  assert.ok((await replace(outsider, current)).error);
  const visitor = client(); assert.ok((await replace(visitor, current)).error);
  assert.ok((await visitor.storage.from('dog-photos').createSignedUrl(current, 60)).error);
  const signed = await b.storage.from('dog-photos').createSignedUrl(current, 60); assert.equal(signed.error, null);
  assert.equal((await fetch(signed.data.signedUrl)).status, 200);
  assert.ok((await b.rpc('save_dog', { p_id: id, p_name: 'Denied edit', p_photo: current, p_archived: false, p_breed: 'Denied' })).error);
  assert.ok((await b.storage.from('dog-photos').upload(current, bytes, { contentType: 'image/png', upsert: true })).error);
  assert.ok((await b.rpc('reserve_dog_photo', { p_actor: (await b.auth.getUser()).data.user.id, p_dog: id, p_extension: 'png' })).error);
  const cleanup = await b.functions.invoke('replace-dog-photo', { body: {} }); assert.equal(cleanup.error, null);
  assert.equal((await dog(a)).photo_path, current);
  assert.ok((await b.storage.from('dog-photos').createSignedUrl(first, 60)).error, 'Retired object removed');
  console.log(JSON.stringify({ passed: true, dogId: id, dogName: name, checks: ['staff UI replacement', 'peer realtime image refresh', 'refresh persistence', 'one competing winner', 'invalid upload preserves image', 'unauthenticated and nonstaff denial', 'private download', 'unrelated edit and direct upload denial', 'service-only RPC denial', 'cleanup protects current and removes retired'] }));
} finally { await browser.close(); }
