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
