// Local synthetic latency benchmark. Run against a Vite server; never contacts the hosted database.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] || 'after';
const origin = process.env.TEST_APP_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ executablePath: process.env.PLANNER_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const results = [];
try {
  for (const readDelay of [200, 800]) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto(`${origin}/tests/fixtures/loading.html?photoDelay=1&readDelay=${readDelay}`);
      await page.waitForFunction(() => document.querySelector('.connection')?.textContent === 'Live · saved');
      await page.getByRole('button', { name: 'Select Alfie', exact: true }).click();
      await page.evaluate(() => {
        const start = performance.now();
        window.speedSample = {};
        const observe = () => {
          const result = window.speedSample;
          if (result.feedback_ms === undefined && document.querySelector('[data-testid="lane-group-1"] [data-testid="card-Alfie"]')) result.feedback_ms = performance.now() - start;
          if (result.feedback_ms !== undefined && result.next_dog_ready_ms === undefined && !document.querySelector('[aria-label="Select Archie"]')?.disabled) result.next_dog_ready_ms = performance.now() - start;
          if (result.feedback_ms !== undefined && document.querySelector('.connection')?.textContent === 'Live · saved') {
            result.confirmed_ms = performance.now() - start;
            observer.disconnect();
          }
        };
        const observer = new MutationObserver(observe);
        observer.observe(document.getElementById('root'), { subtree: true, childList: true, attributes: true, characterData: true });
        const chooser = document.querySelector('[aria-label="Move selected dogs to"]');
        chooser.value = 'group-1'; chooser.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => window.speedSample?.confirmed_ms !== undefined);
      samples.push(await page.evaluate(() => ({ ...window.speedSample, reads: window.control.reads, writes: window.control.writes,
        active_view: document.querySelector('.group-tabs [aria-current="page"]')?.getAttribute('aria-label') })));
      await page.close();
    }
    const median = key => [...samples].map(s => s[key]).sort((a, b) => a - b)[2];
    results.push({ read_delay_ms: readDelay, write_delay_ms: 150, samples, median: Object.fromEntries(['feedback_ms', 'next_dog_ready_ms', 'confirmed_ms'].map(key => [key, Math.round(median(key))])) });
  }
} finally { await browser.close(); }
await mkdir('docs/ui-speed-review', { recursive: true });
await writeFile(`docs/ui-speed-review/${label}-timings.json`, JSON.stringify({ label, fixture: '100 fictional dogs; real cloud repository; controlled in-process service', results }, null, 2) + '\n');
console.log(JSON.stringify({ label, results: results.map(({ samples, ...r }) => r) }, null, 2));
