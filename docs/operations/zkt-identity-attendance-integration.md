# ZKT identity attendance integration patch

Prepared SQL: `supabase/zkt_identity_attendance_integration.sql`. Production target is Farmplast `eeobivvwjzakbweluwtm`. **Not applied to production; separate owner authorization required.** No Bridge, frontend, employee, SACS, terminal, biometric, feature-flag or historical-data changes were performed.

## Processing path

The existing Bridge `dispatch()` identity branch calls `identityAttendance()` → `ingest_zkt_identity_events()` → `process_zkt_attendance_to_work_logs()`. Previously the last RPC read only legacy raw logs. The patch wires verified identity input into that same RPC, without an extra worker or parallel work-log table. Existing legacy processing remains available; a UUID/day with verified identity input is excluded from legacy aggregation. The employee/day uniqueness constraint remains unchanged.

Changed existing objects: `ingest_zkt_identity_events`, `process_zkt_attendance_to_work_logs`, `v_employee_current_presence`. Two small SQL helpers are added: `zkt_event_fingerprint` normalizes the existing SDK event fields, and `zkt_native_attendance_input` validates existing permanent ownership, verified mapping, employment period and event-time boundaries. Two non-unique lookup indexes support event reconciliation. No mapping or employee UUID is created or reassigned by this patch.

Native input uses the mapping's exact `valid_from`/`valid_to`, existing period UUID and payroll context. Explicit IN/OUT is preserved; mode 255 uses chronological parity within that employee/period/work day. Night shifts before noon belong to the preceding work day. Unsupported punch sequences or multiple devices contributing to the same UUID/day are held for review rather than guessed. Closed, approved, manual, deleted and saved-payroll days are frozen. Former and closed employment periods are not rebuilt. A native OUT may close a current open legacy day only when its existing IN is proven to belong to that UUID/period; existing downtime is retained, and the compatibility lunch rule remains in effect for that adopted day.

Presence consumes the same verified identity input plus the unchanged legacy fallback, without duplicate physical inputs. Unknown ownership stays unresolved and the SQL view returns UNKNOWN when no owned punch is available. The separate pending Dashboard UNKNOWN-label edit is not part of this SQL patch or commit.

## Deduplication

Device identity must come from the configured verified device/serial or existing immutable `zkt_legacy_device_evidence`. The normalized fingerprint includes SDK user identifier, timestamp, verify mode, IN/OUT mode, work code and available record/event/log identifiers. Transport-only retry metadata does not create another event. Device equality is always checked separately. Different devices with equal numbers/timestamps remain different events and resolve through their own mapping intervals.

When exactly one legacy event has proven matching device and event identity, ingestion reuses that existing identity row. Both legacy-first and identity-first deliveries are supported. If the device of a matching legacy number/time is unknown, ingestion retains one native review event without assigning ownership or generating additional hours. Number/time similarity alone is a quarantine condition, never proof of duplication. Replays reuse the normalized native event and do not append review rows. Existing ambiguous rows are not deleted or mass-remapped.

## Evidence

Fresh read-only production snapshot restored into isolated PostgreSQL 17.6 at loopback port 55441, database `reuse_copy_1791758633576`. Scope: public schema/data, functions, views, triggers, RLS/grants, auth schema and UUID-only auth placeholders; no auth credentials or external integration secrets/jobs were restored. The private dump stays outside Git. SHA-256: `931a06fd078a1e798e1df4f8dde4bdd594e5552cedeab4ef4074dc32e142dedb`. All six production/restored row-checksum baselines matched before testing.

The test temporarily restores the original compatibility processor on the copy and proves that native IN/OUT creates no work log; restoring the patched processor then creates the correct UUID/day hours. Synthetic lifecycle states are seeded only on the disposable copy; all import/processor assertions use restored origin triggers and the actual service_role SQL role. All fixture changes roll back. No production employee was terminated, rehired or renumbered.

| Required scenario | Result |
|---|---|
| Ordinary IN/OUT | PASS |
| New UUID under a previous number, exact start timestamp | PASS |
| Old event replay without new hours/review copies | PASS |
| Legacy + identity, proven device and unknown device | PASS |
| Night shift, including mode 255 | PASS |
| Lunch/downtime preservation | PASS |
| NJ/PA equal number/time, distinct owners | PASS |
| Delayed old event retains old UUID | PASS |
| Repeated processor invocation | PASS |
| Payroll/Attendance History preservation | PASS |
| UNKNOWN ownership, no work log | PASS |

Additional PASS: mixed legacy IN/native OUT; identity-first/legacy-second; existing Presence fields unchanged for every original UUID; authenticated non-admin former isolation; anonymous helper access denied; definition rollback and reapplication with all six history baselines unchanged. The existing archive RPC still returns eight original former profiles. Database flags remain Archive ON, actions/reuse OFF.

Commands executed:

```powershell
# From repository root; runner refuses non-copy database names and pins loopback.
node docs/operations/zkt-identity-attendance-integration-test.mjs reuse_copy_1791758633576
# From client/zkt-bridge; all 19 existing tests PASS.
node --test test/identity.test.cjs test/core.test.cjs
```

No application build was repeated: application/API/SSO sources are unchanged. These copy tests do not establish physical NJ/PA readiness or live delivery.

## Authorized application and rollback

After separate authorization, verify target, current definitions, backup and SQL checksum, then apply only this patch with ON_ERROR_STOP through the protected database connection. Do not repeat Identity, Lifecycle, Release Gates or compatibility migrations. The patch checks exact baseline function/view fingerprints and Archive ON/actions OFF; definition drift aborts. The transaction briefly fences raw inserts and uses the existing processor advisory lock; no processor/backfill is invoked during application.

Rollback file: `supabase/zkt_identity_attendance_integration_rollback.sql`. It restores only the saved ingestion, processor and view definitions and removes the new helpers/indexes; events, ownership, work logs and provenance are retained. It returns the old identity-to-hours gap, so use only as an explicitly approved definition rollback, not as a healthy native-processing fallback. Never restore an older database over new Attendance records.

The repository Bridge already supports this RPC path: **SQL is sufficient for that identity-capable version**. Actual installed NJ/PA versions and device/serial configuration still require the previously requested operator JSONs (`zkt-NJ-baseline.json`, `zkt-PA-baseline.json`). A legacy-only installed binary/configuration cannot safely support number reuse; use the existing identity-capable build/configuration if needed under separate authorization. No new Bridge implementation or registration algorithm is proposed.

SQL patch readiness: READY, pending production authorization and a fresh preflight. Terminate/Rehire/Number Reuse remain OFF; this patch is not authorization or evidence to activate them. Zero/unverified mappings produce review, not automatically inferred ownership. Existing verified mappings are reused.
