import { test, expect, type Page } from '@playwright/test';

const view = (page: Page, name: string) => page.getByRole('button', { name: `View ${name}`, exact: true });
const select = (page: Page, name: string) => page.getByRole('button', { name: `Select ${name}`, exact: true });
async function tapSelect(page: Page, name: string) {
  await select(page, name).scrollIntoViewIfNeeded();
  await page.waitForTimeout(180); // Allow the preceding page scroll to settle.
  await select(page, name).tap();
}
const placed = (page: Page, group: string, name: string) => page.getByTestId(`lane-${group}`).getByTestId(`card-${name}`);

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const method of ['chooser', 'quick button'] as const) test(`${method} moves preserve the current group, counts and attendance`, async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).tap();
  await tapSelect(page, 'Alfie'); // Present
  await tapSelect(page, 'Archie'); // Expected
  if (method === 'chooser') await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-2');
  else await page.getByRole('button', { name: 'Move selection to Group 2', exact: true }).tap();
  await expect(view(page, 'Group 1')).toHaveAttribute('aria-current', 'page');
  await expect(placed(page, 'group-1', 'Alfie')).toHaveCount(0);
  await expect(placed(page, 'group-1', 'Archie')).toHaveCount(0);
  await expect(page.getByTestId('counts-group-1')).toHaveText('9 present / 28 planned');
  await expect(page.locator('.connection')).toHaveText('Demo · fictional data');
  await expect(view(page, 'Group 1')).toHaveAttribute('aria-current', 'page');
  await view(page, 'Group 2').tap();
  await expect(placed(page, 'group-2', 'Alfie')).toHaveClass(/present/);
  await expect(placed(page, 'group-2', 'Archie')).toHaveClass(/expected/);
  await expect(page.getByTestId('counts-group-2')).toHaveText('12 present / 32 planned');
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await expect(page.getByTestId('present-count')).toHaveText('31');
});

test('moving one dog from information retains the selected group', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).tap();
  await page.getByRole('button', { name: 'Information for Alfie', exact: true }).tap();
  await page.getByLabel('Move dog to', { exact: true }).selectOption('group-3');
  await expect(page.locator('.connection')).toHaveText('Demo · fictional data');
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  await expect(view(page, 'Group 1')).toHaveAttribute('aria-current', 'page');
  await expect(placed(page, 'group-1', 'Alfie')).toHaveCount(0);
  await expect(page.getByTestId('counts-group-1')).toHaveText('9 present / 29 planned');
  await view(page, 'Group 3').tap();
  await expect(placed(page, 'group-3', 'Alfie')).toBeVisible();
  await expect(placed(page, 'group-3', 'Alfie')).toHaveClass(/present/);
  await expect(page.getByTestId('present-count')).toHaveText('31');
});

for (const failed of [false, true]) test(`${failed ? 'failed' : 'successful'} pending save preserves a manually chosen view`, async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html?photoDelay=1&readDelay=250&writeDelay=1500');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await page.evaluate(value => { (window as any).control.failWrite = value; }, failed);
  await tapSelect(page, 'Alfie');
  await tapSelect(page, 'Archie');
  await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-1');
  await expect(view(page, 'Unassigned')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('counts-group-1')).toHaveText('0 present / 2 planned');
  await expect(page.locator('.connection')).toHaveText('Saving…');
  await view(page, 'Group 2').tap();
  await expect(view(page, 'Group 2')).toHaveAttribute('aria-current', 'page');
  if (failed) await expect(page.getByRole('alert')).toContainText('Another staff member');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(view(page, 'Group 2')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await expect(page.getByTestId('present-count')).toHaveText('0');
  await expect(page.getByTestId('expected-count')).toHaveText('100');
  await expect(page.getByTestId('counts-group-1')).toHaveText(`0 present / ${failed ? 0 : 2} planned`);
  await view(page, failed ? 'Unassigned' : 'Group 1').tap();
  for (const name of ['Alfie', 'Archie']) await expect(placed(page, failed ? 'unassigned' : 'group-1', name)).toBeVisible();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});
