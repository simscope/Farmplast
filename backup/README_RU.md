# Ежемесячные резервные копии Payroll на MSI

Рабочие Payroll, вход и кадровый учёт остаются в Supabase Farmplast, проект eeobivvwjzakbweluwtm. Адрес сайта, API, переменные Vercel и рабочие таблицы не переключались. На MSI хранится зашифрованный архив для восстановления; постоянная вторая база Payroll не запускается.

## Где лежат копии и когда запускаются

Корень на MSI: E:\SimScopeData\Backups\FarmplastPayroll.

Windows-задание Farmplast-Payroll-Monthly-Backup работает от SYSTEM первого числа каждого месяца в 03:00 по времени сервера MSI (Atlantic Standard Time). Следующий запуск: 1 декабря 2026, 03:00 MSI / 07:00 UTC / 02:00 New York. При пропущенном запуске включён StartWhenAvailable, при ошибке — две повторные попытки через 30 минут. Вход пользователя в Windows, Docker и открытый Codex для самой копии не требуются. Нужны работающий MSI и доступ к Supabase.

Каждый месяц получает отдельную папку snapshots\YYYY-MM с payroll.tar.enc и manifest.json. Все проверенные копии сохраняются без автоматического удаления. Повторный запуск в одном месяце проверяет существующий архив и не создаёт дубль. Повреждённый или неполный архив не заменяется молча.

Дополнительно создана ежемесячная проверка Codex payroll-msi. Она проверяет результат, а при отсутствии копии запускает тот же скрипт. Уведомления настроены только для неудачных запусков; основной Windows-планировщик работает самостоятельно.

## Что входит

Схемы public, employee_presence_private, farmplast_zkt_private, auth, storage, supabase_migrations и extensions:

- Payroll: сотрудники, чеки, выплаты, удержания, налоги, рабочие часы и кадровая история.
- ZKT, интеграции, конфигурации и профили пользователей.
- Auth, включая записи пользователей и связанные таблицы.
- Определения таблиц, последовательностей, связей, индексов, функций, триггеров, представлений, RLS и прав.
- Файлы из employee-photos с именами, метаданными и контрольными суммами.
- Описания ролей без паролей, членство ролей, список расширений и конфигурация cron для ручного восстановления.

Auth provider settings, API keys, внешние секреты сервисов SACS/ZKT и содержимое PA climate bucket не являются частью этой копии Payroll. Метаданные Storage включены в дамп. Конфигурация cron записана как справочная информация и не запускается в проверочной базе. В Supabase больше нет NJ-телеметрии; копирование её не возвращает.

Доступ farmplast_msi_backup создан отдельно: pg_read_all_data, BYPASSRLS для полного чтения, default_transaction_read_only=on, без SUPERUSER, CREATEDB, CREATEROLE и REPLICATION. У рабочих ролей и политик права не менялись. Пароль не совпадает с административным и хранится только в закрытом pgpass.conf на MSI. TLS проверяет имя облачного сервера и CA.

## Как проверяется каждая новая копия

Одна исходная транзакция REPEATABLE READ экспортирует snapshot. pg_dump и расчёт контрольных сумм всех таблиц используют именно этот snapshot; рабочие изменения продолжают идти в Supabase.

Далее:

1. Скачиваются фотографии; проверяются размер и ETag/MD5 каждого объекта.
2. Дамп восстанавливается в новый временный PostgreSQL на 127.0.0.1:18887 со случайным паролем, без внешнего HTTP API и без включения cron.
3. Для всех таблиц сверяются количество строк и контрольные суммы содержимого, включая пустые таблицы.
4. Временная база останавливается. Файлы собираются в tar, шифруются AES-256-GCM, затем проверяются GCM tag и SHA-256 расшифрованного содержимого.
5. Только успешный результат атомарно публикуется как месячная копия. Временные незашифрованные файлы успешного запуска удаляются.

Рабочие данные Supabase не изменяются. При ошибке status будет failed, временные файлы останутся только в закрытой staging-папке для диагностики; она не считается месячной копией.

## Первая копия: 17 ноября 2026

Создана 23:22:34 UTC системным Windows-заданием:

- 67 таблиц, 49 189 записей; восстановление и все row digests совпали.
- 73 сотрудника, 1224 записи выплат, 1933 чека, два Auth-пользователя.
- 64 фотографии; MD5/размер при скачивании и SHA-256 после фактической расшифровки проверены.
- Архив 10 374 180 байт, encrypted SHA-256 031ef1e5782f583d67d4371a01c4c60de2c7b67aa5841dd78d6d6f515bfb4b69.
- LastTaskResult=0. Повторный системный запуск вернул already_verified; содержимое архива и его время создания не изменились.
- Три локальных теста проверяют шифрование/расшифровку, повреждение ciphertext/tag/header, неправильный ключ, отказ перезаписи, безопасные пути и точную фильтрацию только bootstrap-схем при восстановлении.
- Временный PostgreSQL остановлен; открытого порта 18887 и staging-папок после приёмки нет.
- Security Advisor не добавил новых категорий; прежние HR/Auth предупреждения остались.

Подробный результат без персональных данных: acceptance-20261117.json.

## Ключ восстановления

Основной: MSI E:\SimScopeData\Backups\FarmplastPayroll\private\archive-key.json.

Запасная копия: Owner C:\Users\Owner\AppData\Local\FarmplastMsi20261116\payroll-backup-recovery\archive-key.json. SHA-256 обоих файлов совпал. Ключ нельзя публиковать в Git, отправлять в чат или удалять: без него архивы не расшифровать. Для всех папок MSI разрешены только SYSTEM и MSI\sandr; Owner-копия наследует закрытые права Owner/SYSTEM.

## Проверка и ручной запуск на MSI

Обычный ручной запуск безопасно повторяет месячную проверку:

    & 'C:\Program Files\nodejs\node.exe' 'E:\SimScopeData\Backups\FarmplastPayroll\scripts\monthly-payroll.mjs' --ensure-month

Статус: last-status.json, manifest.json соответствующего месяца и logs. Запуск задания:

    Start-ScheduledTask -TaskName 'Farmplast-Payroll-Monthly-Backup'
    Get-ScheduledTaskInfo -TaskName 'Farmplast-Payroll-Monthly-Backup'

Скрипты находятся в scripts; исходники — в этом каталоге backup репозитория Farmplast. Нативные PostgreSQL 17.12 взяты из официального ZIP EDB, без установки сервиса. Архив дистрибутива и его SHA-256 сохранены на MSI; extract-postgres-tools.py проверяет закреплённую сумму.

При зависшем lock-файле сначала проверяется процесс и временная база; файл нельзя удалять вслепую во время работающего копирования.

## Получение файлов для восстановления

Для отдельной закрытой папки, которая ещё не существует:

    & 'C:\Program Files\nodejs\node.exe' 'E:\SimScopeData\Backups\FarmplastPayroll\scripts\decrypt-payroll.mjs' 'E:\SimScopeData\Backups\FarmplastPayroll\snapshots\2026-11' 'E:\SimScopeData\Backups\FarmplastPayroll\private\archive-key.json' 'E:\SimScopeData\Backups\FarmplastPayroll\recovery\manual-2026-11'

Помощник проверяет архив, расшифровывает его, извлекает database.dump, schema.sql, table-checksums.json, context.json, роли и фотографии, затем сверяет все SHA-256 фотографий. Он не подключается к базе и не меняет сайт.

Дальнейшее восстановление выполняется только в отдельную подготовленную базу. Схема исходного проекта требует pgcrypto/uuid-ossp, ролей, аутентификации и совместимых версий Supabase, если восстанавливается сам сервис. Параметры провайдеров и внешних интеграций настраиваются отдельно. Временная проверка использует роли NOLOGIN и --no-owner; исходные owners/ACL остаются в архиве для полноценного восстановления в подготовленный Supabase.

Миграция 20261117231041 создаёт reader без LOGIN. Операционная миграция 20261117231114 установила отдельный SCRAM verifier; в Git вместо секрета находится документированный маркер. Новая установка требует отдельного provisioning, существующий пароль при воспроизведении миграций не перезаписывается.

Документация: [Supabase: dedicated backup reader](https://supabase.com/kb/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy-1d5783), [backup/restore and separate Storage files](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [official Windows binaries](https://www.postgresql.org/download/windows/).

