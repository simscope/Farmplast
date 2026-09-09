# Candidate v2 build and offline verification

This builds a reconstructed candidate, not the historical executable. Do not use
the recovery installers to deploy this candidate. The historical runtime and its
SHA256 remain unchanged. Full production equivalence has not been established.

## Toolchain

Validated on Windows x64 using host Node 24.19.0 and npm 11.17.0. The executable
contains Node **18.5.0 x64**, packaged with **pkg 5.8.1**, whose resolved pkg-fetch
is **3.4.2**. The historical packager version is unknown. Dependencies are pinned
in package.json and package-lock.json. Run from `client/zkt-bridge`:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run test:exe
Get-FileHash build/zkt-bridge-v2.exe -Algorithm SHA256
```

On this development PC the roaming npm wrapper is broken. Equivalent invocation:
`node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' <arguments>`.

The build script invokes:

```text
pkg . --targets node18-win-x64 --no-bytecode --public-packages * --public --output build/zkt-bridge-v2.exe
```

It verifies the fetched base runtime against SHA256
`e0e9a647d81011612f8cb19c6a41760643eedd27222af548e9ffdff7d8ebb94b`
before packaging. The first build may download this public pkg runtime; subsequent
builds use the pkg-fetch cache. A different runtime is rejected. `--no-bytecode`
preserves readable candidate source in the new package. Build output and
BUILD-MANIFEST.json are local, ignored artifacts. The manifest records the actual
host, tool version, runtime hash, output path and executable hash. Repeat builds
from the same canonical checkout were compared; see SOURCE-RECONSTRUCTION.md.
Reproducibility across different directory names/OS versions is not established.

## Offline operation

```powershell
node src/bridge.cjs --self-test
.\build\zkt-bridge-v2.exe --self-test
.\build\zkt-bridge-v2.exe --serve-offline --state-dir "$env:TEMP\zkt-v2-offline"
```

Offline server binds 127.0.0.1 on a dynamically selected port, reported in its
JSON log. `/health` reports offline status. Send `shutdown` on stdin or Ctrl+C for
clean shutdown. Mock adapters never create a Supabase client or COM object.
No-argument launch refuses to start. No production `.env` is loaded implicitly.

Tests exercise mocked queue/SDK operations, real local 32-bit PowerShell running
a mock script, a timed-out local child, and packaged executable startup/shutdown.
They do not instantiate zkemkeeper or contact Supabase/ZKT. Local COM integration
is unavailable: the previously inspected registration points to a missing DLL.
Loading pinned dependencies under packaged Node 18.5.0 succeeds, but that is not
validation of every live Supabase path under this older runtime.

## Future controlled evaluation only

Live adapters require all of `--live`, `--config <explicit-path>`, and
`ZKT_V2_ALLOW_LIVE=true`. These switches are safety gates, not deployment approval.
Use a dedicated test database and spare ZKT device for comparison. Never run the
historical worker and v2 against the same live device/queue concurrently. The v2
named-pipe singleton prevents a second v2 process, not the historical worker.

Configuration names/defaults are in src/core.cjs and PRODUCTION-CONTRACT.md.
Default state directory is `%USERPROFILE%\.farmplast-zkt-v2`; restrict access like
other operational data because command results can contain employee identifiers.
Use a stable protected directory for any future service identity. Do not publish
state, credentials or device data. Work-hour checks gate incoming wakes; an active
drain may finish after the configured end hour.

After uncertain SDK execution, `SDK-UNCERTAIN` blocks further SDK calls. Do not
blindly delete it or replay the command. Inspect the device, child processes,
command ownership and journal first. A pending terminal DB write is retried without
repeating the SDK call. Unrelated workers' running rows are never reclaimed.

## Repeat the static extraction

`node scripts/recover-package.cjs <historical-exe> <new-private-output-directory>`
validates the historical hash and writes a classified VFS inventory, raw entries,
dependency source-map content and bytecode strings without executing them.
Keep that output outside Git; it is analysis material, not canonical source.
