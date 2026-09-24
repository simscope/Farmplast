# Employee synchronization to SACS

Single employee sync and NJ/PA bulk sync start ZKT and SACS independently. Each has
its own dashboard status. A failure in either target does not roll back or relabel
the other target. Existing ZKT queue/protocol logic is unchanged.

The browser POSTs a selected employee UUID or NJ/PA plant to `/api/sync-sacs` with
its Farmplast access token. The Vercel function validates the user with Supabase
and reads allowlisted employee fields under that user's existing RLS permissions.
It does not trust browser-supplied employee data. Bulk uses active, ZKT-enabled
employees from the selected plant and skips missing ZKT user IDs/names, matching
bridge eligibility. A single selected inactive employee is still sent to SACS so
it can be deactivated even if ZKT rejects that sync.

Server environment variables:

- `SACS_SYNC_ENABLED` — set to `true` only after SACS reconciliation passes.
- `SACS_EMPLOYEE_SYNC_URL` — deployed SACS `sync-farmplast-employees` Edge Function.
- `SACS_FARMPLAST_SYNC_SECRET` — shared server-only secret, never `VITE_*`.
- Existing public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` identify the
  Farmplast project; the user's bearer token supplies database authorization.

Only names, number, phone, email, position, active state and source UUID are sent.
Payroll, attendance, ZKT credentials and other fields are never forwarded.

An employee rename preserves the source UUID and SACS identity. A replacement
worker must have a new Farmplast UUID: editing a departed worker's existing row
cannot signal a new identity to either system. Number reuse with a new UUID is
supported; the old SACS identity is archived without moving its history.

The first reconciliation includes the complete Farmplast roster, not only the
ZKT-eligible subset. Ongoing bulk actions intentionally retain existing ZKT scope.
Use single sync for inactive employees after deactivation. Missing phones remain
missing; the integration does not invent login numbers or replace them with IDs.

Run `node --test tests/sacs-sync.test.mjs` in `client` for eligibility, payload,
authorization and failure-independence tests. No tests write production data.
