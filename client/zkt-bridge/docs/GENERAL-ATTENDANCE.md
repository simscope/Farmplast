# Common ZKT attendance and reused numbers

All workers use the same server-side assignment rule. A serial-verified terminal
readback must match the active employee's terminal ID, configured name and open
employment period. `confirm_zkt_assignment_readback` creates the interval once;
existing explicitly verified dates remain intact. A new employee's interval
starts at its HR assignment timestamp or hire date, whichever is later. Existing
pre-release profiles without a verified interval receive only a forward binding.
Old device/number intervals may close only after their owner is inactive or the
period is closed, and cannot exclude a permanently owned event.

The separate manual-hour rule remains in force: an authenticated admin can add
and edit a first engagement's manual hours from its confirmed hire date, even
when the profile was entered later. ZKT assignment timestamps, later engagement
boundaries, transfers, permanent UUID ownership and issued checks retain their
existing guards. Automatic imports never overwrite manual or completed rows.

`ingest_zkt_attendance_batch` receives all identifiers together, validates NY
clock/DST conversion, commits device evidence and idempotent legacy rows, and
defers the existing per-row processing trigger during that batch. The unchanged
production work-log processor runs once after the import. Old raw rows and
permanent owners are immutable. Number-only compatibility cannot select punches
from before a newly created employee's assignment.

NJ's `ZKTAttendance` service uses `--live --common-attendance --config <private>`
and requires process `ZKT_V2_ALLOW_LIVE=true`. It exclusively owns
`pending_attendance` commands (attendance and individual sync). The original
`ZKTBridge` binary remains responsible for bulk sync, verify, test and delete;
its legacy auto attendance is disabled with a non-hour value. The common service
performs all-employee attendance at 8 AM / 8 PM, and shares the 7 AM start / 9 PM
stop tasks. No per-employee ID/date allowlist or delayed companion task remains.

PA retains its existing service, full command set, SDK and schedule; only its
attendance path uses the common RPCs. SDK writes for requested employee syncs
require a matching device user readback before confirmation. Explicit opt-out
stays disabled. New requested profiles queue the existing single-employee sync;
no advanced rehire/reuse flags are enabled by this release.

`--probe-live` (NJ) / `--probe-common` (PA) are read-only serial probes.
`--pull-all-once` (NJ) / `--pull-once` (PA) run the same import for commissioning.
`--drain-once` processes the existing command queue once for commissioning,
without automatic pulls or changing the configured daily work window. Run it
only while the corresponding normal worker is stopped or outside its window.
Cross-plant and reserved-account checks run before any requested SDK user write.
Saving a requested assignment queues its ordinary single-person sync. A partial
SDK response confirms only the matching employee; missing users in that response
never generate jobs for other employees. Explicitly disabled and device-deleted
identities are not automatically recreated.
Private config, runtime binaries, operational backups and task outputs stay out
of Git. The previous two mapped-attendance tasks are removed after cutover.
