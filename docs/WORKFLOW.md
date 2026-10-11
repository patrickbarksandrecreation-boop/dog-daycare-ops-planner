# Daily planning and arrival workflow

**Approved operational source of truth — 10 October 2026.** This document supersedes the original Phase 1 statement that attendance and compatibility warnings were excluded. The supplied layout sketch governs the spatial arrangement; the rules below govern behaviour.

## One day, one board

The board organises dogs before arrival and tracks attendance after arrival. Each booked dog has exactly one daily record, one optional group, and an independent attendance status. The master dog database is separate. Stable dog IDs, never names, identify records.

For this iteration bookings are entered manually through **Dog database → Book for day**, or provided as clearly fictional demo fixtures. No Petboost or external booking integration exists. Creating a master dog makes it searchable immediately; it does not silently book or receive the dog.

## Unassigned and groups

- At the start of planning, every dog booked for that day appears in Unassigned as Expected.
- Assigning a dog removes it from Unassigned and places it in exactly one group, even before arrival.
- Unassigned search searches only active, unassigned dogs on the selected date. Database search is separate and cannot add a second daily record, including for a dog that has already departed.
- Drag a grip, or select a card then select a destination. Groups and Unassigned both accept active dogs. Moving never changes attendance.
- Tap a selected card again, press Escape or use Cancel selection to deselect. Interactive controls inside a card do not select/move it.
- A stationary touch hold opens information; moving/scrolling cancels the hold. A separate grip starts drag, so dragging cannot trigger the information hold.
- Right-click, double-click or the information button opens the same details on desktop. Keyboard users have select, destination, information and grip controls.

## Attendance

| State | Meaning | Active board |
|---|---|---|
| Expected | Booked, not physically received | Visible in Unassigned or its planned group |
| Present | Handler confirms physical receipt | Visible in its existing location |
| Departed | Dog has left the facility | Hidden from active lanes; retained in Day records |

The small hollow-circle arrival button on the card changes Expected → Present with one action (accessible name: **Mark [dog] present**). Present dogs show a green check. A handler can receive dogs without opening a profile. Information offers **Mark departed** for Present dogs. Day records offers **Undo departure** to restore Present after a mistake. No dog is received automatically when booked, created, assigned or moved.

Attendance and movement share the record version check. A stale action refreshes and reports the conflict instead of overwriting a simultaneous change. Departure retains the dog ID, group ID and arrival/departure timestamps. Expected bookings may be removed; Present or Departed records cannot be deleted through removal or clearing. **Clear expected bookings** removes only Expected records after confirmation and revision validation.

Group headings show **Present / Planned**. Planned means active Expected + Present assigned to that group; departed records are counted separately in Day records. The day summary shows booked total, Expected, Present and Departed from the same daily records.

## Interaction warnings

Evaluate active rules against all Expected and Present dogs assigned to each group. A pair is a **planned conflict** if either dog is still Expected; it is a **present conflict** only when both are Present together. Departure, regrouping and arrival recalculate warnings immediately from confirmed state.

This iteration has deterministic, explicitly fictional pair rules and handling notes in demo mode only. No real behaviour is inferred from names, photos or group placement. Cloud boards say that rules are not configured; no warning is not a claim of safety. Rule editing and an incident-management backend are not included.

## Approved visual requirements

### Dog markers and physical runs

- Open dog information (card information button, long press, or Dog database → dog markers) and toggle **Groomed/bathed** (sparkles) or **No water park** (crossed droplet). Staff can set and clear both independently. Active icons appear on cards. Markers belong to the dog and persist across dates until explicitly cleared; grooming has no automatic expiry.
- Each group's heading offers a daily **Run** selector: **Water park, Playground, Farm, Small indoor, A-Frame**, or unassigned. A run is the physical location for that group. New dates start with no run selected. Multiple groups may select the same run; no exclusive occupancy or capacity rule was requested.
- In Water park, a dog with either marker contributes one warning, listing both reasons if applicable. Expected dogs produce planned (amber) warnings; Present dogs produce present (red) warnings. Departed dogs do not contribute. Warnings are advisory and never silently reject a move.
- Changing a marker, group, attendance state or run recalculates warnings from confirmed data. Group warning buttons open full details naming affected dogs; individual dog information also shows the Water park warning. Other runs have no configured restrictions yet.
- Cloud marker and run updates use workspace-scoped, staff-authorised RPCs and separate version checks. Marker changes are delivered through existing dog Realtime events; run changes bump the day's revision. Migration 004 is required after 001–003. No behavioural-note backend is added.

### Layout

- Desktop: Unassigned and the groups sit side by side. Each panel has a top width handle and a bottom corner handle, with arrow-key resizing. Widening a panel redistributes available space among its neighbours, with minimum widths to prevent overlap. Width and minimum-height choices belong to the current browser session, not the shared plan.
- Panels automatically grow downward to fit all dogs; scroll the entire page rather than scrolling inside desktop lanes. Cards wrap into as many columns as the panel fits. Reducing height cannot hide dogs. Render from group data; support a fourth without hardcoded UI branches.
- Unassigned retains its own search, separate database access and visible **+ New Dog**. Phones retain the horizontal card strip and group tabs with no resize controls.
- Responsive photo-first group tiles reflow with panel widths; Unassigned retains compact cards. Legible short names, compact breed labels, warning/marker icons, arrival actions and selection/drag states remain. Full names and breeds stay available in details, and repeated short names remain distinguishable.
- Compact headings with group name, Present / Planned counts and warning area.
- Target at least approximately 70 fully visible group cards at 1920 × 1080 and 100% zoom. Measure card rectangles, not a visual impression. No forced zoom.
- Phones around 390px use group switching and a persistent destination chooser when selected/dragging; Unassigned remains readily reachable. Same operations remain available.
- Preserve existing date navigation, group labels/defaults, master dog editing/photos/archive, shared-state reconciliation, permissions and offline write gating. Approved anonymous authentication and synthetic enrollment are defined in ANONYMOUS-PILOT.md; workspace boundaries and manager permissions remain enforced.
- Quick dog creation requires only a name; optional photo uses the existing editor. Warn on matching names and require explicit duplicate-name acknowledgement, since legitimate duplicates exist.

## Acceptance

Test independent assignment/attendance, both kinds of search, duplicate prevention, retained departures, arrival preservation through moves, counts, planned/present warning transitions, pointer/touch/keyboard controls, hold versus drag/scroll, quick creation, four-column rendering, desktop density, 390px layout, and all existing database security rules.

Build, type-check and run automated tests; capture screenshots. Report cloud and physical-device checks as unverified until actually run. See STATUS.md for measured results. Do not merge or deploy without approval.
