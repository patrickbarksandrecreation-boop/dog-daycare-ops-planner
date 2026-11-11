# Handler UI and speed review

11 November 2026, Australia/Brisbane. **Local changes for owner review. Nothing deployed, pushed or merged; no hosted records or schema changed.**

Latest interaction follow-up: [mobile scroll protection and retaining the current group](MOBILE-INTERACTIONS.md). The paired timings below record the initial UI pass; the follow-up supplies the latest measurements and gesture evidence.

## What changed

- The phone opens the active group near the top, rather than placing the unassigned preview above it. Empty/unplanned dates open Unassigned. Group tabs stay reachable while scrolling.
- Selecting dogs opens a bottom move tray with direct destination buttons. The native chooser, keyboard controls and grip dragging remain available. The tray reserves page space; desktop selection reserves a stable toolbar slot so cards do not jump under the pointer.
- A board-wide name/breed search switches to a matching group. Unassigned and master-database searches remain separate.
- Phone and touch-tablet information/arrival targets are at least 44 × 44px. Fine-pointer desktop keeps compact tiles and resizable lanes; tablet widths use two panel columns. Removed empty warning placeholders and the external Google Fonts request.
- Moves and attendance render a pending preview immediately. Only affected dogs wait for confirmation; handlers can select, move and receive other dogs meanwhile. Settings/profile edits remain exclusive.

## Speed measurements

Paired runs against the original repository state and this patch: Chromium 151, local Vite, 390 × 844 viewport, 100 fictional dogs, **five samples per case**. Both use the real cloud repository and controlled in-process service responses: mutation 150ms, profile 100ms, photo signing 1ms, snapshot delay shown below. These are repeatable frontend measurements, **not hosted database/network or physical-phone benchmarks**.

The timer starts when the destination change event fires. A DOM observer records placement in the destination lane, unrelated-dog input availability, and return to `Live · saved`. It excludes typing, opening a native picker, tab switching, actual screen paint and human reaction time. Raw samples: [before](ui-speed-review/before-timings.json), [after](ui-speed-review/after-timings.json).

| Median measurement | Before | After |
| --- | ---: | ---: |
| Move feedback, 200ms snapshot | 396ms | 74ms |
| Unrelated dog unlocked, 200ms snapshot | 396ms | 74ms |
| Confirmed save, 200ms snapshot | 396ms | 391ms |
| Move feedback, 800ms snapshot | 1,036ms | 52ms |
| Unrelated dog unlocked, 800ms snapshot | 1,036ms | 52ms |
| Confirmed save, 800ms snapshot | 1,036ms | 1,065ms |

Feedback improved approximately **81% / 95%** in these two cases. Confirmed-save latency is effectively unchanged: the server write and authoritative reread still happen. The improvement is removing that wait from the displayed move and unrelated dog work. The same dog remains locked through its fresh read. The initial capture followed dogs to the destination; the subsequent interaction follow-up keeps the source view, removing the return-tab tap.

Each measured move issued one mutation and used one subscription. Each case recorded three snapshot reads across startup/subscription catch-up and the move. No failed write is retried automatically. This patch does not claim reduced hosted write latency or better real-world Realtime delivery.

Production bundle: JS 337.28 → 341.41kB (gzip 106.38 → 107.56kB); CSS 24.36 → 33.90kB (gzip 5.94 → 7.33kB). This is a responsiveness/interaction improvement, not a bundle-size reduction. The system font removes the separate external font dependency.

## Screenshot review

All captures use fictional demo records. Main screenshots show the same 100-dog planned scenario and date; the saving screenshot uses the controlled cloud-repository fixture. [Measured layout rectangles](ui-speed-review/layout-measurements.json) accompany the images.

| Layout | Before | Proposed |
| --- | --- | --- |
| Phone, 390 × 844 | [Before](ui-speed-review/before-mobile.png) | [After](ui-speed-review/after-mobile.png) |
| Browser, 1920 × 1080 | [Before](ui-speed-review/before-desktop.png) | [After](ui-speed-review/after-desktop.png) |
| Touch tablet, 768 × 1024 | — | [After](ui-speed-review/after-tablet.png) |
| Phone move tray | — | [Three selected dogs](ui-speed-review/after-mobile-move.png) |
| Phone pending save | — | [Saving badge and available next dog](ui-speed-review/after-mobile-saving.png) |

The matching phone captures go from zero complete group cards in the initial screen to **nine**, with the first group card at y=357. Arrival/information targets grew from 24 × 22px to at least 44 × 44px. Desktop retains **90 complete group cards** at 100% zoom. No horizontal overflow was found at 360, 390, 430, 768, 1024 or 1920px, including four groups and long group labels. Tablet touch targets were separately checked with coarse-pointer emulation.

## Save correctness

Confirmed snapshots and pending previews are separate. Previews never invent record versions. A newer server row wins, and a stale batch never previews a partial move. Only a snapshot request started after the corresponding write response can release its pending lock. Independent operations may overlap without replacing each other's state.

Conflicts/lost responses trigger reads, not write replay. A failed read or connectivity loss hides previews and preserves the last confirmed board and pending locks until recovery. Date navigation and sign-out are disabled while confirmation is outstanding; browser navigation warns about pending work. There is no offline write queue or local roster persistence.

Testing exposed and fixed two regressions: Realtime events during confirmation must invalidate the current read, and growing a desktop selection toolbar must not move the cards between clicks.

## Verification and limits

- **137 unit/PostgreSQL tests passed**, covering the existing transaction, version, tenant, permissions, attendance and history rules.
- **69 Chromium browser tests passed in one final run**, including eight slow-save/concurrency/failure cases, phone/touch-tablet controls, board search, tap destinations, grip drag, stationary hold versus scroll, two-tab edits, stale batches, offline recovery and existing operational workflows.
- Frontend production build and Edge type checks passed. Built PWA shell/cache/offline reload check passed. Its network probe verifies actual offline failure; Chromium's `navigator.onLine` flag proved unreliable after a service-worker navigation in this environment.
- No hosted mutation, database migration, Netlify preview/production deployment, push or merge. No auth/RLS policy or RPC signature changed.
- Workplace network, actual staff devices, installed Android interaction, remote photo transfer and live multi-device delivery/timings remain unmeasured. Existing profile/settings/photo saves still wait for confirmation. Shared sync controls/backend behavior were not changed.

Reproduce locally with a Vite server on port 5175:

```sh
PLANNER_CHROMIUM_PATH=/usr/bin/chromium node scripts/measure-ui-speed.mjs after
PLANNER_CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-handler-review.mjs
PLANNER_CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e
PLANNER_CHROMIUM_PATH=/usr/bin/chromium pnpm test:pwa
```

Omit `PLANNER_CHROMIUM_PATH` when using a standard Playwright Chromium installation. The next step is owner review of the screenshots and timings, followed by separately authorized release and workplace-device acceptance. Deployment remains pending explicit approval.
