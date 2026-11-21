# Farmplast NJ ZKTeco — automatic US Eastern daylight saving time

Independent Windows Scheduled Task. The NJ bridge is normally stopped between 21:00 and 07:00, so overnight DST transitions cannot be handled by the ordinary bridge loop.

## Calendar

- Second Sunday of March: 02:00 EST -> 03:00 EDT, at 07:00 UTC.
- First Sunday of November: 02:00 EDT -> 01:00 EST, at 06:00 UTC.
- In 2027: March 14 / November 7.
- Official NIST: https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst

The script evaluates UTC time every minute to avoid missing nonexistent or repeated local hours. It contacts the device only during the 24-hour period after the transition. It retries after a network outage. It records completion only after successful readback, or after confirming the terminal is already correct.

## Safety

- No Supabase or Payroll updates, no new tables, no editing of recorded punches.
- Uses the existing 32-bit ZKEMKeeper COM SDK with GetDeviceTime and SetDeviceTime2.
- Requires the verified terminal IP and exact expected serial number. If identity mismatches, no write.
- Corrects only approximately -3600 seconds in spring or +3600 seconds in autumn, tolerance 300 seconds. Skips when already correct. Rejects other clock errors.
- After writing, reads the terminal again and requires error <=15 seconds.
- Logs event, original and confirmed clock to C:\ProgramData\Farmplast\ZKT-AutoDST\nj-events.jsonl. State stored in nj-state.json.
- Does not modify terminal DST settings. If built-in DST already adjusted the clock, no additional correction is applied.
- Relies on accurate Windows clock; ensure Windows Time is synchronized.
- Local mutex prevents two concurrent adjustment processes.

## Installation on NJ bridge Windows computer

Run once on the actual computer that can reach the NJ device over LAN. Do not install this on an unrelated PC or MSI without verified direct network route and matching COM SDK.

1. Verify actual NJ ZKT serial number and the network IP.
2. Open elevated 64-bit PowerShell at project root.
3. Offline calendar validation:

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\client\zkt-bridge\install\zkt-auto-dst.ps1 -Mode TestSchedule

4. Install with real verified values, not the placeholder strings:

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\client\zkt-bridge\install\zkt-auto-dst.ps1 -Mode Install -Ip <VERIFIED_NJ_IP> -Port 4370 -Machine 1 -ExpectedSerialNumber <VERIFIED_NJ_SERIAL>

   Installer copies script to ProgramData, creates protected config, performs a read-only 32-bit COM terminal identity/clock check, and ONLY if that succeeds creates task Farmplast ZKT NJ Auto DST under SYSTEM with one-minute repetition.

5. Query task:

   schtasks /Query /TN "Farmplast ZKT NJ Auto DST" /V /FO LIST

6. Run task manually outside transition window (no live terminal write or connection):

   schtasks /Run /TN "Farmplast ZKT NJ Auto DST"

7. Read terminal time without changing it:

   C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\Farmplast\ZKT-AutoDST\zkt-auto-dst.ps1" -Mode Status

8. Before DST ensure host runs overnight and time sync is healthy. At transition confirm an already_correct or corrected_verified event in the local JSONL log and a correct device readback.

## Rollback

Unregister-ScheduledTask -TaskName "Farmplast ZKT NJ Auto DST" -Confirm:$false

This removes only the added task; it does not touch the bridge service, terminal attendance logs or payroll. Preserve local audit files.

## Limitations

- Script is committed as an installation candidate, not live on the terminal until the bridge PC installation steps are completed and verified.
- The self-test verifies calendar computations; a real physical DST write cannot be safely simulated by changing the production terminal clock.
- PA is a separate Linux installation using node-zklib 1.3.0; this Windows SDK-based solution does NOT control PA. PA needs a separate compatible implementation or verified built-in terminal DST configuration.
