# P0 Attendance compatibility remediation (prepared; production untouched)

Target: Farmplast `eeobivvwjzakbweluwtm`. Application production remains `8e17defa8`; do not promote `b271dd7`.

## Cause and measured impact

`zkt_event_identity.sql` changed `v_employee_current_presence` and every rebuild RPC to ownership-only reads before verified mappings existed. It copied each legacy raw event into identity/review once. Production has 10,578 raw events, 10,578 unique legacy references, zero mappings/ownership, and 65 ABSENT. All 65 employment periods have distinct owners per number; 44 hire dates are unknown. The six historical data baselines are unchanged.

Last raw receipt: 2026-10-10 00:02:28.685 UTC (October 9, 20:02 EDT), before the migration on October 11. No post-migration raw receipts were found. Therefore actual new-clock delivery is unverified; the ownership-only processor would not produce hours from legacy arrivals. 10,572 raw punches use mode 255 and six omit mode: mode is not reliable IN/OUT evidence.

## Exact patch

`supabase/zkt_attendance_compatibility.sql` adds one restricted resolver and replaces the Presence view and canonical processor. Other rebuild RPCs already delegate to that processor. No historical DML or ownership backfill is executed by the patch.

The resolver prioritizes permanent ownership. Temporary legacy reads require a unique employee/number across employment history, no conflicting mapping at the event time, employment boundaries, and either an already stored UUID work day or an active open period recorded before the punch. All action flags must remain OFF. Unknown hire dates alone are insufficient. No device verification or permanent ownership is invented. Ambiguous events stay in review; repeated imports retain the existing employee_number/punch_time conflict constraint.

The processor retains legacy chronological pairing, 13-hour bound, night work dates, lunch threshold, and manual/approved/payroll protections. It reads only work dates from October 11 onward, never deletes work logs, never rebuilds closed historical rows, preserves downtime, and only closes eligible unedited open days. Earlier delayed events remain raw/review and do not recalculate historical payroll. Future lifecycle activation requires retiring/revalidating this temporary path first.

Presence groups night punches into one work day, correcting the old calendar-day split. First comparison on the same production snapshot: old view 13 ON_SITE / 52 OFF_SITE; corrected view 18 ON_SITE / 47 OFF_SITE. The 17 differences are night-day grouping (11 OUT-to-IN, 6 IN-to-OUT), not new events. These are event-derived states, not physical presence confirmation. The UI derives stale open shifts separately.

`DashboardPage.jsx` additionally renders UNKNOWN as IDENTITY REVIEW and excludes it from absent counts. This small UI change is prepared only; no deployment is authorized until production Attendance is restored. The current snapshot has no UNKNOWN results, so SQL remediation can restore its current Presence without publishing a frontend.

## Evidence

- Fresh isolated PostgreSQL 17 public/auth-schema restore: all sections exit 0, no cron/external jobs or auth credentials restored.
- Six original Employees/Payroll/Attendance baselines unchanged after patch and after fixture rollback.
- IN, OUT, lunch/downtime, midnight shift/hours, delayed UUID, closed-day freeze, duplicate import/review stability, conflicting number rejection, permanent UUID priority: PASS.
- Concurrent IN/OUT under actual service_role: one correctly closed work day, PASS.
- Admin Presence and archive (8 profiles), service-role canonical RPC: PASS. 57 Active / 8 Former preserved. Archive ON; three actions OFF.
- Targeted ESLint and application build: PASS (existing unresolved MICR font warning).
- Current production archive/SSO previously passed after lifecycle migrations; this patch has not changed production. Post-remediation live checks remain pending authorization.

Commands from repository root, using the existing isolated runtime only:

```powershell
node docs/operations/zkt-attendance-compatibility-test.mjs attendance_copy_1791753632287
```

The runner pins loopback port 55441 and rejects database names outside attendance_copy_*. It creates synthetic events exclusively inside an isolated transaction and rolls them back.

Affected-schema/data backup is private outside Git: `../reports/authorized-archive-release-private/attendance-affected-backup.dump` (public data/functions/views/triggers/RLS/grants; auth schema only). SHA-256: `c2f8e7b890c2d81247382f85eca78cc837846a77ef8be75a4e6e9be113155963`. Original full pre-lifecycle dump and global recovery files also remain private. Before any authorized execution, verify this backup hash and current target/definition guards again.

## Authorized next operation required

Owner must explicitly authorize only `supabase/zkt_attendance_compatibility.sql` on Farmplast production. Do not rerun the three identity/lifecycle migrations. Use the existing protected direct PostgreSQL connection, with ON_ERROR_STOP, no password in command arguments/output:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/zkt_attendance_compatibility.sql
```

PG connection settings must already target eeobivvwjzakbweluwtm. The patch requires exact current processor/view fingerprints and Archive ON/actions OFF. Definition drift stops execution. It fences raw inserts briefly before taking the existing processor advisory lock; lock acquisition timeout aborts the transaction without deleting events. The Bridge's normal retry/deduplication path is retained.

After commit: read counts/flags, compare raw rows and all history baselines, check actual Admin dashboard/archive and SSO, monitor new receipts/work days/review. Do not invoke a mass rebuild or manufacture terminal punches. Obtain NJ/PA JSON for physical delivery evidence. Do not enable actions or promote b271dd7.

Rollback before commit is transactional and preserves every row. `zkt_attendance_compatibility_rollback.sql` was rehearsed and restores the exact pre-patch definitions without deleting any new records; **it also restores the known ownership-only outage**, so it is an emergency definition rollback, not a healthy operational fallback. Do not execute it automatically. On any post-commit critical defect, stop and choose an explicitly approved data-preserving correction; never restore an old database over newer events.

The tested copy was removed and the local runtime stopped after verification. To repeat the runner, first restore the private affected backup into a new attendance_copy_* database; the numeric name above records the completed rehearsal.

## Authorized production application — October 11, 2026

The owner explicitly authorized this compatibility SQL, and only this file was committed to production eeobivvwjzakbweluwtm. Before execution, both definition guards matched and the SQL SHA-256 was da21eba18641f39d435d8128812c6b5699a31fe631ab09be47262bd2e016cb93. Both private backup hashes matched the tested artifacts. No other migration, processor invocation, event backfill, deployment, terminal or SACS change was performed.

Post-commit authenticated Admin SQL Presence: 18 ON_SITE / 47 OFF_SITE. Actual production dashboard: 0 online / 47 off site / 18 missed out / 19 existing punch errors / 0 absent. Old open punches correctly appear as missed out rather than present today. Admin archive RPC and browser both show eight former employees. Database counts remain 57 Active / 8 Former.

All six before/after count and row-checksum baselines match: employees 65, raw attendance 10,578, work logs 5,665, payments 987, payroll checks 1,544, deductions 242. Review remains 10,578, with 10,578 unique legacy event references. Lunch/downtime and historical payroll are covered by unchanged full work-log/payment hashes. Archive ON; Terminate, Rehire and Number Reuse OFF.

IN/OUT, overnight hours, lunch/downtime, duplicate/review stability and UUID collision tests passed on the restored copy. No raw events have arrived since October 10 at 00:02:28.685 UTC; production live new-event processing is NOT VERIFIED. No synthetic production punches or mass processor call were used. Earlier historical days deliberately remain frozen. The current production frontend lacks a dedicated UNKNOWN label; the separate prepared frontend change is not deployed. Admin's current snapshot has no UNKNOWN rows. Future ambiguous events remain unresolved in the database and require an authorized frontend correction for explicit presentation.
