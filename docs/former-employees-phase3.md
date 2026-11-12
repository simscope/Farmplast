# Former Employees — Phase 3: Production Readiness & Live Validation

Дата проверки: 11 октября 2026. **Production readiness: NO-GO.**
Production rollout, SQL migrations, изменение сотрудников, терминалов и SACS
records не выполнялись. Terminate/Rehire и reuse в подготовленном пакете OFF.
Локальная реализация архива проверена; разрешение production Stage B отсутствует.

## 1. Версии и границы проверки

- Ветка: `codex/former-employees`.
- Вход Phase 2: `f45e64e6936f11001fd09b693bdc74f6767f399b`.
- Фактический Farmplast production source: `4b7573a6d105cbfd61a035e0c31c3f324a4a165b`,
  branch `codex/farmplast-admin-sso`, deployment `dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq`, READY.
- Интеграция production SSO: merge `63924f6dbb32d94c21403345e0ce6f9080e3b20a`.
- Проверенный implementation commit Phase 3:
  `12e5481617af387fcf4e4c4a5e9df27447c0b84b`.
- Этот отчёт коммитится отдельно после implementation; окончательный report SHA:
  `git log -1 --format=%H -- docs/former-employees-phase3.md`.

Источник deployment — read-only Vercel `get_deployment(farmplast.vercel.app,
withGitRepoInfo=true)`. `origin/main` не является доказательством production версии.
Получен именно production SHA: `git fetch origin 4b7573a6d105cbfd61a035e0c31c3f324a4a165b`.
Перед любым будущим rollout аудит следует повторить: результаты имеют дату,
а доступность терминалов и production состояние могут измениться.

## 2. Итоговая таблица

| Проверка | Статус | Фактический результат / причина / действие оператора |
|---|---|---|
| Production Drift Audit | BLOCKED | Farmplast code/schema/RLS проверены, новые SSO commits сохранены; текущие NJ/PA binary/config и live SACS deployment/schema целиком не подтверждены. Получить актуальные private captures обоих Bridge и read-only SACS доступ. |
| Full Backup | BLOCKED | Полный Farmplast database dump получен и читается; отдельного полного SACS backup нет, восстановимость всего комплекта не доказана. Выполнить SACS backup и managed platform prerequisite capture. |
| Restore Rehearsal | BLOCKED | Настоящий полный restore остановился на отсутствующем `pg_cron`; Windows cluster также не подтверждает Supabase Vault/platform dependencies. Повторить на совместимом PostgreSQL 17.6/Supabase clone. |
| Historical UUID Mapping | BLOCKED | 10 578 legacy raw сохранены; ownership=0, review=10 578. Нет независимого доказательства device/UID/period для каждого исторического события. Получить terminal exports и подтверждённые интервалы. |
| NJ Physical ZKT | BLOCKED | NJ host offline, SSH timeout; M300Plus не опрашивался. Нужны оператор и реальные результаты раздела 7. |
| PA Physical ZKT | BLOCKED | Актуальный PA host, EXE, serial/config и SDK результаты не подтверждены. Нужны идентификация терминала и отдельный протокол PA. |
| Live SACS | BLOCKED | Обе HTML applications возвращают HTTP 200; это не проверяет Safety History, assignments, tenant permissions или SSO handoff. Нужны current authenticated read-only результаты и SACS backup. |
| Terminate/Rehire Validation | BLOCKED | Synthetic lifecycle/concurrency tests PASS; операции с реальными профилями не проводились. Нет физических ACK и live SACS подтверждения. Actions flag OFF. |
| Employee Number Reuse | BLOCKED | Flag OFF. Серверный gate и allocator regression PASS; отсутствуют восемь production подтверждений. Автоматического включения нет. |
| Application Tests | PASS | 144/144 tests; targeted final SSO/release tests PASS; lint 0 errors, 6 существующих warnings; build PASS; Chrome Desktop/Mobile PASS. |
| Bridge Tests | PASS | 19/19 candidate v2 offline tests. Это не physical NJ/PA PASS и не доказательство эквивалентности installed EXE. |
| PostgreSQL Tests | PASS | PostgreSQL 18.4: 8 checks, включая 7 реальных concurrency interleavings (6 core + конкурентное выключение gate); свежая scoped копия 9 таблиц + все 4 миграции сохраняет records/checksums и 18 RLS policies. Не full restore и не production 17.6 role matrix. |
| Production Readiness | NO-GO | Production migration запрещена до успешного полного restore; физические проверки, live SACS и rollback rehearsal не завершены. |

## 3. Production drift и интеграция

Production оказался впереди September base `0d2989ddb2887fbcf49bd813390ae1a81733b5f2`
на два SSO commits: `3d6c78d` и `4b7573a`. Они отсутствовали в Phase 2.
Оба объединены в candidate; конфликт `client/vercel.json` разрешён сохранением
SSO API, sync API и обоих employee integration/history API и их rewrites.
`SacsLink`, Dashboard single-use admin handoff и caller-scoped `can_use_sacs_sso()`
сохранены. Реальные аккаунты удалены из текущего текста SSO документации;
SSO test использует synthetic UUID. Production allowlist/config не изменялись.

Read-only database audit использовал TLS с проверкой CA, фиксированный Farmplast
project guard и `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
Production: PostgreSQL **17.6**, database size **157 969 555 bytes** на момент dump.
Extensions: plpgsql 1.0, pg_stat_statements 1.11, uuid-ossp 1.1, pgcrypto 1.3,
supabase_vault 0.3.1, pg_cron 1.6.4.

- 96 таблиц в auth, ch1_private, ch23_ota_private, cron, public, realtime, storage, vault.
- 41 public RLS policies; все **18** policies кадрового snapshot совпадают с Phase 2.
- Новая production функция по сравнению с кадровым audit: `can_use_sacs_sso`.
- `supabase_migrations.schema_migrations` отсутствует; нельзя объявить SQL files
  применёнными по имени или git history. Проверялись actual catalog и definitions.
- `employee_employment_periods`, `zkt_event_ownership`, `employee_number_config`
  в production отсутствуют. Former Employees migrations **не применены**.
- Farmplast UUID FK: orphan count **0** для work logs, payments, payroll deductions,
  tax profiles, payroll checks. Исторические строки не изменены.
- Текущее количество сотрудников: **65 = 57 Active + 8 Former**.

Production NJ/PA Bridge drift остаётся неизвестным. Tailscale peers, включая NJ
и ранее использованный Linux rehearsal server, offline; `ssh -o ConnectTimeout=8
farmplast-zkt hostname` завершился timeout. Никакие service/SDK команды не запускались.
September 8 recovery capture NJ содержит embedded Node 18.5.0 и EXE SHA-256
`5A45D0F09506336D4A771C79EE942DDF407B12AAD54607B4DAF5BE39030DFF60`.
Это **historical capture**, не текущая версия NJ. PA binary/version неизвестны.
Editable package `2.0.0-candidate.1` не объявляется production-equivalent.

## 4. Full backup / restore: фактические результаты

Private material находится вне Git:
`C:\Users\Owner\Documents\farmplast\reports\former-employees-phase3-private`.
NTFS inheritance отключён, доступ каталога выдан только текущему Owner.
В Git нет dumps, raw catalogs, account identifiers, credentials или rows с PII.
Raw schema может содержать секреты в function/cron definitions и также private.

### Full Farmplast dump

`pg_dump --format=custom --snapshot=<exported-read-only-snapshot>
--lock-wait-timeout=5s --file=<private>/farmplast-full.dump` выполнялся без schema
фильтров. Credentials передавались только в environment, TLS verify-full;
command line, console и Git их не содержат. Snapshot держался до окончания dump.

- Snapshot timestamp: **2026-10-11T13:47:11.051Z**.
- Exit code dump **0**, `pg_restore --list` **0**.
- Size **2 134 065 bytes**.
- SHA-256 **45570234629a01a3e9f2d92faf3762fc216f05ceb324f2c6f99b743c7ac2fab9**.
- TOC: 17 SCHEMA, 95 TABLE DATA, 282 FUNCTION, 25 TRIGGER, 57 POLICY,
  298 ACL, 175 CONSTRAINT entries.
- Для всех 96 source tables записаны counts и MD5 отсортированных row hashes
  внутри того же snapshot. Единственная таблица без TABLE DATA entry — пустая
  partitioned `realtime.messages` (0 rows); это не кадровые данные.
- Role attributes/memberships сохранены private. Global role login credentials,
  platform encryption keys, внешние storage bytes и platform configuration
  не являются частью `pg_dump`; подготовить их через approved secure recovery.

### Настоящий full restore

Запущен в **новую** локальную disposable DB, host `127.0.0.1:55439`, cluster
`reports/phase2-postgres-runtime/data`. Script сначала проверяет exact data directory;
remote targets запрещены. Production source — только read-only.

Первая попытка остановилась на отсутствующей роли `supabase_admin`. После создания
локальных NOLOGIN role prerequisites следующая попытка:

```text
restore_exit: 1
ERROR: extension "pg_cron" is not available
Command: CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
```

Последняя DB: `phase3_full_1791726503909`. Использован `--exit-on-error`;
failed clone не считается восстановленным. `pg_cron` не исключался, функции
не заменялись stubs. Docker отсутствует, WSL не установлен, прежний Linux host
offline. Managed Vault dependencies также требуют совместимого clone.
Весь dump ещё **не** восстановлен, миграции на полном restore **не** выполнены,
полные post-restore checksums/roles/RLS/rollback не подтверждены. Поэтому
production migration остаётся заблокированной.

### Отдельная scoped rehearsal — PASS, ограниченный результат

Свежий read-only кадровый export инициализировал отдельную PostgreSQL 18.4 DB.
Actual source columns, FK/constraints, relevant functions, triggers, presence view
и 18 исходных policies восстановлены в scoped fixture; auth/platform context
воссоздан тестовыми функциями, а не полным Supabase platform restore.
Затем применены 4 миграции, запущен identity processor, original columns сравнивались
SHA-256 до/после. Результат **9/9 таблиц без изменений, 18/18 policies сохранены**.

| Исходная таблица | Rows до = после |
|---|---:|
| employees | 65 |
| employee_work_logs | 5 665 |
| employee_payments | 987 |
| employee_payroll_deductions | 242 |
| employee_tax_profiles | 65 |
| payroll_checks | 1 544 |
| zkt_attendance_logs | 10 578 |
| zkt_bridge_commands | 0 |
| profiles | 2 |

Новые periods создаются из сохранившихся snapshots; неизвестные даты восьми
legacy Former остаются неизвестными. Legacy raw identity events: 10 578,
owned: **0**, review: **10 578**. Current employee number не использовался как
доказательство владельца. Это сохраняет данные, но после identity migration
legacy device-less import не обеспечивает прежнее автоматическое payroll processing.
Такое изменение нельзя внедрять до безопасного Bridge/identity cutover.

SACS хранит собственные safety sessions/assignments в другом project. Farmplast
dump не заменяет SACS backup. Требуются отдельный snapshot, все referenced UUIDs,
completed/group assignments, functions/RLS/SSO schema и независимый restore.

## 5. Release gates и выявленные исправления

Конкретная ошибка readiness в Phase 2: применение `employee_lifecycle.sql`
делало lifecycle RPC доступной без отдельного release switch. Исправлено:

1. Уже в migration 3 создаётся `employee_release_config.actions_enabled=false`.
   RPC проверяет gate и держит row SHARE lock до окончания transaction.
   Между migration 3 и 4 действия также выключены.
   Allocation advisory lock берётся перед gate row lock, как в release shutdown;
   отдельный двухсессионный тест проверяет отсутствие lock inversion и блокировку
   ожидающей lifecycle операции после выключения gate.
2. Migration 4 принудительно оставляет actions/reuse OFF, независимо от deployment.
   Admin UI получает blocker и отключает Terminate/Rehire, архив продолжает читаться.
3. Оригинальные RPC сохранены под `_pre_release` с отозванным execute для
   public/anon/authenticated/service_role. Browser/service worker не может включить flags.
4. `employee_release_evidence` принимает ровно восемь именованных условий:
   nj_physical, pa_physical, historical_uuid, live_sacs, backup_restore,
   database_migrations, concurrency, rollback. Нужны current confirmations,
   одинаковый 40-character candidate SHA и private evidence reference.
5. UPDATE `reuse_enabled=true` без подтверждений отклоняется. При истечении
   evidence запрещены также предложение номера и INSERT/смена employee number.
   Flag не включается автоматически и не заменяет individual terminal disable ACK.

Evidence утверждает оператор с DB-owner доступом **после отдельного разрешения**.
Software проверяет наличие/срок/SHA confirmations, но не способен доказать
правдивость физического протокола. Не записывать synthetic PASS в production.
Flags/evidence tables имеют RLS, application roles — только admin-scoped SELECT.
Пустые evidence и OFF — исходное состояние. DB owner остаётся доверенным release actor.

## 6. Миграции и совместимость

Порядок Farmplast после verified backup/restore, drift recheck и разрешённого окна:

1. `supabase/former_employees.sql`.
2. `supabase/zkt_event_identity.sql`.
3. `supabase/employee_lifecycle.sql` — обновлён, actions OFF.
4. `supabase/employee_release_gates.sql` — новый gate.

`supabase/farmplast_sacs_sso.sql` уже соответствует production SSO change;
это existing dependency, а не новая Phase 3 миграция для слепого повторения.
В SACS отдельно staged `supabase/sacs/employee_history.sql` и Edge Function
`supabase/sacs/functions/employee-history`; они ещё не подтверждены live.
Не применять Farmplast SQL в SACS project или наоборот.

Migration files не idempotent; нельзя повторять частично применённый набор без
actual catalog inspection. Каждая содержит собственную transaction; использовать
`ON_ERROR_STOP`, не оборачивать набор в мнимую общую nested transaction.
Не включать старые `_pre_identity` процессоры и не переписывать ownership.

**Archive readiness отдельно:** routing/admin access, Active-only list,
UUID history, search/filter/mobile прошли local tests. Но current app new employee
form использует allocator, а Employment panel требует integration tables.
Следовательно, deployment этой версии с одной migration 1 не является проверенным
archive-only вариантом. Все 4 SQL изменяют attendance processing и new identity
provisioning. Для более раннего independent archive release потребуется отдельный
проверенный compatibility package; его сейчас нет. Stage B этим отчётом не разрешён.

## 7. NJ / PA: точный протокол оператора

Статус каждого пункта ниже **BLOCKED на реальном NJ и BLOCKED на реальном PA**.
Один протокол не заменяет другой. Тестовые записи/номера ещё не согласованы.

### Read-only подготовка на каждом Bridge host

1. Подтвердить actual hostname, завод, все M300Plus serial labels, LAN IP/4370,
   SDK bitness, timezone, service/task schedule. Не угадывать PA host по имени peer.
2. Создать private Owner-only capture directory. Скопировать EXE, DLL/config,
   service definition и task definitions без остановки/перезапуска службы.
   Secrets/config/employee lists не отправлять в Git или общий отчёт.
3. Получить current EXE hash и версии service/SDK read-only:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Program Files (x86)\ZKTBridge\zkt-bridge.exe'
Get-CimInstance Win32_Service -Filter "Name='ZKTBridge'" |
  Select-Object Name,State,StartMode
Get-TimeZone
```

4. Сверить SDK/Bridge config с private capture и physical serial. На терминальной
   LAN выполнить существующий **read-only** inventory script 32-bit PowerShell:

```powershell
& 'C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File `
  '.\client\zkt-bridge\scripts\audit-terminal-identity.ps1' `
  -TerminalIp '<verified-terminal-LAN-IP>' -ExpectedSerial '<physical-serial>' `
  -OutputPath '<private-new-inventory-file>'
```

Script сверяет serial, counts до/после и полный user inventory; не вызывает
disable/delete/enrollment/attendance-clear. Output содержит PII и остаётся private.
Вернуть в отчёт только timestamp, plant, serial reference, counts, SHA, success/error.

### Девять сценариев, отдельные результаты для NJ и PA

| № | Действие / ожидаемое доказательство |
|---|---|
| 1 | Read-only получить существующий рабочий punch без изменения пользователя/записи. Private SDK export hash + raw device serial/UID/time. |
| 2 | На clone привязать punch к подтверждённому UUID/period, сверить independent enrollment/export evidence. Current HR number не является доказательством. |
| 3 | Clone import того же raw дважды: одна raw identity row, один owner, неизменный work-log count/checksum при повторе. |
| 4 | Import старого SDK event вне lookback: прежний UUID/period либо review; не новый владелец прежнего HR number. Проверить timezone/DST. |
| 5 | Safe simulation на clone разорвать связь Bridge с test endpoint, не отключая production терминал. Failed/pending ACK и held reservation, release не происходит. |
| 6 | Только после отдельного разрешения на **согласованного тестового пользователя**: disable обоих реальных терминалов, Refresh, SSR_GetUserInfo.enabled=false. Сверить serial/UID и отсутствие enrolment у нового владельца. |
| 7 | На clone reservation остаётся held до disable ACK каждого зарегистрированного терминала NJ/PA. Offline/failed/missing inventory никогда не освобождает номер. |
| 8 | Только clone с synthetic двумя UUID и доказанными интервалами: бывший HR number у новой записи, прежний terminal principal не переносится; поздний старый raw принадлежит старому UUID. |
| 9 | Clone wrong/missing serial, overlap/missing mapping, ambiguous DST/sequence: unassigned review. Разрешить только по независимому evidence; повторить import и убедиться, что owner immutable. |

Для физических steps 1/6 сохранить actual SDK result/readback, host/EXE hash,
timestamp и операторский signed reference. Пока operator evidence отсутствует,
даже успешные clone/emulator scenarios не делают physical gate PASS.
Не создавать тестовый номер или biometric slot на живом терминале без отдельного
согласования. Не увольнять active employee, не переносить реальный номер, не
использовать delete/clear/reset/bulk sync для испытаний. При сомнении остановить сценарий.

## 8. Live SACS и SSO: что остаётся получить

Read-only GET Farmplast и существующего SACS application alias вернул HTTP 200.
Vercel MCP для SACS project/deployment не вернул проверенные metadata; CLI cached
project list подтверждает доступность project inventory, но не DB credentials или
tenant permission. Старые local SACS reconciliation snapshots не считаются live.

Согласованному администратору нужны read-only проверки на current production:

1. Сверить всех 8 Former по `source_system='farmplast'` + permanent source UUID,
   а не number/name; по одному связанному профилю и верная company scope.
2. Сравнить retained safety sessions, completed assignments, group assignments,
   даты/status и их UUID FK с independently restored SACS backup.
3. Проверить два synthetic профиля с одинаковым historical HR number на clone:
   история не пересекается; terminate/rehire сохраняет тот же source UUID.
4. Проверить SACS/Farmplast admin, ordinary user и unauthenticated role matrix:
   archive/history API admin-only, чужой tenant запрещён, service-only SQL RPC
   не исполняется browser role. Не ослаблять RLS для удобства проверки.
5. SSO source authorization/allowlist/fixed origin сохранены и local tests PASS.
   Live issuance/consumption handoff создаёт служебные auth/audit записи: в рамках
   запрета production writes **не выполнялся**. Нужен отдельный согласованный
   authentication smoke test; текущий production SSO не менялся.
6. Новый live history endpoint и full Terminate/Rehire synchronization пока
   не развернуты/не проверены. Выполнить deployment только по отдельному разрешению,
   не менять реальные Safety Records ради теста.

Все реальные employee rows/results/private identifiers остаются в закрытом evidence.
Public report получает counts, hashes, permissions results и причины отказа.

## 9. Stage A–F: GO / NO-GO

| Stage | Готовность | Условия для следующего разрешённого запуска |
|---|---|---|
| A — Database | NO-GO | Полный Farmplast + SACS restore на compatible 17.6 clone; counts/checksums/FKs/functions/RLS/grants/SSO regression; coordinated Bridge processing cutover и verified rollback. |
| B — Application/archive | NO-GO; local archive PASS | A PASS, compatibility проверена, все 8 Former видны admin; 57 Active; action/reuse OFF; Desktop/Mobile live auth QA. Archive GO не означает reuse GO. |
| C — ZKT Bridge | NO-GO | Current NJ/PA capture, проверенная equivalence/command coverage, read-only inventory и реальные operator сценарии отдельно по каждому терминалу. |
| D — Employee Actions | NO-GO | Согласованные test profiles, physical disable/activate ACK, live SACS sync, historical UUID safety, concurrency и rollback verified; отдельное разрешение actions flag. |
| E — Number Reuse | NO-GO | Все 8 current evidence одного approved deployment SHA + inventory/range и individual deactivation ACK; отдельное разрешение reuse, без auto-enable. |
| F — Post-Deployment | NO-GO / пока не запускался | Выполняется после каждого отдельно разрешённого stage. Сейчас deployment отсутствует; local проверки не являются post-production PASS. |

Stage A следует планировать с остановкой legacy import/rebuild/identity workers и
queues по согласованному maintenance plan. Stage B read-only archive не должен
запускать legacy number processors или lifecycle operations. Перед C нужно
подтвердить все старые supported commands: candidate не доказывает эквивалентность
recovered NJ binary и bulk/delete behavior. Не переключать EXE только по unit tests.

### Команды будущего rollout — сейчас НЕ выполнять

Prerequisites: approved project/target/window, fresh backup/restore PASS,
TLS-secured psql service profile без credentials в команде, workers остановлены,
actual catalog reviewed. `psql`/Vercel CLI на текущей машине не установлены;
подготовить в approved deployment environment и проверить версию/help перед запуском.

```powershell
# Из former-employees; только после отдельного разрешения Stage A.
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
if ($LASTEXITCODE -ne 0) { throw 'Stage A stopped' }
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/zkt_event_identity.sql
if ($LASTEXITCODE -ne 0) { throw 'Stage A stopped' }
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_lifecycle.sql
if ($LASTEXITCODE -ne 0) { throw 'Stage A stopped' }
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_release_gates.sql
if ($LASTEXITCODE -ne 0) { throw 'Stage A stopped' }

# Stage B: secure project/environment linkage, exact approved HEAD; inspect before promotion.
vercel deploy --prod --skip-domain
vercel inspect '<new-staged-deployment-id>'
# После authorised validation и сверки SHA/project/target:
vercel promote '<new-staged-deployment-id>'
```

Staged production deployment использует production environment; не вызывать
write endpoints во время preview проверки. Не копировать .env, service keys или
backup в build package. Подтвердить server-only SACS env отдельно от VITE vars.

Операторское SQL включения Stage D/E — только после approvals, не auto-deploy:

```sql
-- Stage D only, after validated physical/SACS lifecycle protocol.
begin;
select pg_advisory_xact_lock(736261,2);
update public.employee_release_config set actions_enabled=true where singleton;
commit;

-- Stage E: evidence inserted privately by release owner; NO synthetic evidence.
-- Every row uses the same actual approved candidate/deployment SHA.
begin;
select pg_advisory_xact_lock(736261,2);
select public.employee_reuse_release_verified(); -- must be true
update public.employee_number_config set reuse_enabled=true where singleton;
commit;
```

Не добавлять доказательства в Git. Evidence expiry не даёт безопасно продолжить
allocation при оставшемся true flag: runtime guards отклоняют операцию.

## 10. Rollback plan — prepared, НЕ VERIFIED

Сначала остановить affected workers/queues по утверждённой процедуре и выключить
affected features; проверить in-flight jobs/claims, terminal ACK и late SACS response.
Do not blindly replay uncertain SACS `running` operation after rehire.

```sql
-- Только approved incident action, на actual migration level проверить tables.
begin;
select pg_advisory_xact_lock(736261,2);
update public.employee_number_config set reuse_enabled=false where singleton;
update public.employee_release_config set actions_enabled=false where singleton;
commit;
```

Если миграция остановилась до создания gate tables, не исполнять эти UPDATE
вслепую: inspect actual catalog и держать app/workers stopped до release owner review.

Application rollback command после отдельного разрешения:

```powershell
vercel promote 'dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq'
```

Это предыдущий фактический Farmplast production deployment на дату audit;
перед будущим rollout сохранить новый актуальный previous ID/SHA. Откат приложения
**не** удаляет database history. Совместимость old app с new schema необходимо
сначала проверить на полном clone. До проверки держать mutation paths и legacy
workers выключенными; old app не считается безопасным writer автоматически.

После хотя бы одного reuse нельзя возвращать current-number-based processing
или global employee-number UNIQUE: разные исторические UUID уже могут иметь
одинаковые номера. Сохранить periods/reservations/raw/ownership, исправлять вперёд
с UUID-safe binary. Для data recovery сначала isolated restore, затем reviewed
reconciliation с новыми production records/PITR. Старый backup поверх нового
production не восстанавливать. Hardware disable/activate откат требует отдельного
реального readback на каждом terminal; DB rollback не откатывает hardware.

Rehearsal rollback должен проверить app switch + feature shutdown + pending/running
jobs + identity history + новые записи после backup. Он пока не выполнен на полном
compatible restore и физических устройствах, поэтому rollback evidence отсутствует.

## 11. Stage F: контроль после каждого разрешённого этапа

Зафиксировать before/after checks в согласованном readonly snapshot, учитывать
законные concurrent production writes вместо требования произвольных fixed hashes.

```sql
begin isolation level repeatable read read only;
select count(*) total,count(*) filter(where active is true) active,
  count(*) filter(where active is not true) former from public.employees;
select employee_number,count(*) from public.employees where active is true
  group by employee_number having count(*)>1;
select count(*) orphans from public.employee_work_logs w
  left join public.employees e on e.id=w.employee_id where e.id is null;
select count(*) orphans from public.payroll_checks p
  left join public.employees e on e.id=p.employee_id where e.id is null;
-- Только после наличия соответствующих миграций:
select actions_enabled from public.employee_release_config;
select reuse_enabled from public.employee_number_config;
select status,count(*) from public.employee_integration_operations group by status;
select reason,count(*) from public.zkt_identity_review group by reason;
rollback;
```

Также проверить payments/deductions/tax FK, old completed payroll amounts/CSV/PDF,
all 8 archive cards и source UUIDs, work-log duplicates, NJ/PA heartbeat/current EXE,
ambiguous queue additions, SACS history/SSO permissions, app/server/SDK errors,
pending reservation ACK и application rollback availability. Не сохранять rows/PII
в public report. Critical error: остановить следующий stage, выключить affected
features, выполнить утверждённую incident recovery; не переходить к reuse.

## 12. Локальные команды и evidence

Из `C:\Users\Owner\Documents\farmplast\former-employees\client`:

```powershell
npm test
npm run lint
npm run build
node --test tests/sacs-sso.test.mjs tests/employee-release-gates.test.mjs
node scripts/verify-employee-archive.mjs
node scripts/verify-employee-concurrency.mjs
node scripts/verify-employee-snapshot.mjs ../../reports/former-employees-phase3-private --postgres
```

Bridge: из `client/zkt-bridge`: `npm test`.
Concurrency/snapshot scripts отказываются работать с remote DB/другим data directory.
Runtime requires prepared disposable cluster и existing local browser dependencies;
не перенаправлять scripts на production. Synthetic fixture explicitly enables
actions только для local core tests; real migration defaults проверяются отдельно.
После проверки запущенный локальный PostgreSQL остановлен; это не Windows service.
Private data directory имеет Owner-only ACL. Для повторения локальных PG tests:

```powershell
$runtime='C:\Users\Owner\Documents\farmplast\reports\phase2-postgres-runtime'
$bin=Join-Path $runtime 'node_modules\@embedded-postgres\windows-x64\native\bin'
Start-Process -FilePath "$bin\postgres.exe" -WindowStyle Hidden `
  -ArgumentList @('-D',"$runtime\data",'-p','55439','-h','127.0.0.1') `
  -RedirectStandardOutput "$runtime\server.stdout.log" `
  -RedirectStandardError "$runtime\server.stderr.log"
# После завершения tests, только этот disposable cluster:
& "$bin\pg_ctl.exe" -D "$runtime\data" -m fast -w stop
```

Private workstation audit commands из `C:\Users\Owner\Documents\farmplast`:

```powershell
node phase3-catalog.mjs
node phase3-full-backup.mjs
node phase3-restore.mjs
node reports/sacs-sync/phase3-audit-backup.mjs
```

Это local audit helpers вне product Git; используют существующий guarded readonly
connector и private config. Не передавать эти config/dump файлы вместе с репозиторием.
Перед повторным backup создать новый private timestamped каталог, сохранить прежний
dump/hash, снова проверить scope/credentials/TLS. Restore targets только disposable DB.

Логи workstation `reports/phase3-{application-tests,bridge-tests,concurrency,
snapshot,browser,lint,build,final-targeted,release-gates,live-http}.log`.
Private evidence: catalog.private.json, drift.private.json, dump.private.log,
restore.private.log, archive.private.list, summary.json, restore-summary.json,
schema-and-manifest.local.json, postgres-migration-verification.local.json.
Sanitized summary в [former-employees-phase3-evidence.json](former-employees-phase3-evidence.json).

## 13. Изменённые файлы после Phase 2

Production SSO integration:

- client/api/sacs-sso.js
- client/server/sacsSso.mjs
- client/src/components/SacsLink.jsx
- client/src/pages/DashboardPage.jsx
- client/tests/sacs-sso.test.mjs (synthetic account fixture)
- client/vercel.json
- docs/sacs-admin-sso.md (без actual account identifiers в текущем тексте)
- supabase/farmplast_sacs_sso.sql

Phase 3 safety/verification/report:

- supabase/employee_lifecycle.sql
- supabase/employee_release_gates.sql
- client/tests/helpers/employee-identity-db.mjs
- client/tests/employee-release-gates.test.mjs
- client/scripts/verify-employee-concurrency.mjs
- client/scripts/verify-employee-snapshot.mjs
- client/scripts/verify-employee-archive.mjs
- docs/former-employees-phase2.md (ссылка на superseding release procedure)
- docs/former-employees-phase3.md
- docs/former-employees-phase3-evidence.json

`git diff --name-only f45e64e6936f11001fd09b693bdc74f6767f399b HEAD`
даёт окончательный список committed product changes. Private dumps/export rows
и workstation operational helpers перечислены выше отдельно и не коммитились.

## 14. Оставшиеся риски и stop condition

1. Full managed restore/rollback и отдельный SACS backup отсутствуют.
2. Current Bridge binaries/SDK/serials/complete inventories NJ/PA неизвестны.
3. Legacy historical device/UUID provenance не доказан; вся такая очередь сохранена.
4. Live archive permissions/Safety History/Completed Assignments/SSO flow не проверены
   на новом deployment; нельзя превращать HTTP 200 и mocks в production PASS.
5. Production 17.6 grants/roles/platform extensions отличаются от local 18.4 fixture.
6. Staged identity processor требует coordinated cutover; применение миграций без
   verified device mapping нарушит автоматическую обработку новых legacy punches.
7. Новый employee provisioning требует verified NJ/PA inventory и configured common
   range; partial Stage A/B создаёт incompatibility с текущей формой добавления.
8. DB owner confirmations доверенные; gates не заменяют actual physical evidence,
   отдельное разрешение rollout или individual terminal ACK.

**Phase 3 audit и локальная работа завершены. Production Stage A–F: NO-GO до
закрытия перечисленных blockers и отдельного разрешения. Никакие production
изменения, physical actions или enable flags в рамках Phase 3 не выполняются.**
