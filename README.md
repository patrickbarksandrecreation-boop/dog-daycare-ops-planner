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

There are 110 fictional master dog records, so ten remain unbooked and can be found through Dog database. Demo changes last only for the session and reset on refresh. Demo is not shared persistence. No cloud project or credentials have been supplied; live Supabase verification remains pending.

## Everyday operation

1. **Search unassigned** filters only active unassigned bookings for the selected day. **Dog database** searches master records separately; **Book for day** adds one Expected record to Unassigned. Existing bookings, including departed dogs, cannot be duplicated.
2. Drag a card's grip, or select a card then a group/Unassigned. Select the same card again, press Escape or use Cancel to deselect. Keyboard users can select and activate the destination buttons, or use the dnd-kit keyboard grip controls. Moves never mark arrival or reset attendance.
3. **Arrive** on an Expected card confirms physical receipt in one action. **Here** identifies Present dogs. Headings show **Present / Planned**; Planned means active Expected + Present in the group.
4. Right-click, double-click, tap the information button, or hold a stationary card to open details. Movement/scrolling cancels the hold; the separate drag grip never starts the hold timer.
5. **Mark departed** hides a Present dog from active lanes and retains its last group and timestamps in **Day records**. **Undo departure** corrects a mistake by restoring Present in the previous location.
6. Expected bookings can be removed with confirmation. Manager **Clear expected bookings** removes only Expected records and retains Present/Departed history.
7. Managers use **+ New Dog** to create a master record. Matching names require explicit acknowledgement that this is a different dog. The database opens filtered to the new name, ready to book it separately. Creation never silently books or receives a dog.
8. Existing dog editing, photo replacement and archiving remain accessible through the database or dog details. Archiving preserves saved references. Unarchiving is currently a database-administrator action.
9. Group pencils rename inline; optionally save the default for newly opened days. Already-created dates retain their label snapshots. Navigate dates or use **Today** in Australia/Brisbane; yesterday's records are never copied automatically.
10. On phones, group tabs switch views. With a card selected they become destinations; a drag can also drop on a tab. The horizontally scrollable Unassigned strip remains available above them.

Amber demo warnings identify a planned conflict where at least one dog is Expected. Red identifies two incompatible demo dogs currently Present together. Moves, arrivals and departures recalculate warnings from confirmed composition. Demo notes and rules are explicitly fictional and keyed by stable IDs. **Cloud behaviour rules are not configured in this iteration; no warning is not a safety assessment.**

## Configure Supabase

One Supabase project serves one workplace. There is no multi-tenant architecture or external booking integration.

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Run [001_planner.sql](supabase/migrations/001_planner.sql), then [002_attendance.sql](supabase/migrations/002_attendance.sql), once each, in SQL Editor. Alternatively use your normal Supabase CLI migration workflow. The migrations create the schema, checked RPCs, RLS, private photo bucket, Realtime publication, and independent attendance fields.
3. **Existing 001 installation: run only 002.** It preserves dog records and group placements; old daily rows become Expected because physical receipt cannot be inferred. Back up real records before applying migrations. No cloud migration was applied during development.
4. Keep email/password sign-in enabled; disable public sign-up and anonymous sign-in. Existing authentication is unchanged. Each account also requires an explicit staff profile. See [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
5. Create individual staff users in **Authentication → Users** using the create-user/password flow, not an invitation requiring an onboarding screen. Manage password resets through the project administrator. See [Supabase users](https://supabase.com/docs/guides/auth/users).
6. Authorise each user's UUID using SQL Editor:

```sql
insert into public.staff_profiles (id, display_name, role)
values ('PASTE-AUTH-USER-UUID-HERE', 'Your name', 'manager');
-- Repeat for ordinary staff with role 'staff'.
```

7. Copy `.env.example` to ignored `.env`, then enter:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-or-anon-key
```

Use only a public publishable/legacy anon key. **Never put a secret/service-role key, database password or staff password in a VITE variable**; those values are embedded in browser code. Restart the dev server after changes.

8. Sign in and check the connection indicator becomes Live. The first visit creates an empty day and snapshots its group labels; staff then enter bookings manually through the database. There is no Petboost integration.
9. Optionally run [demo_seed.sql](supabase/demo_seed.sql) in a test project for 20 fictional master records. It does not book or receive dogs. The richer 100-booking fixtures are isolated browser demos.

### Realtime, security and photos

Every group, move, booking and attendance mutation updates its day's revision in the same transaction. Clients subscribe to that date's `planning_days` row and the master `dogs` table, then retrieve a consistent snapshot. The same assignment state supplies cards, totals, day records and conflict calculations. Reconnect, focus and a 30-second health refresh reconcile missed events. See [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

The migration enables the needed publication entries. Check them with:

```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime';
```

`unique(planning_day_id,dog_id)` prohibits duplicate placement, including rebooking a departed dog. Composite foreign keys validate group membership. Checked SECURITY DEFINER functions use an empty search path and restricted execution grants. Staff cannot write tables directly or self-enrol/change roles. Existing RLS and manager restrictions are retained. See [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Mutations briefly lock the day row and use the individual record version. A move changes location/order only; attendance changes status/timestamps only. A simultaneous move and arrival with the same version produces one success and one explicit conflict, then the client refreshes. Clear checks the day revision captured at confirmation and only removes Expected bookings.

The private `dog-photos` bucket accepts JPEG, PNG and WebP up to 5 MB. Managers upload; staff receive one-hour signed URLs. Keep the bucket private. Old replacement objects are retained to avoid deleting a photo after an ambiguous save; administrators can remove unreferenced objects after a retention period. Signed URLs may remain valid until expiry after sign-out. See [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Connectivity and persistence

Editing pauses while saving, connecting or offline. Changes appear after server confirmation. The last in-memory board remains visible offline; a cold offline reload has only the cached application shell, not private records. There is no offline write queue and no browser-local allocation store. Supabase Auth may use browser storage for its session tokens.

If a request loses its connection, the server may still have committed it. Review the refreshed state rather than assuming nothing was saved. Concurrent actions on the same dog surface a conflict instead of silently overwriting a newer version.

Departures retain the daily row and last group. The current status, first arrival and most recent departure are recorded; this is not a full movement/attendance event audit. Group labels are historical snapshots; dog names/photos reflect the master record. No destructive dog-delete API is exposed.

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

For a future approved deployment, use a HTTPS static host with Node 22+, build `pnpm install --frozen-lockfile && pnpm build`, and output directory `dist`. Set the two public Vite variables before the build. Serve from the domain root; use revalidation for `index.html`/`sw.js` and immutable caching for hashed assets. Set the Supabase Auth site URL to the deployed origin. Rebuild after changing Vite settings. No frontend server secrets are needed.

The manifest, icons and service worker support Android installation from HTTPS. Actual installation still needs device verification. No merge or deployment is authorised by this redesign task.

## Future imports

Use the repository/service boundary for staged CSV validation, manager review and a stable `(source,external_id)` → dog UUID mapping. Never match records solely by name. Importing the master database must not imply a booking or physical arrival. Future booking imports must use the existing per-day uniqueness constraint and initialise Expected without resetting existing attendance. Do not implement Petboost until its integration is separately specified.

See [FUTURE_FEATURES.md](FUTURE_FEATURES.md) for deferred work.
