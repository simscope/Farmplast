# Replacement Windows bridge PC

## What was actually captured

Production host: `nj-5591-tl`, Tailscale `100.91.162.96`.
Captured 2026-09-08, without modifying or restarting the working bridge.

* Windows 11 Pro, version/build 10.0.26200.
* NSSM service `ZKTBridge`; `C:\Program Files (x86)\ZKTBridge\nssm\nssm.exe`.
* NSSM 2.24-103-gdee49fc, 32-bit.
* Application: `C:\Program Files (x86)\ZKTBridge\zkt-bridge.exe`.
* Working directory: `C:\Program Files (x86)\ZKTBridge`; no application arguments.
* Node 18.5.0 is embedded. No standalone Node/npm installation is needed for
  restoring this exact executable. Embedded versions are in EMBEDDED-PACKAGES.json.
* Source entry `C:\snapshot\zkt-bridge\bridge.cjs` has only the pkg bytecode
  entry, not a readable source-content entry. No production source or original
  package-lock.json was found in the targeted remote searches. Do not reconstruct
  a pretend lockfile or use the old development source to rebuild this EXE.
* SDK uses `C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe` (32-bit).
* COM ProgID `zkemkeeper.ZKEM`, CLSID `{00853A19-BD51-419B-9269-2DABE57EB61F}`,
  ThreadingModel `both`, registered under the 32-bit Classes registry view.
* COM server: `C:\Program Files (x86)\ZKTBridge\sdk\zkemkeeper.dll`.
* Captured service was Manual, started by task `ZKTBridge Start 7AM` at 07:00 and
  stopped by `ZKTBridge Stop 9PM` at 21:00, both invoking sc.exe.
* Application work hours 08:00-21:00 local time; auto attendance at 08:00 and 20:00.
* Logs: `logs\out.log` and `logs\error.log`. These may contain employee information;
  keep them on the bridge or in a protected incident archive, never public Git.

## Required offline material and credentials

The remote pre-change backup is:
`C:\Farmplast-ZKT-Backup\20260908-121908\`.
It contains installation, secrets, service registry export and scheduled-task XML.
It is restricted to SYSTEM and Administrators. This alone does not protect against
loss of the remote disk.

Development-computer offline artifacts:
`C:\Users\Owner\Documents\farmplast\.private-zkt-recovery\`.
The artifact archive contains exact EXE/NSSM and installed SDK files; SHA256 values
are in PRODUCTION-BRIDGE-MANIFEST.json. Keep an independently stored backup of this
archive under the organization's existing backup process. No cloud upload was made.

SDK files: commpro.dll, mfc71.dll, msvcp71.dll, msvcr71.dll, plcommpro.dll,
zkemkeeper.dll. They were copied from the installed production sdk directory for
recovery, not downloaded. They are excluded from public Git because redistribution
rights were not established. If this archive is lost, obtain the matching licensed
32-bit ZKT SDK/runtime from the organization's vendor or retained original installer;
the original vendor installer location is not known. Reject files with unexpected
hashes until independently verified. Never register an arbitrary downloaded DLL.

The public repository excludes runtime EXEs pending full redistribution/license
review. A fresh Git clone needs those offline artifacts. This is an explicit
limitation, not a complete source build.

Obtain SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the organization's secure
credential store or the restricted remote backup. No production credential was
copied into this project or offline local SDK/archive. Keep `.env` outside Git.
SSH private keys stay in the development account's `.ssh`, not this recovery tree.

## Network and time

Observed ZKT endpoint `192.168.22.201:4370` (TCP tested successfully).
Observed bridge Wi-Fi address `192.168.22.66/24`; route `192.168.22.0/24` directly
on-link, next hop 0.0.0.0. The replacement needs a unique unused address with access
to this same LAN. Do not blindly reuse .66 while the old computer is connected.
ZKT uses an IPv4 literal; DNS is irrelevant to that connection. Working DNS and
outbound TLS are required for Supabase. Preserve local New York time/timezone for
attendance and schedules. Tailscale provides management access, not the ZKT LAN.

## Install on a replacement PC

1. Prepare a supported 64-bit Windows installation with 32-bit Windows PowerShell
   available. The observed system was Windows 11 Pro build 26200; other versions
   have not been tested by this capture. Set timezone to Eastern Standard Time.
2. Install OpenSSH Server and Tailscale through approved Windows/vendor channels
   if remote maintenance is required. Configure authorized public keys and strict
   host verification. Never copy old host/private SSH keys or Tailscale machine
   state. Verify the new host key out of band before updating known_hosts.
3. Copy this recovery directory, then restore runtime/zkt-bridge.exe and
   runtime/nssm.exe from the offline archive. Extract the SDK into a separate
   staging directory. Do not put secrets into this source tree.
4. No Node or npm install is required for the binary recovery. The embedded Node
   and dependencies are frozen with the executable. A maintainable source build
   still requires locating original source/build materials.
5. In Administrator PowerShell, run the following from this recovery directory:

   ```powershell
   .\install\install-bridge.ps1 -SdkDirectory 'C:\RecoveryArtifacts\sdk' -RegisterSdk
   ```

   This validates every captured artifact hash, refuses to overwrite an existing
   installation or run on nj-5591-tl, restricts installation ACLs, copies files,
   registers ONLY the verified 32-bit zkemkeeper.dll, and tests object creation.
   Registration uses SysWOW64\regsvr32.exe. On a system with an already verified
   matching COM installation, omit -RegisterSdk. No bridge is started.
6. Populate `C:\Program Files (x86)\ZKTBridge\.env` locally. Required names come
   from actual production configuration, not an invented settings model:

   ```dotenv
   SUPABASE_URL=<from secure store>
   SUPABASE_SERVICE_ROLE_KEY=<from secure store>
   ZKT_IP=192.168.22.201
   ZKT_PORT=4370
   ZKT_MACHINE_NUMBER=1
   POLL_INTERVAL_MS=300000
   ZKT_COMMAND_TIMEOUT=300000
   ZKT_POWERSHELL_TIMEOUT=300000
   ZKT_ATTENDANCE_LOOKBACK_DAYS=3
   ZKT_AUTO_PULL_HOURS=8,20
   ZKT_BRIDGE_ACTIVE_START_HOUR=8
   ZKT_BRIDGE_ACTIVE_END_HOUR=21
   ZKT_REALTIME_WAKE_ENABLED=true
   ZKT_WAKE_SERVER_ENABLED=false
   ```

   Confirm the lookback value against the remote backup during recovery; runtime
   startup logs reported 3 days. Do not change polling merely to mask an incident.
7. Run `install\verify-network.ps1` and `install\verify-zkt-com.ps1`.
8. Run `install\install-service.ps1`. It installs an Automatic service but leaves
   it STOPPED. Automatic startup intentionally supports reboot recovery on the
   replacement; captured production used Manual plus daily tasks. The executable
   retains its 08:00-21:00 work-hour gate. Do not add the captured 21:00 stop task
   without also recreating the 07:00 start task.
9. **Cutover:** Ensure the original worker is stopped/isolated and no other worker
   consumes this queue before `Start-Service ZKTBridge`. Never run a replacement
   worker against production as a parallel test. A stopped or powered-off old PC
   must not later rejoin with its old automatic tasks enabled.
10. Start the service and run `install\verify-bridge.ps1`. It checks service,
    exactly one worker, 32-bit COM, and configured network path. It never changes
    employees or attendance. `/health` was disabled in production; it is not
    silently enabled by this installer and there is no assumed DB heartbeat.
11. Verify Supabase subscription/polling via logs, then use the normal Farmplast
    **Test NJ** UI action. Require `done` AND `result.ok=true`, not status alone.
12. Run **Pull NJ**, then safely re-sync an existing employee through that
    employee's **ZKT Actions > Sync ZKT**. Do not create fake employees or test
    delete commands. Record command IDs, creation/pick/completion times, and UI
    success without timeout. Review logs locally without posting employee data.
13. Reboot the replacement during its approved cutover window, then verify service
    automatic startup, exactly one worker, COM/network, and the same safe read
    operation. This reboot test was NOT performed on production during capture.

## Recovery rollback and limits

On a failed replacement cutover, stop its worker before restoring the old PC's
service. Preserve records and credentials; do not reset queue statuses or replay
commands blindly. No production worker restart or SDK registration was necessary
in the 2026-09-08 investigation.

The installer scripts passed PowerShell parsing and manifest/hash checks; they
have NOT been executed on a disposable replacement Windows PC. A fresh-machine
drill, independently stored artifact/credential backup, and original editable
source remain outstanding. Git alone cannot reproduce this bridge.

## Capture preservation details

The old untracked development bridge was preserved intact at:
`C:\Users\Owner\Documents\farmplast\.private-zkt-recovery\zkt-bridge-old-20260908-123231`.
It contains potentially stale code/configuration and must never be deployed as the
production source. Its secrets remain outside the Git package.

Offline archive:
`C:\Users\Owner\Documents\farmplast\.private-zkt-recovery\verified-nj-5591-tl-20260908-artifacts.zip`

Archive SHA256:
`FCCB670C95FCDB1155DEFF34EEA3D517F511FF12E0A0F0CEB814916C0F5FE5C7`.
Every archived runtime/SDK entry was reopened and hash-checked against the remote manifest.

Captured NSSM log rotation settings were all zero (disabled). The installer
preserves those values. Monitor disk use and decide any retention change separately.

The captured Windows host blocks unsigned script files by default. For the reviewed
recovery scripts, invoke Windows PowerShell with a process-scoped override if needed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install\verify-bridge.ps1
```

Use the same invocation form for the other reviewed scripts. Do not permanently
weaken the machine execution policy. The health script was run against production
from its protected backup directory; the installer was not run there.
