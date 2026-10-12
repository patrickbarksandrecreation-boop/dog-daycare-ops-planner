# Handling notes and interaction rules

Implemented on `codex/handling-notes-interaction-rules`. The migration is additive and **not applied to the hosted project**. Merge and deployment require separate authorization.

## Staff workflow

Open dog information from a card or Dog database → dog markers. **Edit notes** opens a multiline field; Save notes commits it and Cancel discards the draft. Empty notes clear the content. Notes allow 5,000 characters.

**Add rule** searches active master dogs by name or breed and shows their photo/initials, full name and breed. The current dog is excluded. Dogs with an existing pair rule are shown disabled and labelled. Select a dog, choose Hard or Soft, and enter an explanatory note (1–2,000 characters). Edit changes level/note; changing the pair requires removing and adding a rule. Removal requires confirmation showing both names, level and note. A single shared rule appears on both profiles.

- **Hard — Must not mix.** Red group warning, including when either dog is only Expected.
- **Soft — Monitor closely and assess.** Amber group warning, including when both dogs are Present.
- **Planned** means at least one dog is Expected. **Present** means both are Present. Departed or unassigned dogs produce no active pair warning.

Open the group warning for both full names and the instruction. Text and an alert icon accompany colour. Mixed groups may have multiple rule levels; a hard rule takes precedence in the summary colour. Existing run warnings retain their attendance-based colours. All warnings are advisory: no interaction rule blocks attendance, booking or movement. No compatibility is inferred from breed, name, photo or absence of rules.

The editor keeps drafts when a remote update arrives. A stale draft cannot save; copy it if necessary, Cancel, and reopen to review the latest state. Server conflicts also refresh the board and display an error inside the dialog. Offline mode retains the last loaded board and disables edits. Cloud records are not newly cached on disk: offline viewing requires an already-loaded session, as before.

## Storage and access

Apply `supabase/migrations/20261012044344_handling_notes_interaction_rules.sql` only after all migrations in the existing ledger and only with explicit approval. Do not replay earlier migrations. Release the schema before the frontend: the new client refuses to open an old cloud snapshot that lacks `rules`, rather than silently displaying no warnings.

- Notes and an independent `notes_version` live on `dogs`; profile/photo/marker saves cannot overwrite them. The change records a timestamp and staff display name.
- `interaction_rules` stores canonical ordered dog UUIDs. Database checks require distinct dogs, a valid level/note, valid workspace-scoped dog references, and one unordered pair per workspace. Version checks protect edits and removal. A recreated pair gets a new UUID, so a removed rule's stale editor cannot update its replacement.
- Enrolled staff call narrowly scoped `set_handling_notes`, `save_interaction_rule` and `remove_interaction_rule` RPCs. Each checks current membership and workspace. These follow the existing SECURITY DEFINER RPC architecture, use an empty search path and deny anonymous execution. Direct client writes are denied; RLS limits reads to current membership.
- `behaviour_events` retains before/after values, actor UUID, display name at the time, and database timestamp. Triggers append events atomically with the changes, including removal. Client inserts/edits/deletes/truncation are denied; the existing append-only trigger also rejects mutation. There is no audit-history UI or retention/expiry scheduler. Database owners retain administrative powers.
- Notes naturally emit existing dog Realtime events. Rule triggers touch both referenced dogs in the same transaction, so the existing RLS-protected dog subscription refreshes all open dates after rule creation, edit or removal. This avoids relying on unfilterable rule DELETE events. The single-statement planning snapshot includes notes and rules; reconnect, focus and periodic refresh remain fallbacks.
- Archived dogs referenced by rules remain in the snapshot so profiles/warnings retain their names. New rule selection excludes archived dogs; existing rules remain editable/removable.

## Fictional demo

Notes, rules and their fictional audit trail persist in browser local storage, separately for each scenario. Storage events synchronize same-browser tabs; Web Locks serialize writes before version validation. A storage failure rolls back the in-memory edit and reports failure. Browsers without Web Locks cannot edit demo handling data. Demo board bookings, moves and attendance still reset on refresh. Newly created fictional dogs referenced by saved handling data are retained without temporary photo URLs. Local storage is not a trusted audit system or shared cross-device database; clearing browser data resets the fictional notes/rules. Cloud uses PostgreSQL and Supabase Realtime instead.

## Verification and release boundary

Automated checks cover local PostgreSQL membership and workspace isolation, immutable audit events, database constraints, version conflicts, duplicate pairs, shared snapshots, and advisory placement/attendance. PGlite serializes submitted statements: competing expected versions are tested, but this is not a hosted multi-connection contention test. Chromium exercises notes, searchable selection, symmetry, edit/removal, stale drafts across two demo tabs, refresh persistence, offline gating, advisory hard warnings and 390px keyboard operation.

Hosted two-staff Realtime delivery, hosted contention and physical-device checks remain unverified until an approved schema release. Existing synthetic-only enrollment and privacy limitations continue to apply. Do not use real dog/owner records without workplace approval and privacy review.
