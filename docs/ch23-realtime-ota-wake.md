# CH2/CH3 Realtime OTA wake

Base: current `origin/main` eb3e3f5, including merged PRs #12–#15. No firmware was released, no controller flashed, no Edge Function deployed, and no production configuration changed.

## Confirmed overhead

CH2 and CH3 each invoked authenticated `chiller-ota` sync every 15 seconds even without a job: 5,760/device/day, 11,520 combined. Their HMI telemetry refresh also requested OTA status every five seconds. Telemetry POST intervals, PLC polling, ingestion functions, telemetry schemas, and dashboard telemetry refresh are unchanged.

New idle device budget is one attempt per hour per controller: 24/device/day, 48 combined, a 99.583% reduction in scheduled device OTA Edge invocations. This assumes continuous uptime and no wake events. A single boot report, active stage reports, actual update wakes, and operator status requests are additional. Realtime heartbeats use WebSocket messages, not Edge invocations. Browser idle usage is one status read on page mount plus explicit refresh/open actions; active jobs use five-second status reads and stop at completed/failed. Hidden pages do not issue OTA status requests and abort an in-flight status request.

## Architecture

1. Existing operator authentication, code unlock, device-scoped grant and atomic idempotent queue remain mandatory.
2. After the queue RPC commits, a separate atomic `chiller_ota_claim_wake` RPC inserts a unique `wake_claimed` audit event. Exact retries do not publish again. Queue failures never claim or broadcast.
3. Edge sends one bounded (3 second timeout) REST Broadcast to `chiller-ota-wake:ESP32-CH2-PLC` or `chiller-ota-wake:ESP32-CH3-PLC`, event `wake`, payload containing only `{device}`. Broadcast failure returns a successful queue result with `wake: fallback`; it does not undo the committed job. A crash after claiming can lose the wake; the hourly fallback is intentional recovery.
4. Each ESP32 maintains a CA-verified WSS connection on a dedicated 8,192-byte, priority-1 FreeRTOS worker. Only that worker accesses its WebSocket client. Phoenix join replies and 25-second heartbeat replies are checked; missing replies cause reconnect. Reconnect delay doubles from 1 to 60 seconds with up to 999ms jitter. Wi-Fi loss closes the connection. Low memory postpones connection attempts. No Realtime error restarts the controller.
5. Matching topic, event and device merely post an atomic flag. The loop task debounces wakes for 30 seconds (including across millis wrap) and invokes the existing authenticated sync. The worker asynchronously closes its TLS socket before the loop allocates sync/download TLS objects. The loop never waits synchronously for this shutdown: it continues PLC/telemetry work until the worker acknowledges. Worker allocation failure leaves fallback enabled.
6. The existing deferred manifest queue executes only after sync HTTP/TLS/JSON locals have been destroyed. Device secrets, HMAC, approved release, device/model/size checks, SHA-256, private bucket, signed URLs, job state validation, NVS failure reporting, rollback, and PR #12–#15 diagnostics remain. Active installation progress reports retain a 15-second interval. Reboot/telemetry recovery remains active, independent of wake.

This follows the ZKT bridge's notification-plus-authoritative-fetch concept (`client/zkt-bridge/src/bridge.cjs`, `zkt-bridge-command-wake`), without using the Node Supabase/WebSocket clients on ESP32.

## Required database and Realtime preparation (NOT applied)

Apply `supabase/chiller_ota_realtime_wake.sql` after the existing base, observability and failure-diagnostics migrations, before deploying the changed Edge Function. It is rerunnable and service-role-only, and preserves the current sync audit events.

The previous 45-second OTA-heartbeat queue requirement would reject healthy devices after polling removal. Queue and status now use the existing authenticated telemetry receipt (device/version/boot/received_at). Queue still requires a matching receipt less than 45 seconds old; no telemetry or ingest change is needed. Status still requires a prior authenticated OTA registration, and a single boot sync retains initialization and durable recovery/failure reporting. Reconnects do not generate sync requests.

Previously an undiscovered job expired after ten minutes. Newly queued jobs now have a 70-minute waiting deadline, so a lost wake can be discovered by hourly fallback. The first authenticated discovery sets `dispatched_at` and shortens expiry to at most ten minutes from discovery. Retries cannot extend it. Firmware's existing maximum manifest lifetime check remains unchanged. Release revocation and terminal-state expiry checks remain authoritative. Jobs queued before migration retain their shorter original deadlines.

Enable/retain Realtime public Broadcast channels for this project and allow outbound WSS port 443. No Postgres Changes publication, table replication, public firmware storage, or new device secret is required. Public topics contain no credentials or release metadata; the existing project anon key connects the socket. A holder of that public key could generate a wake, but cannot authorize an install; device debounce bounds wake-triggered syncs. If project policy prohibits public channels, private-channel receive-only authorization must be designed before deployment. Do not silently relax that project policy. Production settings have not been inspected or changed in this task.

Official protocol references: [Realtime protocol](https://supabase.com/docs/guides/realtime/protocol) and [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

## Dependency and resource validation

Use Links2004 WebSockets **2.7.2**, commit `8d0744eb5e916ec646d83bd1ffed5f643aab04d8` (LGPL-2.1), with ESP32 Arduino **3.3.8** and ArduinoJson **7.4.2**. No Supabase library is added to firmware. The library explicitly supports ESP32 and `beginSslWithCA`; the build uses the existing Supabase CA and never selects insecure TLS. Source: [WebSockets 2.7.2](https://github.com/Links2004/arduinoWebSockets/tree/2.7.2).

Compile command (same for each before/after sketch; no upload command):

```text
arduino-cli compile --config-file arduino-cli-user-ide.yaml --fqbn esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default --libraries ota-wake-libraries --build-path <separate-build-directory> <sketch-directory>
```

The library root contains pinned `WebSockets` and `ArduinoJson` checkouts. Use local `secrets.h`, `ota_config.h`, and `network_config.h` copied from the examples for compile-only validation. Do not flash these placeholder builds. Both before and after builds use the same examples and compiler settings. The baseline is archived directly from eb3e3f5. Compare actual application `.bin` length against the 1,310,720-byte slot, not the IDE's reported total flash maximum.

Final source commit: `9cd5aeb`. Both before and after CH2/CH3 builds pass with ESP32 Arduino 3.3.8, the same example configuration, and default dual-OTA partitions. These are compile-only images, not releases. Sizes below are actual application `.bin` bytes.

| Device | Before | After | Added | Free OTA slot before | Free OTA slot after |
| --- | ---: | ---: | ---: | ---: | ---: |
| CH2 | 1,133,136 | 1,228,240 | 95,104 | 177,584 | 82,480 |
| CH3 | 1,133,120 | 1,228,224 | 95,104 | 177,600 | 82,496 |

Both sketches: static RAM rises from **49,328 to 49,456 bytes** (+128). Both 1,310,720-byte OTA slots remain unchanged. Baseline/final partition binaries have identical SHA-256: `148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1`. The existing image validator accepts both baseline and final images for their expected device, example version, classic ESP32 chip and OTA size limit. Final images also contain the Realtime worker markers.

CH2 final compile-only application SHA-256: `1ba998dece0319cbf12c6cf73a582b762af1356b8cca159a4df4147d261f7d83`.
CH3 final compile-only application SHA-256: `49b0f2c7d047e7387a0961406312925357669b70d014965fd52d482accac0844`.

Static RAM figures do not include the worker's 8KiB stack, WebSocket allocations, or mbedTLS heap. Library WebSocket frames are bounded at 15KiB; application JSON accepts at most 2KiB and nesting depth eight. Connection starts only with a largest free heap block of at least 60,000 bytes. This threshold is a defensive gate, not proof of sufficient live heap. The new `realtime_connected` checkpoint reports free/minimum/largest heap and worker stack high-water mark alongside the preserved OTA checkpoints. The existing download's periodic progress HTTPS overlap is unchanged; Realtime TLS is released before that path.

Live minimum heap, fragmentation, TLS handshake peak, reconnect timing under packet loss, and concurrent telemetry/WSS endurance cannot be measured without running the changed image on hardware. No physical-device claim is made. Keep this PR as a draft until those acceptance checks are completed by an authorized follow-up. Verify repeated Wi-Fi/server outages, both device filters, lost-wake fallback, concurrent HTTPS telemetry and PLC sampling, update failure reporting and post-reboot confirmation, with safe test releases. The existing unresolved OTA reset cause documented in PR #15 is not claimed fixed here.

## CH1 analysis and proposed follow-up

CH1 is unchanged. In `firmware/Chiller1/Chiller1.ino`, `CLOUD_FETCH_MS=5000`; `fetchCloudState()` calls `ch1DeviceSync()`. In `Ch1Ota.h`, that endpoint returns nine desired-state values (setpoint, D1, D2, hysteresis, AUTO, fan enable/30/60, reset), a command revision and requested reset sequence, as well as OTA manifest/ack fields. During updates it also sends OTA stage/progress reports. These idle five-second requests are combined control delivery and OTA discovery, not removable OTA-only polling.

`Chiller1HMIPage.jsx` invokes `ch1-ota` `command` for operator controls and `status` during refresh to resolve pending commands against ESP acknowledgements/reported state. `Ch1Programming.jsx` uses unlock/queue for firmware. Status serves both programming and command feedback.

Follow-up design: publish device-scoped wakes after committed command revisions and after committed OTA queues; wake triggers authenticated combined sync, preserving monotonic revisions, reset-sequence deduplication and reported-state acknowledgement. Separate OTA status refresh from command status, but retain active command-ack refresh until success/timeout. Choose a control fallback interval from an explicitly agreed maximum command latency (not the CH2/CH3 one-hour OTA interval). Test missed/duplicate/out-of-order wakes, reconnect reconciliation, pending reset sequences, in-flight commands, failure/reboot behavior, all nine outputs and maximum control latency before altering CH1 polling.

## Validation

The full Node client/protocol/database suite passes 74/74 tests. Targeted ESLint on every changed client/test file passes with zero warnings/errors, and the Vite production build passes. Repository-wide ESLint has one pre-existing unused `downtimeEnabled` parameter error in `EmployeeDetailsPage.jsx` plus six existing hook warnings; that unrelated file is unchanged. `git diff --check` passes. Source comparisons confirm both PLC, telemetry POST, POST classification and main-loop bodies are unchanged, and the entire existing shared OTA engine differs only by the active interval constant name. Tests cover scheduler timing and wraparound, target isolation, duplicate debounce, queue/broadcast failure ordering and idempotency, browser visibility and terminal stop, database lost-wake waiting/dispatch expiry, receipt freshness and RPC permissions, plus existing authentication, diagnostics, deferred execution, telemetry and control tests. Firmware isolation tests inspect the actual worker/loop wiring; they are not physical PLC/network endurance tests.

## Exact files changed

- `firmware/Chiller2/Chiller2.ino`
- `firmware/Chiller3/Chiller3.ino`
- `firmware/common/ChillerOta.h`
- `firmware/common/ChillerOtaRealtime.h`
- `firmware/common/OtaWakeSchedule.h`
- `supabase/functions/chiller-ota/handler.mjs`
- `supabase/chiller_ota_realtime_wake.sql`
- `client/src/components/ChillerProgramming.jsx`
- `client/src/pages/Chiller2HMIPage.jsx`
- `client/src/pages/Chiller3HMIPage.jsx`
- `client/src/hooks/useOtaStatus.js`
- `client/src/utils/otaStatusPolling.js`
- `client/tests/chiller-ota.test.mjs`
- `client/tests/chiller-deferred-ota.test.mjs`
- `client/tests/ota-wake.test.mjs`
- `client/tests/programming-presentation.test.mjs`
- `docs/ch23-realtime-ota-wake.md`
