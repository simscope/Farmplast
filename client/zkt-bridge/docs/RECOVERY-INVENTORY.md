# Recovery inventory

Canonical repository root: `client/zkt-bridge/`. Commit e290538 already used this
root. Neither zkt-recovery-staging nor .private-zkt-recovery was committed.

## 1. STORED IN GIT

All paths below are relative to client/zkt-bridge/:

- README.md
- .env.example (empty values only)
- .gitignore
- docs/RECOVERY.md
- docs/RECOVERY-INVENTORY.md
- docs/INCIDENT-20260908.md
- docs/PRODUCTION-BRIDGE-MANIFEST.json
- docs/EMBEDDED-PACKAGES.json
- install/install-bridge.ps1
- install/install-service.ps1
- install/preflight-replacement-pc.ps1
- install/verify-bridge.ps1
- install/verify-network.ps1
- install/verify-zkt-com.ps1
- runtime/README.md

## 2. STORED OFFLINE, NOT IN GIT

Artifact archive (no production configuration or credentials):
`C:\Users\Owner\Documents\farmplast\.private-zkt-recovery\verified-nj-5591-tl-20260908-artifacts.zip`

SHA256: `FCCB670C95FCDB1155DEFF34EEA3D517F511FF12E0A0F0CEB814916C0F5FE5C7`.

The archive contains runtime/zkt-bridge.exe, runtime/nssm.exe, the original capture
manifest and sdk/commpro.dll, sdk/mfc71.dll, sdk/msvcp71.dll, sdk/msvcr71.dll,
sdk/plcommpro.dll, sdk/zkemkeeper.dll. Extracted copies remain under the same
.private-zkt-recovery directory. Runtime EXEs also exist, ignored by Git, under
`C:\Users\Owner\Documents\GitHub\Farmplast\client\zkt-bridge\runtime\`.

Production configuration is protected separately on nj-5591-tl:
`C:\Program Files (x86)\ZKTBridge\.env` and
`C:\Farmplast-ZKT-Backup\20260908-121908\installation\.env`.
The latter backup also has the service registry export and scheduled-task XML.
Required configuration variable names are in .env.example and the manifest; no
values belong in Git. Independent secure storage of these production credentials
has not been verified. Loss of the remote disk must not be assumed recoverable
from the artifact ZIP alone.

The old incorrect local bridge remains intact at
`C:\Users\Owner\Documents\farmplast\.private-zkt-recovery\zkt-bridge-old-20260908-123231`.
It is not a recovery source and must not be deployed. SSH keys remain under the
Owner account's .ssh directory; they are not part of this inventory/package.

## 3. NOT YET RECOVERED / VERIFIED

- Original editable bridge.cjs, original build project and original lockfile.
- Reproducible source-to-executable build procedure.
- Original proprietary ZKT SDK installer and confirmed redistribution rights.
  Installed matching DLLs are preserved for offline restoration.
- Independently stored, retrievable backup of production credentials/configuration.
- An independent off-device backup of the local artifact archive.
- A completed blank-PC installation, cutover and reboot recovery drill.

The supported method is restoring the exact verified binary. Git alone cannot
compile it or supply credentials. Until configuration availability and a replacement
PC drill are verified, full binary disaster-recovery readiness is not certified.
