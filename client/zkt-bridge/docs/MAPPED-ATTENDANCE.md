# Device-verified attendance companion

The historical ZKTBridge service remains installed with its original executable,
configuration, commands and 7 AM / 9 PM service schedule. The reconstructed queue
worker is not used as a replacement. Only the new one-shot mode is installed in
a separate directory and run by two daily Windows tasks after the normal
8 AM / 8 PM attendance pulls.

`--probe-live` performs a read-only physical serial check against the registered
device. `--pull-mapped-once` reads SDK attendance without disabling the terminal
or changing users, filters explicit terminal IDs and the local start date, and
adds independently verified events through `ingest_zkt_identity_events`. It does
not claim or update command queue rows, insert/update legacy raw records, or
change old event ownership. A busy historical command causes a retry later.

The compatibility resolver accepts independent evidence only when a permanently
owned native event matches both the legacy local timestamp and UTC instant, and
the mapping is processing-verified for that device, identifier and interval.
Conflicting employee owners remain unresolved. Existing legacy ownership takes
precedence. Ordinary unambiguous employee-number handling is unchanged. The
production work-log processor, manual-hour protections and issued-check guards
are unchanged. The migration does not rebuild history or process any hours.

The protected installation directory contains a separate private `mapped.env`
derived locally from the existing configuration. Set the existing Supabase
credentials plus `ZKT_PLANT_LOCATION`, `ZKT_IDENTITY_DEVICE_KEY`,
`ZKT_EXPECTED_SERIAL_NUMBER`, `ZKT_MAPPED_TERMINAL_USER_IDS`, and
`ZKT_MAPPED_LOCAL_FROM` (`YYYY-MM-DD 00:00:00`). Both one-shot modes require the
explicit config path and process environment `ZKT_V2_ALLOW_LIVE=true`. Do not
commit the private configuration, runtime binary, task output or employee data.

The scheduled wrapper runs between 8 AM and 9 PM local time. Installation uses
SYSTEM tasks at 8:02 AM and 8:02 PM, a one-minute failure retry, a ten-minute
execution limit and IgnoreNew to prevent duplicate task instances. The EXE has
a separate one-shot singleton. The original service's start/stop tasks remain
unchanged. Removal consists of disabling the two companion tasks; it does not
require restoring the original service or modifying any historical attendance.
An administrator may explicitly use the wrapper's `-Commission` switch for an
initial end-to-end verification outside that daily window; daily tasks omit it.

Verification covers serial mismatch, missing scope, busy worker, date/identifier
filtering, exact UTC/local matching, reused employee numbers, cross-device
conflicts, unchanged original rows, automatic work-log creation and closed-check
protection. Production commissioning must compare before/after hashes of the
affected employees' work logs and payroll records, inspect task results, and
confirm the original executable hash and service configuration remain intact.
