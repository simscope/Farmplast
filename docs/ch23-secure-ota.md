# CH2 / CH3 secure Internet programming

## Provenance and scope

CH2 baseline is AUTHORITATIVE, physically deployed, and SHA-256 verified:
`f3e7552bc0df31691947408dc67d7bf08538baed3565252e91066010792a054e`.
Owner source: `C:/Users/Owner/Downloads/CH2_WT32_PRODUCTION_v2_0_3/CH2_WT32_PRODUCTION_v2_0_3.ino`.
The credential-free baseline is `firmware/baselines/Chiller2-v2.0.3.sanitized.ino`
(SHA-256 `7c66bd95190ff5610af312706f83ac4692d24737f1f473033472a647cdabcc59`).
`firmware/Chiller2/Chiller2.ino` derives from it with the authorized telemetry and OTA changes.
Neither the old D:/ sources nor v2.0.4_5SEC were used.

CH3 has no physical deployed device. New CH3 firmware was intentionally derived
from the verified CH2 production baseline. CH3 uses its own device identity,
ingest endpoint, hostname, release model, OTA key and ingest secret. Both ingests
retain the existing `CH2_` point-code prefix; the asset/device distinguish them.
CH1 source, backend and UI behavior are untouched.

## Telemetry and networking

Both targets publish every 15 seconds with `Prefer: return=minimal`: eight RAW
points (40023, 40024, 40025, 40051, 40052, 40056, 40057, 40061), system-running and
six compressor states. Capacity, delta-T and heartbeat are no longer transmitted.
The small gateway metadata accompanies the same POST. No history is introduced.
The backend preserves PR A's 21-point compatibility allowlist and ignores obsolete
legacy payload fields; six older numeric fallback rows can remain alongside the
15 current raw/state points. Fresh RAW values remain the HMI's preferred source.

WT32-ETH01 / classic ESP32 / LAN8720 networking is preserved: Ethernet is PLC-only,
gateway 0.0.0.0, PLC 192.168.1.1:502 unit 1, Wi-Fi is the Internet route with public
DNS, `Network.setDefaultInterface(WiFi.STA)` and `WiFi.setSleep(false)`. The original
two-second Modbus polling and three compact blocks remain. CH2's Ethernet address
is 192.168.1.51; CH3's separate configuration defaults to 192.168.1.52 and must be
checked for conflicts at installation. Network recovery does not restart the ESP.

The old insecure OTA hook is replaced with one compact device exchange every 15
seconds. Phase reports and download progress reuse this exchange; no additional
timer/task is started. Each visible HMI refresh uses its existing five-second
guard for two telemetry requests plus one scoped OTA-status request. Hidden tabs
pause, visibility return refreshes immediately, and unmount cleans up. No Realtime.

## Authorization and completion

`chiller-ota` verifies browser JWTs against an operator UUID allowlist. The code is
verified server-side with a global five-attempt / 15-minute limit. A five-minute,
single-use hashed grant binds operator and device. Queue retries are idempotent.
Devices use separate keys, independent of browser authorization and ingestion.

Private `chiller-firmware` Storage holds approved immutable release metadata and
device-scoped binaries. HTTPS CA validation, expiring signed downloads, HMAC-SHA256
manifests, SHA-256 image verification and embedded device/version markers prevent
CH2/CH3 cross-installation. No firmware binary or real credential belongs in Git.
RLS and revocations keep OTA tables/functions private; a restrictive Storage policy
also protects this bucket when unrelated broad read policies exist.

Lifecycle: idle → authorized → downloading → verifying → installing → rebooting
→ waiting_for_telemetry → completed, or failed. Completion requires the expected
version, a new boot ID, and a receipt from a real authenticated telemetry POST
containing all 15 required points. Device check-in alone cannot complete a job.
Receipts overwrite one row per device. Jobs have ten-minute deadlines; status and
device requests reconcile timeouts/revocations. Authorization and phase changes
are audited. Monitoring resumes automatically after reboot; OTA has no equipment
control, maintenance interlock or return-to-service action.

## Build and first installation

Versions: `ch2-secure-1` and `ch3-secure-1`. ESP32 Arduino core 3.3.8:

```powershell
arduino-cli compile --fqbn 'esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default' --output-dir build-ch2 firmware/Chiller2
arduino-cli compile --fqbn 'esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default' --output-dir build-ch3 firmware/Chiller3
```

Copy each example header to its ignored counterpart and provision distinct keys
before building. The shared public CA is versioned; real secrets stay local and
in server configuration. Images containing credentials must also remain private.

The selected layout is 4 MiB flash, ota_0 at 0x10000 and ota_1 at 0x150000, each
0x140000 (1,310,720 bytes). SDK configuration enables bootloader rollback. The
board definition's reported 8 MiB application maximum is misleading: compare the
actual application image against the 0x140000 slot. Runtime verifies flash and
inactive-slot capacity. An incomplete or invalid download leaves the running slot
unchanged. A pending image is accepted only after successful telemetry; failure to
resume within 120 seconds requests rollback. Power-loss/hang recovery depends on
the verified rollback bootloader and must still be physically exercised.

CH2 needs one UART installation including the matching bootloader and partition
table. Do not use its old simple OTA hook for this transition. Verify the actual
board flash ID/capacity and selected serial port before upload. CH3 will receive
its first UART installation when hardware exists. Do not upload a merged flash
image through OTA: only the application `.ino.bin` is accepted.

After UART installation, observe at least 10–15 minutes of PLC reads, Wi-Fi routing,
15-second telemetry, check-ins and HMI values. Then perform a separately approved
version update and verify download, reboot, new-version telemetry, completion,
and recovery cases. No physical installation or real OTA success is claimed here.
Until the first secure client check-in, the HMI displays “Device not OTA registered”
and keeps programming disabled. Missing CH3 hardware is expected.

## Backend and release procedure

Apply `supabase/chiller_ota.sql` transactionally after tests and production schema
preflight. It can be rerun. It adds OTA objects and derives ingest changes from
the exact PR A definitions, retaining old payload compatibility and binding each
ingest to its own device. It does not change the five-row / 13-column overview.

Deploy `supabase/functions/chiller-ota/` with JWT gateway verification disabled
as in `supabase/config.toml`; authentication is mandatory inside the handler.
Configure server secrets `CHILLER_OTA_WEB_ORIGIN`, `CHILLER_OTA_OPERATOR_IDS`,
`CHILLER_OTA_OPERATOR_CODE`, `CH2_OTA_DEVICE_KEY`, `CH3_OTA_DEVICE_KEY`.
Supabase supplies its URL and service-role environment. Provision the new CH3
ingest secret on its existing device row; preserve CH2's working ingest secret.

Prepare an application release with:

```powershell
node firmware/prepare-chiller-release.mjs ESP32-CH2-PLC build-ch2/Chiller2.ino.bin ch2-secure-1 release-ch2.json
```

The default validates the classic-ESP32 app header, slot size, device/version
markers and SHA-256, writing unapproved metadata locally. For publication, set
`CHILLER_SUPABASE_URL` and server-only `CHILLER_SUPABASE_SERVICE_ROLE_KEY` in the
environment and append `--publish`. The tool privately uploads without overwrite,
downloads authenticated bytes to recheck SHA-256, then approves the scoped release.
It does not queue programming. Use a new version for each later firmware build.

## Validation evidence and limits

36 automated tests pass, including production-derived migration replay/idempotency,
cross-device rejection, grants/timeouts, RLS/Storage isolation, new-boot telemetry
completion and wrong-target image rejection. Frontend build passes; lint has zero
errors and six pre-existing warnings. The existing MICR font build warning remains.
Physical flash capacity, power-loss rollback and real OTA need hardware validation.
Deployment receipts and exact build hashes are recorded separately after execution.
