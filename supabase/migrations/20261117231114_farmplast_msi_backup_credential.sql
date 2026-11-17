-- Operational credential history marker for 20261117231114.
-- The hosted change installed a SCRAM verifier from the MSI private directory.
-- Passwords/verifiers are intentionally not version-controlled or replayed here.
-- Fresh installations must provision the separate backup credential on MSI.
DO $backup_role_check$
BEGIN
  IF to_regrole('farmplast_msi_backup') IS NULL THEN
    RAISE EXCEPTION 'Provision the dedicated MSI backup reader first';
  END IF;
END
$backup_role_check$;
