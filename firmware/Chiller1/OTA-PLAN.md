# CH1 implementation contract

The latest remote-control task supersedes the earlier gateway-only scope. Existing CH1 fan/reset GPIO behavior is retained; website commands are separate from reported telemetry. OTA itself does not call output functions or require an equipment-maintenance state.

- One compact five-second device exchange contains desired settings, revision, reset sequence and OTA status/version.
- Commands: AUTO, MANUAL, OFF, 30 Hz, 60 Hz, setpoint, D1, D2, HYST and repeated one-shot RESET.
- Requested state remains pending until the ESP reports matching values and command revision. Commands have a 45-second confirmation deadline.
- RESET additionally uses server-side PIN verification and a durable sequence number. Firmware acknowledges only after writing the reset output, not merely receiving the command.
- Programming requires a verified operator, server-side code, limited attempts and a single-use grant; only one active job is permitted.
- Lifecycle: idle -> authorized -> downloading -> verifying -> installing -> rebooting -> waiting_for_telemetry -> completed, or failed.
- Verified HTTPS, HMAC-authenticated digest/size/version, dual-slot staging, image validation and rollback-aware boot validation are retained.
- The owner authorized Supabase and frontend deployment. The agent does not flash CH1; initial installation is by USB.

The implementation and physical acceptance procedure are in OTA-IMPLEMENTATION.md.
