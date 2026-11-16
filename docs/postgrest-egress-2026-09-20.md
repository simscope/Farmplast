# PostgREST egress investigation — 20 September 2026

## Finding and completion limit

**No high-volume frontend reader was active in the captured production window. This PR reduces potential frontend response bodies, but does not establish or eliminate the source of the reported 60–90 MB/day billed PostgREST egress.** It must not be presented as a completed production-egress fix.

Production API Gateway logs were available through the authenticated Supabase dashboard. They show that device writes and device-sync RPCs dominate requests. The successful responses with logged Content-Length add up to only about **2.34 MB per 24 hours**, not 60–90 MB. There is no evidence that changing the NJ overview, legacy ChillersPage, payroll, ZKT, or HMI polling will materially reduce the current observed bill. No production mutation or deployment was performed.

The missing evidence is per-endpoint **billed network bytes**, including how Supabase accounts for headers/transport and any traffic outside these gateway records. Request volume alone cannot establish the byte ranking. Network overhead is a hypothesis, not a measured root cause. Supabase's [egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress) distinguishes network egress from application responses and says gateway logs do not provide response-byte accounting. The logged Content-Length headers below are useful body evidence, not billing counters.

## Scope and provenance

- Repository baseline: `372d329` (main, PR #15 merged); isolated branch `codex/postgrest-egress`.
- Project: `eeobivvwjzakbweluwtm`, farmplast. No other project included.
- Initial last-hour moving query around 20:44 UTC: telemetry 2,070; CH1 sync 714; CH2 ingest 238; diagnostic sync 240; ZKT pending reads 12. Exact moving bounds were not saved.
- Initial last-24-hours moving query around 20:44–20:45 UTC: telemetry 49,976; CH1 sync 17,159; diagnostic sync 5,759; CH2 ingest 5,756; ZKT reads 310. All these successful response lengths were present. Full successful body total, including profiles and attendance-processing RPC, was 2,339,064 bytes.
- Reproducible fixed near-day window: **2026-09-19 20:50:00 UTC <= timestamp < 2026-09-20 20:40:00 UTC**, 23 h 50 m. Queried while the Last 24 hours preset still covered this range. All rows grouped before applying LIMIT 80; only 14 groups returned.
- Fixed-hour caller window: **2026-09-20 19:40:00–20:40:00 UTC**, ending before this investigation's measurement GETs.
- Public telemetry measurements: 20:47:15–20:47:16 UTC, outside both fixed windows. Ten GETs only; no device or service-role secrets used or recorded.
- User's partial-day usage snapshot: PostgREST 59.595 MB, Functions 1.194 MB, Realtime 54.922 KB. Usage dashboard project filter was verified. Daily billing cutoff/timezone and refresh lag do not align exactly with the log window; do not directly subtract these figures from the fixed-window body total.

## Actual traffic, ranked by observed request volume

All paths below start with `/rest/v1/`. Decimal MB = bytes / 1,000,000. Rates use the fixed near-day window; MB/day extrapolates its logged bodies by 1440/1430. These are **not billed MB/day**.

| Endpoint | Method/status | Fixed hour requests | Near-day requests | Near-day requests/hour | Bytes per successful response | Body MB/day |
|---|---|---:|---:|---:|---:|---:|
| `telemetry_latest?on_conflict=point_id` | POST 200 | 2,078 | 49,637 | 2,082.67 | 0 | 0 |
| `rpc/ch1_device_sync` | POST 200 | 714 | 17,040 | 714.97 | 95 | 1.63012 |
| `rpc/chiller_device_sync_diagnostic` | POST 200 | 240 | 5,720 | 240.00 | 53 | 0.30528 |
| `rpc/ingest_ch2` | POST 200 | 240 | 5,718 | 239.92 | 70 | 0.40306 |
| `zkt_bridge_commands` | GET 200 | 12 | 308 | 12.92 | 2 (`[]`) | 0.000620 |
| `zkt_attendance_logs` | POST 201 | 0 | 75 | 3.15 | 0 | 0 |
| `profiles` | GET 200 | 0 | 3 | 0.126 | 2 | 0.000006 |
| `rpc/process_zkt_attendance_to_work_logs` | POST 200 | 0 | 2 | 0.084 | 93 | 0.000187 |
| `zkt_attendance_logs` | POST 500 | 0 | 2 | 0.084 | Missing length | Unknown |
| All monitoring GET endpoints below | GET | 0 | 0 | 0 | See measured potential below | 0 observed |

Near-day logged successful PostgREST bodies total **2,323,028 bytes**. There are also three profiles OPTIONS requests without a length, two Realtime handshakes, one auth POST and one auth OPTIONS, and one admin network-ban read. Auth/admin/Realtime are excluded from the body table. No Storage paths occurred in this gateway sample; that does not establish zero billed Storage usage.

Zero observed monitoring endpoints: `v_asset_points_latest`, `v_nj_monitoring_overview`, `ch2_latest`, `ch3_latest`, `v_ch2_dashboard`, `v_ch3_dashboard`. Also no `rpc/ingest_ch3` in this window; absence does not prove device health or firmware identity.

Caller evidence in the fixed hour:

- `telemetry_latest`: `ESP32HTTPClient`, exact `Prefer: resolution=merge-duplicates,return=minimal`. Request bodies 2,244–7,903 bytes are **ingress**, not response egress. The aggregate ~2,083/hour is not attributable to CH1 alone; nominal CH1 publication is 720/hour. Other device publishers cannot be uniquely identified from this user agent.
- `ingest_ch2`: `ESP32HTTPClient`, `Prefer: return=minimal`, request 1,044–1,045 bytes. The scalar JSON RPC still returns 70 bytes; the header does not remove a function's explicit JSON return value. This is only ~0.4 MB/day and was not changed.
- `ch1_device_sync` / diagnostic sync: `Deno/2.1.4 ... SupabaseEdgeRuntime`, matching the Edge handlers' internal PostgREST RPCs. They count in the PostgREST request inventory independently of the Functions response to a device. Do not infer that the 2% Functions slice makes their internal database traffic disappear.
- ZKT: `undici`, `select=id,command,payload,created_at&status=eq.pending&order=created_at.asc&limit=1`. No bulk export pattern or employee/payroll reads beyond profiles and attendance processing.

The earlier September 10 report's continuous CH1 GET (~713/hour) is **absent now**. Its historical 23 MB/day body estimate must not be carried forward into this investigation.

## Repository-wide reader inventory

Searched tracked frontend, hooks, components, scripts, bridge, firmware, Edge handlers, and SQL for `.from`, `.select`, `.rpc`, direct `/rest/v1/`, `.single`, `.maybeSingle`, intervals, timeouts and loops. There is no separate route-level refresh scheduler. `useEmployeeList` only filters/sorts local state. AccountingPage and ChillersPage have no imports/routes in `App.jsx`; `rg ChillersPage client/src` finds only its declaration. The production build has no ChillersPage chunk.

### Repeating reads

The monitoring scheduler uses a per-mounted-page in-flight guard shared by manual/timer/visibility refresh, aborts on unmount, removes timers/listeners, defers initial work to avoid the abandoned StrictMode effect, pauses when hidden, and immediately refreshes when visible unless an existing request is still running. There is no cross-tab cache; two visible windows can independently request identical data. Route elements are mutually exclusive in one app mount. An already-started request may finish after the page becomes hidden.

| Reader/source | Projection and filters | Cadence | Hidden / overlap / duplicates | Smaller replacement / observed impact |
|---|---|---|---|---|
| Legacy `ChillersPage` / `v_asset_points_latest` | Before `*`, OR CH2/CH3 wildcard; after `point_code,value_number,value_boolean,updated_at`, exact 38 displayed codes | 10s | Before hidden continued and manual/timer could overlap; after shared scheduler. Currently unrouted | 319,980 -> 1,320 identity bytes. **Zero actual requests** |
| CH1 HMI / `v_asset_points_latest` | `POINT_DETAIL_COLUMNS` (15 explicit fields in `monitoringColumns.js`), `asset_code=CH-NJ-01`, display order | 5s | Shared scheduler; status call belongs to same guarded cycle | Measured 7,783 bytes; 134.49 MB/day identity if visible all day, zero observed. A dedicated compact HMI projection is a future candidate, not the current bill |
| Barrel details / `v_asset_points_latest` | 12 fields: asset code/name/type, point code/name, data type, number/bool/text, unit, updated_at, display order; mapped single barrel asset | 5s | Shared scheduler; separate tabs independent | All diagnostic points are displayed; no measured production activity, payload not sampled |
| CH2/CH3 HMI dashboard views | 16 explicit fields: asset/device, system running, six compressor flags, entering/leaving, two flow, two evap-out, latest timestamp; `.single()` | 5s | Shared scheduler, concurrent dashboard/raw/status within one guarded cycle | 395/401 bytes; fallbacks remain required, zero observed |
| CH2/CH3 latest registers | Before 7 fields; after `value_number,raw_register,raw_value`; IN 40023,40024,40025,40051,40052,40056,40057,40061; register order | 5s | Same guard and AbortSignal as dashboard; raw/dashboard overlap in values intentionally preserves fallback behavior | 1,480 -> 480 / 1,476 -> 476 bytes; zero observed |
| NJ overview | Exact 13 fields in `OVERVIEW_COLUMNS`, five-row view, asset order | 15s | Shared scheduler | Already compact; 1,601 measured bytes, zero observed |
| CH1 device control | Current `ch1_device_sync` JSON RPC via Edge, returns compact `c,o,a,r,q`; legacy fallback GET selects point_code,number,bool, 9 command codes on CH1 asset | Nominal 5s | Device loop; no browser visibility; serialized HTTP | Current RPC 95 bytes. Legacy GET absent. No control/frequency changes |
| CH2/CH3 device OTA sync | `chiller_device_sync` or diagnostic variant, device/version/boot/job/status/progress and optional diagnostic; compact JSON return | Nominal 15s | Device main loop, no browser visibility, sync/OTA guards | 53 bytes observed on diagnostic variant; no firmware changes |
| CH1 HMI status's internal PostgREST | releases `id,version,size,sha256` approved limit20; device `version,boot_id,last_seen` single; latest5 jobs with release version; desired `values,revision,updated_at` single; latest5 commands with requested/status/times; last completed `updated_at` single. Reconcile RPC and expiry update return no needed rows | Per visible 5s status cycle and manual refresh | Browser guard; separate Edge invocations may overlap across clients; no global cache | Narrower combined RPC possible, but no status reads observed. Functions response bytes kept separate |
| CH2/CH3 HMI status's internal PostgREST | releases approved+device limit20, device single, latest5 jobs+release version, last completed single; field lists in handler lines75–78; expire RPC | Per visible 5s status cycle and manual refresh | Same as CH1 status | Already bounded. Zero observed; no caching that could delay programming state |
| ZKT bridge pending | `id,command,payload,created_at`; pending, oldest first, limit1 | Default 300s + event/HTTP wake; operating-hour filter | Headless. Worker singleton/serialized wake, timeout AbortSignal, cleanup on close. Other physical bridge installs cannot be excluded | Measured 2 bytes; ~0.00062 MB/day, preserve ZKT |
| Dashboard command wait | `id,command,status,result,error,created_at,picked_at,finished_at`; exact command ID, `.single()` | One query then 1s sleep; maximum120 or300 attempts per operator action | Hidden continues; sequential per loop; no unmount abort; independent commands could overlap | Active-command result can be large. Zero observed; not altered |
| Dashboard employee refresh after Realtime | Presence view's explicit identity/payroll/ZKT/presence fields; current-week work logs 7 fields, not deleted; employee metadata 7 fields by returned IDs; tax profiles `*` by IDs | Initial mount, user edits, each attendance/employee event | Hidden event refresh remains; no shared in-flight guard; one attendance batch can trigger duplicate reloads | Potential amplification but **no observed reads**. Projection/coalescing candidate if active traffic appears; no unsupported attribution to tiny Realtime slice |
| AuthContext profile | profiles `*`, auth user ID, `.maybeSingle()` | Initial session + auth-state callbacks | No visibility/in-flight guard; startup callbacks may duplicate; one shared AuthProvider | 3 reads / 6 bytes observed; not dominant |

### User-triggered and navigation reads (no steady polling)

| Sources | Queries / bounds / repetition |
|---|---|
| `EmployeesPage` | All employee fields, number order, on mount and after CRUD; no timer. Multiple refreshes can overlap; not visibility-gated |
| `EmployeeDetailsPage` | Employee + tax profile `*` by ID `.maybeSingle`; nondeleted work logs `*` by employee; payments `*` by employee, date order; deductions five amount fields for exact employee/period `.maybeSingle`, fallback range. Mount/ID/period changes and actions reload; no timer, no shared guard. Payment-only refresh duplicates the page's payment query when invoked |
| `EmployeePayStubPage` | Employee/tax profile `*` by ID `.maybeSingle`; work logs `*` by employee and requested period; five deduction fields exact period `.maybeSingle`; explicit12 payment fields for employee/year-to-period. Effect on parameters, no timer; may duplicate earlier details-page reads during navigation |
| `PayrollReport` | Work logs `*` for selected week/nondeleted; six deduction fields by employee IDs/exact period; payments `*` for selected employee IDs. Report/print/export actions, no timer; payment history could be bounded server-side in future |
| `DashboardPage` payroll actions | Previous-week nondeleted logs `*` limit10000; tries up to three legacy deduction tables `*` limit10000, filters dates client-side; explicit12 prior-payment fields year-to-week limit10000; company `id,company_name` for selected company IDs. Manual report/check actions, no timer; possible large reads but none observed |
| `EmployeeModal` | Companies `id,company_name,active,created_at`, active list; company insert returns same fields `.single`; open/action driven |
| `paymentHistory` utility | `id,paid_at,created_at` for one employee and exact period, newest first, limit1. Lookup before payment upsert; no timer |
| `BackupPage` / `backupExport` | Manual admin button, `*` over 11 configured tables in sequential pages of1000 until short page. Storage metadata recursively lists folders, separate Storage service. No scheduled export; UI loading disables repeated clicks. Full rows are intentional for backup |
| Photo compression CLI | One employee query selecting id,number,name,photo URL where photo nonnull; subsequent downloads/uploads are Storage. Explicit operator invocation, not background |
| ZKT command execution | One employee's explicit ZKT fields `.single`; claim/finish updates return `id`; attendance upserts minimal; attendance-processing RPC returns summary. Scheduled attendance/commands only; bounded worker |
| Mutation RPCs / returning writes | Payroll create/mark-printed/void check, rebuild work-log day, attendance processing; employee/tax saves returning `*` single; create command returns four fields single. All operator actions, no continuous read loop |
| OTA actions | Authorization attempt, queue, control request/reconcile, observation and grant/event writes; user/device action driven, not export loops. Storage signed manifests/binary verification belong to Storage. No new request loops introduced |

Detailed field strings remain next to the queries in the named source files; none of these payroll/employee records were downloaded for measurement. Large personal-data reads were unnecessary because gateway counts already ruled them out for the window.

## Changes and measured before/after

1. Legacy ChillersPage uses the existing polling hook with stable callback, shared manual refresh, hidden pause/resume, in-flight guard, AbortSignal, guarded state updates and cleanup. Query selects four consumed fields and only all displayed codes (including running/alarm fallback codes). Route remains unmounted; no deletion or new navigation.
2. CH2/CH3 raw reads remove point_code, point_name, value_boolean and per-row updated_at, which the rendering/decoding never consumes. Keep raw_register, raw_value and value_number fallback; keep dashboard freshness and all eight registers. No interval, schema, firmware, SQL, RLS or security changes.
3. Added a credential-safe, read-only measurement script and regression tests. Tests exercise the actual Supabase query builder with mock fetch, exact displayed-code coverage, visibility/restore, overlap, StrictMode abandoned setup, abort/cleanup and page wiring.

Run from `client`: `node --env-file=.env scripts/measure-postgrest-egress.mjs`. Results are in `postgrest-payload-measurements.json`. Each is a single production sample; values/timestamp string lengths can change. `Accept-Encoding: identity` ensures reproducible uncompressed body measurement. `localGzipBytes` is a local compression comparison, **not measured HTTP/billed bytes**.

| Changed query | Requests/hour before -> after (visible) | Hidden before -> after | Identity bytes before -> after | Identity MB/day before -> after, one visible page 24h | Local gzip bytes before -> after |
|---|---:|---:|---:|---:|---:|
| Legacy points | 360 -> 360 | Nominal360 -> 0 (browser timer throttling may reduce old rate) | 319,980 -> 1,320 | 2,764.63 -> 11.40 | 11,365 -> 187 |
| CH2 raw | 720 -> 720 | 0 -> 0 | 1,480 -> 480 | 25.57 -> 8.29 | 275 -> 146 |
| CH3 raw | 720 -> 720 | 0 -> 0 | 1,476 -> 476 | 25.51 -> 8.23 | 278 -> 147 |

CH2 total direct PostgREST (dashboard + raw): **32.40 -> 15.12 MB/day identity**, 53.3% less. CH3: **32.43 -> 15.15 MB/day**, 53.3% less. Each retains1,440 direct requests/hour when visible; Edge-internal status queries are additional and unchanged. These rates exclude initial/manual/visibility refreshes and slow-network skips. Multiply by actual visible hours /24 and number of windows for a scenario estimate. Both raw-reader changes save17.28 MB/day identity per continuously visible page; local-gzip comparisons are ~2.23 and2.26 MB/day. Neither estimate is a billed-usage forecast.

**Observed-window saving attributable to this PR: 0 bytes**, because all changed readers had zero production requests. Unrouted legacy capacity savings must never be claimed as realized bill savings. Current dominant known response-body endpoints are the small sync/ingest RPCs; cutting them would not explain the missing tens of MB and could affect equipment control. They remain unchanged.

## Service separation

- PostgREST: direct browser/device REST plus Edge handlers' internal REST; measured above.
- Functions: outgoing handler responses are a separate service category, user snapshot1.194 MB; not added to PostgREST estimates.
- Realtime: user snapshot54.922 KB; two gateway handshakes do not measure message bytes. No subscription changes.
- Storage: photos/OTA downloads and metadata calls; no Storage values mixed into REST savings.

## Validation and next production steps

- `npm test`:65 passed,0 failed.
- `npm run lint`:0 errors,6 pre-existing warnings in ChillerIllustration (2), AuthContext (2), EmployeeDetailsPage (2); untouched.
- `npm run build`:passed; existing `/fonts/micr.ttf` unresolved-at-build-time warning preserved. No legacy-page bundle confirms routing evidence.
- No SQL migration, Edge deployment, firmware update, PLC/Modbus change, history deletion, telemetry cadence change or ZKT disablement is required by this PR.
- After review, the frontend changes alone can be deployed through the normal frontend process. Nothing was merged or deployed in this task.
- **To close the original success criterion:** obtain Supabase's billed PostgREST byte attribution for an aligned UTC window, including response headers/transport, internal service traffic and the completeness of gateway logs. Reconcile against the count/Content-Length aggregates before selecting a device/network fix. The two500 attendance responses have unknown body lengths; do not convert missing lengths into zeros. Request accounting evidence rather than reducing ESP intervals or changing hardware behavior speculatively.

Suggested support question (not sent): “For farmplast project eeobivvwjzakbweluwtm, September 20 PostgREST usage is about 60–90 MB/day, while a near-day gateway aggregate has 78,508 REST requests and only 2,323,028 known successful response-body bytes, with no monitoring GETs. Can you supply endpoint-level billed network bytes and clarify whether headers/TLS/internal traffic are included and whether this gateway stream is complete? Reproduction query attached.”
