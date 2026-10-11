# Former Employees — staged implementation and release blockers

Status: **NOT RELEASED. Archive, Terminate, Rehire and Number Reuse remain OFF until their separately authorized rollout.**
Current security/recovery/live-baseline evidence: [Phase 7](former-employees-phase7.md)
and [role remediation](former-employees-security-remediation.md). No new audit phase.

## Archive-only production release — GO for owner approval

**Archive Read-Only: GO (prepared, NOT DEPLOYED).** Terminate, Rehire and Number
Reuse remain **OFF / NO-GO**. This supersedes the earlier archive NO-GO that used
full firmware-recovery and live-terminal gates. The owner explicitly narrowed the
release gates; global backup policy and the open full-recovery issue are unchanged.
No deployment, production migration or flag enable was authorized or performed.

### Required limited-release gates

| Gate | Result / evidence |
|---|---|
| SACS Security | **CLOSED**: actual provider DELETE, absent role/OID and live SSO in security report / f799057 |
| PostgreSQL restore | **PASS retained**: PostgreSQL 17.6 complete logical restore, 1180/1180 TOC, 96 original table counts/checksums, 59 RLS policies, roles/grants/extensions, isolated cron/network and rollback proof in phase7-recovery-proof.json |
| Archive migrations | **PASS**: archive-only two-migration restore preserved original data and old functions; latest flag guard's independent Rehire change was separately validated on native PG17.11 in the existing 11-check run at 18:11:07Z; archive gating path is unchanged |
| Archive application tests | **PASS retained**: existing archive/profile/search/filter/UUID/history and Desktop/Mobile checks; no archive frontend change requires repetition |
| Read-only permissions | **PASS retained**: admin protected route, RLS/DB-gated archive RPC, inactive-profile write handlers disabled; legacy data permissions and advanced OFF guards verified in existing tests/restore |
| Production compatibility | **PASS fresh at 19:18:25.978Z**: production deployment/structure unchanged, UUID/count/checksum baseline match; limited-release SACS correction below |

Fresh production is READY deployment **dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq**,
source **4b7573a6d105cbfd61a035e0c31c3f324a4a165b**, project
**prj_MrDRpm3roDmNC7V2E0vKJIVkvm8x / farmplast**. The fresh DB comparison matches
all 178 functions, 119 relations, 11 schemas, 27 default ACLs, 293 constraints,
20 triggers and 6 event triggers from the previously restored source snapshot.
Archive/flags/lifecycle allocation tables and migration ledger are absent;
therefore apply only the two unapplied archive migrations, not a blanket db push.
Data remains 65 employees = 57 Active + 8 Former; all Employees/Payments/Payroll/
Deductions/Attendance/ZKT historical aggregate checksums match earlier evidence.

### Independence and minimal scope correction

The archive list, employee cards, employment periods, payroll and attendance
history use read-only queries by immutable Employee UUID. Viewing the archive
executes no employee UPDATE/INSERT/DELETE, terminal command, identity reassignment
or payroll processor. Main Employees/WorkersList filter Active only. Archive
search, plant/position filters and sort operate on fetched rows.

Firmware buckets are not archive dependencies. Existing card photos use only
public **employee-photos**: all **5** nonempty Former-photo URLs read successfully
at **19:18:46.680Z** and match their stored recovery SHA-256. No private firmware
object was accessed or Storage policy changed. The 12 private firmware objects,
service-config/secret recovery and live NJ/PA evidence remain open under the wider
recovery/advanced-action work; they do not prevent this independent read-only UI.

A concrete scope leak was found: the prepared branch had broadened the existing
SACS bulk-sync employee population. For this archive-only candidate,
`client/server/sacsSync.mjs` and its tests were restored exactly from current
production SHA. This preserves the old active/ZKT-enabled population and response
contract; advanced bulk-sync improvements are deferred and remain recoverable in
prior commit f70bedc. Existing SACS SSO server/API files are unchanged from
production. No SACS deployment/credential/configuration change is required.

Verification specifically required for that source correction: **4/4 SACS sync
tests PASS**, focused lint PASS, **production build PASS**. Existing nonblocking
MICR font warning remains. Other passed suites were not rerun. Advanced APIs remain
flag-gated and no lifecycle/identity/reuse migrations or Bridge updates are part
of the archive release. Existing Bridge processors/functions are preserved.

Fresh private metadata/data/photo evidence resides outside Git in
`reports/archive-only-release-private/`; no employee records or credentials are
included in this document. Product source correction and this document are the
only tracked changes for this release preparation.

### Exact authorized sequence — do not execute before new owner confirmation

1. Owner confirms deployment of the resulting archive-only candidate SHA on
   **codex/former-employees**. Re-read current production SHA/schema; if changed,
   evaluate only that drift. Capture a **new pre-release full logical database
   backup**, SHA-256/TOC and restore availability, using the existing pinned
   Farmplast read-only backup procedure into a fresh private output directory.
   Do not overwrite Phase 7 backup or call its partial firmware package complete.
2. On the verified Farmplast administrative connection, apply from repo root:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
```

The libpq service is an administrator-configured example, not a credential created
here. Existing pinned direct access is already verified; use that approved method
if executing through the existing private helper. After each migration compare
original rows/UUIDs/history and legacy function definitions. Four flags must be OFF.
3. Use the accepted candidate checkout/client and the verified existing Vercel
   Farmplast project/team; deploy staged production without assigning the domain:

```powershell
vercel deploy --prod --skip-domain
# Inspect returned deployment ID, source SHA, READY/build logs; smoke-test OFF state.
vercel promote '<VERIFIED-STAGED-PRODUCTION-DEPLOYMENT>'
```

These are prepared commands, not evidence of a configured local CLI link. The
existing authenticated Vercel connector provides the corresponding deployment
workflow; never deploy to a newly guessed project or blindly push the branch into
an automatic deployment. Confirm alias/source SHA after promotion.
4. Enable only Archive Read-Only through the existing Phase 5 guarded transaction
   (four expected rows/all OFF), then require archive=true and terminate/rehire/
   reuse=false. Validate `/employees/former` shows all 8 Former profiles, all
   existing cards/histories read under admin permissions, search/filter/sort and
   Active-only primary roster. Recheck Payroll/Attendance unchanged, existing
   Farmplast → SACS SSO, application errors and advanced controls absent.
5. If acceptance fails, disable archive and roll back the application to the
   immediately verified previous READY deployment. Retain additive schema and new
   legitimate rows; never restore an older backup over current production data.
   No Bridge restart, terminal/biometric action or firmware Storage change.

**Deployment readiness: ready for explicit owner confirmation; execution stopped.**
This GO is candidate readiness for the limited archive release, not a claim that
production acceptance has run or that full-system firmware recovery is complete.
No new phase/report/project was created.

---

## Historical full-recovery blockers — superseded for archive-only scope

**Archive Read-Only: NO-GO. Employee Actions: OFF / NO-GO. Number Reuse: OFF / NO-GO.**
SACS temporary-role incident is CLOSED, with actual removal/live SSO evidence in
[the existing security report](former-employees-security-remediation.md), commit
`f79905708e27f2a75df4ec42f9c704687d9dfd47`. Security was not re-audited here.
No production Storage, employee, Safety, ZKT, flag or deployment mutation occurred.
No previously passed regression suites were repeated.

### Check 1 — private Storage: BLOCKED — FARMPLAST DOWNLOAD ACCESS REQUIRED

Fresh read-only Farmplast inventory at **2026-10-11T19:10:39.678Z** confirms all
**12 missing private payloads**, unchanged IDs/paths/metadata/update times from
Phase 7: **ch1-firmware 2**, **chiller-firmware 10**, total metadata size
**13,622,592 bytes**. Full storage inventory remains 67 objects. Exact object IDs,
bucket paths and metadata are kept outside Git in owner-only NTFS directory
`reports/final-release-storage-private/missing-objects.private.json`.
Original bucket/path structure is preserved in the inventory; no private bucket
was made public and no production object/policy was changed.

Attempt to obtain the existing Farmplast service-role download credential in
memory using authenticated Management API
`GET /v1/projects/eeobivvwjzakbweluwtm/api-keys` returned **HTTP 403**.
No credential was returned or printed and no object download ran. Existing
Supabase browser session also could not open Farmplast Storage and redirected
to Organizations, which exposes only simscopeinc's SACS/servicescope projects.
This is an actual Farmplast-access blocker; SACS API access does not cover it.

**Result: downloaded 0/12, payload SHA-256 NOT VERIFIED, private restore NOT RUN.**
No filesystem copy is labelled a complete Storage API recovery. The existing
partial recovery archive is unchanged and remains INCOMPLETE.

Required owner action: provide approved authenticated download access to these
12 objects in **Farmplast project eeobivvwjzakbweluwtm**, or securely deliver the
12 files plus exact bucket/path manifest to owner-controlled private storage.
Do not paste service keys into chat/Git. An existing properly scoped secure token
with `api_gateway_keys_secret_read` can retrieve the existing key; direct object
download authorization is also sufficient. No key creation/rotation is needed.
After access: download read-only, verify actual byte sizes, compute SHA-256,
store an encrypted/private recovery package preserving bucket/path structure,
restore into an explicitly isolated private Storage target, re-download/hash all
12 and verify unauthenticated access is denied. No target with production keys
or webhooks may be used. Return real payload/restore evidence before PASS.
Other previously recorded service-config/secret recovery gaps in Phase 7 remain
unverified; retrieving 12 blobs alone must not be called full recovery PASS.

### Check 2 — live ZKT NJ/PA: BLOCKED — OPERATOR BASELINE REQUIRED

Approved NJ read-only remote command:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 farmplast-zkt hostname
```

Actual result: **exit 255**, connection timed out to pinned NJ host
100.91.162.96 port 22. Existing approved SSH configuration has only the NJ
farmplast-zkt host; an approved PA endpoint has not been provided. No alternative
hosts were guessed, services restarted or terminal SDK/biometrics invoked.
Therefore service/version/latest sync/pending queue/error state is **UNKNOWN**
for both sites; a remote timeout is not proof the running Bridge itself failed.

**One precise operator instruction, on EACH actual NJ/PA Bridge computer:**
copy the existing [phase7-zkt-baseline.ps1](operations/phase7-zkt-baseline.ps1),
choose its actual plant, and run locally:

```powershell
# NJ computer:
powershell -NoProfile -File .\phase7-zkt-baseline.ps1 -Plant NJ > .\zkt-NJ-baseline.json
# PA computer:
powershell -NoProfile -File .\phase7-zkt-baseline.ps1 -Plant PA > .\zkt-PA-baseline.json
```

Return both JSON files and confirm last successful sync/received event, current
terminal connectivity, backlog and errors from existing logs/observation.
If paths/service name are not detected, use the script's existing -ServiceName,
-InstallDir, -LogFile, -QueueFile parameters with the actual installed paths.
Do not bypass execution policy. No restart, sync trigger, user deletion, biometric
change or number reassignment is required. UNKNOWN candidates are not a PASS.

### Concrete production sequence — prepared, NOT AUTHORIZED OR EXECUTED

After both checks and outstanding recovery/contract prerequisites pass, obtain
separate owner release approval. Pin approved application SHA, current production
SHA/deployment and rollback target, verified Farmplast libpq service and Vercel
project/team. Existing example service names are not provisioned credentials;
this checkout has no verified client/.vercel/project.json link, so verify the
correct existing project before any CLI deployment. Do not deploy a random HEAD.

1. Verify fresh release backup/recovery availability and current drift. Revalidate
   a changed candidate migration only if its contract differs from the accepted
   restore proof; do not repeat unrelated passed tests.
2. Confirm the following two migrations are not applied already. Apply only these
   archive-compatible migrations from repository root, preserving data:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
```

3. Verify historical counts/UUID links/RLS after each migration; confirm all four
   flags OFF. From client/, with the accepted SHA and verified Vercel project:

```powershell
vercel deploy --prod --skip-domain
# Verify returned staged deployment SHA/READY, archive OFF, Employees/Payroll/SSO.
vercel promote '<VERIFIED-STAGED-PRODUCTION-DEPLOYMENT>'
```

4. Verify production version, then enable **only** Archive Read-Only using the
   existing guarded transaction in Phase 5 section 8; it checks four flag rows
   and all OFF before setting former_employees_archive_readonly=true. Other
   three flags must remain false. Validate all 8 archived cards under existing
   permissions, Active view, Payroll/Attendance, existing SSO and both live Bridges.
5. On critical regression disable the archive and revert to the newly verified
   previous deployment. Retain additive schema/new records. Never restore an old
   backup over legitimate newer production data or drop migrations automatically.

Terminate/Rehire need their own real integration/ACK and status reconciliation
checks. Number Reuse additionally needs actual safe biometric/account absence,
UUID mapping and all-device release ACK evidence. Neither is enabled by this
archive rollout. **Stop here; no deployment authorization was received.**

---

## Completed implementation and controlled release

- Dashboard retains the admin Former Employees link beside Add employee. Active
  rosters exclude Former; archived profiles and all histories retain their UUID.
  Action controls disappear when their independent flags are OFF.
- Archive-only creation accepts an unused positive number. Automatic creation,
  once Number Reuse is released, leaves allocation to the serialized database
  transaction and selects the smallest safe positive number.
- New/rehires use the numeric Employee Number on ZKT. Existing workers' numbers
  and legacy terminal IDs are unchanged. Held legacy terminal IDs and unknown
  inventoried accounts are excluded from allocation.
- A disabled account is **not** proof that its biometric templates are gone.
  Release requires the existing SDK complete-inventory `state=absent` proof on
  every verified NJ/PA device, plus successful SACS deactivation for that period.
  Missing/offline/unverified acknowledgements retain the reservation. Rehire
  with Number Reuse OFF retains this UUID's prior number only when that number
  has been safely released and remains available; otherwise the operation stops.
- Verified mapping intervals start no earlier than hire-date midnight **and**
  verified provisioning, and end after the inclusive termination date, in
  America/New_York (NJ and PA). A punch between the old employment ending and
  safe provisioning is quarantined, even if imported after the new owner starts.
  They use the
  actual event time, preserve immutable ownership, reject overlapping mappings,
  and retain unresolved events in the existing review queue. Conflicting saved
  ownership prevents a retroactive interval change; never rewrite that history.
- SACS bulk sync sends every Active employee in the selected plant regardless
  of ZKT enrollment. Explicit lifecycle deactivation sends an inactive UUID
  tombstone; Safety history is retained. Foreign/duplicate result UUIDs cannot
  acknowledge another employee's sync. Existing SSO is unchanged.
- Newly created profiles invoke the existing guarded SACS integration endpoint
  once provisioning is released; an unavailable acknowledgement is reported as
  pending after the profile save. Profile creation no longer rebuilds Attendance
  or bulk-overwrites historical lunch hours. Explicit Attendance processing uses
  the existing database processor and its payroll/history protections.

Local checks (synthetic records, no production writes):

Final results: all 152 existing application tests passed with separate sequential
file invocations; the two additional delivery tests passed. The final identity
changes passed all 13 identity tests again. Bridge: 19/19. Native PostgreSQL 17.11:
11/11 including real concurrency and independent Rehire. Dashboard/8-row archive/
creation: 18 Desktop/Mobile checks; the existing archive/profile/search/filter/
SSO-permission/history browser checks also passed. Build and focused lint passed.
An earlier aggregate test run had a process failure in PA Climate; its standalone
10 tests and the subsequent complete sequential run passed. Browser/SACS/terminal
fixtures are local simulations, not live integration or biometric validation.

```powershell
# client/
npm test
# If the aggregate Windows runner exhausts memory, preserve the same suite:
Get-ChildItem tests -Filter '*.test.mjs' | Sort-Object Name | ForEach-Object { node --test --test-concurrency=1 $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Test file failed: $($_.Name)" } }
npm run build
node scripts/verify-employee-archive.mjs
# Existing isolated native PG runtime; loopback and data-directory guards apply:
node scripts/verify-employee-concurrency.mjs '<DISPOSABLE-PG-RUNTIME>' --phase5
# Additional Dashboard/8-row archive check uses a local Vite server with
# VITE_SUPABASE_URL=http://127.0.0.1:4178 and a synthetic anon key only:
node scripts/verify-employees-browser.mjs '<PLAYWRIGHT-PACKAGE.JSON>' msedge
# client/zkt-bridge/
npm test
```

Single controlled rollout, **commands below have NOT been run in production**:

1. Owner closes the audited SACS temporary-role incident using the guarded
   [remediation SQL](operations/sacs-temporary-role-remediation.sql), after
   external service/credential inventory and separate explicit authorization.
   Complete the missing recovery assets/secrets/service configuration listed in
   Phase 7. Run its read-only diagnostic on the actual NJ and PA Bridge hosts
   and return both JSON outputs with current terminal/sync health confirmation.
2. Immediately before authorized release, verify current deployment SHA,
   migration catalog, fresh backup/restore and rollback target. No blanket
   `supabase db push`. First apply only `former_employees.sql`, then
   `employee_archive_feature_flags.sql`.
   The flag migration now permits Rehire to clear termination metadata under
   its own flag; revalidate this candidate in the fresh restore, rather than
   reusing an older migration checksum as proof. Keep all four flags OFF.
   Stage the accepted application SHA, verify it, then
   promote only the tested deployment. Use the guarded archive-enable transaction
   in Phase 5 after checking four rows and all OFF. Validate all archived cards,
   admin permissions, Active, Payroll, Attendance, SSO and live NJ/PA queues.
3. To provide Safety History in the archive, the already implemented SACS
   `employee_history.sql` and `employee-history` Edge endpoint require their
   separately authorized deployment/configuration and UUID/permission smoke
   checks. Until configured the card displays the existing unavailable notice;
   do not describe this as complete live Safety History validation.
4. Before Employee Actions, reconcile the known Farmplast/SACS inactive-status
   discrepancy and verify real integration acknowledgements. Apply only the
   missing advanced migrations: `zkt_event_identity.sql`, `employee_lifecycle.sql`,
   `employee_release_gates.sql`. Archive-first migration order is covered by a
   regression test. The modified lifecycle SQL is for **unapplied** migrations;
   if an environment already has its older version, stop and prepare a reviewed
   forward migration instead of rerunning this non-idempotent file. Register
   exact device serials/inventories/range/history evidence; verify the candidate
   Bridge against the actual hosts before authorized installation. Enable
   Terminate/Rehire only after those checks; Number Reuse stays OFF.
5. With separate terminal/employee permission, use an agreed test identity.
   Terminate it, retain a delayed event, verify SACS inactive and NJ/PA disable.
   On each actual terminal where its account exists, the operator removes only
   that test account **including fingerprints/cards/other templates**, using the
   terminal's approved procedure. Do not clear attendance or touch other users.
   Record serial, test number and result without biometrics/PII. Use Retry pending
   integrations to obtain fresh SDK absence proofs. Only then, with all eight
   current matching release confirmations and separate reuse authorization,
   enable reuse. Create a new test UUID, verify the same numeric ID is clean,
   enroll only its own template, import old/new events twice and confirm distinct
   histories. This local simulation is not a physical NJ/PA PASS.

Approved-command templates (existing managed service; no secret in arguments):

```powershell
# Repository root, only after archive release authorization and catalog checks:
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
# client/, accepted clean SHA and verified Farmplast project/team:
vercel deploy --prod --skip-domain
vercel inspect '<RETURNED-STAGED-DEPLOYMENT>'
vercel promote '<VERIFIED-STAGED-DEPLOYMENT>'
# Rollback, only with approval: disable flags, restore the verified prior app.
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'UPDATE public.employee_feature_flags SET enabled=false; SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
vercel rollback '<VERIFIED-PRE-RELEASE-READY-DEPLOYMENT>'
```

Retain additive schema and lawful post-migration records. Never restore an old
backup over newer production data. Archive rollback keeps existing number-based
processors untouched. After advanced identity migrations, an older writer/Bridge
must not be resumed blindly: verify UUID-aware processor compatibility first,
keep actions/reuse OFF and preserve the event queue until the approved compatible
version is restored.

Release decisions: **Archive NO-GO** until the existing security, full recovery
and live NJ/PA baseline blockers are closed and fresh release checks pass.
**Employee Actions NO-GO** pending actual integration/status reconciliation.
**Number Reuse NO-GO** pending actual NJ/PA biometric reassignment evidence and
the existing eight-gate approval. No production deployment or flag changes were
performed by this final implementation task.

The remaining sections preserve the Phase 1 audit and its historical test results.
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
