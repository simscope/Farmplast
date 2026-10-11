# SACS temporary role remediation

## Final authorized cleanup — executed 2026-10-11

**SACS SECURITY INCIDENT: CLOSED.** The temporary CLI role was deleted through
its official Supabase Management API endpoint, and the existing Farmplast → SACS
passwordless SSO succeeded after deletion. This disposition supersedes all
historical OPEN / awaiting-authorization statements preserved below.
Application/base commit: `dfdb0fe9963c18d7c0b56a743892c424dc751372`.
Documentation commit: `git log -1 --format=%H -- docs/former-employees-security-remediation.md`.

### Owner approval and immediate guarded preflight

The owner explicitly authorized **one DELETE request** to
`/v1/projects/kbooijfblzzdxvpjzbsh/cli/login-role`, conditional on the unchanged
single-role inventory and zero sessions, ownership or dependencies. Approval
was for provider-managed deletion, distinct from the earlier three SQL operations.

Immediately before DELETE, authenticated project GET verified id
**kbooijfblzzdxvpjzbsh**, name **sacs-main**. Read-only SQL at
**18:56:07.048784Z** verified database postgres OID **5**, both SACS markers,
full statistics visibility, and exactly one `cli_login_` role:
**cli_login_postgres, OID 26135**. LOGIN/verifier were present. Other CLI roles=0;
active sessions=0; owned relations/functions/schemas/databases=0/0/0/0;
shared dependencies=0; parent memberships=0; explicit relation/function ACL
references=0/0; cron/routine/role-config/DB-config references=0/0/0/0.
Membership remained postgres, grantor supabase_admin, ADMIN=false,
INHERIT=false, SET=true. External non-use confirmation from the owner remains
applicable. The execution helper checked these conditions and stopped on mismatch.

### Exact production operation and response

```http
DELETE https://api.supabase.com/v1/projects/kbooijfblzzdxvpjzbsh/cli/login-role
Authorization: Bearer <existing management token held only in memory>
```

**Requests attempted: 1.** Started **18:56:07.6118461Z**; completed
**18:56:08.0460186Z**. Response **HTTP 200**, `{"message":"ok"}`.
No request body, automatic retry, SQL DROP/ALTER/REVOKE, grant change or CLI
provisioning command was used. A private attempt marker was recorded before
sending to prevent accidental repeat execution. The previous CLI-role SQL
remediation transaction was not executed.

### Post-change verification — actual results

| Check | Result / evidence |
|---|---|
| CLI role removal | **PASS**: complete `cli_login_` inventory empty at 18:56:13.614203Z |
| Exact name and OID absent | **PASS**: name count=0, OID 26135 count=0 at 18:57:12.512501Z |
| Former-role sessions | **0** at final check |
| Other role attributes / non-target memberships | **Unchanged aggregate checksums** |
| Relation/function/schema/database ownership | **Unchanged aggregate checksum** |
| Farmplast authentication / Payroll display | Existing authenticated dashboard reloaded successfully; Employees and Payroll report visible; no login form |
| Live Farmplast → SACS SSO | **PASS**: existing Open SACS control opened `/auth/farmplast`, then `/admin/company`, showing Company Admin Panel for Farmplast |
| SSO DB audit | **1 success after deletion**, timestamp **18:56:22.979883Z**; **0 failures after deletion** at 18:57:12.512501Z |
| Existing SSO permissions | Unchanged: service_role issue/consume allowed; anon issue and authenticated direct consume/read-codes denied |
| Provider error log sample | No returned matching postgres/supavisor/pgbouncer error/authentication-failure events in **18:56:08–18:57:13Z**; bounded recorded-log evidence, not proof of all future/external service health |

Fresh pre/post count + aggregate MD5 checks matched for **all nine datasets**:

- Farmplast Employees **65 = 57 Active + 8 Former**; payments **987**;
  payroll checks **1544**; deductions **242**; work logs **5665**;
  ZKT attendance **10578**.
- SACS Employees across companies **74**; Safety daily_sessions **1**;
  completed-assignment table **0**.

SACS company UI still displays 65 total / 58 Active / 7 Inactive. The previously
known one-employee status discrepancy was not corrected; exact employee-table
checksums match before/after deletion. The cleanup did not modify records or
resolve that separate synchronization issue.

The newly issued/consumed one-time SSO code and successful auth audit are normal
side effects of the explicitly authorized SSO verification. No application SSO
configuration, credentials, authorization or implementation was changed.
Observed live SSO, authenticated app and Management API/read-only DB connections
work. Current physical NJ/PA Bridge connectivity was not tested or changed;
closure here concerns the temporary-role incident, not a production release GO.

### Evidence and stop

Private files remain outside Git under
`reports/former-employees-security-remediation-private/`:

- `delete-execution-result.json`, `.attempt.json`, `.preflight.json`;
- `delete-execution-role-after.json`, `delete-execution-final.json`;
- `delete-execution-catalog-before.json`, `delete-execution-catalog-after.json`;
- `delete-execution-sacs-before.json`, `delete-execution-sacs-after.json`;
- `delete-execution-farmplast-before.json`, `delete-execution-farmplast-after.json`;
- `delete-execution-provider-logs.json`, `delete-execution-sso.png`.

Evidence contains boolean verifier presence only; no token, password verifier,
connection secret or employee record was written to Git or this report.
`git diff --check` verifies the documentation change. Product tests were not rerun:
no application code or infrastructure contract was changed.

No Employees, Payroll, Attendance, Safety Records, ZKT/Bridge or feature flags
were modified. No Farmplast/SACS deployment or schema migration was performed.
No rollback or role recreation was necessary. **Stopped after authorized cleanup,
verification and this existing report update.** Avoid linked CLI commands that
recreate temporary login roles; future remediation mutations need their own scope.

---

## Historical preparation and execution blockers

The following records earlier evidence and decisions. Its OPEN / awaiting-approval
statuses are historical; the final completed disposition is above.

## Management API cleanup — awaiting deletion authorization

**Current status: READY FOR OWNER DELETE AUTHORIZATION; incident OPEN.**
Fresh evidence **2026-10-11 18:52:36–18:52:49 UTC**. Management API access is
available. DELETE requests and production changes performed: **0**. Previous
approval covers NOLOGIN/PASSWORD NULL/REVOKE, not deletion. The older direct-SQL
privilege blocker below does not establish a provider API cleanup blocker.

### Official request — prepared, NOT EXECUTED

```http
DELETE https://api.supabase.com/v1/projects/kbooijfblzzdxvpjzbsh/cli/login-role
Authorization: Bearer <existing secure Supabase Management API token>
```

No body or single-role selector is documented. Actual token stays in memory,
never in Git, shell arguments or logs. The experimental/Beta endpoint requires
OAuth `database:write` or fine-grained-token `database_write`; documented success
is HTTP 200, `{"message":"ok"}`.
[Official endpoint](https://supabase.com/docs/reference/api/v1-delete-login-roles).
Authenticated project GET and database audits succeeded; DELETE-specific token
permission is not proven by those reads and will not be tested through an
unauthorized mutation. If an authorized request returns 401/403, an owner-approved
SACS Management API token with the stated write permission is required.

Supabase documents removal of the temporary role **and CLI read-only counterparts**:
[managed cleanup guidance](https://supabase.com/docs/guides/troubleshooting/permission-denied-when-deleting-the-cli_login_postgres-role-808bae).
Treat this as project-level CLI login-role cleanup; it cannot be scoped to one OID
through a documented request parameter.

### Verified project and deletion scope

`GET /v1/projects/kbooijfblzzdxvpjzbsh`: **HTTP 200**, timestamp
18:52:49.5915698Z, id **kbooijfblzzdxvpjzbsh**, name **sacs-main**, region
**us-east-2**, status **ACTIVE_HEALTHY**. Farmplast is not the target.
Read-only database evidence: postgres, OID **5**, both SACS markers present,
full statistics visibility. At **18:52:36.720326Z**, the entire inventory queried
with `starts_with(rolname,'cli_login_')` contained **exactly one role**:

| Check | Actual result |
|---|---|
| Name / OID | cli_login_postgres / 26135 |
| LOGIN / verifier present | true / true; boolean only |
| Other CLI login roles, including read-only counterparts | **0** |
| Active sessions | **0** |
| Owned relations / functions / schemas / databases | **0 / 0 / 0 / 0** |
| Shared dependencies / parent memberships | **0 / 0** |
| Explicit relation / function ACL references | **0 / 0** |
| Cron / routine / role-config / DB-config usage references | **0 / 0 / 0 / 0** |
| Membership | postgres; grantor supabase_admin; ADMIN=false, INHERIT=false, SET=true |

No observed database dependency or use prevents preparation. The owner's previous
explicit confirmation that no external clients use this role remains applicable;
this is owner evidence, not an independent audit of every external service.
Existing source/catalog SSO independence checks below remain applicable. No fresh
interactive SSO or post-deletion verification is claimed.
Private sanitized evidence outside Git:
`reports/former-employees-security-remediation-private/cli-delete-project.json`,
`cli-delete-inventory.json`, `cli-delete-inventory.sql`.

### Execution after separate approval

1. Obtain explicit owner authorization for the **Management API DELETE of SACS
   CLI login roles**, currently only cli_login_postgres OID 26135.
2. Immediately repeat project identity, complete CLI-role inventory, sessions,
   ownership, dependencies and internal-use checks. Stop without DELETE if a new
   related role appears, expected name/OID changes or any safety condition fails.
3. Capture fresh read-only Employees/Payroll/Attendance/Safety and non-target
   role/ownership baselines. Send the prepared request once using the existing
   secure token. Do not invoke CLI commands that provision a new temporary role.
   Do not retry errors/ambiguous responses automatically; inspect actual state.
4. Verify no role exists with name cli_login_postgres or OID 26135, and the full
   `cli_login_` inventory is empty. Compare non-target roles, ownership and data
   against fresh baselines, explaining legitimate concurrent changes.
5. Verify existing authorized Farmplast → SACS passwordless SSO, ordinary
   Farmplast authentication, service connections and fresh authentication errors.
   No accounts, Safety completions or employee changes. Mark CLOSED only after
   actual removal and successful checks; missing SSO evidence leaves OPEN.
6. Do not recreate roles/credentials automatically on regression. Stop and obtain
   separate authorization for corrective mutations. No deployment or ZKT changes.

**One required owner action:** explicitly authorize DELETE for SACS project
`kbooijfblzzdxvpjzbsh`, with the currently verified role cli_login_postgres OID
26135 and stop-on-scope-change guards. The earlier authorization does not cover
role deletion. **Stopped before DELETE.** Only this existing report was updated;
no new phase or report was created. Product tests were not rerun for documentation.

---

## Authorized execution — 2026-10-11

**Execution: BLOCKED — PRIVILEGED SACS ADMINISTRATIVE ACCESS REQUIRED.**
**SACS SECURITY INCIDENT: OPEN. Owner authorization: GRANTED.**
Base/application commit: `f70bedccd368eb2a1c86f4354e5a36ab8f208bf7`.
Documentation commit: `git log -1 --format=%H -- docs/former-employees-security-remediation.md`.
Evidence window: **18:27:52–18:29:04 UTC**. DDL execution timestamp: **none**.

The owner explicitly authorized NOLOGIN, PASSWORD NULL and REVOKE postgres for
`cli_login_postgres`, OID **26135**, only in SACS, and confirmed that no external
clients use this role. This supersedes the historical authorization blocker below.
No additional authorization is being requested for these three operations.
Read first: this report, Phase 7 and `docs/former-employees.md`.

### Fresh preflight

Verified target: pinned Supabase SACS project **`kbooijfblzzdxvpjzbsh`**,
database **postgres**, database OID **5**. Both SACS markers exist:
`public.farmplast_sync_config` and `public.sync_farmplast_employee(jsonb)`.
Existing Credential Manager management token stayed in memory; no linked CLI,
new login role or authentication change was used.

| Check | Fresh actual result |
|---|---|
| Role name / OID | cli_login_postgres / 26135; matches approval |
| LOGIN / password verifier present | true / true; boolean only |
| Expiry | 2026-10-11T14:21:45.488091Z; not incident closure |
| Role attributes | NOINHERIT; SUPER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS false; connection limit -1 |
| Membership direction | postgres (16388) granted to cli_login_postgres (26135) |
| Membership options / grantor | ADMIN=false, INHERIT=false, SET=true / supabase_admin |
| Active sessions / parent memberships / shared dependencies | 0 / 0 / 0; full stats visibility confirmed |
| Owned relations / functions / schemas / databases | 0 / 0 / 0 / 0 |
| Explicit relation / function ACL references | 0 / 0 |
| Effective direct privileges | SELECT 6 relations; DELETE cron.job_run_details; EXECUTE 4450 functions; PUBLIC/default privileges remain distinct from explicit grants |
| Internal references | cron CLI username/references, routine/config/database-role-config references all 0 |
| External clients | Owner explicitly confirmed none; not independently audited as all external services |
| SSO DB functions | issue_farmplast_sso and consume_farmplast_sso owned by postgres, SECURITY DEFINER; no temporary-role reference |
| SSO permissions | service_role issue/consume true; anon issue, authenticated direct consume/read codes false |

The existing Farmplast SSO implementation validates its existing user/session and
uses the HTTP SACS endpoint with its integration secret. The inspected DB functions
execute as postgres, not cli_login_postgres. These source/catalog checks support
independence from the temporary role; they are not a fresh interactive SSO test.

### Exact execution blocker and stop condition

A **SELECT-only** probe of the documented Management API
`POST /v1/projects/kbooijfblzzdxvpjzbsh/database/query` with `read_only=false`
returned current_user=session_user=**postgres**. No DDL was submitted. Fresh
capability evidence at **18:28:38.977107Z**:

- postgres SUPERUSER=false, CREATEROLE=true;
- `pg_has_role(current_user,'supabase_admin','SET')` = **false**;
- supabase_admin SUPERUSER=true and is the actual membership grantor;
- the current actor has no membership granting it that grantor authority.

CREATEROLE alone is not proof of authority to remove this grant. The approved
script explicitly uses `REVOKE postgres FROM cli_login_postgres GRANTED BY
supabase_admin`; executing under the observed actor does not meet its grantor
permission requirement. Removing GRANTED BY, granting privileges, or trying
individual ALTER commands would not be a safe substitute for the approved atomic
procedure. No such workaround was attempted.
[PostgreSQL 17 REVOKE permissions](https://www.postgresql.org/docs/17/sql-revoke.html),
[Supabase query endpoint](https://supabase.com/docs/reference/api/v1-run-a-query).

The example administrator-managed libpq service from the historical report is not
configured in the three standard user service-file paths inspected. No existing
privileged SACS connection was established. The read-only endpoint's actor is
supabase_read_only_user and also cannot SET the grantor. Both discovered methods
therefore fail the required execution capability check.

**Actual operations: ALTER ROLE 0; REVOKE 0. Transaction: NOT SUBMITTED.**
There is no partial failure or committed operation, and no retry or rollback was
performed. The final independent read-only sample **18:29:04.597901Z** confirms
OID 26135 still LOGIN=true, verifier_present=true, the same postgres membership,
0 sessions, 0 owned objects and 0 shared dependencies.

### Data and SSO verification

Fresh SACS baseline **18:28:39.930459Z**:

| Dataset | Count | Aggregate MD5 |
|---|---|---|
| Employees | 74 | 39309c7ef19850447fde1a1d9a1b22d5 |
| Safety daily_sessions | 1 | c65a16e2ebcb7c440ddf99cf96db21ee |
| Completed assignments table | 0 | d41d8cd98f00b204e9800998ecf8427e |

Fresh Farmplast baseline **18:28:51.409866Z**: Employees 65 (57 Active / 8 Former),
payments 987, payroll checks 1544, deductions 242, work logs 5665, attendance 10578.
Every count/checksum matches the previous recorded baseline. No records were
modified. Source roles, ownership and policies were not modified; a complete new
other-role checksum was not collected and is not claimed as a post-change test.

Latest recorded successful SSO remains **15:59:46.214176Z**, with **0 recorded
failures** in the queried preceding three-hour window. This is existing baseline
evidence, not post-remediation PASS. Because execution was stopped before DDL,
no post-change interactive SSO, service-connection or error-window test occurred.
The incident cannot be CLOSED on this evidence.

Private evidence, outside Git and without credential values:
`reports/former-employees-security-remediation-private/authorized-preflight.json`,
`authorized-admin-probe.json`, `authorized-admin-capabilities.json`,
`authorized-sacs-baseline.json`, `authorized-farmplast-baseline.json`,
`authorized-final-role.json`. Existing SQL queries supplied role/data evidence.
No implementation or infrastructure contract changed; product tests were not rerun.

### One required owner action

**Have the SACS Supabase administrator/provider execute the existing guarded script
using an approved privileged connection able to act as the actual grantor
supabase_admin.** Do not grant Codex additional database roles or create another
CLI login as a workaround. The owner authorization already covers the three
operations; the missing item is administrative execution capability.

After provisioning an administrator-managed, pinned libpq service (the name below
is a placeholder, not an existing verified connection), use from this checkout:

```powershell
psql 'service=sacs-approved-security-admin' -X -v ON_ERROR_STOP=1 -v owner_authorized=yes -v external_inventory_confirmed=yes -v expected_role_oid=26135 -f docs/operations/sacs-temporary-role-remediation.sql
```

The administrator must rerun preflight immediately before execution. The script
checks identity, dependencies, sessions, grants and internal references again,
executes only the three authorized DDL operations, and checks all postconditions
before COMMIT. Expected result: the same role/OID exists, NOLOGIN, verifier absent,
postgres membership absent, no unexpected sessions. Return the sanitized UTC
transaction result and boolean postconditions, never passwords or verifiers.
Then verify the existing authorized Farmplast → SACS SSO, fresh error window and
service connections, and compare fresh pre/post Employees/Payroll/Attendance/
Safety aggregates. Only that complete evidence can close the incident.

Before COMMIT any guard or SQL error requires transaction rollback and stop.
After COMMIT do not restore LOGIN, credentials or membership automatically; a
failed SSO requires explicit authorization for any security-sensitive recovery.
No deployment, migration, feature flag, employee, Payroll, Attendance, ZKT or SACS
Safety change was performed. **Stopped with incident OPEN for the exact
administrative-access blocker above.**

---

## Historical preparation — superseded authorization status

The following preserves the earlier audit. Its AWAITING OWNER AUTHORIZATION
statements describe the earlier task only; the current disposition is above.

### Earlier remediation preparation

Дата: **2026-10-11**, preflight evidence **17:02–17:12 UTC**.
Branch: `codex/former-employees`; base **`7add4bcdb3dbf677a06b610fdd273bf87557b21e`**.
Commit отчёта: `git log -1 --format=%H -- docs/former-employees-security-remediation.md`.

**Execution status: AWAITING OWNER AUTHORIZATION. Incident status: OPEN.**
Production mutations выполнено **0**. Role cleanup, deployment, feature flags,
employee/Safety changes, Bridge/terminal operations и credentials rotation не
выполнялись. Прочитаны [Phase 7](former-employees-phase7.md) и
[Phase 5 security](former-employees-phase5-security.md).

Пользователь прямо указал: «Это задание разрешает подготовку и проверку
remediation, но не является разрешением на изменение production-роли».
Отдельного последующего разрешения в этой сессии нет.

## 1. Preflight: точная identity и фактическое состояние

Pinned SACS Supabase project: **`kbooijfblzzdxvpjzbsh`**, database `postgres`,
database OID **5**. Read-only Management API
`POST /v1/projects/{ref}/database/query/read-only`; actual audit principal
`supabase_read_only_user`, `transaction_read_only=on`.
Existing Credential Manager token использован только в памяти; linked CLI не
запускался. Финальный sample **2026-10-11T17:10:40.159319Z**.

| Проверка | Факт |
|---|---|
| Exact temporary role / OID | **cli_login_postgres / 26135** |
| LOGIN / verifier | **true / true**; password/hash не извлекался |
| Attributes | NOINHERIT; SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS=false; connection limit -1 |
| Password expiry | 2026-10-11T14:21:45.488091Z; expiry не означает деактивацию |
| postgres membership | postgres OID **16388**; grantor **supabase_admin**; ADMIN=false, INHERIT=false, SET=true |
| Other memberships / parent membership dependencies | **0 / 0** |
| Active sessions | **0**, oldest connection null; pg_read_all_stats visibility=true |
| Ownership | relations/functions/schemas/databases: **0/0/0/0** |
| Shared dependencies | **0** across pg_shdepend references to role |
| Explicit relation/function ACL entries naming this role as grantor/grantee | **0 / 0** |
| Effective privileges without SET ROLE | SELECT 6 relations; DELETE cron.job_run_details; INSERT/UPDATE/TRUNCATE=false on those relations; EXECUTE 4 450 functions |
| Internal use | cron total 1, CLI username 0, role references 0; routine/role-config/database-role-config references **0/0/0** |
| SACS app audit logs | role-name references **0**, это не журнал всех DB connections |
| Current audit actor can SET ROLE supabase_admin | **false**; текущий read-only endpoint не является execution method для cleanup |

SELECT relations: extensions.pg_stat_statements_info, extensions.pg_stat_statements,
extensions.tap_funky, extensions.pg_all_foreign_keys, cron.job и
cron.job_run_details. Эти effective rights включают PUBLIC/default grants:
не следует называть их персонально выданными explicit grants этой роли.
Fresh recursive role query подтверждает reachable privileged roles через
SET ROLE postgres, включая CREATEROLE/CREATEDB/BYPASSRLS. NOINHERIT этот переход
не запрещает. Не выполнялся login-test от имени временной роли.

Read-only SQL: [sacs-remediation-preflight.sql](operations/sacs-remediation-preflight.sql).
Aggregate proof: [sacs-remediation-evidence.json](operations/sacs-remediation-evidence.json).
Raw responses остаются вне Git в
`C:\Users\Owner\Documents\farmplast\reports\former-employees-security-remediation-private`,
Owner-only NTFS ACL, inheritance disabled. Secret values и персональные records
в отчёт/Git не включены.

## 2. Доступные журналы предыдущих подключений

Postgres settings: `log_connections=off`, `log_disconnections=off`,
`log_statement=ddl`, `log_destination=csvlog`, collector=on.
`pg_stat_activity` показывает текущие sessions, не исторические connections.

Provider Management API GET `/analytics/endpoints/logs`, scoped SACS, выполнял
только aggregate SELECT без event_message/SQL/credential values в результатах:

- Window **13:00:00–17:03:28 UTC**: postgres/supavisor/pgbouncer events с ролью
  в structured username или message — **0 recorded matching events**.
- Coverage query **13:00:00–17:09:10 UTC**: **15 postgres_logs events**, first
  14:19:58.718, last 16:06:33.948; role_user_events=0, connection-related=0,
  CREATE/ALTER ROLE events=0. Pooler source rows не вернулись.

Из этого нельзя заключить, что прежних connections не было. Connection logging
выключен; доступный dataset не содержит creation/modification события этой роли.
Exact role DDL time и alternative auth/cache/pooler usage **не установлены**.
Нет оснований объявить expired credential единственным возможным способом auth.
[Supabase bounded log queries](https://supabase.com/docs/guides/observability/advanced-log-filtering),
[log capture limits](https://supabase.com/docs/guides/observability/log-field-reference).

## 3. Использование сервисами: проверенный scope и ограничения

Fresh local scoped source/config audit **17:09:49.959Z**:

| Scope | Проверено | References на cli_login_postgres |
|---|---|---|
| SACS frontend/src + supabase/functions | **83 source files**; checkout SHA 49088c21cb9498435c42c1a8453f74bb76728469 | **0** |
| Farmplast client/src + server + api | **94 files** | **0** |
| Candidate Bridge source/install | **10 files** | **0**; это не установленный runtime |
| Historical NJ bridge source | **1 file** | **0**; capture 2026-09-08 |
| Local SACS/Farmplast env files | **1 + 2**; role literal проверен в памяти | **0**; values не выводились |
| Historical NJ env files | **3**; key names/role literal проверены, values не выводились | **0**; конфигурация не подтверждена как current |
| SACS DB scheduled jobs | **1 cron job** | CLI username/reference **0/0** |

Source paths используют Supabase HTTP clients / service-role integration;
отсутствие role literal исключает только direct reference в перечисленных файлах.
Оно не исключает другой indirect credential, внешние deployments или secret manager.

Fresh Vercel metadata refresh с `decrypt=false` для pinned SACS/Farmplast projects
получил **403 forbidden scope**. Мapped CLI fallback недоступен: локальные
`vercel`/`vc` executables не найдены. CLI не устанавливался, linking/login/reauth
не запускались. Phase 6 metadata (SACS production URL/anon vars) остаётся cached
evidence; не выдаётся за свежую проверку всех production envs.

Live NJ/PA Windows configuration, Scheduled Tasks и external service/pooler/cache
inventory **не подтверждены**. Phase 7 live-access blockers остаются. Поэтому
вывод «роль гарантированно нигде не используется» **не сделан**. Владельцу нужен
inventory sign-off по внешним клиентам/пулерам и текущим сервисам до cleanup.

## 4. Guarded remediation: подготовлено и проверено, НЕ выполнено production

Новый manual-only script:
[sacs-temporary-role-remediation.sql](operations/sacs-temporary-role-remediation.sql).
Он не включён в migrations или rollout. Default authorization и external inventory
ack — **no**; default expected OID — **26135**.

Перед изменениями script требует явный owner authorization, подтверждённый
external inventory, правильный database/SACS markers, тот же role OID,
ожидаемые attributes/expired verifier, достаточную session visibility,
нулевые sessions/dependencies/parent memberships, ровно один ожидаемый postgres
membership с source grantor/options, отсутствие internal usage references.
Любое отклонение — exception и остановка. Pinned connection verification остаётся
обязанностью администратора: markers сами по себе project identity не заменяют.

Единственные persistent production mutations после отдельного разрешения:

```sql
ALTER ROLE cli_login_postgres NOLOGIN;
ALTER ROLE cli_login_postgres PASSWORD NULL;
REVOKE postgres FROM cli_login_postgres GRANTED BY supabase_admin;
```

`GRANTED BY` указывает фактически установленного grantor; не снимает другие
grants. После DDL, **до COMMIT**, проверяются тот же OID, NOLOGIN, NULL verifier,
membership count 0 и sessions 0; failure откатывает transaction. Нет DROP ROLE,
REASSIGN OWNED, DROP OWNED, CASCADE или массового REVOKE.
[PostgreSQL ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html),
[targeted REVOKE / grantor](https://www.postgresql.org/docs/17/sql-revoke.html).

### Local guard rehearsal — PASS 9/9

Отдельный localhost-only PostgreSQL **17.11**, port **55591**, fresh synthetic
cluster, no production credentials/network clients. Source role OID в fixture
**16387**, передавался отдельно; это **не** production OID. Все tests закончились,
локальный PostgreSQL остановлен; listener на 55591 отсутствует.

| Case | Результат |
|---|---|
| No authorization / external inventory unconfirmed | **Denied; role state unchanged** |
| Wrong OID | **Denied; role state unchanged** |
| Owned object dependency | **Denied; role state unchanged** |
| Unexpected membership / changed grantor | **Denied; role state unchanged** |
| Scheduled job referencing role | **Denied; role state unchanged** |
| Actual synthetic active DB connection | **Denied; role state unchanged** |
| Approved unused synthetic role | **Success**: NOLOGIN, verifier absent, memberships 0 |

Synthetic history fixture checksum неизменен. Rehearsal доказывает guard logic,
не production admin permissions и не работоспособность production SSO после
cleanup. При подготовке local fixture обнаружено, что GRANTED BY требует
соответствующих grantor privileges; они предоставлялись **только fixture**, не
production. Existing read-only actor их не имеет.

Private helper command, выполнен из workspace parent:

```powershell
python .\remediation-local-rehearsal.py
node .\remediation-config-audit.mjs
powershell -NoProfile -File .\remediation-provider-logs.ps1
```

### Production execution plan — сейчас запрещён

1. Получить отдельное явное разрешение владельца **на три операции выше** и
   external service inventory sign-off. При выявленном использовании — STOP.
2. Согласовать existing privileged SACS administrative method. Read-only API
   не использовать для DDL; не создавать login-role или повышать права ради него.
   Secure libpq service ниже — **пример заранее настроенного администратором
   профиля**, сейчас его существование/доступ не подтверждены.
3. Зафиксировать fresh baselines/SSO/errors; остановить только инициирование CLI
   role creation владельцем в согласованное окно, не production services.
   Повторно проверить preflight непосредственно перед transaction. Если role/OID,
   grants/dependencies/sessions или clients изменились — STOP, без обхода guards.
4. Администратор выполняет проверенный script на pinned SACS connection:

```powershell
# NOT RUN. Only after separate explicit approval and actual inventory sign-off.
psql 'service=sacs-approved-security-admin' -X -v ON_ERROR_STOP=1 -v owner_authorized=yes -v external_inventory_confirmed=yes -v expected_role_oid=26135 -f docs/operations/sacs-temporary-role-remediation.sql
```

При запрете managed platform на ALTER/REVOKE — STOP и согласованный provider
admin workflow; не менять grants, auth policy или credentials в обход запрета.
Authorization flags в command не являются фактом получения human approval.

## 5. Baselines и план post-change verification

Fresh pre-change aggregates, без records/UUIDs/credentials:

| Dataset | Count | Результат |
|---|---|---|
| Farmplast Employees | **65 = 57 Active + 8 Former** | Count + checksum match Phase 7 snapshot |
| Payments / Payroll checks / deductions | **987 / 1544 / 242** | Все 3 checksums match Phase 7 |
| Work logs / ZKT attendance | **5665 / 10578** | Оба checksums match Phase 7 |
| SACS Employees, all companies | **74** | Stable между 17:10:40 и 17:12:45 samples; не путать с 65 Farmplast UUIDs |
| SACS daily_sessions / one-time assignments | **1 / 0** | Stable; Safety checksum совпадает с Phase 6 |
| SACS latest successful SSO audit | **15:59:46.214176Z** | Existing Phase 6 flow; 0 recorded failures за recent 3 hours |
| SSO permissions | service_role issue/consume **true/true**; anon issue/authenticated direct consume/read codes **false** | Existing restricted service-side contract сохранён |

Farmplast read-only Management API вернул 403; permitted existing direct
verify-full PostgreSQL connection успешно получил baseline с repeatable-read
READ ONLY. Credentials оставались в памяти. SACS samples использовали read-only
API. Queries:
[Farmplast baseline](operations/farmplast-remediation-data-baseline.sql),
[SACS baseline](operations/sacs-remediation-data-baseline.sql).

**Production post-change verification: NOT EXECUTED — remediation не разрешена
и не выполнена.** Эти baselines нельзя считать post-change PASS.

После отдельно разрешённого изменения:

1. Re-read pinned SACS role **OID 26135**: LOGIN=false, verifier_present=false,
   postgres membership отсутствует; other memberships=0, sessions/dependencies=0.
   Проверить provider audit и запрет новой auth администратором без secret output.
2. Через существующий разрешённый existing-user Farmplast → SACS flow проверить
   одноразовый SSO и прежние permissions. Не создавать accounts или Safety records.
   Обычный auth audit/code этого SSO — ожидаемый auth side effect, не history change.
3. Проверить новые application/provider errors за согласованное post-change окно
   и реальные services/jobs. При недоступных logs/SSO не объявлять incident CLOSED.
4. Сравнить Employees/Payroll/Attendance/Safety counts и historical original rows
   с **fresh execution-window baseline**, а не со старой цифрой без учёта законных
   concurrent changes. Объяснить новые записи/изменения; не исправлять records ради
   совпадения checksum и не откатывать production data старым backup.
5. Подтвердить external inventory и что CLI/pooler не восстановили elevated login.
   Только после полного post-check записать disposition CLOSED.

**Rollback:** любой guard/postcondition/permission error до COMMIT — transaction
rollback; повторно прочитать роль, не продолжать отдельными DDL. После COMMIT
автоматически не возвращать LOGIN, старый password или postgres membership.
При неожиданной service dependency сохранить NOLOGIN, остановить release и
согласовать owner-managed least-privilege service recovery отдельно. Source
password/verifier не извлекались и не сохранены как rollback credential.

## 6. Выполненные операции и остановка

Фактически: required docs read; fresh read-only role/OID/ACL/dependency/usage
audits; bounded aggregate provider logs; scoped source/local config checks;
Vercel metadata attempt с 403; fresh read-only data/SSO-permission baselines;
local isolated **9/9** guard rehearsal; подготовлены manual SQL, redacted proof
и этот отчёт. Application implementation и SQL migrations не менялись.

Production `ALTER ROLE` выполнено **0**, `REVOKE` **0**, deployment **0**.
No fresh login as temporary role; no linked Supabase CLI invocation. Credential
values, raw SQL log statements и personal data не опубликованы. Read-only
queries/management requests могут попадать в обычный audit, но не меняют
employees/Payroll/Safety или database roles.

**Статус: AWAITING OWNER AUTHORIZATION; incident OPEN.** Следующее действие
владельца — подтвердить внешний service/pooler inventory и отдельно разрешить
только guarded NOLOGIN + PASSWORD NULL + targeted REVOKE postgres для
`cli_login_postgres`, **OID 26135**, через согласованный SACS admin method.
При отсутствии inventory/admin access выполнение остаётся BLOCKED даже после
общего approval. Это не разрешение на deployment или другие production changes.
