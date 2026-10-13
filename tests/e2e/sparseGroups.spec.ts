import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) test.describe(mobile ? 'mobile sparse dates' : 'desktop sparse dates', () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, isMobile: mobile, hasTouch: mobile });

  test('group tiles retain crowded-day dimensions on later dates and after dragging', async ({ page, context }) => {
    await page.clock.setFixedTime(new Date('2026-10-12T02:00:00Z'));
    await page.goto('/');
    await page.getByLabel('Demo scenario').selectOption('planned');
    await page.getByRole('button', { name: 'Explore the demo' }).click();
    await expect(page.getByTestId('booked-count')).toHaveText('100');
    const card = page.getByTestId('card-Archie');
    const crowded = (await card.boundingBox())!;
    const photo = (await card.locator('.avatar').boundingBox())!;
    const checkTile = async () => {
      await expect(card).toBeVisible();
      const sparse = (await card.boundingBox())!;
      expect(sparse.width).toBeCloseTo(crowded.width, 0);
      expect(sparse.height).toBe(crowded.height);
      expect((await card.locator('.avatar').boundingBox())!.width).toBeCloseTo(photo.width, 0);
      await expect(card.locator('.dog-name')).toHaveText('Archie');
      await expect(card.locator('.breed-label')).toHaveText('Golden');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };

    for (const [date, names] of [['2026-10-13', ['Archie']], ['2026-10-14', ['Archie', 'Bella']]] as const) {
      await page.getByLabel('Planning date').fill(date);
      await expect(page.getByTestId('booked-count')).toHaveText('0');
      for (const name of names) {
        await page.getByRole('button', { name: 'Dog database', exact: true }).click();
        await page.getByLabel('Search dog database').fill(name);
        await page.getByRole('button', { name: `Book ${name} for day`, exact: true }).click();
        await page.getByRole('button', { name: 'Close dialog' }).click();
        await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
        await page.getByLabel('Move selected dogs to', { exact: true }).selectOption('group-1');
      }
      await checkTile();
    }

    const grip = page.getByRole('button', { name: 'Drag Archie', exact: true });
    await grip.scrollIntoViewIfNeeded();
    const from = (await grip.boundingBox())!;
    const target = mobile ? page.getByRole('button', { name: 'View Group 2', exact: true }) : page.getByTestId('lane-group-2').locator('.group-heading');
    const to = (await target.boundingBox())!;
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + 20 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 15, y: from.y + 30 }] });
      await expect(page.locator('.dog-card.dragging')).toHaveCount(1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(from.x + from.width / 2, from.y + 20);
      await page.mouse.down();
      await page.mouse.move(from.x + 15, from.y + 30, { steps: 4 });
      await expect(page.locator('.dog-card.dragging')).toHaveCount(1);
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 18 });
      await page.mouse.up();
    }
    await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
    await checkTile();
    await page.getByLabel('Planning date').fill('2026-10-12');
    await expect(page.getByTestId('booked-count')).toHaveText('100');
    if (mobile) await page.getByRole('button', { name: 'View Group 1', exact: true }).click();
    await expect(page.getByTestId('lane-group-1').getByTestId('card-Archie')).toBeVisible();
    await checkTile();
  });
});
