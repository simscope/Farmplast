-- MANUAL ONLY: requires separate explicit owner authorization and confirmed
-- external-service inventory. Never include in deployment/migrations.
-- Use a pinned SACS administrative libpq service, NOT a linked CLI login.
\set ON_ERROR_STOP on
\if :{?owner_authorized}
\else
  \set owner_authorized no
\endif
\if :{?external_inventory_confirmed}
\else
  \set external_inventory_confirmed no
\endif
\if :{?expected_role_oid}
\else
  \set expected_role_oid 26135
\endif
BEGIN;
SELECT set_config('farmplast.remediation.owner_authorized', :'owner_authorized', true),
       set_config('farmplast.remediation.external_inventory_confirmed', :'external_inventory_confirmed', true),
       set_config('farmplast.remediation.expected_oid', :'expected_role_oid', true);
DO $guard$
DECLARE
  target pg_catalog.pg_authid%ROWTYPE;
  postgres_oid oid;
BEGIN
  IF current_setting('farmplast.remediation.owner_authorized') <> 'yes'
     OR current_setting('farmplast.remediation.external_inventory_confirmed') <> 'yes' THEN
    RAISE EXCEPTION 'Owner authorization and confirmed external inventory required';
  END IF;
  IF current_database() <> 'postgres'
     OR to_regclass('public.farmplast_sync_config') IS NULL
     OR to_regprocedure('public.sync_farmplast_employee(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Wrong database / SACS markers; verify pinned project';
  END IF;
  SELECT * INTO STRICT target FROM pg_catalog.pg_authid WHERE rolname='cli_login_postgres';
  IF target.oid <> current_setting('farmplast.remediation.expected_oid')::oid THEN
    RAISE EXCEPTION 'Role OID changed; stop and re-audit';
  END IF;
  IF NOT target.rolcanlogin OR target.rolpassword IS NULL
     OR target.rolvaliduntil IS NULL OR target.rolvaliduntil >= now()
     OR target.rolsuper OR target.rolinherit OR target.rolcreaterole
     OR target.rolcreatedb OR target.rolreplication OR target.rolbypassrls THEN
    RAISE EXCEPTION 'Unexpected role attributes / credential state; stop and re-audit';
  END IF;
  IF NOT pg_has_role(current_user,'pg_read_all_stats','USAGE') THEN
    RAISE EXCEPTION 'Insufficient session visibility';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usesysid=target.oid)
     OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=target.oid)
     OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=target.oid) THEN
    RAISE EXCEPTION 'Active sessions or dependencies; stop';
  END IF;
  SELECT oid INTO STRICT postgres_oid FROM pg_roles WHERE rolname='postgres';
  IF (SELECT count(*) FROM pg_auth_members WHERE member=target.oid) <> 1
     OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=target.oid
       AND roleid=postgres_oid AND NOT admin_option AND NOT inherit_option
       AND set_option AND pg_get_userbyid(grantor)='supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected memberships/options/grantor; stop and re-audit';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE username=target.rolname OR command ILIKE '%cli_login_postgres%')
     OR EXISTS(SELECT 1 FROM pg_proc WHERE prokind='f' AND pg_get_functiondef(oid) ILIKE '%cli_login_postgres%')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE array_to_string(rolconfig,',') ILIKE '%cli_login_postgres%')
     OR EXISTS(SELECT 1 FROM pg_db_role_setting WHERE array_to_string(setconfig,',') ILIKE '%cli_login_postgres%') THEN
    RAISE EXCEPTION 'Internal usage references found; stop';
  END IF;
  -- The only production mutations permitted by a subsequent approval:
  ALTER ROLE cli_login_postgres NOLOGIN;
  ALTER ROLE cli_login_postgres PASSWORD NULL;
  REVOKE postgres FROM cli_login_postgres GRANTED BY supabase_admin;
  -- Check before COMMIT: any failure rolls back all three operations.
  IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE oid=target.oid
       AND rolname='cli_login_postgres' AND NOT rolcanlogin AND rolpassword IS NULL)
     OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=target.oid)
     OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usesysid=target.oid) THEN
    RAISE EXCEPTION 'Postconditions failed; transaction must roll back';
  END IF;
END
$guard$;
COMMIT;
SELECT oid,rolname,rolcanlogin,rolpassword IS NOT NULL AS verifier_present
FROM pg_authid WHERE rolname='cli_login_postgres';
SELECT count(*) AS remaining_memberships FROM pg_auth_members m
JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='cli_login_postgres';
