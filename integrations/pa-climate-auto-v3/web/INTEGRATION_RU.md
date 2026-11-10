# Веб-интеграция в существующий Farmplast — требования к объединению

ВНИМАНИЕ: Production Vercel от 10 ноября 2026 содержит более новые файлы `ClimateControl.jsx`, `ZoneOne.jsx`, `ClimateProgramming.jsx`, `/api/pa-zone1`, которых **нет** в текущей GitHub `main` и ветке `codex/pa-dashboard-production`. Не делать `git checkout main` и `vercel --prod` поверх действующей версии.

Новые подготовленные файлы, которые можно перенести в **восстановленный исходник текущей опубликованной версии**:

1. `api-pa-climate-msi.js` → `client/api/pa-climate-msi.js`.
2. `ClimateControlMsi.jsx` → `client/src/components/monitoring/pa/ClimateControlMsi.jsx`.
3. `ClimateProgrammingMsi.jsx` → `client/src/pages/ClimateProgrammingMsi.jsx`.

Заменить **только** климатические маршруты и компоненты после восстановления текущего исходника; сохранить структуру PA, PIN авторизации изменения температуры, существующий дизайн/кнопки и другие разделы. Новые компоненты в пакете являются работающей автономной альтернативой с MSI API, но при объединении с текущей страницей НЕ удалять её PIN и остальные рабочие механизмы. Из текущего блока `Wi-Fi · dBm` убрать только эту метрику, вместо неё показать `Sensor 2` со значением `sensor_2_f`; главная температура — `temperature_f` (среднее), `sensor_1_f` также доступна.

Пример интеграции с существующим React route (полную маршрутизацию менять только после сравнения с текущей source-сборкой):

- Route `/monitoring/pa/climate`: `ClimateControlMsi` либо адаптированный существующий `ClimateControl` с новым API.
- Route `/monitoring/pa/climate/programming`: `ClimateProgrammingMsi` либо адаптированный текущий `ClimateProgramming` с сохранением USB-прошивки.

Vercel environment (только server-side значения):

- `PA_CLIMATE_MSI_BASE_URL`: реальный HTTPS hostname MSI (публичный путь через Cloudflare Tunnel) без пути;
- `PA_CLIMATE_MSI_ADMIN_KEY`: значение `CLIMATE_ADMIN_KEY` из защищённого `E:\SimScopeData\Farmplast\Climate\climate.env` (не из браузера);
- `PA_CLIMATE_ALLOWED_USER_IDS`: UUID допущенных операторов через запятую;
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: существующие, использовать для проверки JWT, не менять.

Ни одно значение не должно попасть в `VITE_*` или JS клиента, кроме уже публичного anon key.

Браузер обращается к `/api/pa-climate-msi` на Vercel. Этот API аутентифицирует пользователя существующим Supabase JWT, сверяет UUID с allowlist и затем пересылает запрос в MSI. Данные и `.bin` хранятся ТОЛЬКО на MSI. Веб-сервер Vercel является лишь прокси. На MSI новый экземпляр Supabase не создаётся; существующие системы Farmplast и чиллеров не изменяются.

Для старта объединения нужна текущая source-копия web-приложения (с CLI-deploy), а не более старая ветка GitHub. Работу в production выполнять после того, как локальные тесты на MSI и физический тест датчиков прошли.