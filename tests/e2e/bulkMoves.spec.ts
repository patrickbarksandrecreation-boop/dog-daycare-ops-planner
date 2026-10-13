import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function demo(page: Page) {
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
}
const select = (page: Page, name: string) => page.getByRole('button', { name: `Select ${name}`, exact: true });
const count = (page: Page, n: number) => expect(page.getByTestId('selection-count')).toContainText(`${n} selected`);

test('desktop toggles across lanes, bulk destinations preserve attendance and controls preserve other selections', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await demo(page);
  const names = ['Alfie', 'Hazel Acorn', 'Winston Dune'];
  for (const name of names) await select(page, name).click();
  await count(page, 3);
  await page.getByRole('button', { name: 'Drag Archie', exact: true }).click();
  await count(page, 3);
  await expect(select(page, 'Archie')).toHaveAttribute('aria-pressed', 'false');
  await select(page, 'Hazel Acorn').click(); await count(page, 2);
  await expect(select(page, 'Alfie')).toHaveAttribute('aria-pressed', 'true');
  await select(page, 'Hazel Acorn').click();
  await page.getByRole('button', { name: 'Information for Archie', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await count(page, 3);
  await page.getByRole('button', { name: 'Mark Archie present', exact: true }).click();
  await count(page, 3);
  await expect(select(page, 'Archie')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('present-count')).toHaveText('32');
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/bulk-selection-desktop.png' });
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-3');
  for (const name of names) await expect(page.getByTestId('lane-group-3').getByTestId(`card-${name}`)).toBeVisible();
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  await expect(page.getByTestId('present-count')).toHaveText('32');
  for (const name of names) await select(page, name).click();
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('unassigned');
  for (const name of names) await expect(page.getByTestId('lane-unassigned').getByTestId(`card-${name}`)).toBeVisible();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await expect(page.getByTestId('present-count')).toHaveText('32');
  await select(page, 'Alfie').click();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  await select(page, 'Alfie').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  await select(page, 'Alfie').click();
  await page.getByLabel('Planning date').fill('2039-03-01');
  await expect(page.getByTestId('booked-count')).toHaveText('0');
  await expect(page.getByLabel('Move selected dogs to', { exact: true })).toHaveCount(0);
});

test('mobile tabs switch views without moving or clearing selection and chooser stays reachable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await demo(page);
  await select(page, 'Alfie').tap();
  await page.getByRole('button', { name: 'View Group 2', exact: true }).tap();
  await select(page, 'Hazel Acorn').tap(); await count(page, 2);
  await page.getByRole('button', { name: 'View Group 3', exact: true }).tap();
  await select(page, 'Alfie Dune').tap();
  await page.getByLabel('Search unassigned dogs').fill('Winston Dune');
  await select(page, 'Winston Dune').tap(); await count(page, 4);
  await page.getByRole('button', { name: 'View Group 1', exact: true }).tap();
  await expect(select(page, 'Alfie')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('counts-group-1')).toHaveText('10 present / 30 planned');
  await expect(page.getByTestId('counts-group-2')).toHaveText('11 present / 30 planned');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByLabel('Move selected dogs to', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/bulk-selection-mobile.png', fullPage: true });
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-2');
  for (const name of ['Alfie', 'Hazel Acorn', 'Alfie Dune', 'Winston Dune']) {
    await expect(page.getByTestId('lane-group-2').getByTestId(`card-${name}`)).toBeVisible();
  }
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  await expect(page.getByTestId('present-count')).toHaveText('31');
  await context.close();
});

test('remote refresh keeps captured versions and rejects an entire stale batch', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html?photoDelay=1');
  await expect(select(page, 'Alfie')).toBeEnabled();
  await select(page, 'Alfie').click(); await select(page, 'Archie').click();
  await page.evaluate(() => {
    const c = (window as any).control; c.state.assignments[1].group_id = 'group-2';
    c.state.assignments[1].version++; c.changed();
  });
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
  await count(page, 2);
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-1');
  await expect(page.getByRole('alert')).toContainText('No selected dogs moved');
  await expect(page.getByTestId('lane-unassigned').getByTestId('card-Alfie')).toBeVisible();
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});

for (const ambiguous of [false, true]) test(`${ambiguous ? 'lost response' : 'failed request'} reconciles without retries and gates offline/saving edits`, async ({ page, context }) => {
  await page.goto('/tests/fixtures/loading.html?photoDelay=1&readDelay=500');
  await expect(select(page, 'Alfie')).toBeEnabled();
  await select(page, 'Alfie').click(); await select(page, 'Archie').click();
  await context.setOffline(true);
  await expect(page.getByLabel('Move selected dogs to', { exact: true })).toBeDisabled();
  await expect(select(page, 'Bella')).toBeDisabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
  await context.setOffline(false);
  await expect(page.getByLabel('Move selected dogs to', { exact: true })).toBeEnabled();
  await page.evaluate(value => {
    const c = (window as any).control; c.ambiguous = value; c.failWrite = !value;
  }, ambiguous);
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-1');
  await expect(page.getByLabel('Move selected dogs to', { exact: true })).toBeDisabled();
  await expect(select(page, 'Bella')).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(ambiguous ? 'Response lost' : 'Another staff member');
  await expect(page.getByTestId(ambiguous ? 'lane-group-1' : 'lane-unassigned').getByTestId('card-Alfie')).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
  await expect(page.getByTestId('present-count')).toHaveText('0');
});
