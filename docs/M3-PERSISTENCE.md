# M3 synthetic persistence

Subsequent runs/markers feature: also apply `004_runs_markers.sql` after 003. See WORKFLOW.md for operational behavior. Both new RPCs are available to workspace staff with version checks; direct table writes remain denied. Marker fields belong to master dogs; run selection belongs to daily group labels. These edits use existing Realtime signals and do not append dog movement events.

## Plan and scope

Reuse the existing Supabase client, snapshot RPC, Realtime reconciliation and board UI. Migration 003 adds workspace isolation and movement history to migrations 001–002. No behavioural-note tables or APIs are added. The subsequently approved anonymous session and display-name flow is implemented and documented in [ANONYMOUS-PILOT.md](ANONYMOUS-PILOT.md), which supersedes the historical password-account setup below.

## Model and guarantees

- `workspaces`: synthetic pilot boundaries. Each `staff_profiles` record is membership in exactly one workspace. The approved enrollment RPC grants staff membership only in the fixed enabled synthetic workspace. Other memberships remain administrator-provisioned; there is no browser workspace switch.
- `dogs`: workspace-scoped master identities. `group_configurations` represents areas; `daily_group_labels` preserves area names for each day.
- `planning_days`: unique workspace/date. `daily_assignments`: unique day/dog, independent Expected/Present/Departed attendance and one nullable area. Null explicitly means Unassigned. Expected dogs may be preplanned; Departed retains the last area as historical context and is excluded from the active board.
- Composite foreign keys prohibit cross-workspace dogs, days and areas even during privileged imports.
- RPCs lock the workspace's day row before mutations. Moves and attendance require the caller's expected assignment version; conflicting stale writes raise SQLSTATE PT409 after the explicit-conflicts migration (previously 40001). Clients re-fetch confirmed state. Different dogs on a day serialize briefly; this is suitable for the pilot, not a throughput benchmark.
- `movement_events` records booking, explicit moves (including same-area reorder), attendance transitions and removals. Each event contains workspace/day/dog/assignment IDs, old/new area and status, assignment version, actor UUID, display-name snapshot and server timestamp. Rank normalization of neighboring cards is not a separate move. Events are inserted by a trigger in the mutation transaction; a failure rolls back both. There is no event editing RPC or client INSERT grant. UPDATE, DELETE and TRUNCATE are additionally rejected by a trigger.
- History starts at migration 003. Existing rows are preserved; their earlier movements are not fabricated. Event assignment IDs deliberately have no cascading foreign key, so removing an Expected booking keeps its events. Events do not preserve historical dog names, area names or exact rank positions. Database owners can disable triggers; this is not a tamper-proof compliance log.

## Access matrix

| Caller | Reads | Writes |
|---|---|---|
| Unauthenticated `anon` | No board, membership, history or photos | None |
| Authenticated without membership | No workspace data | RPCs reject membership absence |
| Workspace staff | Own profile; own workspace, dogs, days, areas, placements, events and photos | Create active dogs with optional breed/photo; scoped photo replacement through Edge Function; book, move, arrival, departure, remove Expected through checked RPCs |
| Workspace manager | Same scoped reads | Staff operations plus existing master name/breed editing/archive, area rename, clear Expected. No direct Storage deletion after the photo migration. |
| Another workspace's member | No rows from the first workspace | Foreign IDs rejected by scoped RPC checks and composite constraints |
| Database administrator | Privileged administrative access | Workspace creation/membership provisioning and migrations; never browser credentials |

All application tables have RLS. Client table writes are denied; only checked SECURITY DEFINER RPCs can mutate operational data. Functions use an empty search path and restricted execution grants. Workspace membership comes from database records, never user metadata or a client-supplied workspace ID. Storage reads and writes are workspace-scoped; new paths are `workspaceUUID/dogUUID/object`. Legacy images are readable only through an existing same-workspace dog reference. Signed URLs already issued may remain usable until expiry.

Display names do not prove verified employee identity. Neither does a Supabase anonymous session: anonymous Auth users receive the `authenticated` database role. The approved anonymous enrollment RPC provisions restricted synthetic staff membership; see ANONYMOUS-PILOT.md. See [Supabase anonymous authentication](https://supabase.com/docs/guides/auth/auth-anonymous) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Additional administrator setup for isolated access tests

1. The existing project is configured; do not replay migrations. For a fresh installation follow ANONYMOUS-PILOT.md and the applied-version mapping in STATUS.md. Migration 003 places existing data and memberships in workspace `00000000-0000-4000-8000-000000000001`; it does not infer multiple tenants from old data.
2. Ordinary users use anonymous enrollment. For the optional provisioned-account manager/photo harness, administrators may create separate synthetic manager/staff accounts. This does not require changing or disabling the approved anonymous sign-in settings. Keep account credentials out of source control.
3. Insert memberships as administrator, replacing UUID placeholders:

   ```sql
   insert into public.staff_profiles(id,display_name,role,workspace_id) values
     ('MANAGER-AUTH-UUID','Synthetic Manager','manager','00000000-0000-4000-8000-000000000001'),
     ('STAFF-AUTH-UUID','Synthetic Handler','staff','00000000-0000-4000-8000-000000000001');
   ```

4. For another isolated pilot, create a workspace and its areas explicitly, then provision users into that workspace:

   ```sql
   insert into public.workspaces(name) values('Second synthetic pilot') returning id;
   -- Substitute the returned UUID in both the areas and staff_profiles records.
   insert into public.group_configurations(workspace_id,default_name,display_order) values
     ('WORKSPACE-UUID','Group 1',1),('WORKSPACE-UUID','Group 2',2),('WORKSPACE-UUID','Group 3',3);
   ```

5. Copy `.env.example` to ignored `.env`. Set only `VITE_SUPABASE_URL` and the **public publishable/anon key**, then restart/build. All VITE variables are public browser assets. Never use a service-role/secret key, database password or test-user password there. No workspace environment variable is necessary; membership determines scope server-side.
6. For the original synthetic workspace, optionally run `supabase/demo_seed.sql`. It creates fictional master dogs only. Sign in, book dogs for a test date, preassign them, receive them and move them. Reopen the date after reload to confirm persistence.
7. Verify `planning_days` and `dogs` belong to the `supabase_realtime` publication. Clients already subscribe and re-fetch on events, reconnect, focus and every 30 seconds; RLS filters events to membership. Offline writes are blocked. Check the same board on two separate authenticated browsers and race two moves based on the same version: exactly one should succeed.
8. Inspect history with `select * from public.movement_events order by id;` under the appropriate authenticated session. SQL Editor as postgres bypasses RLS and is not an access-rule test. Run the opt-in live test in TESTING.md only against a disposable project; it preserves attended records/history.
9. No hosting deployment is part of these steps. Before enabling real data, obtain workplace approval and review employee verification, membership lifecycle, retention, abuse controls, backups and incident response.

## Verification limits

`pnpm test` executes versioned SQL with PostgreSQL/PGlite and mocked Supabase Auth/Storage schemas. M3 tests cover upgrade preservation, workspace isolation, constraints, access rules, stale competing requests, atomic rollback and append-only history. PGlite serializes requests: this verifies version rejection but does not reproduce independent PostgreSQL connections contending on locks. The opt-in hosted test uses separate clients and browsers. Hosted Auth, actual Realtime isolation, network failures and physical multi-device behavior remain unverified until project credentials and accounts are supplied.
