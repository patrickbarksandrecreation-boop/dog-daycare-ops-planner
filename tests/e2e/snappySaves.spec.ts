import { test, expect, type Page } from '@playwright/test';

const select = (page: Page, name: string) => page.getByRole('button', { name: `Select ${name}`, exact: true });
const card = (page: Page, name: string) => page.getByTestId(`card-${name}`);
const lane = (page: Page, group: string, name: string) => page.getByTestId(`lane-${group}`).getByTestId(`card-${name}`);
const destination = (page: Page) => page.getByLabel('Move selected dogs to', { exact: true });

async function open(page: Page, query = '') {
  await page.goto(`/tests/fixtures/loading.html?photoDelay=1&readDelay=400&writeDelay=3000${query}`);
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(select(page, 'Alfie')).toBeEnabled();
}

for (const width of [1920, 390]) test.describe(`${width}px save interactions`, () => {
test.use({ viewport: { width, height: width === 390 ? 844 : 1080 }, isMobile: width === 390, hasTouch: width === 390 });
test('moves preview immediately and another dog remains usable', async ({ page }) => {
  await open(page);
  await select(page, 'Alfie').click();
  await destination(page).selectOption('group-1');
  // The server has not committed yet: the visible move is an optimistic preview.
  await expect(lane(page, 'group-1', 'Alfie')).toBeAttached();
  await expect(card(page, 'Alfie')).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => (window as any).control.state.assignments[0].group_id)).toBeNull();
  // The pending dog is in a hidden destination on phones; inspect its lock independently of visibility.
  await expect(card(page, 'Alfie').getByRole('button', { name: 'Select Alfie', exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.getByLabel('Planning date', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeDisabled();
  if (width === 390) await expect(page.getByRole('button', { name: 'View Unassigned', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(select(page, 'Archie')).toBeEnabled();
  await select(page, 'Archie').click();
  await destination(page).selectOption('group-2');
  await expect(lane(page, 'group-2', 'Archie')).toBeAttached();
  await expect(card(page, 'Archie')).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).control.writes)).toBe(2);
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(card(page, 'Alfie')).not.toHaveAttribute('aria-busy', 'true');
  await expect(card(page, 'Archie')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('present-count')).toHaveText('0');
  await expect(page.getByLabel('Planning date', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
});
});

test('attendance previews once and a read started before the write cannot roll it back', async ({ page }) => {
  await open(page);
  const reads = await page.evaluate(() => (window as any).control.reads);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => (window as any).control.reads)).toBeGreaterThan(reads);
  await page.getByRole('button', { name: 'Mark Alfie present', exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('present-count')).toHaveText('1');
  await expect(card(page, 'Alfie')).toHaveAttribute('aria-busy', 'true');
  // Wait for the pre-write snapshot to settle while the write is still delayed.
  await expect(page.locator('.connection')).toHaveText('Saving…');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).control.state.assignments[0].attendance_status)).toBe('expected');
  await expect(page.getByTestId('present-count')).toHaveText('1');
  await expect(card(page, 'Alfie')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Mark Archie present', exact: true })).toBeEnabled();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
  await expect(page.getByTestId('present-count')).toHaveText('1');
});

test('a batch conflict removes every preview and restores the authoritative remote edit', async ({ page }) => {
  await open(page);
  await select(page, 'Alfie').click(); await select(page, 'Archie').click();
  await destination(page).selectOption('group-1');
  await expect(lane(page, 'group-1', 'Alfie')).toBeAttached();
  await expect(lane(page, 'group-1', 'Archie')).toBeAttached();
  await page.evaluate(() => {
    const c = (window as any).control;
    c.state.assignments[1].group_id = 'group-2'; c.state.assignments[1].version++; c.changed();
  });
  await expect(page.getByRole('alert')).toContainText('No selected dogs moved');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'unassigned', 'Alfie')).toBeVisible();
  await expect(lane(page, 'group-2', 'Archie')).toBeVisible();
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});

test('a committed move with a lost response reconciles without replaying its write', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as any).control.ambiguous = true; });
  await select(page, 'Alfie').click(); await destination(page).selectOption('group-1');
  await expect(card(page, 'Alfie')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('alert')).toContainText('Response lost');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'group-1', 'Alfie')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'group-1', 'Alfie')).toBeVisible();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});

test('an unconfirmed move disappears after a failed reread and editing waits for recovery', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as any).control.fail = true; });
  await select(page, 'Alfie').click(); await destination(page).selectOption('group-1');
  await expect(lane(page, 'group-1', 'Alfie')).toBeAttached();
  await expect(page.getByRole('alert')).toContainText('Injected read failure');
  await expect(lane(page, 'unassigned', 'Alfie')).toBeVisible();
  await expect(select(page, 'Alfie')).toBeDisabled();
  await expect(select(page, 'Archie')).toBeDisabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
  await page.evaluate(() => { (window as any).control.fail = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'group-1', 'Alfie')).toBeVisible();
  await expect(select(page, 'Archie')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});

test('offline selection cannot write and recovery restores the same selection', async ({ page, context }) => {
  await open(page);
  await select(page, 'Alfie').click();
  await context.setOffline(true);
  await expect(destination(page)).toBeDisabled();
  await expect(select(page, 'Archie')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mark Alfie present', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
  await context.setOffline(false);
  await expect(destination(page)).toBeEnabled();
  await expect(select(page, 'Alfie')).toHaveAttribute('aria-pressed', 'true');
  await destination(page).selectOption('group-1');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'group-1', 'Alfie')).toBeVisible();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});

test('going offline during a move shows the last confirmed board and reconciles once after reconnect', async ({ page, context }) => {
  await open(page);
  await select(page, 'Alfie').click(); await destination(page).selectOption('group-1');
  await expect(lane(page, 'group-1', 'Alfie')).toBeAttached();
  await expect(card(page, 'Alfie')).toHaveAttribute('aria-busy', 'true');
  await context.setOffline(true);
  await expect(page.locator('.connection')).toHaveText('Offline · view only');
  await expect(lane(page, 'unassigned', 'Alfie')).toBeAttached();
  await expect(select(page, 'Alfie')).toBeDisabled();
  await expect(select(page, 'Archie')).toBeDisabled();
  await expect(page.getByLabel('Planning date', { exact: true })).toBeDisabled();
  // The fixture's already accepted request still completes while the browser is offline.
  await expect.poll(() => page.evaluate(() => (window as any).control.state.assignments[0].group_id)).toBe('group-1');
  await context.setOffline(false);
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(lane(page, 'group-1', 'Alfie')).toBeVisible();
  await expect(select(page, 'Archie')).toBeEnabled();
  await expect(page.getByLabel('Planning date', { exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});
