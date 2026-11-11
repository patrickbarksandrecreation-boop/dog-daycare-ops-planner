import { test, expect, type Page } from '@playwright/test';

async function grouped(page: Page, count = 40) {
  await page.goto('/tests/fixtures/loading.html?photoDelay=1&readDelay=1');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await page.evaluate(count => {
    const control = (window as any).control;
    control.state.assignments.forEach((a: any, i: number) => { a.group_id = i < count ? 'group-1' : null; });
    control.changed();
  }, count);
  await expect(page.getByTestId('counts-group-1')).toContainText(`${count} planned`);
  const groupTab = page.getByRole('button', { name: 'View Group 1', exact: true });
  if (await groupTab.isVisible()) await groupTab.click();
  await page.getByRole('button', { name: 'Fit Group 1 on screen', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Entire group overview' })).toBeVisible();
}

for (const size of [
  { width: 320, height: 568 }, { width: 360, height: 640 },
  { width: 390, height: 664 }, { width: 393, height: 730 },
  { width: 430, height: 780 }, { width: 844, height: 390 },
  { width: 1280, height: 720 },
]) test(`40 complete photo/name/breed tiles fit at ${size.width}×${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  await grouped(page);
  await expect(page.locator('.overview-card')).toHaveCount(40);
  const measurements = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.overview-card')];
    const visible = (element: Element) => {
      const r = element.getBoundingClientRect();
      return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    };
    return { complete: cards.filter(card => visible(card) && [...card.children].every(visible)).length,
      smallestPhoto: Math.min(...cards.map(card => card.querySelector('.avatar')!.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth > innerWidth,
      clipped: document.querySelector('.overview-grid')!.scrollHeight > document.querySelector('.overview-grid')!.clientHeight + 1 };
  });
  expect(measurements.complete).toBe(40);
  expect(measurements.smallestPhoto).toBeGreaterThanOrEqual(20);
  expect(measurements.overflow).toBe(false);
  expect(measurements.clipped).toBe(false);
  await expect(page.locator('.overview-card .avatar img').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to operations' })).toBeInViewport();
  await page.getByRole('button', { name: 'Back to operations' }).click();
  const groupTab = page.getByRole('button', { name: 'View Group 1', exact: true });
  if (await groupTab.isVisible()) await expect(groupTab).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('counts-group-1')).toContainText('40 planned');
  await expect(page.getByRole('button', { name: 'Fit Group 1 on screen', exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
});

test('overview ignores board search, preserves selection and follows current group on return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.getByLabel('Find a dog on the board').fill('Archie');
  await page.getByRole('button', { name: 'Select Archie', exact: true }).click();
  await page.getByRole('button', { name: 'Fit Group 1 on screen', exact: true }).click();
  await expect(page.locator('.overview-card')).toHaveCount(30);
  await page.getByLabel('Overview group', { exact: true }).selectOption('group-2');
  await expect(page.getByRole('heading', { name: 'Group 2 · 30 dogs' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to operations' }).click();
  await expect(page.getByRole('button', { name: 'View Group 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Find a dog on the board')).toHaveValue('Archie');
  await expect(page.getByTestId('selection-count')).toContainText('1 selected');
});

test('live updates, departures, empty groups, offline status and Escape work without writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await grouped(page, 41);
  await expect(page.locator('.overview-card')).toHaveCount(41);
  await page.evaluate(() => {
    const control = (window as any).control;
    control.state.assignments[0].attendance_status = 'departed';
    control.changed();
  });
  await expect(page.locator('.overview-card')).toHaveCount(40);
  await page.evaluate(() => (window as any).control.status('CHANNEL_ERROR'));
  await expect(page.getByRole('status')).toContainText('Offline · last loaded');
  await page.getByLabel('Overview group', { exact: true }).selectOption('group-2');
  await expect(page.getByText('No dogs assigned to this group.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to operations' }).press('Escape');
  await expect(page.getByRole('button', { name: 'View Group 2', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
});
