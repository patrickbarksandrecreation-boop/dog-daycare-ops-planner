# Workflow verification

The authoritative requirements are in [WORKFLOW.md](WORKFLOW.md), with executed results in [STATUS.md](STATUS.md).

## Automated local checks

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:pwa
```

The 21 model/database tests cover Brisbane dates, morning bookings, separate master records, idempotent booking, independent attendance, group counts, planned/present conflicts, received/departed history protection, four-group data, duplicate-name checks, stale edits, permission restrictions and preservation of a pre-existing record through migration 002.

PGlite executes the actual SQL migrations/functions/constraints/RLS, stubbing the Supabase Auth/Storage service tables and auth.uid(). The Realtime publication statement is omitted because PGlite has no replication process. These tests are not a substitute for hosted Auth, Storage HTTP requests or real concurrent connections.

The 11 Chromium browser tests cover:

- All booked dogs initially Expected and unassigned; separate Unassigned/database searches; duplicate booking prevention.
- Select/reselect/Escape and keyboard-select movement, quick arrival, regrouping without attendance reset.
- Planned → present conflict, departure → no active conflict, retained day record and undo departure.
- Pointer dragging staging → group, group → group, group → staging and grid reorder, including repeated drags.
- New dog, explicit same-name acknowledgement, photo rendering, booking, editing and archival preservation.
- Inline group names/defaults, separate dates, returning to the saved date and attendance-preserving clear.
- Right-click/double-click information.
- Offline allocation/arrival gating, last-board visibility and recovery.
- Measured desktop density, 100% zoom, legible names and no horizontal overflow.
- Fourth-group rendering and movement.
- 390px touch taps, stationary hold, hold cancellation on movement, separate grip dragging to a group tab and no horizontal overflow.

Tests use the explicit in-memory repository. They do not prove cloud persistence; refreshing demo intentionally resets it. Touch tests dispatch Chromium touch events in a mobile context, not physical-device input. Photo rendering tests do not prove remote upload. PWA tests verify the built shell, precached assets and an offline reload; external fonts fall back offline.

Playwright starts a local Vite server if needed. Failure screenshots/traces are in ignored test-results/. Desktop and mobile verification screenshots are written to docs/screenshots/.

## Live Supabase acceptance — not yet run

Use a disposable project with migrations **001 and 002**, one existing manager account, a separate staff account, and an empty dedicated test date. Configure the app against the same project and start it. Supply these only to the test process through your terminal or secret manager; never use VITE variables for account credentials or commit them:

```text
LIVE_TEST_CONFIRM=disposable-project
TEST_SUPABASE_URL=the same URL used by the app
TEST_SUPABASE_KEY=the public publishable/anon key
TEST_MANAGER_EMAIL=existing manager account
TEST_MANAGER_PASSWORD=its password
TEST_STAFF_EMAIL=different existing staff account
TEST_STAFF_PASSWORD=its password
TEST_PLAN_DATE=an unused date, YYYY-MM-DD
TEST_APP_URL=http://127.0.0.1:5173
```

Run `pnpm test:live`. The script uses two independent authenticated browser contexts and API/Realtime clients. It checks anonymous denial, staff/manager restrictions, booking convergence, concurrent same-dog moves, refresh persistence, loss/recovery of connectivity, arrival convergence, regrouping without arrival reset, departure retention/no active card, duplicate prevention for departed records, and private photo access.

It creates one uniquely named fictional dog. Cleanup removes its booking only if still Expected; received/departed records are retained and the master dog is archived. A used test date therefore remains occupied after a successful run; choose a new empty date next time. No broad clear or service-role key is used. Failures can leave test records/photos, and an interrupted network request may still have committed.

## Release checks that require the configured environment

- [ ] Execute the live script successfully after applying 002; verify it preserves a copy of existing saved data.
- [ ] Use two physical devices to book different dogs simultaneously and move/receive the same dog simultaneously. Confirm one valid record, preserved unrelated edits, and explicit conflicts.
- [ ] Verify live arrival/departure, counts, and reload/date restoration across staff sessions.
- [ ] Verify private photo uploads/replacements, allowed types/size, signed URLs and manager restrictions.
- [ ] Verify staff revocation disables subsequent reads/writes. Previously loaded snapshots remain until exit; signed URLs expire separately.
- [ ] On Android hardware, test holds, scrolling, touch drag grips, tap destinations, portrait/landscape and installed-PWA operation.
- [ ] Use realistic long names, dog volumes and operational group sizes; evaluate legibility at the workplace's real monitor settings.
- [ ] Validate production behavioural rules with the Behavioural Manager before enabling anything beyond the fictional demo fixture.

No cloud project provisioning, live migration, merge or deployment was performed.
