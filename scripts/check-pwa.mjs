import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright'

// Exercise two real production builds without editing source files or dist/.
const directory = await mkdtemp(join(tmpdir(), 'daycare-pwa-'))
let browser
let server
try {
  for (const version of ['one', 'two']) {
    await build({
      logLevel: 'warn',
      build: { outDir: join(directory, version), emptyOutDir: true },
      plugins: [{ name: 'test-build-marker', transformIndexHtml: html => html.replace('</head>', `<meta name="test-build" content="${version}"></head>`) }],
    })
  }
  let deployed = 'one'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const root = join(directory, deployed)
    let file = resolve(root, `.${pathname}`)
    if (!file.startsWith(`${root}/`) && file !== root) { response.writeHead(403).end(); return }
    if (!extname(file)) file = join(root, 'index.html')
    try {
      const bytes = await readFile(file)
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('.pwa-notice')?.textContent.includes('App saved on this device'))
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await context.request.get(`${url}${manifestHref}`)).json()
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.match(manifest.name, /DEMO \/ NOT LIVE/)
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode()
      return `${image.naturalWidth}x${image.naturalHeight}`
    }, icon.src)
    assert.equal(dimensions, icon.sizes)
  }
  assert(manifest.icons.some(icon => icon.purpose === 'maskable'))
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('sizes'), '180x180')
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.goto(`${url}/demo-board`)
  await page.getByRole('button', { name: 'Catalog', exact: true }).tap()
  await page.getByRole('button', { name: 'Add Alfie Acorn from catalog' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Group 1' }).tap()
  assert.match(await page.locator('.today-total').innerText(), /1\s*\/ 100/)
  await page.reload()
  assert.match(await page.locator('.today-total').innerText(), /0\s*\/ 100/)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await context.setOffline(false)
  const other = await context.newPage()
  await other.goto(url)
  async function addDog(tab) {
    await tab.getByRole('button', { name: 'Catalog', exact: true }).tap()
    await tab.getByRole('button', { name: 'Add Alfie Acorn from catalog' }).tap()
    await tab.getByRole('dialog').getByRole('button', { name: 'Group 1' }).tap()
  }
  await addDog(page)
  await addDog(other)
  const oldKeys = await page.evaluate(async () => {
    const names = await caches.keys(); const cache = await caches.open(names.find(name => name.includes('precache')))
    return (await cache.keys()).map(request => request.url)
  })
  deployed = 'two'
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update() })
  await page.getByRole('button', { name: 'Reload & reset demo' }).waitFor()
  await other.getByRole('button', { name: 'Reload & reset demo' }).waitFor()
  assert.equal(await page.locator('meta[name="test-build"]').getAttribute('content'), 'one')
  assert.match(await page.locator('.today-total').innerText(), /1\s*\/ 100/)
  await page.getByRole('button', { name: 'Reload & reset demo' }).tap()
  await page.waitForFunction(() => document.querySelector('meta[name="test-build"]')?.getAttribute('content') === 'two')
  assert.match(await page.locator('.today-total').innerText(), /0\s*\/ 100/)
  assert.equal(await other.locator('meta[name="test-build"]').getAttribute('content'), 'one')
  assert.match(await other.locator('.today-total').innerText(), /1\s*\/ 100/)
  await other.getByRole('button', { name: 'Reload & reset demo' }).tap()
  await other.waitForFunction(() => document.querySelector('meta[name="test-build"]')?.getAttribute('content') === 'two')
  const newKeys = await page.evaluate(async () => {
    const names = await caches.keys(); const cache = await caches.open(names.find(name => name.includes('precache')))
    return (await cache.keys()).map(request => request.url)
  })
  const oldHtml = oldKeys.find(key => key.includes('/index.html'))
  assert(oldHtml && !newKeys.includes(oldHtml), 'Outdated HTML revision must be removed')
  await context.setOffline(true)
  await page.reload()
  assert.equal(await page.locator('meta[name="test-build"]').getAttribute('content'), 'two')
  assert.equal(errors.length, 0, errors.join('\n'))
  await context.close()
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const desktopPage = await desktop.newPage()
  await desktopPage.goto(url)
  await desktopPage.getByRole('heading', { name: 'Dog catalog' }).waitFor()
  assert(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert(await desktopPage.getByText('DEMO / NOT LIVE', { exact: true }).isVisible())
  await desktop.close()
  // Narrow Android-sized and iPhone-sized viewports; these are not physical-device tests.
  for (const width of [360, 390]) {
    const phone = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })
    const tab = await phone.newPage()
    const failures = []
    tab.on('pageerror', error => failures.push(error.message))
    tab.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`) })
    await tab.goto(url)
    await tab.waitForFunction(() => document.querySelector('.pwa-notice')?.textContent.includes('App saved on this device'))
    await addDog(tab)
    await tab.getByRole('button', { name: 'Move Alfie Acorn from catalog' }).tap()
    await tab.getByRole('dialog').getByRole('button', { name: 'Group 2' }).tap()
    await tab.getByRole('button', { name: 'Groups', exact: true }).tap()
    assert(await tab.getByRole('button', { name: 'View Group 1, 0 dogs', exact: true }).isVisible())
    await tab.getByRole('button', { name: 'View Group 2, 1 dogs', exact: true }).tap()
    await tab.getByLabel('Search selected roster').fill('DOG-001')
    assert.equal(await tab.locator('.roster-panel .dog-list li').count(), 1)
    assert(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(failures.length, 0, failures.join('\n'))
    await phone.close()
  }
  console.log('PASS: manifest/icons, mobile + desktop production launch, offline deep-link/reload, reset labels, two-version update prompt, tab isolation, obsolete-cache cleanup and updated offline launch.')
  console.log('PASS: 360px and 390px touch add/move/search, placement counts, no horizontal overflow, no missing assets or page errors.')
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
