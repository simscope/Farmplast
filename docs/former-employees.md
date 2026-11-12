## Prepared own-profile SELECT policy — tested, NOT applied to production (2026-10-11)

Migration supabase/profiles_own_read.sql creates only "Users can read own profile", FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id). Confirmed actual public.profiles.id UUID primary key references auth.users(id) ON DELETE CASCADE. Existing authenticated SELECT and schema USAGE privileges are present, so migration contains no GRANT/REVOKE, ALTER RLS, write policy or data update. Pattern follows https://supabase.com/docs/guides/database/postgres/row-level-security.

Native isolated PostgreSQL 17.6 scoped copy of production profiles: copied exact columns/defaults/constraints, actual profile rows, grants, RLS state and auth.uid definition; dependency auth.users represented by referenced IDs only. No production credentials were copied. One synthetic ordinary user exists only in disposable local database. This is a relevant schema/table copy test, not a new full database recovery rehearsal.

Six validation groups PASS: reproduced original admin empty result; Admin own role admin and ordinary user own role user; foreign-profile equality lookup and unfiltered queries restricted to own row; anon and missing UID see no rows; INSERT fails RLS, UPDATE/DELETE affect zero rows; ACL and profile checksums unchanged with sole added SELECT policy. Local DROP of only the new policy restores original denial without data loss. Test database dropped, local server stopped. Private evidence profile-rls-tests.json and test-profile-rls.mjs retained outside Git.

Read-only production verification at 20:13:27 UTC: 57 Active/8 Former; original Payroll/Attendance/employee checksums unchanged; all four flags OFF. Existing live Open SACS flow reached /admin/company and Company Admin Panel without entering credentials. Since production policy was not applied, these live baseline results do not replace post-change verification; repeat own-profile session and SSO after owner-authorized policy application.

Ready for separately authorized production policy application only. Application SHA remains 8e17defa8e41cd6efa0ac458c91597abc5d0affc; already-built deployment dpl_5R6Jsm3k7zMtjcSKWMRu49dXXxKr unchanged. No promotion or archive migration replay performed. No ZKT, SACS, employee, payroll, role or production RLS modifications. After separately approved policy change verify real admin own-profile response, then separately approved existing-deployment promotion and archive acceptance; advanced flags stay OFF.
## Final admin session verification — preexisting profiles RLS blocker (2026-10-11)

Read-only only. No database data, RLS, users, roles, SSO, flags, deployment or migrations changed.

Current owner-browser session is authenticated to the correct Farmplast Supabase project. Observed profile requests carry a nonexpired authenticated JWT issued by https://eeobivvwjzakbweluwtm.supabase.co/auth/v1. JWT sub matches the profiles id=eq filter. Responses HTTP 200, [] with zero rows. Only selected non-secret claim fields were persisted privately; bearer token/refresh token/request headers were not printed or saved. UID itself is in owner-only private evidence, not Git.

Pinned production connection, BEGIN READ ONLY: auth.users contains that UID (one row); privileged profiles read returns role admin (one row). Under SET LOCAL ROLE authenticated with captured sub as the request claim, auth.uid() matches that UID, but identical profiles query returns zero rows. employee_archive_admin() returns true (its security-definer lookup sees the actual admin row). profiles relrowsecurity=true, force_rls=false, owner postgres, pg_policies has zero entries for public.profiles. Authenticated table grants exist in the retained source snapshot. Thus RLS default deny filters the row, rather than missing login, wrong project/account, nonexistent admin profile or a load-query HTTP error.

Predump catalog.private.json at 2026-10-11T19:29:48.982Z already has zero profiles policies; source-structure.json already shows profiles RLS enabled. Neither archive migration alters profiles policies. This is an existing production access configuration, not demonstrated deployment regression. Both existing admin profiles have auth metadata role user, so fallback-profile metadata does not expose an existing alternate frontend admin session either. Logging in again with the same account alone does not remedy default-deny RLS.

Correction to previous result: the admin account/session was available, but its profile was hidden by RLS. The prior request to merely log into an existing admin account was insufficient. The independently reproduced asynchronous profile race in 8e17def is fixed; it does not resolve this separate existing RLS configuration.

Actual authorized Admin acceptance on corrected deployment 8e17defa8e41cd6efa0ac458c91597abc5d0affc / dpl_5R6Jsm3k7zMtjcSKWMRu49dXXxKr remains BLOCKED, not PASS. Retained isolated synthetic production-artifact tests do not substitute for real account acceptance. No new build or promotion performed. Prepared exact deployment remains available for subsequent owner-authorized promotion only after profile-access blocker is resolved by an independently authorized administrator action or permitted verification method. Do not change RLS or create an Admin as part of this task.

Current production confirmed dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq, SHA 4b7573a6d105cbfd61a035e0c31c3f324a4a165b. All four flags remain false. Next promotion requires separate owner confirmation, as explicitly requested. No migration replay. Private evidence: admin-session-evidence.json, admin-db-verification.json, admin-verification-serving.json and read-only helper scripts in reports/authorized-archive-release-private.
## Authorized 8e17def production rollout — FAILED acceptance, previous app restored (2026-10-11)

Owner explicitly authorized only SHA 8e17defa8e41cd6efa0ac458c91597abc5d0affc and Archive Read-Only. Created detached clean checkout reports/archive-release-8e17def at that exact SHA. Existing Vercel project/team verified. No migrations rerun.

CLI 63.1.2 deploy --prod --skip-domain --force with explicit existing Farmplast project/team created staged production deployment dpl_5R6Jsm3k7zMtjcSKWMRu49dXXxKr, https://farmplast-7gcq528wt-andrei-simanenkas-projects.vercel.app. Build cache skipped, 298 files from approved checkout uploaded, npm run build / vite build completed, target production READY. Metadata SHA and checkout verified. Before promotion farmplast.vercel.app still resolved to dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq. All 47 staged JS/CSS/font artifacts fetched; six isolated authorization/navigation scenarios passed on this actual production-context bundle, using synthetic data and blocked external traffic. These are not live administrator login tests.

Promoted dpl_5R6Jsm3k7zMtjcSKWMRu49dXXxKr, verified primary domain deployment ID/SHA, then enabled only former_employees_archive_readonly. All three advanced flags remained OFF throughout.

Live acceptance FAILED/BLOCKED: existing browser session loaded new production entry /assets/index-_RdBkIMR.js (DOM script src observed). Thus this attempt definitively served the new frontend. Former Employees link was absent and direct /employees/former ended at /dashboard. Read-only browser Network diagnostics observed three profiles responses HTTP 200, each [] (zero rows), without dumping request authorization headers, tokens or PII. Current session therefore did not obtain an admin profile; AuthContext fell back to user and admin route guard denied access. No page errors were recorded. This is a missing/invisible profile for the current session, not a stale bundle and not Archive OFF. Why this account's profile query is empty (missing row versus row visibility) was not investigated further or changed within this rollout-only authorization. Previously reproduced profile-loading race is independently fixed, but it does not grant this session admin rights.

Safety action: Archive OFF immediately; all four flags OFF. Native rollback to dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq returned HTTP 402 (Hobby plan restricts rollback depth). Supported promotion of that existing previous production deployment succeeded without rebuild. Final primary-domain API confirms dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq READY, SHA 4b7573a6d105cbfd61a035e0c31c3f324a4a165b. No paid upgrade, project move, schema rollback or data restore performed.

Post-stop verification 20:03:50 UTC: 57 Active / 8 Former, 65 employment periods, original employee fields/payments/payroll checks/deductions/work logs/attendance checksums unchanged. Existing admin DB claim qualification and archive-OFF denial PASS; nonadmin sees57, anonymous RPC denied. Real archive cards/history were NOT accepted in browser due account blocker. Existing Payroll report rendered after restoration. Existing Open SACS flow reached /admin/company and Company Admin Panel without password entry. Employees, numbers, ZKT, biometrics, SACS configuration and historical records were not modified.

Final flags: former_employees_archive_readonly=false; employee_terminate=false; employee_rehire=false; employee_number_reuse=false. Production URL https://farmplast.vercel.app. Attempted approved deployment remains available but is not serving the primary domain. Private staged build/assets/status/auth-test logs remain outside Git in reports/authorized-archive-release-private; no new phase created.

One required owner action: provide an existing authorized Farmplast administrator browser session whose profiles request returns its admin row. Do not create/update profiles, roles or permissions as an implicit rollout fix. Once that existing admin session is available, resume the already-authorized exact-SHA release and actual archive acceptance; no migration replay. Until then release remains FAILED / NO-GO and all flags OFF.
## Deployment mismatch investigation and corrected preview (2026-10-11)

Confirmed defect: AuthProvider published `loading=false` while loadProfile was still querying profiles. A session without admin user_metadata temporarily appeared as role user. ProtectedRoute then redirected /employees/former to /login; LoginPage redirected any existing session to /dashboard. A delayed (750 ms) profiles response containing the real admin role reproduced this exact final dashboard URL at widths 1638 and 390. This is an authorization-loading race, not proof of a stale build. The profile/timing of the original live browser was not captured, so the original session-specific cause is not conclusively established beyond this reproduced defect. Previous claims that dashboard alone proved old frontend are withdrawn.

Failed deployment build logs: cloned simscope/Farmplast SHA fe03b94; restored dependency/build cache from dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq, then actually executed npm run build / vite build. Project settings: root client, Vite, build npm run build, output dist, Node 24.x. Build output and retrieved assets contain the registered /employees/former route, FormerEmployeesPage component, Dashboard Former Employees link, and flag RPC. Main entry index-BLoW-mGx.js SHA-256 ea0ad5399955293cc3bc086cdc25f31ebd428ff923b1b07f81ff258ccd4be074; DashboardPage-f7WWHz_X.js contains Former Employees. Compiled Supabase URL is the correct Farmplast project eeobivvwjzakbweluwtm.

Restored production main entry is index-B2rzUgIU.js, SHA-256 9e6252dcba57ac02c9d52069110694cfee60859fef7cacfd07db90b1141f8bd9. Different entry assets refute an unchanged build artifact. HTML Cache-Control: public, max-age=0, must-revalidate. Authenticated deployment HTML fetch: HTTP 200, X-Vercel-Cache MISS. No Service Worker registration found in src/public. No production cache was purged. These checks do not retroactively identify the original browser's downloaded entry hash.

Routing distinctions: no registered route in old production; route present in fe03b94. Admin+Archive OFF remains at /employees/former and shows the disabled message. Admin+Archive ON shows archive. Nonadmin goes via /login to /dashboard. The Dashboard archive link checks admin role (not the feature flag); EmployeesPage link checks the archive flag. Existing SPA rewrite to /index.html is correct and was unchanged.

Minimal correction: AuthContext exposes loading while profile query is pending, so ProtectedRoute waits for the authoritative profile response. No Employees, Payroll, ZKT or SACS business logic, permissions, role records, or production flags were changed. Application commit: 8e17defa8e41cd6efa0ac458c91597abc5d0affc. Regression harness: client/scripts/verify-archive-auth-browser.mjs uses synthetic users/records and delayed profile response, blocks external traffic, asserts all action flags OFF and zero new integration calls.

Validation: build PASS; focused AuthContext ESLint zero errors (two preexisting hook dependency warnings); six isolated Desktop/Mobile Admin ON, Admin OFF, User ON scenarios PASS, both against local production build and against the actual 47 published preview artifacts downloaded with authenticated CLI. Admin ON displays 8 synthetic former entries; Admin OFF stays on archive URL with disabled text; User remains denied. Real preview login/real employee data was not used. Local reproduction before correction ended at dashboard; after correction remained at /employees/former. These are isolated client tests, not a claim of live production archive acceptance.

New preview: https://farmplast-gnti5irgq-andrei-simanenkas-projects.vercel.app, ID dpl_A8DYhx7MjzpCJX7ZpEhSvqj9P4TM, READY, gitSource SHA 8e17defa8e41cd6efa0ac458c91597abc5d0affc, target preview (null API target), no farmplast.vercel.app alias. Build logs explicitly say cache skipped. Retrieved preview /employees/former HTTP 200 loads index-CgVzsSOi.js, SHA-256 151fd1168105bde3b7fdbac4848a746ec98c5f719938d51ee5ee34f4efd587ff. Logs clone the exact new SHA. Vercel deployment protection remains enabled; use authorized Vercel CLI curl for HTTP inspection. Preview API/auth requests were mocked only in disposable isolated testing; production configuration was untouched.

Production remains restored deployment dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq. Read-only DB verification at 19:53:38 UTC: all four flags OFF, 57 Active / 8 Former, original historical checksums unchanged, archive access denied while OFF. No migration reapplied. Private artifacts/logs/hashes are outside Git under reports/authorized-archive-release-private. Artifact download initially had two local CLI failures; the two missing files were fetched sequentially and all 47 artifacts were present before passing tests.

Readiness: corrected preview and isolated release checks PASS. Production promotion NOT performed. Owner must explicitly authorize the new application SHA (previous approval was only fe03b94). After authorization, stage a production-context deployment from an isolated exact-SHA checkout with `vercel deploy --prod --skip-domain --force` using existing project/team linkage, verify its source/build/assets before promoting, then enable archive only and execute real admin/nonadmin acceptance. Do not promote a preview assuming the same production environment/build; promotion may rebuild with production environment.

Exact controlled command sequence after owner approval (CLI pinned to 63.1.2; verify target before mutation):

```powershell
# Use an exact-SHA checkout, containing only reviewed application files.
git worktree add --detach C:/Users/Owner/Documents/farmplast/reports/archive-release-8e17def 8e17defa8e41cd6efa0ac458c91597abc5d0affc
# In that checkout, link explicitly to the EXISTING Farmplast project only.
npx --yes vercel@63.1.2 link --project farmplast --scope andrei-simanenkas-projects --yes
npx --yes vercel@63.1.2 project inspect --non-interactive --scope andrei-simanenkas-projects
# STOP unless project ID prj_MrDRpm3roDmNC7V2E0vKJIVkvm8x, team ID team_NIjpwKMloxCE7B4LtV0s0IXe, root client.
git rev-parse HEAD
npx --yes vercel@63.1.2 deploy --prod --skip-domain --force --scope andrei-simanenkas-projects
# Verify resulting production-context deployment, SHA/source, archive bundle and no action flags before promotion.
npx --yes vercel@63.1.2 inspect <VERIFIED_STAGED_DEPLOYMENT_ID> --logs --scope andrei-simanenkas-projects
npx --yes vercel@63.1.2 promote <VERIFIED_STAGED_DEPLOYMENT_ID> --scope andrei-simanenkas-projects
```

Use an approved pinned Farmplast database connection, with all three action flags locked OFF, to update ONLY former_employees_archive_readonly=true after version verification. Recheck flags, actual URL after direct navigation, eight former cards/history, 57 Active, Payroll/Attendance and existing SSO. On failure archive OFF and rollback application to dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq; no DB restoration or historical deletion. Do NOT reapply former_employees.sql or employee_archive_feature_flags.sql. No production rollout until separate owner confirmation.
## Authorized CLI deployment attempt — FAILED / rolled back (2026-10-11)

Vercel CLI 63.1.2 `whoami --format json` authenticated as sandrvlad-9915, with team andrei-simanenkas-projects. Explicit project inspection succeeded for prj_MrDRpm3roDmNC7V2E0vKJIVkvm8x, root client, Node 24.x, Vite. No local .vercel/project.json or repo.json exists. The connected MCP identity is the same user, but list_teams returned empty and scoped project GET returned HTTP 403. CLI access works; the exact MCP token restriction versus membership visibility cause cannot be established from available evidence. No tokens were printed or new project created.

Production before release remained dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq / 4b7573a6d105cbfd61a035e0c31c3f324a4a165b. Existing migration/history preflight passed at 19:40:56 UTC; migrations were NOT reapplied.

CLI POST /v13/deployments with explicit team/project and git ref fe03b94297451d26c684c834a1486206aba159c8 created dpl_AmFJimYWAepqZfPGr8kpVsA61YNi, https://farmplast-pprwi4hdu-andrei-simanenkas-projects.vercel.app. Vercel reported READY, exact gitSource SHA, and assigned farmplast.vercel.app. Only former_employees_archive_readonly was enabled briefly; all three actions remained OFF.

Acceptance FAILED: refreshed existing authenticated production browser displayed the previous dashboard without Former Employees navigation; direct /employees/former returned that dashboard. New deployment metadata alone is insufficient to establish served application behavior. Root cause (served build versus browser/cache/configuration) remains unresolved; no speculative fix or second deployment was attempted.

Archive was immediately disabled. `npx --yes vercel@63.1.2 rollback dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq --scope andrei-simanenkas-projects --yes --timeout 30s` succeeded. Production API confirmed previous deployment READY and old SHA. Vercel rollback stops automatic domain assignment; any next release must deliberately verify/promote the intended deployment.

Post-rollback database verification at 19:43:00 UTC: all four flags OFF, 57 Active / 8 Former, 65 employment periods; original Employees, payments, payroll checks, deductions, work logs and attendance checksums unchanged. Admin qualification, archive-OFF denial, nonadmin 57-only access and anonymous RPC denial verified. Existing Payroll report rendered. Live Farmplast Open SACS reached /admin/company and Company Admin Panel without a password prompt after rollback. No employee, Safety, ZKT, firmware Storage or SSO configuration changes were performed.

Result: FAILED; safe previous application restored. Remaining blocker is the discrepancy between approved deployment metadata and observed UI, requiring investigation before any renewed release. Private CLI request/status/rollback evidence is outside Git in reports/authorized-archive-release-private. No new phase was created.
# Former Employees — staged implementation and release blockers

Status: **NOT RELEASED. Archive, Terminate, Rehire and Number Reuse remain OFF until their separately authorized rollout.**
Current security/recovery/live-baseline evidence: [Phase 7](former-employees-phase7.md)
and [role remediation](former-employees-security-remediation.md). No new audit phase.

## Authorized production release — STOPPED / FAILED (2026-10-11)

**Outcome: FAILED — Vercel deployment access blocked (HTTP 403).** The owner
approved deployment of **fe03b94297451d26c684c834a1486206aba159c8**. Preparation GO
below remains a candidate decision; it must not be mistaken for successful release.
No new phase/report was created. Stop state: all four feature flags **OFF**, old
production application still READY, additive archive schema retained safely.

### Completed and verified

1. Verified approved clean checkout, unchanged production deployment/source and
   fresh database structural/history preflight at **19:28:47 UTC**.
2. Created new full logical database backup from a consistent read-only snapshot:
   **19:29:48.982Z**, **96 tables**, **2,134,164 bytes**, pg_dump=0, TOC check=0.
   SHA-256 **e407949153c309ece9a6b98f11984a0587fe7fc4247e3594cb9caeab44c2470b**.
   Private path: `reports/authorized-archive-release-private/farmplast-full.dump`.
   Earlier complete PG17 restore proof remains applicable to unchanged source
   schema; the fresh release dump itself was not restored again in this attempt.
   Firmware payloads/service-secret recovery remain a separate incomplete package.
3. Published only the approved commit to origin/codex/former-employees (no force).
4. Applied and committed exactly these archive migrations on pinned Farmplast:

| Migration | UTC applied | SHA-256 |
|---|---|---|
| supabase/former_employees.sql | 19:31:25.559Z | 6ef40ea7eff739bcb6b644af9b8a539658f3fffa1fc4a7d60dde814d9fe2fd70 |
| supabase/employee_archive_feature_flags.sql | 19:31:26.036Z | 79c278158f36e3003a3931431f2174befea8e493b85c6682a661fc093472f98e |

After each migration, original Employee fields, Payments/Payroll/Deductions,
Attendance/work logs and ZKT history counts/checksums matched. New nullable
termination columns were omitted only when comparing original Employee fields.
Original public function definitions remain unchanged. Employment-period seeding
created **65 new period records**, without modifying the original employee rows.

### Deployment failure and safe state

The authenticated Vercel connector attempted **POST /v13/deployments** for
project **prj_MrDRpm3roDmNC7V2E0vKJIVkvm8x**, team
**team_NIjpwKMloxCE7B4LtV0s0IXe**, target production, GitHub repo id 1179346713,
exact approved commit, Vite/client root. It returned **HTTP 403 forbidden**:
not authorized to access scope **andrei-simanenkas-projects**.
Request ID: `cle1:sfo1::r77qh-1791747104135-2e41b6125357`.
No deployment ID was created by this request. No unchanged retry or different
team/project was attempted. Available mapped CLI fallback was checked: vercel/vc
not installed, no existing CLI auth files in inspected standard user paths.
No reauthentication, token retrieval, project-link change or scope escalation
was attempted. No application rollback was necessary because promotion/deployment
never changed the serving production version.

Reinspection confirmed production remains:

- URL: **https://farmplast.vercel.app**;
- deployment **dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq**, READY;
- deployed SHA **4b7573a6d105cbfd61a035e0c31c3f324a4a165b**;
- approved **fe03b94297451d26c684c834a1486206aba159c8** is **NOT DEPLOYED**.

Final read-only DB verification at **19:33:21 UTC**:

| Verification | Result |
|---|---|
| Employees | **57 Active + 8 Former = 65** |
| former_employees_archive_readonly | **OFF** |
| employee_terminate | **OFF** |
| employee_rehire | **OFF** |
| employee_number_reuse | **OFF** |
| Original Employees/Payments/Payroll/Deductions/Attendance/ZKT aggregates | **All unchanged** |
| Admin identity/RPC with archive OFF | Admin recognized; archive call denied as expected |
| Nonadmin | SELECT sees 57 Active; archive RPC denied |
| Anonymous archive RPC | EXECUTE permission false |
| Archive toolbar/page/all-card production acceptance | **NOT RUN / NOT RELEASED**, old application still serves |
| Existing Farmplast → SACS passwordless SSO after migrations | **PASS**, existing Open SACS flow reached /admin/company without password entry |
| SSO audit | Fresh success **19:33:45.903239Z**, recent recorded failures **0** |
| SACS Employees/Safety/Assignments | Counts/checksums unchanged: **74 / 1 / 0** |

UI archive acceptance, Active-only primary roster rollout and new-version error
checks must be completed after an actually successful deployment; prior local
tests are not substituted for those production checks.

### Only prerequisite for resuming the authorized release

Provide an existing authenticated Vercel connection/CLI session with **deployment
permission for andrei-simanenkas-projects / farmplast**, or have that team's owner
perform the exact approved deployment. Do not paste credentials into chat/Git.
The owner release authorization is already granted; no new approval of the same
scope is needed. After access is restored: recheck serving version and four OFF
flags, deploy **the approved fe03b94 commit**; do not rerun these already committed
non-idempotent migrations. Verify new SHA/READY before enabling only archive, then
finish the authorized acceptance checks. On failure leave/disable archive OFF and
use only the prepared application rollback; retain database schema and history.

Private evidence directory: `reports/authorized-archive-release-private/`, including
backup/TOC/catalog, migration-result.json, original-field history baseline,
stopped-verification.json and sacs-after-stopped-sso.json. No credentials or
personal records were copied to Git/report. Production employees/numbers,
Payroll/Attendance/Safety records, SSO configuration, ZKT/Bridge/biometrics and
firmware Storage were not changed. **Stopped after recording FAILED.**

---

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







### Archive UI correction — October 11, 2026

The archive uses the existing Back style and /employees destination, nine requested columns and View only. Department/Status and Original Number labels were removed from the source. Name/number search and Plant/Position filters remain. Hire date priority is profile, own UUID employment history, earliest non-deleted UUID work date. Last work date is also read by UUID. Termination/duration remain Not recorded when unsupported; updated_at, recorded_at and last work date never imply termination. Production read-only date check: eight former employees, one stored hire date, seven attendance fallbacks, no recorded termination dates. There is no inactive-transition timestamp in the current schema; storing one for future terminations requires a separately authorized backend change and is outside this UI-only patch.

The Employees toolbar retains handlers/icons/colors with Former / Employees and Database / Backup on two centered lines. Widths are 114 / 105 px in preview, versus the previous wider buttons; heights match. Group wrapping was checked at 1366, 1440, 1920 and 390 px without page overflow. The existing EmployeesPage is unchanged. No Presence, database, API, SSO, ZKT or feature-flag changes belong to this commit.

Validation: five date/UUID isolation tests PASS; targeted ESLint/build PASS (existing MICR font warning); local browser snapshot shows all eight original UUID links, correct columns, search/filter/sort and Back. Local non-admin route redirects to login; production read-only authenticated RPC checks return eight for Admin and deny a UID without an admin profile with 42501. Screenshots stay private outside Git. Production deployment was not performed; the separately prepared Attendance P0 remediation remains a prerequisite for releasing application changes.

### Owner date rule and Active card cleanup — October 11, 2026

This supersedes the previous termination-date rule: for Inactive employees, display the last non-deleted work date selected by permanent UUID as Termination Date. If no work record exists, display Not recorded. If an earlier recorded termination conflicts with a later historical correction, retain that recorded date and show a review notice; do not silently overwrite it. Employment Duration uses the displayed Hire/Termination dates. No database date/status is changed. All eight production former UUIDs have a last work date and no earlier stored termination conflict; their displayed termination and last work dates match. Hire priority remains stored profile, own employment period, earliest own work record.

Active payroll cards no longer mount Employment/Number Reservations, Safety/SACS History or Attendance/UUID Review panels; these remain exclusive to archive cards. The existing personal details, payroll/work log and edit handlers are preserved. No CSS hiding or data deletion is used. Commit 67f0011's compact toolbar, Back and nine archive columns remain intact; the ordinary Employees page is unchanged.

Validation: six date tests and the 159-test application suite PASS; build PASS with the existing MICR font warning; targeted ESLint has no errors (two existing EmployeeDetails hook warnings). Read-only local preview confirms Active card controls and absence of the removed blocks, and eight archive rows with the new dates. Production UI deployment remains pending owner authorization. Attendance compatibility SQL has separately been authorized and applied; no UI deployment was performed.
