-- Restore the existing night-shift work-day rule in the cached Presence reader.
-- No attendance rebuild, Payroll update, employee change, or terminal operation.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
CREATE TEMP TABLE presence_fix_data_baseline(schema_name text,table_name text,row_count bigint,digest text) ON COMMIT DROP;
DO $baseline$
DECLARE target record;
BEGIN
  FOR target IN SELECT schemaname,tablename FROM pg_tables
    WHERE schemaname IN ('public','farmplast_zkt_private')
  LOOP
    EXECUTE format('INSERT INTO presence_fix_data_baseline SELECT %L,%L,count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t',
      target.schemaname,target.tablename,target.schemaname,target.tablename);
  END LOOP;
END;
$baseline$;
CREATE TEMP TABLE presence_fix_snapshot_before ON COMMIT DROP AS
  SELECT s.*,coalesce(e.shift_type,'day') AS shift_type
  FROM employee_presence_private.snapshot s JOIN public.employees e ON e.id=s.employee_id;
CREATE TEMP TABLE presence_fix_security_before ON COMMIT DROP AS
  SELECT p.proowner,p.proacl,p.proconfig,p.prosecdef,
    pg_get_viewdef('public.v_employee_current_presence'::regclass,true) AS view_definition,
    c.relrowsecurity,c.relforcerowsecurity
  FROM pg_proc p CROSS JOIN pg_class c
  WHERE p.oid='employee_presence_private.refresh_snapshot()'::regprocedure
    AND c.oid='employee_presence_private.snapshot'::regclass;
DO $patch$
DECLARE
  original text := pg_get_functiondef('employee_presence_private.refresh_snapshot()'::regprocedure);
  resolved_old text := $old$  SELECT l.punch_time_local, o.employee_id FROM public.zkt_attendance_logs l
  JOIN owners o ON o.raw_id=l.id WHERE l.punch_time_local IS NOT NULL AND o.employee_id IS NOT NULL$old$;
  resolved_new text := $new$  SELECT l.punch_time_local, o.employee_id,
    l.punch_time_local::date - CASE
      WHEN coalesce(e.shift_type,'day')='night' AND l.punch_time_local::time < time '12:00'
      THEN 1 ELSE 0 END AS work_date
  FROM public.zkt_attendance_logs l
  JOIN owners o ON o.raw_id=l.id
  JOIN public.employees e ON e.id=o.employee_id
  WHERE l.punch_time_local IS NOT NULL AND o.employee_id IS NOT NULL$new$;
  latest_old text := $old$    CASE WHEN row_number() OVER (PARTITION BY l.employee_id,l.punch_time_local::date ORDER BY l.punch_time_local)%2=1 THEN 'IN' ELSE 'OUT' END AS last_punch_type,
    l.punch_time_local::date AS last_work_date$old$;
  latest_new text := $new$    CASE WHEN row_number() OVER (PARTITION BY l.employee_id,l.work_date ORDER BY l.punch_time_local)%2=1 THEN 'IN' ELSE 'OUT' END AS last_punch_type,
    l.work_date AS last_work_date$new$;
BEGIN
  IF md5(original) <> 'f7b3e06f3818bce58144e249fbf7f02e' THEN
    RAISE EXCEPTION 'Presence definition changed; review before applying night shift fix';
  END IF;
  IF length(original)-length(replace(original,resolved_old,'')) <> length(resolved_old)
     OR length(original)-length(replace(original,latest_old,'')) <> length(latest_old) THEN
    RAISE EXCEPTION 'Expected Presence grouping was not found exactly once';
  END IF;
  -- Reuse the complete existing definition so authorization, UUID ownership,
  -- transfer/reused-number guards, advisory lock and ACLs are retained.
  EXECUTE replace(replace(original,resolved_old,resolved_new),latest_old,latest_new);
END;
$patch$;
SELECT employee_presence_private.refresh_snapshot();
DO $verify$
DECLARE target record; actual_count bigint; actual_digest text;
BEGIN
  FOR target IN SELECT * FROM presence_fix_data_baseline LOOP
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t',target.schema_name,target.table_name)
      INTO actual_count,actual_digest;
    IF actual_count IS DISTINCT FROM target.row_count OR actual_digest IS DISTINCT FROM target.digest THEN
      RAISE EXCEPTION 'Protected table %.% changed; rolling back Presence fix',target.schema_name,target.table_name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM presence_fix_snapshot_before b
    FULL JOIN employee_presence_private.snapshot s ON s.employee_id=b.employee_id
    WHERE b.employee_id IS NULL OR s.employee_id IS NULL
      OR b.last_punch_time IS DISTINCT FROM s.last_punch_time
      OR (b.shift_type <> 'night' AND
        (b.last_punch_type IS DISTINCT FROM s.last_punch_type OR b.last_work_date IS DISTINCT FROM s.last_work_date))
  ) THEN RAISE EXCEPTION 'Presence changed timestamps or non-night states; rolling back'; END IF;
  IF EXISTS (
    SELECT p.proowner,p.proacl,p.proconfig,p.prosecdef,
      pg_get_viewdef('public.v_employee_current_presence'::regclass,true),c.relrowsecurity,c.relforcerowsecurity
    FROM pg_proc p CROSS JOIN pg_class c
    WHERE p.oid='employee_presence_private.refresh_snapshot()'::regprocedure
      AND c.oid='employee_presence_private.snapshot'::regclass
    EXCEPT SELECT * FROM presence_fix_security_before
  ) THEN RAISE EXCEPTION 'Presence authorization changed; rolling back'; END IF;
END;
$verify$;
COMMIT;
