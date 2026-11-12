# Former Employees — Phase 2: implementation, verification and release procedure

Phase 3 supersedes this release procedure: [former-employees-phase3.md](former-employees-phase3.md).
Terminate/Rehire now default OFF, including between migrations; reuse additionally
requires eight current confirmations. Do not use the Phase 2 enable command alone.

Дата: 11 октября 2026. Ветка: `codex/former-employees`, продолжение
`f586e52ee6ae75393d736b223c4b76c04ee1a776`.

**Production deployment не выполнялся. Миграции, терминалы, live SACS и
production reuse не изменены.** Код и локальная регрессия готовы для проверки;
производственный выпуск требует перечисленных ниже внешних проверок и согласования.
Phase 1 audit сохранён в [former-employees.md](former-employees.md).

## 1. Причина опасной привязки

Старые события содержат числовой `employee_number`, время и raw JSON, но не
device/plant или UUID человека. Старые process/rebuild функции и presence view
соединяют события с **текущим** владельцем этого номера. Bridge дедуплицирует по
`employee_number,punch_time`, поэтому одинаковые события разных заводов также
могли столкнуться. Старый import фильтрует события по lookback и использует
timezone компьютера. Такой контракт несовместим с повторной выдачей номера.

Сохранённый NJ Bridge — binary recovery capture с недостающим оригинальным
исходным кодом. Изменения здесь относятся к editable candidate v2, **не** к
установленному EXE. Текущий PA binary/source и эквивалентность v2 не подтверждены.
Смотрите `client/zkt-bridge/docs/RECOVERY.md` и `SOURCE-RECONSTRUCTION.md`.

## 2. Постоянная идентификация

- `employees.id` остаётся неизменным UUID; финансовые FK остаются прежними.
- `zkt_identity_devices` различает все терминалы по device key, serial и plant.
- `zkt_identifier_history` хранит device + terminal UID + Employee UUID + период
  трудоустройства и полуоткрытый UTC интервал `[valid_from,valid_to)`.
  Перекрытие интервалов и изменение владельца запрещены.
- `zkt_identity_events` — добавляемый raw журнал. `zkt_event_ownership` навсегда
  фиксирует UUID и mapping; исходные `zkt_attendance_logs` не изменяются.
- Владельца выбирает только единственный подтверждённый historical interval.
  Неизвестный device, отсутствие интервала, DST ambiguity, неправильное время
  или unsupported punch sequence попадают в `zkt_identity_review`.
- `/employees/zkt-review` показывает очередь администратору. Исторический
  владелец подтверждается отдельными RPC и независимыми доказательствами;
  employee number или уже сгенерированная строка Payroll не являются доказательством.
- Legacy device evidence хранится отдельно, append-only. Подтверждение не
  исправляет raw и не меняет уже назначенного владельца. Clock/timezone
  ambiguity требует отдельной сверки исходного экспорта.
- Импорт candidate v2 принимает все возвращённые SDK события без host lookback.
  Повторный device/raw import идемпотентен. Время интерпретируется в
  `America/New_York`; spring gap и повторяющийся fall час не угадываются.

Все пять старых process/rebuild entry points заменены безопасными wrappers;
прежние определения сохранены с суффиксом `_pre_identity` без EXECUTE для
public/anon/authenticated/service_role. Presence view также соединяет по UUID
и текущему периоду, с `security_invoker=true` и сохранённым порядком колонок.

Processor не удаляет work logs. Approved/manual/deleted/legacy days и дни,
покрытые сохранённым неаннулированным чеком, не переписываются. Новый provenance
позволяет закрыть поздним OUT только новый автоматический день. Existing manual
edit trigger сохранён по смыслу: SDK processor не превращает свой OUT в ручное
редактирование. Неоднозначные последовательности, ночной интервал >13 часов,
неподтверждённый или изменившийся shift/rate/lunch context требуют payroll review.

**Historical ownership alone не разрешает автоматический перерасчёт.** RPC
`record_verified_zkt_mapping` оставляет `processing_verified=false`. Только
подтверждённая активация нового периода устанавливает true. Для исторических
пропусков нужен отдельный payroll review; сохранённые исторические суммы не
восстанавливаются из текущей ставки. При изменении shift/rate/lunch в текущем
профиле processor также останавливает перерасчёт до сверки контекста.

## 3. Employee Number и terminal UID

HR Employee Number и terminal UID теперь разные идентификаторы. Номер может
вернуться в свободный пул; терминальный principal другого человека — никогда.
Это защищает от сохранённых на устройстве fingerprint/card/password данных.

`employee_number_reservations` хранит старый номер на каждый employment period.
Уникальный held-number index и active-number index, вместе с транзакционным
advisory lock, защищают создание/rehire. База предлагает и атомарно резервирует
минимальный безопасный номер; UI отправляет null, а не доверяет устаревшей подсказке.

Номер освобождается только после serial/user/state read-back подтверждения
disable на **каждом зарегистрированном устройстве**, с подтверждённым inventory,
и при наличии NJ и PA. Inactive сам по себе номер не освобождает. Timeout,
неверный serial, отсутствие PA или неподтверждённый inventory сохраняют reservation.
SACS acknowledgement учитывается отдельно и не заменяет hardware proof.

`employee_number_config.reuse_enabled=false` по умолчанию. Даже released number
при этом не выдаётся заново. Maximum первоначально NULL: неизвестный диапазон
не придумывается, создание/rehire блокируются до его подтверждения.

Новый terminal UID выделяется из никогда не использованных principals,
historical mappings **и всех аккаунтов из terminal inventories**, включая
неизвестных Farmplast локальных пользователей. До verified complete NJ/PA
inventories новое provisioning блокируется. Rehire сохраняет principal того
же человека. Биометрические данные не удаляются и не переносятся между людьми.

## 4. Terminate / Rehire

Terminate запрашивает дату, optional reason/notes и проверяет open shifts,
unapproved/post-termination work logs и незавершённые payroll checks. Профиль
становится inactive, закрывается существующий employment period, создаются
durable disable operations для всех NJ/PA устройств и inactive delivery в SACS.
Архивирование проходит независимо от доступности терминала; reservation остаётся.

Work Log и Payroll write guards берут shared lock строки employee; lifecycle
берёт update lock этой же строки до проверки. Конкурирующая запись либо
завершается до проверки и блокирует увольнение, либо ждёт увольнения и не может
создать новый open shift/draft check после archive. Исторические закрытые строки
сохраняются; новые work dates должны иметь подтверждённый employment period.

Rehire сохраняет UUID, создаёт новый period и атомарно выделяет HR номер.
Для восьми legacy former profiles дата не выдумывается: предусмотрен
`reconcile_legacy_termination(date,evidence)` перед rehire. Старые SACS pending
операции supersede; running SACS запрещает rehire. Device activation нового
периода ждёт disable acknowledgement прежнего периода на этом устройстве.

Operation ledger хранит target, period, action, immutable request snapshot,
claim token, attempts, result/error и status. Service-only claim/finish RPC
проверяют реальные acknowledgements. Retry не сбрасывает uncertain running jobs
и не превращает timeout в успех. Candidate Bridge остаётся единственным worker
для конкретного terminal; параллельный legacy worker запускать нельзя.

Service role не имеет прямого UPDATE для release/mapping/principal таблиц.
Permanent terminal principals дополнительно защищены immutable trigger.

SACS worker обрабатывает одну операцию за authenticated admin POST с лимитом
функции 60 секунд. Если ответ upstream отсутствует/невалиден, claim остаётся
running/uncertain: HTTP timeout может завершиться позднее на SACS. После сверки
upstream и завершения/отмены запроса оператор разрешает его service-only finish
с подтверждённым результатом; **слепой replay/reset running запрещён**.

## 5. SACS History

Новый `/api/employee-safety-history` проверяет JWT, admin role и employee UUID.
Секрет остаётся server-side. SACS endpoint проверяет shared secret и использует
fixed `farmplast_sync_config.company_id`, не caller-selected company.

`supabase/sacs/employee_history.sql` читает archived SACS employee по
`source_system='farmplast'` + `source_employee_id=Farmplast UUID`: daily safety
sessions, training title/status/score/completion date, one-time assignment
history и **текущие** group assignments. Не существующая в SACS история изменения
group assignments не фабрикуется. Records/assignments имеют pagination.

SQL и Edge function подготовлены по сохранённой SACS schema/контрактам; новая
live SACS migration/function **не установлена и не проверена**. UI честно сообщает
о недоступном/ненастроенном соединении. Synthetic success не доказывает live delivery.

## 6. Проверка исторических данных и backup

Read-only repeatable-read Farmplast audit: `2026-10-11T04:16:28.017Z`.

| Таблица | Записей |
|---|---:|
| employees | 65: 57 active / 8 former |
| employee_work_logs | 5 665 |
| employee_payments | 987 |
| employee_payroll_deductions | 242 |
| employee_tax_profiles | 65 |
| payroll_checks | 1 544 |
| zkt_attendance_logs | 10 578 |
| zkt_bridge_commands | 0 |
| profiles | 2 |

Private scoped exports и schema/function/constraint/trigger/policy/view metadata
находятся **вне Git**:
`C:\Users\Owner\Documents\farmplast\reports\former-employees-phase2-private\`.
`schema-and-manifest.local.json` содержит counts и SHA-256 исходных exports.
Никакие names, wages, tax data, raw punches или credentials не включены в commit.

`client/scripts/verify-employee-snapshot.mjs` воспроизводит эти 9 таблиц с live
constraints, functions, triggers и 18 existing RLS policies в **offline PGlite**,
применяет три Farmplast SQL-файла и вызывает processor. Та же проверка затем
выполнена на настоящем **PostgreSQL 18.4**, в отдельной локальной базе на loopback.
Исходные колонки всех
таблиц до/после имеют одинаковые counts и SHA-256. Все 18 policy definitions
совпадают. Все 10 578 raw events сохранены и quarantined; 0 назначено без evidence.
Отчёт: `offline-migration-verification.local.json` в private directory.
PostgreSQL report: `postgres-migration-verification.local.json` там же.

Это scoped logical backup и локальная проверка, **не полный disaster recovery
backup**: auth/storage/другие application tables, роли, ACL и binary SDK не
входят. Перед production approval нужен свежий полный Supabase backup/PITR
или pg_dump с restore rehearsal в отдельной базе, плюс отдельный backup SACS и
обоих Bridge runtime/config/state inventories. Учётные данные хранить приватно.

## 7. Локальная регрессия

| Проверка | Результат |
|---|---|
| Full client suite | 137/137, 0 failed/skipped |
| Bridge suite | 19/19, mocked NJ/PA SDK/network |
| Former/identity/SACS lifecycle | offline fixtures, включая поздний OUT, номер reuse, retained unknown UID и uncertain SACS |
| Production-snapshot replay | 9 tables unchanged, 18 original RLS definitions unchanged |
| ESLint | 0 errors, 6 existing hook warnings |
| Vite production build | passed; existing `/fonts/micr.ttf` unresolved-at-build warning |
| Desktop / Mobile | 1440×900 / 390×844, synthetic local Chrome |
| UI scenarios | archive count/search/filter, UUID history, offline held-number status, rehire suggestion, SACS records, review queue, active-only list, no viewport overflow/page errors |
| PowerShell syntax | parsed locally; no COM/hardware execution |
| True simultaneous PostgreSQL sessions | 6/6 на disposable PostgreSQL 18.4: create/create, create/rehire, shift/termination в обоих порядках, draft payroll/termination, SACS claim/rehire |
| Live payroll PDF/CSV, roles, SACS and terminals | **not verified** |

Все три прежних SSR failure (`pa-climate`, `pa-machine-power`,
`programming-presentation`) проходят без удаления assertions. Причина —
CommonJS React loading в Vite SSR module runner через shared Windows junction.
React/React DOM/lucide вынесены в SSR externals, symlink identity сохраняется,
dependencies в этом worktree изолированы. Full tests используют concurrency=1:
неограниченный одновременный запуск исчерпывал Windows memory.

Из checkout:

```powershell
Set-Location C:\Users\Owner\Documents\farmplast\former-employees\client
npm.cmd test
npm.cmd run lint
npm.cmd run build
node scripts/verify-employee-snapshot.mjs
node scripts/verify-employee-snapshot.mjs --postgres
node scripts/verify-employee-concurrency.mjs
node scripts/verify-employee-archive.mjs
Set-Location zkt-bridge
npm.cmd test
```

Snapshot harness намеренно требует private local export directory. Browser
harness использует workspace Playwright, installed Chrome и полностью
intercepted synthetic Supabase/SACS; он не отправляет production requests.
Screenshots: `C:\Users\Owner\Documents\farmplast\reports\former-employees\`.

Real PostgreSQL harnesses требуют локальный runtime вне Git в
`C:\Users\Owner\Documents\farmplast\reports\phase2-postgres-runtime`, его `pg`
driver и disposable cluster на `127.0.0.1:55439`. Они проверяют exact data_directory
и local test user перед CREATE DATABASE; remote/production connection не поддерживается.
Runtime получен как pinned `@embedded-postgres/windows-x64@18.4.0-beta.17` и
`pg@8.16.3`, без install scripts/Windows service. После проверки server остановлен.
Отчёт `concurrency-verification.local.json` хранится в этом runtime directory.

Для повтора запустить только этот disposable cluster, из PowerShell:

```powershell
$runtime='C:/Users/Owner/Documents/farmplast/reports/phase2-postgres-runtime'
Start-Process -FilePath "$runtime/node_modules/@embedded-postgres/windows-x64/native/bin/postgres.exe" -ArgumentList @('-D',"$runtime/data",'-p','55439','-h','127.0.0.1') -WindowStyle Hidden -RedirectStandardOutput "$runtime/server.stdout.log" -RedirectStandardError "$runtime/server.stderr.log"
# После выполнения --postgres и concurrency harnesses:
& "$runtime/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe" -D "$runtime/data" -m fast -w stop
```

## 8. Миграции и deployment package

Farmplast, строго по порядку:

1. `supabase/former_employees.sql` — Phase 1 archive/periods/RLS/protection.
2. `supabase/zkt_event_identity.sql` — immutable events/ownership, evidence,
   quarantine, all processor replacements, UUID presence view, realtime ownership.
3. `supabase/employee_lifecycle.sql` — reservations/principals, active uniqueness,
   guarded lowest-number allocation, operations and offline lifecycle.

SACS, отдельно и только в его project: `supabase/sacs/employee_history.sql`;
`supabase/sacs/functions/employee-history/{index.ts,handler.mjs}`.
Перенести function в стандартный `supabase/functions/employee-history` SACS
checkout перед CLI deploy. Это не Farmplast Edge function.

Farmplast API env: existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SACS_FARMPLAST_SYNC_SECRET`, `SACS_EMPLOYEE_SYNC_URL`; новые server-only
`FARMPLAST_SERVICE_ROLE_KEY`, `SACS_EMPLOYEE_HISTORY_URL`.
Нельзя использовать `VITE_` prefix для secret/service key. API routes добавлены
перед SPA fallback в `client/vercel.json`.

SACS function использует собственную secret authentication; после config/schema
проверки и approval деплой из SACS checkout:

```powershell
supabase functions deploy employee-history --project-ref <VERIFIED_SACS_REF> --no-verify-jwt
```

Установить secret через существующий private secret-management workflow; не
передавать значение в command log. Проверить unknown/wrong secret, manager,
caller-selected company, archived UUID, другой tenant и другого человека с тем
же employee number. Для нового worker проверить live inactive/active roster ACK.

## 9. Конкретная процедура NJ/PA

Ниже **инструкции для оператора**, не выполненные команды. Работать в согласованное
maintenance window на LAN каждого терминала, сначала с isolated DB/test user.

1. Зафиксировать физический model, serial, firmware, SDK/COM version, plant,
   все терминалы площадки, local timezone/time и допустимые UID min/max.
   Проверить IN/OUT modes: автоматический processor поддерживает только 0/1.
   Другие modes остаются review. Не считать сведения из old recovery capture
   подтверждением нынешнего состояния.
2. Зафиксировать running service names без config secrets:

```powershell
Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'zkt|farmplast' } | Select-Object Name,DisplayName,State
```

3. Получить **read-only** full inventory на каждом устройстве. Подставить
   проверенные IP/serial; private output directory создать заранее. Скрипт
   требует 32-bit PowerShell, serial match, stable device counts и complete
   enumeration; не экспортирует passwords, не меняет terminal state:

```powershell
& C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -File .\scripts\audit-terminal-identity.ps1 -TerminalIp <NJ_IP> -ExpectedSerial <NJ_SERIAL> -OutputPath <PRIVATE_NJ_INVENTORY_JSON>
& C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -File .\scripts\audit-terminal-identity.ps1 -TerminalIp <PA_IP> -ExpectedSerial <PA_SERIAL> -OutputPath <PRIVATE_PA_INVENTORY_JSON>
```

4. Сопоставить retained users/cards/biometrics и UUID по независимому roster /
   enrollment/export evidence. Зарегистрировать **все** devices. Все увиденные
   UID, включая неизвестные Farmplast, добавить в reserved-identifiers ledger
   с inventory hash/evidence. Текущее совпадение номера не подтверждает прошлое
   владение. Сохранить исходные terminal logs/export до любой активации.
5. Для каждого Bridge private config добавить:

```dotenv
ZKT_PLANT_LOCATION=NJ
ZKT_IDENTITY_DEVICE_KEY=<registered-device-key>
ZKT_EXPECTED_SERIAL_NUMBER=<verified-serial>
```

   Для PA — `PA`. SUPABASE credentials остаются private. Проверить dispatch
   `pending` / `pending_pa`. Candidate v2 не поддерживает все legacy bulk/delete
   команды; проверить/завершить production equivalence, не подменять existing EXE.
6. Сначала isolated DB и dedicated test employee. Только после согласования
   остановить старый service (`Stop-Service -Name <VERIFIED_SERVICE_NAME>`) и
   запустить один candidate worker с отдельным state directory:

```powershell
$env:ZKT_V2_ALLOW_LIVE='true'
node .\src\bridge.cjs --live --config <PRIVATE_CONFIG_PATH> --state-dir <PRIVATE_TEST_STATE_DIRECTORY>
```

7. Через admin lifecycle Terminate test employee: offline NJ/PA не мешают archive,
   held reservation остаётся. Подключить NJ — проверить SSR_EnableUser(false),
   RefreshData, SSR_GetUserInfo(false), serial/UID/state ACK. Number всё ещё held.
   Подключить PA — такой же ACK. Отсутствующий UID подтверждается только full
   inventory count + enumeration, а не false single-user lookup.
8. Не очищать логи/пользователей/templates. Проверить device log count до/после,
   сохранение biometrics исходного человека и **невозможность его входа после
   disable**. Одного SQL `active=false` или одного SDK return недостаточно.
9. При отключённом global reuse gate Rehire того же UUID получает новый period;
   terminal UID тот же. Activation ждёт прежних disable ACK. Проверить
   read-back enabled=true и реальный test punch. Другой test employee получает
   другой никогда не использованный terminal UID даже с reused HR number.
10. Передать сохранённые old IN/OUT после replacement; повторить import дважды;
    повторить одинаковые terminal numbers/time на разных устройствах; неверный
    serial, timeout, PA offline, DST fall hour, night shift и unsupported mode.
    Old event принадлежит прежнему UUID/period, ambiguous event unassigned/review,
    counts dedup стабильны и существующие payroll snapshots не меняются.

Historical reconciliation после получения evidence (admin JWT RPC, UTC bounds):

```sql
select public.record_verified_zkt_mapping(
  '<verified-device-key>', '<terminal-uid>', '<permanent-employee-uuid>',
  <employment-period-id>, '<verified-valid-from-UTC>', '<verified-valid-to-UTC>',
  '<independent export/enrollment evidence and checksum>');
select public.confirm_legacy_zkt_device(
  <legacy-identity-event-id>, '<verified-device-key>', '<independent device evidence>');
```

Не делать mass backfill по current roster. Null valid_to разрешён только для
действующего доказанного assignment. Unknown dates/clock ownership оставлять
в review; ownership RPC не включает historical auto-payroll processing.

## 10. Реальные PostgreSQL concurrency / release gate / rollback

На isolated PostgreSQL clone с остановленными terminal/SACS workers:
сначала проверить max/inventories/config и admin JWT. В двух отдельных psql
sessions выполнить INSERT employees с employee_number=NULL. Session A держит
transaction открытой 10 секунд; session B должна ждать number allocation lock.
После COMMIT A, COMMIT B должны вернуть **разные** минимальные HR номера и разные
terminal UID. Проверить unique held reservations и distinct active numbers.
Затем повторить create vs rehire и одновременно claim SACS disable vs rehire:
либо rehire supersedes старую pending операцию, либо running ACK блокирует его.
Повторить terminate при concurrent work-log insert и финализации payroll.
Шесть перечисленных interleavings выполнены на настоящем локальном PostgreSQL
18.4 с разными connections и проверкой `pg_stat_activity.wait_event_type='Lock'`.
Они прошли. Перед выпуском повторить на clone **текущей production версии** с
реальными grants/roles; физические workers в тестах не участвовали.

Release sequence после успешных checks и отдельного approval:

1. Подтвердить **текущий** Vercel production source SHA и все последующие security
   changes. Saved September base `0d2989ddb2887fbcf49bd813390ae1a81733b5f2` не
   доказывает актуальность. Сверить/rebase candidate и повторить release checks.
2. Свежие full Farmplast/SACS/Bridge backups + restore rehearsal; maintenance
   window с остановкой legacy import/rebuild workers и queued jobs.
3. Проверить текущую live schema заново; применить Farmplast migrations по порядку
   и SACS package в правильном project. Сравнить original table hashes/counts,
   RLS definitions/grants, approved payroll/attendance, PDF/CSV/YTD и role matrix.
4. Оставить reuse=false; зарегистрировать all verified devices, импортировать
   reserved inventory IDs, подтвердить actual common UID range и configure maximum.
   Старые 8 former reservations не отпускать без явных disable ACK.
5. Выполнить hardware/SACS scenarios выше и настоящий двухсессионный PostgreSQL
   тест. Сверить all number-based consumers (старый Bridge/lookback, presence,
   rebuild endpoints и локальные процессы) и выключить legacy joins.
6. Только после этого отдельным согласованным изменением разрешить reuse:

```sql
begin;
select pg_advisory_xact_lock(736261,2);
update public.employee_number_config set reuse_enabled=true where singleton;
commit;
```

**Rollback:** прежде всего остановить workers/queues и установить reuse=false в
транзакции с тем же number lock. Если никакого reuse/new lifecycle ещё не было,
на isolated restored clone проверить возврат прежних definitions из private
backup, unique constraint, view и application version; затем согласовать
production rollback. Не удалять новую history/raw/ownership для отката UI.
После фактического reuse старый number-based processor и глобальная UNIQUE
constraint **небезопасны/несовместимы**: нужен forward fix с сохранением UUID и
lease ledger. PITR может потерять новые punches/payroll; перед восстановлением
сохранить свежий tail и план его reconciliation. Нельзя автоматически включать
`*_pre_identity` definitions после reused numbers.

## Точные оставшиеся блокеры

| Блокер | Что необходимо для снятия |
|---|---|
| NJ/PA physical identity / disable / real punch | Доступ к LAN/терминалам; read-only inventories, SDK mode/range/timezone audit, dedicated test employee, оба read-back ACK и физический disable test |
| Installed Bridge compatibility | Текущие service/runtime/config/hash обоих заводов; проверить editable candidate equivalence, bulk command contract и отсутствие параллельного старого worker |
| 10 578 legacy raw events lack device provenance | Независимые device exports и historical assignment/date evidence; ambiguous rows оставить quarantined, не назначать по номеру |
| Live SACS History / lifecycle ACK | Проверить актуальную tenant schema; одобрить/установить SACS SQL/function/env и live archived UUID/admin/tenant/inactive/rehire scenarios |
| Production-version reports / permissions | Локальная PostgreSQL concurrency проверка прошла; повторить на production-version clone с actual grants/roles и PDF/CSV/YTD checks |
| Current production revision / full recovery | Подтвердить live deployment SHA, reconcile latest security code, свежий full backup/PITR и restore rehearsal |
| Production migrations / deployment / reuse approval | Отдельное согласование после предыдущих доказательств; необратимые schema/lifecycle изменения здесь не применялись |

Commit SHA итоговой реализации предоставляется в ответе; его также можно
получить `git rev-parse HEAD` из этого checkout. Нового deployment URL нет.
