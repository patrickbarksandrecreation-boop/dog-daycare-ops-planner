// Opt-in acceptance on isolated fictional master dogs and a future test date.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
assert.equal(process.env.LIVE_TEST_CONFIRM, 'synthetic-pilot');
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key);
const makeClient = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
});
const [a, b, outsider, unauthenticated] = [makeClient(), makeClient(), makeClient(), makeClient()];
const date = '2038-10-13';
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const names = ids.map((id, i) => `Synthetic preferences ${i + 1} ${id.slice(0, 8)}`);
const rpc = async (db, name, args) => {
  const result = await db.rpc(name, args); assert.equal(result.error, null, result.error?.message); return result.data;
};
const snapshot = db => rpc(db, 'planning_snapshot', { p_date: date });
const colourArgs = (colour, version) => ({ p_dog: ids[0], p_colour: colour, p_version: version });
let browser;
try {
  for (const [i, db] of [a, b, outsider].entries()) {
    assert.equal((await db.auth.signInAnonymously()).error, null);
    if (i < 2) await rpc(db, 'join_synthetic_pilot', { p_display_name: `Synthetic preferences staff ${i + 1}` });
  }
  const day = await rpc(a, 'ensure_planning_day', { p_date: date });
  for (const [i, id] of ids.entries()) {
    await rpc(a, 'save_dog', { p_id: id, p_name: names[i], p_photo: null, p_archived: false, p_breed: 'Fictional test breed' });
    await rpc(a, 'add_to_plan', { p_day: day, p_dog: id });
  }
  const dog = (await snapshot(a)).dogs.find(d => d.id === ids[0]);
  assert.equal(dog.card_colour, '#ffffff');
  await rpc(a, 'set_dog_colour', colourArgs('#CFE5FA', dog.colour_version));
  let saved = (await snapshot(b)).dogs.find(d => d.id === ids[0]);
  assert.equal(saved.card_colour, '#cfe5fa');
  assert.equal(saved.name, dog.name); assert.equal(saved.breed, dog.breed);
  assert.equal((await a.rpc('set_dog_colour', colourArgs('#000000', dog.colour_version))).error?.code, 'PT409');
  for (const invalid of ['red', '#fff', '#zzzzzz', null]) assert.ok((await a.rpc('set_dog_colour', colourArgs(invalid, saved.colour_version))).error);
  for (const db of [outsider, unauthenticated]) {
    assert.ok((await db.rpc('set_dog_colour', colourArgs('#000000', saved.colour_version))).error);
    assert.ok((await db.rpc('set_handling_notes', { p_dog: ids[0], p_notes: 'Denied', p_version: dog.notes_version })).error);
  }
  const competing = await Promise.all([a.rpc('set_dog_colour', colourArgs('#d5edce', saved.colour_version)), b.rpc('set_dog_colour', colourArgs('#e3d7f5', saved.colour_version))]);
  assert.equal(competing.filter(result => !result.error).length, 1);
  assert.equal(competing.find(result => result.error).error.code, 'PT409');
  assert.ok((await a.from('dogs').update({ card_colour: '#000000' }).eq('id', ids[0])).error);
  await rpc(a, 'set_handling_notes', { p_dog: ids[0], p_notes: 'Fictional acceptance: give space at the gate.', p_version: dog.notes_version });
  saved = (await snapshot(b)).dogs.find(d => d.id === ids[0]);
  assert.match(saved.handling_notes, /Fictional acceptance/);
  assert.equal((await a.rpc('set_handling_notes', { p_dog: ids[0], p_notes: 'Stale', p_version: dog.notes_version })).error?.code, 'PT409');
  await rpc(a, 'save_interaction_rule', { p_id: null, p_dog_a: ids[0], p_dog_b: ids[1], p_level: 'hard', p_note: 'Fictional acceptance: separate these test dogs.', p_version: null });
  let rule = (await snapshot(b)).rules.find(r => r.dogs.includes(ids[0]) && r.dogs.includes(ids[1]));
  assert.equal(rule.level, 'hard');
  await rpc(b, 'save_interaction_rule', { p_id: rule.id, p_dog_a: ids[1], p_dog_b: ids[0], p_level: 'soft', p_note: 'Fictional acceptance: monitor.', p_version: rule.version });
  assert.equal((await a.rpc('remove_interaction_rule', { p_id: rule.id, p_version: rule.version })).error?.code, 'PT409');
  rule = (await snapshot(a)).rules.find(r => r.id === rule.id);
  await rpc(a, 'remove_interaction_rule', { p_id: rule.id, p_version: rule.version });
  assert.ok(!(await snapshot(b)).rules.some(r => r.id === rule.id));
  const audit = await b.from('behaviour_events').select('event_type,actor_id').eq('entity_id', ids[0]);
  assert.equal(audit.error, null); assert.ok(audit.data.some(e => e.event_type === 'notes_edited' && e.actor_id));
  console.log('PASS: hosted colour persistence, version conflicts, independent metadata, access denial, notes and symmetric rule lifecycle/audit.', { syntheticDogs: ids, date });

  if (process.env.PREFERENCES_API_ONLY !== '1') {
    assert.ok(process.env.TEST_APP_URL);
    browser = await chromium.launch();
    const pages = [];
    for (const db of [a, b]) {
      const context = await browser.newContext();
      const { data: { session } } = await db.auth.getSession();
      await context.addInitScript(({ session, ref }) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)), { session, ref: new URL(url).hostname.split('.')[0] });
      const page = await context.newPage(); await page.goto(process.env.TEST_APP_URL);
      await page.locator('.connection.online').waitFor({ timeout: 30000 });
      await page.getByLabel('Planning date').fill(date);
      await page.getByRole('button', { name: `Information for ${names[0]}`, exact: true }).click({ timeout: 30000 });
      pages.push(page);
    }
    await pages[0].getByRole('button', { name: 'Blue card colour', exact: true }).click();
    await pages[0].getByRole('button', { name: 'Save colour', exact: true }).click();
    await expect(pages[0].getByRole('status').filter({ hasText: 'Card colour saved.' })).toBeVisible();
    await expect(pages[1].getByLabel('Custom card colour')).toHaveValue('#cfe5fa', { timeout: 15000 });
    await pages[1].getByRole('button', { name: 'Close dialog' }).click();
    await expect(pages[1].getByTestId(`card-${names[0]}`)).toHaveCSS('background-color', 'rgb(207, 229, 250)');
    await pages[1].reload();
    await pages[1].locator('.connection.online').waitFor({ timeout: 30000 });
    await pages[1].getByLabel('Planning date').fill(date);
    await expect(pages[1].getByTestId(`card-${names[0]}`)).toHaveCSS('background-color', 'rgb(207, 229, 250)', { timeout: 15000 });
    await pages[0].getByRole('button', { name: 'Edit notes', exact: true }).click();
    await pages[0].getByLabel('Handling notes', { exact: true }).fill('Fictional UI acceptance: calm greeting.');
    await pages[0].getByRole('button', { name: 'Save notes', exact: true }).click();
    await pages[1].getByRole('button', { name: `Information for ${names[0]}`, exact: true }).click();
    await expect(pages[1].getByRole('dialog')).toContainText('Fictional UI acceptance: calm greeting.', { timeout: 15000 });
    await pages[1].getByRole('button', { name: 'White card colour', exact: true }).click();
    await pages[1].getByRole('button', { name: 'Save colour', exact: true }).click();
    await expect(pages[0].getByLabel('Custom card colour')).toHaveValue('#ffffff', { timeout: 15000 });
    console.log('PASS: deployed popup, card backgrounds, two independent staff browsers, Realtime convergence, reload persistence, notes and white reset.');
  }
} finally {
  await browser?.close();
  try {
    const state = await snapshot(a);
    for (const id of ids) {
      const dog = state.dogs.find(d => d.id === id); if (!dog) continue;
      await rpc(a, 'set_dog_colour', { p_dog: id, p_colour: '#ffffff', p_version: dog.colour_version });
      if (dog.handling_notes) await rpc(a, 'set_handling_notes', { p_dog: id, p_notes: '', p_version: dog.notes_version });
      for (const r of state.rules.filter(r => r.dogs.includes(id))) {
        const remaining = (await snapshot(a)).rules.find(x => x.id === r.id);
        if (remaining) await rpc(a, 'remove_interaction_rule', { p_id: r.id, p_version: remaining.version });
      }
    }
  } finally { for (const db of [a, b, outsider]) await db.auth.signOut(); }
}
