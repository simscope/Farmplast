# Former Employees — Phase 4: release blockers

Дата проверки: **2026-10-11**. Ветка: `codex/former-employees`.
Base: `8b0e144573415a287f67abece657dab7a8c73a9c`.
Implementation/evidence commit: **`d428603e1a30dd19a134d79e5651c6423b8f5f0a`**.
Commit этого отчёта определяется `git log -1 --format=%H -- docs/former-employees-phase4.md`.

Этот отчёт уточняет [Phase 3](former-employees-phase3.md): полный database restore
теперь выполнен; для базового архива подготовлен отдельный совместимый запуск.
Production deployment, migrations, enable flags и действия на терминалах **не выполнялись**.
Обнаруженное исключение к запрету production changes — автоматическая временная
login-role SACS CLI; оно подробно раскрыто в разделе 8. Нельзя утверждать,
что абсолютно никаких production изменений не было.

## 1. Решения по компонентам

| Компонент | Решение | Обоснование / оставшаяся работа |
|---|---|---|
| Archive Read-Only, базовые карточки | **GO — техническая готовность к отдельно разрешённому запуску** | Полный restore, первая миграция, сохранность истории, admin RLS и Desktop/Mobile проверены. Только `former_employees.sql`; последующие identity/lifecycle/reuse миграции для этого запуска не нужны. |
| Employee Actions: Terminate / Rehire | **NO-GO** | NJ/PA physical ACK не подтверждены, historical identity не доказана, один Former всё ещё active в SACS. Не включать actions. |
| Employee Number Reuse | **NO-GO; OFF** | Нет NJ/PA physical, historical UUID, live SACS и полного hardware rollback подтверждения одного candidate SHA. Нет verified inventories/range и индивидуальных terminal ACK. |

GO архива означает просмотр личных данных, Employment History, существующих
Attendance/Payroll и payroll statement. Это **не** GO нового live Safety History
endpoint, аппаратной синхронизации или кадровых операций. Новый Safety History API
ещё не развёрнут в SACS; UI должен честно показывать недоступность этого блока,
а не нулевую историю при ошибке. Действующий переход в SACS/SSO сохранён.
Выполнение production stages требует отдельного разрешения; сейчас — остановка.

| Проверка | Статус | Фактические доказательства / блокировка |
|---|---|---|
| Production Drift Audit | **PASS** | Production alias всё ещё SHA `4b7573a6d105cbfd61a035e0c31c3f324a4a165b`, deployment `dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq`, READY. Эти SSO изменения уже интегрированы Phase 3. Read-only catalog подтверждает отсутствие staged tables и исходные counts. |
| Full Backup | **PASS — полный logical DB dump** | Исходный неизменённый dump 2 134 065 bytes, SHA-256 ниже; 96 таблиц всех schemas. Внешние storage bytes, login secrets, platform keys не входят в pg_dump. |
| Restore Rehearsal | **PASS — PostgreSQL database** | PG 17.6 Linux, pg_restore exit 0, 96/96 table counts/checksums, 59/59 policies, все 6 расширений точных версий. |
| Database Migrations | **PASS** | Все 4 миграции применены последовательно на полном restore; исходные row multisets сохранены в 96 таблицах. Отдельно проверена первая миграция без остальных. |
| Historical UUID Mapping | **BLOCKED** | 10 578 legacy raw сохранены; 0 доказанных owners; 10 578 review. Нельзя назначать владельцев по нынешнему номеру. |
| NJ Physical ZKT | **BLOCKED — PHYSICAL VALIDATION REQUIRED** | Tailscale peer offline, SSH timeout. Current version, serial, inventory, live duplicate/delayed import и disable read-back неизвестны. |
| PA Physical ZKT | **BLOCKED — PHYSICAL VALIDATION REQUIRED** | Нет подтверждённого PA host/terminal endpoint; доступные peers offline. Не считаем `hp-pen` доказанным PA Bridge. |
| Live SACS | **BLOCKED, read-only subchecks completed** | 65/65 source UUID совпали; номера совпали; 0 duplicate source UUID. Один inactive Farmplast employee active в SACS; sessions/assignments в scoped roster 0. New history endpoint и live handoff не проверены. |
| Terminate/Rehire Validation | **BLOCKED live; local PASS** | Local same-UUID periods/history/ACK/permissions/concurrency tests прошли; реальные операции не выполнялись. |
| Employee Number Reuse | **BLOCKED / OFF** | Guards проверены локально; в полном restore оба flags OFF; никаких production enable. |
| Application Tests | **PASS** | 144/144; после дополнительных capability permission assertions targeted 4/4. |
| Bridge Tests | **PASS — offline** | 19/19. Это не physical PASS и не доказательство installed EXE equivalence. |
| PostgreSQL Tests | **PASS** | Full PG 17.6 restore/migrations/rehearsal + PG 18.4 concurrency 8 checks + scoped 9-table history replay. |
| Build / lint | **PASS** | Build exit 0; lint 0 errors, 6 существующих warnings. Существующее предупреждение `/fonts/micr.ttf`. |
| Desktop / Mobile | **PASS — local browser** | 1440×900 и 390×844, search/filter/profile/history, archive-only schema, write buttons disabled, legacy creation form, pageErrors=[]; SACS history responses mocked. |
| Database rollback rehearsal | **PASS** | Исходные записи, новый сотрудник и новые Attendance/payment записи сохранены; forward schema retained; actions/reuse OFF. |
| Bridge / hardware rollback | **BLOCKED** | Не проверен на NJ/PA. Старый number-based processor возвращать нельзя. |
| Production readiness | **GO Archive / NO-GO Actions / NO-GO Reuse** | Общий rollout всего пакета A–F **NO-GO**. Post-deployment validation ещё не выполнена. |

## 2. Точная причина pg_cron blocker и исправление

Source: managed PostgreSQL **17.6, aarch64**. Phase 3 Windows fixture: PostgreSQL
**18.4**, без `pg_cron` и Supabase Vault. Сначала отсутствовала роль
`supabase_admin`; после prerequisites restore остановился на отсутствии
`pg_cron.control`. Это проблема совместимости среды, не испорченный dump.

Совместимая тестовая среда создана в ephemeral Linux sandbox, amd64, без exposed
ports и production credentials. PostgreSQL **17.6** собран из официального source;
installed contrib: pgcrypto, pg_stat_statements, uuid-ossp. Дополнительно собраны:

| Расширение | Source / restore version | Source tag / SHA |
|---|---|---|
| plpgsql | 1.0 | PostgreSQL 17.6 |
| pg_stat_statements | 1.11 | PostgreSQL 17.6 contrib |
| pgcrypto | 1.3 | PostgreSQL 17.6 contrib |
| uuid-ossp | 1.1 | PostgreSQL 17.6 contrib, `--with-uuid=e2fs` |
| pg_cron | 1.6.4 | upstream v1.6.4, `9490f9cc9803f75105f2f7d89839a998f011f8d8` |
| supabase_vault | 0.3.1 | upstream v0.3.1, `6e0cd916242d922a646e4d611cc215e09dd429f4` |

Upstream pg_cron binary v1.6.4 использует SQL schema label `1.6`, тогда как Supabase
именует идентичную schema `1.6.4`. Применено именно официальное canonical version
mapping из [Supabase pg_cron packaging](https://github.com/supabase/postgres/blob/develop/nix/ext/pg_cron/default.nix):
`1.0→1.0.0`, `1.1→1.1.0`, `1.2→1.2.0`, `1.3→1.3.1`, `1.4→1.4.0`,
`1.4-1→1.4.2`, `1.5→1.5.2`, `1.6→1.6.4`. SQL bytes сохранены; изменяются filenames
и canonical default version. Это не пропуск расширения или подмена его реализации.

Native PG требует superuser для ownership event triggers. Изначально созданные
NOLOGIN bootstrap roles не имели этого флага, поэтому первая Linux попытка
остановилась на `must be superuser to alter owner of event trigger`. На disposable
cluster `supabase_admin` получил SUPERUSER, соответствующий сохранённому source
`rolsuper=true`; после restore флаг выставлен согласно исходному catalog. Все
source roles остались NOLOGIN для изоляции, memberships/inherit/BYPASSRLS и dump
owners/ACL восстановлены. Единственный local bootstrap login — `phase4_admin`.
Неполные попытки пересозданы **до** миграций и любых rehearsal records.

После установки prerequisites исходный dump восстановлен целиком с
`pg_restore --exit-on-error`. Не использовались schema filters, удаление cron
объектов, function stubs, отключение FK/RLS/triggers или `session_replication_role`.
Один существующий NOT VALID constraint source сохранился как один NOT VALID
constraint target; новых ослаблений целостности нет.

## 3. Изоляция cron и зависимости

Согласно [официальной документации pg_cron](https://github.com/citusdata/pg_cron/blob/main/README.md),
до первого старта PostgreSQL выставлено:

```conf
shared_preload_libraries='pg_cron,pg_stat_statements'
cron.database_name='phase4_restore'
cron.launch_active_jobs=off
cron.log_run=off
listen_addresses='127.0.0.1'
port=55440
wal_level=logical
```

Скачивание build dependencies было разрешено только с approved package/source
domains. **До init/restore** network policy переключена на `deny-all`; при stop
API снова подтвердил её. Нет production env, background app/Bridge workers,
открытых ports или automated sandbox persistence. Source cron table содержит 1
active job: её запись восстановлена неизменённой, но scheduler launch OFF, число
и checksums `cron.job_run_details` неизменны. Command text не публикуется: в нём
могут быть private URLs/credentials. Отключение launch — настройка тестовой среды,
а не изменение исходного dump/job или обход integrity checks.

Read-only recursive `pg_depend` audit: **16 extension members, 39 members/dependents**.
Полный список объектов приведён в приложении. Основные зависимости:

- schema `cron`; tables `cron.job`, `cron.job_run_details` и их composite/array types;
- sequences `cron.jobid_seq`, `cron.runid_seq`, defaults и toast storage;
- schedule/unschedule/schedule_in_database/alter_job/cache invalidate functions;
- 3 constraints/indexes, 2 RLS policies, `cron_job_cache_invalidate` trigger;
- default ACLs роли `supabase_admin` для cron functions/relations/sequences;
- text reference вне cron: `extensions.grant_pg_cron_access`.

Проверены structural dependencies и function textual references. Dynamic SQL и
external services невозможно полностью доказать только `pg_depend`; deny-all,
NOLOGIN и scheduler OFF обеспечивали изоляцию независимо от таких ссылок.

## 4. Доказательства full restore и migrations

Оригинал: private Phase 3 `farmplast-full.dump`, snapshot
**2026-10-11T13:47:11.051Z**, size **2 134 065 bytes**, SHA-256:

```text
45570234629a01a3e9f2d92faf3762fc216f05ceb324f2c6f99b743c7ac2fab9
```

Без фильтров восстановлены schemas auth, ch1_private, ch23_ota_private, cron,
public, realtime, storage, vault и остальные dump schemas. TOC: 17 SCHEMA,
95 TABLE DATA, 282 FUNCTION, 25 TRIGGER, 57 POLICY, 298 ACL, 175 CONSTRAINT entries.
96-й relation — пустая partitioned `realtime.messages`, без TABLE DATA entry.
Две cron policies создаёт расширение; поэтому **catalog policies 59**, а TOC 57.

В source read-only audit и full restore до миграций совпали: 178 functions вне
pg_catalog/information_schema, 20 non-internal triggers, 6 event triggers,
66 RLS tables, 1 исходный unvalidated constraint. ТОС counts не следует смешивать
с этими catalog counts. Все extension versions совпали.

Для каждой из 96 таблиц source snapshot count и MD5 отсортированных row hashes
сравнены с полным restore: **96/96 exact match**. Все 59 policy definitions
совпали после нормализации PostgreSQL `_name[]` role array (Node вернул строку,
psql JSON — массив). Ранняя false comparison оказалась форматом сериализации;
политики не менялись ради успешного результата.

| История | Source / full restore до синтетических writes |
|---|---:|
| Employees | 65: 57 Active, 8 Former |
| Work Logs / Attendance | 5 665 |
| Employee Payments | 987 |
| Payroll Deductions | 242 |
| Tax Profiles | 65 |
| Payroll Checks | 1 544 |
| Raw ZKT events | 10 578 |
| Bridge Commands | 0 |

Payroll/Attendance FK orphan counts — 0. После каждой миграции сравнивались
original-column row multisets всех 96 таблиц: additive columns/новые строки
допускаются, исчезновение или изменение любой исходной строки — failure.
Все четыре шага PASS. Employment periods: 65 до synthetic creation, затем 66.
Immutable ownership: 0; review: 10 578, без number-based угадывания владельца.

Полный restore выполнен командой `cmd_3645fc00b2ae45dba6c23f9ccf41`, exit 0.
Full migration/rehearsal `cmd_bb045b6dfa084dfd955fbd57fb6c`, exit 0.
Post-migration Attendance/payment preservation `cmd_187b621bab19499a8e5283b49362`, exit 0.
Machine-readable proof: [former-employees-phase4-evidence.json](former-employees-phase4-evidence.json).
Это database restore, не доказательство запуска всех managed Supabase services,
восстановления внешних storage objects или возможности расшифровать Vault без
отдельно защищённых platform keys. [Supabase recovery prerequisites](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## 5. Исправленная независимость архива

Phase 3 branch без lifecycle/identity migrations запрашивал отсутствующие таблицы
и всегда ожидал server number allocator. Обнаруженная конкретная ошибка исправлена:

1. Первая миграция предоставляет admin-only `employee_archive_capabilities()`.
   Она сообщает наличие schema, **не** выдаёт разрешение на operations/flags.
2. Employment/identity/review panels не запрашивают отсутствующие advanced tables.
   Personal data, Payroll, Attendance, periods доступны с первой миграцией.
3. Active Employees при archive-only schema сохраняет прежний manual number input;
   глобальная UNIQUE constraint удерживает и active, и former номера. Возможность
   создавать нового сотрудника не зависит от ещё не проверенных device inventories.
4. Archived profile не открывает editing или Pay & Print и не сохраняет/удаляет/
   пересчитывает work logs. Handler guards и disabled buttons дополняют друг друга.
   Просмотр старого payroll statement/печать существующего statement остаются read-only.
5. Terminate/Rehire заблокированы default readiness; legacy date reconciliation
   не предлагается до advanced schema. Reuse отсутствует в archive-only stage.

На настоящем restored PG 17.6 admin claims прочитали 57 Active/8 Former и
capabilities `{lifecycle:false,identity:false}`; non-admin claims получили 0 Former.
Local permission fixture отдельно отклоняет capability RPC у manager.
Global reserved number constraint и исходные legacy ZKT processors не заменяются
при первом этапе. Не применять все четыре migrations для одного read-only архива.

## 6. Rollback rehearsal: что действительно проверено

Последовательность в восстановленной изолированной DB:

1. Зафиксированы исходные 96 row multisets/catalog/policies/extension versions.
2. Применён только `former_employees.sql`; проверены admin/non-admin visibility,
   capabilities, 65 employment periods и сохранность всех оригинальных данных.
3. Добавлен **синтетический** employee #9999 с новым UUID. Это только clone.
4. Смоделирован неуспешный application release: выбран rollback приложения с
   сохранением additive schema, проверена сохранность нового профиля/period.
5. Применены ещё 3 migration; defaults actions=false, reuse=false проверены.
6. После всех migration добавлены законные synthetic Attendance и payment 160.
   При shutdown actions/reuse OFF эти records и новый employee/period сохранились.
7. Полная проверка 96 relations и cron history выполнена после всех migration и
   rollback с новым employee. Attendance/payment follow-up затем отдельно проверил
   сохранность своих новых UUID/amount после shutdown; полный 96-table comparison
   после этого дополнительного follow-up повторно не запускался. Обновлённый
   reproduction script включает эти inserts до финального полного сравнения.
   Final clone employees: 66/58/8.

Rollback здесь **forward schema + application rollback + closed gates**, без
DROP staged tables/columns, inverse migration, возвращения number-based identity
или восстановления старого backup поверх новых records. Rehearsal scripts отказываются
повторно стирать migrated DB. App build/browser и старые source-column reads
совместимы с additive archive schema. Hosting `vercel rollback` не выполнялся:
production deployment не было. Это не live hosting или physical rollback PASS.

На PG 18.4 дополнительный двух-session suite проверил 8 checks: default OFF,
concurrent allocations, terminate vs work-log write, restore/status race protection,
allocator/reservation synchronization и release shutdown lock ordering. Старый
Bridge нельзя включать после identity cutover: raw события сохранятся, но
неподтверждённые owners должны попасть в review, а не автоматически в новый payroll.
Rollback Bridge требует проверенного совместимого identity-aware бинарника;
его физическая проверка остаётся BLOCKED. Следовательно общий reuse `rollback`
gate ещё **не** заслуживает production PASS только на основании SQL rehearsal.

## 7. NJ и PA: факт и короткие инструкции оператору

Remote read-only выполнено: Tailscale state, pinned `ssh -o ConnectTimeout=8
farmplast-zkt hostname`, production raw/queue catalog. NJ peer `NJ-5591-TL` offline,
SSH timeout. Другие доступные peers `Farmplast-server`, `hp-pen` offline;
PA identity/endpoint не установлен. Production latest raw timestamp
**2026-10-09T23:09:13Z**; 10 578 raw, command queue 0. Это не heartbeat/health PASS.
New UUID ownership/review tables ещё отсутствуют в production; их отсутствие
нельзя интерпретировать как отсутствие ambiguities. Current installed EXE/SDK,
sync state, terminal employee count и duplicate import errors не прочитаны.
NJ September capture и candidate `2.0.0-candidate.1` — не current version evidence.

### NJ — BLOCKED — PHYSICAL VALIDATION REQUIRED

1. На NJ host подтвердить serial всех терминалов и actual Bridge/service path.
   Read-only получить EXE SHA-256, service State/StartMode, SDK version/bitness и
   timezone. Не перезапускать службу; private config не присылать в общий отчёт.
2. Выполнить ниже existing inventory script с NJ LAN IP и physical serial.
   Ожидается ok=true, complete enumeration=count before=count after; enabled flags
   и terminal principals сравниваются с независимыми enrollment/UUID доказательствами.
3. Сохранить private export существующего punch работающего сотрудника; не
   создавать/удалять HR profile. На clone импортировать raw дважды и historical raw:
   одна identity row/owner, повтор не добавляет Attendance, старое событие остаётся
   старому UUID/period либо review. Сохранить hashes/timestamps результатов.
4. На clone имитировать unavailable endpoint/ambiguous serial/overlap: reservation
   held, retry pending/failed, review без current-number fallback. Разрешение review
   — только по independent enrollment evidence, owner после решения immutable.
5. Disable/rehire read-back на обоих терминалах — **отдельное разрешение и заранее
   согласованный test-only user/spare terminal**. Сейчас не запускать. Не удалять
   пользователей, не менять real numbers, не останавливать Attendance.
   Ожидается serial+principal+enabled=false ACK от каждого обязательного device;
   без любого ACK release запрещён. Если firmware требует остановки приёма,
   тестировать на отдельном устройстве, иначе оставить BLOCKED.

### PA — BLOCKED — PHYSICAL VALIDATION REQUIRED

1. Сначала подтвердить PA hostname, сеть, service/EXE и все physical serials;
   `hp-pen` не использовать как PA без подтверждения. Получить current hashes,
   версии, timezone и полный read-only inventory отдельно от NJ.
2. Выполнить тот же inventory script с **PA** IP/serial и отдельным output file.
   Сверить PA user/log counts и principals; NJ inventory не заменяет PA inventory.
3. Экспорт существующего PA punch → clone UUID/period mapping; повторный и delayed
   imports с PA timezone: stable owner и unchanged Attendance при повторе.
4. Clone offline/ambiguous tests: held reservation, no auto-release, review resolution
   с доказательствами; late raw не попадает сотруднику с прежним HR number.
5. Только отдельный approved test-only protocol для PA disable/activate read-back.
   После PA ACK номер по-прежнему held, если обязательный NJ ACK отсутствует.
   Без фактического результата оставить physical BLOCKED.

Read-only команды на каждом подтверждённом host:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Program Files (x86)\ZKTBridge\zkt-bridge.exe'
Get-CimInstance Win32_Service -Filter "Name='ZKTBridge'" | Select-Object Name,State,StartMode
Get-TimeZone
& 'C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -File `
  '.\client\zkt-bridge\scripts\audit-terminal-identity.ps1' `
  -TerminalIp '<CONFIRMED-PLANT-IP>' -ExpectedSerial '<PHYSICAL-SERIAL>' `
  -OutputPath '<NEW-PRIVATE-PLANT-INVENTORY.json>'
```

Этот script не вызывает `EnableDevice(false)`, disable/delete/enrollment/clear.
Не заменять его общим candidate `zkt.ps1`: тот временно вызывает
`EnableDevice(false)` даже в обычных SDK командах и может прервать Attendance.
Ничего такого в этой задаче не запускалось. Оператор возвращает plant/timestamp,
version/hash, serial reference, counts, success/error и private evidence reference.
Names/passwords/biometrics/raw employee exports остаются private.

## 8. Live SACS и инцидент CLI

Production SACS alias `sacs-andrei-simanenkas-projects.vercel.app`: READY,
deployment `dpl_EAwTB3hi5RPNNdhLT83aH73y3sCj`, SHA
`49088c21cb9498435c42c1a8453f74bb76728469`, `codex/farmplast-admin-sso`.

Read-only catalog и затем отдельный
[Management API read-only query](https://supabase.com/docs/reference/api/v1-read-only-query)
`POST /v1/projects/{ref}/database/query/read-only` с `transaction_read_only=on`:

- 65 Farmplast-linked SACS rows; 65/65 exact source UUID match, number mismatches 0;
- source UUID duplicates 0, historical-number groups с разными source UUID сейчас 0;
- Farmplast Former 8, SACS inactive 7: **1 status mismatch**. Identity совпала,
  но inactive roster acknowledgement нельзя считать подтверждённым;
- sync config enabled=true; один active company_admin в configured company;
- scoped daily_sessions 0, completed 0; one-time assignments 0, completed 0,
  orphan/broken completion 0. Это отсутствие доступных live samples, не PASS
  сохранения существующих completions;
- действующие `protect_farmplast_identity`, `sync_farmplast_employee`,
  `issue_farmplast_sso`, `consume_farmplast_sso` и RLS присутствуют;
  `get_farmplast_employee_history` отсутствует — staged history ещё не live;
- existing SSO fixed-origin/allowlist/caller-scoped authorization интегрированы;
  local SSO tests PASS. Live issue/consume создают auth/audit records, поэтому
  handoff и live authenticated cross-tenant role matrix сейчас не выполнялись.

**Отклонение от запрета production changes:** первоначальный
`supabase db query --linked --project-ref <SACS> --file <read-only-catalog.sql>`
перед SQL автоматически выполнил initialization временной login-role.
По [официальному CLI source](https://github.com/supabase/cli/blob/develop/apps/cli-go/internal/utils/flags/db_url.go)
этот путь вызывает CreateLoginRole, даже если сам SQL — READ ONLY. Следовательно
создание/обновление временных login credentials было production auth metadata
mutation. Ранее существовала ли эта role, не зафиксировано; не утверждаем,
что создана именно новая role. SELECT transaction была readonly; employee,
Safety Records, assignments и SSO handoff этим SQL не изменялись.

CLI путь немедленно прекращён, инцидент сообщён пользователю. Последующий прямой
read-only endpoint показал `cli_login_postgres`: exists=true, can_login=true,
`valid_until=2026-10-11 14:21:45.488091+00`, уже истёк на момент последующей проверки.
Никаких role deletes/password revokes/production cleanup без разрешения не было.
Оператору: проверить audit log и срок credentials; если требуется cleanup,
получить отдельное разрешение на точную role operation. Больше не использовать
linked CLI для readonly production audit. Credentials брались только из scoped
existing secure store в память; не экспортировались в Git, sandbox или отчёт.

Для закрытия SACS blocker оператор должен privately определить mismatched UUID,
проверить reconciliation/inactive ACK, восстановить SACS отдельно с retained
history и проверить роли/history endpoint. Исправление реальной roster state
потребует разрешения; не создавать реальные training completions ради теста.
Synthetic same-number / terminate-rehire history tests на clone уже PASS, но
не заменяют live SACS evidence и отдельный SACS recovery rehearsal.

## 9. Точная последовательность будущего production rollout

**Только после отдельного разрешения. Ни одна команда ниже сейчас не выполнена.**
`service=farmplast-approved-production` — заранее настроенная secure psql service,
не буквальный существующий credential. Перед запуском operator сверяет pinned
project/ref/database, candidate SHA, baseline counts, current deployment, target
team и секреты вне command line. Не использовать blanket `supabase db push`.

| Stage | Готовность | Порядок |
|---|---|---|
| A1 — Archive database | **GO candidate** | Свежий timestamped полный backup → full restore verification → только первая миграция → counts/FK/admin RLS и flags closed. Старые ZKT processors остаются. |
| B1 — Archive application | **GO candidate** | Production-target staged build без domain assignment → Desktop/Mobile/admin/non-admin и 57/8 smoke → promote; никаких advanced migrations/enables. |
| A2 — Identity/lifecycle DB | **NO-GO** | Только после inventory, UUID provenance, current Bridge verification, согласованного coordinated cutover без потери Attendance. Затем migrations 2–4 и проверка OFF. |
| C — Bridge NJ/PA | **NO-GO** | Отдельная проверка обоих installed versions/SDK/devices/physical import/ACK и forward-compatible rollback; candidate unit tests недостаточно. |
| D — Employee Actions | **NO-GO** | Live SACS reconciliation/ACK, согласованные test-only Terminate/Rehire, preserved UUID/periods/history и physical device ACK → отдельное разрешение actions. |
| E — Number Reuse | **NO-GO / OFF** | Восемь current evidence одного approved SHA, ranges/inventories и per-owner all-device ACK → отдельное разрешение. Никакого auto-enable после deploy. |
| F — Post-deployment | **PENDING; execute after each authorized stage** | Counts/duplicates/FK/history, device queues/heartbeat/import, SACS/SSO, server errors и rollback viability. Сейчас production результатов нет. |

A1 SQL, после сверки нового backup и fresh drift:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
```

Проверки A1/B1: 65 employees/57 active/8 former, 65 periods, unchanged payroll/raw
counts/checksums по snapshot, 0 original FK orphans, admin sees all 8, ordinary/anon
не видят archive, capabilities false/false, 4 readiness booleans OFF. New employee
form manual number + global uniqueness; existing numbers неизменны. Иначе остановиться.

B1 команды из `client`, после проверки `.vercel/project.json` и production env:

```powershell
vercel deploy --prod --skip-domain
# Записать returned URL/ID и commit, выполнить read-only smoke на staged production build.
vercel promote '<VERIFIED-STAGED-PRODUCTION-DEPLOYMENT>'
```

Это [staged production promotion](https://vercel.com/docs/deployments/promoting-a-deployment),
а не promotion preview с иным environment/rebuild. Deployment package не включает
private dumps/config/PII; существующие SSO secrets/server URLs не менять. SACS History
не считать live пока соответствующий endpoint не разрешён/развёрнут/проверен отдельно.
Если требуются authenticated SSO handoff smoke writes, заранее согласовать их отдельно.

A2 — **заблокировано**, только будущие approved команды в таком порядке:

```powershell
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/zkt_event_identity.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_lifecycle.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_release_gates.sql
```

До A2 требуется coordinated identity-aware cutover. Нельзя просто применить SQL,
оставив number-only processor/Bridge и затем ожидать прежнюю автоматическую
обработку Attendance. При физической невозможности cutover — оставить A2/C NO-GO,
независимый A1/B1 архив продолжает работать.

D/E включать только operator-approved owner procedure; этот отчёт **не** выдаёт
enable SQL или фиктивные PASS records. Eight gates: `nj_physical`, `pa_physical`,
`historical_uuid`, `live_sacs`, `backup_restore`, `database_migrations`, `concurrency`,
`rollback`. Все current, unexpired, один 40-character candidate_commit; release
evidence не подменяет индивидуальные inventory/principal/disable ACK. Недоступный
терминал/неподтверждённая деактивация всегда держат reservation. Минимальный безопасный
номер предлагает server allocator; номера active не меняются.

## 10. Rollback команды и stop conditions

Если archive-only release ошибочен: остановить следующий stage, вернуть verified
предыдущий application deployment, оставить additive migration и все новые records:

```powershell
vercel rollback dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq
```

Перед реальным запуском перепроверить, что ID всё ещё правильный rollback target;
если production drift изменился — выбрать его актуальный предыдущий deployment.
Vercel rollback отключает automatic domain assignment последующих deploys до
следующего разрешённого promote. Не запускать destructive down migration.

Если ошибка после A2/D: сначала закрыть DB gates в approved secure owner session:

```sql
begin;
update public.employee_release_config set actions_enabled=false where singleton;
update public.employee_number_config set reuse_enabled=false where singleton;
commit;
```

В A1 этих tables нет; default readiness уже OFF, этот SQL там не выполнять.
Выбирать compatible app/Bridge version, сохранить raw imports/queues и immutable
owners; любые аппаратные compensating operations отдельно согласуются. Не
переносить старые events текущему владельцу номера и не возвращать legacy processor.

После каждого шага выполнить source/snapshot-relative count/hash/FK проверку с
учётом законных новых записей, payroll totals и UUID references; admin/non-admin
archive; NJ/PA sync/queues; SACS state/SSO/errors. При critical failure остановить
следующий stage, выключить затронутый feature, сохранить forensic evidence и
выполнить проверенный forward recovery. Старый backup **не** накатывать вслепую
поверх новой production истории. Live Bridge/terminal rollback пока BLOCKED.

## 11. Повторение локальных проверок и recovery build

Из `client`:

```powershell
npm test
npm run lint
npm run build
node scripts/verify-employee-archive.mjs
node scripts/verify-employee-concurrency.mjs
node scripts/verify-employee-snapshot.mjs ../../reports/former-employees-phase3-private --postgres
```

Из `client/zkt-bridge`: `npm test`. Concurrency/snapshot требуют только guarded
disposable `127.0.0.1:55439`, local runtime из Phase 3. После tests PostgreSQL
остановлен. Browser verification синтетическое, без production запросов.
Raw logs в workstation `reports/phase4-{application-tests,bridge-tests,concurrency,
snapshot,browser,archive-permissions,build,lint}.log`, private captures в Owner-only
`reports/former-employees-phase4-private`. Исходный dump остаётся в Phase 3 private
directory. Ничего из private captures не добавлено в product Git.

Full Linux prerequisites для повторения в **новом** isolated sandbox, не production:
Ubuntu build-essential/bison/flex/libreadline-dev/zlib1g-dev/libssl-dev/uuid-dev/python3/git,
official PostgreSQL 17.6 tarball, pg_cron v1.6.4, Vault v0.3.1. Source tags/SHA выше.
Build prefix `/vercel/phase4/pg`:

```sh
./configure --prefix=/vercel/phase4/pg --without-icu --with-openssl --with-uuid=e2fs
make -j2 && make install
make -C contrib/pgcrypto install
make -C contrib/pg_stat_statements install
make -C contrib/uuid-ossp install
# В каждом matching extension source directory:
make PG_CONFIG=/vercel/phase4/pg/bin/pg_config
make PG_CONFIG=/vercel/phase4/pg/bin/pg_config install
```

Подготовить Owner-only `/vercel/phase4/private`, immutable original dump,
`source-catalog.json` и четыре tested SQL filenames. После установки dependencies
установить deny-all, без ports/credentials/background services. Non-root Linux user
должен владеть prefix/data/private. Затем:

```sh
python3 client/scripts/phase4-linux-setup.py
python3 client/scripts/phase4-full-restore.py
python3 client/scripts/phase4-restore-rehearsal.py
```

Setup требует новый data directory. Restore сверяет exact dump SHA, data directory
и scheduler OFF; мигрированную DB с позднейшими records стирать отказывается.
Каждый integrity mismatch — nonzero failure; продолжение rollout запрещено.
Последние guard/assertion additions проверены Python AST; full restore и SQL path
выше фактически исполнены. Sandbox `sbx_NUXAymKDaNp8dbWTjV72YYbk3V6Z` остановлен
2026-10-11T14:39:28Z, persistent=false, final policy deny-all. Public proof извлечён
до stop; private source dump не изменялся и не размещался в Git.

## 12. Изменённые файлы и оставшиеся действия

`git diff --name-only 8b0e144573415a287f67abece657dab7a8c73a9c HEAD`:

- `supabase/former_employees.sql` — archive capabilities; другие три migration не переписаны;
- `client/src/pages/EmployeesPage.jsx`, `EmployeeDetailsPage.jsx`, `ZktReviewPage.jsx`;
- `client/src/components/EmployeeEmploymentPanel.jsx`, `EmployeeZktHistory.jsx`;
- `client/tests/former-employees.test.mjs`, `client/scripts/verify-employee-archive.mjs`;
- `client/scripts/phase4-linux-setup.py`, `phase4-full-restore.py`, `phase4-restore-rehearsal.py`;
- `docs/former-employees-phase4-evidence.json`, `docs/former-employees-phase4.md`.

Операторские действия, без которых общий пакет остаётся NO-GO:

1. NJ/PA восстановить read-only connectivity, подтвердить current versions/serials,
   inventories/ranges, hardware import/dedup/delayed events и per-device ACK на
   отдельно согласованном test-only protocol. Не удалять users и не менять real numbers.
2. Доказать historical temporal UUID provenance или удерживать raw в review.
3. Разобрать privately SACS status mismatch, выполнить approved reconciliation,
   отдельный SACS backup/restore и live history/permissions/SSO проверки. Не создавать
   training completions для реальных сотрудников.
4. Подтвердить physical Bridge rollback и совместимый identity-aware cutover;
   текущий general SDK path нельзя считать безопасным read-only без учёта device pause.
5. Проверить временную CLI role/audit; любое cleanup — отдельное разрешение.
6. Для разрешённого A1/B1 заново снять fresh backup/drift и получить разрешение
   production release. GO не переносится на изменившийся candidate или production.

Непроверенные вещи оставлены BLOCKED. До внешних результатов не включать actions/reuse
и не выдавать synthetic/mock evidence за physical/live PASS.

## Приложение: полный structural pg_cron dependency inventory

Read-only recursive catalog inventory, включая сами extension members:

```text
constraint job_pkey on table cron.job
constraint job_run_details_pkey on table cron.job_run_details
constraint jobname_username_uniq on table cron.job
default privileges on new functions belonging to role supabase_admin in schema cron
default privileges on new relations belonging to role supabase_admin in schema cron
default privileges on new sequences belonging to role supabase_admin in schema cron
default value for column active of table cron.job
default value for column database of table cron.job
default value for column jobid of table cron.job
default value for column nodename of table cron.job
default value for column nodeport of table cron.job
default value for column runid of table cron.job_run_details
default value for column username of table cron.job
function cron.alter_job(bigint,text,text,text,text,boolean)
function cron.job_cache_invalidate()
function cron.schedule_in_database(text,text,text,text,text,boolean)
function cron.schedule(text,text,text)
function cron.schedule(text,text)
function cron.unschedule(bigint)
function cron.unschedule(text)
index cron.job_pkey
index cron.job_run_details_pkey
index cron.jobname_username_uniq
index pg_toast.pg_toast_49808_index
index pg_toast.pg_toast_49827_index
policy cron_job_policy on table cron.job
policy cron_job_run_details_policy on table cron.job_run_details
schema cron
sequence cron.jobid_seq
sequence cron.runid_seq
table cron.job
table cron.job_run_details
toast table pg_toast.pg_toast_49808
toast table pg_toast.pg_toast_49827
trigger cron_job_cache_invalidate on table cron.job
type cron.job
type cron.job_run_details
type cron.job_run_details[]
type cron.job[]
```
