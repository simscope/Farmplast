# Former Employees — Phase 6: final release gate closure

Дата: **2026-10-11**, evidence window **15:47–16:14 UTC**.
Branch: `codex/former-employees`; base **`24f2b8ccc76720afaefc1d2a6f1d7ce597377011`**.
Rehearsal/evidence commit: **`bbff15043aec09aefb61cc9127dfed000367c6ac`**.
Report commit: `git log -1 --format=%H -- docs/former-employees-phase6.md`.

**Archive Read-Only: NO-GO. Terminate/Rehire: NO-GO. Number Reuse: NO-GO.**
Production deployment, migrations, role cleanup, flag enable и изменения employee,
Safety Records или терминалов не выполнялись. Один разрешённый existing-user SSO
handoff создал обычный одноразовый auth code / auth audit; он не является полностью
read-only SQL операцией. Новые аккаунты, permissions и credentials не создавались.
Product implementation не менялась; добавлены только rehearsal scripts и отчёт.

## 1. Release gates

| Gate | Результат | Фактические доказательства / блокировка |
|---|---|---|
| SACS Security Incident | **OPEN / BLOCKED** | `cli_login_postgres`: LOGIN=true, verifier присутствует, SET ROLE postgres остаётся. Expiry не закрывает incident; cleanup требует отдельного разрешения |
| Fresh release backup | **PASS — full logical dump** | Snapshot 15:47:49.509Z; pg_dump/TOC exit 0; 2 134 072 bytes; SHA ниже |
| Full logical PostgreSQL restore | **PASS в заявленном DB scope** | PG 17.6 + все 6 расширений; 96/96 counts/checksums, 59 policies, functions/triggers/constraints/объектные ACL и memberships |
| **Release Backup / Restore gate целиком** | **BLOCKED — recovery package incomplete** | Не проверены восстановление database-level ACL, 9 database/role settings и точное managed extension ownership; credential/external configuration recovery не подтверждён. Logical PASS не является полным recovery PASS |
| NJ Bridge live baseline | **BLOCKED — LIVE ACCESS REQUIRED** | Pinned SSH timeout; service/version/terminal health/worker queue/error logs не прочитаны |
| PA Bridge live baseline | **BLOCKED — ENDPOINT / LIVE ACCESS REQUIRED** | Подтверждённый PA host/endpoint отсутствует; нельзя угадывать его по имени peer |
| SACS SSO live baseline | **PASS — existing authorized admin flow** | Farmplast Open SACS → `/admin/company`; company_admin; code issued 15:59:44.822765Z, consumed 15:59:45.837642Z; 0 recent failures; Safety checksum unchanged |
| Production drift | **PASS в проверенном scope** | Farmplast/SACS READY deployment SHAs прежние; public functions/policies/extensions и 9 history multisets совпали с Phase 5; 65/57/8 |
| Feature isolation | **PASS candidate; effective OFF production** | Production flags/schema ещё отсутствуют; fail-closed. На full clone: 4 OFF; archive OFF denied; direct terminate/number changes denied; rollback вернул все OFF |
| Required application / Bridge / PG tests | **PASS** | 147/147; 19/19 offline; native PG17.6 two-session concurrency 10 checks; restore/rehearsal assertions |
| Build / lint | **PASS** | Build exit 0; lint exit 0, 0 errors, 6 прежних warnings |
| Archive rollback | **PASS DB/app contract; hosting operation unexecuted** | 96 original-column multisets + lawful new employee/period/attendance/payment сохранены; 10 ZKT/SSO functions unchanged |

Security, recovery package и оба live Bridge baseline не закрыты. GO не выдаётся
по большинству прошедших проверок. Physical Terminate/Reuse tests не нужны для
этого archive-only gate; они остаются отдельными блокерами следующих функций.

## 2. SACS security incident

Read-only запросы использовали Management API
`POST /v1/projects/{ref}/database/query/read-only` и существующий credential из
Windows Credential Manager только в памяти. Linked CLI auth path не запускался.

| Проверка | Phase 6 факт |
|---|---|
| Exact role | `cli_login_postgres` |
| Exact creation / modification time | **Не установлен**: role catalog не даёт такой timestamp; provider DDL logs ещё не получены |
| Наблюдаемый CLI execution window | Private CLI log CreationTimeUtc 14:15:50, LastWriteTimeUtc 14:16:46; это file timestamps, **не** доказательство точного DDL времени |
| Password VALID UNTIL | `2026-10-11T14:21:45.488091Z`, истёк |
| LOGIN / verifier | LOGIN=true; verifier_present=true; hash/password не извлекался |
| Own attributes | NOINHERIT; SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS=false |
| Membership | postgres: ADMIN=false, INHERIT=false, **SET=true** |
| Reachable privileges | SET ROLE postgres даёт CREATEROLE/CREATEDB/BYPASSRLS; далее достижимы privileged service/read/monitor roles |
| Active sessions / object dependencies | 0; `pg_read_all_stats` visibility подтверждена; own databases / parent-role memberships = 0 |
| Direct grants | SELECT 6 relations, DELETE cron.job_run_details, EXECUTE 4450 functions; это не ограничивает SET ROLE privileges |
| Internal jobs / routine / role-config usage | cron jobs 1, CLI username/reference 0; routine references 0; role-config references 0; sample 16:06:50.365748Z |
| Known SACS services | Production Vercel metadata: только VITE_SUPABASE_URL/ANON_KEY, hiddenProductionEnvCount=0; values не decrypted. Scoped frontend/Edge source search DB login references не нашёл |
| Real authentication capability | **Не доказана невозможность**. Known password expired, LOGIN/verifier сохраняются. Alternative auth/pooler/caches inventory неизвестен; password login test не выполнялся |
| HBA audit | `pg_hba_file_rules` denied, SQLSTATE 42501. Повышение прав для аудита не выполнялось |

Expiry относится к password, а NOINHERIT не запрещает SET ROLE:
[PostgreSQL CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html).
Нулевые connections и отсутствие references в известных сервисах не доказывают
отсутствие внешних клиентов или действующих альтернативных credentials.

**Disposition: OPEN.** Роль не удалять автоматически. Минимальное предложение:
NOLOGIN, PASSWORD NULL и REVOKE postgres; нет DROP OWNED / DROP CASCADE.
Существующий guarded файл [phase5-sacs-role-disable.sql](operations/phase5-sacs-role-disable.sql)
не изменён и **не выполнен**.

Владелец: получить provider DDL/audit timestamps для CLI window, проверить внешние
clients/poolers/jobs/credential caches, подтвердить pinned SACS project и отсутствие
новых sessions/dependencies. Не показывать raw DDL с password в отчёте. После
**отдельного разрешения именно на role cleanup**, используя заранее настроенный
secure psql service:

```powershell
psql 'service=sacs-approved-security' -X -v ON_ERROR_STOP=1 -f docs/operations/phase5-sacs-role-disable.sql
```

Ожидается LOGIN=false, verifier=false, sessions=0, memberships=0, dependencies=0.
Повторить read-only аудит и подтвердить отсутствие повторного CLI provisioning.
Если service использует эту роль или появились dependencies — STOP, сначала
согласовать замену credential; не отбирать доступ вслепую. HBA/alternative auth
проверяет администратор с разрешённым platform доступом. Incident CLOSED только
после фактического cleanup/проверенного безопасного disposition, не после expiry.

## 3. Backup, full restore и оставшийся recovery scope

Backup снят из exported repeatable-read read-only snapshot через pinned TLS
connector. Custom-format `pg_dump` 17.11 считал source PostgreSQL **17.6 aarch64**.
Dump не редактировался, archive objects/данные не исключались, FK/RLS проверки не
отключались. `pg_restore --exit-on-error` 17.6 exit **0**; raw restore log пустой.

```text
snapshot: 2026-10-11T15:47:49.509Z
bytes:    2134072
SHA256:   4ff748b41c9d0ca7a9fe543b6af89a62c7d3dbf4e8bf6190594cf2988fa618c7
```

Dump, source catalogs, ACL/role metadata, SACS outputs и screenshot сохранены
**вне Git**, `C:\Users\Owner\Documents\farmplast\reports\former-employees-phase6-private`.
Private directory с Owner-only NTFS ACL. Не публиковать dump, raw rows, JWT,
SSO code/hash, passwords или private SQL outputs. В Git только aggregate proof:
[former-employees-phase6-evidence.json](former-employees-phase6-evidence.json).

Isolated Linux sandbox `farmplast-phase6-restore-20261011`, session
`sbx_FAi7P4He2nsiaRAhAYkdwSUFTE2J`: PG17.6 amd64, no published ports / injected
production credentials, loopback 55440, network **deny-all до private upload**,
cron.launch_active_jobs=off, cron.log_run=off. Восстановленные jobs не запускались;
96-table comparison включает сохранённые cron rows. Sandbox non-persistent,
**остановлен 16:11:03.542Z**; local concurrency cluster также остановлен.

| Объект | Проверено source ↔ clone |
|---|---|
| Tables / rows | 96/96 row counts и sorted row-hash MD5 совпали |
| Employees | 65 total, 57 Active, 8 Former; UUID/number/history unchanged |
| Payroll / Attendance | work logs 5665; payments 987; deductions 242; tax profiles 65; payroll checks 1544; raw ZKT 10578; FK orphans 0 |
| RLS | 59 policies, normalized role lists exact; relation RLS/force-RLS metadata preserved |
| Functions / relations / schemas | 178 / 119 / 11; definitions, owners и effective ACL совпали после supplemental restoration |
| Constraints / triggers / event triggers | 293 / 20 / 6; definitions, enabled/validated states preserved |
| Default / column ACL | 27 / 0; exact match |
| Global role attributes | Non-login attributes/config preserved; source roles deliberately NOLOGIN, password verifiers не перенесены |
| Memberships | 21, ADMIN/INHERIT/SET **и grantor** совпали |
| Extensions | plpgsql 1.0; pg_cron 1.6.4; pg_stat_statements 1.11; pgcrypto 1.3; supabase_vault 0.3.1; uuid-ossp 1.1 |

pg_cron compiled from official v1.6.4 commit
`9490f9cc9803f75105f2f7d89839a998f011f8d8`; SQL-version canonicalization использует
прежний Supabase-compatible mapping 1.6→1.6.4. Vault v0.3.1 commit
`6e0cd916242d922a646e4d611cc215e09dd429f4`; libsodium-dev добавлен как build dependency.
PG17.6 tar verified against official SHA256. Initial apt HTTP failure устранён
HTTPS sources; package/source integrity checks не отключались.
[pg_cron configuration](https://github.com/citusdata/pg_cron).

Расхождения и исправления в disposable clone:

- pg_dump создавал extension members под restoring administrator: supplemental
  source owner/grants replay восстановил object owners/ACL. NULL ACL и explicit
  owner-only default ACL сравниваются по одинаковым эффективным правам, не как
  отсутствие проверки; случайный PUBLIC SELECT на cron sequences был удалён.
- Unqualified vs schema-qualified event-trigger function name нормализован через
  единственный source function; ambiguous name приводит к failure.
- Role search_path восстановлен как identifier list, не одним quoted string;
  config array order не имеет значения, key/value должны совпасть.
- Первый bootstrap создавал memberships с другим grantor. До миграций и новых
  fixtures cluster пересоздан с bootstrap `supabase_admin`; local test login
  отдельный `phase6_admin`. Final memberships/options/grantor exact PASS.
- Архитектура aarch64→amd64 и NOLOGIN — намеренная изоляция. Production role
  passwords / actual remote auth не тестировались в clone.

**Полный release recovery gate всё ещё BLOCKED.** Дополнительный source inventory
`recovery-globals.private.json` содержит database owner/ACL, **9** database/role
settings и managed extension owners. Эти объекты не были полностью replayed и
сравнены в последнем clone; source database owner `postgres`, extension owner
бывает `postgres` или `supabase_admin`, restoring admin не является заменой.
Не выдавать общий PASS по одному успешному dump/96-table restore.

Следующие обязательные действия recovery operator:

1. Зафиксировать полный recovery manifest: database properties/ACL, global roles,
   memberships/grantors, pg_db_role_setting и extension ownership; private metadata
   уже сняты. Повторить изолированный restore с replay и exact/semantic comparison
   этих дополнительных объектов. Не редактировать исходный dump / system catalogs.
2. Отдельно сохранить и подтвердить secure recovery process для DB role credentials,
   Supabase Auth/JWT/platform keys, Vercel/Edge secrets/config, webhook settings,
   storage objects и Bridge service/configuration. Не помещать их в Git/отчёт и
   не активировать production integrations в clone. Vault secrets table сейчас 0;
   это не подтверждает сохранение platform keys.
3. Подтвердить permissions/доступ к backup и его полноту для выбранного recovery
   target. Logical dump не содержит все cluster/global/service state:
   [pg_dump scope](https://www.postgresql.org/docs/17/app-pgdump.html).
4. При новой production activity перед rollout снять fresh snapshot/delta inventory
   и повторить affected checks; текущий backup — release candidate snapshot,
   не бессрочное доказательство актуальности.

Воспроизведение выполненной части, **только новый deny-all sandbox**, установленный
PG17.6/расширения и private package в `/vercel/phase6/private`:

```bash
python3 /vercel/phase6/private/setup.py
python3 /vercel/phase6/private/restore.py
python3 /vercel/phase6/private/rehearsal.py
```

Исходники: `client/scripts/phase6-linux-setup.py`, `phase6-full-restore.py`,
`phase6-archive-rehearsal.py`. Требуются source-catalog.json, source-structure.json,
structure.sql, immutable dump и обе release SQL. Эти scripts воспроизводят
**проверенный logical scope**, не закрывают автоматически перечисленные globals/
service recovery gaps. Final orchestration: `cmd_9fcc4690c4c0426db93c9c97d71b`;
aggregate proof извлечён после всех assertions; source credentials не передавались.
Migration SHA в proof считается по normalized UTF-8 SQL text; immutable dump SHA
считается по исходным binary bytes.

## 4. Archive migrations, flags и rollback rehearsal

Применены на clone только:

1. `supabase/former_employees.sql`
2. `supabase/employee_archive_feature_flags.sql`

96 original-column row multisets сохранены после каждого шага. Employment periods
backfill = 65; source Employment History table до миграции отсутствовала. После
clone-only lawful creation = 66 periods. Не выдумывались legacy termination dates.
Все исходные Payroll/Attendance/ZKT/SACS UUID references сохранены.

| Flag | Candidate DB default / production effective |
|---|---|
| former_employees_archive_readonly | OFF / OFF until authorization |
| employee_terminate | OFF / OFF |
| employee_rehire | OFF / OFF |
| employee_number_reuse | OFF / OFF |

Production flags table отсутствует, значение fail-closed, а не «4 persisted false».
UI guards, archive/API permissions и independent lifecycle API gates проверены
147 application tests. В DB clone OFF запретил list_former_employees; clone-only ON
дал admin 8 Former, anon denied. Flag table не доступна browser roles; periods RLS
flag-gated. Direct authenticated active=false / employee_number change при OFF
отклонены. Wrapper/historical mutation guards и hidden RPC revokes сохранены;
existing manual-number new employee creation успешно выполнено только на fixture.

Rollback simulation: archive OFF + прежний application contract с additive schema,
без DROP / destructive restore. Synthetic employee, новый period, payment и
attendance созданы после миграций и сохранены после OFF; clone final 66/58/8.
Все исходные 96 multisets остались; **10** legacy ZKT/SACS function definitions
byte-identical. Никакой advanced Bridge cutover не нужен/не выполнен для архива.
Live Vercel rollback не выполнялся; available target READY проверен ниже.

## 5. Live NJ / PA и действия оператора

Read-only Tailscale inventory + pinned
`ssh -o BatchMode=yes -o ConnectTimeout=8 farmplast-zkt hostname`:
NJ SSH **timeout**, текущие service/EXE/SDK/terminal state недоступны. PA host не
установлен; другие peers не доказывают принадлежность PA.

Read-only database telemetry, 16:10:25.121935Z:
10578 raw rows, latest punch **2026-10-09T23:09:13Z**, latest created/synced
**2026-10-10T00:02:28.685561Z**, missing synced_at=0; command queue rows=0.
Unmatched current employee numbers=0, duplicate current numbers=0. Это исторический
baseline, **не** доказательство running service или успешного sync сегодня.
UUID ownership/review schema ещё отсутствует; нельзя объявить ambiguity queue=0.
Worker local backlog, import errors и plant-specific heartbeat не установлены.

| Required field | NJ | PA |
|---|---|---|
| Service running / installed version | UNKNOWN, SSH timeout | UNKNOWN, endpoint missing |
| Last successful terminal sync | UNKNOWN; shared DB timestamp выше | UNKNOWN; shared DB timestamp выше |
| Terminal availability | UNKNOWN | UNKNOWN |
| Local event queue / errors | UNKNOWN | UNKNOWN |
| Archive-only contract compatibility | Source/clone contract PASS; live unverified | Source/clone contract PASS; live unverified |
| Final baseline | **BLOCKED** | **BLOCKED** |

**NJ operator:** на подтверждённом NJ Bridge host установить actual service path
read-only, снять Running/process count, EXE version/hash и последние успешные
sync/error/backlog timestamps. **PA operator:** сначала сообщить подтверждённый PA
Bridge host/terminal association, затем те же read-only результаты отдельно.

На каждом Windows host безопасный первый сбор:

```powershell
Get-CimInstance Win32_Service -Filter "Name='ZKTBridge'" |
  Select-Object Name,State,StartMode,ProcessId,PathName
# Use the actual executable path from PathName, never assume the candidate path.
Get-Item -LiteralPath '<CONFIRMED-BRIDGE-EXE>' |
  Select-Object LastWriteTimeUtc,@{n='Version';e={$_.VersionInfo.FileVersion}}
Get-FileHash -LiteralPath '<CONFIRMED-BRIDGE-EXE>' -Algorithm SHA256
```

Прочитать последние строки **существующего** local log, не публикуя secrets/employee
identifiers: last-success UTC, known terminal connected state, backlog count,
latest errors. При отсутствии данных дать UNKNOWN. Не запускать UI Test/Verify/
Sync/Pull, restart, event purge или zkemkeeper user operations. Даже «test» button
может отправить command. Physical lifecycle/reuse tests сейчас не требуются.

## 6. Live SACS SSO и employee mismatch

Использована уже authenticated Chrome Farmplast session: один click **Open SACS**,
без чтения browser tokens/passwords. Новая вкладка штатно пришла в production
SACS `/admin/company`, Farmplast Company Admin. Existing profile/company active.
Company dashboard показывает 65 total / 58 Active / 7 Inactive.

Read-only before 15:58:54.450168Z / after 16:00:46.202216Z:
code создан и consumed в пределах 60 seconds, used_at заполнен; latest 3h failures=0.
anon issuer execute=false; authenticated consumer execute=false / codes SELECT=false.
Service-only single-use/replay guard подтверждён current RPC definition;
**live replay attempt не выполнялся**, другие реальные пользователи не impersonated.
Проверенная permissions scope — существующий company_admin flow, не все SSO roles.

Safety source rows до/после: daily_sessions **1**, checksum
`c65a16e2ebcb7c440ddf99cf96db21ee`; one-time assignments **0**, checksum
`d41d8cd98f00b204e9800998ecf8427e`. Farmplast-scoped sessions/completed = 0/0.
Safety Records, training completions и assignments не менялись. Private screenshot
сохранён вне Git; SSO credential/code/hash в отчёт не включён.

65 SACS source_employee_id UUIDs совпали с Farmplast; все 65 нормализованных
employee numbers совпали. **Один** Farmplast Former остаётся SACS active; last
update/sync **2026-09-24T02:25:57.763741Z**. Number comparison нормализован как text
(SACS text vs Farmplast integer), это не ошибка переназначения номера.
Bulk sync активных ZKT employees может оставлять inactive статус несогласованным;
это объяснение из source, не доказанный HR source-of-truth. Владелец должен
подтвердить источник истины/синхронизацию перед кадровыми действиями.

Для **read-only архива** mismatch не запускает writes/reconciliation и не смешивает
UUID history; admin SSO не зависит от active этого employee. Сам по себе mismatch
не блокирует архив, но остаётся блокером утверждения корректного Terminate/Rehire.
Новый archive Safety History endpoint не deployed в SACS; честная unavailable
state остаётся, live SSO PASS не означает PASS этого будущего endpoint.

## 7. Drift, tests, changed files

Farmplast: READY `dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq`, SHA
`4b7573a6d105cbfd61a035e0c31c3f324a4a165b`.
SACS: READY `dpl_EAwTB3hi5RPNNdhLT83aH73y3sCj`, SHA
`49088c21cb9498435c42c1a8453f74bb76728469`.
Public functions, **41** public policies / **59** all policies, extensions,
employee identities/numbers и 9 history checksums совпали с Phase 5. Migration
ledger rows=0; не считать пустой ledger отсутствием SQL objects — actual catalog
проверен, archive/flags/identity/number schema пока отсутствует.
Production SSO code и processor contracts уже интегрированы в candidate;
нового production code drift не найдено. Перед будущим rollout повторить audit.

Выполнено:

```powershell
# client
npm test                              # 147/147
npm run build                         # exit 0
npm run lint                          # 0 errors / 6 baseline warnings
# client/zkt-bridge
node --test test/*.test.cjs            # 19/19 offline
# repository; guarded loopback PG17.6, server stopped afterward
node client/scripts/verify-employee-concurrency.mjs '<PRIVATE-PG17-RUNTIME>' --phase5
# 10 checks, including feature shutdown/admission locks
```

First concurrency start used default port and connection refused; corrected
loopback 55441 start passed all 10. Этот setup retry не маскирует failing test.
Desktop/Mobile synthetic archive checks Phase 5 относятся к **неизменённому** product
code; Phase 6 browser проверял current live SSO, production archive ещё отсутствует.
Не выдавать inherited synthetic Desktop/Mobile evidence за production acceptance.

Изменённые файлы Phase 6:

- client/scripts/phase6-linux-setup.py
- client/scripts/phase6-full-restore.py
- client/scripts/phase6-archive-rehearsal.py
- docs/former-employees-phase6-evidence.json
- docs/former-employees-phase6.md

## 8. Следующий разрешённый rollout — сейчас НЕ выполнять

1. Закрыть SACS incident по отдельному разрешению; получить полный recovery PASS
   включая remaining globals/config и live NJ/PA baseline. Повторить drift/SSO/
   backup freshness, зафиксировать candidate SHA, current counts и READY rollback
   target. Все gates PASS + отдельное разрешение владельца на release обязательны.
2. Проверить actual schema: migrations однократные, partial state => STOP.
   Применить только две минимальные migrations; после каждой UUID/row/FK/RLS/
   processor comparison; после второй все flags OFF.
3. Deploy принятого clean SHA без alias, проверить staged production build/version
   и fail-closed поведение; затем promote только verified deployment ID.
4. Проверить alias SHA/READY, Active Employees/Payroll/Attendance и existing SSO.
   После этого включить только archive flag; повторно прочитать все четыре values.
5. Admin Desktop/Mobile `/employees/former`: agreed count (сейчас 8), все карточки,
   search/filter/navigation, permissions/history. Non-admin/anon denied. Active
   count agreed baseline (сейчас 57), исторические rows неизменны, legitimate new
   rows учитываются отдельно. NJ/PA queues/errors/ingest и SSO без регрессий.
6. Зафиксировать errors/acceptance и actions/reuse OFF; критическая ошибка => archive
   OFF + approved application rollback, следующий stage STOP.

Команды **только после разрешения**, secure services/project/team заранее pinned:

```powershell
# Repository root, accepted clean candidate SHA:
git status --porcelain
git rev-parse HEAD
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# client directory, verified Farmplast project:
vercel deploy --prod --skip-domain
vercel inspect '<RETURNED-STAGED-DEPLOYMENT>'
# Verify build/accepted SHA and OFF smoke checks before this step:
vercel promote '<VERIFIED-STAGED-DEPLOYMENT>'
```

Отдельная approved archive enable transaction после version/smoke checks:

```sql
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.employee_feature_flags)<>4
    OR EXISTS(SELECT 1 FROM public.employee_feature_flags WHERE enabled) THEN
   RAISE EXCEPTION 'Unexpected flags; stop and re-audit';
 END IF;
END $$;
UPDATE public.employee_feature_flags SET enabled=true
WHERE flag='former_employees_archive_readonly';
SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag;
COMMIT;
```

Ожидание: archive ON, terminate/rehire/reuse OFF. Эти команды не выполнялись.
Не применять advanced migrations, blanket db push, terminal changes или SACS status
correction вместе с архивом. [Deploy](https://vercel.com/docs/cli/deploy),
[promote](https://vercel.com/docs/cli/promote).

## 9. Rollback readiness / stop

После отдельно разрешённого deployment при необходимости approved rollback:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'UPDATE public.employee_feature_flags SET enabled=false; SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# Re-confirm target READY/current prior Farmplast deployment immediately beforehand:
vercel rollback dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq
```

Database сохраняет additive archive schema и все lawful new rows. Не DROP periods/
flags/columns и не restore старый backup поверх новых production записей. Проверить
alias/version, Employees/Payroll/history, NJ/PA, SSO и errors. Legacy Bridge и SSO
contracts не заменены. Hosting permissions/plan/actual rollback capability должны
быть подтверждены владельцем; live rollback не rehearsed в production.
[Vercel rollback](https://vercel.com/docs/cli/rollback).

**Что устранено:** новый full logical dump действительно restored; data/object/
membership integrity и archive-only rollback доказаны; existing live admin SSO
baseline теперь PASS; drift и regressions PASS.

**Что остаётся:** SACS incident OPEN (DDL/auth/client inventory и отдельно одобренный
cleanup), полный recovery package/remaining globals, live NJ/PA baseline. Владелец
также подтверждает hosting rollback и затем отдельно разрешает release.
Terminate/Rehire и Number Reuse независимо NO-GO: HR/SACS reconciliation, physical
identity/deactivation ACK и все Phase 4–5 advanced release confirmations остаются.

**Phase 6 завершена отчётом; остановка перед production changes.**
