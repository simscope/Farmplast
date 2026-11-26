# Night-shift Presence cache correction

The scheduled Presence snapshot grouped punches by calendar date, although the
existing attendance processor uses a shift work date. A normal night sequence
such as 24 November 18:52 → 25 November 07:08 → 25 November 18:43 therefore
classified the morning OUT as IN and the next evening IN as OUT. The earlier
attendance compatibility implementation already documented the shift-day rule;
the cached reader had lost it.

The migration restores that rule only in
`employee_presence_private.refresh_snapshot()`:

- Night punches before 12:00 belong to the previous work date.
- IN/OUT parity is counted by employee UUID and work date.
- The same work date is returned as `last_work_date`.
- Day-shift grouping is unchanged.

The original ownership CTE, verified device/assignment and reused-number guards,
authorization, advisory lock and function attributes are retained verbatim.
The view, policies, permissions, attendance processor, import schedules and
frontend polling are unchanged. No new database table or external service is
installed; temporary verification tables disappear when the transaction ends.

The migration checks the exact existing function fingerprint, compares all rows
of public and ZKT-private application tables before/after, and checks unchanged
day-shift states, punch timestamps, function permissions and view/snapshot RLS.
Any failed guard rolls back the complete transaction. It refreshes only the
derived Presence snapshot; it never rebuilds or edits attendance/work logs,
manual hours, financial records or employee profiles.

The complete migration was rehearsed on the live database with `ROLLBACK`, with
76 snapshot rows and every data/security guard passing. The original function
fingerprint and snapshot timestamp were verified unchanged after that rehearsal.
The baseline function is retained as source-only test fixture; it contains no
employee records or credentials.

Applied to Farmplast on 25 November 2026 at 20:26 New York, migration
`20261126012607_fix_night_presence_shift_day`. All protected data fingerprints
matched before and after. Employee/assignment ownership resolver, attendance
processor and view fingerprints remained unchanged. Security Advisor categories
also remained unchanged.

Current examples after refresh: employees 61, 51 and 46 have evening IN / ON SITE;
47 and 60 have morning OUT / OFF SITE. Employee 49 remains IN. Only night-derived
states/work dates changed. Five focused PGlite regression tests against the
complete baseline function and guarded migration passed, along with the client
production build and targeted ESLint.

This correction retains existing chronological pairing. It does not invent a
missing evening mark, infer direction from terminal mode 255, or merge separate
punch timestamps. A missed departure remains subject to the existing 13-hour
open-shift display rule. Presence reflects the latest imported ZKT data and is
updated by the existing schedule or Refresh button.
