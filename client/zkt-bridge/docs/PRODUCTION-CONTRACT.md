# Evidence contract before reconstruction (2026-09-08)

Baseline EXE SHA256 5A45D0F09506336D4A771C79EE942DDF407B12AAD54607B4DAF5BE39030DFF60.
Evidence: verified UI/DB timelines in INCIDENT-20260908.md, captured manifest,
current DashboardPage.jsx, and read-only extraction of the EXE virtual filesystem.
No production mutations or executable execution were used for reconstruction.

## Recovery classification

Packager: Vercel/pkg-compatible, high confidence. PAYLOAD_POSITION=37574656,
PRELUDE_POSITION=46333045, snapshot entry C:\snapshot\zkt-bridge\bridge.cjs,
pkg bootstrap and STORE_BLOB/STORE_CONTENT-style entry layout. Exact historical
packager version is not embedded/proven. Candidate toolchain will pin pkg 5.8.1
and its pkg-fetch 3.4.2; locally preserved tooling and matching cached Node 18.5.0
provide evidence of compatibility, not proof of historical build invocation.

659 relative virtual entries inventoried; 579 have stored original content.
Two entries have bytecode without readable content. The main bridge.cjs is one:
60336 bytes, SHA256 99e64ea84bbd337b70b66f3cdcbc1455dee687c40b2db874334e3a6fc603b8a5.
Readable dependency JS is exact stored content; compiled dependency dist files
are generated upstream source. JSON is metadata; maps are retained when present.
Main JavaScript source is unavailable. PowerShell template fragments and function
names survive as bytecode strings; assembling fragments is reconstruction, not
exact source recovery. Raw extraction stays in the private analysis directory.

## Queue and command contracts

Table zkt_bridge_commands: id, command, payload, status, result, error, created_at,
picked_at, finished_at. NJ pending -> running -> done/error. Current UI routes PA
to pending_pa; candidate must never claim that status or execute PA payloads.
Atomic claim is an intentional improvement over non-atomic historical evidence.

test: payload ignored apart from optional plant_location guard. Exact recovered
PowerShell result: {ok,message:'ZKT official SDK connection OK',device:{ip,port,
machine},info:{userCount,logCount,serialNumber,firmware}}.

sync_one_employee: payload.employee_id (older candidate also accepted payload.id;
alias supported but not independently verified). Reads employees by ID; rejects
inactive or zkt_enabled=false. Result: {ok:true,message:'Single employee synced to
ZKT by official SDK',mode:'official_zkteco_sdk_com_32bit_powershell',employee_id,
employee_number,zkt_user_id,name,result:<SDK result>}. Updates zkt_sync_status to
verified_sdk, zkt_sync_error=null, zkt_synced_at. SDK result fields are directly
recoverable: ok,message,errorCode,user:{userId,name,passwordSet,privilege,cardNo,
enabled},sdk:{cardResult,setResult,refreshResult}. Raw passwords are never returned.

Field names and SSR_SetUserInfo argument ordering are present in baseline bytecode.
Fallback user ID to employee_number, name fallback/truncation to 24 characters,
privilege 14->3/clamp 0..3 and local-time timestamp conversion are corroborated by
preserved old source but NOT proven from bytecode control flow. They are candidate
assumptions requiring a controlled comparison, not claimed verified equivalence.

pull_attendance: uses ReadGeneralLogData/SSR_GetGeneralLogData, returns userId,
deviceUserId,timestamp,verifyMode,inOutMode,workCode records from PowerShell. Maps
to zkt_attendance_logs employee_number,punch_time,raw. Recovered conflict key is
employee_number,punch_time with ignoreDuplicates. Captured lookback 3 days, batches
50, failed batches retry row-by-row (idempotent upsert only). Calls
process_zkt_attendance_to_work_logs. Known wrapper {ok,message,mode,total,inserted,
skipped,processed}; inserted historically counts accepted rows, not actual new DB
inserts. RPC failure is represented in processed. No deletion or log clearing.

Fallback polling is 300000ms. Realtime channel zkt-bridge-command-wake, broadcast
event wake, plus postgres_changes INSERT on public.zkt_bridge_commands. Work hours
08:00-21:00; auto pulls 08:00/20:00 with persisted local-day state. Candidate keeps
these defaults, serializes all SDK access and coalesces wake requests without
losing wakeups while a drain is active. Optional /health and /wake are evidenced;
HTTP disabled in captured production. Candidate binds optional HTTP to loopback
and requires wake token; this tightens an otherwise configurable bind boundary.

Captured command and child limits both 300000ms. Promise timeout cancellation
semantics are not proven by extracted constants. Candidate uses AbortSignal through
SDK and DB operations, waits for child termination before another command, journals
ownership/results and retries only terminal DB writes. It never blindly reexecutes
an uncertain SDK operation. It cannot repair running rows owned by unknown workers
or guarantee a DB terminal write during an outage; the journal preserves recovery.

## ZKT boundary

32-bit C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe;
ProgID zkemkeeper.ZKEM; Connect_Net(ip,port), machine=1, captured 192.168.22.201:4370.
EnableDevice(machine,false) after connect, then re-enable and Disconnect in finally.
Employee: optional SetStrCardNumber, SSR_SetUserInfo(machine,userId,name,password,
privilege,enabled), RefreshData. Test: GetDeviceStatus types 2 and 6, serial/firmware.
Attendance loop method and output shapes recovered as readable literal fragments.
GetLastError obtains SDK errorCode. Candidate throws on ok=false so DB uses error
rather than historical done-with-ok=false. Forced process termination may prevent
finally; candidate stops further SDK work after timeout pending operator inspection.
Real COM, device side effects, firmware-specific mapping and DST ambiguity remain
UNKNOWN until controlled non-production comparison with the historical baseline.

Dependencies directly recovered: @supabase/supabase-js 2.105.1, cross-fetch 4.1.0,
dotenv 16.6.1, ws 8.20.0. HTTP/fs/os/path/child_process are Node built-ins.
All transitive embedded package versions are in EMBEDDED-PACKAGES.json; candidate
will pin direct dependencies and use a checked-in npm lockfile for its own build.

Candidate must default to offline operation and require explicit --live plus
ZKT_V2_ALLOW_LIVE=true and an explicit configuration path for live adapters.
It is NOT a production replacement approved for deployment.
