# Runtime artifacts

The verified local capture contains `zkt-bridge.exe` and `nssm.exe` here.
They are excluded from the public Git commit. Restore both from the offline
recovery artifact archive and verify SHA256 using the manifest before installing.
The executable embeds Node 18.5.0 and its npm dependencies; do not run `npm install`
or substitute a separately built executable during disaster recovery.
