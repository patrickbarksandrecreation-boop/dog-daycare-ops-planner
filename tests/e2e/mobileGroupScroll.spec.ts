import { test, expect, type CDPSession, type Locator, type Page } from '@playwright/test';

async function point(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Touch target is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function start(cdp: CDPSession, target: Locator) {
  const position = await point(target);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
  return position;
}
async function release(cdp: CDPSession, cancel = false) {
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
}
async function drag(page: Page, cdp: CDPSession, target: Locator, distance: number, steps = 8) {
  const position = await start(cdp, target);
  for (let step = 1; step <= steps; step++) {
    await page.waitForTimeout(35);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: position.x, y: position.y + distance * step / steps }],
    });
  }
  await release(cdp);
}
async function idle(page: Page) {
  // Allow Chromium's kinetic scroll and the brief post-scroll tap guard to finish.
  await page.waitForTimeout(500);
}
async function untouched(page: Page) {
  await expect(page.locator('.dog-card.selected')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('present-count')).toHaveText('31');
}

for (const width of [360, 390, 430]) {
  test.describe(`${width}px planned group touch gestures`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.getByLabel('Demo scenario').selectOption('planned');
      await page.getByRole('button', { name: 'Explore the demo' }).tap();
      await expect(page.getByTestId('counts-group-1')).toHaveText('10 present / 30 planned');
      await expect(page.getByRole('button', { name: 'View Group 1', exact: true })).toHaveAttribute('aria-current', 'page');
    });

    test('upward and downward body swipes scroll without selecting or opening information', async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      const lane = page.getByTestId('lane-group-1');
      const body = lane.locator('.card-select').nth(10);
      await body.scrollIntoViewIfNeeded();
      await idle(page);
      const before = await page.evaluate(() => scrollY);
      await drag(page, cdp, body, -180);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
      await idle(page);
      await untouched(page);
      const visible = lane.locator('.card-select').nth(18);
      await visible.scrollIntoViewIfNeeded();
      await idle(page);
      const downBefore = await page.evaluate(() => scrollY);
      await drag(page, cdp, visible, 180);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(downBefore - 50);
      await idle(page);
      await untouched(page);
    });

    test('a tap that stops a fling does not select a dog', async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      const body = page.getByTestId('lane-group-1').locator('.card-select').nth(10);
      await body.scrollIntoViewIfNeeded();
      await idle(page);
      const before = await page.evaluate(() => scrollY);
      const position = await start(cdp, body);
      for (let step = 1; step <= 5; step++) {
        await page.waitForTimeout(10);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: position.x, y: position.y - step * 35 }],
        });
      }
      // Locate the stop target before releasing so no locator round trip delays
      // the second touch until after the kinetic scroll has already ended.
      const target = await page.evaluate(() => {
        const rect = Array.from(document.querySelectorAll('[data-testid=lane-group-1] .card-select'))
          .map(element => element.getBoundingClientRect()).find(box => box.top > 180 && box.bottom < 650);
        if (!rect) throw new Error('No visible group card during fling');
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await release(cdp);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] });
      await release(cdp);
      await idle(page);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before + 40);
      await untouched(page);
    });

    test('short unlatching drags and cancelled touches do not activate card actions', async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      const card = page.getByTestId('lane-group-1').getByTestId('card-Archie');
      await card.scrollIntoViewIfNeeded();
      await idle(page);
      // Ten CSS pixels exceeds the card's intent threshold but remains below
      // Chromium's native scroll latch: it would otherwise generate a click.
      for (const selector of ['.card-select', '.info-action', '.arrival-action']) {
        const action = card.locator(selector);
        const before = await page.evaluate(() => scrollY);
        await drag(page, cdp, action, -10, 4);
        expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(3);
        await untouched(page);
        await start(cdp, action);
        await release(cdp, true);
        await untouched(page);
      }
      // Wait beyond the information-hold delay to catch any abandoned timer.
      await page.waitForTimeout(600);
      await untouched(page);
    });

    test('stationary taps toggle once and a stationary hold opens details without selection', async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      const body = page.getByTestId('lane-group-1').getByRole('button', { name: 'Select Archie', exact: true });
      await body.scrollIntoViewIfNeeded();
      await idle(page);
      await start(cdp, body);
      await release(cdp);
      await expect(body).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.dog-card.selected')).toHaveCount(1);
      // Separate intentional taps must not be interpreted as a double-click.
      await page.waitForTimeout(400);
      await start(cdp, body);
      await release(cdp);
      await expect(body).toHaveAttribute('aria-pressed', 'false');
      await page.waitForTimeout(400);
      await start(cdp, body);
      await expect(page.getByRole('dialog')).toBeVisible();
      await release(cdp);
      await expect(page.locator('.dog-card.selected')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Close dialog' }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(body).toHaveAttribute('aria-pressed', 'false');
    });
  });
}
