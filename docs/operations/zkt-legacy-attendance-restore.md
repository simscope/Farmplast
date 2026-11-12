# Restore original Attendance behavior and keep the archive

Prepared only. Production Farmplast `eeobivvwjzakbweluwtm` and Vercel deployment were not changed. Apply only `supabase/zkt_legacy_attendance_restore.sql` after separate owner authorization; do not apply `zkt_identity_attendance_integration.sql` as part of this release.

## Reference and restored behavior

Git reference `0d2989ddb2887fbcf49bd813390ae1a81733b5f2` predates Former Employees. Its App already contained `/employees`; the owner now explicitly requests its removal. Original database rules are preserved in the pre-Identity backup's Presence view and `process_zkt_attendance_to_work_logs_pre_identity()`.

Identity migration changed Presence and rebuild RPCs to mandatory ownership reads and queued all legacy events. The authorized compatibility patch restored chronological Attendance pairing but retained employment-period timestamp prerequisites and changed overnight Presence parity. This prepared patch removes those prerequisites for ordinary unambiguous Employee Numbers and restores original calendar-date Presence parity. It creates no mappings and changes no employee UUIDs or ZKT registration.

Changed SQL objects:

- `zkt_compat_event_owner(uuid)`: existing immutable ownership takes priority; otherwise the existing Employee Number resolves only when employees/employment history and overlapping mappings identify one UUID. No hire-date or period-recorded-at prerequisite for ordinary, never-reused numbers. Conflicting owners remain unresolved.
- `zkt_capture_legacy_insert()`: retains the original raw event in the additive identity table, but creates review only for an ambiguous owner. Existing 10,578 review rows are retained. No historical backfill or purge runs.
- `process_zkt_attendance_to_work_logs()`: pairing, night work dates, 13-hour bound, lunch and existing downtime protections remain unchanged. A newly received late event now makes its earlier work day eligible; matching old punches for that day can form IN/OUT. Other historical days are not bulk rebuilt. Closed, edited, approved, deleted and saved-payroll rows remain frozen.
- `v_employee_current_presence`: original calendar-date parity and last-punch rules, with UUID isolation for ambiguous/reused numbers. Unknown ownership is not assigned to the current holder.

The dangerous original DELETE/rebuild of every unlocked historical ZKT work log is deliberately not restored: it conflicts with the owner's history-preservation requirement. Existing rebuild RPCs and insert triggers continue calling the same canonical processor. All new tables, RLS, archive permissions and independent action gates remain in place.

## UI removal

Deleted `client/src/pages/EmployeesPage.jsx` (1,408 lines including its inline styles and page-specific handlers), its lazy import and rendered route. `/employees` now contains only a replace redirect to `/dashboard`. No replacement Active page was added. Both archive Back states point directly to `/dashboard`.

Shared EmployeeModal, EmployeeNumberSuggestion, photo utilities, worker lists and Payroll components remain because Dashboard still uses them. The Former table, eight UUID/card links, dates, filters, search, sort, compact toolbar and Active-card cleanup are preserved. SACS API/SSO, Bridge and terminal sources are unchanged. The pre-existing uncommitted Dashboard UNKNOWN-label edit is excluded from this release.

## Evidence

Fresh production public/auth-schema restore to isolated PostgreSQL 17.6, loopback 55441, `reuse_copy_1791761321746`. Private dump SHA-256: `68b560be298febbebd5b95b94e94d823332fdbe9133e72e6cff99f186cc395ba`. Public schemas/data/functions/triggers/RLS/grants are restored; auth credentials and external service secrets/jobs are excluded. Original source/copy row checksums match. Synthetic fixtures run only on this copy, with origin Attendance triggers restored after fixture setup and every fixture rolled back.

```powershell
node docs/operations/zkt-legacy-attendance-restore-test.mjs reuse_copy_1791761321746
```

Results: patch PASS; same-input original/restored Presence PASS, **zero differences** across all original UUIDs, **13 ON_SITE / 52 OFF_SITE**; Admin archive eight profiles PASS; zero-mapping IN/OUT PASS even with a future employment-period recorded_at; overnight work day PASS; original pairing/math comparison PASS; lunch/downtime PASS; newly received pre-incident work day PASS; ordinary new events add zero review rows; duplicate/late replay leaves a closed day unchanged; ambiguous shared number creates no work log for either person; all six original history baselines and Payroll unchanged; definition rollback/reapplication PASS. No real employee or terminal was used for fixtures.

The math comparison executes the saved pre-Identity processor's unchanged pairing/aggregation on the same events, replacing only its destructive persistence with a temporary expected-result table. Retained downtime is deducted rather than deleted by a rebuild.

Application build PASS; targeted App/archive ESLint PASS. Full application suite initially hit native out-of-memory in five files; the other tests passed, and rerunning only those five files produced **22/22 PASS** (159 distinct application tests verified across both runs). No assertion failure remained. Existing MICR font build warning remains. No unrelated test or product change was made to resolve memory pressure.

Read-only local preview uses sanitized data from the restored copy and rejects writes. Browser checks: `/employees` actually resolves to `/dashboard`; Dashboard shows 52 off site / 13 missed out / 0 absent from the old event rules; Payroll History loads; Active cards omit the technical panels; eight Former rows retain dates/UUID links; search 27 and Plant PA each return one row; descending sort starts at 100; Back actually returns to Dashboard. Dashboard and archive were checked at 1366, 1440, 1920 and 390 px with no root overflow. The archive table scrolls within its container on mobile. The build contains no EmployeesPage chunk.

Archive ON and Terminate/Rehire/Number Reuse OFF are verified prerequisites and remain unchanged. SACS SSO code/contracts are untouched; existing SSO tests passed. No production SSO or terminal action was performed during this task.

## Production readiness and remaining actions

SQL and UI are prepared for an authorized staged release. Before application, recheck target, current definition fingerprints, flags and private backup. The SQL transaction has a five-second lock timeout and does not invoke a rebuild during application. Do not repeat previous migrations. Use the existing protected PostgreSQL connection with ON_ERROR_STOP; do not put credentials in arguments or reports.

Definition rollback: `supabase/zkt_legacy_attendance_restore_rollback.sql`, retaining every event, review row, mapping and work log. App rollback uses the currently serving deployment and never restores an older database over newer records.

Remaining: separate owner authorization for this SQL and the new application commit, then staged Admin acceptance/promotion. Actual new ZKT delivery remains **NOT VERIFIED**: the copied source's last raw receipt is October 10, 2026, 00:02:28.685 UTC. Copy fixtures are not proof of live NJ/PA Clock In/Out. Bridge/biometrics and action flags remain untouched.
