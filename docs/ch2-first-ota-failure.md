# CH2 first web OTA failure: evidence and prepared diagnostics

Status: ROOT CAUSE NOT YET PROVEN. No retry or production deployment performed.
Baseline: f34965f4c3e0b308325f7919cbda87a1262bbde8.

## Production evidence (UTC)

Job `e6181573-9f7c-4f84-b0e2-97fcb92624a6`, release
`b4b9cf06-6cb5-4155-a684-ea450fbbcb4d`, source boot
`b9efbb97a1ccd339cbfd4cbd8de5a704`.

Complete database event sequence:

| Timestamp | Event |
| --- | --- |
| 2026-09-16T00:40:50.262889Z | authorized |
| 2026-09-16T00:41:20.887572Z | failed |

Created/updated timestamps equal the two event timestamps above. Final progress
was 0; failure was `device_reported_failure`. Expiry was
2026-09-16T00:50:50.262889Z. No downloading, verifying, installing or rebooting
event exists for this job. Authorization alone is not proof that the device
received the manifest: job creation also records authorization.

At 2026-09-16T01:03:46.401267Z the device reported `ch2-secure-1`, boot
`b2eaf2be92037ce5ef63b653d546b286`, last seen
2026-09-16T01:03:38.745314Z (ONLINE at that observation). The changed boot proves
a reboot occurred between those observations, not its time or cause. This is
an observation timestamp, not a claim about present connectivity.

## Private Storage delivery

A fresh 300-second signed URL for the exact approved CH2 object was downloaded
at 2026-09-16T01:06:09.090Z using Node HTTPS/HTTP1.1, ESP32HTTPClient user agent,
and Accept-Encoding identity. No signed URL or token is included here.

| Property | Result |
| --- | --- |
| Initial/final HTTP status | 200 / 200 |
| Redirect | No |
| Content-Length | 1130640 |
| Transfer-Encoding | Absent |
| Content-Encoding | Absent |
| Content-Type | application/octet-stream |
| Downloaded bytes | 1130640 |
| SHA-256 | d9fbf3da6f809b634d5dfb984c7ad111b7526460060ff15e91738ed5c7f26d25 |
| Expected hash match | Yes |

This response satisfies the firmware's HTTP 200 and declared-size conditions.
It does not reproduce ESP32 TLS, heap state, device clock, or the original
attempt. There is no evidence supporting a Content-Length or redirect change;
both checks and the actual firmware remain unchanged.

## Logs and interpretation

The function log explorer for 00:40:40Z–00:41:40Z showed 18 matching requests.
Visible POST rows included HTTP 200 at 00:40:50.314Z, 00:40:50.931Z and
00:41:20.928Z. The latter is temporally consistent with the database failure
report, but request metadata alone does not identify a CH2 sync or its payload.
Successful manifest delivery and signed-URL creation during the failed attempt
are therefore not independently proven. Historical Storage-log inspection was
not completed: the Chrome connection became unavailable. Do not attribute the
failure to the Edge Function on this evidence.

With no persisted downloading event, investigate these branches first:

- Saving the authorized stage to NVS or synchronizing that stage fails.
- The inactive slot is missing, equals the running slot, or is too small.
- The device clock considers the job expired (server timestamps alone do not
  establish device time).
- Saving or synchronizing the downloading stage fails before its event persists.
- A reboot restores a nonterminal job on the old image and marks it failed
  through interrupted-update/rollback recovery.

The missing event is not proof that no local downloading-stage attempt occurred.
Current firmware sends no local reason, so these branches cannot be distinguished
with the retained evidence. Later HTTP/TLS/write/hash failures are not established.

## Prepared changes, not deployed

`client/src/components/ChillerProgramming.jsx` gives select, placeholder, options
and code input explicit dark colors; the modal scrolls on short screens and its
buttons wrap. A generic failure has a readable operator explanation plus a
smaller diagnostic code. Programming authorization/submission behavior is unchanged.
Windows Chrome and mobile visual checks remain pending because Chrome is unavailable.

`supabase/chiller_ota_failure_diagnostics.sql` adds a separate service-role-only
diagnostic RPC. The legacy RPC stays intact. `protocol.mjs` validates a closed
17-code enum and `handler.mjs` routes an authenticated failed report with a code
to that RPC. First code wins; cross-device updates and repeated audit entries
are blocked. No security policy or Storage access is weakened.

Future firmware design (not implemented or released):

1. Latch the first local failure code for a job. Persist it with the existing
   job record; clear only when a new validated job begins. Never overwrite a
   precise cause with a subsequent failure to synchronize the failure report.
2. Separate combined failure conditions: NVS save -> `state_save_failed`;
   stage acknowledgement -> `stage_sync_failed`; partition checks ->
   `slot_invalid`; expiry checks -> `job_expired`.
3. Map begin/GET/length/OTA-begin/stream/write/hash/identity/end/boot-partition
   failures to the corresponding closed protocol enum. Map old-image recovery
   to `interrupted_update` and new-image telemetry deadline to `telemetry_timeout`.
4. Include only `failure_code` with the existing compact failed device sync.
   Never send URLs, headers, tokens, response text, or arbitrary exception strings.
   Do not introduce another polling loop.
5. Retain exact byte count, SHA-256, embedded identity, authenticated manifests,
   rollback, and new-boot/version/reconnected telemetry completion requirements.
6. Separately review and deploy SQL before the compatible Edge Function, then
   review future firmware with fault injection for each branch. This document
   authorizes no deployment, release creation, or retry.

## Local validation

- `node --test tests/*.test.mjs`: 38 passed, 0 failed. The Vite SSR test emitted
  a dependency-scan shutdown warning; the test process still exited 0. This is
  recorded separately, not claimed to have been fixed or proven pre-existing.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 6 warnings in unchanged
  ChillerIllustration, AuthContext and EmployeeDetailsPage.
- `node node_modules/vite/bin/vite.js build`: passed; existing unresolved
  `/fonts/micr.ttf` warning.
- `git diff --check`: passed (Git also reports Windows line-ending notices).

Direct Node entrypoints were used because the local npm wrapper references a
missing npm-cli.js. No production frontend, SQL, Edge Function, firmware or
approved release was changed. No new OTA job was queued; CH3 OTA was not tested.
