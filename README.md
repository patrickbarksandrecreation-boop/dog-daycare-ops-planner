# Dayboard — daily planning & arrivals

A compact React + TypeScript board for one dog daycare workplace. Organise dogs before arrival, then track Expected, Present and Departed on the same board. Existing Supabase Auth, PostgreSQL, Realtime and private photo storage are preserved.

**[docs/WORKFLOW.md](docs/WORKFLOW.md) is the approved operational source of truth.** It supersedes the initial brief's exclusion of attendance and demo compatibility warnings. See [STATUS.md](docs/STATUS.md) for verified progress and limitations.

## Try the planner

Use Node.js 22+ and pnpm 11.19.0. Dependencies are pinned by the supplied lockfile.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173`. Select a **Demo scenario**, then **Explore the demo**:

- **Morning:** all 100 fictional bookings start Expected and Unassigned.
- **Planned day:** 90 dogs assigned to three groups, ten unassigned; a mixture of Expected and Present, with fictional planned/present conflicts.
- **Four groups:** a future-layout fixture with four data-driven columns.

There are 110 fictional master dog records, so ten remain unbooked and can be found through Dog database. Demo changes last only for the session and reset on refresh. Demo is not shared persistence. The active Supabase project has the application migrations and 20 fictional master dogs. Anonymous access uses a display name. See [current status](docs/STATUS.md) for live acceptance and deployment evidence.

## Everyday operation

1. **Search unassigned** filters only active unassigned bookings for the selected day. **Dog database** searches master records separately; **Book for day** adds one Expected record to Unassigned. Existing bookings, including departed dogs, cannot be duplicated.
2. Drag a card's grip, or select a card then a group/Unassigned. Select the same card again, press Escape or use Cancel to deselect. Keyboard users can select and activate the destination buttons, or use the dnd-kit keyboard grip controls. Moves never mark arrival or reset attendance.
3. **Arrive** on an Expected card confirms physical receipt in one action. **Here** identifies Present dogs. Headings show **Present / Planned**; Planned means active Expected + Present in the group.
4. Right-click, double-click, tap the information button, or hold a stationary card to open details. Movement/scrolling cancels the hold; the separate drag grip never starts the hold timer.
5. **Mark departed** hides a Present dog from active lanes and retains its last group and timestamps in **Day records**. **Undo departure** corrects a mistake by restoring Present in the previous location.
6. Expected bookings can be removed with confirmation. Manager **Clear expected bookings** removes only Expected records and retains Present/Departed history.
7. Every enrolled shared-session participant uses **+ New Dog** to create a master record. Matching names require explicit acknowledgement that this is a different dog. The database opens filtered to the new name, ready to book it separately. Creation never silently books or receives a dog.
8. Managers edit existing names/breeds and archive profiles. All enrolled staff can use **Change photo** in dog information or **Photo** in the database. Archiving preserves saved references. Unarchiving is currently a database-administrator action.
9. Group pencils rename inline; optionally save the default for newly opened days. Already-created dates retain their label snapshots. Navigate dates or use **Today** in Australia/Brisbane; yesterday's records are never copied automatically.
10. On phones, group tabs switch views. With a card selected they become destinations; a drag can also drop on a tab. The horizontally scrollable Unassigned strip remains available above them.

Amber demo warnings identify a planned conflict where at least one dog is Expected. Red identifies two incompatible demo dogs currently Present together. Moves, arrivals and departures recalculate warnings from confirmed composition. Demo notes and rules are explicitly fictional and keyed by stable IDs. **Cloud behaviour rules are not configured in this iteration; no warning is not a safety assessment.**

## Configure Supabase

Dog markers and physical group runs require [004_runs_markers.sql](supabase/migrations/004_runs_markers.sql) after migrations 001–003. Existing installations apply only missing migrations. Staff toggle Groomed/bathed and No water park in dog information, and choose each group's run in its heading. Both markers persist until cleared; run selection belongs to the selected date. Water park warnings distinguish Expected and Present dogs and remain advisory. See [WORKFLOW.md](docs/WORKFLOW.md).

Staff dog creation requires `20261011050413_staff_dog_creation.sql` after the six earlier migrations. It is applied to the connected trial project; see STATUS.md for the cloud ledger. Creation inserts only and cannot overwrite an existing ID, including competing requests.

Workspace-scoped persistence is documented in [M3-PERSISTENCE.md](docs/M3-PERSISTENCE.md), including the access matrix and setup for multiple workspaces. No external booking integration exists.

1. Follow [ANONYMOUS-PILOT.md](docs/ANONYMOUS-PILOT.md). The approved existing project already has migrations 001–004, anonymous enrollment, explicit HTTP conflict responses and staff dog creation. Do not replay applied migrations; cloud ledger versions are recorded in STATUS.md.
2. For a new synthetic project, apply the migrations in filename order and the fictional demo seed. Enable and save **Allow anonymous sign-ins** in Supabase Authentication settings.
3. Copy .env.example to ignored .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Use only the public publishable key, never a secret/service-role key or password. Restart Vite after changes. Configure the same two public build variables in Netlify.
4. Enter a display name and join the shared pilot. The browser retains its anonymous session. Enrollment grants staff access only to the enabled synthetic workspace. Display names and anonymous sessions do not verify employee identity.
5. Managers remain administrator-provisioned; ordinary participants can create active master dogs with optional breed/photo, replace photos, book dogs, move them, mark attendance and edit markers/runs. With `20261011103159_staff_group_names.sql`, staff can rename groups using the heading pencil and optionally set defaults for newly opened days. Existing dog name/breed edits, archiving and clearing remain manager-only. Photo replacement requires the migration and Edge Function described in [DOG-CARDS-PHOTOS.md](docs/DOG-CARDS-PHOTOS.md).
6. New dates are empty. Use Dog database → Book for day. There is no external booking integration.

### Realtime, security and photos

Every group, move, booking and attendance mutation updates its day's revision in the same transaction. Clients subscribe to that date's `planning_days` row and the master `dogs` table, then retrieve a consistent snapshot. The same assignment state supplies cards, totals, day records and conflict calculations. Reconnect, focus and a 30-second health refresh reconcile missed events. See [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

The migration enables the needed publication entries. Check them with:

```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime';
```

`unique(planning_day_id,dog_id)` prohibits duplicate placement, including rebooking a departed dog. Composite foreign keys validate group membership. Checked SECURITY DEFINER functions use an empty search path and restricted execution grants. Staff cannot write tables directly or change roles. The checked enrollment RPC grants only fixed-workspace synthetic staff membership. Existing RLS and manager restrictions are retained. See [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Mutations briefly lock the day row and use the individual record version. A move changes location/order only; attendance changes status/timestamps only. A simultaneous move and arrival with the same version produces one success and one explicit conflict, then the client refreshes. Clear checks the day revision captured at confirmation and only removes Expected bookings.

The private `dog-photos` bucket accepts JPEG, PNG and WebP up to 5 MB. Staff can upload an initial photo before creating a dog. Existing-dog replacement uses the authenticated `replace-dog-photo` Edge Function: a unique image uploads, a checked transaction updates the dog, then the Storage API removes retired images. Clients have no direct delete permission, including managers. Failed/abandoned replacements enter a delayed cleanup queue; immutable retired paths cannot be restored by stale edits. Realtime refresh signs each new path independently. Signed URLs may remain valid until expiry after sign-out. See [release steps and cleanup](docs/DOG-CARDS-PHOTOS.md) and [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Connectivity and persistence

Editing pauses while saving, connecting or offline. Changes appear after server confirmation. The last in-memory board remains visible offline; a cold offline reload has only the cached application shell, not private records. There is no offline write queue and no browser-local allocation store. Supabase Auth may use browser storage for its session tokens.

If a request loses its connection, the server may still have committed it. Review the refreshed state rather than assuming nothing was saved. Concurrent actions on the same dog surface a conflict instead of silently overwriting a newer version.

Departures retain the daily row and last group. The current status, first arrival and most recent departure are recorded; migration 003 additionally records append-only movement and attendance events from its application onward. Group labels are historical snapshots; dog names/photos reflect the master record. No destructive dog-delete API is exposed.

## Architecture

```text
src/Planner.tsx           Board, Unassigned, database and day records
src/components/          Card, group lane, modal and dog editor
src/model.ts             Attendance types, date, counts and active-lane selectors
src/behaviour.ts         Pure composition-derived conflicts; fictional demo rules
src/repository.ts        Shared cloud/demo service contract
src/supabase.ts          Existing authenticated RPCs, Realtime and Storage
src/usePlanner.ts        Reconciliation, stale-response protection, write gating
src/demo.ts              Memory-only fictional bookings/attendance scenarios
supabase/migrations/     Original schema + additive attendance upgrade
tests/                  Model, actual PostgreSQL/RLS, browser and opt-in cloud tests
```

The layout renders group arrays rather than hardcoding three columns. Migration 002 allows display orders 1–4; it does not add a fourth group to real data. Manager UI configuration of group count remains future work. The three-group fixture verifies the desktop density target.

## Test and deploy

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:pwa
pnpm preview
```

[TESTING.md](docs/TESTING.md) documents executed checks and the opt-in live Supabase test. Hosted Auth/Storage, actual cross-device Realtime and physical Android acceptance are not implied by passing demo browser tests.

For the approved deployment, use a HTTPS static host with Node 22+, build `pnpm install --frozen-lockfile && pnpm build`, and output directory `dist`. Set the two public Vite variables before the build. Serve from the domain root; use revalidation for `index.html`/`sw.js` and immutable caching for hashed assets. Set the Supabase Auth site URL to the deployed origin. Rebuild after changing Vite settings. No frontend server secrets are needed.

The manifest, icons and service worker support Android installation from HTTPS. Actual installation still needs device verification. The owner subsequently approved deployment; STATUS.md distinguishes approval from completed publication.

## Future imports

Use the repository/service boundary for staged CSV validation, manager review and a stable `(source,external_id)` → dog UUID mapping. Never match records solely by name. Importing the master database must not imply a booking or physical arrival. Future booking imports must use the existing per-day uniqueness constraint and initialise Expected without resetting existing attendance. Do not implement Petboost until its integration is separately specified.

See [FUTURE_FEATURES.md](FUTURE_FEATURES.md) for deferred work.
