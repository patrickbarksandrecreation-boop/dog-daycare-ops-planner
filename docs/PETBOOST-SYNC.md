# AI Petboost booking and arrival sync

This replaces the legacy calendar/detail scraper and persistent Linux worker. The sync uses **`gpt-6.1-terra` with `reasoning.effort: low`** through the Responses API. There is no model fallback. Group-moving logic is explicitly outside this function.

## Operational contract

- Read the configured Petboost business for the current Australia/Brisbane calendar date, without changing Petboost.
- Reconcile the full Appointments calendar against Mission Control's booking/profile links. Include daycare, Orientation Day and bus services; exclude grooming-only, courses, cancelled and no-show bookings.
- Match the exact appointment ID across views and the stable pet profile ID within each appointment. Support multiple dogs in one booking and deduplicate multiple services for one booking/pet pair. Never identify dogs by names alone.
- Add missing master profiles and daily bookings without duplicates. New bookings enter Unassigned.
- Automatically mark verified arrivals Present. Only In Progress / Checked In / Arrived proves a current arrival; payment, completion and scheduled times do not. Only Expected transitions to Present. Preserve existing arrival timestamps, Present dogs, Departed dogs and manual removals.
- Preserve every existing group assignment, lane order, colour, photo, name, note and manual edit. No auto-grouping or sorting is part of this sync.
- Mark previously imported bookings absent from a **complete** current source list inactive (cancelled/no longer booked), preserving profiles and board records for review. No permanent deletion is performed.

The weekday schedule remains 06:30, 07:30, 08:30, 09:30, 10:30 and 11:30 Brisbane, plus the existing manual Sync bookings button. No new ChatGPT scheduled task is created.

## Execution

1. Claim the existing fenced workspace lease, restore the encrypted Petboost session and verify the exact business and date.
2. Copy rendered booking fields from both complete views. Observed current markup is `[data-scheduler-card][data-appointment-ids]` in Appointments and `[data-scroll-card]` plus `h3` profile links in Mission Control. Unknown/incomplete markup fails closed.
3. Make one Responses API request to Terra low with strict structured output. Input contains only the business/date and rendered booking IDs, dog/profile names, services and statuses. It excludes credentials, session storage, customer contacts, notes and private application/network state. `store:false` is set.
4. Require one model decision for every calendar card. Validate IDs against the collected rows, all eligible profile coverage, service exclusions and explicit arrival evidence. Model output cannot omit a dog, invent an ID, manufacture an empty day or write directly to the database.
5. Re-read both views after inference. Changed dates, lists or arrival statuses reject the entire run. A seven-minute watchdog aborts the model request before the eight-minute lease expires.
6. Refresh encrypted session state and apply the validated snapshot through `apply_petboost_ai_sync`. This service-only transaction reuses the existing ID importer and day lock, updates Expected arrivals with version increments/history and touches the day revision for Realtime. Group/order fields are not written.

## Configuration and release

See [PETBOOST-NETLIFY.md](PETBOOST-NETLIFY.md) for the existing server/browser setup. New requirement: **server-only `OPENAI_API_KEY`** with access to `gpt-6.1-terra`. Never expose it as a `VITE_` variable. Missing keys, provider errors, refusals, timeouts and invalid output stop the sync and preserve the board; the UI reports `ai_unavailable` where appropriate. Provider error bodies are not logged.

Apply the additive `petboost_ai_arrivals` migration after checking the actual migration ledger. It adds the AI importer and error code and invalidates legacy hosted verification. Existing disabled/import access controls stay in place. Pass a fresh hosted read-only AI verification before enabling imports. The historical migrations remain in the repository; their low-level ID importer is reused, but the application dispatches only the AI importer.

An API call does not inherit ChatGPT's browser session. The hosted browser must independently restore its own verified Petboost session. Local setup also needs the API key; seeding verifies both initial and restored-session reads, so it makes two AI calls without importing.

## Evidence and limitations

Synthetic unit, database and browser tests cover the model request, strict validation, service scope, multiple pets/services, source changes, expiry/failure behavior, atomic arrival transitions, unchanged groups/order, manual removals and departures. These are distinct from a real model response and a hosted authenticated run.

The signed-in cloud browser was inspected read-only on 4 November 2026 and confirmed the current overview/calendar DOM, dates, counts and ID attributes. No real names, rosters or session material are committed. Production/API credentials and hosted acceptance are not established by this inspection. Existing Netlify Chromium memory constraints still require hosted verification; switching to AI does not itself resolve browser hosting constraints. The new reader uses four list navigations instead of opening every appointment.

OpenAI API usage is billed separately from browser hosting/Supabase. Exact cost depends on the day's list and token usage. No API invocation, billing change, migration application, activation, merge or deployment is claimed by the implementation.
