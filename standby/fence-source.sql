-- PREPARED ONLY. Run on Farmplast eeobivvwjzakbweluwtm after stopping NJ/PA workers.
-- Do not run while Payroll is meant to remain writable on Supabase.
BEGIN;
CREATE TABLE IF NOT EXISTS farmplast_zkt_private.msi_cutover_fence (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), frozen boolean NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON farmplast_zkt_private.msi_cutover_fence FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO farmplast_zkt_private.msi_cutover_fence(id,frozen) VALUES(true,true)
 ON CONFLICT(id) DO UPDATE SET frozen=true,changed_at=now();
CREATE OR REPLACE FUNCTION farmplast_zkt_private.msi_cutover_block() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT frozen FROM farmplast_zkt_private.msi_cutover_fence WHERE id) THEN
  RAISE EXCEPTION 'Payroll is frozen for MSI cutover' USING ERRCODE='25006';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSIF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSE RETURN NEW; END IF;
END$$;
REVOKE ALL ON FUNCTION farmplast_zkt_private.msi_cutover_block() FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE r record;BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('public','employee_presence_private','farmplast_zkt_private') AND c.relkind IN('r','p')
  AND NOT(n.nspname='farmplast_zkt_private' AND c.relname='msi_cutover_fence') LOOP
  IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid=format('%I.%I',r.nspname,r.relname)::regclass AND tgname='farmplast_msi_cutover_fence_row') THEN
   EXECUTE format('CREATE TRIGGER farmplast_msi_cutover_fence_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION farmplast_zkt_private.msi_cutover_block()',r.nspname,r.relname);
   EXECUTE format('CREATE TRIGGER farmplast_msi_cutover_fence_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION farmplast_zkt_private.msi_cutover_block()',r.nspname,r.relname);
  END IF;
 END LOOP;
END$$;
COMMIT;
-- Read-only verification: SELECT frozen FROM farmplast_zkt_private.msi_cutover_fence WHERE id;
-- Reopen Cloud ONLY after MSI is fenced and divergent MSI writes are reconciled:
-- UPDATE farmplast_zkt_private.msi_cutover_fence SET frozen=false,changed_at=now() WHERE id;
