# PR #12: OTA observability and programming presentation

The server-created `authorized` event does not establish device receipt. This change records device reports separately, once per job and phase, and distinguishes database manifest selection from Edge response preparation.

## Deployment order

1. Apply `supabase/chiller_ota_observability.sql`.
2. Apply `supabase/chiller_ota_failure_diagnostics.sql` (backward-compatible optional failure enum).
3. Deploy only `chiller-ota`, preserving its existing `verify_jwt=false` and custom authentication/secrets.
4. Publish the reviewed frontend through the normal Vercel integration.

Both migrations are idempotent. Neither backfills historical events. The observation helper accepts only nine fixed event names, checks active/device-scoped jobs, and uses a partial unique index for one event per job/phase. Only service_role can execute it. Signed-response audit stores only device/job/event identifiers after URL creation and manifest signing; it is not proof that the device received the response. Device reports record reported phases, independently of server transition acceptance.

Current firmware can omit `failure_code` or send null. Future codes must match the closed allowlist. Terminal job histories are not enriched retrospectively. No URLs, request bodies, credentials, or arbitrary failure text enter these new audit paths.

## Review and verification

- Confirm no firmware, ingestion, telemetry cadence, Modbus, release, or Storage object changes in the diff.
- Test migration twice; legacy sync; separate server/device authorization events; manifest selection/signing; duplicate and later-phase reports; device isolation; terminal history; fixed audit vocabulary; rejected arbitrary failure codes; signing failure produces no success audit.
- Validate dark select/options/input and readable generic failure text. Native Windows Chrome/mobile visual checks require a connected browser; source regression checks do not substitute for them.
- Before retry, confirm CH2 version `ch2-secure-1`, approved target `ch2-secure-2`, fresh ONLINE status, enabled PROGRAM FIRMWARE, and the previous failed job. Do not click PROGRAM FIRMWARE or queue a job.

The first failure remains ROOT CAUSE NOT YET PROVEN; see `ch2-first-ota-failure.md`. The new events will distinguish pre-download branches during a future owner-initiated attempt. No new firmware version is needed or built by this PR.

Local verification: 41 tests passed; lint 0 errors / six existing warnings; production build passed (existing font warning). Windows Chrome local auto-open fixture verified closed/selected text, masked input, option computed colors, and 390x844 responsive layout. No production programming action was clicked. Native popup pixels were not captured by the browser screenshot interface.
