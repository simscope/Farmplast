# CH1 control and OTA implementation

## Control path

Chiller1HMIPage sends `op: command` to the authenticated `ch1-ota` Edge Function. The function verifies the Supabase user and operator allowlist, validates command values and, for RESET, verifies the operator PIN with rate limiting. `ch1_control_request` atomically updates `ch1_desired_state` and records the pending command. It rejects an offline ESP, another pending command, an active OTA job or invalid thresholds. The HMI does not update `telemetry_latest`.

The existing five-second `fetchCloudState -> ch1DeviceSync` request receives `c` (setpoint, D1, D2, hysteresis, AUTO, fan enable, 30 Hz, 60 Hz, false), `r` (desired revision), `q` (pending reset sequence or null), `o` (OTA manifest or null), and `a` (OTA acknowledgement or null). No full latest-view read occurs when this endpoint is configured. The optional disabled-OTA compatibility path filters the old view to nine consumed points.

MANUAL changes AUTO to false. Speed 30 sets AUTO=0, FAN_EN=1, FAN30=1, FAN60=0; speed 60 reverses the frequency bits. OFF clears all four bits. Existing auto-stage/hysteresis and GPIO functions remain. RESET retains the ten-second pulse, but now consumes a durable sequence once; a second request is a new sequence and waits for an active pulse to end. Metadata reports reset acknowledgement only after the GPIO write.

`ch1_control_reconcile` requires a matching reported revision and actual requested values, or the reported reset sequence. Null/malformed metadata does not confirm application. Pending commands time out after 45 seconds. Desired values remain the desired configuration after a confirmation timeout; a timeout means unconfirmed, not cancellation. The HMI distinguishes REQUESTED from ACTUAL and does not optimistically animate outputs.

## Telemetry JSON repair

ArduinoJson's String writer clears the destination at serialization start. The old helper incorrectly depended on an existing JSON-fragment prefix surviving this operation. All rows and gateway metadata are now complete JSON objects. Invalid optional metadata is omitted with a diagnostic, finite numbers only are included, allocation/serialization and array validation precede POST. The original nineteen point mappings remain, with invalid sensor values omitted as before.

One batch is published every five seconds using `/rest/v1/telemetry_latest?on_conflict=point_id` and `Prefer: resolution=merge-duplicates,return=minimal`. Production PRIMARY KEY(point_id) was verified. No return=representation or extra telemetry publisher was added. The historical approximately 2,003 telemetry POST/hour was aggregate activity, not established CH1-only traffic; one nominal CH1 publisher is 720/hour.

## OTA authorization and installation

PROGRAM FIRMWARE opens a confirmation modal with target version and code. User JWT and allowlist are verified server-side. Five code attempts per 15 minutes, a five-minute single-use grant, exact-request idempotency, one active OTA job, online/current-version checks and audit logging are enforced. No owner code or privileged Supabase credential appears in the frontend.

The device authenticates the same five-second status exchange with a unique key. It downloads from the private Supabase bucket over CA-verified HTTPS, checks an HMAC-authenticated manifest binding job/model/version/size/hash/expiry, stages the inactive slot, verifies SHA-256 and validates the ESP application image before selecting it. This uses HMAC, not independent public-key Secure Boot signing.

Lifecycle: idle -> authorized -> downloading -> verifying -> installing -> rebooting -> waiting_for_telemetry -> completed, or failed. Progress during the blocking download uses the same exchange at five-second cadence plus bounded phase-transition reports; no second polling task exists. Persistent NVS stores the job, target, previous slot and phase atomically.

After reboot, normal Wi-Fi/sensor/control/publish setup resumes. A successful telemetry POST marks a pending image valid. The backend requires the target version, matching job and a new boot ID in actual CH1_ONLINE telemetry before completion. A heartbeat alone cannot report success. Interrupted downloads retain the old slot. If the new application runs but cannot publish for 120 seconds, previous-slot recovery reboots. Installed ESP32-S3 core 3.3.8 sdkconfig enables CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE; compilation explicitly requires it. USB bootloader/partition images must come from this build for the initial installation. Power-loss and physical relay/recovery behavior are not simulated by the automated tests and must be verified on hardware.

## Web polling and scope

The HMI shares one guarded five-second refresh for actual telemetry and command/OTA status. Hidden-tab refreshes pause; visibility return refreshes immediately; unmount cleans up. Ch1Programming has no independent polling timer or Realtime subscription. CH2, CH3, barrels, NJ overview and ZKT are unchanged.

The SQL migration is transactional and idempotent against its own schema. Desired state seeds once from existing CH1 values. New tables/functions are service-only with RLS; firmware storage is private, with a restrictive boundary against unrelated broad storage policies. `verify_jwt=false` is specific to this custom-auth endpoint; every non-preflight operation verifies either the device key or an operator token. Production schema and function deployment are authorized, while device flashing is reserved for the owner.

## Validation and physical acceptance

Node/PGlite tests cover command mappings, requested/actual acknowledgement, reset twice, offline rejection, timeout, authorization, manifest authentication, full OTA lifecycle, replay/expiry, new-boot telemetry proof, private storage and the existing NJ monitoring suite. `tests/ch1-browser.html` is an isolated local fixture for the real HMI, with mocked API and no production control requests. It exercises pending/applied, repeated reset, programming modal/progress/terminal states and offline guards. It is not part of the production build entry.

Build target: ESP32S3 Dev Module, Arduino ESP32 core 3.3.8, USB CDC On Boot Enabled, default dual OTA partitions, FQBN `esp32:esp32:esp32s3:CDCOnBoot=cdc`. Only Chiller1.ino belongs in the sketch folder. Keep existing Wi-Fi settings in ignored secrets.h. Production ota_config.h and binary images are private; do not commit them. Offline `firmware/prepare-ch1-release.mjs` checks the S3 application header, partition size and embedded version and produces initially unapproved metadata.

Physical acceptance, performed by the owner:

1. Install the supplied USB version with its matching bootloader and partitions, without a whole-chip erase. Select the ESP32-S3 port and enable USB CDC. Open Serial Monitor at 115200.
2. Expect `BOOT OK - CH1 monitoring gateway / JSON FIX`, `DEVICE SYNC revision=...`, `LOCAL JSON VALIDATION OK`, and `pushTelemetry HTTP=200` or `201`/`204`. No PGRST102 should appear. Confirm current version and live temperatures on Monitoring -> NJ -> Chiller 1.
3. Click MANUAL, wait for APPLIED, then 30 Hz. Expect `AUTO=0 ... FAN_EN=1 FAN30=1 FAN60=0`; verify the physical outputs and then the reported UI. Check 60 Hz, OFF, AUTO and tuning values under the site's normal operating procedure.
4. Use RESET ALERT with the owner's PIN, confirm the ten-second pulse and `RESET sequence=... accepted` / `RESET pulse started for 10 seconds.` Repeat after the first pulse ends; it must create a new sequence and pulse.
5. PROGRAM FIRMWARE -> select the approved next version -> enter the owner's code -> CONFIRM PROGRAMMING. Observe download, reboot and waiting for telemetry. Success must show only after the new firmware version and actual telemetry return.
6. Verify recovery/interruption on spare hardware before relying on unattended recovery. No physical output actuation, USB flash or production OTA job was performed by the agent.
