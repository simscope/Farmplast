# Verified Farmplast ZKT recovery capture

Captured from the running NJ production bridge on **nj-5591-tl**, 2026-09-08,
after real UI connection, employee sync, and attendance tests passed.

Read [docs/RECOVERY.md](docs/RECOVERY.md) before installation.

This is a **binary recovery package**, not recovered editable source. The original
`bridge.cjs` is present in the EXE as compiled V8 bytecode only. No local
development bridge has been substituted. The original source and build lockfile
remain missing; do not claim that this package can rebuild the EXE from source.

`runtime/` contains exact verified artifacts in the local recovery copy. Runtime
binaries and proprietary SDK files are deliberately excluded from the public Git
commit pending complete redistribution/license review. Preserve the separate
offline artifact archive described in RECOVERY.md. Git alone is not sufficient.

No production secrets, employee records, logs, or SSH keys belong in this tree.
