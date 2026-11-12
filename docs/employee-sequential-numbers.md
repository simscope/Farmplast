# Sequential Employee Numbers and manual selection

This change is prepared locally after `fa6ae1c`. Production SQL and deployment require separate owner authorization.

## Cause

The previous P0 intentionally implemented the earlier requirement that Number Reuse OFF must exclude every historical number. `employee_creation_used_numbers()` unions employees, all reservations, terminal principals and raw logs; the allocator raises `Employee number has already been used or reserved`. Independent barriers also include the former-number branch in `guard_employee_feature_mutation`, held-reservation uniqueness and global ZKT ID uniqueness. Changing only the UI or allocator would not repair the complete path.

The previous UI made the number read-only and submitted NULL, allowing the server to choose another number. The new requirement instead preserves the selected number.

## Behavior

- The initial RPC fills the smallest free number. The creation field is editable and required. Changing it also changes the new profile's default ZKT User ID. A late RPC/retry cannot overwrite manual input, including an intentionally cleared field.
- The Dashboard creation payload sends the selected integer. The server validates range and current occupancy under the existing transaction advisory lock; it never silently substitutes another number. A conflict names the next free number. Direct clients may still request automatic allocation with NULL.
- Active employee numbers and active terminal identifiers remain occupied. An unreleased, unfinished assignment also remains occupied. Confirmed former/terminated HR assignments are reusable without enabling the advanced lifecycle/reuse UI flags.
- The existing configured `minimum` and non-NULL `maximum` bound HR allocation. If maximum is NULL, PostgreSQL INT is the storage bound, not a newly invented terminal limit. Terminal sync still requires its verified configured range/inventories.

## Storage and identity boundaries

Apply only `supabase/employee_sequential_numbers.sql` after the previous P0 patch. It adds `hr_released_at` to reservations and `work_started_at` to employment periods, updates the reservation index and replaces global ZKT ID uniqueness with active-only uniqueness. The existing active Employee Number unique index remains intact.

When a former number is assigned, only the old HR reservation is marked released. Physical release evidence (`released_at`) is retained unchanged. No former employee row, attendance event, Payroll record or historical ownership row is updated/deleted. New profiles keep separate UUIDs, periods and reservations. Failed inserts/RLS roll back the HR claim as part of the same transaction.

New periods record the later of assignment creation time and the hire-date start in America/New_York. New mapping/work-log guards reject earlier timestamps. Existing mapping overlap checks, immutable event ownership and the deployed Attendance processor remain unchanged. Replayed old events keep old UUID ownership or remain unassigned; they cannot be inferred from the current number when it has multiple owners. The tests exercise the deployed processor source definitions.

A reused physical identifier remains pending until prior terminal identity absence/replacement and inventories are verified. The HR profile saves even offline, with a truthful synchronization reason. No terminal commands are queued for an unsafe reuse. No Bridge, terminal, biometric, Presence or SACS SSO changes are included. Existing SACS bulk sync already filters Active Employees and carries `source_employee_id`; new outbox records use the new UUID. Recipient-side identity conflicts must remain fail-closed rather than merge people by number.

## Validation

- Full suite: 175/175 pass. Build passes; lint has zero errors and six existing warnings outside this change.
- Native PostgreSQL 18.4: former #3 becomes a new UUID; next automatic number is #4; manual #20 persists; simultaneous chosen #3 gives one success and one conflict suggesting #4; simultaneous NULL allocations return distinct #5/#6. New rows persist through a fresh authenticated connection.
- Database tests cover range exhaustion, RLS rollback, authorization, old/raw replay ownership, timestamp boundaries, old Payroll preservation, active-only SACS UUID payloads and offline ZKT.
- Browser: actual EmployeeModal and number utility against a temporary loopback PostgreSQL adapter; auto #3, editable/manual #20, reload persistence, Active #1 rejection with suggestion #3, former #3 selection, then auto #4. This is a local component/database integration test, not hosted Supabase/PostgREST E2E. No production test employees or writes.

Run `npm test`, `npm run build`, `npm run lint` from client. For native concurrency run `node client/scripts/verify-sequential-numbers.mjs <guarded-local-runtime> <report-path>` from the repository root.

## Release and rollback

Archive remains ON; Terminate, Rehire and advanced Number Reuse switches remain OFF. These switches still protect updates/renumbering of existing people; normal new-profile number selection no longer depends on enabling them. Review the new schema/index patch and take a fresh targeted backup before any authorized release. Deploy the matching UI and SQL together under the approved rollout procedure.

After any real reuse, do not restore a global uniqueness index across former and active profiles or restore the database over new data. A rollback must preserve all people, HR claims, timestamp boundaries and active uniqueness. Stop further creation and review the function/UI rollback against actual new assignments first. No automatic data deletion or whole-database restore is part of this change.
