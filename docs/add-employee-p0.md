# Add Employee P0

## Cause

The new-profile form incorrectly tied automatic number assignment to the number-reuse flag. With reuse OFF the required field was empty. The suggestion component also did not populate form state. Separately, the database allocator rejected ordinary profile creation when the terminal maximum or verified terminal inventories were absent. Production read-only inspection found a NULL maximum and no registered identity devices; these are real missing terminal configuration, not an RLS failure.

## Change

New profiles always request a suggested unused number and populate the form. The insert sends NULL so the server allocates the final number under the existing transaction advisory lock. With reuse OFF, numbers in employees, employment periods, reservations (including released reservations), terminal principals, retained terminal identifiers and raw attendance are excluded. Explicit inserts are validated on the server too.

Saving an HR profile does not require a terminal connection or terminal range. Requested synchronization remains pending and unconfirmed; the saved record explains missing configuration. Terminal activation is queued only when the existing verified-range/inventory requirements are met. Opt-out queues no terminal command. Existing SACS outbox payloads are retained. No terminal range is invented, and no flags are enabled.

## Verification

- `npm test` includes six new database regression tests for reproduction, allocation, validation, authenticated access/RLS, terminal readiness and unchanged history.
- `npm run build` and `npm run lint`.
- `node client/scripts/verify-employee-creation.mjs <local-runtime-directory> <report-path>` creates a disposable synthetic database on the guarded loopback PostgreSQL cluster. It checks two concurrent sessions, duplicate rejection, RLS rollback, requested/disabled ZKT, persistence from a fresh connection and unchanged historical fixtures.
- Tests use production SQL definitions with synthetic data and local authenticated-role fixtures. They do not exercise hosted Supabase Auth/PostgREST, a physical terminal, or the browser end-to-end.

Verified locally on 2026-10-23: 168/168 tests pass; build passes; lint has 0 errors and 6 existing warnings outside this change. Native PostgreSQL 18.4 verification passes, including real concurrent transactions and persistence through a fresh connection.

## Release boundary

This commit is local preparation only. Applying `supabase/employee_creation_fix.sql` to production and deploying the UI both require explicit authorization. Apply the reviewed function patch before the UI; a frontend-only deployment does not repair the server allocator. The script changes functions only, with no employee data, table migration, flag change, Attendance processor, Bridge or SACS SSO change.

Keep Archive Read-Only ON and Terminate, Rehire and Number Reuse OFF. Terminal configuration must be verified separately before pending identities can be provisioned. Do not create production test employees.
