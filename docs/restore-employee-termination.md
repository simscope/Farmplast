# Restore employee termination

The Status selector was disabled for existing profiles, the roster termination button led to a removed `#employment-history` section, and both the feature/release switches were OFF. The older RPC also required every historical work row to be approved, while the application provides no approval workflow.

Existing profiles now have an explicit **Terminate employee** action in the Dashboard edit form, the roster and the active payroll card. A confirmation dialog loads the last recorded working day and requires a date. It changes employment status only; other unsaved profile edits must be saved first. Confirmation archives the existing UUID and preserves its original number, work logs, payments and checks. No employee is terminated by deploying the application or applying the SQL.

`supabase/restore_employee_termination.sql` adds guarded preview/termination RPCs and restores the existing lifecycle entry point. Closed `approved=false` rows are retained without modification. The follow-up patch `supabase/employee_termination_without_settlement.sql` removes the open-shift and outstanding-check prerequisites. These records remain exactly as stored when the employee is archived. Work after the cutoff, invalid dates and non-admin callers still prevent termination. Existing employee-row locks serialize work-log writes and concurrent termination. Physical terminal release evidence is not manufactured.

The patch enables Terminate and the common lifecycle gate. Archive remains ON; Rehire and advanced Number Reuse remain OFF. It also removes only the Terminate switch from the legacy attendance-owner compatibility gate: otherwise enabling termination would disable Presence/Attendance input for every unique active legacy employee. UUID/period ambiguity checks, duplicate-number quarantine, the Attendance processor and SACS SSO remain unchanged.

SACS delivery runs after the confirmed archive. An outage is reported as pending and cannot cause another termination. Terminal deactivation remains separately tracked; saving an archive does not claim hardware acknowledgement.

Validation: 181/181 tests pass (single V8 worker to avoid host memory pressure), build passes, lint has 0 errors / 6 existing warnings. Native PostgreSQL 18.4 verifies concurrent termination, post-termination work-write rejection, number reuse by a different UUID, unchanged work/payroll/raw history and a single SACS disable operation. Browser automation was unavailable during preparation; production acceptance must not submit termination of a real employee merely as a test.

For release, save the current function definitions, flags, release gate, worker/history tables and Presence output. Stage the exact committed UI, apply only this patch, compare Presence and historical rows, inspect authenticated preview without calling termination, then promote. A rollback must restore the old resolver together with the prior Terminate/release switch states. Never overwrite the employee database or reverse a real user termination as deployment cleanup.

The settlement follow-up changes only the termination function and the UI blocker list. Apply it after the original restore patch; it does not change feature flags or settle, close, void, or recalculate any historical records.

`employee_termination_async_sacs.sql` removes the running-SACS prerequisite from termination. Remote SACS operations remain serialized per employee UUID in the claim RPC, so a delayed activation cannot overtake the disable. An uncertain prior request leaves deactivation pending; employment is already archived. SSO and the external SACS contract remain unchanged.
