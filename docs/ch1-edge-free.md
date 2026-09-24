# CH1 direct-RPC migration

Status: implementation and local validation in progress. No production migration,
physical update, or Edge deletion has been performed by this change yet.

The owner confirmed CH1 is a Waveshare ESP32-S3-Relay-6CH with GPIO relays and
DS18B20 sensors, not a Panasonic FP7/Modbus gateway. GPIO assignments, sensor
conversion, automatic staging/hysteresis, output writes and the ten-second reset
pulse are preserved. CH2/CH3 firmware and Panasonic PLC configuration are outside
this change.

## Protocol

`ingest_ch1(p_key,p_rows)` authenticates the existing CH1 device key, validates the
CH1 asset/device/point scope, upserts the existing nineteen-point telemetry batch,
and returns the existing compact `c/r/q/o/a` control/OTA envelope. The firmware
uses its existing five-second publish timer; the separate cloud-fetch timer and
Edge URL are removed. Only a newer revision (or initial boot synchronization)
applies desired values. Actual outputs and reset sequence are reported on the
next ordinary telemetry exchange, and existing reconciliation controls APPLIED.

An active OTA transfer uses `ch1_ota_report` for bounded progress reports while the
ordinary loop is suspended. It never manufactures telemetry. This RPC cannot be
used without an existing job; it is not an idle scheduler. HTTPS CA validation,
CH1 S3/model/version validation, HMAC/SHA verification, inactive-slot writing and
rollback-enabled bootloader requirements remain.

Browser calls use `ch1_command`, `ch1_firmware_status`, `ch1_firmware_unlock`,
`ch1_firmware_publish` and `ch1_firmware_queue`. Operator identity comes from
`auth.uid()`. Private allowlist, bcrypt code hash and existing device key are
provisioned separately; no credentials belong in this document or migration.
RESET retains server-side code verification and attempt limiting.

Uploads use private `ch1-firmware` Storage, `upsert:false`, authenticated readback
and matching SHA before approval. UPDATE/DELETE remain denied. The UI validates
ESP32-S3 chip ID 9, application descriptor, unique CH1 device/model/version markers
and at least 65,536 bytes of the 1,310,720-byte slot remaining. Signed URLs must
match the configured **Supabase Storage origin**, object and bounded expiry.
The existing ten-minute CH1 install deadline is unchanged.

## Ordered production procedure

1. Verify CH1 `ch1-ota-2`, stable boot, fresh telemetry, correct actual/desired
   state and zero active jobs. Record current frontend deployment for rollback.
2. Apply only `supabase/ch1_edge_free.sql`; provision private CH1 configuration
   using parameter binding with secret statement/parameter logging disabled.
   Verify permissions and old `ch1_device_sync` compatibility. Keep legacy Edge.
3. Validate the real `ch1-edgefree-1` binary and exact previous partition layout;
   preserve known-good files. Deploy the tested frontend without unrelated changes.
4. Upload/read back/approve through CH1 UI. Queue exactly one job, record release,
   job, source boot/version and timestamp. The old Edge delivers this first update.
5. Observe actual events through new boot, firmware, fresh telemetry, actual control
   state and completed job. Stop on failure; do not queue a replacement automatically.
6. Observe 10–15 minutes. Require stable boot, five-second telemetry, fresh sensor
   and relay reports, no failure and no device-originated CH1 Edge requests.
   Verify command behavior with actual-state acknowledgement and one-shot RESET;
   preserve/restore the operator's requested operating state.
7. Verify the deployed frontend has no CH1 Edge calls. Measure at least ten minutes
   of zero invocation dependency for both OTA functions, distinguishing manual calls.
8. Only after these gates pass, retire `ch1-ota`. Independently verify and retire
   unused `chiller-ota`. Preserve all history, releases, Storage and compatibility SQL.
   Do not merge automatically.

## Validation record

- Production baseline read 2026-09-24 13:01:55 UTC: version `ch1-ota-2`, source boot
  `8b87839536b88f5d70259449eb69adb1`, telemetry age about six seconds, active jobs zero.
- Before: 1,408 `ESP32HTTPClient` POST calls to `ch1-ota` in two hours, median 5.027 s.
- Old running image size: UNKNOWN; no `ch1-ota-2` release row exists. Preserved local
  `ch1-ota-3` image is 1,070,592 bytes and is not claimed to be the running image.
- Initial full Node suite: 116/116 passed. Frontend build and changed-file ESLint passed.
- GPIO/sensor/control functions compared against parent source: byte-identical.
- New image `ch1-edgefree-1`: 1,068,896 bytes; OTA headroom 241,824 bytes.
  SHA-256: `5e24f456524450fab3eca4a5089596a281b3c94413661b61d8cf6309e351bff2`.
  ESP32-S3/model/device/version, ESP checksum, appended SHA, partition hash and
  absence of Edge/WebSocket references: PASS. Partition SHA-256:
  `148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1`.
- Build: Arduino ESP32 3.3.8, `esp32:esp32:esp32s3:CDCOnBoot=cdc`, unchanged default
  partitions; ArduinoJson 7.4.2, OneWire 2.3.8, DallasTemperature 4.0.5. Existing
  real CH1 key and Supabase origin verified locally; no credentials rotated.
- Browser fixture: pending until reported-state acknowledgement, real CH1 image
  inspection, rejection of real CH3 image, upload modal rendering: PASS. Fixture
  mocks both RPC and Storage; no physical commands or upload were sent.
- Production migration and private provisioning: PASS, explicitly authorized by
  owner, committed 2026-09-24 13:34:13 UTC at source commit
  8024f9a55116b6c42ddab777ec5ba37fa12af3af.
- Pre-change definitions/ACL and rollback SQL preserved in the local sibling
  ch1-production-rollout directory. No rollback required.
- One authenticated owner/operator and one config provisioned. Existing code
  and device key preserved; bcrypt cost 13; Supabase Storage origin verified.
  Operator and unlock tests passed; unlock transaction rolled back.
- Seven legacy function definitions/ACL, existing table ACL/RLS, columns and
  unrelated policies unchanged. Six CH1 Storage policies installed. Private
  schema inaccessible directly to anon/authenticated; RPC grants verified.
- Releases/jobs/events/commands remain zero; desired state unchanged. Control
  compatibility verified through unchanged legacy functions/permissions and
  prior tests; no physical control command or actuation test performed.
- Checks through 13:39:45 UTC: nineteen telemetry points fresh, ONLINE true,
  firmware ch1-ota-2, original boot ID unchanged, active OTA jobs zero.
  Final legacy sync timestamps: 13:39:31.898, 13:39:36.570, 13:39:41.533 UTC.
  Corresponding sync ages: 1.06, 2.96, 4.08 seconds. Telemetry advanced through
  13:39:27, 13:39:37, 13:39:42 UTC. Continuing old-firmware device sync is the
  evidence for legacy Edge health; Edge deployment/secrets were not changed.
- SQL deployed YES; provisioning PASS; UI deployed NO; publication NO; OTA queued
  NO; physical migration NOT RUN; Edge deletion NO. CH2/CH3 unchanged.
- READY TO PUBLISH ch1-edgefree-1: NO through the required production upload UI.
  Backend prerequisites passed. PR21 frontend rollout and hosted upload/readback
  verification remain pending and are outside this authorization.

## Changed files

- `supabase/ch1_edge_free.sql`: additive private configuration, authorization,
  command/status/upload/queue RPCs, ingestion and active OTA report path.
- `firmware/Chiller1/Chiller1.ino`, `Ch1Ota.h`: telemetry exchange transport and
  revision gating; remove idle Edge fetch without changing GPIO/sensor functions.
- `firmware/validate-ch1-edge-free.mjs`: offline S3 image/partition/SHA/slot gate.
- `client/src/utils/ch1Firmware.js`, `components/Ch1FirmwareUpload.jsx`,
  `components/Ch1Programming.jsx`, `pages/Chiller1HMIPage.jsx`: CH1 private upload,
  bounded signed URL and authenticated RPC workflow.
- `client/tests/ch1-edge-free.test.mjs`, `ch1Ota.test.mjs`, `ch1-browser.jsx`:
  protocol/security regressions and isolated browser fixture.

## Frontend/upload authorization checkpoint — 2026-09-24

Stopped before production changes: the current CH1 upload UI has one
UPLOAD & APPROVE action. Ch1FirmwareUpload.upload calls uploadAndApprove,
which performs Storage upload with upsert:false, authenticated readback and
SHA comparison, then immediately calls ch1_firmware_publish. There is no
separate approval boundary. The owner's explicit stop condition for inseparable
upload/approval therefore applies. No upload/publish RPC was executed, and no
frontend deployment was performed during this checkpoint. No code was changed.

- PR21 frontend deployed: NO.
- Current production UI regression: NOT ASSESSED (no deployment).
- Deployment ancestry: NOT VERIFIED; promotion remains gated.
- CH1 Upload Firmware visible: NOT VERIFIED on production.
- CH1 image detection / wrong-target rejection: NOT RUN on production.
- Storage upload / authenticated readback / SHA match / private Storage enforcement:
  NOT RUN in this checkpoint. Previous local fixture results are not hosted proof.
- CH1 physical health / active OTA jobs: not re-sampled in this checkpoint;
  previous SQL-rollout checks were healthy with zero active jobs.
- READY TO PUBLISH ch1-edgefree-1: NO.

To complete the requested hosted UI test without publication, upload/readback
and approval need separate actions. No such UI change was made implicitly.
No firmware, jobs, controller commands, Edge functions or CH2/CH3 were changed.

## Completed split workflow and hosted validation — 2026-09-24

This record supersedes the blocked frontend/upload checkpoint above.

### Ancestry and deployment

Production originally served 0d2989ddb2887fbcf49bd813390ae1a81733b5f2
(codex/sacs-employee-sync), deployment 4qmALpv8MTML33E5HGQJVoDSE2wg.
PR21 lacked three production commits (Safety layout and SACS sync). They were
merged into the PR21 branch without conflicts before rollout. The production
commit is now an ancestor; the client diff against it contains only CH1 changes
and tests. Existing PR20 CH2/CH3, NJ, PA, Safety and SACS functionality is preserved.
No pull request was merged.

Final deployed code: ba6f6842a52ea9ff4822293fc218d576156fea1d.
Production deployment: 3zJPEjSSc9N8xS2ZTRuq6sDxQwKV
(https://farmplast-m72e1h5gx-andrei-simanenkas-projects.vercel.app),
aliased to https://farmplast.vercel.app using the production environment.

The first rollout (bc739ef / ER3whA5XV9pQajJyMhFGuwGPRTbD) exposed a
PostgREST thenable .catch() bug in CH1 status loading. It incorrectly displayed
OFFLINE while DB telemetry remained healthy. The previous frontend was restored,
the RPC loader was corrected to await the thenable, and a regression test added.
The corrected deployment now shows actual telemetry, firmware and requested state.

### Split action contract and tests

UPLOAD & VERIFY re-inspects the selection, uses upsert:false, downloads the exact
private object and verifies size/SHA. It returns metadata without calling publish.
VERIFIED — NOT APPROVED is followed by a separate APPROVE RELEASE button.
Approval re-inspects the selection and re-downloads/re-hashes the stored object
immediately before publication. File selection and modal remount clear verification.
Existing immutable unapproved objects can be verified; no cleanup rights added.

Full suite: 127/127 PASS (node --test --test-concurrency=1 tests/*.test.mjs).
A parallel attempt exhausted local Node memory; the complete sequential rerun
passed. Frontend build PASS; changed-file ESLint PASS. Isolated browser checks
passed: no approval before verification; file change clears verified state;
reopening starts empty; explicit second click alone triggers mocked publication
after a fresh readback. No production publication was used for these tests.

### Hosted UPLOAD & VERIFY only

Local and authenticated Storage readback SHA-256:
5e24f456524450fab3eca4a5089596a281b3c94413661b61d8cf6309e351bff2.
Image: ESP32-CH1 / ESP32-S3 / ch1-edgefree-1 / 1,068,896 bytes /
241,824-byte OTA headroom. Existing partition validation remains applicable;
no rebuild was performed. Hosted inspection rejected real CH2 and CH3 binaries.

Object: ch1-firmware/ESP32-CH1/ch1-edgefree-1/
5e24f456524450fab3eca4a5089596a281b3c94413661b61d8cf6309e351bff2.bin.
Upload and authenticated readback succeeded; UI displayed Stored bytes verified,
SHA-256 verified and Release approved: NO. APPROVE RELEASE was never clicked
in production. Releases=0, jobs=0 after upload.

Privacy: bucket public=false; operator sees one exact object; anonymous DB role
sees zero. Fresh uncached unauthenticated normal-object HTTP access returns 400;
public-object URL returns 400. A first cache-enabled anonymous fetch reused the
authenticated browser cache (200), so it was excluded from privacy proof; the
cache-busted no-store request was denied. Operator UPDATE returns zero rows.
DELETE RLS EXPLAIN yields One-Time Filter=false; direct DELETE additionally
raises 42501 via Storage protection. SQL mutation probes were rolled back; no
Storage DELETE API was executed and no object was removed. No RLS changes made.

Captured browser response stream contained zero ch1_firmware_publish calls and
zero /functions/v1/ calls. CH1 status uses direct RPC. No control command was sent.
CH1/CH2/CH3 and NJ pages loaded; PA overview, barrels/mixers, machines, climate
and chillers loaded with their existing not-configured/no-data states. Final
CH1/PA browser error logs were empty.

### Physical observation and result

2026-09-24 14:04:14.407–14:09:15.300 UTC (5m00.893s), 11 DB samples.
Firmware remained ch1-ota-2; boot stayed 8b87839536b88f5d70259449eb69adb1.
Maximum observed sync age 2.085 seconds; oldest telemetry age 6.608 seconds.
DS18B20-derived temperatures changed normally; CH1 ONLINE; requested state AUTO,
fan OFF, setpoint 85 F, D1=2, D2=5, HYST=1 retained. This CH1 is GPIO/DS18B20,
not a Panasonic PLC. Legacy ch1-ota health is supported by continuing old-firmware
device sync. No active OTA jobs, no releases, no boot churn.

Local detailed evidence: ch1-production-rollout/frontend-final-observation.json,
hosted-upload-evidence.json, upload-privacy.json, split-tests.log and split-build.log.

- ancestry safe: YES
- split upload/approval implemented: YES
- tests: 127/127
- frontend deployed: YES
- local binary SHA match: YES
- hosted upload: PASS
- hosted readback: PASS
- stored SHA: PASS
- private Storage: PASS (HTTP read + hosted role/RLS checks described above)
- release approved: NO
- physical CH1 healthy: YES
- active OTA jobs: 0
- READY TO APPROVE ch1-edgefree-1: YES (readiness only, approval not performed)

No firmware publication, OTA queue, flash, physical command, Edge deletion,
credential rotation, CH2/CH3 firmware change or PR merge was performed.

## First authorized Internet migration — FAILED / stopped, 2026-09-24

This result supersedes readiness for the first physical migration. Exactly one
job was submitted using production PROGRAM FIRMWARE / CONFIRM PROGRAMMING.
No retry, control command, code change, Edge deletion or additional job followed.

Preflight: ch1-ota-2, boot 8b87839536b88f5d70259449eb69adb1, fresh telemetry,
zero active jobs. Immediately before queue (15:10:14.700 UTC), sync age 2.162 s,
telemetry age 5.701 s. The latest twenty observed legacy ESP32HTTPClient POSTs
(15:05:50.450–15:07:26.678 UTC) all returned HTTP 200.
Storage was reverified through UPLOAD & VERIFY, followed by explicit APPROVE
RELEASE, which performs another readback/SHA check.

Release ID: c6326bda-16c1-492c-8118-7220621ed113.
Approved/created: 2026-09-24 15:08:53.731 UTC.
Version: ch1-edgefree-1; model CH1-ESP32S3-v1; size 1,068,896 bytes.
SHA-256: 5e24f456524450fab3eca4a5089596a281b3c94413661b61d8cf6309e351bff2.
Storage: ch1-firmware/ESP32-CH1/ch1-edgefree-1/
5e24f456524450fab3eca4a5089596a281b3c94413661b61d8cf6309e351bff2.bin.
Release remains approved; no automatic revocation was performed. Its separate
CH1 catalog/model is not usable by CH2/CH3; matching CH23 release rows = 0.

Job ID: d26eff14-4a81-44f0-8ca9-b835a8be8774.
Source version: ch1-ota-2. Source boot: 8b87839536b88f5d70259449eb69adb1.

Actual database event sequence (UTC):

| Time | Event | Job |
| --- | --- | --- |
| 15:10:25.876 | code_attempt | none |
| 15:10:27.141 | authorized | d26eff14-4a81-44f0-8ca9-b835a8be8774 |
| 15:10:38.005 | failed | d26eff14-4a81-44f0-8ca9-b835a8be8774 |

Failure: device_reported_failure, progress 0. No manifest-delivered, downloading,
verifying, installing or rebooting event was recorded in this event table.
Their occurrence is not inferred. Root cause / installation stage is UNKNOWN.

CH1 reconnected on ch1-ota-2 with boot dcbbe59384e5354697b691da329fb0f4.
A reboot is observed; crash/reset/rollback cause is not established remotely.
At 15:11:08.240 UTC device sync was fresh, telemetry at 15:11:04 UTC; UI ONLINE,
AUTO, fan OFF, requested values retained. This is recovery on the old firmware,
not successful edge-free migration. Protocol remains null (not protocol 2).

Per the failure stop condition, the 10–15 minute Phase A observation was not
started. No successful ch1-edgefree-1 timestamp exists, so a post-migration Edge
window cannot be defined and zero device Edge traffic cannot be claimed.
Browser capture during this attempt observed zero /functions/v1/ responses.

- release approved: YES
- Internet OTA: FAIL
- new firmware reported: NO
- new boot ID: YES (old firmware)
- telemetry resumed: YES (old firmware)
- PLC data stable: NOT APPLICABLE; CH1 GPIO/DS18B20 telemetry fresh after failure
- unexpected reboot: YES; reason unknown
- observation duration: stopped on failure; Phase A not started
- active jobs after failure: 0 (one total job, failed)
- post-migration ESP32HTTPClient -> ch1-ota calls: NOT APPLICABLE / NOT PROVEN
- separate CH1 idle Edge requests observed post-migration: NOT APPLICABLE
- CH1 EDGE-FREE PHASE A: FAIL (migration failed)
- READY FOR CH1 CONTROL VALIDATION: NO
- READY TO RETIRE ch1-ota: NO

Local evidence preserved in ch1-production-rollout: ota-preflight.json,
ota-preflight-edge.json, ota-final-queue-gate.json, ota-release.json,
ota-migration-result.json, ota-migration-failure.json, ota-browser-responses.json.
No secrets or signed URL tokens are included in these captures.

## CH1 deferred execution port — ch1-edgefree-2

The PR21 source invoked otaRun directly from ch1ProcessResponse, before the
ordinary pushTelemetry call returned. Its response JsonDocument and telemetry
JSON/Strings were still alive. This is the same inline pre-download execution
pattern addressed for CH2/CH3; it is a source-level finding, not a claim that
the failed physical job's reset cause has been established. In current PR21,
ch1Rpc already releases its HTTP/TLS locals before response processing, and
ch1DeviceSync is report-only. No legacy idle sync was reintroduced.

The port uses an owning pending OtaJob, otaQueueDecodedJob and ch1OtaRunPending.
Setup and the scheduled telemetry loop call pushTelemetry first, then the
pending runner after the entire telemetry function returns. The slot clears
before otaRun; syncing, duplicate/current job and pending replacement are guarded.
Stage reports cannot enqueue work or replay a consumed job.

Six adapted regression tests execute the actual queue/runner statements and
response tail, with mocked HTTP/JSON scope boundaries as in the CH2/CH3 tests.
They verify owned manifest values, no inline run, scope destruction before run,
setup/loop placement, single execution, duplicate suppression, syncing guard,
invalid/absent/updating/disabled/not-ready cases and no additional idle sync.
Full suite: 133/133 PASS; changed-test ESLint PASS.

Seventeen function bodies were compared with the parent and remained unchanged:
GPIO/sensor/output/AUTO logic, reset sequencing, payload push, manifest decoder,
SHA/HMAC/download/install stages, inactive-slot and rollback logic, report-only
sync and HTTPS RPC. No backend schema, credentials, URLs or timeout changes.
The ignored private ota_config.h changed only the version to ch1-edgefree-2;
existing production key and endpoint verified without exposing secret values.

This new binary does not modify the code already running in ch1-ota-2; its
deferred behavior takes effect only after this new firmware is installed.
No retry, publication, queue, flash, Edge deletion or physical command was made.

Build/validation completed: PASS. Source commit 9ad3070.
Toolchain: ESP32 Arduino 3.3.8, esp32:esp32:esp32s3:CDCOnBoot=cdc, same
production private configuration and library directories as ch1-edgefree-1.
Bootloader and partition CSV are byte-identical to the preserved previous build.
Partition binary SHA-256: 148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1.
Version: ch1-edgefree-2; application .bin size: 1069776 bytes;
OTA slot headroom: 240944 bytes (minimum 65,536).
Application SHA-256: a442dbe364042cc97e2429561c8e5d2b689ec1b30a87d488ff193b42830e6c72.
ESP32-S3 chip/model/device/version, checksum, appended SHA and partition gates
PASS; runtime Edge references=0, WebSocket references=0.
Artifact: C:/Users/Owner/Documents/farmplast/ch1-edgefree-2-real-build/Chiller1.ino.bin
Validator record: C:/Users/Owner/Documents/farmplast/ch1-edgefree-2-validation.json

- same pre-download inline execution bug present in CH1: YES (source pattern)
- PR15 deferred pattern ported: YES
- tests: 133/133
- build: PASS
- READY TO PUBLISH ch1-edgefree-2: YES (artifact gates only; no publication)

No new forensic investigation or production/backend operation was performed.
Physical validation of this image remains NOT RUN.
