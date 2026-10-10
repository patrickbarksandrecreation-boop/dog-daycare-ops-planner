# Roadmap and acceptance contracts (v0.1)

> Historical milestone plan. [WORKFLOW.md](WORKFLOW.md) is the current operational and GUI source of truth; [STATUS.md](STATUS.md) records implemented functionality and verified limitations. The old panel layout and anonymous-session proposal below do not override the approved workflow or existing staff authentication.

## M0: Repository foundation
Create Vite + React + TypeScript app, lean docs, lint/typecheck/test commands, `.env.example` if needed. No external services or real data.
**Pass**: clean install/build; tests runnable; next task explicit.

## M1: Phone-friendly standalone board
Responsive 3-group board; editable headings; desktop left searchable dog roster, centre group boxes, right selected-group roster/count (mobile-friendly equivalent); 100 fictional dogs; add dog to day; view group totals; click/tap moves, optional drag/drop; each dog in at most one area. Local persistence is optional but if used clearly labelled device-only; prominent demo status. Mobile usable at ~390px wide.
**Pass**: 100 fixture dogs, no accidental duplicates, touch workflow tested, responsive screenshots/viewport checks, no reliance on backend. This phase does not claim live multiuser functionality.

## M2: Shareable hosted demo
Set up PWA manifest/icons and Netlify-friendly deployment/config. Publish only when authorised and hosting connected. Browser first, home-screen install optional.
**Pass**: HTTPS pilot URL opened on phone, install guidance, no fabricated deploy-success claims, fresh reload works.

## M3: Shared realtime board
Supabase schema + migrations + row-level security appropriate for **synthetic-only** demo; anonymous device sessions + optional entered display name; authoritative placement writes; realtime subscriptions + re-fetch on reconnect; error, offline and sync indicators; audit events for moves. Keep project/service credentials out of git.
**Pass**: 2 devices see changes without refresh, reload preserves state, simultaneous edits resolve consistently, security tests show expected policy boundaries. If cloud project/keys absent, leave integration ready and give precise manual setup steps; do not pretend end-to-end verified.

## M4: Quick operational notes and feedback
Frictionless feedback form, app version tagging, quick dog/pair observation with actor/time, active advisory surfaced when relevant. Use synthetic examples only.
**Pass**: staff can log an example in a few taps and see it on another device; no automatic behavioural diagnosis; observations and advisory lifecycle clearly distinguishable.

## M5: Controlled workplace evaluation
Observe 3–5 coworkers using the demo with fictitious records. Record task completion, confusion, mobile pain points and bugs. Prioritise fixes by operational impact.
**Pass**: concise findings, top problems, next approved slice; do not introduce real data merely because demo worked.

Each milestone should ship via a focused branch/PR, with evidence and a human merge/release decision. Implement only the current milestone; no speculative features.
