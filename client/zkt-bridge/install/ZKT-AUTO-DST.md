# Farmplast NJ + PA: automatic Eastern DST

Installed on both existing bridge computers on November 20, 2026. No additional daemon, dependency installation on factory hosts, database table, Payroll change or attendance rewrite is required.

| Site | Existing host | Physical terminal | Verified serial | Independent scheduler |
| --- | --- | --- | --- | --- |
| NJ | NJ-5591-TL, Windows | 192.168.22.201:4370 | RNJ6261400035 | `Farmplast ZKT NJ Auto DST`, SYSTEM, 32-bit Windows PowerShell |
| PA | hp-pen, Linux | 192.168.1.201:4370 | RNJ6261400029 | `farmplast-zkt-pa-dst.timer` + clock-only oneshot |

Both hosts use Eastern Time; both terminal `DaylightSavingTime` and `~DSTF` options were read as `0`. Firmware on NJ is `Ver 6.60 Sep 10 2019`; PA reports platform `ZMM201_TFT`. Read-only clock preflight showed approximately +1 second NJ and -7 seconds PA relative to independently verified host UTC. No physical clock was changed during installation or testing.

## Schedule and safeguards

[Current NIST rules](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst): second Sunday in March, 07:00 UTC (02:00 EST → 03:00 EDT); first Sunday in November, 06:00 UTC (02:00 EDT → 01:00 EST). Calendar tests cover 2026–2030. The next transitions are March 14 and November 7, 2027.

- Schedulers run every minute, including overnight, independently of the main bridge's working hours. NJ additionally has an enabled boot trigger; PA has an enabled persistent UTC calendar timer and an `OnBootSec=45s` trigger.
- Only the first **five minutes** after the actual UTC boundary are eligible. No daytime or late catch-up is allowed, including after a delayed boot. DST itself changes the civil clock at the official boundary; the guard does not perform unrelated corrections during a shift.
- Before any hardware connection in correction mode, the OS time service and two independent live NTP sources must confirm host time within two seconds and agree within one second. A host clock jump during the operation also rejects the write.
- Verify the exact pinned physical serial before reading/considering a change, then again immediately before writing. Refuse unknown built-in DST settings or a competing enabled built-in correction. No terminal options are changed.
- Already-correct clocks (within 90 seconds) are marked complete without a write. Only the expected one-hour error in the appropriate direction, within five minutes of tolerance, is eligible.
- An exclusive **durably flushed write-intent file precedes the SDK/protocol write**. A lost ACK, bad readback, process crash, missing summary state or reboot cannot cause a second write for that transition. Do not delete intent files to force a retry.
- Read back the physical clock after a successful write; require agreement within 15 seconds. At most four checks per transition; an uncertain write permanently blocks further automatic writes for that event and records an error.
- NJ uses the installed official 32-bit ZKEMKeeper `GetDeviceTime` / `SetDeviceTime2`. A global mutex and Task Scheduler's IgnoreNew prevent concurrent jobs.
- PA uses the **installed node-zklib 1.3.0**, which has **no `getTime()` method**. `executeCmd(201)` returns an eight-byte ZK header and four-byte packed wall time. Decode these bytes directly, without local `Date` normalization of the nonexistent spring hour. `executeCmd(202, four-byte little-endian wall time)` requires an exact ACK followed by a fresh GET_TIME. No `REFRESHDATA`, attendance or database commands are issued. Compatibility was verified against the installed library with a local TCP terminal emulator and a real read-only serial/clock preflight, not a live clock write.

## Verification performed on the factory hosts

- NJ: eight offline safety groups passed under the actual 32-bit Windows PowerShell. Includes exact 2026–2030 boundaries, both writes on a fake SDK object, already-correct clock, wrong serial/time, built-in DST conflict, lost acknowledgement, failed readback, persisted replay protection and bounded attempts.
- PA: eleven offline tests passed under the actual installed Node/node-zklib. Includes the same failure cases, invalid ACK/length/date, NTP failures, durable intent and real node-zklib talking only to a `127.0.0.1` TCP emulator.
- Real terminal serial and time were read before scheduler activation. Both preflights verified live NTP sources and disabled built-in DST.
- Both independent schedulers were started successfully outside a transition, with no physical clock write. Normal minute-triggered executions and enabled boot settings were checked separately.
- NJ's existing services stopped normally at 21:00; the independent DST task then succeeded at 21:00:26 with exit code 0 and another minute scheduled. PA's timer succeeded automatically at 20:59 and 21:00; the original bridge remained active with PID 7069, unchanged since November 13.
- No factory computer was rebooted or main bridge stopped for testing. Persistence was tested with fresh guard instances and missing summary state while retaining durable intent. Boot activation is verified from the registered scheduler configuration; a real power-cycle was not performed.
- Existing NJ bridge executable and attendance executable hashes were unchanged; PA `bridge.cjs`, `common-import.cjs` and lockfile hashes and original running bridge PID were unchanged. The clock jobs contain no database access and cannot alter Payroll/work logs. Tests reject any non-clock device command.

## Windows installation and inspection

From an elevated Windows PowerShell on the **existing NJ bridge host**, using independently verified identity:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\client\zkt-bridge\install\zkt-auto-dst.ps1 -Mode Install -Ip 192.168.22.201 -Port 4370 -Machine 1 -ExpectedSerialNumber RNJ6261400035
```

The installer protects `C:\ProgramData\Farmplast\ZKT-AutoDST` for SYSTEM/Administrators, performs read-only preflight using the existing SDK, then registers the task. It does not modify bridge service definitions. Automatic sleep is already disabled on this host; it must remain powered on. The task allows battery operation, requests wake and starts after missed triggers. It does not change the power plan.

```powershell
Get-ScheduledTask -TaskName 'Farmplast ZKT NJ Auto DST'
Get-ScheduledTaskInfo -TaskName 'Farmplast ZKT NJ Auto DST'
C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\Farmplast\ZKT-AutoDST\zkt-auto-dst.ps1 -Mode Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\client\zkt-bridge\install\zkt-auto-dst.test.ps1
```

Logs: `nj-events.jsonl`; summary: `nj-state.json`; one-write markers: `nj-spring-YYYY-write.json` / `nj-autumn-YYYY-write.json`, in the same protected directory. Logs contain only clock status/correction events.

## Linux installation and inspection

Keep the existing private `.env`, bridge sources, dependencies and service unchanged. Copy only `linux/dst-clock.cjs` into `/opt/farmplast-zkt-linux-bridge/`, root-owned. Run the read-only preflight **before** enabling the timer:

```sh
cd /opt/farmplast-zkt-linux-bridge
TZ=America/New_York node dst-clock.cjs --status
node dst-clock.cjs --test-schedule
node --test test/dst-clock.test.cjs
```

Install the supplied `.service` / `.timer` into `/etc/systemd/system/`, then:

```sh
systemd-analyze verify /etc/systemd/system/farmplast-zkt-pa-dst.service /etc/systemd/system/farmplast-zkt-pa-dst.timer
systemctl daemon-reload
systemctl enable --now farmplast-zkt-pa-dst.timer
systemctl start farmplast-zkt-pa-dst.service
systemctl list-timers farmplast-zkt-pa-dst.timer
systemctl show farmplast-zkt-pa-dst.service -p Result -p ExecMainStatus
journalctl -u farmplast-zkt-pa-dst.service --no-pager -n 20
```

The unit uses the existing `flock`, `node`, `timedatectl` and dependencies. Logs/state/intents are root-only in `/var/lib/farmplast-zkt-dst`; journal messages contain clock-job activity, never employee punches. Outside a transition the correction command exits before loading the SDK or contacting the device. Inspect uncertain state with `--status`; do not clear an intent to replay a production write.

## Rollback

Disable only the added scheduler; preserve clock audit and intent files:

```powershell
Unregister-ScheduledTask -TaskName 'Farmplast ZKT NJ Auto DST' -Confirm:$false
```

```sh
systemctl disable --now farmplast-zkt-pa-dst.timer
```

This leaves both existing bridges, recorded punches, employee hours and Payroll unchanged. No production clock write outside an actual DST boundary is a valid test.
