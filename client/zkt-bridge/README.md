# Verified Farmplast ZKT recovery capture

Captured from the running NJ production bridge on **nj-5591-tl**, 2026-09-08,
after real UI connection, employee sync, and attendance tests passed.

Read [docs/RECOVERY.md](docs/RECOVERY.md) before installation.

This tree preserves the **verified binary recovery documentation** and now adds an editable **candidate v2 reconstruction** in `src/`. The original
`bridge.cjs` is present in the EXE as compiled V8 bytecode only. No local
development bridge has been substituted. The original source and build lockfile
remain missing; do not claim that this package can rebuild the EXE from source.

`runtime/` contains exact verified artifacts in the local recovery copy. Runtime
binaries and proprietary SDK files are deliberately excluded from the public Git
commit pending complete redistribution/license review. Preserve the separate
offline artifact archive described in RECOVERY.md. Git alone is not sufficient.

No production secrets, employee records, logs, or SSH keys belong in this tree.

## Editable candidate v2

See [BUILD.md](docs/BUILD.md), [PRODUCTION-CONTRACT.md](docs/PRODUCTION-CONTRACT.md), and [SOURCE-RECONSTRUCTION.md](docs/SOURCE-RECONSTRUCTION.md). The candidate implements test, sync_one_employee and pull_attendance. It has offline tests and a pinned build, but production equivalence is NOT verified. The historical binary remains production. No candidate deployment is included.
