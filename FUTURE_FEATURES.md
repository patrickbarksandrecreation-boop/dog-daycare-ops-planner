# Future development

The approved scope now includes planning and Expected/Present/Departed attendance on one board, with fictional interaction rules for demonstration. [WORKFLOW.md](docs/WORKFLOW.md) is authoritative. These remaining possibilities are not implemented promises.

- CSV import with staging, stable source identifiers and manager review; external system integration only after its capabilities are specified.
- Temperament, handling requirements and structured behavioural history attached to stable dog UUIDs.
- Production interaction-rule authoring and storage, designed with the Behavioural Manager. Composition-derived warnings already work with fictional demo rules.
- Incident records with access controls, retention rules and audit history.
- Richer manager/staff permissions, in-app staff provisioning, password recovery and archived-dog restoration.
- Audit trail of assignment moves and names at the time of historical plans, if operationally required.
- Search pagination/virtualisation and photo thumbnail processing for very large directories; more granular locks if measured traffic justifies them.
- Photo orphan cleanup after a defined retention period, plus database backup/restore procedures appropriate to the selected Supabase plan.
- Optional multi-site tenancy only with explicit workplace membership on every record and revised RLS.
- Offline editing only after a conflict model is designed; Phase 1 intentionally disallows it.

AI suggestions, automatic allocation, billing, staff scheduling and Petboost integration remain outside this iteration. Attendance is now included and independent of group assignment.
