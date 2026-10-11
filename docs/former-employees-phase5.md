# Former Employees — Phase 5: controlled archive release preflight

Дата: **2026-10-11**. Branch: `codex/former-employees`.
Base: `ba9a487d80b0aa796a4f5df6ea2cf68afc2cdbfd`.
Implementation/test commit: **`c164137ca30b353078a14b2888c7d886be02a06e`**.
Report commit: `git log -1 --format=%H -- docs/former-employees-phase5.md`.
Предыдущая доказательная база: [Phase 4](former-employees-phase4.md).

**Production deployment, migrations, flags enable, SACS role cleanup, кадровые
операции и действия на терминалах в Phase 5 не выполнялись.** Production DB audits
были read-only. Полный backup считывал данные; новые fixture records созданы только
в отдельном loopback PostgreSQL. Branch не pushed; Git commit не является deployment.

## 1. Final release decisions

| Компонент | Technical readiness | Production decision сейчас |
|---|---|---|
| Archive Read-Only | **GO candidate**: отдельные flags, admin RLS, обе минимальные миграции и rollback проверены на PG 17.6; UI Desktop/Mobile PASS | **NO-GO / STOP BEFORE DEPLOYMENT**: SACS security incident ещё OPEN; live Bridge/SSO baseline и окончательное разрешение владельца не получены |
| Terminate / Rehire | Local tests PASS; независимые flags OFF | **NO-GO**: physical NJ/PA/ACK, historical UUID и live SACS/reconciliation/rollback blockers сохраняются |
| Employee Number Reuse | Feature OFF; gated advanced enable, reserved numbers и concurrency проверены locally | **NO-GO**: нет восьми current подтверждений, device inventories/ranges и all-terminal deactivation ACK |

Здесь read-only архив **не** блокируется новой physical UUID/deactivation/reuse
валидацией. Для его собственной приёмки нужны baseline работоспособности уже
существующего Attendance Bridge и SSO, migration/backup/security checks. Safety
History нового endpoint не включена в GO: upstream SACS endpoint не deployed;
карточка должна показывать честную недоступность, а не выдуманную нулевую историю.
После закрытия собственных gates архива дальнейшие actions/reuse gates остаются OFF.

| Проверка | Статус | Доказательства / пределы |
|---|---|---|
| SACS security disposition | **BLOCKED — OPEN** | Expired verifier остаётся, LOGIN=true, SET ROLE postgres и elevated privileges; 0 sessions/dependencies. Cleanup не разрешён/не выполнен; [security report](former-employees-phase5-security.md) |
| Production drift | **PASS** | Farmplast/SACS deployment SHAs прежние; 65/57/8; все public functions и 41 public policies совпали с сохранённым catalog; 59 all-schema policies/6 extension versions unchanged |
| Fresh full backup | **PASS — dump + TOC verification** | Snapshot 15:03Z, 96 tables, pg_dump=0, pg_restore --list=0, SHA/size ниже |
| Full restore | **Phase 4 PASS; новый полный dump не restored заново** | Phase 4 exact PG 17.6 full restore 96 tables/59 policies/6 extensions; Phase 5 использовал неизменившиеся HR rows для scoped replay. Не подменять новый full restore TOC-проверкой |
| Archive-only migrations | **PASS — isolated PG 17.6 scoped source replay** | Только former_employees.sql + employee_archive_feature_flags.sql; 9 row multisets и 10 legacy ZKT/SSO functions preserved; 65 periods |
| Flag/API/DB isolation | **PASS locally; effective OFF in production** | 4 default OFF, DB lifecycle/direct-status guards, hidden RPC revokes, gated archive RPC/history API and integration API; missing schema/flags fail closed |
| Archive rollback rehearsal | **PASS database/app contract locally** | Flags OFF, additive schema retained, post-migration synthetic employee/period retained; old active-list/manual-create path works. Hosting rollback не выполнялся |
| Application tests | **PASS 147/147** | npm test; includes permissions, flags, ordinary create, SSO, payroll contracts |
| Bridge tests | **PASS 19/19 offline** | node --test test/*.test.cjs; не доказательство physical health/installed version |
| PostgreSQL concurrency | **PASS 10 checks, PG 17.6** | 8 existing two-session checks + feature shutdown/admission locks |
| Build / lint | **PASS** | Build exit 0; lint 0 errors/6 existing warnings; existing MICR font warning |
| Desktop/Mobile | **PASS synthetic local browser** | Archive/cards/search/filters/UUID history, actions disabled, OFF route/direct profile, normal manual create; 0 page errors |
| NJ existing Bridge | **BLOCKED live** | Tailscale peer offline, SSH timeout; no commands sent to terminal |
| PA existing Bridge | **BLOCKED live** | Host/terminal endpoint not established; offline peers do not identify PA Bridge |
| Existing SACS SSO | **Contract PASS; live handoff PENDING** | Source RPC definitions/current SHA preserved; synthetic endpoint permissions PASS; no authenticated production handoff consumed |
| Production acceptance | **NOT RUN** | Deployment не разрешён/не начат |

## 2. Security incident and SACS source of truth

[Отдельный security report](former-employees-phase5-security.md) содержит role
attributes, recursive membership privileges, ownership/dependencies, connection
samples, credential limits и точную предлагаемую деактивацию. Истёкший пароль не
закрывает LOGIN/SET ROLE и не доказывает отсутствие альтернативной authentication.
NOLOGIN/password null/membership revoke и DROP ROLE в production не выполнялись.

Проверенные SACS frontend/Edge paths работают через Supabase HTTP keys, не CLI
Postgres login; production env metadata не показывает DB connection variable.
Внешние сервисы/пулы полностью не инвентаризированы. Перед cleanup нужен owner
review; перед deployment — закрытый проверяемый disposition, а не предположение.

65 source UUID и номера совпадают, duplicate source UUID=0. Один Former в Farmplast
active в SACS; это прежнее расхождение. Последняя SACS sync/update дата — 2026-09-24.
Bulk active-only sync может его оставить; источник последнего изменения ещё не
подтверждён HR. Реальные records не исправлялись. Read-only archive не запускает
bulk sync или queued lifecycle delivery. Existing SSO сохраняет прежний контракт.

## 3. Production drift / compatibility

Farmplast alias `farmplast.vercel.app`: READY, deployment
`dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq`, source SHA
`4b7573a6d105cbfd61a035e0c31c3f324a4a165b`, branch `codex/farmplast-admin-sso`.
Повторная финальная Vercel inspection подтвердила тот же deployment. Эти SSO
изменения уже интегрированы в подготовленную ветку в Phase 3; production не
перезаписывался более старой версией. SACS production SHA:
`49088c21cb9498435c42c1a8453f74bb76728469`, прежний deployment
`dpl_EAwTB3hi5RPNNdhLT83aH73y3sCj`.

| Source relation | Rows; unchanged count/checksum |
|---|---:|
| employees | 65: Active 57 / Former 8 |
| employee_work_logs | 5665 |
| employee_payments | 987 |
| employee_payroll_deductions | 242 |
| employee_tax_profiles | 65 |
| payroll_checks | 1544 |
| zkt_attendance_logs | 10578 |
| zkt_bridge_commands | 0 |
| profiles | 2 |

Пять Payroll/Attendance employee foreign-reference orphan counts = 0.
Source migration catalog пуст; staged periods/identity/config/flags tables отсутствуют.
Все 59 source RLS policies и extension versions совпали с Phase 3/4 catalog;
полные public function definitions совпали с предыдущим readonly catalog.
Это описание каталогов, не доказательство отсутствия всех вне-каталожных изменений.

91/96 полного table snapshot совпали по count/checksum. В пяти operational tables
count прежний, row checksum изменён: ch1_ota_device (1), ch2_latest (21),
chiller_ota_devices (2), chiller_ota_receipts (2), telemetry_latest (42).
Это drift оборудования/телеметрии; конкретную причину каждой row update не
приписываем без audit trail. Минимальные archive migrations не пишут эти таблицы
и не заменяют processors/telemetry. Не переносить старые rows поверх новых.

## 4. Backup verification and restore limits

Полный logical snapshot: **2026-10-11T15:03:00.521Z**.
Private artifact: `reports/former-employees-phase5-private/farmplast-full.dump`.
Size: **2,134,074 bytes**; SHA-256:
`85fd5e9ecc2cd40d4400357f6fdeca8c85da779a568b708c78468c491576f032`.
pg_dump custom format exit 0; pg_restore --list exit 0. Backup не менялся.
Catalog/count/MD5 snapshot охватывает 96 tables всех schemas, functions/triggers,
RLS/extensions; separate private catalog содержит role attributes/memberships,
без password hashes. Source PostgreSQL **17.6 aarch64**, pg_cron **1.6.4**.

Точный полный restore неизменённого предыдущего dump выполнен Phase 4 на Linux
PG 17.6 с pg_cron 1.6.4/Vault 0.3.1, cron.launch_active_jobs=off и deny-all network.
Новый Phase 5 полный dump **не** восстановлен заново; TOC не подтверждает полный
restore, managed service boot, внешние storage bytes или Vault decryptability.
Перед фактическим release operator повторно проверяет freshness и выполняет full
restore того backup, который назначен release recovery artifact, в таком же
совместимом изолированном окружении. При ошибке — migration/deployment STOP.
Не запускать restored cron tasks и не передавать production credentials в clone.

Девять scoped exports предыдущего snapshot использованы **только после** подтверждения
их count/MD5 тождественности новому source snapshot. На отдельном native PG 17.6
выполнены две archive migrations, проверены original-column row SHA-256,
permissions/old contracts и rollback с новой fixture row. Это scoped replay,
не полный dump restore. Loopback port 55441, user phase5_local, dedicated data
directory проверяются script до создания disposable database. Cluster остановлен
после проверок. Private files имеют Owner-only NTFS ACL, находятся вне repository.

## 5. Independent feature flags and enforcement

| Flag | Candidate default | First approved release |
|---|---|---|
| former_employees_archive_readonly | OFF | ON отдельной командой после проверки deployment |
| employee_terminate | OFF | OFF |
| employee_rehire | OFF | OFF |
| employee_number_reuse | OFF | OFF |

Состояние хранится в public.employee_feature_flags, без client env override.
RLS + ACL запрещают authenticated/anon/service_role менять flag rows. Missing
RPC/row/error => OFF. Owner/operator меняет состояние только согласованным SQL.
UI обновляет flags при focus и каждые 30 секунд; при смене login/role старые flags
не переходят новому пользователю. Уже полученные данные нельзя отозвать из памяти
браузера, но новый archive RPC сразу проверяет OFF на сервере.

Archive: admin-only `list_former_employees(offset,limit)` с caller RLS, paging max
500; archive OFF запрещает RPC, Employment History policy и новый history proxy.
Former page/profile не запрашивают archive/history при OFF; навигация скрыта.
Существующие admin employee SELECT права сохранены для старых roster/Payroll
контрактов. Flag выключает новый archive path, не отзывает уже существующие admin
права и не удаляет Former employees. Не считать этот flag новым PII entitlement.

Lifecycle: wrapper сначала проверяет admin и отдельный action flag; скрытый
pre_flags RPC отозван у public/anon/authenticated/service_role. Table trigger
отклоняет direct status, termination metadata, number reassignment/reuse при OFF,
включая попытку обхода через session GUC. Новая integration API при обоих actions
OFF не создаёт service client и не вызывает SACS. Новый API не принимает create
или дополнительные payload keys. Advanced allocator automatic INSERT при наличии
flags требует reuse ON; manual ordinary new employee creation остаётся доступным.
Future integration claim/retry имеют DB checks, finish ACK для уже running job
остаётся возможным. Эти advanced migrations **не** входят в первый release.

Включение actions требует separately installed lifecycle/release schemas; включение
reuse дополнительно требует существующих восьми current release confirmations.
Ни наличие schema, ни deployment не включает flag автоматически. `FOR SHARE` на
enabled flag row синхронизирует mutation admission и OFF commit; 2 real-session
проверки доказывают ожидание in-flight операции и отказ ожидавшей операции после OFF.

## 6. Migrations and changed files

Первый release — **только**, в этом порядке:

1. `supabase/former_employees.sql` — прежняя Phase 4 archive migration, UUID и
   global reserved-number uniqueness, 65 periods, admin RLS/history protection.
2. `supabase/employee_archive_feature_flags.sql` — новая Phase 5 migration,
   4 OFF flags, archive RPC/policy, lifecycle wrapper/table enforcement.

Не применять `zkt_event_identity.sql`, `employee_lifecycle.sql`,
`employee_release_gates.sql` для read-only archive. Не делать blanket db push.
New flag migration рассчитана на однократное применение: rename/wrapper/create
не предназначены для слепого повторного выполнения. Проверить catalog/ledger и
при partial state остановиться, не drop/recreate tables. Existing global number
UNIQUE сохраняется, старые Bridge number-based processors не переключаются.

Changed implementation files в commit c164137:

- supabase/employee_archive_feature_flags.sql; supabase/employee_lifecycle.sql
  (только будущие allocator/claim/retry guards; не применять в этом rollout).
- client/src/hooks/useEmployeeFeatureFlags.js; EmployeesPage.jsx;
  FormerEmployeesPage.jsx; EmployeeDetailsPage.jsx; EmployeeEmploymentPanel.jsx.
- client/api/employee-integrations.js; client/server/employeeIntegrationEndpoint.mjs;
  client/server/employeeSafetyHistory.mjs.
- client/tests/employee-feature-flags.test.mjs; employee-safety-history.test.mjs.
- client/scripts/verify-employee-archive.mjs; verify-employee-snapshot.mjs;
  verify-employee-concurrency.mjs.

Report commit добавляет этот файл, security report, отдельный manual cleanup SQL
и [sanitized evidence JSON](former-employees-phase5-evidence.json).
Список точно воспроизводится `git diff --name-only ba9a487..HEAD`.

## 7. Reproduction / verification

Из `client`, только local/synthetic или private offline snapshot:

```powershell
npm test
npm run lint
npm run build
node scripts/verify-employee-archive.mjs
node scripts/verify-employee-snapshot.mjs ../../reports/former-employees-phase5-private --postgres --archive-release
node scripts/verify-employee-concurrency.mjs ../../reports/phase5-postgres-runtime --phase5
# Из client/zkt-bridge:
node --test test/*.test.cjs
```

Results: 147/147, Bridge 19/19, PG 17.6 history replay PASS (9 tables, 10 legacy
functions), concurrency 10/10, Desktop/Mobile 0 page errors, build/lint PASS.
6 baseline React warnings и baseline /fonts/micr.ttf build warning сохранены.
В browser Supabase/SSO/Safety responses synthetic; они не называются live PASS.
Первый новый тест ошибочно ожидал отсутствия Active periods в advanced fixture;
исправлено ожидание существующего legacy policy. Archive-only real PG fixture
отдельно доказала 0 periods при OFF. Real PG permission assertions используют
SQLSTATE 42501, независимо от Russian/English locale сообщений.

## 8. Strict future production rollout — НЕ ВЫПОЛНЕНО

Перед всеми командами ниже: отдельное разрешение владельца на точные Farmplast
DB/application/archive enable actions. SACS cleanup требует своего разрешения.
Secure service/profile/project/team values operator проверяет отдельно; secrets
не помещать в command line/Git. Полный source SHA и deployment ID фиксировать.

1. Закрыть security disposition; проверить fresh source deployment/HR/RLS/role
   catalog; снять fresh full backup, проверить SHA/TOC и full isolated restore.
   При drift повторно проверить совместимость; получить baseline NJ/PA и SSO.
2. Проверить, что обе migrations ещё не applied, все preparatory tests относятся
   к принятому candidate SHA, исходные counts объяснены, rollback target READY.
3. Применить **только** две минимальные migrations. После каждой проверить
   source UUIDs/numbers/rows/FKs/RLS/processor definitions; после второй 4 flags OFF.
   При ошибке остановиться; production новые records не удалять.
4. Deploy утверждённого SHA в staged production deployment без назначения domain.
   Прочитать build/errors; проверить staged version и OFF behavior. Promote только
   этот verified ID. Нельзя deploy текущий случайный checkout или auto-enable flags.
5. Проверить production alias deployment ID/source SHA READY и active page/Payroll.
6. Отдельной SQL transaction включить **только** archive flag; прочитать 4 values.
7. Admin Desktop/Mobile: /employees/former = 8 либо fresh согласованный count,
   открыть каждую карточку, search/filters/navigation, доступ к разрешённой истории.
   Non-admin/anon должны быть denied по маршруту/API/RLS.
8. /employees только Active (baseline 57); обычное создание не делать на реальном
   сотруднике ради теста. Payroll/Attendance UUIDs и immutable historical rows
   сохранены; новые законные live rows учитывать отдельно, не стирать.
9. Подтвердить existing SACS SSO/handoff/permissions и NJ/PA существующие Bridge
   ingest/queues/errors. Ни terminal user delete, ни number reassignment/SDK write.
10. Проверить server/app errors, историю и flags actions/reuse OFF, оформить
    acceptance; критическая ошибка => archive OFF и утверждённый application rollback.

Пример команд после разрешения, из repository/client соответственно:

```powershell
# Repository root; service заранее проверен как Farmplast production.
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/former_employees.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -f supabase/employee_archive_feature_flags.sql
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# client: pinned project/team, candidate SHA; no alias assignment yet.
vercel deploy --prod --skip-domain
# Record returned URL/ID; inspect/test it, verify SHA before promotion.
vercel promote '<VERIFIED-STAGED-PRODUCTION-DEPLOYMENT>'
```

Approved archive-enable SQL, только после version/smoke checks:

```sql
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.employee_feature_flags)<>4
     OR EXISTS (SELECT 1 FROM public.employee_feature_flags WHERE enabled) THEN
    RAISE EXCEPTION 'Unexpected flags; stop and re-audit';
  END IF;
END $$;
UPDATE public.employee_feature_flags SET enabled=true
WHERE flag='former_employees_archive_readonly';
SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag;
COMMIT;
```

Ожидание: archive=true и terminate/rehire/reuse=false. Если операция FLAG/DATABASE
неверна, не продолжать deployment. [Vercel promotion docs](https://vercel.com/docs/deployments/promoting-a-deployment).

## 9. Rollback commands / rehearsal

На clone: original source multisets сохранены; archive ON дал 8 Former/65 periods;
anon/non-admin denied; OFF запретил archive API/periods; созданный после миграций
synthetic employee UUID и новый period сохранились. Active count clone стал 58.
Исторические Payroll/Attendance rows не изменились. Все 10 старых ZKT/SSO function
definitions прежние. Browser manual creation/active view работает с archive OFF.

При отдельно согласованном production rollback:

```powershell
# Disable first; retain all tables/columns/new rows.
psql 'service=farmplast-approved-production' -X -v ON_ERROR_STOP=1 -c 'UPDATE public.employee_feature_flags SET enabled=false; SELECT flag,enabled FROM public.employee_feature_flags ORDER BY flag'
# client: verify that target is the prior Farmplast READY production deployment.
vercel rollback dpl_APkGU5PYBFc6tkRLQNVqp8iJNhCq
```

Цель rollback актуализировать непосредственно перед deployment, если production
изменился. Проверить alias/SHA, Employees/Payroll, Bridge/SSO/errors после отката.
Если plan/доступ к rollback не подтверждены — release STOP. Не удалять migrations,
periods, employees, work logs или payments; не восстанавливать старый backup поверх
законных новых production rows. Database остаётся forward-compatible additive
archive schema, Bridge processors и SSO endpoints — прежними. Local rehearsal
не доказывает live hosting rollback; его command сейчас не выполнялся.

## 10. Remaining operator actions

**Для архива:** закрыть SACS role incident после инвентаризации/согласованной
деактивации; перед запуском проверить свежий release backup полным isolated restore;
получить live baseline NJ/PA Bridge и existing SSO; актуализировать drift/backup/
rollback target и получить отдельное подтверждение владельца. Затем выполнить
строгие шаги 1–10 и production acceptance. Сейчас остановка перед шагом 1 mutations.

**Для Employee Actions:** отдельно подтвердить HR status/source of truth и SACS
reconciliation, identities/inventories/serials, безопасную NJ/PA disable read-back
на согласованных test records, retained same-UUID periods/history и integration
ACK; проверить соответствующий advanced schema/Bridge cutover и rollback.

**Для Number Reuse:** отдельные PASS NJ physical, PA physical, Historical UUID
Mapping, Live SACS, Backup/Restore, DB migrations/concurrency и verified rollback
одного согласованного SHA; ranges/inventories и per-owner all-device disable ACK.
До этого terminal unavailable/unconfirmed => номер зарезервирован. Использовать
операторские инструкции [Phase 4, раздел 7](former-employees-phase4.md), не менять
реальные numbers/terminal users и не прерывать Attendance ради теста.

Финальный результат Phase 5: **candidate подготовлен; production NO-GO/STOP**.
Отдельное одобрение deployment не будет автоматически разрешать cleanup SACS,
Terminate/Rehire, повторное использование номеров или изменения терминалов.
