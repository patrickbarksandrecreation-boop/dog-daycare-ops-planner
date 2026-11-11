import { test, expect } from '@playwright/test';

for (const width of [360, 390, 430]) test(`handler controls are reachable and touch sized at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  const first = page.getByTestId('lane-group-1').getByTestId('card-Archie');
  await expect(first).toBeInViewport();
  for (const action of ['Information for Archie', 'Mark Archie present']) {
    const box = (await first.getByRole('button', { name: action, exact: true }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const initial = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('.current-view .dog-card')].filter(e => {
      const box = e.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
    }).length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(initial.visible).toBeGreaterThanOrEqual(9);
  expect(initial.overflow).toBe(false);
  await first.getByRole('button', { name: 'Select Archie', exact: true }).click();
  const tray = page.locator('.move-tray');
  await expect(tray).toBeInViewport();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(tray).toBeInViewport();
  await tray.getByRole('button', { name: 'Move selection to Group 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Group 1', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'View Group 2', exact: true }).click();
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
  await expect(page.getByTestId('selection-count')).not.toContainText('1 selected');
  await expect(page.getByTestId('present-count')).toHaveText('31');
});

test('board search locates dogs across groups while Unassigned search stays separate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.getByLabel('Find a dog on the board').fill('Hazel Acorn');
  await expect(page.getByRole('button', { name: 'View Group 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('card-Hazel Acorn')).toBeVisible();
  await expect(page.locator('.current-view .dog-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear board search', exact: true }).click();
  await expect(page.locator('.current-view .dog-card')).toHaveCount(30);
  await page.getByRole('button', { name: 'View Unassigned', exact: true }).click();
  await page.getByLabel('Search unassigned dogs').fill('Winston');
  await expect(page.getByTestId('lane-unassigned').locator('.dog-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Group 1', exact: true }).click();
  await expect(page.locator('.current-view .dog-card')).toHaveCount(30);
  await expect(page.getByTestId('booked-count')).toHaveText('100');
});

for (const width of [768, 1024]) test(`touch tablets keep usable card actions at ${width}px`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 1024 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('Demo scenario').selectOption('planned');
    await page.getByRole('button', { name: 'Explore the demo' }).click();
    for (const name of ['Archie', 'Frankie Dune']) {
      for (const action of [`Information for ${name}`, `Mark ${name} present`]) {
        const button = page.getByRole('button', { name: action, exact: true });
        await expect(button).toBeVisible();
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  } finally { await context.close(); }
});
