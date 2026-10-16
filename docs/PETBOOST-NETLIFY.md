# Petboost sync on Netlify — no Petboost API

This is the preferred deployment alternative to the persistent Linux worker. Netlify starts a temporary headless Chromium browser for each job. It restores encrypted Petboost authentication from Supabase, reads today's calendar and pet links through the same read-only reader, saves refreshed session state encrypted, and imports atomically. No Petboost API, office computer left awake, new browser-service account or additional hosting subscription is required by this design. Netlify plan/compute allowances still apply. The original Linux worker remains an alternative; never activate both schedulers for one workspace.

## Current evidence and dependencies

The signed-in cloud browser established that the page route, calendar counts and pet IDs are accessible. That session cannot be silently transferred to Netlify. A separate secure session-seeding step and a successful **read-only verification executed on Netlify itself** are required. An account can expire or Petboost can reject the hosting environment; these remain live acceptance checks, not assumptions.

The current app is a synthetic, openly enrollable workspace. The importer rejects that workspace. Controlled workplace admission and the relevant review remain prerequisites to real imports. No access controls were weakened, production migration applied or schedule activated during this preparation.

Recovery inspection on 16 October confirmed signed-in access to the existing Netlify project and its Personal plan. Only the public Supabase frontend settings are configured; no worker settings or sync migrations are installed. Session seeding, hosted Chromium and live read verification remain outstanding. A successful local function bundle does not establish a successful hosted login.

## Runtime and storage

- Two UTC cron functions cover exactly Brisbane Monday–Friday 06:30, 07:30, 08:30, 09:30, 10:30 and 11:30: `30 20-23 * * 0-4` and `30 0-1 * * 1-5`. Each invokes the protected background function. There is no once-a-minute browser or queue polling job.
- The manual button first queues through the existing membership-checked RPC. An authenticated Netlify endpoint verifies the Supabase user on the server and current workspace membership, then dispatches the pending job. The browser sends only its existing Supabase access token, never a Petboost password or session.
- Background endpoints require a random server-only dispatch secret before any DB claim or browser launch. Netlify returns 202 before checking the handler, so acknowledgement alone never counts as success. DB status/verification timestamps establish completion.
- Published-production guards come from Netlify's trusted `context.deploy` object. `CONTEXT` is only a build variable and is not assumed to exist in the function runtime. Preview and unpublished deployments cannot run jobs. Production secrets must also be scoped to the production deploy context in Netlify settings.
- `petboost_sessions` has RLS, no browser or direct service table grants, and service-only access routines. It contains AES-256-GCM ciphertext with a fresh nonce and workspace/business associated data. The 32-byte encryption key resides in Netlify environment settings, outside the database. Do not expose a session download endpoint.
- The packaged Chromium is pinned (`@sparticuz/chromium` 153.0.0 and `playwright-core` 1.63.0). The reader has a seven-minute watchdog and the existing eight-minute fenced DB lease. The browser is closed on every outcome. Background functions allow up to fifteen minutes, but the importer never accepts an expired lease.
- Session renewal explicitly clears the Netlify verification stamp. The database refuses Netlify-mode imports until verification passes again. Encrypted session refresh during a valid import preserves the stamp. Verification never imports bookings or updates attendance.
- Verification and imports share the fenced database lease. Renewing a session cancels the prior lease, preventing stale jobs from overwriting the new login or marking it verified. Each verification request carries a unique ID; the desktop helper ignores outcomes from older requests.

## Deployment sequence

1. Review PR #12 and configure controlled workplace admission. Apply both additive sync migrations against the project's actual cloud ledger, not by blindly replaying historical filenames. Review permissions/advisors. Create a disabled `petboost_sync` row for the correct workspace and set `worker_mode='netlify'`.
2. In the Netlify project, set these **production-context** server environment variables through the UI/CLI. Include Functions scope when the plan supports scopes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PETBOOST_WORKSPACE_ID`, `PETBOOST_BUSINESS_BUTTON` (observed: `Barkley Park Enterprise`), `PETBOOST_SESSION_KEY` (base64 of 32 cryptographically random bytes), `PETBOOST_DISPATCH_SECRET` (a separate random secret of at least 32 characters), and `PETBOOST_SYNC_ENABLED=false`. Add `VITE_PETBOOST_NETLIFY=true` for the frontend build; it is a non-secret feature flag. Never prefix any secret with VITE_. Do not store secrets in netlify.toml, git, build artifacts or chat.
3. Publish the reviewed code with imports disabled. The `netlify.toml` bundle rules include the Chromium binaries. Only the two background functions carry the large browser package; scheduler/manual dispatch functions stay small. Default 1 GB Functions memory is retained to avoid requiring a plan upgrade. Test the real job before changing resource settings. A Pro/Enterprise upgrade must not be assumed or purchased automatically.
4. Seed authentication once from a trusted desktop. Put setup configuration in an ignored private `.env.petboost-setup` file (0600) or a process environment; never echo the values. It needs the same server settings plus `PETBOOST_SITE_URL` set to the published HTTPS site. Run `node --env-file=.env.petboost-setup scripts/petboost/seed-session.mjs` and personally sign in to Petboost in the opened browser. It proves the full reader works in a second isolated context, then uploads only ciphertext. It neither writes a plaintext state file nor imports bookings. The computer can be switched off after setup.
5. Run `node --env-file=.env.petboost-setup scripts/petboost/verify-netlify.mjs`. It asks Netlify's protected read-only background function to restore that session and perform a full real read. It waits for the database's verification result rather than trusting 202. **Keep imports disabled unless this passes.** If Petboost rejects the restored session, do not retry through bot evasion or pretend the deployment works; investigate the sign-in/session compatibility first.
6. Perform hosted synthetic acceptance in an appropriately restricted test workspace and check staff UI status/error delivery. Then enable that workplace's DB config and set `PETBOOST_SYNC_ENABLED=true` in Netlify's production environment; redeploy to apply the environment change. Verify one manual sync and the next scheduled run, including independent staff refresh, cancellation review and unchanged assignments/attendance. The database independently requires the Netlify verification stamp and rejects open enrollment.

At renewal, repeat steps 4–5. No API investigation is required from the user. A sign-in ceremony cannot be eliminated safely when Petboost requires renewed authentication; its frequency is not yet known. Keep the setup environment on a trusted encrypted device or remove it securely when no longer needed. Do not send its contents through chat.

## Costs and availability

There is no dedicated always-on host. The worker consumes existing Netlify Functions compute and ordinary Supabase usage. On credit-based Netlify plans, compute is memory in GB × runtime in hours, charged at 10 credits per GB-hour. For illustration only, 132 scheduled runs/month at **two minutes each and 1 GB** would consume roughly **44 compute credits**, plus dispatcher/manual/deploy/other site usage. This is an estimate, not measured Petboost runtime or a promise that the account's plan covers it. Legacy plans can have different availability/billing; inspect the actual account before activation. No plan upgrade or new charge has been approved or activated.

Sources checked 16 October 2026:

- https://docs.netlify.com/build/functions/scheduled-functions/
- https://docs.netlify.com/build/functions/background-functions/
- https://docs.netlify.com/build/functions/api/
- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/functions/usage-and-billing/
- https://github.com/Sparticuz/chromium
- https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state

## Verification record

Local tests cover encrypted session round trips/tampering/workspace binding, publication guards, dispatch authorization, restored-session refresh, expired-session failures, read-only verification with imports disabled, session-table access denial, renewal invalidation and DB verification gates. The existing reconciliation tests remain applicable.

`netlify functions:build` successfully packaged all five functions locally; browser-carrying bundles were approximately 69 MB each, small dispatchers approximately 664 KB each. The scratch container prevented Chromium archive ownership changes, so local serverless launch was blocked. A dedicated CI smoke command checks the exact packaged Chromium on synthetic HTML; this must pass before reporting runtime compatibility. Full hosted authenticated Netlify verification remains separate.
