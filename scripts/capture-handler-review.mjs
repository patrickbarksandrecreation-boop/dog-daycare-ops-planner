// Synthetic UI review only; no hosted data or writes.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.TEST_APP_URL || 'http://127.0.0.1:5175';
const folder = 'docs/ui-speed-review';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLANNER_CHROMIUM_PATH || undefined });
const geometry = [];
const followup = {};
try {
  for (const [name, width, height, touch] of [['desktop', 1920, 1080, false], ['mobile', 390, 844, true], ['tablet', 768, 1024, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-11T02:00:00Z'));
    await page.goto(origin);
    await page.getByLabel('Demo scenario').selectOption('planned');
    await page.getByRole('button', { name: 'Explore the demo' }).click();
    await page.getByTestId('card-Alfie').waitFor();
    await page.screenshot({ path: `${folder}/after-${name}.png` });
    geometry.push({ name, width, height, ...await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.group-grid .dog-card')];
      const visible = cards.filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; });
      const first = visible[0].getBoundingClientRect();
      const info = visible[0].querySelector('.info-action').getBoundingClientRect();
      return { complete_group_cards: visible.length, first_card_y: first.y, card_height: first.height,
        info_target: { width: info.width, height: info.height }, horizontal_overflow: document.documentElement.scrollWidth > innerWidth };
    }) });
    if (name === 'mobile') {
      const cdp = await context.newCDPSession(page);
      const body = await page.getByRole('button', { name: 'Select Archie', exact: true }).boundingBox();
      const x = body.x + body.width / 2, y = body.y + body.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 4; step++) {
        await page.waitForTimeout(35);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 2.5 * step }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      followup.short_drag_px = 10;
      followup.accidental_selections = await page.locator('.dog-card.selected').count();
      assert.equal(followup.accidental_selections, 0);
      await page.screenshot({ path: `${folder}/after-mobile-scroll.png` });
      for (const dog of ['Alfie', 'Archie', 'Bailey']) await page.getByRole('button', { name: `Select ${dog}`, exact: true }).click();
      await page.screenshot({ path: `${folder}/after-mobile-move.png` });
      await page.getByRole('button', { name: 'Move selection to Group 2', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.connection')?.textContent === 'Demo · fictional data');
      followup.active_group_after_move = await page.locator('.group-tabs [aria-current="page"]').getAttribute('aria-label');
      assert.equal(followup.active_group_after_move, 'View Group 1');
      followup.source_counts_after_move = await page.getByTestId('counts-group-1').textContent();
      followup.destination_counts_after_move = await page.getByTestId('counts-group-2').textContent();
      await page.screenshot({ path: `${folder}/after-mobile-stay.png` });
      await page.goto(`${origin}/tests/fixtures/loading.html?photoDelay=1&writeDelay=3000&readDelay=800`);
      await page.waitForFunction(() => document.querySelector('.connection')?.textContent === 'Live · saved');
      await page.getByRole('button', { name: 'Mark Alfie present', exact: true }).click();
      await page.getByTestId('card-Alfie').filter({ has: page.getByLabel('Saving changes for Alfie') }).waitFor();
      await page.screenshot({ path: `${folder}/after-mobile-saving.png` });
      // Let the synthetic write finish before leaving the page.
      await page.waitForFunction(() => document.querySelector('.connection')?.textContent === 'Live · saved');
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${folder}/layout-measurements.json`, JSON.stringify(geometry, null, 2) + '\n');
await writeFile(`${folder}/scroll-move-measurements.json`, JSON.stringify(followup, null, 2) + '\n');
console.log(JSON.stringify(geometry, null, 2));
