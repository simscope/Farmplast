-- Dedicated MSI backup reader; no application data or grants are changed.
-- The separate credential is provisioned only into the MSI private directory.
BEGIN;
CREATE ROLE farmplast_msi_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;
GRANT CONNECT ON DATABASE postgres TO farmplast_msi_backup;
GRANT pg_read_all_data TO farmplast_msi_backup;
ALTER ROLE farmplast_msi_backup SET default_transaction_read_only = on;
ALTER ROLE farmplast_msi_backup SET search_path = pg_catalog;
ALTER ROLE farmplast_msi_backup SET timezone = 'UTC';
ALTER ROLE farmplast_msi_backup SET statement_timeout = '15min';
ALTER ROLE farmplast_msi_backup SET idle_in_transaction_session_timeout = '30min';
COMMENT ON ROLE farmplast_msi_backup IS 'MSI monthly encrypted Payroll backups; read grants only; no application cutover.';
COMMIT;

