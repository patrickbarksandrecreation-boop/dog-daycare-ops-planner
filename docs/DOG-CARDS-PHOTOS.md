# Dog cards, breeds and staff photo replacement

Prepared 11 October 2026 against approved main `45e1b88`. Cloud changes are **not applied** and the Edge Function is **not deployed**.

## Behaviour

Group tiles show a photo/initials, readable short name, optional breed abbreviation, attendance and existing warnings/markers. The grid adapts to lane width; desktop has five columns per group and 390px mobile has two. Grip drag, card selection, hold/right-click/double-click information, keyboard controls, reorder, independent attendance and planned/present counts remain.

Breed is optional free text (160 characters), never inferred. Staff can supply it at creation; existing profile edits remain manager-only. Database search matches full names or breeds. Details/database show the full breed; `src/dogLabels.ts` contains explicit compact aliases and a readable truncation fallback. Duplicate first names use a surname initial and a stable ordinal if initials also collide. Full names remain accessible in details, tooltips and control labels.

## Review and release order — approval required

1. The restored `20261011070104_petboost_dog_metadata.sql` is the **unchanged previously applied** metadata migration missing from main. On the connected project its cloud version is `20261011070358`: do not apply it again. It adds no integration. Fresh installations run it in filename order.
2. Review and apply **only** the new `20261011082513_dog_breed_staff_photos.sql` to the existing project. It preserves existing breed/import metadata, attendance and history. It adds a five-argument `save_dog`, retaining the old signature for older clients. Breed remains nullable. The constraint is NOT VALID for historical rows, so existing imported descriptions are not rewritten; new/edited rows enforce length.
3. Deploy `supabase/functions/replace-dog-photo` with JWT verification enabled (see config.toml). It uses the existing server-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put the service key in frontend variables. The function additionally calls Auth `getUser` and checks current database membership through the service-only RPCs.
4. Verify on synthetic records using two enrolled staff sessions: replacement, refresh/realtime propagation, simultaneous stale replacements, failed upload, private download and denied unrelated edits. Then approve merge/frontend publication. An older frontend cannot replace existing photos after the new policy is applied; coordinate this short release window.

No merge, deploy or cloud migration is included in this change. Existing cloud migration versions differ from local filenames; do not use an indiscriminate migration push.

## Storage and permission design

All enrolled staff (including the existing approved anonymous-auth staff sessions) may replace workspace dogs' photos. An unauthenticated `anon` caller and an authenticated user without a staff membership cannot. Enrollment policy is unchanged; a display name still does not prove employee identity.

The bucket stays private, with signed reads. Initial uploads retain scoped INSERT access. Existing-dog uploads and all deletions use the Edge Function, including manager requests. Staff gain no direct dog UPDATE, role-change or database-administration rights.

The function accepts JPEG/PNG/WebP up to 5 MB, checks MIME against signature bytes and bounds the multipart body before parsing. It reserves a unique, non-overwriting path, uploads, then calls a transaction that locks the dog and pending upload, compares the expected previous path, verifies the object exists and updates only photo path/provenance/timestamp. Dog Realtime events trigger existing reconciliation. A changed path receives a fresh signed URL; old cached links are evicted.

The private object ledger tracks pending/current/retired states. Old images retire only after a successful replacement, and only when no dog references them. Retired paths cannot be reused: existing profile saves preserve the current photo, and replacement commits accept only newly reserved pending paths. An ambiguous commit response cannot retire a current image. Cleanup uses the Storage API, never SQL deletion of Storage objects. See [Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects).

Failed uploads are retired with a 24-hour grace period so a late Storage response cannot race immediate deletion. Pending uploads expire after 24 hours; commits cannot use expired/retired entries. Each replacement retries up to 50 queued deletions for that caller's workspace. A signed-in staff client can also request a cleanup pass with `supabase.functions.invoke('replace-dog-photo', { body: {} })`; no caller-supplied deletion paths are accepted. Repeat if a backlog exceeds 50. Deletion failures retain the queue and return `cleanupPending` without reporting a saved photo as failed. Tombstones remain in the small private ledger.

## Evidence and limits

- PostgreSQL tests run application SQL/RLS in local PGlite; Storage transport and Auth runtime are simulated. They cover permission denial, membership revocation, legacy metadata, optional breed, delayed uploads, stale competing commits, retirement, expiration, and protection of the final referenced image.
- Edge orchestration tests cover validation, upload/commit order, failure/ambiguous-response recovery and deletion retry. `pnpm test:edge` statically checks the handler using the installed matching Supabase SDK and minimal Deno declarations; it is not a deployed Deno runtime test.
- Chromium tests exercise the actual local frontend, including a test-only staff repository harness. The screenshots use fictional dogs, optional breeds and initials; upload rendering uses the application PNG fixture, not real dog photographs. No private roster images enter the repository.
- Hosted replacement, actual multi-device photo propagation, physical-phone camera capture and workplace recognition of 66px desktop photos remain unverified until the approved deployment/device trial.
- Configured production build/PWA checks also pass with placeholder public configuration; the existing non-blocking bundle-size warning remains (545 kB before gzip).
- Cleanup is opportunistic/manual; no scheduled worker is installed. Old unreferenced objects from before this feature and abandoned *initial creation* uploads are deliberately not swept. Membership revocation can leave pending uploads until another authorized staff member invokes cleanup. Existing signed URLs may remain usable until expiry.

Screenshots: [desktop](screenshots/desktop-1920.png), [mobile](screenshots/mobile-390.png). Test totals and measured density are recorded in STATUS.md.
