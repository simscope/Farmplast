# NJ monitoring egress reduction

Branch: codex/nj-monitoring-egress

Base: main at cf7fc99893781455c1af16a8f7df24036d9e57c9 (fresh clone of simscope/Farmplast).
The delivery message supplies the implementation commit SHA.

## Deployment status

The monitoring overview and CH2 freshness fix are deployed to production. The CH2 follow-up migration supabase/fix_ch2_overview_freshness.sql was applied, and [PR #7](https://github.com/simscope/Farmplast/pull/7) was merged on 2026-09-12. The verified production release SHA is d26cea722fe7571d04acbacc10556f385fcf9990. See the CH2 follow-up section below for production verification. Existing SQL files use descriptive names directly under supabase/; supabase/add_nj_monitoring_overview.sql remains the fresh-install definition.

Initial read-only requests verified every selected column on v_asset_points_latest, telemetry_latest, ch2_latest, ch3_latest, v_ch2_dashboard and v_ch3_dashboard, plus the NJ assets, device codes, and relevant point codes. The repository does not contain the original definitions of these views/tables, and the public API does not expose their full DDL. Before release, migration execution was tested in embedded PostgreSQL against fixtures using those verified columns. The CH2 follow-up was subsequently applied and its overview contract verified in production; this does not constitute a production query-plan audit.

## View contract and security

public.v_nj_monitoring_overview is an ordinary security_invoker view. It joins five fixed presentation slots to grouped existing point data and scalar aggregates of the existing chiller dashboard views. It adds no persisted telemetry or history and returns exactly five rows even when source data is absent or a source has duplicate dashboard rows. Tests verify cardinality and column shape. Only SELECT on the new view is granted to anon/authenticated; no existing grants, policies, or underlying views are changed. The caller still needs the existing underlying read permissions.

Exact column order (13 columns):

1. asset_code (text)
2. asset_name (text)
3. asset_type (text)
4. updated_at (existing source timestamp type)
5. is_online (boolean)
6. comp_1a_enabled (boolean, nullable)
7. comp_1b_enabled (boolean, nullable)
8. comp_1c_enabled (boolean, nullable)
9. comp_2a_enabled (boolean, nullable)
10. comp_2b_enabled (boolean, nullable)
11. comp_2c_enabled (boolean, nullable)
12. level_percent (existing numeric type, nullable)
13. has_error (boolean, nullable)

There are no raw registers, temperatures, pressures, setpoints, flows, capacities, distance, sensor temperature, raw error codes, point arrays, history, credentials, device secrets, or internal identifiers in this result.

| Presentation asset | Existing source | Online behavior |
| --- | --- | --- |
| CH-NJ-01 | v_asset_points_latest, CH-NJ-01 | Existing meaningful-data rules plus floor(age in seconds) <= 15 |
| CH-NJ-02 | v_ch2_dashboard | latest_updated_at newer than 45 seconds; legacy is_online deliberately ignored |
| CH-NJ-03 | v_ch3_dashboard | Latest compact migration uses latest_updated_at newer than 45 seconds; legacy is_online ignored |
| BARREL-NJ-01 | v_asset_points_latest, BARREL-NJ-02 | Explicit ONLINE bit when present, otherwise meaningful data; always gated by freshness |
| BARREL-NJ-02 | v_asset_points_latest, BARREL-NJ-01 | Same |

The barrel swap was explicitly confirmed by the user and is identical on overview and details. The live CH1 schema has CH1_COMP1/CH1_COMP2 only. Per user confirmation, these map to 1A/1B; the remaining four fields are NULL and display N/A. Missing data for supported compressor positions displays UNKNOWN. Barrel error state comes from HAS_ERROR, preserving NULL as unknown rather than implying normal. Zero material level remains valid.

The SQL expression updated_at > now() - interval '16 seconds' preserves the existing JavaScript floor(secondsAgo) <= 15 boundary. CH1 meaningful-data parity is tested against monitoringHelpers.getAssetStatus. Barrel detail uses the same existing 15-second threshold and explicitly gates stored ONLINE bits so a stopped ESP becomes offline. CH3 retains its existing dashboard status. CH2 alone overrides the legacy dashboard status with the 45-second freshness rule described below.

## CH2 false-OFFLINE follow-up (deployed to production)

CH-NJ-02 uses latest_updated_at freshness for ONLINE on both the overview and its HMI. Normally reporting firmware may publish around every 15 seconds; the legacy v_ch2_dashboard.is_online can expire between updates. The presentation layer therefore deliberately ignores that legacy boolean for CH2, even when it is false but the latest telemetry is fresh. The underlying v_ch2_dashboard definition and ingest_ch2 are not changed.

The nominal window is 45 seconds. Both implementations match the task's explicit SQL predicate exactly: latest_updated_at > now() - interval '45 seconds'. Thus 10 seconds, 44 seconds and 44.999 seconds are ONLINE; exactly 45 seconds and older are OFFLINE. NULL/missing/invalid timestamps are OFFLINE. No rounding to whole seconds is used. SQL uses server time; the HMI uses browser time on the existing polling cycle, so a materially incorrect browser clock can affect its badge.

supabase/fix_ch2_overview_freshness.sql was applied to production before the frontend release. It transactionally replaces only v_nj_monitoring_overview with the same five fixed rows, 13 public columns, invoker security and grants. supabase/add_nj_monitoring_overview.sql is kept identical as the fresh-install source of truth; tests prevent drift and reapply the follow-up twice. Nothing drops/recreates the underlying dashboard views, ingestion objects or data.

Chiller2HMIPage calls the small isCh2Online helper with dashboard.latest_updated_at; it still requests exactly v_ch2_dashboard and ch2_latest every five seconds while visible. The overview still makes one compact request every 15 seconds. No new queries, subscriptions, timers or fields are added. Compressor decoding, all telemetry values, CH1, CH3 and the intentional barrel swap/freshness rules remain unchanged.

Deterministic tests cover SQL/JavaScript freshness parity, the exact threshold, missing/invalid values, fresh telemetry with legacy false, CH3's unchanged legacy behavior, unchanged compressor values and five-row/13-column contract. SQL boundary tests freeze now() in a transaction; JavaScript tests inject a fixed clock. Existing CH1/barrel/security/polling tests remain in the suite.

Follow-up verification: npm test passes all 21 tests; npm run build passes; npm run lint has zero errors and the same six pre-existing hook warnings. The existing /fonts/micr.ttf build warning remains. npm scripts were run through node and the installed npm-cli.js because the shell npm launcher is broken.

[PR #7](https://github.com/simscope/Farmplast/pull/7) was merged at 2026-09-12 15:30:14 UTC and the frontend deployment succeeded. Production release SHA: d26cea722fe7571d04acbacc10556f385fcf9990.

Production verification confirmed:

- /monitoring/nj displayed Chiller 2 ONLINE.
- /monitoring/nj/chiller-2 displayed Online: YES.
- v_nj_monitoring_overview retained exactly five rows and 13 columns. At 2026-09-12 15:30:26.943966 UTC, CH2 telemetry was 3.737424 seconds old and its overview status was ONLINE.
- CH1, CH3, barrels, firmware, ingest_ch2, Modbus and telemetry frequency were unchanged by this release.

## Refresh behavior

| Route | Initial refresh | Normal interval | Requests per refresh |
| --- | --- | --- | --- |
| /monitoring/nj | On mount when visible | 15 seconds | Exactly 1: v_nj_monitoring_overview with 13 explicit columns |
| /monitoring/nj/chiller-1 | On mount when visible | 5 seconds | 1: explicit CH-NJ-01 point projection |
| /monitoring/nj/chiller-2 | On mount when visible | 5 seconds | 2: explicit dashboard projection and required raw-register projection |
| /monitoring/nj/chiller-3 | On mount when visible | 5 seconds | 2: explicit dashboard projection and required raw-register projection |
| /monitoring/nj/barrel-1 | On mount when visible | 5 seconds | 1: explicit barrel point projection filtered to BARREL-NJ-02 |
| /monitoring/nj/barrel-2 | On mount when visible | 5 seconds | 1: explicit barrel point projection filtered to BARREL-NJ-01 |

MonitoringNJPage performs no ch2_latest, ch3_latest, v_asset_points_latest, raw telemetry or detailed barrel reads. Its barrel cards fetch neither distance, sensor temperature nor raw error code. The UI keeps the existing dark background, summary cards, two-column responsive layout and graphical barrel fill. Chiller cards show identity, ONLINE/OFFLINE and compressor states only. Both barrel cards are keyboard-accessible links. Details expose existing diagnostic values and per-point timestamps, so missing or old diagnostics are visible as such.

All six routes use the same scheduler. No Realtime subscriptions remain in the overview or three chiller detail pages, and no barrel subscriptions were added. Manual, visibility, and timed reads share one in-flight guard per mounted route. CH1 command completion requests a guarded immediate refresh instead of leaving an uncancelled delayed refresh. The command write behavior and firmware are unchanged.

Hidden documents have no polling timer; showing the tab causes one immediate guarded refresh and resumes the normal interval. Initial hidden mounts wait until visible. An already running request can finish while hidden. Unmount removes the timer and visibility listener and aborts outstanding requests; loaders ignore aborted results. React StrictMode's discarded setup does not issue an initial request. Route changes between the two barrel pages have distinct keys to discard old route state.

CH2 and CH3 raw reads are explicitly filtered to the same eight verified raw_register values. CH3 retains its production CH2_R wire prefix. Both HMI dashboard projections omit heartbeat, capacity and delta diagnostics. See [CH2/CH3 telemetry cleanup](ch23-telemetry-cleanup.md) for the production schema baseline, dependency audit, compact ingestion migration and release verification.

## Original egress implementation verification (historical)

- Production frontend build: PASS.
- Full frontend lint: PASS, zero errors; six warnings in unchanged ChillerIllustration, AuthContext and EmployeeDetailsPage.
- Eleven Node tests: PASS. They execute and reapply the migration in PGlite PostgreSQL, verify five rows/13 columns, zero/NULL handling, barrel mapping, stale online flags, CH1 compressor mapping and JS/SQL status parity, dashboard reuse, invoker permissions/RLS, request overlap protection, hidden-tab behavior, StrictMode and unmount cleanup.
- Local browser fixture preview: all five compact cards render; no temperature/distance diagnostics on overview; both barrel links show the correct swapped detailed data. The local API log shows barrel-only five-second reads and overview-only reads after returning to the overview. No production data was changed for these checks.
- Existing unrelated build warning: /fonts/micr.ttf is unresolved at build time and left for runtime resolution. It was not suppressed.
- No ESP firmware, telemetry frequency, Modbus, PLC, networking or ingestion changes.

Run from client/: npm test, npm run lint, npm run build. On this machine the npm launcher is broken; the equivalent commands used node with C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js.

## Request and payload estimate

The original overview launched five requests every 5 seconds, plus another five per event on any row of telemetry_latest, ch2_latest or ch3_latest. There was no event filter, overlap guard or visibility pause.

For a continuously visible tab over [0, 24 hours):

- Old scheduled traffic: 17,280 refreshes x 5 = 86,400 requests/day.
- Old Realtime-triggered reads: an additional 5 x E requests/day, where E is the number of delivered matching row events. Realtime messages themselves add egress; E cannot be determined from frontend code alone.
- New: 1 / 15 seconds = 4/minute = 240/hour = 5,760/day, a 93.33% reduction versus the old polling floor. No Realtime overhead.
- These counts include the initial refresh at time zero and exclude the refresh exactly at the 24-hour boundary. Counting that endpoint adds 5 old requests or 1 new request. Visibility resumes add one refresh each; time spent hidden removes scheduled requests. Slow requests are skipped rather than overlapped.

One read-only sample on September 9, 2026 UTC measured these uncompressed JSON body sizes using explicit projections:

| Original source | Rows | Bytes |
| --- | ---: | ---: |
| v_asset_points_latest | 279 | 109,930 |
| v_ch2_dashboard | 1 | 547 |
| ch2_latest raw registers | 51 | 9,394 |
| v_ch3_dashboard | 1 | 628 |
| ch3_latest raw registers | 51 | 9,384 |
| Total | 383 | 129,883 |

Because the old point/dashboard requests used SELECT *, this is a conservative projected baseline, not an exact captured old wire response. The compact 13-column/five-row JSON serialization from that sample was 1,588 bytes (approximately 1.6 KB). Actual PostgREST timestamp/number formatting may differ slightly. This is a local projection estimate, not a response from the then-undeployed new view.

That is about 98.78% less body data per refresh. At normal intervals, the estimated polling-only totals are at least 2,244,378,240 bytes/day (2.24 GB) before versus about 9,146,880 bytes/day (9.15 MB) after: approximately 99.59% less uncompressed body data. This excludes HTTP/TLS headers, compression, Realtime messages and event-triggered fetches; it is not a prediction of billed egress. Real usage should be measured after deployment.

## Files changed

- client/package.json, client/package-lock.json: test command and PGlite development dependency.
- client/src/App.jsx: two lazy barrel detail routes.
- client/src/components/monitoring/BarrelIllustration.jsx: compact mode, unique SVG IDs, NULL handling, diagnostic labels hidden in overview.
- client/src/hooks/useMonitoringPolling.js: React lifecycle adapter.
- client/src/utils/monitoringPolling.js: shared guarded/visible scheduler.
- client/src/utils/monitoringColumns.js: explicit projections.
- client/src/utils/barrelMonitoring.js: confirmed source mapping and freshness-gated status.
- client/src/pages/MonitoringNJPage.jsx: compact single-source overview.
- client/src/pages/Chiller1HMIPage.jsx, Chiller2HMIPage.jsx, Chiller3HMIPage.jsx: controlled detail polling and explicit fields.
- client/src/pages/BarrelDetailPage.jsx: on-route barrel diagnostics.
- client/tests/monitoring-overview.test.mjs, client/tests/monitoring-polling.test.mjs: SQL and lifecycle verification.
- supabase/add_nj_monitoring_overview.sql: exact view definition and public read grant.
- docs/nj-monitoring-egress.md: this report.

## Original review preparation (historical)

Fetched origin and directly verified remote main at cf7fc99893781455c1af16a8f7df24036d9e57c9. Git rebase origin/main reported that codex/nj-monitoring-egress was already up to date; no conflicts or rewritten optimization commits were necessary. The original optimization commit 6bd82cffdb528e028086ee338e3e8f441f40f42d remains in branch history, and the main ZKT bridge/recovery files are unchanged. Added a migration reapplication test covering its stable five-row contract and security_invoker setting. Production migration/frontend deployment and PR merge were excluded from that original review task. The later CH2 production release is recorded above.
