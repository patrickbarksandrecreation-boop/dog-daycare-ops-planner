# Dog Daycare Operations Planner: Codex guidance

Purpose: Build a fast, phone-friendly collaborative operational board for a high-volume dog daycare (~100 dogs/day).

- Product behaviour and non-goals: `docs/PRODUCT.md`. Read when deciding UX or product behaviour.
- Approved operational workflow and GUI requirements: `docs/WORKFLOW.md`. This supersedes historical layout, planning and attendance descriptions in PRODUCT.md and ROADMAP.md.
- Build milestones and acceptance criteria: `docs/ROADMAP.md`. Read for new features.
- Current implemented state and next task: `docs/STATUS.md`. Read at the start of substantive new work; keep concise and factual.
- Make the smallest tested change that achieves the current task. Inspect relevant code before editing. Do not rearchitect unrelated areas.
- Run focused tests; report what passed, failed, or could not run. Never claim a deployment or cross-device test without evidence.
- Keep touch interactions usable; drag-and-drop must have a tap alternative. Enforce one current location per attending dog at the data layer.
- Synthetic dog data only until workplace approval, access controls, and privacy review. Never commit credentials. Anonymous access is for demo data, not private staff/dog records.
- Do not deploy to production, change hosting credentials, or introduce external paid services without explicit approval.
- End with: change summary, tests/evidence, limitations, and next logical step. Avoid lengthy narrative and broad speculative future work.
