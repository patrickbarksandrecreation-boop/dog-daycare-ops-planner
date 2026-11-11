import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 664 } });
async function seed(page: Page) {
  await page.evaluate(() => {
    const control = (window as any).control;
    const names = ['Zulu White', 'Beta Purple', 'Alpha Purple', 'Charlie Blue', 'Delta Green', 'Echo Yellow'];
    const colours = ['#ffffff', '#e3d7f5', '#e3d7f5', '#cfe5fa', '#d5edce', '#fff1ae'];
    control.state.dogs.slice(0, 6).forEach((dog: any, i: number) => { dog.name = names[i]; dog.card_colour = colours[i]; });
    control.state.assignments.slice(0, 6).forEach((a: any) => { a.group_id = 'group-1'; });
    control.changed();
  });
  await expect(page.getByTestId('counts-group-1')).toContainText('6 planned');
  await page.getByRole('button', { name: 'View Group 1', exact: true }).click();
}
async function open(page: Page) {
  await page.goto('/tests/fixtures/loading.html?photoDelay=1&readDelay=1');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await seed(page);
}
const order = (page: Page, selector = '[data-testid="lane-group-1"] .dog-card') => page.locator(selector).evaluateAll(cards => cards.map(card => card.getAttribute('data-dog-id')));
const colour = ['demo-2', 'demo-1', 'demo-5', 'demo-4', 'demo-3', 'demo-0'];
const alphabetical = ['demo-2', 'demo-1', 'demo-3', 'demo-4', 'demo-5', 'demo-0'];

test('both views share colour/alphabetical sorting and preserve selection, counts and unassigned order', async ({ page }) => {
  await open(page);
  const unassigned = await order(page, '[data-testid="lane-unassigned"] .dog-card');
  await page.getByRole('button', { name: 'Select Beta Purple', exact: true }).click();
  await page.getByLabel('Sort groups', { exact: true }).selectOption('colour');
  await expect.poll(() => order(page)).toEqual(colour);
  await expect(page.getByTestId('selection-count')).toContainText('1 selected');
  await page.getByRole('button', { name: 'Fit Group 1 on screen', exact: true }).click();
  await expect.poll(() => order(page, '.overview-card')).toEqual(colour);
  await expect(page.getByLabel('Sort groups')).toHaveValue('colour');
  await page.getByLabel('Sort groups').selectOption('alphabetical');
  await expect.poll(() => order(page, '.overview-card')).toEqual(alphabetical);
  await page.getByRole('button', { name: 'Back to operations' }).click();
  await expect(page.getByLabel('Sort groups')).toHaveValue('alphabetical');
  await expect.poll(() => order(page)).toEqual(alphabetical);
  expect(await order(page, '[data-testid="lane-unassigned"] .dog-card')).toEqual(unassigned);
  await expect(page.getByTestId('selection-count')).toContainText('1 selected');
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await page.getByLabel('Sort groups').selectOption('manual');
  await expect.poll(() => order(page)).toEqual(['demo-0', 'demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5']);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
});

test('live colour/name changes and newly assigned dogs automatically take their sorted position', async ({ page }) => {
  await open(page);
  await page.getByLabel('Sort groups').selectOption('colour');
  await page.getByRole('button', { name: 'Fit Group 1 on screen', exact: true }).click();
  await page.evaluate(() => {
    const control = (window as any).control;
    Object.assign(control.state.dogs[0], { name: 'Aaron Purple', card_colour: '#e3d7f5' });
    Object.assign(control.state.dogs[6], { name: 'Aardvark Yellow', card_colour: '#fff1ae' });
    control.state.assignments[6].group_id = 'group-1';
    control.changed();
  });
  await expect.poll(() => order(page, '.overview-card')).toEqual(['demo-0', 'demo-2', 'demo-1', 'demo-6', 'demo-5', 'demo-4', 'demo-3']);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(0);
});

test('sort preference survives reload', async ({ page }) => {
  await open(page);
  await page.getByLabel('Sort groups').selectOption('alphabetical');
  await page.reload();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(page.getByLabel('Sort groups')).toHaveValue('alphabetical');
  await seed(page);
  await expect.poll(() => order(page)).toEqual(alphabetical);
});
