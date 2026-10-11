# Former Employees — staged implementation and release blockers

Status: **NOT RELEASED; number reuse and employment mutations remain blocked.**
Audit performed October 11, 2026 (America/New_York). No production employee,
attendance, payroll, training, terminal, or schema data was changed.

## Production audit

Read-only Farmplast database transaction: **65 employees, 57 active, 8 former**.
No pending NJ/PA/running bridge commands were present at audit time.
The evidence is retained privately in
`reports/sacs-sync/former-employees-audit.local.json` outside this checkout.

`employees.id` is a UUID primary key. `employee_number` is an integer with a
global UNIQUE constraint. `active` is the existing nullable Boolean status.
Existing profile fields include names, phone, email, position, hire date, photo,
company, plant, hourly/monthly pay, shift, lunch/downtime/overtime settings, and
ZKT configuration. The inspected schema has no department, address, document
store, termination date, or employment-period ledger. Missing legacy dates are
displayed as unknown; no historical dates or documents are invented.

UUID foreign keys reference employees from `employee_work_logs`,
`employee_payments`, `employee_payroll_deductions`, `employee_tax_profiles`, and
`payroll_checks`. Their existing ON DELETE CASCADE constraints make the old
Dashboard Delete DB operation dangerous. This change replaces that operation
with a link to the employment workflow and prevents employee deletion in SQL.

ZKT uses `zkt_attendance_logs.employee_number`, not a durable employee UUID.
The bridge upsert conflict key is `employee_number,punch_time`, without device
identity. `process_zkt_attendance_to_work_logs()` joins events using
`e.employee_number = l.employee_number`, does not check employment dates or
active status, and deletes/rebuilds unapproved non-manual ZKT work logs.
The additional `rebuild_employee_work_log_day_from_zkt`,
`rebuild_employee_work_log_from_zkt`, `rebuild_employee_work_log_from_zkt_safe`,
and `rebuild_zkt_work_logs` functions also require review before release.
The `zkt_user_id` field exists separately; UI creation/configuration commonly
assigns the employee number to it, but not all rebuilding functions resolve it
the same way. NJ and PA must both be audited; PA commands use `pending_pa`.

SACS already has a unique durable `(source_system,source_employee_id)` mapping
and retains its own employee UUID and related training records on deactivation.
Farmplast `/api/sync-sacs` supports single inactive employee delivery, but bulk
sync includes only active ZKT-enabled employees. Neither setting `active=false`
nor setting `zkt_enabled=false` automatically proves successful SACS delivery or
physical terminal deactivation. The bridge rejects synchronization of inactive
employees, so ordinary sync cannot be treated as a disable acknowledgement.

## Prepared changes

- `/employees`: active-only roster and Active Employees count; archive navigation.
- `/employees/former`: admin-only former roster, count, name/original-number
  search, plant/position filters, sort controls, and View/Rehire links.
- `/employees/:id`: existing personal/payroll/work-log profile, plus an admin
  employment-history panel and dated termination/rehire confirmation form.
- `/employees/:employeeId/paystub`: existing UUID-based payroll route, unchanged.
- Dashboard worker rows show only active employees. The underlying employee
  collection remains available to existing PayrollReport generation, preserving
  the admin's ability to report previous periods containing former employees.
- Existing edit forms make employee number, hire date, and status read-only
  where applicable; lifecycle changes use a database RPC.
- Existing payroll calculations, PDF/CSV code, and saved payments/checks are not
  rewritten. Archive profile links reuse those existing history views.

Proposed migration: **`supabase/former_employees.sql`**, not applied to production.
It adds termination metadata and an employment-period ledger, backfills existing
identities without guessing legacy termination dates, and records periods for
new employees. It preserves the global number constraint and all original
employee IDs. Admin-only ledger reads and a restrictive former-profile RLS policy
are combined with the existing policies. The presence view uses invoker security
so it observes employee RLS. Live grants on that view's other dependencies still
require validation before applying this migration.

`change_employee_employment` serializes an employee row, checks dates, open
shifts and outstanding unapproved work logs, and preserves previous periods on
rehire. It keeps the original globally reserved number and leaves ZKT disabled
on rehire. Already inactive legacy employees need their unknown termination date
reconciled before rehire; no reconciliation UI/RPC is supplied in this stage.

The readiness singleton is inaccessible to browser roles and defaults to four
failed checks. **Its flags are release gates, not implementations of terminal
deactivation, event filtering, or SACS delivery. Do not enable these flags in the
current version.** Terminate/Rehire are intentionally disabled. The forms and
RPC are staged for review; real integrations are still required.

No smallest-free-number allocator is enabled or implemented in this stage.
All existing numbers, including former employees' numbers, remain reserved.
This is required by the task's explicit prohibition on unsafe reuse.

SACS training/assignment/check history remains in the SACS database. It has not
been embedded in the Farmplast archive; a secured history-read endpoint and
presentation are still required for that portion of the requested full card.
No absent payroll report storage or salary/status history is fabricated.

## Verification

- Four new PGlite tests passed: preservation/global uniqueness/delete protection,
  admin/manager RLS including the presence view, fail-closed integration gates,
  dated lifecycle preservation, and open-shift/outstanding-work-log blocking.
  Lifecycle-success tests deliberately simulate readiness; they are not hardware
  or integration delivery tests.
- Four existing Farmplast SACS tests passed (NJ/PA eligibility, inactive single
  delivery, authentication, and independent ZKT/SACS outcomes).
- Two SACS endpoint/database tests passed, including durable identity,
  deactivation, replacement history, and permissions.
- Local synthetic browser checks passed at 1440×900 and 390×844: archive counts,
  search/filter, UUID-based history requests, active-only list, blocked Rehire,
  no page errors and no viewport overflow. Screenshots are retained privately
  in the workspace `reports/former-employees/` directory.
- Production Vite build passed (existing unresolved `/fonts/micr.ttf` warning).
- Focused lint passed. EmployeeDetailsPage has an unchanged unused
  `downtimeEnabled` parameter plus two existing hook-dependency warnings.
- Full Farmplast suite: **118 passed / 3 failed / 121 total**. Three unchanged
  React SSR rendering tests (`pa-climate`, `pa-machine-power`,
  `programming-presentation`) fail with `ReferenceError: module is not defined`
  under the shared dependency junction/Vite module runner. This is not a clean
  release check. An initial concurrent run exhausted memory; serial execution
  completed. Reproduce with an isolated lockfile installation before release.
- Actual terminal synchronization/deactivation, live SACS delivery, concurrent
  number allocation, production payroll PDF/CSV behavior, and production
  permission tests are **not verified**. No new release was deployed.

Commands used in this workspace:

```powershell
node --test tests/former-employees.test.mjs tests/sacs-sync.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
npm.cmd run build
node scripts/verify-employee-archive.mjs
```

The local browser script uses synthetic authentication/network responses,
workspace Playwright, and installed Windows Chrome; it never exercises a live
production account or writes production data.

## Required follow-through before release

1. Implement permanent event ownership with device/plant identity, terminal user
   mapping validity intervals, immutable UUID ownership on imported events,
   deterministic timestamp/time-zone handling, and quarantine for ambiguous
   legacy events. Audit and safely backfill every ZKT processor/rebuild path;
   retain original raw terminal logs and approved/manual/payroll history.
2. Implement acknowledged NJ and PA deactivation without terminal log clearing;
   handle delayed uploads and in-flight syncs across termination/rehire.
3. Implement durable retryable inactive-roster delivery to SACS and verify by
   source UUID before treating termination as safely completed. Add secured
   SACS-history reads to the archive profile.
4. Reconcile legacy employment dates; finish profile period/status display and
   decide how completed/paid payroll snapshots interact with history rebuilds.
5. Establish the supported number range. Only after those steps, migrate global
   uniqueness to active scope and add transactional lowest-free-number allocation
   plus a verified-release reservation record. Test concurrent creates and
   immutable history after replacement. Never renumber active workers.
6. Apply/test migrations in an isolated schema with current production functions,
   triggers and grants; run all 14 requested release scenarios, resolve the
   baseline renderer environment, and confirm report output before production.

This branch starts at the documented September 24 Farmplast SACS deployment
commit `0d2989ddb2887fbcf49bd813390ae1a81733b5f2`. It is not proof of the current
Vercel production source revision. Confirm the current deployment and rebase
onto it before releasing, including subsequent SACS SSO security changes.
Existing unrelated monitoring/firmware checkouts were not modified.

Production application: https://farmplast.vercel.app/dashboard
**New production deployment URL: none — release safety conditions are unmet.**
