# Server communication optimisation

Measured 11 October 2026 against the existing Supabase project from a local Chromium browser. The operational Monday roster was not changed.

## Changes

- Fresh staff-profile and board requests run in parallel. Staff membership and board permissions are still checked by the server on every refresh.
- Session lookup uses the SDK's local session instead of an additional Auth user request. The session's user ID selects the own-profile row; it does not authorize a request.
- A date is prepared once per repository session; failed preparations can retry. Every refresh still fetches current board state.
- Private signed photo URLs are reused in memory for 55 minutes, with the existing one-hour expiry. Changed paths are signed again. No private roster or URLs are stored in browser persistence.
- Realtime updates are coalesced over 60 milliseconds. Subscription readiness no longer sends a duplicate change notification. Updates during a write are reconciled after its response; events during reconciliation still schedule fresh reads.
- Caches clear on sign-out or identity change. Polling, focus recovery, write confirmation, server conflict checks and offline gating remain.

## Measurements

Same browser/network, synthetic test date 2035-10-15:

| Refresh | Samples (ms) | Median (ms) |
|---|---|---|
| Original five-request sequence | 2364, 1732, 1630 | 1732 |
| Optimised repeat refresh | 343, 349, 320 | 343 |
| Optimised first refresh | 1501 | 1501 |

Repeat refresh was about 80% faster and used two parallel server requests instead of five sequential requests. First load still prepares the date and signs uncached photos. These are local-frontend measurements against the hosted backend, not a production deployment benchmark or a guarantee on workplace connectivity.

Run the opt-in comparison with a local Vite server and an explicitly chosen fictional test date:

```powershell
$env:LIVE_TEST_CONFIRM='synthetic-pilot'
$env:TEST_PLAN_DATE='2035-10-15'
$env:TEST_APP_URL='http://127.0.0.1:5175'
node tests/performance.mjs
```

This creates a fictional staff session and ensures the test date exists; it does not create, move or change attendance for any dog. Only timings are saved.

## Verification

- 50 model/configuration/PostgreSQL/repository tests passed, including photo renewal, new photo paths, failed request retries, identity changes and permission denial.
- 13 Chromium workflow tests passed.
- TypeScript and production build passed.
- Two ordinary staff Chromium sessions against the hosted database passed on fictional date 2035-10-16: creation/photo loading, synchronized refresh, concurrent move conflict, independent attendance, history write denial, manager-action denial and offline recovery.
- The first live check timed out locating the database button after reload while source was being edited. A diagnostic rerun after edits stopped passed the complete harness. No operational data was changed; the fictional test records remain.
- Supabase read-only count verification still found 54 bookings on 12 October.
- Repeat shared-session acceptance against the deployed origin after release; the measurements above remain local-frontend evidence.
