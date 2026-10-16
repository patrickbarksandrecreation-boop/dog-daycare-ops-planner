import { test, expect } from '@playwright/test';

test('login and remembered-session reload show loading, then failure/retry or empty board', async ({ page }) => {
  let enrolled = false, fail = false, reads = 0, signups = 0, joins = 0;
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', is_anonymous: true };
  const profile = { id: user.id, display_name: 'Synthetic staff', role: 'staff', workspace_id: 'workspace' };
  await page.route(/https:\/\/browser-test\.supabase\.co\//, async route => {
    const url = route.request().url();
    let data: unknown = null, status = 200;
    if (url.includes('/auth/v1/signup')) {
      signups++;
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      data = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp, role: 'authenticated' })}.test`,
        refresh_token: 'test-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
    } else if (url.includes('/staff_profiles')) {
      data = enrolled ? (route.request().headers().accept?.includes('vnd.pgrst.object') ? profile : [profile]) : null;
    } else if (url.includes('/rpc/join_synthetic_pilot')) { enrolled = true; joins++; }
    else if (url.includes('/rpc/planning_snapshot')) {
      reads++; await new Promise(resolve => setTimeout(resolve, 900));
      if (fail) { status = 503; data = { message: 'Temporary board failure' }; }
      else data = { day: { id: 'day', local_date: route.request().postDataJSON().p_date, revision: 0, workspace_id: 'workspace' },
        groups: [{ group_id: 'group-1', displayed_name: 'Group 1', display_order: 1, run_version: 1 }], dogs: [], assignments: [], rules: [] };
    } else if (url.includes('/rpc/current_workspace')) data = 'workspace';
    else if (url.includes('/petboost_sync')) data = null;
    else if (!url.includes('/rpc/ensure_planning_day')) throw new Error(`Unexpected request: ${new URL(url).pathname}`);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.routeWebSocket(/browser-test\.supabase\.co/, socket => { socket.onMessage(() => {}); });
  await page.goto('/');
  await page.getByLabel('Display name', { exact: true }).fill('Synthetic staff');
  await page.getByRole('button', { name: 'Join the shared pilot', exact: true }).click();
  await expect(page.getByText('Opening the daily board…')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.getByText('No dogs booked for this day. Book a dog using Dog database.')).toBeVisible();
  fail = true;
  await page.reload();
  await expect(page.getByText('Opening the daily board…')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Temporary board failure');
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Opening the daily board…')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  await expect(page.getByTestId('booked-count')).toHaveText('0');
  expect(signups).toBe(1); expect(joins).toBe(1); expect(reads).toBeGreaterThanOrEqual(3);
});
