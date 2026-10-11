# Anonymous synthetic pilot

Approved 10 October 2026. The pilot uses **anonymous Supabase sessions plus a display name**, with persistent browser sessions. Email/password and email OTP are not required. This decision supersedes earlier authentication recommendations.

The app signs in anonymously, then calls `join_synthetic_pilot(display_name)`. The database grants **staff** membership only in the enabled Synthetic pilot workspace. Callers cannot choose a role or workspace. Every enrolled participant can create active master dogs with an optional private photo. Existing profile editing, archiving, photo replacement/deletion, group renaming and clearing remain manager-only; anonymous enrollment does not grant manager access. Existing membership is preserved on retries. An enrollment ledger prevents a removed membership from being re-created by the same session. Closing enrollment prevents new joins but does not revoke existing members.

This is an openly joinable **fictional-data pilot**, not employee identity verification. Display names can be duplicated or impersonated. Browser storage loss or sign-out requires a new anonymous session. No real records should be loaded. Membership removal blocks the existing identity, but a new device identity can join while enrollment remains open. Stop enrollment or introduce controlled admission before real-world use. Supabase recommends CAPTCHA/rate controls for public anonymous signup; CAPTCHA integration is not currently added.

Supabase must have anonymous sign-ins enabled and saved. The application migrations are 001–004 followed by `20261010083809_anonymous_pilot.sql` and `20261011034943_explicit_conflicts.sql`, then `20261011050413_staff_dog_creation.sql`. Application SQL has been applied through the connected Supabase migration service; its migration ledger uses service-generated timestamps, recorded in STATUS.md. Do not replay the short local version numbers through CLI blindly.

The `.env.local` file contains only this project's URL and public publishable key and is Git-ignored. Sessions are persisted by Supabase JS; tokens must never be printed or committed. Netlify needs the same two public build variables. No privileged key is needed by the frontend or live test.

Run the opt-in live check with Node 24, the configured local app, and an unused synthetic test date:

```powershell
$env:LIVE_TEST_CONFIRM='synthetic-pilot'
$env:TEST_PLAN_DATE='2035-10-10' # choose another empty date for a repeat run
$env:TEST_APP_URL='http://127.0.0.1:5174'
node --env-file=.env.local tests/live-anonymous.mjs
```

It creates two fictional anonymous test users and master dogs and retains attended test records, photos and audit events. It checks staff creation with duplicate acknowledgement, separate booking, initial private photo upload/read, cross-session dog visibility after synchronization and refresh, denied existing-profile edits/archive/uploads/rename/clear, browser enrollment, persistence, Realtime convergence, competing moves, attendance, history restrictions, role escalation and offline recovery. It does not delete historical records.

Post-migration security advisors flag authenticated SECURITY DEFINER RPCs and the deliberately inaccessible `pilot_enrollments` ledger. These are intentional, reviewed controls, not blanket public access: grants, membership predicates, workspace checks and tests protect the RPCs. [SECURITY DEFINER advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [deny-by-default ledger advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Live acceptance passed on 11 October 2026 against Supabase with the local frontend and two independent ordinary staff browser sessions. The staff-creation extension passed on test date 2035-10-14, including private initial photo upload/read and both participants seeing both new dogs after synchronization and refresh. Stale writes use PT409 / HTTP 409; the earlier 40001 response timed out in the hosted path. The exact intermediary cause is unconfirmed. See STATUS.md for evidence and remaining hosted/device checks.
