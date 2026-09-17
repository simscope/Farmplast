# CH2 source-side OTA diagnostics (PR #13)

Baseline: production main 7fd1634452e6c3984f6e52a46b858736acb0ae33. Diagnostic UART version: `ch2-secure-1-diag1`. No production firmware or OTA target is changed by this PR.

The second reported failure (`740db98c-bf07-4e2b-938c-a00658837790`) reached manifest response preparation, then failed without a device-authorized report. Root cause remains unproven. This change distinguishes local state-write, stage-sync and interrupted-update failures without relaxing the mandatory stage acknowledgement.

The existing atomic NVS record adds only `failure`. Codes match the backend's 17-value allowlist. A new authenticated job clears the previous code after the no-replay guard. Restored codes are validated before use. First local cause wins, including when a reset occurs after that cause was persisted; an interrupted nonterminal old-image record with no earlier cause becomes `interrupted_update`. Failed records retain their reason. The final failure path saves and sends it; later ordinary syncs retry the report without replaying the job. If NVS itself remains unwritable, persistence across power loss cannot be guaranteed; the immediate in-memory report still carries `state_save_failed`.

A failed save or stage sync still aborts OTA. A successful sync whose server ACK says failed remains failed and is not mislabeled as a transport error. HTTP status, exact Content-Length, expiry, stream, write, hash, marker, finalize, boot partition and telemetry timeout branches receive their existing approved codes, with original evaluation order and cleanup preserved. No timeout, TLS policy, URL handling, partition layout, rollback rule, network routing, Modbus mapping or telemetry cadence is changed.

Serial-only reset reasons use `esp_reset_reason()` from the installed ESP-IDF headers. Restored job identifiers are UUID-filtered and phase names allowlisted before printing; restored failure codes are allowlisted. No key, URL, HTTP response, credential or arbitrary reset string is added to NVS, logs or the API. Reset reason is not sent to Supabase.

## Validation and handoff

- Four new checks cover enum agreement/data boundaries, actual stage statements under injected failures and terminal ACKs, persisted restoration/no-replay guards, and existing verification/security branches.
- Frontend suite: 45 passed; lint 0 errors / six existing warnings; production build passed with existing font warning.
- Build CH2 and CH3 with ESP32 core 3.3.8 and `esp32:esp32:wt32-eth01:FlashMode=dio,FlashFreq=40,PartitionScheme=default`. CH3 remains `ch3-secure-1`; compilation is not a physical deployment.
- The owner's private UART package is kept outside Git. It verifies hashes, backs up the complete 4 MB flash, and requires explicit `FLASH CH2` before any writes. No flasher is executed by this task.
- After owner installation, observe 10–15 minutes: `ch2-secure-1-diag1`, OTA ONLINE, normal telemetry and Modbus, stable boot ID, no reboot loop. Preserve Serial reset/restoration diagnostics. Do not select or program the existing ch2-secure-2 target: it does not contain these source-side diagnostics. A later diagnostic target requires a separate task after stability confirmation.

No Supabase/Storage/frontend deployment is needed here. No new approved release or OTA job is created. Leave the PR open for review; stop before physical flashing.
