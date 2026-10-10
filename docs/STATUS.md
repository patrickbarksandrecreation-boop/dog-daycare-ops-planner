# Implementation status

Verified 10 October 2026. [WORKFLOW.md](WORKFLOW.md) is the approved operational source of truth; [layout-reference.png](layout-reference.png) preserves the supplied sketch.

## Completed

- Compact top Unassigned strip, unassigned-only search, separate master database search and visible New Dog.
- Three tall desktop groups with two-column card grids; data-driven four-column fixture.
- Expected dogs can be grouped before arrival. Card Arrive confirms physical receipt independently of group assignment.
- Present/Planned group totals and day-wide Expected/Present/Departed totals derive from daily records.
- Departure removes the active card and retains identity, last group and timestamps in Day records. Undo departure corrects a mistake. Received/departed rows survive removal/clear actions.
- Drag between all active locations, grid reordering, click/tap/keyboard selection and destination actions, Escape/reselect cancellation, selection/drop highlights.
- Right-click, double-click, information button and stationary touch hold open dog details. Movement/scroll cancels hold; the grip never opens the hold popup.
- Deterministic fictional pair rules with amber planned conflicts and red present-together conflicts. Composition/attendance changes recalculate them.
- Duplicate booking prevention includes departed dogs; quick creation flags matching master names and requires explicit acknowledgement.
- Existing dog editing/photos/archive, group rename/defaults, saved dates, access rules and offline write gating retained.
- Additive migration 002 adds only related attendance fields/RPC and fourth-group capacity. Original schema migration is unchanged. Existing placements are preserved; no cloud migration has been applied.

## Verification

| Check | Result |
|---|---|
| TypeScript | Passed |
| Vite production build | Passed |
| Model/workflow tests | 6 passed |
| PostgreSQL/RLS tests | 14 passed |
| Existing-data migration test | 1 passed |
| Chromium browser workflows | 11 passed |
| Production PWA shell / offline reload | Passed |
| Desktop density, 1920×1080 | **72 fully visible group cards**, 100% zoom, 13px names, no horizontal overflow |
| 390×844 mobile browser | Tap moves, touch hold, hold cancellation on movement, touch grip drag, destination tabs and no horizontal overflow passed |

Total: **32 automated tests**, plus production build/type-check and standalone PWA verification. Database tests execute PostgreSQL using PGlite with Supabase service stubs. Browser tests use fictional in-memory data. Neither proves live Supabase behaviour.

The browser tests caught and fixed a settling drag overlay intercepting a subsequent drag. The overlay is now non-interactive. Decorative initials are hidden from accessible names. Screenshots were inspected after test completion.

## Screenshots and preview

- [Desktop 1920×1080](screenshots/desktop-1920.png)
- [Mobile 390×844](screenshots/mobile-390.png)
- Local preview: `http://127.0.0.1:5173/`. Choose **Planned day** before Explore the demo for the density example; choose Morning for all 100 bookings initially unassigned.

## Remaining limitations

- Supabase project, credentials and staff accounts are not configured. Actual hosted Auth, Storage and multi-device Realtime—including live arrival/departure synchronisation—remain unverified. The opt-in live test was updated and syntax-checked, not executed.
- Touch was verified with real Chromium touch events under device emulation. Physical Android hardware and installed-PWA behaviour still need acceptance testing.
- Behavioural notes and rules are fictional demo fixtures only. Cloud boards explicitly show that rules are not configured. Production rule storage/editing is deferred.
- Bookings are manual or fictional fixtures. No Petboost or external booking integration.
- The status row retains first arrival and most recent departure, not an event-by-event audit.
- The interface and schema support a fourth configured group, but adding/removing group configurations through a manager screen is future work.
- Demo data resets on refresh. Real persistence requires applying migrations 001 and 002 to Supabase.

## Repository and release

Local development branch: `codex/dense-planning-attendance`.

The original local project had no AGENTS.md or commits. The user subsequently supplied the GitHub repository and author identity. Its existing main history is retained as the parent of this implementation, and its AGENTS.md, historical documentation, evidence and hosting configuration are preserved. WORKFLOW.md takes precedence over historical product and roadmap descriptions. The implementation is prepared on the development branch for GitHub review; main remains unchanged.

No merge, publication or production deployment was performed.
