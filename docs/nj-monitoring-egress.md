# NJ monitoring egress reduction

Branch: codex/nj-monitoring-egress

Base: main at cf7fc99893781455c1af16a8f7df24036d9e57c9 (fresh clone of simscope/Farmplast).
The delivery message supplies the implementation commit SHA.

## Deployment status

Implementation and local verification are complete. The SQL migration has NOT been applied to the live Supabase database, and the frontend has NOT been deployed. Apply supabase/add_nj_monitoring_overview.sql before releasing the frontend; the overview deliberately has no fallback to the expensive sources. Existing SQL files use descriptive names directly under supabase/, which this migration follows.

Live read-only requests verified every selected column on v_asset_points_latest, telemetry_latest, ch2_latest, ch3_latest, v_ch2_dashboard and v_ch3_dashboard, plus the NJ assets, device codes, and relevant point codes. The repository does not contain the original definitions of these views/tables, and the public API does not expose their full DDL. Migration execution was tested in embedded PostgreSQL against fixtures using those verified columns, not against production. Production permissions and query plans should be checked when applying the migration.

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
| CH-NJ-02 | v_ch2_dashboard | Existing is_online, recalculated by the source view on every read |
| CH-NJ-03 | v_ch3_dashboard | Existing is_online, recalculated by the source view on every read |
| BARREL-NJ-01 | v_asset_points_latest, BARREL-NJ-02 | Explicit ONLINE bit when present, otherwise meaningful data; always gated by freshness |
| BARREL-NJ-02 | v_asset_points_latest, BARREL-NJ-01 | Same |

The barrel swap was explicitly confirmed by the user and is identical on overview and details. The live CH1 schema has CH1_COMP1/CH1_COMP2 only. Per user confirmation, these map to 1A/1B; the remaining four fields are NULL and display N/A. Missing data for supported compressor positions displays UNKNOWN. Barrel error state comes from HAS_ERROR, preserving NULL as unknown rather than implying normal. Zero material level remains valid.

The SQL expression updated_at > now() - interval '16 seconds' preserves the existing JavaScript floor(secondsAgo) <= 15 boundary. CH1 meaningful-data parity is tested against monitoringHelpers.getAssetStatus. Barrel detail uses the same existing 15-second threshold and explicitly gates stored ONLINE bits so a stopped ESP becomes offline. CH2/CH3 reuse their existing dashboard status; live reads confirmed both were offline with old timestamps. No competing client threshold is added for those dashboards.

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

CH3 raw reads accept its existing CH2_R prefix as well as CH3_R. Only verified dashboard columns are requested: CH2 does not have capacity_c2_tons, ch2_r40023 or system_demand_percent, so its existing raw-register values remain the source for those displays; CH3 retains its verified extra columns.

## Verification

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

Because the old point/dashboard requests used SELECT *, this is a conservative projected baseline, not an exact captured old wire response. The compact 13-column/five-row JSON serialization from that sample was 1,588 bytes (approximately 1.6 KB). Actual PostgREST timestamp/number formatting may differ slightly. This is a local projection estimate, not a response from the undeployed new view.

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

## Review preparation

Fetched origin and directly verified remote main at cf7fc99893781455c1af16a8f7df24036d9e57c9. Git rebase origin/main reported that codex/nj-monitoring-egress was already up to date; no conflicts or rewritten optimization commits were necessary. The original optimization commit 6bd82cffdb528e028086ee338e3e8f441f40f42d remains in branch history, and the main ZKT bridge/recovery files are unchanged. Added a migration reapplication test covering its stable five-row contract and security_invoker setting. Production migration/frontend deployment and PR merge are explicitly excluded from this review task.
