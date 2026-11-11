# Mobile scrolling and staying in the current group

11 November 2026, Australia/Brisbane. Local follow-up to the [UI/speed review](UI-SPEED-REVIEW.md). **Nothing pushed, merged or deployed.**

## Assessment

The accidental selection was reproducible at 360, 390 and 430px: a slow **10 CSS pixel** drag on a group card selected Archie even when the page moved less than 3px. Larger swipes already scrolled normally. The movement handler only cancelled the information hold; it still accepted the browser's click after a short swipe. Information and arrival buttons had the same gap.

The card body and action controls keep native vertical scrolling. Movement of at least 8px, scrolling during contact or touch cancellation now suppresses the resulting click for the whole gesture. Moving away and back does not turn a swipe into a tap. A touch within 150ms of recent scrolling stops that scroll without activating a dog. Scrolls inside a dialog do not suppress unrelated board actions.

Stationary taps still select/deselect without a debounce or network wait. Stationary holds still open information; keyboard controls, context menus and the explicit drag grip remain available. The grip remains an intentional drag area. Removed the browser's blue touch flash from dog buttons so an ignored swipe does not look like a selection; actual selection outlines and keyboard focus remain visible.

## Moves keep the source view

Chooser, quick destination buttons, group headings, dog-information moves and drag-to-tab moves no longer change the active view. This includes moves from Unassigned and moving the last dog out of a group. Destination counts update and moved dogs leave the source, ready for the next selection. If a handler manually switches tabs during saving, the response preserves that choice, including failed saves.

The captured example moves Alfie, Archie and Bailey from Group 1 to Group 2. **Group 1 stays selected**, with 9 present / 27 planned; Group 2 updates to 12 present / 33 planned. Attendance remains 31 present overall. Continuing work in the source now needs **zero return-tab taps**, previously one.

| Evidence | Screenshot |
| --- | --- |
| Before: 10px swipe accidentally selects Archie | [Before short swipe](ui-speed-review/before-short-swipe.png) |
| After: same short swipe leaves selection empty | [After short swipe](ui-speed-review/after-mobile-scroll.png) |
| After moving three dogs: Group 1 stays selected | [Source group after move](ui-speed-review/after-mobile-stay.png) |

[Recorded screenshot assertions](ui-speed-review/scroll-move-measurements.json) verify zero accidental selections and the active source view/counts. Reproduce with `node scripts/capture-handler-review.mjs` against local Vite on port 5175.

## Response times

Same local benchmark method as the initial review: 100 fictional dogs, 390px Chromium viewport, five samples per case, a 150ms mutation and the stated snapshot delay. The timer measures the DOM move update, unrelated input availability and confirmed save. These are controlled repository-fixture timings, not hosted network or physical-device measurements.

| Latest median | 200ms snapshot | 800ms snapshot |
| --- | ---: | ---: |
| Move update / next dog available | 74ms | 98ms |
| Confirmed save | 397ms | 1,038ms |

All ten samples retained the Unassigned source view, issued one mutation and used three snapshot reads across startup and confirmation. Server confirmation still waits for the write and reread. Touch protection adds no deliberate-tap timer; a touch used to stop scrolling is intentionally ignored. [Raw latest timings](ui-speed-review/scroll-followup-timings.json).

## Verification

- **12 native Chromium touch tests passed** at 360/390/430px: upward/downward page scroll; immediate fling-stop touches; short body/info/arrival drags; touch cancellation; intentional select/deselect; stationary hold without selection. Before the fix, short-drag selection failed at all three widths.
- **Five new source-view tests passed**, covering chooser/quick destinations with mixed attendance, profile moves and pending success/failure while manually switching tabs. Existing real touch-drag tests now also assert the source remains selected.
- **86 browser tests passed across the suite runs and focused reruns.** Touch tests that intentionally select after programmatic scrolling first let scrolling settle; the dedicated gesture tests exercise actual native scrolling and immediate stop touches separately.
- Production TypeScript/Vite build passed. No data model, RPC, auth, permission or offline-write behavior changed. The earlier 137 unit/PostgreSQL checks remain the evidence for those unchanged layers.

Physical Android/iOS handling, workplace networks and installed-device acceptance remain unverified. Review the updated screenshots and measurements before any separately approved deployment.
