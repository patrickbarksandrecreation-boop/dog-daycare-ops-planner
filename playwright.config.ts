import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLANNER_TEST_PORT || 5173);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, timeout: 30000,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://browser-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_browser_test' } },
});
