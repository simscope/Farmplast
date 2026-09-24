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
