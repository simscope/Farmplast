# Farmplast NJ ZKTeco — automatic US Eastern daylight saving time

Independent Windows Scheduled Task. The NJ bridge is normally stopped between 21:00 and 07:00, so overnight DST transitions cannot be handled by the ordinary bridge loop.

## Calendar

- Second Sunday of March: 02:00 EST -> 03:00 EDT, at 07:00 UTC.
- First Sunday of November: 02:00 EDT -> 01:00 EST, at 06:00 UTC.
- In 2027: March 14 / November 7.
- Official NIST: https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst

The script evaluates UTC time every minute to avoid missing nonexistent or repeated local hours. It contacts the device only during the first hour after each transition. It retries after a network outage. It records completion only after successful readback, or after confirming the terminal is already correct.

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

## PA automatic transition (Linux host hp-pen)

The current PA Linux bridge uses node-zklib 1.3.0, which does not expose a high-level setTime(). The separate guard in `linux/dst-clock.cjs` therefore uses the documented ZK standalone protocol: CMD_OPTIONS_RRQ(~SerialNumber), CMD_GET_TIME via node-zklib, CMD_SET_TIME with a four-byte packed wall-clock value, and CMD_REFRESHDATA. This does not change the running attendance bridge or its dependencies.

Required activation on the **actual PA Linux host** where the existing terminal is reachable:

1. Review `/opt/farmplast-zkt-linux-bridge/.env` and verify correct `ZKT_IP`, `ZKT_PORT`, `ZKT_SERIAL_NUMBER`, and `ZKT_PLANT_LOCATION=PA`. The serial must be the actual physical device serial, not an invented value. Do not publish the .env.
2. Confirm current clock synchronization: `timedatectl status` should show NTP synchronized. Confirm working `node-zklib` 1.3.0 is installed in the bridge directory. Do not modify or restart its bridge service.
3. Copy **only** `linux/dst-clock.cjs` to `/opt/farmplast-zkt-linux-bridge/dst-clock.cjs`. Keep permissions root-owned. Do not replace `bridge.cjs`.
4. From that directory run: `node dst-clock.cjs --test-schedule`. Also run `node --test test/dst-clock.test.cjs` against a local copy of test file; these tests require no connection to hardware.
5. Read-only hardware preflight: with environment loaded from existing private .env and `TZ=America/New_York`, run `node dst-clock.cjs --status`. Confirm reported serialVerified=true and terminalClock/easternClock within 90 seconds. If status fails or shows a large skew, **do not activate automatic writes**; correct implementation or device time offline.
6. Install `linux/systemd/farmplast-zkt-pa-dst.service` and `linux/systemd/farmplast-zkt-pa-dst.timer` under `/etc/systemd/system/`. Then:
   `sudo systemctl daemon-reload`
   `sudo systemctl enable --now farmplast-zkt-pa-dst.timer`
   `sudo systemctl status farmplast-zkt-pa-dst.timer --no-pager`
7. Confirm timer next run from `systemctl list-timers farmplast-zkt-pa-dst.timer` and verify `journalctl -u farmplast-zkt-pa-dst.service`. Outside transition no physical terminal contact or write occurs.
8. On DST date, verify `corrected_verified` or `already_correct` in `/var/lib/farmplast-zkt-dst/pa-events.jsonl` and re-read clock. If failure occurs, systemd logs an error; do not automatically replay after the first hour.

PA rollback: `sudo systemctl disable --now farmplast-zkt-pa-dst.timer` (leaves existing bridge running). Do not delete event/state logs.

**CAUTION**: The protocol-based PA time write needs a confirmed read-only preflight on its physical firmware. It is not claimed active or verified merely because these source files exist in GitHub. Both NJ and PA safeguards limit automatic correction to the **first hour after** the DST transition. No corrections later during an employee shift.
