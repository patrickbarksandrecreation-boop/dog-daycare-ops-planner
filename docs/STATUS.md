# Implementation status

## Photo upload limit (16 October 2026 AEST)

Owner requested an immediate increase from 5 MB to 8 MB. Creation/replacement client validation, both upload hints, Edge validation and bounded multipart handling now accept up to 8,388,608 bytes. Additive `dog_photo_limit_8mb` migration updates only the private bucket cap; MIME restrictions and access controls are unchanged. Hosted bucket verified at 8,388,608 bytes; JWT-verified replacement function version 2 is active. Compression remains deferred.

Validation: 91 unit/PostgreSQL/workflow tests, Edge type checking and production build passed, including client/Edge acceptance above the former cap and exactly at 8 MB, and oversize rejection. Frontend publication and hosted upload acceptance are verified separately after this commit. Physical-phone camera capture remains unverified.

## Multi-dog selection and atomic moves (13 October 2026)

Based on current main `42c5e4f` in a separate checkout, preserving unrelated work. Cards toggle independently across groups/Unassigned; mobile tabs keep the selection and switch views. Blue outlines, selected count, a sticky mobile destination chooser, Clear selection and Escape are available. Date changes and successful moves clear selection. Information/arrival/grip controls preserve selection; grip drag/reorder remains single-dog. Failed/ambiguous bulk responses refresh server state and discard the selection without replay.

CLI-generated additive migration `20261013041057_bulk_dog_moves.sql` adds only `move_assignments`: existing staff/workspace day locking, whole-selection source/version validation, duplicate/departed/missing rejection, attendance preservation, per-dog attributed audit and one Realtime day revision. Hosted compatibility inspection and isolated synthetic API acceptance passed atomic groups/Unassigned batches, real concurrent conflicts, invalid/stale rejection, permission denial, unique locations and unchanged attendance/master metadata. Migration is applied; existing RPCs remain compatible. Security advisors add the intentional [authenticated checked-definer RPC notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); existing synthetic-pilot/private-ledger/password notices remain.

Validation: 88 unit/PostgreSQL tests and all 44 Chromium tests passed, including desktop/mobile multi-selection, tabs, controls, destinations, remote stale selections, saving/offline gating and injected failed/lost responses. Edge checks, frontend type checks/build and PWA offline-shell checks passed. Desktop retains 90 fully visible group cards at 1920×1080/100%; 390px has no horizontal overflow. Screenshot evidence: `screenshots/bulk-selection-desktop.png` and `screenshots/bulk-selection-mobile.png`. Two existing sparse-date tests were updated from the former tab-as-destination interaction and pass. Existing bundle-size warning remains.

Applied cloud version: `20261013042137`. [PR #11](https://github.com/patrickbarksandrecreation-boop/dog-daycare-ops-planner/pull/11) records final CI and publication evidence. Netlify preview serves `index-BoxAi_wY.js` and `index-mV9WHnKT.css`, byte-for-byte matching the configured local build. Two independent staff browser sessions (1920px desktop and 390px touch emulation) passed hosted selection, mobile tab switching, groups/Unassigned destinations, Realtime convergence, stale UI rejection, a committed request with its response deliberately lost (exactly one request), unchanged attendance and reload persistence.

Repeatable hosted API/two-browser acceptance: `tests/live-bulk-moves.mjs` with `LIVE_TEST_CONFIRM=synthetic-pilot`, optional `BULK_API_ONLY=1`, and `TEST_APP_URL` for browser checks. Creates uniquely named synthetic dogs on 2039-10-13, restores only their locations to Unassigned and retains all records/history. Production publication/acceptance is pending at this commit checkpoint; see PR #11 for subsequent release results. Physical-device use remains unverified.

## Sparse-date group tile fix (13 October 2026)

Desktop group grids retain empty columns (`auto-fill`) instead of collapsing them (`auto-fit`). A full Monday group had 71px tiles, but a later date with one dog stretched its tile to 448px. Sparse dates now keep the same compact tile and photo dimensions. Unassigned, database, mobile styles and placement logic are unchanged.

Regression tests cover full Monday → sparse Tuesday/Wednesday → Monday, names/breeds/photo dimensions, bounds and mouse/touch moves into another sparse group. Both new browser tests pass. Build, 80 unit/PostgreSQL tests, Edge and PWA checks pass; the 39-test browser run had one existing panel-growth timeout under concurrent load, which passed alone (all 39 tests covered successfully). CI gates publication; physical devices remain unverified.

## Shared dog preferences release (approved; 13 October 2026)

The owner explicitly approved both hosted migrations and merging/publication. Handling notes/rules is applied as cloud version `20261012193929`; dog card colours is applied as `20261012193942`. Hosted API acceptance passed colour persistence, simultaneous-write conflicts, validation, direct-write/nonstaff/unauthenticated denial, unchanged profile metadata, handling notes, symmetric rule add/edit/remove and attributed history on dedicated synthetic date 2038-10-13. The test resets colours to White, clears test notes and removes test rules; fictional master dogs/bookings and audit history are retained.

PR #9 integrates the existing compact/loading release. Its initial full GitHub checks passed. Preview acceptance caught duplicate colour controls during authoritative refreshes: colour and behaviour sibling editors used the same React key. Distinct section keys fix reconciliation; all three focused colour browser tests now pass, including repeated shared-board refreshes. Final-head CI and hosted preview/production UI verification are pending at this checkpoint. No production merge yet. Security advisors retain the intentional membership-checked RPC, approved synthetic anonymous access, private-ledger and password-protection notices; new tables use workspace-filtered RLS and explicit read-only grants.

Repeatable opt-in hosted API/two-browser test: `tests/live-dog-preferences.mjs`. Remaining physical-device acceptance is unverified.

## Dog card colours (local; 12 October 2026)

Dog information now offers seven named colour presets (including White), a custom colour picker, preview, Save colour and Cancel colour change. Enrolled staff can set colours independently of manager profile editing. Group and Unassigned cards retain the chosen background while selected; black/white text follows colour luminance. Colours belong to master dogs across dates and groups.

CLI-generated additive migration `20261012105959_dog_card_colours.sql` adds white defaults, validated hex colours, independent versions and a membership/workspace-checked `set_dog_colour` RPC. Existing snapshot and dog Realtime delivery carry the fields. Direct table writes remain denied. Stale drafts cannot overwrite a newer colour. Demo colours persist with fictional notes/rules in browser storage and synchronize across tabs; offline edits are disabled.

Verification: **80 unit/PostgreSQL tests, all 36 Chromium browser tests**, TypeScript/production build and offline PWA check passed. The contrast adjustment received a focused unit rerun. The first broad browser run had a touch-test context destroyed by a development reload during source editing; the final unchanged-source run passed all tests. Phone popup screenshot: `docs/screenshots/dog-colour-mobile.png`. Existing bundle-size warning remains.

**Not applied, merged or deployed.** Read-only hosted migration inspection still shows staff group names as the latest applied migration. Publishing this checkout also requires the earlier handling-notes migration. Hosted colour persistence/Realtime and physical-device acceptance remain unverified. Next step: approve the pending migrations and publication, then verify with independent staff sessions on synthetic records.

## Loading and persistence responsiveness (local; 12 October 2026)

Requests now show explicit loading/refreshing; Retry appears only after failure, and empty days are identified separately. Private-photo signing enriches the latest board in the background with shared in-flight requests and session invalidation. Focus/health refreshes coalesce; version checks, post-save reconciliation and Realtime catch-up remain intact. Controlled paired timings: first board **1,301 → 559 ms**, save with a new photo path **1,263 → 512 ms**, with injected 800 ms signing latency. These are local measurements, not production claims.

Verification: **76 unit/PostgreSQL tests, 34 Chromium tests**, frontend/Edge type checks, production build and offline PWA check passed. Hosted RPC statistics and migration ledger were inspected read-only; this branch still requires the unapplied handling-notes migration, so hosted two-staff acceptance and real-device timings remain unverified. Existing bundle warning remains. No merge/deployment/backend changes. See [investigation, measurements and next step](LOADING-PERFORMANCE.md).

## Compact group tiles (local; 12 October 2026)

Group-only CSS uses 68px desktop / 78px mobile minimum columns, 66px / 70px tile heights and 4px grid gaps. Names remain 13px and abbreviated breeds 11px; photos, grip dragging, tap moves and hold details remain available. Unassigned and database styles/data are unchanged. Resize coverage now adds 30 bookings to exercise panel growth with smaller tiles.

Validation: build and 74 unit/database tests passed; final focused Chromium desktop density, pointer drag/reorder, panel growth and 390px touch tests passed (4/4). Desktop shows 90 complete grouped tiles at normal zoom without horizontal overflow; mobile fits four columns. Broader browser runs encountered trace-output collisions and development reloads during concurrent workspace edits; the final focused run used separate output. Existing bundle-size warning remains. Physical devices are unverified. No merge or deployment; next step is review the local CSS and screenshots.

## Handling notes and interaction rules (implemented locally; 12 October 2026)

`codex/handling-notes-interaction-rules` adds staff-editable multiline notes, searchable dog selection with photo/breed, symmetric Hard/Soft pair rules, editing and confirmed removal. Hard/red and Soft/amber are independent of Planned/Present attendance. Warnings name both dogs and the note and remain advisory. Existing panels, group names, attendance, movement, markers/runs and photos are preserved.

New additive migration `20261012044344_handling_notes_interaction_rules.sql` provides workspace isolation, composite dog references, distinct canonical pairs, uniqueness, staff-only version-checked RPCs and append-only attributed before/after audit history. Rule changes refresh both dogs through existing Realtime subscriptions. Demo notes/rules persist in browser storage with same-browser tab synchronization and stale-write protection. Offline mode retains last-loaded viewing and disables editing. See [HANDLING-NOTES-RULES.md](HANDLING-NOTES-RULES.md).

Verification: **74 unit/database tests and all 26 Chromium browser tests passed**, including five focused new browser tests. Frontend/Edge type checks, production build and PWA validation passed. Desktop regression measured **72 complete cards at 1920×1080**, normal zoom, no horizontal overflow. Mobile keyboard editing passed at 390px; screenshots are `handling-rules-mobile.png` and `handling-rules-desktop.png`. The production build retains the non-blocking bundle-size warning (558 kB before gzip).

**Not applied, merged or deployed.** Hosted two-staff delivery, real multi-connection contention and physical-device acceptance are unverified. PGlite runs actual PostgreSQL constraints/RLS but serializes submitted competing writes; two-tab synchronization coverage is fictional demo mode. No audit browser UI is included. Cloud offline viewing remains memory-only; a cold offline reload cannot recover private records. Next step: review this commit, then explicitly authorize the additive hosted migration and two-staff acceptance before any deployment.

## Editable group names (released; verified 12 October 2026)

`codex/editable-group-names` enables the existing pencil/name form for all enrolled staff on an editable board. Opening it clears the dog selection. Names are trimmed and limited to 1–40 characters; Cancel discards edits, and the optional future-day default remains available. Additive migration `20261011103159_staff_group_names.sql` permits staff rename RPCs while retaining day locking, workspace/membership checks, scoped updates and anonymous execution denial. Earlier staff-rename denial notes below describe the deployed release.

Local verification: 64 unit/database tests, production build, and two focused Chromium rename tests passed. The owner approved migration and deployment. Migration applied as cloud version `20261011103645`; hosted acceptance passed staff renaming, trimming, second-session visibility, validation, and nonstaff/unauthenticated denial on dedicated synthetic date 2038-10-11. Its original label was restored. `tests/live-group-names.mjs` provides opt-in API and deployed two-browser acceptance. Security advisors retain the documented membership-checked RPC and synthetic-pilot notices.

PR #7 merged as `cbdd98f`, retaining the resizable-panel release. [GitHub checks](https://github.com/patrickbarksandrecreation-boop/dog-daycare-ops-planner/actions/runs/38132727750) passed the integrated unit/database, Edge, build, 21-browser-test and PWA checks. Netlify production serves the same `index-BvEjXclQ.js` bundle as the verified preview. Two independent staff browsers passed renaming, realtime convergence and reload persistence on both preview and production. Acceptance restored the original synthetic label and did not alter assignments or future-day defaults. Physical-device acceptance remains outstanding.

Verified 11 October 2026. [WORKFLOW.md](WORKFLOW.md) governs the approved board; [ANONYMOUS-PILOT.md](ANONYMOUS-PILOT.md) governs authentication and enrollment. The owner approved anonymous sessions, cloud changes and deployment.

## Ready and verified

- Dense desktop board, three groups expandable to four, drag/tap moves, touch hold details, independent Expected/Present/Departed attendance and retained day records remain implemented.
- Groomed/bathed and No water park markers persist until cleared. Daily group runs offer Water park, Playground, Farm, Small indoor and A-Frame; advisory warnings distinguish Expected and Present dogs.
- Supabase Dog-daycare-op-manager (pkvvxutryhordwphlxof) has all seven migrations below, the 20 fictional seed master dogs and explicitly named synthetic acceptance-test dogs. Anonymous sign-in is enabled and verified. Display-name enrollment creates staff membership only in the enabled synthetic workspace; browser sessions persist. Manager permissions remain restricted.
- Workspace-scoped constraints/RLS, atomic version-checked moves and append-only movement/attendance events are applied. A live test exposed timeouts for stale writes using SQLSTATE 40001. The additive explicit-conflicts migration returns PT409 / HTTP 409 while preserving locking, grants and scope checks; live competing moves now return one success and one clear conflict.
- Live test against Supabase with two independent Chromium sessions passed: anonymous enrollment, booking and movement convergence, refresh/session persistence, simultaneous moves, independent attendance, departure removal, history reads/write denial, denied role escalation and offline recovery. Successful test date: 2035-10-13. Earlier diagnostic dates 2035-10-10 through 2035-10-12 retain fictional records; history was not deleted.
- Staff dog creation is enabled in the frontend and applied database migration. Two ordinary staff Chromium sessions each created a fictional dog on 2035-10-14, saw both dogs synchronize and survive refresh, and verified initial private photo upload/loading. Duplicate acknowledgement and separate booking passed. Existing-profile edits/archive/uploads, group rename and clearing stayed denied. The full live test also passed attendance, competing-write conflicts, history and offline recovery. The first diagnostic create saved a fictional unbooked dog before a short assertion timed out; it remains identifiable by its Synthetic staff creation prefix. No Monday bookings or attendance history were deleted.
- Local tests: 42 model/PostgreSQL/config tests, TypeScript and production build passed. Preserved-GUI Chromium browser suite: 13 passed after staff dog creation. Desktop evidence: 72 complete group cards at 1920×1080; 390px touch emulation passed. These do not substitute for physical-device acceptance. Vite reports a non-blocking bundle-size warning (540 kB before gzip).

## Applied migration ledger

The connected migration service assigns cloud versions different from local filenames. Do not blindly replay local migrations through CLI.

| Local migration | Applied cloud version |
|---|---|
| 001_planner.sql | 20261010084004 |
| 002_attendance.sql | 20261010084243 |
| 003_workspace_history.sql | 20261010084320 |
| 004_runs_markers.sql | 20261010084328 |
| 20261010083809_anonymous_pilot.sql | 20261010084335 |
| 20261011034943_explicit_conflicts.sql | 20261011035057 |
| 20261011050413_staff_dog_creation.sql | 20261011050754 |
| 20261011070104_petboost_dog_metadata.sql | 20261011070358 |
| 20261011082513_dog_breed_staff_photos.sql | 20261011092203 |
| 20261011103159_staff_group_names.sql | 20261011103645 |

## Release checklist and remaining limits

- Netlify production: https://dog-daycare-ops-planner.netlify.app/. PR #5 merged as `e84b601` and published through the existing integration. The served bundle matches the configured production build and includes `replace-dog-photo`. Two-staff photo acceptance passed again on the deployed origin. Only public Supabase configuration enters the frontend.
- Browser anonymous identity and a typed name are not verified employee identity. Enrollment is openly joinable for synthetic data. CAPTCHA/abuse controls, controlled admission and a privacy review are required before considering real records.
- Staff creation, initial private photo upload, denied existing-profile edits/archive/uploads/rename/clear, cross-workspace and revoked-membership denial have local PostgreSQL coverage. Dedicated hosted cross-workspace, manager and revocation tests remain outstanding. Test physical Android/PWA use and multiple real devices.
- Post-migration advisors report the deliberately inaccessible enrollment ledger, authenticated SECURITY DEFINER RPCs, the approved anonymous-session policies and disabled leaked-password protection (the trial uses anonymous identities). Their explicit grants, membership checks, empty search paths and scoped operations are reviewed and locally tested; see ANONYMOUS-PILOT.md.
- The deployed release still has no handling-note backend or configured cloud interaction rules; this branch adds them pending approval. No Petboost integration exists. Marker/run changes are not movement-audit events. Movement history starts when migration 003 was applied; behaviour history will start when the new migration is applied. Database owners retain administrative powers.
- Current feature branch: `codex/handling-notes-interaction-rules`, based on `e563987` after the approved group-name release.

## Dog cards, breed information and staff photo replacement (approved release)

Implemented on `codex/dog-card-breed-staff-photos` from approved main `45e1b88`. Group cards are photo-first responsive tiles with short-name disambiguation, optional explicit breed labels and compact attendance/warning controls. Database search matches full names/breeds; creation accepts optional breed, while existing name/breed/archive edits remain manager-only. All enrolled staff have a separate Change photo operation.

The unchanged previously applied metadata migration is restored to source control and was not replayed. New migration `20261011082513_dog_breed_staff_photos.sql` is applied as cloud version `20261011092203`. It adds breed-aware saves and a private photo lifecycle ledger with service-only replacement/cleanup RPCs. The JWT-verified `replace-dog-photo` Edge Function version 1 is active: it checks current staff membership, validates/limits images, uploads a unique path, commits with an expected-path check, then deletes only retired objects through Storage. Direct client deletion is removed, including for managers. The owner approved migration, deployment and integration; PR #5 is merged and the frontend is published through the existing Netlify integration.

Validation: 63 local unit/PostgreSQL/workflow tests and all 15 Chromium browser tests passed; frontend/Edge static type checks, production build and PWA checks passed. Isolated browser measurements: **75 complete group tiles at 1920×1080, 100% zoom**, five columns per group, 14px group-card names, no horizontal overflow. 390px mobile has two columns and passes tap/hold/grip-drag checks. Screenshots are updated in `docs/screenshots/`. The harness now refuses to reuse a server from another checkout.

Revalidated on Windows: all 63 unit/database tests, 15 Chromium tests, Edge type checking, production build and PWA checks passed. Hosted acceptance with two independent staff browser sessions passed UI replacement, realtime image refresh, refresh persistence, stale competing replacements (one winner), invalid upload rejection, private download, unauthenticated/nonstaff and unrelated edit/direct upload/service RPC denial, and cleanup protecting the current image. `tests/live-photos.mjs` provides the opt-in repeatable test; successful synthetic dog `a02bab16-e973-4a6d-8c44-b10fd3388951` and the first diagnostic dog are retained, without attendance changes. Security advisors retain the intentional inaccessible ledgers and authenticated membership-checked RPC notices plus existing anonymous-pilot/password notices; service photo RPCs are not executable by anon/authenticated.

The same hosted acceptance test passed again on the production Netlify origin with synthetic dog `03bee181-c3ec-4407-a306-8a83f5205ec6`. Updated PR CI also passed: https://github.com/patrickbarksandrecreation-boop/dog-daycare-ops-planner/actions/runs/38128325948. Configured build passed with the existing 545 kB bundle warning.

Physical-phone capture, multiple physical devices and real-photo recognition remain unverified. Hosted transport failure/ambiguous-response injection remains locally covered only. Cleanup retries on replacement or explicit staff cleanup calls; no scheduler is installed and unrelated/pre-feature orphan objects are not swept. See [DOG-CARDS-PHOTOS.md](DOG-CARDS-PHOTOS.md) for release order, permissions, cleanup and limitations.
