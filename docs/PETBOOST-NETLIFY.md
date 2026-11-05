# Hosting the AI Petboost sync on Netlify

The current design is [AI Petboost booking and arrival sync](PETBOOST-SYNC.md). The old persistent Linux worker and per-appointment scraper have been removed. Existing Netlify endpoints, manual dispatch, six weekday slots, encrypted session storage and transactional leases are retained as transport for the Terra call.

## Server configuration

Production Functions require `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PETBOOST_WORKSPACE_ID`, `PETBOOST_BUSINESS_BUTTON` (exact accessible name, observed `Barkley Park Enterprise`), `PETBOOST_SESSION_KEY` (base64 of 32 random bytes), `PETBOOST_DISPATCH_SECRET` (separate random secret, at least 32 characters), **`OPENAI_API_KEY`** and `PETBOOST_SYNC_ENABLED`.

Set `VITE_PETBOOST_NETLIFY=true` for the existing frontend dispatch. It is a public feature flag. Never prefix secrets with `VITE_`, commit them, or put them in chat. Terra and low reasoning are fixed in code; configuration cannot silently select another model.

## Release and verification

1. Apply the reviewed additive `petboost_ai_arrivals` migration against the actual cloud ledger. It invalidates the legacy verification stamp. Keep imports disabled pending acceptance; preserve existing workplace admission requirements.
2. Configure the API key in production Functions and the trusted local setup environment. Publish the reviewed code with imports disabled. This step does not require changing the hosting plan or buying a browser service.
3. If the saved Petboost session needs renewal, run `node --env-file=.env.petboost-setup scripts/petboost/seed-session.mjs` on the trusted desktop and sign in personally. The helper proves both initial and independently restored AI reads before uploading ciphertext. No plaintext session file is written. The local environment also needs the server settings and `PETBOOST_SITE_URL`.
4. Run `node --env-file=.env.petboost-setup scripts/petboost/verify-netlify.mjs`. It correlates the protected read-only background job's run ID and database outcome. A 202 acknowledgement is not success. This executes Terra on the actual host but does not import bookings or update attendance.
5. Only after hosted verification and the existing admission requirements pass, enable DB/Functions sync and deploy the environment change. Verify manual sync and the next scheduled run, including automatic arrivals, unchanged groups/order, cancellation flags and independent board refresh.

Both production background endpoints require the internal dispatch secret. The manual endpoint separately validates the Supabase user and workspace membership. Published-production context guards prevent preview jobs. `petboost_sessions` stores authenticated AES-256-GCM ciphertext bound to the exact workspace/business. Renewing login fences older jobs and clears hosted verification. No session endpoint exposes plaintext.

Pinned serverless Chromium/Playwright dependencies remain packaged only with background functions. Images/media/fonts are skipped. Browser execution and the Terra request share the seven-minute reader deadline and eight-minute DB lease. Failed reads never apply an empty snapshot. API failure has no deterministic scraper or alternate-model fallback.

Two UTC cron dispatchers preserve Brisbane weekdays at 06:30–11:30 hourly (`30 20-23 * * 0-4` and `30 0-1 * * 1-5`). There is no always-on worker or duplicate scheduler.

## Known hosting limitation

The earlier hosted deterministic reader failed near the 1 GB memory limit. The new bulk-list read avoids per-appointment navigation, but this does not prove hosted memory/login/model acceptance. Check the actual hosted job before activation. No plan change or new subscription is implied or performed.

OpenAI API token charges, Netlify compute and Supabase usage are separate. This change makes no fixed cost/runtime promise. Setup/read-only verification also invokes the model. Physical-phone and unattended delivery checks remain distinct from synthetic tests.

## Owner-requested post-deploy check

The local `petboost-verify` build plugin dispatches the protected read-only endpoint from `onSuccess`, after production publication. It uses the existing build-scoped server settings inside Netlify; no keys are copied into chat, local files, browser code or logs. Preview/local/other-branch builds skip it. The fixed `verification_id` in `netlify.toml` is a correlation ID, not a credential; after that ID has acquired the DB verification lease, later deploys skip it. A fresh owner-requested check can use a new ID. Dispatch acknowledgement is not verification success: inspect the correlated database result and hosted logs. The plugin never enables sync or imports bookings.

## Reconnect without a local production secrets file

Use `scripts/petboost/connect-session.mjs` with an owner-issued `PETBOOST_SETUP_TOKEN` when `.env.petboost-setup` is unavailable. The existing direct seed helper remains available for trusted desktops that already have their private configuration.

The reconnect helper uses the installed Edge browser on Windows (Chrome otherwise), a fresh in-memory browser context, the fixed HTTPS planner endpoint and the exact business name supplied by that endpoint. The user signs in locally. Only Petboost/Auth0 cookies and storage are sent over HTTPS; no plaintext session file is written. The server encrypts the state with its existing key. Supabase, encryption, dispatch and OpenAI keys remain on Netlify.

An owner/service issues a random 32-byte hex code, saves only its SHA-256 hash through `prepare_petboost_session_setup` and gives the one-use value to the operator privately. Codes expire in at most 60 minutes. Anonymous/signed-in frontend roles cannot mint, inspect or consume these database capabilities directly. The public endpoint requires the matching bearer code; it is disabled outside published production. Invalid, expired, consumed, cross-workspace and oversized requests cannot replace a session. The replacement and code consumption share a transaction, invalidate old verification and fence older workers.

After successful upload the endpoint dispatches the existing protected read-only hosted test, returning its non-secret verification ID. A failed dispatch does not turn a successful upload into a retryable token: the owner can request verification separately. Reconnect never enables sync or imports dogs. Issuing a new code invalidates the previous code; tokens, login states and production secrets must never be committed or logged.
