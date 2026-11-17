# Очистка Supabase Farmplast после переноса NJ

Выполнено 17 ноября 2026, около 22:23 UTC. Проект: `eeobivvwjzakbweluwtm`.
Миграция: `20261117222358_farmplast_retire_cloud_telemetry`.

После физической USB-установки общего контроллера бочек все три чиллера и обе бочки передают показания напрямую в MSI. Текущие значения находятся в RAM; Supabase больше не содержит NJ-телеметрию и её каталог.

Удалены 8 таблиц: `alarms`, `asset_points_latest`, `assets`, `device_commands`, `devices`, `points`, `telemetry_latest`, `telemetry_latest_import`. Пять таблиц показаний/команд/сигнализаций были пусты. В каталогах оставались только две бочки, два устройства и 14 определений points. Также удалены два Cloud-представления, девять неиспользуемых функций, две принадлежащие таблицам последовательности и публикация изменений старой телеметрии.

Проверены внешние ключи, зависимости PostgreSQL, триггеры, RLS, определения функций (включая текст PL/pgSQL), представления, задания cron, Realtime и прямые/динамические обращения приложения. Связей между удаляемой телеметрией и Payroll/HR/ZKT/Auth/PA climate не обнаружено. Общий `set_updated_at()` не имел триггеров или иных вызовов; heartbeat/history helpers обращались к ранее удалённым таблицам.

Сохранены все 29 остальных прикладных таблиц: Payroll, сотрудники, выплаты, чеки, налоговые профили, удержания, рабочие часы, кадровая история, интеграции, ZKT, профили пользователей и служебные конфигурации. Пустые `employee_release_evidence`, `zkt_legacy_device_evidence`, `zkt_reserved_terminal_identifiers`, `zkt_work_log_provenance` нужны действующим процессам и сохранены. Все системные схемы, Auth, расширения и два действующих bucket остаются.

До и после удаления совпали контрольные суммы данных всех 29 таблиц, а также 1811 определений и прав защищённых объектов, включая Auth и Storage. Schema digest: `2e3020b6ff096fcfb42395c5d953ac2e`. Остались 73 сотрудника, два Auth-пользователя, 64 фотографии в `employee-photos`, два служебных объекта PA climate и прежний ZKT cron. Финансовые и персональные записи не экспортировались в отчёт.

Удаление выполнено одной транзакцией REPEATABLE READ, с lock_timeout 3 секунды, без CASCADE и без записей в защищённые таблицы. Guards проверяют пустоту телеметрии, точный состав каталога и неизменность Payroll/HR/Auth/ZKT. На локально восстановленной структуре прошли шесть сценариев: штатное удаление; устаревший schema digest; неожиданные показания; дополнительный asset; внешняя зависимость; попытка изменить Payroll. Последние пять сценариев полностью откатываются.

Закрытая копия структуры для восстановления, SQL восстановления пустых таблиц и результаты проверок находятся в `C:\Users\Owner\AppData\Local\FarmplastMsi20261116\supabase-cleanup-20261117` и `E:\SimScopeData\Farmplast\NJTelemetry\private\supabase-cleanup-20261117` на MSI. Показания и значения старых device secrets в эту копию не включены. Восстановление выполняется вручную при необходимости; старые исторические SQL-скрипты не следует повторно применять к production.

Сайт закреплён за MSI: удалены клиентский переключатель источника и серверный Cloud fallback. Старое частичное значение NJ_TELEMETRY_MSI_ASSETS больше не возвращает бочки в Supabase. Auth продолжает использовать Supabase. Из ручного JSON-экспорта удалены три ссылки на retired telemetry-таблицы; существующие Payroll/ZKT разделы сохранены.

После очистки Security Advisor не добавил новых категорий предупреждений; Health Advisor до очистки был без замечаний. Performance Advisor больше не отмечает категории no_primary_key и unused_index. Существующие предупреждения HR о RLS, SECURITY DEFINER/search_path, индексах и защите паролей требуют отдельной проверки прав доступа и не исправлялись изменением Payroll. Справка: [SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [защита паролей](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Машиночитаемый результат: `supabase-cleanup-20261117.json`. Все пять реальных потоков MSI проверены свежими и online после подготовки миграции.

Проверка приложения: четыре теста NJ proxy/SDK/RAM/TTL, ESLint изменённых JS-файлов и Vite build прошли. Общий запуск: 253 теста, 242 passed и 11 failed. Два SSR-теста без локальных Supabase env повторно прошли после задания фиктивных URL/публичного ключа (всего в этом запуске 5 passed). Девять ZKT-тестов остановились на прежнем guard `ZKT compatibility baseline changed`; соответствующий сбой воспроизведён на отдельной неизменённой копии main `5a54b0d`. Эти тесты используют старые SQL fixtures и не загружают новую миграцию очистки. Полный suite поэтому не заявляется зелёным. Рабочий ZKT/Payroll не изменялся: это подтверждено контрольными суммами production.

