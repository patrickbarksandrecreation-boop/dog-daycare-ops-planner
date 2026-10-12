import { test, expect } from '@playwright/test';

for (const blockingPhotos of [true, false]) test(`measures ${blockingPhotos ? 'former blocking' : 'background'} photo pipeline`, async ({ page }) => {
  await page.goto(`/tests/fixtures/loading.html${blockingPhotos ? '?blockingPhotos' : ''}`, { waitUntil: 'domcontentloaded' });
  const earlyRetry = await page.getByRole('button', { name: /Retry/ }).count();
  expect(earlyRetry).toBe(0);
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await expect(page.getByRole('button', { name: 'Mark Alfie present', exact: true })).toBeEnabled();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await page.evaluate(() => { (window as any).control.state.dogs[0].photo_path = 'workspace/dog/replaced.png'; });
  await page.getByRole('button', { name: 'Mark Alfie present', exact: true }).click();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(page.getByTestId('present-count')).toHaveText('1');
  const result = await page.evaluate(() => {
    const c = (window as any).control;
    const time = (name: string) => c.events.find((e: any) => e.name === name).ms;
    return { visible_ms: time('board-visible'), save_ms: time('save-finished') - time('set_attendance'),
      reads: c.reads, signs: c.signs, writes: c.writes, watches: c.watches };
  });
  console.log(JSON.stringify({ pipeline: blockingPhotos ? 'former blocking' : 'background', ...result }));
  expect(result.writes).toBe(1); expect(result.watches).toBe(1);
  if (!blockingPhotos) { expect(result.visible_ms).toBeLessThan(1000); expect(result.save_ms).toBeLessThan(1000); }
});

test('failed loads offer one retry, retry hides it, success distinguishes an empty day', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html?fail');
  await expect(page.getByText('Unable to open the daily board.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(1);
  await page.evaluate(() => { (window as any).control.fail = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await page.getByLabel('Planning date', { exact: true }).fill('2038-10-20');
  await expect(page.getByText('No dogs booked for this day. Book a dog using Dog database.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('photo latency cannot block writes and late photos cannot overwrite a remote edit', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html?photoDelay=4000', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Mark Alfie present', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Mark Alfie present', exact: true }).click();
  await expect(page.getByTestId('present-count')).toHaveText('1', { timeout: 2000 });
  await page.evaluate(() => {
    const c = (window as any).control;
    c.state.assignments[1].attendance_status = 'present'; c.state.assignments[1].version++;
    c.changed();
  });
  await expect(page.getByTestId('present-count')).toHaveText('2');
  await expect(page.getByTestId('card-Alfie').locator('img')).toHaveCount(1);
  await expect(page.getByTestId('present-count')).toHaveText('2');
  expect(await page.evaluate(() => (window as any).control.signs)).toBe(1);
});

test('ambiguous save refreshes committed state without replaying the write; conflict preserves other staff changes', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html');
  await expect(page.getByRole('button', { name: 'Mark Alfie present', exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as any).control.ambiguous = true; });
  await page.getByRole('button', { name: 'Mark Alfie present', exact: true }).click();
  await expect(page.getByTestId('present-count')).toHaveText('1');
  await expect(page.getByRole('alert')).toContainText('Response lost');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
  await page.evaluate(() => {
    const c = (window as any).control; c.ambiguous = false;
    c.state.assignments[1].version++; c.state.assignments[1].group_id = 'group-2';
  });
  await page.getByRole('button', { name: 'Mark Archie present', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Another staff member changed');
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
  await expect(page.getByTestId('present-count')).toHaveText('1');
});

test('focus bursts coalesce, but an event during a read forces a fresh snapshot', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html');
  await expect(page.getByRole('button', { name: 'Mark Alfie present', exact: true })).toBeEnabled();
  // Wait until the subscription catch-up read has completed.
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => (window as any).control.reads);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).control.reads)).toBe(before + 1);
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    const c = (window as any).control; c.state.assignments[0].attendance_status = 'present'; c.changed();
  });
  await expect(page.getByTestId('present-count')).toHaveText('1');
  expect(await page.evaluate(() => (window as any).control.reads)).toBe(before + 3);
});

test('duplicate clicks write once and a failed reconciliation gates editing until retry succeeds', async ({ page }) => {
  await page.goto('/tests/fixtures/loading.html');
  const arrive = page.getByRole('button', { name: 'Mark Alfie present', exact: true });
  await expect(arrive).toBeEnabled();
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await page.evaluate(() => { (window as any).control.fail = true; });
  await arrive.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('alert')).toContainText('Injected read failure');
  await expect(arrive).toBeDisabled();
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
  await page.evaluate(() => { (window as any).control.fail = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('present-count')).toHaveText('1');
  await expect(page.locator('.connection')).toHaveText('Live · saved');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).control.writes)).toBe(1);
});
