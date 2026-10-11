# Product brief (v0.1)

> Historical product brief. The approved 10 October 2026 operational workflow and GUI requirements in [WORKFLOW.md](WORKFLOW.md) supersede the layout, placement and attendance descriptions below. Planning and attendance now share one board, including Expected dogs. Current setup and authentication are documented in the root README.

## Mission
An operational companion to booking systems such as Gingr. It helps daycare handlers coordinate where dogs are, who supervises them, and what behavioural information affects later decisions. It does **not** replace bookings, billing, or customer communication.

## Users and setting
High-energy workplace; around 100 dogs/day; multiple staff on phones, tablets and desktops. Staff must supervise dogs, so interactions must be quick, readable, minimal typing, with large touch targets. Product owner has access to coworkers for real-world feedback.

## Core mental model
- **Dog**: stable identity, name, optional photo, synthetic fixture in early builds.
- **Daily attendance**: expected / on-site / departed, distinct from a dog's current location.
- **Area**: three primary groups with easily editable headings; additional physical areas later.
- **Placement**: one authoritative actual location per on-site dog, or clearly unassigned/unknown. No simultaneous placement in two groups.
- **Planned vs live**: future group plans must not silently change actual location. Clearly label mode/state. Initial demo may focus on one board with explicit DEMO/NOT LIVE banner.
- **Observation**: time- and author-attributed information; later may involve two or more dogs. Distinguish routine notes, attention-worthy interactions and serious incidents.
- **Active advisory**: explicit temporary management instruction, with origin, expiry/review and status; not an automatic behavioural diagnosis.

## Phone-first operations
A user opens a shareable URL, enters a display name and uses the board. No password in synthetic-data pilot. Desktop arrangement: searchable dog list at left, three large group boxes in the centre, and a selected-group roster/count at right. On mobile, reorganise those panels into a focused single-column/tabs flow. Search dogs, add to today's roster, move among 3 primary groups by tap; desktop drag/drop can be additional. Show dog name, optional photo/placeholder, group count, and fast find. Changes must not silently disappear.

## Collaboration (realtime milestone)
All devices share persistent authoritative state. Startup and reconnection re-fetch the server state. Simultaneous moves must not create duplicates or silently overwrite state; signal if a user's view was stale. Record basic actor/time for changes, but a typed display name is not verified staff identity.

## Pilot security boundary
Initial demo uses 100 generated, fictional dogs and no sensitive information. Shared links and anonymous sessions are not adequate protection for real client details, identifiable dog photos, staff records or incident data. Require workplace permission and appropriate invitation/authentication, tenant scoping, row-level security and retention policy before any real records.

## Explicit non-goals for early prototypes
Booking/billing integration, AI group recommendations, automatic safety determinations, behavioural scoring engines, full incident-report compliance workflows, push notifications, complex scheduling and analytics.

## Quality standard
No confusing stale information or silent errors. Usability testing starts with 100 dog fixtures, narrow phone viewport, and at least two phones once realtime exists. The app must clearly identify whether it is a demo or an authorised live system.
