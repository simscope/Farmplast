# Phase 5 — SACS security incident disposition

Дата: 2026-10-11. Production изменения в Phase 5 **не выполнялись**.
Предыдущий incident раскрыт в [Phase 4, раздел 8](former-employees-phase4.md).
Disposition: **OPEN — expired password, elevated dormant role; cleanup requires owner approval**.

## Фактические результаты

Read-only Management API SACS: `POST /v1/projects/{ref}/database/query/read-only`.
Проверки выполнялись с existing token из Windows Credential Manager в памяти.
Linked CLI, создание role, смена password и cleanup не выполнялись.
Private SQL/ответы находятся вне Git, в `reports/former-employees-phase5-private`;
пароль/verifier не выводился, проверялся только boolean `rolpassword IS NOT NULL`.

| Проверка | Результат |
|---|---|
| Роль | `cli_login_postgres`, LOGIN, NOINHERIT, не superuser; собственные CREATEROLE/CREATEDB/BYPASSRLS/REPLICATION=false |
| Срок password | `2026-10-11T14:21:45.488091Z`; истёк до проверок 14:59Z и 15:26:58Z |
| Credential verifier | **Присутствует**; не извлекался. Утверждать, что credentials удалены, нельзя |
| Активные подключения | 0 в трёх read-only samples; видимость `pg_read_all_stats` подтверждена |
| Membership | `postgres`: ADMIN=false, INHERIT=false, **SET=true** |
| Реальные достижимые права | `SET ROLE postgres`: CREATEROLE=true, CREATEDB=true, BYPASSRLS=true, owner 164 relations; далее достижимы service_role, pg_read_all_data, pg_monitor и другие роли |
| Собственность CLI role | 0 owned relations; 0 owned databases |
| Shared dependencies | 0 `pg_shdepend` references на role; 0 memberships, где она является parent |
| Непосредственные table права | SELECT на 6 relations; DELETE на `cron.job_run_details`; INSERT/UPDATE/TRUNCATE=0. Это не ограничивает права после SET ROLE |
| Schema права | Только public USAGE; CREATE=false |
| EXECUTE | 4450 functions, включая встроенные/default public grants; это не доказательство безопасной роли |
| Изменения employee/Safety Records | Не выполнялись |

NOINHERIT не запрещает SET ROLE. Истечение VALID UNTIL относится к password,
а не к LOGIN/role и не доказывает невозможность alternative authentication.
[PostgreSQL CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html),
[Role membership](https://www.postgresql.org/docs/17/role-membership.html).
Роль нельзя считать окончательно деактивированной.

## Использование сервисами и границы доказательств

SACS production SHA `49088c21cb9498435c42c1a8453f74bb76728469` совпадает с
проверенным checkout `sacs-employee-sync`. Frontend `supabaseClient.js` использует
Supabase HTTP API с anon key; sync Edge Function использует HTTP service-role key.
Scoped source search не нашёл `cli_login_postgres`, DATABASE_URL, DIRECT_URL,
POSTGRES_URL в frontend/src и supabase/functions. Vercel env metadata показывает
production `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`, hidden production env count=0;
значения не расшифровывались. Эти проверенные пути не используют CLI DB login.

Нулевые sessions и отсутствие ссылок в этих сервисах **не** являются полной
инвентаризацией внешних клиентов, pooler credentials, HBA/alternative auth и
credential caches. Не выполнялся login-test истёкшим credential: он мог бы снова
инициализировать role через CLI. Требование «нет активных credentials» выполнено
только для наблюдаемого password expiry; окончательное закрытие incident остаётся
BLOCKED до подтверждения владельца и targeted cleanup/его проверенного disposition.

Доказательства: `sacs-security.sql`, `sacs-verifier.sql`, `sacs-membership.sql` и
соответствующие `.private.json`; последний sample `2026-10-11T15:26:58.902469Z`,
`transaction_read_only=on`. Не включать private outputs в Git/PR.

## Предлагаемая деактивация — НЕ ВЫПОЛНЕНА

Владелец сначала проверяет audit log, сервисы/пулы и fresh dependencies. Отдельное
разрешение требуется именно на SACS role cleanup, не только Farmplast deployment.
Secure psql service ниже — заранее настроенный оператором credential, не существующий
автоматически профиль. Если managed platform запрещает ALTER ROLE, остановиться и
использовать согласованный Supabase administrative workflow, не обходить ограничения.

```powershell
# Только после отдельного разрешения на SACS cleanup и проверки pinned project.
psql 'service=sacs-approved-security' -X -v ON_ERROR_STOP=1 -f docs/operations/phase5-sacs-role-disable.sql
```

Готовый [SQL файл](operations/phase5-sacs-role-disable.sql) намеренно не входит в
автоматический rollout. Он дополнительно проверяет SACS integration markers;
эти markers не заменяют pinned project verification. Проверки не отключать.
Production здесь не выполнялось. Основные операции файла:

```sql
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cli_login_postgres') THEN
    RAISE EXCEPTION 'Role absent; re-audit instead of assuming cleanup';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cli_login_postgres'
             AND (rolvaliduntil IS NULL OR rolvaliduntil>=now())) THEN
    RAISE EXCEPTION 'Credential may be current; service/owner review required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename='cli_login_postgres') THEN
    RAISE EXCEPTION 'Active connections; review before disabling';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid
             WHERE d.refclassid='pg_authid'::regclass AND r.rolname='cli_login_postgres')
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
                 WHERE r.rolname='cli_login_postgres') THEN
    RAISE EXCEPTION 'Dependencies found; do not delete/reassign objects';
  END IF;
  ALTER ROLE cli_login_postgres NOLOGIN PASSWORD NULL;
  REVOKE postgres FROM cli_login_postgres;
END $$;
COMMIT;
SELECT rolname,rolcanlogin,rolvaliduntil FROM pg_roles WHERE rolname='cli_login_postgres';
SELECT rolpassword IS NOT NULL AS verifier_present FROM pg_authid WHERE rolname='cli_login_postgres';
SELECT count(*) AS sessions FROM pg_stat_activity WHERE usename='cli_login_postgres';
SELECT count(*) AS memberships FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
WHERE r.rolname='cli_login_postgres';
```

Ожидается LOGIN=false, verifier=false, sessions=0, memberships=0. Fresh audit должен
также исключить неожиданные дополнительные membership grants. Роль автоматически
не удалять; DROP ROLE только после отдельного решения и свежей проверки зависимостей.
Не выполнять DROP OWNED, REASSIGN OWNED или DROP CASCADE. SQL session и проверки
не предотвращают внешнее одновременное повторное создание role CLI — CLI audit
на время cleanup должен быть остановлен владельцем. Одна SQL transaction не
заменяет инвентаризацию клиентов.

## Расхождение employee status

В read-only повторной сверке 65/65 source UUID найдены, employee numbers совпали,
duplicate UUID не обнаружены. **Один** Farmplast inactive employee остаётся active
в SACS. Последний SACS update/sync этого профиля: `2026-09-24T02:25:57.763741Z`.
Фактический UUID и профиль доступны только в private evidence.

Проверенный контракт: Farmplast управляет кадровым source UUID/is_active;
`sync_farmplast_employee` обновляет managed roster по source UUID, а
`protect_farmplast_identity` защищает управляемую identity. Существующий Farmplast
bulk sync выбирает только active ZKT-enabled employees; single inactive sync
умеет отправить is_active=false. Это объясняет, **как** расхождение может сохраниться,
но не доказывает причину последнего реального кадрового изменения.

Владелец HR должен подтвердить source of truth и фактический статус/дату, проверить
audit chronology и договориться о targeted sync по тому же UUID. До этого не
выполнять sync, не менять status в SACS и не создавать training completions.
Перед согласованным исправлением сохранить SACS history/references; проверить
влияние is_active=false на kiosk access, assignments и SSO. Existing sessions и
completed sessions scoped Farmplast roster сейчас 0; это не positive evidence
сохранности ненулевой live Safety History. UUID-preservation synthetic tests PASS.
