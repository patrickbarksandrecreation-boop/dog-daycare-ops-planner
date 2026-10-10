# Dog Daycare Operations Planner

Phone-friendly standalone demo with 100 deterministic fictional dogs. **DEMO / NOT LIVE:** all changes are in memory in the current browser tab and reset on reload. No backend, accounts, real records, or shared updates. Browser access needs no installation. The production app can optionally be added to the home screen and opened offline after its first successful online load and app-cache setup.

Start with `docs/PRODUCT.md` and `docs/ROADMAP.md`. Codex should follow `AGENTS.md` for concise, scoped implementation. The early pilot uses 100 fictional dogs and is not a live safety record.

## Develop

Use Node.js 22.12+ (verified with Node 24) and npm. No environment variables or credentials are required.

```sh
npm ci
npm run dev
```

Use the catalog to add dogs to today's selection and choose a group. Use **Move** to change a dog's sole placement or mark it unassigned. Headings are editable; group identity stays stable. On phones, switch between Catalog, Groups, and Roster. The header count opens all selected dogs.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Build output is in `dist/`. `npm run preview` serves it locally. The service worker is enabled only in production builds, over HTTPS (or localhost for testing). No deployment has been performed. See `docs/STATUS.md` for verified checks and the next slice.

## Open on a phone

- Open the shared **HTTPS URL supplied after an approved deployment** in your browser. No app store, account, or installation is required. The same URL opens the demo on desktop.
- **Android / Chrome:** open the browser menu and choose **Add to Home screen** or **Install app**, if offered.
- **iPhone / Safari:** choose **Share → Add to Home Screen → Add** (enable **Open as Web App** if offered). Menu wording varies by OS version.
- Always expect **DEMO / NOT LIVE**. Each tab/device has its own temporary fictional board; this is not shared live attendance. Installing does not save dogs or headings.

## Offline use and updates

The app caches only its versioned HTML, scripts, styles, manifest and original icon assets. The “App saved on this device” notice confirms offline setup. First access requires a connection; browser storage eviction or clearing site data can remove offline support. Offline opening/reloading starts an empty demo, just like an online reload. Dog selections and headings are never written to storage.

Updates are checked when opening or returning focus to the app online. A new version waits while you work. **Reload & reset demo** applies it and explicitly discards that tab's temporary board; accepting in one tab does not automatically reload another. Closing all app tabs/windows also allows a waiting version to activate. Old app-cache revisions are removed during activation. Browser/home-screen installation remains optional.

## Deploy to Netlify — manual, approval required

1. Review the `feat/m2-pwa-deployment` branch and approve the first public deployment. No hosting credentials or environment secrets are needed by the app.
2. In Netlify, first look for an existing project connected to this repository and reuse it. Only if none exists, import the repository. Select the approved branch without merging to `main`. Use the repository root as base directory; `netlify.toml` sets Node 24, build command `npm run build`, and publish directory `dist`.
3. Deploy, then copy the **actual HTTPS URL shown by Netlify**. Confirm its HTTPS certificate is active and HTTP redirects to HTTPS; if using a custom domain, complete Netlify's DNS/TLS setup and enforce HTTPS before sharing. Root-path hosting is required by the manifest and worker scope.
4. Open that exact URL on Android and iPhone. Check the demo banner, add/move a fictional dog, reload (expected empty board), optionally add to the home screen, and reopen offline after the app-saved notice. Record the verified URL and results in `docs/STATUS.md` before calling M2's hosted-phone acceptance complete.

The configuration includes a non-forced SPA fallback (real assets take precedence), revalidation for HTML/manifest/icons, no-store for the worker, and immutable caching for Vite's content-hashed assets. Local preview does not emulate Netlify's CDN headers or prove HTTPS hosting.

## PWA regression check

```sh
# Only if no system Chromium is available:
npx playwright install chromium
npm run test:pwa
```

This uses system Chromium when available (or `CHROMIUM_PATH`), otherwise Playwright's Chromium. It builds two versions into a temporary directory and tests manifest/icon dimensions, mobile/desktop launch, offline deep-link/reload, update consent, preservation of another tab's board, and old-cache cleanup. It does not publish or change `dist/`. The icons are original geometric paw artwork from `public/icons/icon.svg`, with PNG exports for install and Apple compatibility.
