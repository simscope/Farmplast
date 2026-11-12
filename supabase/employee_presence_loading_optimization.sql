-- Farmplast employee dashboard loading: identical resolver query, cached PL/pgSQL plan.
-- Keep ownership/transfer checks, view schema, ACLs and security_invoker unchanged.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.zkt_compat_event_owner(uuid)'::regprocedure)) <> 'f7393413a29b7c6a32aee579dbfe3704'
     OR md5(pg_get_viewdef('public.v_employee_current_presence'::regclass, true)) <> 'd65653793e204ebfe10543a198ad1ede' THEN
    RAISE EXCEPTION 'Presence definitions changed; abort optimization';
  END IF;
END
$guard$;

CREATE TEMP TABLE presence_loading_contexts ON COMMIT DROP AS
SELECT 'nonadmin'::text AS context, '{}'::jsonb AS claims
UNION ALL
SELECT 'admin', jsonb_build_object('sub', id, 'role', 'authenticated')
FROM public.profiles WHERE role = 'admin' ORDER BY context;

CREATE TEMP TABLE presence_loading_baseline (
  context text PRIMARY KEY,
  owners jsonb,
  rows jsonb
) ON COMMIT DROP;

DO $baseline$
DECLARE
  c record;
  owner_rows jsonb;
  presence_rows jsonb;
BEGIN
  FOR c IN SELECT * FROM presence_loading_contexts LOOP
    PERFORM set_config('request.jwt.claims', c.claims::text, true);
    SELECT jsonb_agg(jsonb_build_array(id, public.zkt_compat_event_owner(id)) ORDER BY id)
      INTO owner_rows FROM public.zkt_attendance_logs;
    SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)
      INTO presence_rows FROM public.v_employee_current_presence v;
    -- Multiple admin accounts share a privilege context, so key by full claims as well.
    INSERT INTO presence_loading_baseline
      VALUES (c.context || ':' || c.claims::text, owner_rows, presence_rows);
  END LOOP;
END
$baseline$;

CREATE OR REPLACE FUNCTION public.zkt_compat_event_owner(p_raw_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 RETURN (
  with raw_event as (select * from public.zkt_attendance_logs where id = p_raw_id),
  owned as (
    select o.employee_id, h.period_id
    from raw_event l join public.zkt_identity_events r on r.legacy_raw_id = l.id
    join public.zkt_event_ownership o on o.event_id = r.id
    join public.zkt_identifier_history h on h.id = o.mapping_id
  ), numbered as (
    select e.id from raw_event l join public.employees e on e.employee_number = l.employee_number
    where not exists (select 1 from public.employees other where other.employee_number = l.employee_number and other.id <> e.id)
      and not exists (select 1 from public.employee_employment_periods p where p.employee_number = l.employee_number and p.employee_id <> e.id)
      and not exists (select 1 from public.zkt_identifier_history h where h.terminal_user_id = l.employee_number::text and h.employee_id <> e.id
        and l.punch_time >= h.valid_from and (h.valid_to is null or l.punch_time < h.valid_to))
      and not exists (select 1 from public.employee_feature_flags where flag in ('employee_rehire', 'employee_number_reuse') and enabled)
  ), resolved as (
    select employee_id as id, period_id from owned
    union all select id, null::bigint from numbered where not exists (select 1 from owned)
  )
  select case when count(distinct r.id) = 1 then min(r.id::text)::uuid end
  from resolved r join public.employees e on e.id = r.id cross join raw_event l
  left join lateral (
    select p.id, p.hire_date, p.work_started_at, p.terminal_user_id, p.transferred_from_period_id
    from public.employee_employment_periods p where p.employee_id = e.id
    order by p.id desc limit 1
  ) transfer on transfer.transferred_from_period_id is not null
  where (e.active is true or public.employee_archive_admin())
    and (transfer.id is null or (
      l.punch_time >= transfer.work_started_at and l.employee_number = transfer.terminal_user_id
      and (r.period_id = transfer.id or (
        r.period_id is null and e.zkt_enabled is true
        and not exists (select 1 from public.zkt_reserved_terminal_identifiers reserved
          where reserved.terminal_user_id::numeric = l.employee_number)
        and not exists (select 1 from public.employee_employment_periods prior
          join public.employee_number_reservations hold on hold.period_id = prior.id
          where prior.terminal_user_id = l.employee_number and prior.employee_id <> e.id and hold.released_at is null)
      ))
      and l.punch_time_local::date - case when e.shift_type = 'night' and l.punch_time_local::time < time '12:00'
        then 1 else 0 end >= transfer.hire_date
      and not exists (
        select 1 from public.employee_work_logs w where w.employee_id = e.id
          and w.work_date = l.punch_time_local::date - case
            when e.shift_type = 'night' and l.punch_time_local::time < time '12:00' then 1 else 0 end
          and coalesce(w.created_at <= transfer.work_started_at, true)
      )
    ))
 );
END;
$function$;

CREATE OR REPLACE VIEW public.v_employee_current_presence
WITH (security_invoker = true) AS
 WITH resolved_punches AS MATERIALIZED (
SELECT raw_log.punch_time_local, public.zkt_compat_event_owner(raw_log.id) AS employee_id
FROM public.zkt_attendance_logs raw_log
WHERE raw_log.punch_time_local IS NOT NULL
), last_punch AS (
         SELECT DISTINCT ON (l.employee_id) l.employee_id,
            l.punch_time_local AS last_punch_time,
                CASE
                    WHEN (row_number() OVER (PARTITION BY l.employee_id, (l.punch_time_local::date) ORDER BY l.punch_time_local) % 2::bigint) = 1 THEN 'IN'::text
                    ELSE 'OUT'::text
                END AS last_punch_type,
            l.punch_time_local::date AS last_work_date
           FROM resolved_punches l
          WHERE l.punch_time_local IS NOT NULL AND l.employee_id IS NOT NULL
          ORDER BY l.employee_id, l.punch_time_local DESC
        )
 SELECT e.id,
    e.employee_number,
    e.first_name,
    e.last_name,
    e.phone,
    e.email,
    e."position",
    e.hourly_rate,
    e.active,
    e.created_at,
    e.pay_type,
    e.monthly_salary,
    e.last_payment_date,
    e.last_payment_amount,
    e.hire_date,
    e.employer_form,
    e.photo_url,
    e.company_name,
    e.zkt_user_id,
    e.zkt_name,
    e.zkt_password,
    e.zkt_card_number,
    e.zkt_privilege,
    e.zkt_enabled,
    e.zkt_synced_at,
    e.zkt_sync_status,
    e.zkt_sync_error,
    e.overtime_enabled,
    e.last_check_number,
    e.shift_type,
    e.downtime_enabled,
    e.exclude_from_payroll_report,
    lp.last_punch_time,
    lp.last_punch_type,
        CASE
            WHEN lp.last_punch_type = 'IN'::text THEN true
            ELSE false
        END AS is_on_site,
    lp.last_work_date,
        CASE
            WHEN lp.last_work_date IS NULL THEN NULL::integer
            ELSE GREATEST(CURRENT_DATE - lp.last_work_date, 0)
        END AS absence_days,
        CASE
            WHEN lp.last_punch_time IS NULL AND (EXISTS ( SELECT 1
               FROM zkt_attendance_logs unknown_event
              WHERE unknown_event.employee_number = e.employee_number)) THEN 'UNKNOWN'::text
            WHEN lp.last_punch_time IS NULL THEN 'ABSENT'::text
            WHEN lp.last_punch_type = 'IN'::text THEN 'ON_SITE'::text
            WHEN lp.last_punch_type = 'OUT'::text THEN 'OFF_SITE'::text
            ELSE 'ABSENT'::text
        END AS presence_status
   FROM employees e
     LEFT JOIN last_punch lp ON lp.employee_id = e.id;

DO $verify$
DECLARE
  c record;
  owner_rows jsonb;
  presence_rows jsonb;
  old_rows record;
BEGIN
  FOR c IN SELECT * FROM presence_loading_contexts LOOP
    PERFORM set_config('request.jwt.claims', c.claims::text, true);
    SELECT jsonb_agg(jsonb_build_array(id, public.zkt_compat_event_owner(id)) ORDER BY id)
      INTO owner_rows FROM public.zkt_attendance_logs;
    SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)
      INTO presence_rows FROM public.v_employee_current_presence v;
    SELECT * INTO STRICT old_rows FROM presence_loading_baseline
      WHERE context = c.context || ':' || c.claims::text;
    IF owner_rows IS DISTINCT FROM old_rows.owners
       OR presence_rows IS DISTINCT FROM old_rows.rows THEN
      RAISE EXCEPTION 'Presence optimization changed results in % context; rolling back', c.context;
    END IF;
  END LOOP;
  IF (SELECT reloptions FROM pg_class WHERE oid='public.v_employee_current_presence'::regclass)
      IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
      OR (SELECT proacl::text FROM pg_proc WHERE oid='public.zkt_compat_event_owner(uuid)'::regprocedure)
      IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION 'Presence privileges changed; rolling back';
  END IF;
  PERFORM set_config('request.jwt.claims', '{}', true);
END
$verify$;
COMMIT;
