# Former Employees — Phase 7: remaining release blockers

Дата: **2026-10-11**. Evidence window: **16:31–16:52 UTC**.
Branch: `codex/former-employees`; base: **`a2288eda251e8a81e1b57abb678861c29b1a5319`**.
Evidence commit: **`1edab7362b1f8bc20eca18d7f4a15e09c5b1c5d6`**.
Report commit: `git log -1 --format=%H -- docs/former-employees-phase7.md`.

**Archive Read-Only: NO-GO. Terminate/Rehire: OFF / NO-GO. Number Reuse: OFF / NO-GO.**
Production deployment, database/role changes, feature enable, employee/Safety
changes, Bridge restart/update и terminal operations **не выполнялись**.
Archive functionality и migration SQL не изменены. Выполнены read-only audits,
новый backup, recovery rehearsal и подготовка операторской диагностики.

## 1. Release gates

| Gate | Результат | Доказательство / конкретный блокер |
|---|---|---|
| SACS Security Incident | **OPEN / BLOCKED** | LOGIN/verifier/SET ROLE postgres сохраняются; отдельного разрешения на cleanup нет; внешние clients/auth methods не инвентаризированы полностью |
| Fresh full logical backup | **PASS** | Snapshot 16:32:48.340Z, dump/TOC exit 0, 2 134 082 bytes |
| PostgreSQL restore + globals | **PASS в DB scope** | 1 180/1 180 TOC entries, 96 table counts/checksums, exact DB ACL/settings/extension owners и ICU collation; proof ниже |
| **Full Recovery Package** | **BLOCKED** | 12 private Storage objects недоступны; credentials/platform config recovery и актуальный Bridge recovery обоих sites не подтверждены; Storage API restore не выполнен |
| NJ Live Baseline | **BLOCKED — LIVE ACCESS REQUIRED** | Pinned SSH timeout; Windows service/worker/terminal status не получен |
| PA Live Baseline | **BLOCKED — ENDPOINT / LIVE ACCESS REQUIRED** | Подтверждённый PA endpoint отсутствует |
| SACS SSO baseline | **PASS — inherited Phase 6** | Existing authorized admin flow и unchanged Safety checksums; повторный SSO не инициирован |
| Production drift / product regression | **PASS в Phase 6 scope; retained** | Product contracts не менялись; свежий snapshot подтверждает 65/57/8 и отсутствие archive schema; deployment metadata повторно не аудировались |
| Feature isolation | **PASS; OFF** | Новый isolated restore/migration/rollback: все 4 OFF в конце, actions denied, archive admin 8 / anon denied. Production по-прежнему без этих migrations |
| Archive Read-Only | **NO-GO** | Security, полный recovery и оба live Bridge gates не закрыты |
| Terminate/Rehire | **OFF / NO-GO** | Advanced HR/SACS reconciliation/deactivation validation остаётся отдельной |
| Number Reuse | **OFF / NO-GO** | Physical identity/ACK и advanced gates не выполнены; автоматически не включать |

Не выдавать GO по logical restore или историческим Bridge artifacts. Физические
Terminate/Number Reuse tests не нужны для archive-only baseline, но live service
baseline требуется. Новой подготовительной фазы не предлагается: дальнейшее
закрытие внешних блокеров требует владельца/оператора.

## 2. SACS incident: read-only evidence и disposition

Fresh Management API read-only queries: **16:31:31.880216Z–16:31:33.340905Z**.
Existing Windows Credential Manager token использован только в памяти; linked
CLI не запускался. Private responses сохранены вне Git.

| Проверка | Факт |
|---|---|
| Exact role | `cli_login_postgres` |
| LOGIN / stored verifier | **true / true**; password/hash не извлекался |
| Own attributes | NOINHERIT; SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS=false; connection limit -1 |
| Membership | postgres, ADMIN=false, INHERIT=false, **SET=true** |
| Reachable rights | SET ROLE postgres даёт CREATEROLE/CREATEDB/BYPASSRLS и доступ к privileged service/read/monitor roles |
| Direct privileges | SELECT 6 relations, DELETE cron.job_run_details, EXECUTE 4 450 functions; это не ограничивает SET ROLE |
| Connections / object/shared dependencies / owned DBs / parent membership dependencies | **0 / 0 / 0 / 0**, видимость pg_read_all_stats подтверждена |
| Internal service usage | 1 cron job; CLI username/reference 0; routine references 0; role-config references 0 |
| Known app configuration | Phase 6: SACS Vercel только VITE Supabase URL/anon keys; source references на CLI DB login не найдены. Подтверждение всех внешних клиентов отсутствует |
| Password expiry | 2026-10-11T14:21:45.488091Z; **не** доказательство закрытия |
| Alternative auth / pooler / cached credentials | **UNKNOWN**; не пытались входить от имени роли |
| Exact creation / modification time | **UNKNOWN**; нужны provider DDL/audit logs. CLI log window 14:15:50–14:16:46 не является DDL timestamp |

**Security disposition: OPEN.** Нулевые sessions/references подтверждают только
наблюдаемый scope, не отсутствие внешних клиентов. HBA ранее недоступен
(42501); повышение прав ради повторной проверки не выполнялось.
[PostgreSQL role LOGIN/SET semantics](https://www.postgresql.org/docs/17/sql-createrole.html).

### Минимальное предлагаемое изменение — требует отдельного разрешения

Не DROP ROLE / DROP OWNED / CASCADE. После подтверждения владельцем, что роль
не используется сервисами или alternative auth, отдельно разрешить только:

```sql
ALTER ROLE cli_login_postgres NOLOGIN PASSWORD NULL;
REVOKE postgres FROM cli_login_postgres;
```

Готовый guarded transaction: [phase5-sacs-role-disable.sql](operations/phase5-sacs-role-disable.sql).
Непосредственно перед выполнением повторить sessions/dependencies/memberships,
проверить pinned SACS project и использование jobs/pooler/external clients.
Не использовать CLI, который способен вновь создать login.

```powershell
# ONLY after explicit owner approval, with an administrator-managed pinned
# SACS libpq service. No password/URL in command, Git or report.
psql 'service=sacs-approved-security-admin' -X -v ON_ERROR_STOP=1 -f docs/operations/phase5-sacs-role-disable.sql
```

Ожидается: role существует; LOGIN=false; verifier_present=false; memberships=0;
sessions=0; dependencies остаются 0. Проверить существующие SACS services/jobs,
authorized SSO и Safety history read-only; подтвердить, что новая authentication
этой роли запрещена администратором без вывода credentials. Зафиксировать provider
audit timestamp. При неполной post-check не маркировать CLOSED.

**Rollback security operation:** до COMMIT — `ROLLBACK`; guarded SQL abort не
должен частично примениться. После COMMIT не восстанавливать старый elevated
LOGIN/password/membership автоматически. При неожиданной service dependency
сохранить NOLOGIN, остановить release; владелец отдельно согласует известную
service identity с минимальными grants и новый credential через secret manager.
Изменение auth восстановлением старого пароля не является безопасным rollback.

## 3. Fresh backup и устранённые DB recovery gaps

Snapshot: **2026-10-11T16:32:48.340Z**; repeatable-read READ ONLY с exported snapshot,
удержанным до окончания `pg_dump 17.11 --format=custom --snapshot=...`.
TLS verify-full; credentials только в памяти. Source: PostgreSQL **17.6 aarch64**.
Catalog, structural metadata и globals сняты в той же transaction; исходный dump
не изменялся. Counts: **65 employees = 57 Active + 8 Former**, 96 tables.

```text
farmplast-full.dump
bytes: 2134082
SHA-256: d42b02b909aeb9151e4921f6ccb708e78809b9e25910979133825b5b1806c229
pg_dump exit: 0; pg_restore --list exit: 0
```

Private package: `C:\Users\Owner\Documents\farmplast\reports\former-employees-phase7-private`.
NTFS ACL: только Owner, inheritance disabled. Dump, metadata, UUIDs, photos и
source function bodies не добавлены в Git. Credentials/password verifiers не
включались в globals metadata. Owner-only ACL не заменяет off-host encrypted
backup/secret escrow: их recoverability пока **не доказана**.

### Изолированный full restore

Disposable nonpersistent sandbox, PostgreSQL **17.6 amd64**; ports наружу не
открыты. До загрузки private files network policy заменена на **deny-all**.
No production credentials; all source application roles NOLOGIN. Cron launch
OFF и log_run OFF; integration requests блокируются network policy. Sandbox
остановлен после получения агрегированных proof; snapshot с production data не
сохранялся. Различие CPU architecture документировано, logical checks совпали.

В Phase 6 не были доказаны DB-level ACL, 9 settings и exact extension ownership.
Также source использует ICU `en-US`, LC_COLLATE/CTYPE `en_US.UTF-8`, collation
version **153.120**. Здесь PostgreSQL пересобран с official ICU **73.2**,
commit `680f521746a3bd6a86f25f25ee50a62d88b489cf`; version **153.120** совпала.
Никакого REFRESH COLLATION VERSION ради сокрытия mismatch не выполнялось.
[ICU release](https://github.com/unicode-org/icu/releases/tag/release-73-2),
[PostgreSQL collation](https://www.postgresql.org/docs/17/collation.html).

Все **1 180 TOC entries** выполнены, исключено **0**. Сначала schemas, затем
EXTENSION entries из того же immutable dump под исходным extension owner,
затем все остальные entries. Generated use-list распределяет execution; не
фильтрует данные/constraints/RLS и не редактирует dump. Temporary local bootstrap
superuser rights сняты до проверки source global attributes. Managed ownership
не подменялся прямыми UPDATE pg_catalog.

| Проверка restored copy | Результат |
|---|---|
| Original table counts/checksums | **96/96 match**, включая Employees/Payroll/Attendance/Storage metadata/ZKT/SACS references |
| Functions / relations / schemas | **178 / 119 / 11**, exact definitions/ownership/effective ACL |
| Default ACL / column ACL | **27 / 0**, exact |
| Constraints / triggers / event triggers | **293 / 20 / 6**, exact |
| Source RLS | **59 preserved**, canonical policy rows сравнивались после migrations с original snapshot |
| Global role attributes / membership options и grantors | **match**; intentional NOLOGIN/no production passwords |
| Database owner/ACL/encoding/provider/locale/connection limit | **exact**, только name postgres → phase7_restore для isolation |
| Database/role settings | **9/9 match** |
| Extension owners/versions | **6/6 exact**: plpgsql 1.0, pg_stat_statements 1.11, uuid-ossp 1.1, pgcrypto 1.3, supabase_vault 0.3.1, pg_cron 1.6.4 |
| Original dump SHA after restore | **unchanged** |

Proof: [phase7-recovery-proof.json](operations/phase7-recovery-proof.json).
Executed driver: [phase7-recovery-globals.py](../client/scripts/phase7-recovery-globals.py).
It reuses the Phase 6 structural/migration/rollback assertions; no new archive code.
pg_cron SQL version mapping uses the already verified Phase 6 upstream/Supabase
recipe; extension checks не ослаблены.

Exact isolated commands, **never execute against an existing production host**:

```text
# Fresh network-denied sandbox, public PG/ICU/extensions compiled first.
# Copy phase6-linux-setup.py and phase6-archive-rehearsal.py with only
# phase6 -> phase7 path/admin/DB namespace replacement into private directory.
# Install private snapshot inputs as source-catalog.json, source-structure.json,
# source-globals.json, structure.sql, globals.sql and immutable full dump.
# Install the two SQL migrations into private directory unchanged.
LD_LIBRARY_PATH=/vercel/phase7/icu-runtime/lib python3 /vercel/phase7/private/phase7-linux-setup.py
LD_LIBRARY_PATH=/vercel/phase7/icu-runtime/lib python3 /vercel/phase7/private/phase7-recovery-globals.py
# Supplemental RLS check: SELECT json_agg(to_jsonb(p)) FROM pg_policies p;
# Canonicalize role arrays and verify every original snapshot policy row remains.
```

### Migrations / rollback rehearsal

| Migration | SHA-256 |
|---|---|
| supabase/former_employees.sql | 6ef40ea7eff739bcb6b644af9b8a539658f3fffa1fc4a7d60dde814d9fe2fd70 |
| supabase/employee_archive_feature_flags.sql | e18a3a76accbd7b38950b72282978ba837b903c5bfee7bdadd5b01d30e616a88 |

Обе migrations применены только на restored copy. После каждой все original
columns/multisets 96 tables сохранены. Admin archive показывает 8, anon denied,
archive OFF denied. Synthetic lawful employee + employment period + attendance +
payroll созданы после migrations исключительно в clone; terminate/number update
denied. Rollback отключил все 4 flags и сохранил schema и новые записи. Поэтому
clone после fixture имеет 66 employees: +1 synthetic, не production drift.
10 legacy ZKT/SACS function definitions byte-for-byte сохранены.

Это DB/app-contract rollback PASS; live hosting rollback не выполнялся и не
объявляется rehearsed. Не DROP migrations и не restore старый backup поверх
законных production записей.

## 4. Full Recovery Package: внешние части и честные ограничения

| Компонент | Фактический результат | Что остаётся |
|---|---|---|
| PostgreSQL dump + global metadata/grants/settings/extensions/RLS | **PASS DB scope** | Managed service auth/operational configuration не заменяется catalog restore |
| Storage inventory | **67 objects, 3 buckets**: employee-photos public 55; ch1-firmware private 2; chiller-firmware private 10 | Inventory metadata восстановлено SQL, bytes требуют отдельного backup |
| Public Storage files | **55 downloaded**, 7 189 056 bytes; size mismatch 0; SHA-256 перепроверены и file copies restored в отдельную private directory | Это filesystem rehearsal, **не** запуск/restoration Storage service/API |
| Private Storage files | **12 unavailable**, SDK download с existing anon credential вернул 400 | Нужен владелец с разрешённым download доступом; не ослаблять policies и не выводить service-role key |
| Archive integrity | **PASS partial archive**: ZIP CRC test, dump и все 55 payload SHA совпали | Partial package прямо помечен INCOMPLETE; 12 объектов/config/secrets отсутствуют |
| Service configuration | Repo code/deployment references и DB settings доступны | Актуальный encrypted export Vercel/Supabase Auth/Edge/Storage/webhook/network settings, redirect URLs и restore verification не подтверждены |
| Required secrets | В Git/report values отсутствуют; production credentials не переносились в sandbox | Владелец должен подтвердить vault/escrow access, JWT/Vault encryption key recovery, SSO/Edge/Bridge/database/storage credentials и test recovery. DB roles NOLOGIN намеренно; operational auth не проверен |
| NJ Bridge historical recovery | Capture 2026-09-08, **8/8 runtime/SDK SHA match**; ZIP CRC valid, 9 entries | Это не текущая configuration или live health; editable packaged source/lockfile отсутствуют |
| PA Bridge recovery | **BLOCKED** | Нет подтверждённых current host/config/runtime/SDK artifacts и восстановления на isolated Windows |

Partial private archive `farmplast-recovery-INCOMPLETE.zip`, 61 entries:
SHA-256 **`da86a6a63bdcfb893c92f397582846fc157290ab002ad1b91d68daa3ecd17506`**.
Historical NJ ZIP SHA-256:
**`fccb670c95fcdb1155deff34eea3d517f511ff12e0a0f0ceb814916c0f5fe5c7`**.
Archive integrity ≠ complete recovery. Payload manifest, filenames/UUIDs and
local copies остаются private. Local ZIP не следует отправлять в чат или Git.
Aggregate asset proof: [phase7-assets-proof.json](operations/phase7-assets-proof.json).

Owner recovery procedure: получить все 67 Storage payloads через approved
download method; сверить counts, size и manifest hashes; восстановить bucket
policies/API в изолированном проекте и проверить authorized access. Сохранить
encrypted off-host package/configuration с отдельным secret manager recovery
procedure и проверить retrieval. При credentials rotation требуется отдельное
разрешение; в этой фазе rotation не выполняется.

Bridge recovery: для NJ и PA сохранить актуальный service/Task Scheduler/runtime/
SDK/config inventory в encrypted owner-controlled archive; проверить SHA-256.
В isolated Windows восстановить 32-bit runtime/SDK/COM dependencies с test
credentials, mock terminal и запретом production egress. Только после такого
rehearsal можно утверждать Windows Bridge recovery PASS. Historical binaries
не исполнялись и COM registration на действующих компьютерах не менялась.
[Supabase recovery scope](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[Storage download](https://supabase.com/docs/reference/javascript/storage-from-download).

## 5. Live NJ / PA baseline

Разрешённый pinned NJ SSH, BatchMode/StrictHostKeyChecking, existing identity:

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=8 farmplast-zkt hostname
```

Exit **255**, connection timeout. Tailscale peer inventory сохранён private;
другие peers не объявлялись PA и их credentials не использовались. PA remote
endpoint отсутствует. Services, NSSM binary, SDK и terminal не вызывались.

| Required fact | NJ | PA |
|---|---|---|
| Host reachable via approved remote connection | **NO: SSH timeout** | **UNKNOWN: no approved endpoint** |
| NSSM service status | UNKNOWN | UNKNOWN |
| Installed Bridge version | UNKNOWN | UNKNOWN |
| Last successful sync | UNKNOWN live | UNKNOWN live |
| Last received event | UNKNOWN live | UNKNOWN live |
| Terminal connectivity | UNKNOWN | UNKNOWN |
| Pending local queue | UNKNOWN | UNKNOWN |
| Synchronization errors | UNKNOWN | UNKNOWN |

Phase 6 last server sync 2026-10-10T00:02:28.685561Z / last punch
2026-10-09T23:09:13Z и server queue 0 не являются live Windows health.
Offline candidate version 2.0.0-candidate.1 не является установленной версией.

### Одна короткая диагностическая инструкция для оператора

Скопировать [phase7-zkt-baseline.ps1](operations/phase7-zkt-baseline.ps1) на каждый
действующий Bridge computer и выполнить локально соответствующую команду:

```powershell
powershell -NoProfile -File .\phase7-zkt-baseline.ps1 -Plant NJ > .\zkt-NJ-baseline.json
# On the PA computer instead:
powershell -NoProfile -File .\phase7-zkt-baseline.ps1 -Plant PA > .\zkt-PA-baseline.json
```

Если NSSM stdout/queue paths не найдены автоматически, указать существующие
известные оператору `-LogFile`, `-QueueFile`, `-InstallDir`; custom service name
через `-ServiceName`. Не обходить managed execution policy; использовать
разрешённый организацией способ запуска. Script читает CIM, две registry values
(Application/AppStdout), files/hash и последние 1 000 log lines. Не читает
AppEnvironmentExtra, не выводит raw logs/args/env/URLs/employee IDs/queue payloads,
не делает SDK/network probe и не меняет services/terminal.

Вернуть **два JSON файла** и краткое подтверждение: actual plant/computer,
последний successful sync/event, terminal connectivity по существующим логам/
наблюдению, backlog и errors. Log candidates требуют подтверждения: отметка
connected в старом логе не доказывает current connectivity; неизвестное queue
format остаётся null/UNKNOWN, а не 0. При отсутствии свидетельства baseline
остаётся BLOCKED. Не возвращать .env, credentials, raw logs или персональные
скриншоты. Не нажимать Sync/Pull/Test и не перезапускать service для диагностики.

Script проверен в Windows PowerShell на synthetic service/log/queue fixture:
success marker `Auto pull attendance done`, event/terminal timestamps, pending=2,
errors=1, process=1; sentinel credentials/URL не попали в JSON. Synthetic result
остаётся `OPERATOR_CONFIRMATION_REQUIRED`, не live PASS.

## 6. Inherited evidence, SACS mismatch и required tests

Product code и SQL contracts не изменены. Full application/Bridge/concurrency/
build/lint/Desktop-Mobile suite повторно не запускались по требованию Phase 7.
Retained Phase 6: application **147/147**, offline Bridge **19/19**, PG concurrency
**10 checks**, build/lint exit 0 (6 existing lint warnings), authorized SSO PASS.
Эти результаты не являются свежим production acceptance.

Новые проверки: Python syntax compile; synthetic Windows diagnostic/redaction
assertions; immutable snapshot dump restore/global/locale checks; reused recovery
migration/rollback assertions (новый recovery environment contract); ZIP CRC,
55 Storage payload hashes/file copies, 8 Bridge manifest file hashes; git diff
whitespace check. Product implementation не менялась.

Executed local evidence commands (private helpers находятся вне product Git):

```powershell
# Workspace parent C:\Users\Owner\Documents\farmplast:
powershell -NoProfile -File .\phase7-diagnostic-test.ps1
python .\phase7-asset-check.py
# Product repo:
python -m py_compile client/scripts/phase7-recovery-globals.py
git diff --cached --check
```

Изменённые product repository files: этот report; recovery driver
`client/scripts/phase7-recovery-globals.py`; `docs/operations/phase7-zkt-baseline.ps1`;
два redacted proof JSON (`phase7-recovery-proof.json`, `phase7-assets-proof.json`).
Compiled bytecode/fixture files в Git не включены.

Known Phase 6 mismatch: 1 Farmplast Former остаётся SACS active; source-of-truth
HR reconciliation не установлена. UUID history не смешивается, read-only archive
не запускает sync/correction, existing admin SSO от этого статуса не зависит.
Сам mismatch не блокирует read-only archive; Terminate/Rehire остаётся NO-GO.
Новый Safety History endpoint не deployed: previous documented unavailable state
не превращается в PASS по existing SSO. Реальные Safety Records не изменялись.

Перед отдельно разрешённым будущим release owner re-confirms fresh drift/backup/
SSO/Bridge baseline; Phase 6 deployment IDs служат только известным rollback
target, не обещанием их неизменности в момент rollout.

## 7. Rollout / rollback: только после закрытия gates и отдельного разрешения

Последовательность остаётся Phase 6: security CLOSED → full recovery PASS → оба
live baseline PASS → fresh drift/backup/SSO/rollback target verification → separate
owner release permission → две migrations по actual schema с history checks и
всеми flags OFF → staged production deploy без alias → version/OFF smoke →
promote → Employees/Payroll/Attendance/SSO → approved archive-only enable → admin
Desktop/Mobile all 8 cards/permissions → live Bridge/errors/history acceptance.
Terminate/Rehire/Number Reuse остаются OFF.

```powershell
# NOT RUN. Only after all gates and separate owner release approval.
git status --porcelain
git rev-parse HEAD
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# From client/, with verified Farmplast project/team and accepted clean SHA:
vercel deploy --prod --skip-domain
vercel inspect '<RETURNED-STAGED-DEPLOYMENT>'
vercel promote '<VERIFIED-STAGED-DEPLOYMENT>'
```

После разрешённых version/smoke checks включить только archive guarded
transaction из Phase 6, раздел 8; перед UPDATE проверить ровно 4 rows и все OFF.
Не использовать blanket db push, advanced migrations или SACS reconciliation.

При отдельно разрешённом rollback:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'UPDATE public.employee_feature_flags SET enabled=false; SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# Reconfirm READY deployment and hosting rollback permissions immediately first:
vercel rollback dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq
```

Сохранять additive schema и lawful new rows; проверить prior application/Payroll/
history/SSO/Bridge/errors. Live hosting operation не выполнялась. No blind DB
restore поверх новых записей. Release rollback commands inherited from reviewed
[Phase 6](former-employees-phase6.md); сам rollout остаётся запрещён.

## 8. Что реально закрыто и следующее действие владельца

**Закрыты DB recovery пробелы:** точные database ACL/properties, 9 settings,
managed extension ownership, matching ICU collation и новое restore/rollback
evidence. Проверена целостность доступного partial package и historical NJ
artifacts. Ни SACS incident, ни full external recovery, ни live NJ/PA не объявлены
устранёнными без фактов.

**Одно ближайшее действие владельца:** подтвердить отсутствие использования
`cli_login_postgres` внешними сервисами/pooler и дать **отдельное разрешение на
guarded NOLOGIN + PASSWORD NULL + REVOKE postgres** по разделу 2. DROP роли не
запрашивается. Разрешение на это действие не является разрешением на deployment,
credentials rotation, изменение employees или terminal operations.

После этого остаются конкретные внешние результаты: операторские NJ/PA JSON и
подтверждения; private Storage payloads и подтверждённый encrypted configuration/
secret/Bridge recovery. Получение одного approval не превращает остальные gates
в PASS. **Остановка после отчёта; production release не выполняется.**
