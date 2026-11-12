# CH2/CH3 Realtime OTA: controlled hardware validation

**Status: preparation only; physical validation NOT RUN. PR #19 remains draft and must not be merged.**

Test one physical controller first (CH2 unless the owner selects CH3). Keep the other controller out of the test. Do not proceed to the second controller until the first has a reviewed passing record. This document authorizes no deployment, publication, flashing, or remote installation by the preparation agent. A hardware operator must obtain the normal maintenance authorization for those later actions.

## Build and environment prerequisites

1. Record controller asset ID, model, device code, current firmware, source commit, network arrangement, PLC address, operator, and UTC start time. Arrange physical access, serial recovery, a known-good device-specific image, and an approved recovery plan. Record any deliberate power cycle separately from unexplained resets.
2. The backend serving this controller must already have the PR #19 migration and compatible Edge Function under separately approved deployment. Confirm device registration, correct device key, valid CA/time, public device-scoped Broadcast availability, and operator access. **If this prerequisite is absent, stop: do not deploy it as part of this package.** Prefer an isolated approved bench environment. The checked-in firmware endpoints identify the existing project; do not assume changing a shell variable redirects the controller.
3. Confirm there is **no nonterminal OTA job** for the test controller and no other operator will queue one during A–D. A wake is not permission to install, but the authenticated sync it triggers can discover an already queued job. Inspect the full job table, not just the latest five UI rows. Read-only SQL in the approved project's SQL editor:

   ```sql
   select id, device, status, progress, failure, expires_at
   from public.chiller_ota_jobs
   where device in ('ESP32-CH2-PLC', 'ESP32-CH3-PLC')
     and status not in ('completed', 'failed')
   order by created_at;
   ```

   Resolve existing work through the approved operating procedure; this guide does not cancel or modify jobs. Recheck before C and D.
4. Use Arduino ESP32 **3.3.8**, **WebSockets 2.7.2**, **ArduinoJson 7.4.2**, and FQBN `esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default`. Do not upgrade dependencies, enlarge partitions, disable CA verification, or change network/OTA timing to make a test pass.
5. The delivered binaries were compiled with **example credentials and configuration**. They are compile evidence, **not flash-ready images**. For the actual controller, prepare ignored `secrets.h`, `network_config.h`, and `ota_config.h` using the approved private configuration and a unique version. In the local ignored `ota_config.h` only, add:

   ```cpp
   #define CHILLER_RUNTIME_DIAGNOSTICS 1
   ```

   The checked-in default remains `0`. Fallback remains **3,600,000 ms**, wake debounce **30,000 ms**, and active OTA reporting **15,000 ms**. This package does not provide a shortened fallback override.
6. Compile and immediately run the post-link size/partition/identity/mode gate below. A successful Arduino compile alone is insufficient: reserve **at least 65,536 bytes (64 KiB)** in each **1,310,720-byte** OTA slot. This is a conservative build acceptance floor, not proof of runtime heap safety. Total image size is only available after linking, so the limit is enforced at that point. Repeat the gate for the privately configured physical-test build and for the safe OTA target image.

   PowerShell, from the repository root (set paths to the pinned local installations):

   ```powershell
   $cli = 'C:\Users\Owner\Documents\farmplast\.arduino-cli\arduino-cli.exe'
   $config = 'C:\Users\Owner\Documents\farmplast\arduino-cli-user-ide.yaml'
   $libs = 'C:\Users\Owner\Documents\farmplast\ota-wake-libraries'
   $n = 2 # Change to 3 only for the later CH3 build/test.
   $build = "C:\Users\Owner\Documents\farmplast\physical-runtime-ch$n"
   & $cli core list --config-file $config
   Get-Content "$libs\WebSockets\library.properties" | Select-String '^version='
   Get-Content "$libs\ArduinoJson\library.properties" | Select-String '^version='
   # STOP unless versions exactly match the pinned versions above.
   & $cli compile --config-file $config --fqbn 'esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default' --libraries $libs --build-path $build "firmware/Chiller$n"
   if ($LASTEXITCODE -ne 0) { throw 'Compile failed' }
   $version = 'REPLACE_WITH_EXACT_LOCAL_CHILLER_OTA_VERSION'
   node firmware/validate-chiller-runtime-build.mjs "ESP32-CH$n-PLC" "$build/Chiller$n.ino.bin" "$build/Chiller$n.ino.partitions.bin" $version "$build/runtime-build-manifest.json"
   if ($LASTEXITCODE -ne 0) { throw 'Reject image: diagnostic build gate failed' }
   ```

   The gate refuses an existing output manifest; use a new evidence directory for each build. It requires the PR #19 partition binary SHA-256 `148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1` (app0 at `0x10000`, app1 at `0x150000`, both `0x140000`). It never uploads or flashes anything. With `--production`, it instead requires diagnostic markers to be absent.
7. Under separate hardware authorization, load the correct diagnostic build through the approved device procedure. Keep the PLC Ethernet link intact. Begin serial capture at **115200 baud before boot**, adding host UTC timestamps to every line. Do not open a serial monitor that silently resets the board without recording that reset. Keep the original raw capture; do not record private build configuration, HTTP headers, credentials, tokens, signed URLs, or firmware download URLs.

## Evidence and counter meanings

Capture the diagnostic startup banner, every `[RUNTIME]` line, every `[OTA]` checkpoint and its following `resources` line, reset reason, restored phase/failure, existing PLC/telemetry outcome lines, and the operator's timestamped network/wake actions. Collect backend request times, operation name, device, HTTP outcome, job state transitions, and firmware version/boot identity from telemetry, excluding sensitive request/response bodies.

The compact health line is emitted approximately every **60 seconds**, including during a long download when its loop is running. Blocking operations can delay a line; compare host timestamps as well as device uptime. Exact fields:

```text
uptime_ms free_heap min_free_heap largest_free_block realtime_worker_stack_hwm
realtime_connected realtime_connection_attempts realtime_connections realtime_reconnect_count
realtime_wake_received realtime_wake_accepted realtime_wake_debounced realtime_wake_ignored
ota_sync_count telemetry_post_ok telemetry_post_fail telemetry_post_skipped
plc_poll_ok plc_poll_fail wifi_rssi
ota_fallback_remaining_ms ota_sync_pending realtime_paused
```

- Heap values and stack HWM are **bytes** for this ESP32 core. `free_heap` is current 8-bit-capable heap; `min_free_heap` is the allocator's lifetime low-water value since boot; `largest_free_block` measures the largest currently contiguous block. A lifetime minimum does not rise after recovery. Track current free/largest values separately.
- `realtime_worker_stack_hwm` is the worker's own lifetime unused-stack minimum, sampled by that worker about once a second. Zero before its first sample is unavailable, not evidence of zero usable stack. The existing `realtime_connected` checkpoint also measures the worker stack. Other OTA checkpoint `stack_hwm_bytes` values belong to the main/OTA task, **not** the worker.
- `realtime_connected=1` means the Phoenix channel join was acknowledged, not merely that TCP opened. Connection attempts count disconnected transport entries into the existing socket connection loop. `realtime_connections` counts successful channel joins, and reconnect count counts subsequent joins after the first; intentional OTA WSS shutdowns also cause reconnects. Reconnect count is not an outage count.
- Received wakes are parsed Broadcast `wake` frames seen while joined. Wrong target/topic frames delivered to this socket increment `realtime_wake_ignored`. Correct-target wakes coalesced while the atomic request is already pending, or rejected by the existing 30-second scheduler debounce, increment `realtime_wake_debounced`. Accepted counts scheduler acceptances. A wake on another controller's topic normally is not delivered at all. Network-lost wakes cannot be counted. Cross-task counters are individual atomic snapshots; reconcile totals after the burst settles.
- `ota_sync_count` counts existing credential-bearing sync calls after their readiness guards, including HTTP/authentication failures. It is **not proof that the server authenticated the call**; match it to server evidence. Boot sync, hourly fallback, active job/progress/terminal reports all contribute.
- Telemetry `ok` and `fail` count actual result handling; missing data/time are counted separately as `skipped`. PLC counters count completed successful/failed polls. Counters reset at boot and wrap naturally as uint32; compute deltas modulo 2^32. RSSI is dBm; `-127` means Wi-Fi disconnected.
- `ota_fallback_remaining_ms` is time remaining since the scheduler's last attempt, clamped at zero; it is not a new timer. `ota_sync_pending` includes boot/wake requests. Zero remaining with no pending wake still means fallback is due. `realtime_paused=1` is the worker's TLS shutdown acknowledgement.

## Phase A — normal operation, at least 30 minutes

1. Confirm the diagnostic banner, correct device/version, expected reset reason, one boot sync, successful `realtime_connected`, and no active job. Let startup settle before starting the 30-minute observation window.
2. Leave the controller connected to its normal PLC, with normal telemetry. Do not manually refresh OTA status during the traffic-count window. Record health lines and backend device-sync traffic continuously for **at least 30 minutes**.
3. Verify no idle 15-second `chiller-ota` requests. A boot or elapsed-hour fallback sync is expected; distinguish device sync from operator status requests. The existing telemetry POST interval is 15 seconds and PLC poll target is 2 seconds; these are not OTA discovery calls.
4. Confirm PLC successes and telemetry successes continue, backend telemetry stays fresh, no reset/watchdog occurs, and `realtime_connected` stays joined except an explained scheduled sync. Measure successful-poll gaps and successful-telemetry gaps from serial/server timestamps; counters alone can conceal stalls.
5. Compare early and late settled 10-minute windows of current free heap and largest block. Neither should show a sustained downward trend. Record observed minima, medians, normal fluctuation ranges, worker HWM, and maximum polling/post gaps. These measured ranges are the reference for B–E.

## Phase B — reconnect stress

1. Keep PLC Ethernet/power connected. Interrupt only this controller's Wi-Fi Internet path using the bench AP/client rule; do not disrupt the other controller or the PLC network.
2. Perform five cycles, with outage durations **15, 60, 180, 60, 15 seconds**. Timestamp start and restoration. Between cycles wait until Realtime is joined, telemetry succeeds, and then collect at least **three consecutive one-minute health lines** in the recovered state.
3. Require automatic reconnect and telemetry recovery without a controller reset. Use a two-minute observation limit after Wi-Fi, DNS, time, and Supabase connectivity are confirmed restored; if recovery exceeds it, preserve evidence and hold acceptance for investigation rather than rebooting to clear the symptom.
4. PLC polling must continue during each outage. Expected offline telemetry failures do not by themselves fail the test. Compare PLC success rate and maximum gaps against A, accounting for measured existing blocking HTTPS timeouts. Any new persistent stall, watchdog, or unexplained reset fails acceptance.
5. Connection attempts may grow with backoff; **reconnect alone must not increase `ota_sync_count` or generate an Edge-call storm**. Explain any boot/hourly/active-report overlap using timestamps. Recovered free heap/largest-block ranges should return to the A envelope without progressively lower recovered plateaus across cycles. Retain all samples, including failed reconnects.

## Phase C — wake only, no installation

1. Recheck the no-nonterminal-job prerequisite and operator queue freeze. Confirm joined Realtime. Wait at least 31 seconds after any prior accepted wake, keep well away from the hourly deadline, and record a fresh health baseline. Do not use the UI **queue/update** operation in this phase.
2. Use the existing Broadcast REST API only. The following operator-run PowerShell helper sends **no job or firmware data**, and does not call the queue API. Preload the approved project's `CHILLER_WAKE_PROJECT_URL` and server-side `CHILLER_WAKE_SERVICE_ROLE_KEY` into this operator process securely; never place the key in the document, shell history, firmware, screenshots, or serial log. Verify the URL matches the controller's configured backend. Do not use shell tracing.

   ```powershell
   function Send-BenchWake([string]$TopicDevice, [string]$PayloadDevice, [int]$Count = 1) {
     $allowed = @('ESP32-CH2-PLC', 'ESP32-CH3-PLC')
     if ($TopicDevice -notin $allowed -or $PayloadDevice -notin $allowed -or $Count -lt 1 -or $Count -gt 10) { throw 'Invalid wake arguments' }
     $origin = $env:CHILLER_WAKE_PROJECT_URL
     $key = $env:CHILLER_WAKE_SERVICE_ROLE_KEY
     if ($origin -notmatch '^https://[a-z0-9-]+\.supabase\.co$' -or -not $key) { throw 'Approved URL/key required in process environment' }
     $headers = @{ apikey = $key; Authorization = "Bearer $key" }
     $body = @{ messages = @(@{ topic = "chiller-ota-wake:$TopicDevice"; event = 'wake'; payload = @{ device = $PayloadDevice }; private = $false }) } | ConvertTo-Json -Depth 5 -Compress
     $timer = [Diagnostics.Stopwatch]::StartNew()
     for ($i = 0; $i -lt $Count; $i++) {
       try { $null = Invoke-RestMethod -Uri "$origin/realtime/v1/api/broadcast" -Method Post -Headers $headers -ContentType 'application/json' -Body $body }
       catch { throw 'Broadcast request failed; retain HTTP status privately, do not print headers/body' }
       Write-Output "$([DateTime]::UtcNow.ToString('o')) wake topic=$TopicDevice target=$PayloadDevice sent=$($i+1)"
       if ($timer.Elapsed.TotalSeconds -ge 25) { throw 'Burst too slow: timing trial invalid; wait 31 seconds and repeat' }
       if ($i -lt ($Count - 1)) { Start-Sleep -Milliseconds 400 }
     }
   }
   # Example for the sole controller under test:
   Send-BenchWake 'ESP32-CH2-PLC' 'ESP32-CH2-PLC'
   ```

3. Wait for the resulting resource checkpoint and next health line. Require received +1, accepted +1, **exactly one successful authenticated no-job sync**, no manifest/download/install, and normal telemetry/PLC afterward. The sync temporarily closes WSS; wait for its rejoin before the next trial.
4. After a fresh baseline and at least 31 seconds since the accepted wake, send ten wakes within 25 seconds using `Send-BenchWake 'ESP32-CH2-PLC' 'ESP32-CH2-PLC' 10`. Require **accepted +1 and sync +1** across the entire burst and the next settled health line. Delivered duplicates must be debounced; some broadcasts can be lost while WSS is intentionally closed, so do not require received +10.
5. To prove debounce on **delivered** duplicates, after the first accepted wake and WSS rejoin send another small burst while still inside its 30-second debounce window. Require received to rise and debounced to rise, with no further accepted/sync increment. If rejoin took 30 seconds or all duplicates were lost, the debounce trial is **inconclusive**, not passed; repeat under stable connectivity. Then send a wake after 31 seconds and confirm a new single accepted sync, proving debounce is not permanently suppressing requests.
6. Device targeting, still testing just one physical controller: send the other device's wake to the other topic (for CH2, `Send-BenchWake 'ESP32-CH3-PLC' 'ESP32-CH3-PLC'`). Require no CH2 wake/sync delta. The other physical controller must be isolated from these test broadcasts, or use an approved isolated backend with only the test controller connected. Then deliberately send a wrong-device payload on the test controller's subscribed topic: `Send-BenchWake 'ESP32-CH2-PLC' 'ESP32-CH3-PLC'`. Require received +1, ignored +1, accepted/sync unchanged. Repeat with CH2/CH3 exchanged when CH3 is tested later. This latter trial proves payload targeting independently of channel routing.
7. Recheck there was no job transition, manifest, download, or installation. Any unexpected job discovery stops C and requires investigation.

## Phase D — lost wake / fallback, full production hour

No firmware job is queued in this phase. Use health `ota_fallback_remaining_ms` to schedule the observation; every accepted scheduler sync resets its last-attempt time.

1. After C settles, leave the controller running until about **two minutes before** the next one-hour fallback deadline. Confirm no pending wake/job. Record normal PLC/telemetry and the countdown.
2. Make Realtime unavailable by disabling this controller's Wi-Fi uplink, preserving PLC Ethernet. Keep it unavailable until **at least two minutes after** the deadline. Send no wakes. Require continuing PLC success, no reboot/watchdog, `realtime_connected=0`, and fallback remaining reaching/staying zero. Telemetry attempts can fail while offline; counters and the PLC loop must continue.
3. Restore the uplink. The due scheduler must perform **one authenticated fallback sync as soon as its existing Wi-Fi/time/readiness checks permit**, without a received/accepted wake. Require `ota_sync_count` +1, a matching server sync, countdown returning near one hour, automatic Realtime rejoin, and telemetry recovery. Observe for another five minutes: no 15-second idle sync loop. This exercises a lost wake and a due fallback held safely across network loss.
4. If an approved isolated bench can suspend only its Realtime service while keeping Edge/REST available, additionally repeat a full-hour run with that service unavailable: require ordinary telemetry and PLC to continue and a fallback sync at the hour while Realtime remains unavailable. Use that bench's documented service control, scoped to the test environment. Do not block all Supabase port 443 traffic and call it a Realtime-only test; WSS and HTTPS share it. Do not disable production-wide Realtime or change TLS verification. If no such isolated control exists, record this variant as not run; the mandatory network-loss/due-fallback test above must still pass.

## Phase E — one real safe OTA, only after A–D pass

1. Obtain the hardware owner's approval of A–D evidence and of one device/model-specific safe target firmware. Build the target with the same pinned toolchain/partitions and **diagnostics enabled** so post-reboot resources remain observable. Give it a distinct version, validate SHA/image identity and the 64 KiB build gate, and follow the separately approved release/queue procedure. This preparation task does not publish that image or issue the queue action.
2. Capture a fresh `[RUNTIME]` line **immediately before** the queue/wake and record its timestamp. Freeze other operator actions, then queue exactly one safe update using the existing authenticated operator flow. Do not manually install a manifest, bypass authorization, or weaken hash/model/version checks.
3. Correlate evidence in order: **Realtime wake → authenticated sync → manifest → download → SHA verification → install → reboot → new-version telemetry → completed**. Save job ID, approved image hash/version, each phase time, reset reason, and server confirmation. A client sync counter alone is insufficient to prove authorization or completion.
4. Capture these heap snapshots (each named checkpoint is followed by the reused `[OTA] resources` line):

   | Point | Evidence |
   |---|---|
   | Before wake | Fresh health line immediately before queue/broadcast; record age in seconds |
   | Wake consumed, before pause request | `runtime_wake_received_before_pause`; this is **after receipt**, not a substitute for the pre-wake baseline |
   | WSS fully released | `runtime_after_wss_disconnect`, after worker shutdown acknowledgement, before authenticated sync TLS allocation |
   | Before download HTTPS allocation | `runtime_before_https_download` |
   | Download HTTPS active | `runtime_download_open`, after response checks; `runtime_download_first_chunk`, at first actual data read |
   | During a longer transfer | `runtime_during_download` on the existing 15-second progress-report cadence, plus minute health lines if transfer lasts that long |
   | After reboot | `reset_reason`, `runtime_boot`, new `realtime_connected`, subsequent health lines, and backend telemetry with the new version/boot identity |

   Short transfers may finish before a 15-second progress checkpoint; the first-chunk checkpoint still captures live transfer heap. The last worker HWM remains available while WSS is paused. Record whether each sample is loop-task or worker-task stack data.
5. The existing updater suspends the ordinary PLC/telemetry loop during actual flash transfer/install. Record this planned OTA gap separately; do not claim the diagnostic changes make polling continuous during flash. Require PLC and telemetry to resume after reboot and completed status to follow confirmed new-version telemetry. Observe the updated controller for **at least 15 further minutes**.

## Acceptance and stop conditions

Do not mark PR #19 ready to merge until the evidence for the first controller is reviewed and all items pass; repeat on the other model before claiming CH2/CH3 hardware validation as a whole. Preparation, compile success, counter unit tests, or a wake-only test are not hardware acceptance.

- No unexplained ESP reboot, watchdog reset, panic, TLS allocation failure, or unexplained prolonged PLC stall. Planned OTA reboot is explicitly accounted for.
- No sustained current-heap leak or progressive largest-block collapse during A, successive recovered B windows, D, or post-OTA observation. Compare equivalent connected/idle windows, not TLS-active against TLS-paused samples. A steadily falling sequence of recovered plateaus requires investigation even if free heap remains large. Lifetime minimum heap/HWM falling once and then stabilizing is not by itself a leak.
- PLC polling remains functional in A–D and resumes after E; telemetry is continuous when Internet is available and recovers after outages/OTA. Report maximum gaps and failures, not only success totals. An unexplained gap or materially worse recovered rate than A holds acceptance pending investigation.
- Realtime rejoins after all outages; reconnects alone produce no Edge sync storm. Actual TLS coexistence is demonstrated by successful normal telemetry while Realtime is joined.
- Delivered duplicate wakes are debounced; device/channel targeting works; hourly fallback stays armed and executes without a wake.
- One actual authorized OTA verifies SHA, installs, reboots, reports the expected new firmware, and reaches server-confirmed `completed`.
- Record **minimum observed free heap, allocator minimum free heap, largest free block, and worker stack HWM**, by phase and boot. Also record main-task HWM separately. A 60-second sample cannot establish an unsampled instantaneous largest-block minimum; include transition samples and retain that limitation. The worker's existing 60,000-byte connection-entry guard is not a runtime safety certificate. Any near-exhaustion or unresolved fragmentation/stack concern needs engineering review, not a lower acceptance threshold.

Use one results record per controller, with no prefilled PASS values:

```text
controller_asset_id,device,model,operator,UTC_start,UTC_end
source_commit,toolchain_versions,FQBN,app_sha256,app_bytes,partition_sha256,slot_headroom_bytes
diagnostic_version,OTA_target_version,OTA_target_sha256,job_id
phase,boot_identity,planned_action_UTC,action_duration_s,result(PASS/FAIL/NOT_RUN/INCONCLUSIVE)
sample_count,min_sampled_free_heap,min_allocator_free_heap,min_sampled_largest_block,min_worker_stack_hwm,min_loop_stack_hwm
early_free_heap_median,late_free_heap_median,early_largest_block_median,late_largest_block_median
max_PLC_success_gap_s,max_telemetry_success_gap_s,reconnect_recovery_s
counter_start,counter_end,server_device_sync_count,reset_reason,unexpected_resets,watchdog_events
serial_log_path,backend_evidence_path,exceptions,reviewer,review_time
```

Stop the physical test and retain logs on any unexplained reboot/watchdog, unexpected job/install, persistent PLC failure, unresolved resource decline, wrong-device acceptance, or integrity/security failure. Restore service only through the approved recovery plan. Do not change production intervals/security as a workaround. PR #19 stays draft until hardware evidence resolves the blocker.

## Preparation results

The original `realtime_connected` resources checkpoint was sufficient for connection-time heap/worker-stack snapshots, but not for periodic trends or cumulative outcome counts. It is retained. Default-off diagnostics add atomic counters, a minute health line, worker stack sampling, and the transition checkpoints listed above. No new network requests, tasks, production timers, partition changes, or authorization rules are introduced. Diagnostic logging has some serial/CPU cost and is intentionally absent by default.

Measured compile-only image results are recorded in the accompanying package manifests and the table below. **No physical phase has been executed by this preparation task.**

| Compile-only build | App `.bin` bytes | OTA slot headroom | Above 64 KiB floor | Static RAM bytes |
|---|---:|---:|---:|---:|
| CH2 diagnostic | 1,229,984 | 80,736 | 15,200 | 49,528 |
| CH3 diagnostic | 1,229,984 | 80,736 | 15,200 | 49,528 |
| CH2 default-off verification | 1,228,256 | 82,464 | 16,928 | 49,456 |
| CH3 default-off verification | 1,228,240 | 82,480 | 16,944 | 49,456 |

The prior PR #19 CH2/CH3 images were 1,228,240 / 1,228,224 bytes respectively; diagnostics add 1,744 / 1,760 image bytes and 72 static RAM bytes. Live TLS heap and task-stack allocation are additional and still require hardware measurement. The Arduino summary's generic flash percentage is not an OTA-slot limit; these numbers use the complete app `.bin` against the actual 0x140000 slot.

Both default-off verification builds also pass the image/partition gate with diagnostic markers absent and original static RAM usage. Their app images are 16 bytes larger than the prior PR builds; the mode-enabled increment relative to these new default-off builds is 1,728 / 1,744 bytes. No production timing or security constants changed. Local diagnostic flag overrides were removed after preserving the diagnostic package.

Compile-only example identities: CH2 `ch2-secure-1-diag1`, CH3 `ch3-secure-1`. Neither is a new production release. Diagnostic SHA-256: CH2 `e40e8577b05a38721c5b8c9da1a358ba752a2bb5fea9a076e6dd2adabf984dfe`; CH3 `e266fa4a938079c5d0c1634a6a760cf24bdbc26ba4d0c5490b16ede1c3917ed0`. Rebuild with an approved unique test version/private configuration and revalidate; different configuration can change image size.

Validation: 78/78 automated tests pass, including diagnostic join/reconnect accounting, wake counter wrapping, minute throttling/millis wrapping, and the exact 64 KiB image boundary. Changed JavaScript passes explicit no-unused-vars/no-undef lint. Existing frontend tests can emit Vite shutdown/dependency-scan warnings while all tests pass. No hardware result is inferred from these checks.
