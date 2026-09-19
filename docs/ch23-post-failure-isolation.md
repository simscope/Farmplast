# Separate PLC sample availability from Internet POST failures

Base: `d5d595137ff276304886a0809d7c0d3a5d624219`.

Both CH2 and CH3 returned `false` from `postToSupabase()` when the PLC
sample was invalid or system time was not ready. Their callers passed this to
`handlePostResult(false)`, incrementing the Internet failure counter and invoking
hard Wi-Fi recovery at the second failure even though HTTP was never attempted.

The shared result enum distinguishes no-data/time skips, network unavailable,
HTTP/TLS failure and success. Skips log their cause and preserve the counter.
Real failures retain the existing recovery thresholds; success resets the counter.
Modbus polling, routing, addressing, intervals and all OTA code are unchanged.
The loop still services OTA after a failed PLC poll and skipped POST.

## Preserved production evidence (read-only capture)

Captured at `2026-09-18T15:17:59.122271Z`, before implementation.
Job: `bc078dab-66af-46b7-af3d-f1ae38cab09f`.
Release: `10642746-f581-4bad-9fb8-b918922be5e6` (`ch2-secure-2-diag1`).
Source boot: `49904edf4a2d27ce26a28d40dcbab6b9`.
Status: `failed`; progress: `0`; failure code: `interrupted_update`.
Deadline: `2026-09-18T15:23:45.252428Z`.

Complete recorded event timeline (UTC):

| Event ID | Timestamp | Event |
| --- | --- | --- |
| 33 | 2026-09-18T15:13:45.252428Z | authorized |
| 34 | 2026-09-18T15:13:55.087930Z | manifest_selected |
| 35 | 2026-09-18T15:13:55.463044Z | manifest_signed_and_returned |
| 36 | 2026-09-18T15:14:15.514793Z | device_report_failed |
| 37 | 2026-09-18T15:14:15.514793Z | failed |
| 38 | 2026-09-18T15:14:15.514793Z | failure_code:interrupted_update |

The raw snapshot is preserved privately outside Git as
`ch2-diag-ota-failure-evidence.json`. No job/history was modified.
`interrupted_update` does not establish the underlying interruption cause;
this fix addresses the independently confirmed POST classification bug.

## Validation and release boundary

Eight regression tests execute the firmware POST/handler/loop statements with
mocked PLC, clock and network boundaries, translating only C++ syntax needed
for the existing Node test runner. They cover skips with existing failure counts,
HTTP failure/recovery/success, offline Wi-Fi, failed HTTP initialization, and OTA
service after an invalid poll. These tests do not replace an ESP32 compile or a
hardware acceptance test. No new firmware target is built or released here.

Validation: 53/53 tests passed (including eight new regression tests); lint
reported zero errors and six existing frontend hook warnings. The presentation
test emitted a non-fatal Vite dependency-scan/server-close diagnostic; its tests
passed. `git diff --check` passed. Firmware compilation was deliberately not run.
