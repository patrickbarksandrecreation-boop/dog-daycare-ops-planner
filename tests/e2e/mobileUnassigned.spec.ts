import { test, expect } from '@playwright/test';

for (const width of [360, 390]) test(`${width}px unassigned expands into a touch-scrollable page without accidental selection`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByLabel('Demo scenario').selectOption('morning');
    await page.getByRole('button', { name: 'Explore the demo' }).tap();
    const lane = page.getByTestId('lane-unassigned');
    const cards = lane.locator('.unassigned-cards');
    await expect(lane.locator('.dog-card')).toHaveCount(100);
    await page.getByRole('button', { name: 'View all unassigned', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'View Unassigned', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await cards.evaluate(element => ({
      horizontal: element.scrollWidth > element.clientWidth,
      clipped: element.scrollHeight > element.clientHeight,
    }))).toEqual({ horizontal: false, clipped: false });
    const first = lane.getByRole('button', { name: 'Select Alfie', exact: true });
    await first.scrollIntoViewIfNeeded();
    const cardBox = (await lane.getByTestId('card-Alfie').boundingBox())!;
    expect(cardBox.width).toBeGreaterThan(width - 60);
    expect(cardBox.height).toBeGreaterThanOrEqual(64);
    for (const action of ['Information for Alfie', 'Mark Alfie present']) {
      const box = (await lane.getByRole('button', { name: action, exact: true }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(lane.locator('.drag-handle:visible')).toHaveCount(0);
    const box = (await first.boundingBox())!;
    const startY = box.y + box.height / 2;
    const before = await page.evaluate(() => scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: startY }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2, y: startY - step * 18 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30);
    // Wait past the hold threshold: a scroll must neither open details nor toggle a card.
    await page.waitForTimeout(650);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.dog-card.selected')).toHaveCount(0);
    await expect(page.getByTestId('selection-count')).not.toContainText('1 selected');
    const last = lane.locator('.dog-card').last();
    const lastId = await last.getAttribute('data-dog-id');
    await last.getByRole('button', { name: /^Select / }).tap();
    await expect(page.getByTestId('selection-count')).toContainText('1 selected');
    await expect(page.getByLabel('Move selected dogs to', { exact: true })).toBeInViewport();
    await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-2');
    await expect(page.getByTestId('lane-group-2').locator(`[data-dog-id="${lastId}"]`)).toBeVisible();
    await expect(lane.locator('.dog-card')).toHaveCount(99);
    await expect(page.getByTestId('present-count')).toHaveText('0');
    await page.getByRole('button', { name: 'View Unassigned', exact: true }).tap();
    await page.getByLabel('Search unassigned dogs').fill('Alfie');
    await expect(lane.locator('.dog-card')).toHaveCount(5);
    await lane.getByRole('button', { name: 'Select Alfie', exact: true }).tap();
    await page.getByRole('button', { name: 'View Group 1', exact: true }).tap();
    await expect(page.getByTestId('selection-count')).toContainText('1 selected');
    await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-1');
    await expect(page.getByTestId('lane-group-1').getByTestId('card-Alfie')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tabs = page.getByRole('navigation', { name: 'Group views and destinations' });
    expect(await tabs.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
