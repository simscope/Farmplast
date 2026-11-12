-- MANUAL SECURITY OPERATION ONLY. Not an application migration.
-- Requires separate owner approval, pinned SACS connection and service inventory.
-- Do not run via linked CLI; it can recreate the temporary login.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.farmplast_sync_config') IS NULL
     OR to_regprocedure('public.sync_farmplast_employee(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'SACS integration markers missing; verify pinned project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cli_login_postgres') THEN
    RAISE EXCEPTION 'Role absent; re-audit instead of assuming cleanup';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cli_login_postgres'
             AND (rolvaliduntil IS NULL OR rolvaliduntil>=now())) THEN
    RAISE EXCEPTION 'Credential may be current; service/owner review required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename='cli_login_postgres') THEN
    RAISE EXCEPTION 'Active connections; review before disabling';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid
             WHERE d.refclassid='pg_authid'::regclass AND r.rolname='cli_login_postgres')
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
                 WHERE r.rolname='cli_login_postgres') THEN
    RAISE EXCEPTION 'Dependencies found; do not delete/reassign objects';
  END IF;
  ALTER ROLE cli_login_postgres NOLOGIN PASSWORD NULL;
  REVOKE postgres FROM cli_login_postgres;
END $$;
COMMIT;
SELECT rolname,rolcanlogin,rolvaliduntil FROM pg_roles WHERE rolname='cli_login_postgres';
SELECT rolpassword IS NOT NULL AS verifier_present FROM pg_authid WHERE rolname='cli_login_postgres';
SELECT count(*) AS sessions FROM pg_stat_activity WHERE usename='cli_login_postgres';
SELECT count(*) AS memberships FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
WHERE r.rolname='cli_login_postgres';
