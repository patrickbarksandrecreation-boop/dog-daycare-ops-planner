// Opt-in hosted acceptance; uses a dedicated synthetic date and restores its label.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.LIVE_TEST_CONFIRM, 'synthetic-pilot');
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key);
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
const [a, b, outsider, anonymous] = [client(), client(), client(), client()];
const date = '2038-10-11';
const rpc = async (db, name, args) => { const r = await db.rpc(name, args); assert.equal(r.error, null); return r.data; };
for (const [i, db] of [a, b, outsider].entries()) {
  assert.equal((await db.auth.signInAnonymously()).error, null);
  if (i < 2) await rpc(db, 'join_synthetic_pilot', { p_display_name: `Synthetic group rename ${i + 1}` });
}
const day = await rpc(a, 'ensure_planning_day', { p_date: date });
const snapshot = db => rpc(db, 'planning_snapshot', { p_date: date });
const before = await snapshot(a), group = before.groups[0];
const args = name => ({ p_day: day, p_group: group.group_id, p_name: name, p_default: false });
const name = `Synthetic pack ${crypto.randomUUID().slice(0, 8)}`;
let browser;
try {
  await rpc(a, 'rename_group', args(`  ${name}  `));
  assert.equal((await snapshot(b)).groups[0].displayed_name, name);
  for (const invalid of ['', '   ', 'x'.repeat(41), null]) assert.ok((await b.rpc('rename_group', args(invalid))).error);
  assert.ok((await outsider.rpc('rename_group', args('Denied'))).error);
  assert.ok((await anonymous.rpc('rename_group', args('Denied'))).error);
  assert.deepEqual((await snapshot(b)).assignments, before.assignments);
  console.log('PASS: hosted staff rename, trimming, second-session visibility, validation and nonstaff/anonymous denial.');
  if (process.env.GROUP_TEST_API_ONLY !== '1') {
    browser = await chromium.launch();
    const pages = [];
    for (const db of [a, b]) {
      const context = await browser.newContext();
      const { data: { session } } = await db.auth.getSession();
      await context.addInitScript(({ session, ref }) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)), { session, ref: new URL(url).hostname.split('.')[0] });
      const page = await context.newPage();
      await page.goto(process.env.TEST_APP_URL);
      await page.locator('.connection.online').waitFor({ timeout: 30000 });
      await page.getByLabel('Planning date').fill(date);
      await expect(page.getByRole('button', { name: `Rename ${name}`, exact: true })).toBeVisible({ timeout: 30000 });
      pages.push(page);
    }
    const renamed = `${name} UI`;
    await pages[0].getByRole('button', { name: `Rename ${name}`, exact: true }).click();
    await pages[0].getByLabel('Group name', { exact: true }).fill(renamed);
    await pages[0].getByRole('button', { name: 'Save name', exact: true }).click();
    for (const page of pages) await expect(page.getByRole('button', { name: `Rename ${renamed}`, exact: true })).toBeVisible({ timeout: 30000 });
    await pages[1].reload();
    await pages[1].locator('.connection.online').waitFor({ timeout: 30000 });
    await pages[1].getByLabel('Planning date').fill(date);
    await expect(pages[1].getByRole('button', { name: `Rename ${renamed}`, exact: true })).toBeVisible({ timeout: 30000 });
    assert.deepEqual((await snapshot(b)).assignments, before.assignments);
    console.log('PASS: deployed staff UI rename, realtime convergence in two browsers and reload persistence.');
  }
} finally {
  await browser?.close();
  await rpc(a, 'rename_group', args(group.displayed_name));
  for (const db of [a, b, outsider]) await db.auth.signOut();
}
