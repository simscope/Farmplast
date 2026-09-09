# Source reconstruction assessment — 2026-09-08

Candidate v2 is editable and buildable. It is **not production-equivalence verified**
and was not deployed. Historical EXE SHA256:
`5A45D0F09506336D4A771C79EE942DDF407B12AAD54607B4DAF5BE39030DFF60`.

## Evidence and recovery

Static pkg-compatible snapshot extraction: 659 virtual entries, 579 stored-content
entries, 181 source maps and 102 embedded dependency source texts. The main entry
`C:\snapshot\zkt-bridge\bridge.cjs` has only 60336 bytes of cached V8 bytecode
(SHA256 `99e64ea84bbd337b70b66f3cdcbc1455dee687c40b2db874334e3a6fc603b8a5`).
The other bytecode-only entry is `node_modules/tslib/tslib.js`. No main source map
was found. No bytecode was executed or represented as exact decompiled source.

The private inventory classifies stored readable source, generated dependency
source, bytecode, metadata and unavailable entries and records file hashes. Raw
extracted dependencies, bytecode and source maps remain outside Git. The preserved
old local implementation is not authoritative; it supplies only explicitly marked
hypotheses for gaps in the recovered bytecode strings. No historical files were
overwritten. The public extractor makes the analysis repeatable with the private
historical binary; it does not distribute that binary or raw SDK assets.

All 20 embedded package versions match EMBEDDED-PACKAGES.json. Direct dependencies
are @supabase/supabase-js 2.105.1, cross-fetch 4.1.0, dotenv 16.6.1 and ws 8.20.0.
HTTP and process spawning use Node built-ins. Candidate package-lock.json pins the
new dependency resolution; it is not a recovered historical lockfile.

## Behavior comparison

MATCHED below means the documented contract or recovered literal schema is
implemented and exercised offline. It does **not** mean a hardware equivalence test.

| Behavior | Classification | Evidence and limits |
| --- | --- | --- |
| test | MATCHED | Recovered Connect_Net/status/serial/firmware calls and JSON fields; mock dispatcher passes. Device outcome UNKNOWN. |
| sync_one_employee | MATCHED / UNKNOWN | Required payload, wrapper, COM argument order and employee status update implemented. Name fallback/truncation, privilege normalization and firmware effects need comparison. |
| pull_attendance | MATCHED / UNKNOWN | Recovered read calls, row fields, idempotent conflict key and processing RPC implemented. Live counts, local timezone/DST and device interpretation unverified. |
| Queue polling/wake | MATCHED | pending NJ rows; 300000ms fallback; existing realtime channel/event and INSERT subscription. Live delivery untested. |
| States | MATCHED / INTENTIONALLY IMPROVED | pending -> running -> done/error; conditional atomic claim and picked_at ownership protect concurrent writers. SDK ok=false becomes error. |
| PowerShell architecture | MATCHED | Explicit SysWOW64 executable; local mock script confirms 32-bit process. Real COM unavailable locally. |
| Deadlines | INTENTIONALLY IMPROVED | Command abort, child kill, confirmed close, cleanup and persistent halt after uncertainty. Force-kill cannot guarantee device re-enable. |
| Result/error schemas | MATCHED / INTENTIONALLY IMPROVED | Known successful structures retained; errors redacted and stored, RPC errors preserved in processed. Full historical error variants UNKNOWN. |
| Duplicate/recovery behavior | INTENTIONALLY IMPROVED | One v2 worker per machine, serialized SDK access, durable result journal and no blind SDK replay. Cannot exclude a historical worker. |
| Optional HTTP | INTENTIONALLY IMPROVED | Loopback-only health/wake, token required for wake. Captured production HTTP was disabled. |
| Other bytecode command names | UNKNOWN | Bulk sync, verify and delete names exist but are not reconstructed; unsupported commands fail explicitly. |

Known limits: failed attendance rows are counted as skipped; inserted counts accepted
rows, including idempotent duplicates, rather than new database inserts. A DB outage
can postpone terminal writes. Journals recover only owned work and do not repair all
historical running rows. Auto pulls are serialized and persisted per local day/hour.
An uncertain crash stops subsequent SDK activity for operator inspection. A command
already draining may finish outside working hours. These limits are documented,
not claimed to be fixed through frontend timeouts.

## Verification

Static JS and PowerShell parsing, unit tests and offline packaged integration pass.
Coverage includes dispatch, validation, state transitions, conditional claims,
terminal-write retry without SDK replay, uncertain-crash halt, timeout cleanup,
32-bit PowerShell boundary, JSON/redaction, wake coalescing, auto-pull state and
Supabase query construction. EXE tests cover embedded Node18.5.0 x64, mock commands,
default configuration refusal, duplicate worker refusal, loopback health and shutdown.
No real COM, Supabase production query or device operation was executed.

Build outputs are ignored. See BUILD.md for the pinned toolchain and commands.
Final executable hash and repeat-build result are recorded in the task report and
local build manifest. A controlled side-by-side comparison using an isolated test
database and spare device is required before any future production replacement.

Final canonical validation: 16/16 unit tests passed; JS and PowerShell syntax passed; packaged offline integration passed. Two consecutive canonical builds produced the identical SHA256 `0b79da13793a4e2ba3f8605d0ef48d5b2872ce90ff9a3cb73f1e53740898770a`. The historical EXE hash was rechecked unchanged.
