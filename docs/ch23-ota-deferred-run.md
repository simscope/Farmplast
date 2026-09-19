# Deferred CH2/CH3 manifest execution

Base main: `ea15da604bad092e67c8b4d4a551fda81bf77305`.

The previous call flow was:

`serviceOta -> chillerDeviceSync(false) -> otaDecode -> otaRun ->
otaStage(authorized) -> otaSave -> chillerDeviceSync(true)`.

The initial sync had called `http.end()`, but its stack frame, TLS client,
HTTP client, response String and result JsonDocument were still alive when
the authorized-stage HTTPS request began. This is an architecture issue;
it does not establish the reset cause of the observed failed update.

The new flow is:

`serviceOta -> chillerDeviceSync(false) -> otaDecode -> otaQueueDecodedJob
-> return (initial HTTP/TLS/JSON locals destroyed) -> chillerOtaRunPending
-> consume pending flag -> otaRun -> otaStage(authorized)`.

Both sketches call the same common pending runner immediately after the normal
sync returns. No additional task, concurrency, timer or polling loop is introduced.
The single pending slot owns an OtaJob with Arduino String values for id,
version, SHA and URL, plus size and expiry. String moves transfer ownership;
no JSON references escape. Only authenticated decoded jobs can reach the queue.
An occupied queue cannot be overwritten and current job IDs are rejected.
Consumption clears the stored job and pending flag before execution; the
existing otaRun/NVS replay guard remains unchanged even when execution fails.

## Serial diagnostics

Safe UUID-filtered job ID accompanies `manifest_decoded`. Rare checkpoints
are `manifest_decoded`, `manifest_queued`, `deferred_run_begin`,
`authorized_save_begin`, `authorized_save_ok`, `authorized_sync_begin`,
and `authorized_sync_ok`. Success markers follow successful calls; an ACK
changing the phase to failed does not print authorized_sync_ok. Existing
failure codes remain authoritative.

Checkpoints print free/minimum free/largest allocatable 8-bit heap bytes using
the installed ESP-IDF heap_caps APIs. When
`INCLUDE_uxTaskGetStackHighWaterMark` is enabled they also print the current
loop-task stack high-water mark. ESP-IDF's installed task.h specifies bytes,
not upstream FreeRTOS words. Reset logging includes both the existing name
and raw numeric esp_reset_reason value. All diagnostics remain Serial-only;
no URLs, HMACs, keys or HTTP payloads are logged or added to NVS/backend data.

## Evidence and boundaries

Job `bc078dab-66af-46b7-af3d-f1ae38cab09f`, target `ch2-secure-2-diag1`,
failed with `interrupted_update`. On 2026-09-18 UTC its events were:

| Time | Event |
| --- | --- |
| 15:13:45.252428 | authorized |
| 15:13:55.087930 | manifest_selected |
| 15:13:55.463044 | manifest_signed_and_returned |
| 15:14:15.514793 | device_report_failed |
| 15:14:15.514793 | failed |
| 15:14:15.514793 | failure_code:interrupted_update |

The device returned to the old image, ch2-secure-1-diag1, without a recorded
device_report_authorized or subsequent download/verification/install report.
The evidence places the interruption after manifest delivery and before the
authorized-stage acknowledgement completed. The exact reset cause remains
unknown pending reset_reason/checkpoint evidence. PR #14's confirmed telemetry
POST classification fix is retained; it is not claimed to explain this reboot.

The download HTTP stream still remains open during periodic updating syncs.
That separate nested-network pattern is explicitly deferred to a later review.
This change does not redesign otaInstall, timeouts, authentication/HMAC, signed
URLs, NVS format, failure-code allowlist, stages, rollback, partitions or the
15-second sync cadence. No backend, Storage, release or device operation is
part of this PR.

## Validation

The existing tests remain, including POST isolation and OTA diagnostic guards.
Seven additional tests execute the actual pending/service/transition statements
with mocked network/JSON boundaries. They check return-before-run ordering,
ownership, single consumption, duplicate and invalid rejection, failed initial
sync, terminal ACK persistence and precise authorized-stage checkpoints.
Both sketches passed compile validation with ESP32 Arduino 3.3.8,
WT32-ETH01, DIO 40 MHz and the unchanged default dual-OTA layout.
CH2 application: 1,133,392 bytes, slot headroom 177,328 bytes.
CH3 application: 1,133,376 bytes, slot headroom 177,344 bytes.
Both OTA slots remain 1,310,720 bytes; partition binaries match PR #14 builds.
The complete client suite passed 60/60 tests. Lint reported zero errors and
six existing hook warnings. The presentation test emitted its existing non-fatal
Vite scan/server-close diagnostic. `git diff --check` passed. Protected function
bodies (decode/HMAC, install/download, NVS save, run/replay and rollback) were
compared with base and are unchanged. Compile artifacts and private configuration
remain local; nothing was published as a firmware release or sent to a device.
