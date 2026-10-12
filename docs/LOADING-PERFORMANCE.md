# Loading and saving investigation — 12 October 2026

Local patch only. No merge, deployment, migration or hosted data writes.

## Trace and evidence

- Login: Auth callback only updates React state; the separate effect checks staff enrollment. Joining performs anonymous sign-in (if needed), then `join_synthetic_pilot`. Remembered sessions skip enrollment. Board startup reads the current staff profile in parallel with the snapshot pipeline. Authorization is still rechecked on refresh; profile results are not cached across refreshes.
- Snapshot: session lookup → once-per-session/date `ensure_planning_day` → `planning_snapshot` → previously awaited batch photo signing. The last step unnecessarily blocked all cards and save completion when photo paths were new/expired. Avatar image downloads are already lazy and have initials fallback. Unchanged URLs and prepared dates were already cached before this patch.
- UI: the no-snapshot branch unconditionally rendered **Retry connection**, including during a successful initial request. Failed loads, loading, and an empty day did not have distinct messaging.
- Saves: one version-checked mutation, then a fresh profile/snapshot before clearing Saving. Local write events are suppressed during the mutation because the final read reconciles them. No optimistic write, automatic write retry, local write queue or whole-board replacement was added.
- Realtime: one channel subscribes to the selected date and dogs, with a 60 ms event debounce, 30-second health refresh and focus recovery. Subscription readiness/reconnection and events during a read must still request a follow-up snapshot to close missed-event races. Focus/health triggers previously also dirtied an active read unnecessarily.
- Cold assets: production JS is 559.28 kB (164.70 kB gzip); Google Fonts uses `display=swap`. These remain possible contributors on slow devices/networks, but no field evidence here supports changing bundling/fonts or image resolution. No image-byte download is on the new authoritative board critical path.

## Changes

`usePlanner` exposes loading and load-failure state independently of save errors. The board shows Opening/Loading/Refreshing while reading, offers Retry only after a failed operation and no active read, and explicitly identifies days with no bookings. A failed refresh retains the last board and disables writes; retry reads state without replaying the mutation.

The repository now returns authoritative state with any valid cached photo URLs immediately. Optional `photos(snapshot)` signs missing paths in the background, sharing in-flight signing requests. Results enrich only the exact snapshot still displayed; they cannot roll back a subsequent remote edit or date change. Identity changes/sign-out invalidate cached and in-flight signing results. Images failing to sign retain initials and are retried on subsequent refreshes.

Focus/health requests join a pending read. Actual invalidations still request another read. Database version checks, unique assignments, transaction locking, audit history and permissions are unchanged.

## Measurements

Chromium, local Vite, fictional 100-dog fixture, real cloud repository with controlled service responses: preparation 100 ms, snapshot 200 ms, staff profile 100 ms in parallel, signing 800 ms, mutation 150 ms. The comparison reproduces the former blocking photo ordering using the same repository and UI; it is **not a hosted production benchmark**. DOM observers measure first board render and mutation-start → Saving finished. Full-suite run:

| Measurement | Former blocking photos | Background photos |
|---|---:|---:|
| First board rendered | 1,301 ms | 559 ms |
| Save introducing a new photo path, including authoritative reread | 1,263 ms | 512 ms |
| Snapshot reads across startup and that save | 3 | 3 |
| Mutation writes / subscriptions | 1 / 1 | 1 / 1 |

These savings isolate photo-signing latency. Ordinary warm saves with unchanged cached photos still require the mutation and authoritative reread; no comparable improvement is claimed for them. Timing includes local render/scheduling overhead and varies between runs. A focus burst now produces one read; a remote event during that read still produces a second, fresh read.

Read-only hosted `pg_stat_statements` inspection, historical observations (not end-to-end latency):

| RPC | Calls | Mean execution | Maximum execution |
|---|---:|---:|---:|
| planning_snapshot | 2,206 | 7.70 ms | 439.62 ms |
| ensure_planning_day | 766 | 3.27 ms | 90.36 ms |
| move_assignment | 116 | 7.11 ms | 99.71 ms |
| set_attendance | 66 | 7.48 ms | 128.82 ms |

These figures do not include HTTP, Auth, Storage, image transfer or device rendering. They do not prove that every database request is fast, but offer no basis for a schema rewrite in this patch.

## Verification and limits

- **76 unit/PostgreSQL tests passed**, including signing reuse/expiry/failure, identity invalidation, stale write checks and access controls.
- **34 Chromium tests passed**: intercepted Auth/REST login, remembered-session reload, initial failure/retry, empty days, slow photos, stale enrichment, events during reads, duplicate-click suppression, committed-but-lost save responses, failed reconciliation, stale staff edits, existing two-tab demo notes/rules, mobile and board workflows.
- Frontend/Edge type checks, production build and production-shell offline PWA check passed. Existing bundle-size warning remains.
- Hosted migration ledger was checked read-only: handling-notes migration is absent (latest cloud version `20261011103645`). The original development branch's snapshot validation intentionally refused that backend. The release cherry-picks loading and compact tiles onto main, excluding the handling-notes feature; no new backend migration is required.
- Mocked HTTP/Realtime and PGlite are not hosted multi-device acceptance. Live slow-request traces, hosted two-staff contention/delivery, realistic image transfer and physical-device timing remain unverified. Local PostgreSQL tests serialize submitted competing transactions.

Next: review this local patch, then run hosted two-staff/timing acceptance against a backend already compatible with this branch before any separately authorized release.

Reference checks: [Supabase auth callbacks](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [batch signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls), and [changelog](https://supabase.com/changelog). The Markdown changelog endpoint was unavailable; the HTML changelog was inspected instead. No applicable client API breaking change was identified.
