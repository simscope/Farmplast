# CH2/CH3 compact telemetry

## Production baseline

Base main: `4d01a0b7e0cd33b6738aa0e1dd79f62ac0e24b7b`.
Read-only production catalog audit: 2026-09-12, schema snapshot at
`2026-09-12T22:27:07.469743Z`, project `eeobivvwjzakbweluwtm`.
The exact `pg_get_functiondef` output for both ingest RPCs, dashboard/overview
definitions, column metadata, indexes, permissions, policies, point inventory and
dependency results are in `supabase/baselines/2026-09-12-ch23/`.
These are historical audit fixtures, **not migrations to apply**. No device secret
values or user records were read or exported.

Both latest tables contained 68 rows, each with a unique point code: 51 RAW rows
covering 40011–40061 and 17 named points. The JSON inventory records counts by
point code and register. Both have a point-code primary key, device/timestamp
indexes, enabled RLS and invoker-security dashboard views. Existing RPC ownership,
EXECUTE privileges, credential checks and transactional delete/insert behavior are
preserved. This change does not broaden access or redesign existing authentication.

Production CH3 is `CH-NJ-03 / ESP32-CH3-PLC` and deliberately uses the **CH2_** wire
point-code prefix. Its ingest function recognizes `CH2_R...`, not `CH3_R...`.
The live CH2/CH3 point maps agree. Setpoint and demand are additionally confirmed
by the production CH3 dashboard expressions for 40023 and 40061.

| Retained RAW register | Meaning | HMI multiplier |
| --- | --- | --- |
| 40023 | Process Setpoint | 0.1 |
| 40024 | Entering Fluid | 0.1 |
| 40025 | Leaving Fluid | 0.1 |
| 40051 | Flow C1 | 1 |
| 40052 | Flow C2 | 1 |
| 40056 | Evap Out C1 | 1 |
| 40057 | Evap Out C2 | 1 |
| 40061 | Demand Percent | 1 |

Keep seven `CH2_` status points: `SYSTEM_RUNNING` and
`COMP_1A_ENABLED`, `COMP_1B_ENABLED`, `COMP_1C_ENABLED`, `COMP_2A_ENABLED`,
`COMP_2B_ENABLED`, `COMP_2C_ENABLED`. Their PLC sources remain register 40011 bit 14,
40012 bits 8–10 and 40013 bits 8–10. Removing stored RAW copies of those registers
does not remove the decoded status points or authorize stopping their PLC reads.

Keep six named dashboard values: `CH2_CHILLER_ENTERING_F`,
`CH2_CHILLER_LEAVING_F`, `CH2_FLOW_C1_GPM`, `CH2_FLOW_C2_GPM`,
`CH2_EVAP_OUT_C1_F`, `CH2_EVAP_OUT_C2_F`.

Target: **21 rows per device** (8 RAW + 7 status + 6 numeric).
Remove 43 RAW rows: 40011–40022, 40026–40050, 40053–40055, 40058–40060.
Remove four named rows: `CH2_ONLINE`, `CH2_HEARTBEAT`,
`CH2_CAPACITY_C1_TONS`, `CH2_PROCESS_DELTA_T_F`.
The old point maps label capacity at 40055, while the old UI used 40053/40054;
none of these registers is retained or reinterpreted. Point-map metadata is left
unchanged for old-firmware compatibility.

## Dependencies and behavior

Repository-wide search found dashboard consumers on the two HMI routes and the
NJ overview; backup/export includes both latest tables. The generic ChillersPage
reads `v_asset_points_latest`, not either of these latest tables. Production
catalog dependencies are `v_ch2_dashboard`, `v_ch3_dashboard`, `v_ch2_latest`
(a projection with no heartbeat calculation), and `v_nj_monitoring_overview`.
Public function-body search found only `ingest_ch2` and `ingest_ch3` using these
tables/maps. No independent heartbeat consumer was found in this scope. This
audit cannot establish the absence of unknown external clients.

The migration retains dashboard column names, order and types. Unused heartbeat,
heartbeat timestamp, capacity and delta columns return typed NULL without reading
obsolete points. Required values and compressor states preserve their existing
expressions. Both dashboard `is_online` values use telemetry freshness; both HMI
pages and the NJ overview independently use `latest_updated_at > now() - interval
'45 seconds'`. Exactly 45 seconds is offline, and missing/invalid HMI timestamps
are offline. CH1 and barrel rules and the physical barrel swap are unchanged.

CH3 now matches CH2's six-card layout and explicit eight-register query. Each
detail refresh performs one dashboard request and one filtered latest request
every five seconds while visible. The existing shared guard, visibility refresh,
unmount cleanup and lack of Realtime remain unchanged. NJ overview remains one
compact request per 15 seconds and five rows / 13 columns.

`supabase/compact_ch2_ch3_latest.sql` accepts old payloads and skips unapproved
points **before value conversion**. It leaves authentication and the atomic RPC
transaction intact. DELETE is limited to the verified asset/device identities.
No history table, firmware modification or telemetry-frequency change is included.
Backup/export consequently reads the compact latest dataset without code changes.

## Release and verification

Merge/deploy the HMI first, then apply the migration. Its transaction takes a
bounded lock on the two latest tables; if the five-second lock timeout expires,
the transaction must roll back and be retried. Do not leave a failed transaction
open in a SQL client. Reapplying the migration is supported.

Tests load the exact production RPC/view definitions and catalog-derived table
fixtures, replay all 68 old points, apply the migration twice, replay old payloads
including malformed obsolete values, and verify 21 retained points, unchanged
required values, authentication, atomic failure, RLS/invoker security, and the
45-second boundary/overview contract. Production results are recorded separately
after deployment; local tests do not constitute a production ingestion check.

## Firmware / PR B prerequisite

The user confirmed the discovered `D:/Farmplast/chiller 2/ethernet/ethernet.ino`
and `D:/Farmplast/chiller 3/ethernet/ethernet.ino` are **not** the current deployed
sources. Do not derive OTA firmware from these files. PR B firmware implementation
requires the exact current sources, preserving each device's networking behavior.
No board has been flashed and no remote OTA has been tested as part of this PR.
