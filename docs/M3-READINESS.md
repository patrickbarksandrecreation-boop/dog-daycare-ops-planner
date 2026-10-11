# M3 readiness — 10 October 2026

> Historical pre-approval audit. The owner subsequently approved anonymous sessions with a display name, cloud changes and deployment. Migrations 001–004 and anonymous enrollment are now applied. [ANONYMOUS-PILOT.md](ANONYMOUS-PILOT.md) supersedes the authentication options and release approvals below; [STATUS.md](STATUS.md) records current evidence and outstanding checks.

## Verified state and branch comparison

- Read-only Supabase checks: `Dog-daycare-op-manager`, ref `pkvvxutryhordwphlxof`, ACTIVE_HEALTHY, PostgreSQL 17.11. Public tables: none. Applied migrations: none. Security advisor: no findings on the empty project; this does not validate the proposed schema.
- Fetched GitHub main. `codex/dense-planning-attendance` is one commit (`f972acb`) beyond main's `9ad7c25`. It replaces the earlier memory-only npm/PWA implementation with the approved dense planner, Supabase integration and pnpm setup (59 changed files). Main retains the earlier implementation.
- Actual local branch is `codex/m3-scoped-persistence`, currently based on `f972acb`. Prior M3 work, migrations 003–004 and runs/markers are **uncommitted local changes**, not yet on the remote development branch. Preserved, not duplicated or discarded. The latest frontend requires **001 → 002 → 003 → 004**; deploying remote f972acb alone does not include audit history or runs.

## Database audit

001 enables RLS on all application tables; own-profile reads and staff/manager membership checks gate access. Explicit SELECT and EXECUTE grants work with Supabase's newer deny-by-default Data API defaults. Direct operational writes, anonymous execution and internal-helper execution are denied. SECURITY DEFINER RPCs deliberately bypass table RLS for atomic writes, so their explicit authorization, empty search paths and restricted grants are essential. No authorization uses editable user metadata.

Moves lock the planning-day row, validate assignment version and destination membership, calculate destination order from server rows and increment the day revision atomically. 002 retains that design, adds independent attendance, blocks movement of Departed dogs and prevents deletion of received history. Null/stale versions fail. A losing stale request must refresh; the client does not blindly retry it. Master dog edits and group renames remain last-writer-wins; this is a limitation outside the movement concurrency guarantee.

001–002 are a **single-workplace** schema with workplace-wide private-photo access. They store only the last editor/time, not an append-only audit. The smallest audit addition is a table plus an assignment trigger in the existing transaction, with scoped read access and denied client writes/edits/deletes. That implementation already exists in local **003**, together with previously requested workspace isolation. Preserve it: no new service, event queue or duplicate audit system is necessary. Events retain actor/name, dog/day/assignment, old/new group/status, version and server time. History starts at migration application; exact reorder ranks and group-run/marker edits are not audited. Database owners can disable triggers, so this is not tamper-proof compliance logging.

All migrations are once-only transactional SQL intended for Supabase's Auth/Storage schemas and existing `supabase_realtime` publication. Local tests stub those services; actual hosted compatibility remains an acceptance gate. 001–002 were not rewritten. Check advisors again after approved application. SQL Editor execution alone does not populate the CLI migration ledger: choose SQL Editor with an application record, or a consistent CLI/MCP migration workflow, and do not later replay already-applied files blindly.

## Authentication decision — approval required

| Option | Staff experience | Tradeoff |
|---|---|---|
| **Email OTP + persistent session (recommended)** | Enter email/code once per browser, then reopen while session remains valid | Administrator provisions Auth user + membership once; requires reliable email delivery |
| Magic link + persistent session | Email link once per browser | Small UI change, but link can open the wrong browser/app; redirect allowlist and callback/error tests required |
| Anonymous device session + display name | No email/password | Device identity, not verified staff identity; lost browser storage loses access; requires approved enrollment/recovery policy and abuse controls |

Current UI remains email/password; this review did not change onboarding. Supabase browser session persistence and token refresh are now explicit (same SDK defaults). Persistent does not mean permanent: sign-out, cleared storage, revoked refresh sessions and configured session limits require reauthentication. Removing database membership immediately denies new data/RPC requests even with an unexpired token. A display name or anonymous session does not verify employee identity; email access also requires administrator membership approval.

Recommended follow-up after approval: use `signInWithOtp` with `shouldCreateUser:false`, an OTP email template and `verifyOtp`, retain server-controlled membership, and test expired/invalid codes and revocation. Supabase's default email sender is restricted and unsuitable for general staff delivery. First assess an existing approved SMTP provider; any additional provider/cost needs separate approval. No email provider was added.

Sources: [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [session behavior](https://supabase.com/docs/guides/auth/sessions), [SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp), [anonymous sessions](https://supabase.com/docs/guides/auth/auth-anonymous).

## Frontend, realtime and hosting

Set `VITE_SUPABASE_URL=https://pkvvxutryhordwphlxof.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's public publishable key in ignored local `.env` and Netlify's build environment. Never use secret/service-role keys, database passwords or staff credentials in VITE variables. Values are public build assets; changing them requires rebuilding. The build now rejects recognized privileged keys and incomplete configuration without printing keys. This guard supplements, not replaces, secret review.

Netlify now uses `pnpm build`, Node 24, frozen pnpm installation and `dist`; `packageManager` pins pnpm 11.19.0. The pnpm lockfile replaces package-lock.json. Netlify detects pnpm from that lockfile. Existing SPA fallback, immutable hashed assets and no-store worker headers are retained. Ensure Netlify selects the reviewed branch, root base directory and these build-time variables; actual site linkage/build settings have not been inspected. No deployment occurred. [Netlify dependency rules](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

Realtime listens to day revisions and dogs, then fetches a single authoritative snapshot; deletion/clear notifications use the day revision. Subscription establishment, reconnect, focus and 30-second polling reconcile missed changes. Pending refreshes are coalesced, obsolete effect responses ignored, and writes blocked while offline/connecting/busy. A failed response may still represent a committed write; the UI refreshes rather than queueing a duplicate action. Photo URL failures fall back to initials. Offline data is in memory only; the PWA caches the public shell. Current SDK errors remain visible until dismissal/retry, and prolonged transport requests have no app-level timeout: test network interruption and recovery live before pilot acceptance.

## Release checklist

1. **Approve auth option**, enrollment and email-delivery approach; implement/test it before staff rollout. Current password accounts can be used for isolated integration testing if approved.
2. Review and commit the full local delta; do not deploy f972acb expecting later features. Commit/push preparation, cloud migration application, Netlify deployment and merge are separate release actions; no cloud or merge action is authorized here.
3. **Approve application of 001–004** to the confirmed empty project. Keep bucket private, public signup/anonymous access disabled until a chosen onboarding policy is implemented, expose public Data API with the migrations' explicit grants, and verify `planning_days`/`dogs` publication entries.
4. Provision synthetic manager/staff memberships in one workspace and another isolated test workspace; use only fictional dogs/photos. Configure Auth Site URL and exact approved local/Netlify redirects. Avoid unrestricted production redirect wildcards.
5. **Approve a Netlify preview deployment** of the reviewed commit with the public environment variables. Run `tests/live-supabase.mjs` with two test accounts and an empty dedicated date. Credentials belong only in the test process, never VITE or Git.
6. Prove two-browser Realtime, reload/session persistence, independent concurrent moves (one winner), arrival/move races, append-only history, cross-workspace denial, private photos, offline/reconnect and membership revocation. Verify new auth flow and an installed phone/PWA session separately. Current live script uses password test accounts and needs auth-flow coverage when passwordless is chosen.

Local evidence from this review: **39 model/PostgreSQL/config tests passed**, TypeScript and production build passed. The earlier 13 browser tests passed for the preserved GUI; not rerun for documentation/config-only changes. PGlite serializes requests and does not prove separate-connection locking or hosted Realtime. No cloud writes, migrations, deployment or merge were performed.
