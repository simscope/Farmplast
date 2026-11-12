BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$ BEGIN
 IF md5(pg_get_viewdef('public.v_employee_current_presence'::regclass,true))<>'1d9b424af40b8a5448e08ec6517f9da4'
 OR md5(pg_get_functiondef('public.zkt_compat_event_owner(uuid)'::regprocedure))<>'43df9b74dfe863d874fc0ebc666137dd'
 OR md5(pg_get_functiondef('public.process_zkt_attendance_to_work_logs()'::regprocedure))<>'bf557c77b4cf14cdc62c36e489d1c484' THEN
  RAISE EXCEPTION 'Attendance definitions changed; stop cache release';
 END IF;
END $guard$;
CREATE TEMP TABLE presence_cache_contexts ON COMMIT DROP AS
 SELECT '{}'::jsonb AS claims UNION ALL SELECT jsonb_build_object('sub',id,'role','authenticated') FROM public.profiles WHERE role='admin';
CREATE TEMP TABLE presence_cache_baseline(claims jsonb, rows jsonb) ON COMMIT DROP;
DO $baseline$ DECLARE c record; j jsonb; BEGIN
 FOR c IN SELECT * FROM presence_cache_contexts LOOP
  PERFORM set_config('request.jwt.claims',c.claims::text,true);
  SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) INTO j FROM public.v_employee_current_presence v;
  INSERT INTO presence_cache_baseline VALUES(c.claims,j);
 END LOOP;
END $baseline$;
CREATE SCHEMA employee_presence_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA employee_presence_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA employee_presence_private TO authenticated,service_role;
CREATE TABLE employee_presence_private.snapshot (
 employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
 last_punch_time timestamp without time zone,
 last_punch_type text CHECK(last_punch_type IN ('IN','OUT')),
 last_work_date date,
 checked_at timestamptz NOT NULL
);
ALTER TABLE employee_presence_private.snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON employee_presence_private.snapshot TO authenticated,service_role;
CREATE POLICY read_visible_employee_presence ON employee_presence_private.snapshot
 FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND (e.active IS TRUE OR (SELECT public.employee_archive_admin())))
 );

CREATE FUNCTION employee_presence_private.refresh_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $refresh$
DECLARE result_count integer; refreshed_at timestamptz := statement_timestamp();
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role'
    AND NOT public.employee_archive_admin()
    AND session_user NOT IN ('postgres','supabase_admin') THEN
   RAISE EXCEPTION 'Admin or bridge service required' USING errcode='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(736261, 2);
 INSERT INTO employee_presence_private.snapshot(employee_id,last_punch_time,last_punch_type,last_work_date,checked_at)
 WITH owners AS MATERIALIZED (with raw_event as materialized (select id, employee_number, punch_time, punch_time_local from public.zkt_attendance_logs),
  latest_period as materialized (
    select distinct on (p.employee_id) p.employee_id, p.id, p.hire_date, p.work_started_at,
      p.terminal_user_id, p.transferred_from_period_id
    from public.employee_employment_periods p order by p.employee_id, p.id desc
  ),
  owned as (
    select l.id as raw_id, o.employee_id, h.period_id
    from raw_event l join public.zkt_identity_events r on r.legacy_raw_id = l.id
    join public.zkt_event_ownership o on o.event_id = r.id
    join public.zkt_identifier_history h on h.id = o.mapping_id
  ), numbered as (
    select l.id as raw_id, e.id from raw_event l join public.employees e on e.employee_number = l.employee_number
    where not exists (select 1 from public.employees other where other.employee_number = l.employee_number and other.id <> e.id)
      and not exists (select 1 from public.employee_employment_periods p where p.employee_number = l.employee_number and p.employee_id <> e.id)
      and not exists (select 1 from public.zkt_identifier_history h where h.terminal_user_id = l.employee_number::text and h.employee_id <> e.id
        and l.punch_time >= h.valid_from and (h.valid_to is null or l.punch_time < h.valid_to))
      and not exists (select 1 from public.employee_feature_flags where flag in ('employee_rehire', 'employee_number_reuse') and enabled)
  ), resolved as (
    select raw_id, employee_id as id, period_id from owned
    union all select n.raw_id, n.id, null::bigint from numbered n where not exists (select 1 from owned o where o.raw_id = n.raw_id)
  )
  select l.id as raw_id, case when count(distinct r.id) = 1 then min(r.id::text)::uuid end as employee_id
  from resolved r join public.employees e on e.id = r.id join raw_event l on l.id = r.raw_id
  left join latest_period transfer on transfer.employee_id = e.id and transfer.transferred_from_period_id is not null
  where true
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
  group by l.id), resolved_punches AS MATERIALIZED (
  SELECT l.punch_time_local, o.employee_id FROM public.zkt_attendance_logs l
  JOIN owners o ON o.raw_id=l.id WHERE l.punch_time_local IS NOT NULL AND o.employee_id IS NOT NULL
), last_punch AS (
  SELECT DISTINCT ON (l.employee_id) l.employee_id, l.punch_time_local AS last_punch_time,
    CASE WHEN row_number() OVER (PARTITION BY l.employee_id,l.punch_time_local::date ORDER BY l.punch_time_local)%2=1 THEN 'IN' ELSE 'OUT' END AS last_punch_type,
    l.punch_time_local::date AS last_work_date
  FROM resolved_punches l ORDER BY l.employee_id,l.punch_time_local DESC
)
SELECT e.id AS employee_id, lp.last_punch_time, lp.last_punch_type, lp.last_work_date, statement_timestamp() AS checked_at
FROM public.employees e LEFT JOIN last_punch lp ON lp.employee_id=e.id
 ON CONFLICT(employee_id) DO UPDATE SET last_punch_time=excluded.last_punch_time,
 last_punch_type=excluded.last_punch_type,last_work_date=excluded.last_work_date,checked_at=excluded.checked_at;
 GET DIAGNOSTICS result_count = ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'employees',result_count,'checked_at',refreshed_at);
END;
$refresh$;
REVOKE ALL ON FUNCTION employee_presence_private.refresh_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION employee_presence_private.refresh_snapshot() TO service_role;

CREATE FUNCTION public.refresh_employee_presence()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $manual$
BEGIN
 IF auth.uid() IS NULL OR NOT public.employee_archive_admin() THEN
  RAISE EXCEPTION 'Admin required' USING errcode='42501';
 END IF;
 RETURN employee_presence_private.refresh_snapshot();
END;
$manual$;
REVOKE ALL ON FUNCTION public.refresh_employee_presence() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_employee_presence() TO authenticated;

SELECT employee_presence_private.refresh_snapshot();
CREATE OR REPLACE VIEW public.v_employee_current_presence WITH (security_invoker=true) AS

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
        END AS presence_status,
    lp.checked_at AS presence_checked_at,
    e.company_id, e.default_lunch_hours, e.plant_location,
    to_jsonb(tp) AS tax_profile
   FROM employees e LEFT JOIN public.employee_tax_profiles tp ON tp.employee_id=e.id
     LEFT JOIN employee_presence_private.snapshot lp ON lp.employee_id = e.id AND (e.active IS TRUE OR (SELECT public.employee_archive_admin()));
CREATE OR REPLACE FUNCTION public.process_zkt_attendance_to_work_logs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;

  v_open_employee_id uuid := null;
  v_open_employee_number integer := null;
  v_open_work_date date := null;
  v_open_dt timestamp without time zone := null;
  v_open_rate numeric := 0;

  v_now_local timestamp without time zone := (now() at time zone 'America/New_York');
  v_count int := 0;
begin
  if auth.role() is distinct from 'service_role' and not public.employee_archive_admin() then raise exception 'Admin or bridge service required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,1);
  perform set_config('farmplast.zkt_identity_processing','on',true);
  drop table if exists pg_temp.tmp_zkt_work_stage;

  create temp table tmp_zkt_work_stage (
    employee_id uuid,
    work_date date,
    in_dt timestamp without time zone,
    out_dt timestamp without time zone,
    time_in time without time zone,
    time_out time without time zone,
    hourly_rate numeric,
    missed_punch boolean,
    auto_closed_reason text
  ) on commit drop;


  for r in
    with prepared as (
      select
        e.id as employee_id,
        e.employee_number,
        coalesce(e.hourly_rate, 0) as hourly_rate,
        coalesce(e.shift_type, 'day') as shift_type,
        l.punch_time_local as local_dt,

        case
          when coalesce(e.shift_type, 'day') = 'night'
            and l.punch_time_local::time < time '12:00'
          then (l.punch_time_local::date - 1)
          else l.punch_time_local::date
        end as work_date,

        case
          when coalesce(e.shift_type, 'day') = 'day'
            and l.punch_time_local::time >= time '16:00'
          then true
          when coalesce(e.shift_type, 'day') = 'night'
            and l.punch_time_local::time < time '12:00'
          then true
          else false
        end as looks_like_out
      from (select * from public.zkt_attendance_logs oldlog where oldlog.punch_time_local::date>=date '2026-10-11'
 OR (oldlog.employee_number,oldlog.punch_time_local::date) IN
 (select recent.employee_number,recent.punch_time_local::date+adj.delta from public.zkt_attendance_logs recent cross join generate_series(-1,1) adj(delta)
 WHERE recent.created_at>=timestamptz '2026-10-11 00:00:00-04') offset 0) l
      join public.employees e
        on e.id = public.zkt_compat_event_owner(l.id)
      where l.punch_time_local is not null and e.active is true and ((case when coalesce(e.shift_type,'day')='night' and l.punch_time_local::time<time '12:00' then l.punch_time_local::date-1 else l.punch_time_local::date end) >= date '2026-10-11' OR EXISTS(SELECT 1 FROM public.zkt_attendance_logs recent
 WHERE recent.employee_number=l.employee_number AND recent.created_at>=timestamptz '2026-10-11 00:00:00-04'
 AND (CASE WHEN coalesce(e.shift_type,'day')='night' AND recent.punch_time_local::time<time '12:00' THEN recent.punch_time_local::date-1 ELSE recent.punch_time_local::date END)=(case when coalesce(e.shift_type,'day')='night' and l.punch_time_local::time<time '12:00' then l.punch_time_local::date-1 else l.punch_time_local::date end)))
    )
    select *
    from prepared
    order by employee_number, work_date, local_dt
  loop

    if v_open_employee_number is not null
       and (
         r.employee_number <> v_open_employee_number
         or r.work_date <> v_open_work_date
       )
    then
      insert into tmp_zkt_work_stage
      values (
        v_open_employee_id,
        v_open_work_date,
        v_open_dt,
        null,
        v_open_dt::time,
        null,
        v_open_rate,
        true,
        case
          when v_now_local - v_open_dt >= interval '13 hours'
          then 'OPEN SHIFT OVER 13 HOURS: missing OUT punch'
          else 'OPEN SHIFT: waiting for OUT punch'
        end
      );

      v_open_employee_id := null;
      v_open_employee_number := null;
      v_open_work_date := null;
      v_open_dt := null;
      v_open_rate := 0;
    end if;

    if v_open_dt is null then
      if r.looks_like_out = true then
        insert into tmp_zkt_work_stage
        values (
          r.employee_id,
          r.work_date,
          null,
          r.local_dt,
          null,
          r.local_dt::time,
          r.hourly_rate,
          true,
          'MISSED IN: orphan OUT punch'
        );
      else
        v_open_employee_id := r.employee_id;
        v_open_employee_number := r.employee_number;
        v_open_work_date := r.work_date;
        v_open_dt := r.local_dt;
        v_open_rate := r.hourly_rate;
      end if;

    else
      if r.local_dt - v_open_dt <= interval '13 hours' then
        insert into tmp_zkt_work_stage
        values (
          v_open_employee_id,
          v_open_work_date,
          v_open_dt,
          r.local_dt,
          v_open_dt::time,
          r.local_dt::time,
          v_open_rate,
          false,
          null
        );

        v_open_employee_id := null;
        v_open_employee_number := null;
        v_open_work_date := null;
        v_open_dt := null;
        v_open_rate := 0;

      else
        insert into tmp_zkt_work_stage
        values (
          v_open_employee_id,
          v_open_work_date,
          v_open_dt,
          null,
          v_open_dt::time,
          null,
          v_open_rate,
          true,
          'OPEN SHIFT OVER 13 HOURS: missing OUT punch'
        );

        v_open_employee_id := null;
        v_open_employee_number := null;
        v_open_work_date := null;
        v_open_dt := null;
        v_open_rate := 0;

        if r.looks_like_out = true then
          insert into tmp_zkt_work_stage
          values (
            r.employee_id,
            r.work_date,
            null,
            r.local_dt,
            null,
            r.local_dt::time,
            r.hourly_rate,
            true,
            'MISSED IN: orphan OUT punch'
          );
        else
          v_open_employee_id := r.employee_id;
          v_open_employee_number := r.employee_number;
          v_open_work_date := r.work_date;
          v_open_dt := r.local_dt;
          v_open_rate := r.hourly_rate;
        end if;
      end if;
    end if;

  end loop;

  if v_open_dt is not null then
    insert into tmp_zkt_work_stage
    values (
      v_open_employee_id,
      v_open_work_date,
      v_open_dt,
      null,
      v_open_dt::time,
      null,
      v_open_rate,
      true,
      case
        when v_now_local - v_open_dt >= interval '13 hours'
        then 'OPEN SHIFT OVER 13 HOURS: missing OUT punch'
        else 'OPEN SHIFT: waiting for OUT punch'
      end
    );
  end if;


  INSERT INTO public.employee_work_logs(employee_id,work_date,time_in,time_out,lunch_hours,reg_hours,labor_amount,source,manually_edited,approved,is_deleted,auto_closed,missed_punch,auto_closed_reason,punch_error)
  SELECT x.employee_id,x.work_date,min(x.time_in),max(x.time_out),case when sum(x.gross_hours)>=4 then 1 else 0 end,
   greatest(round((least(12,sum(x.gross_hours))-case when sum(x.gross_hours)>=4 then 1 else 0 end)::numeric,2),0),
   round(greatest(round((least(12,sum(x.gross_hours))-case when sum(x.gross_hours)>=4 then 1 else 0 end)::numeric,2),0)*coalesce(max(x.hourly_rate),0),2),
   'zkt',false,false,false,false,bool_or(x.missed_punch),string_agg(distinct x.auto_closed_reason,' | ') filter(where x.auto_closed_reason is not null),string_agg(distinct x.auto_closed_reason,' | ') filter(where x.auto_closed_reason is not null)
  FROM (SELECT s.*,case when s.in_dt is null or s.out_dt is null then 0 else extract(epoch from(s.out_dt-s.in_dt))/3600 end gross_hours FROM tmp_zkt_work_stage s) x
  WHERE NOT EXISTS(SELECT 1 FROM public.payroll_checks c WHERE c.employee_id=x.employee_id AND x.work_date between c.pay_period_start AND c.pay_period_end AND c.voided_at IS NULL)
  GROUP BY x.employee_id,x.work_date
  ON CONFLICT ON CONSTRAINT employee_work_logs_employee_day_unique DO UPDATE SET
    time_out=excluded.time_out,lunch_hours=CASE WHEN employee_work_logs.created_at >= timestamptz '2026-10-11 00:00:00-04' THEN excluded.lunch_hours ELSE employee_work_logs.lunch_hours END,reg_hours=greatest(round((least(12,(extract(epoch from(excluded.time_out-employee_work_logs.time_in))/3600 + CASE WHEN excluded.time_out<employee_work_logs.time_in THEN 24 ELSE 0 END))-coalesce(CASE WHEN employee_work_logs.created_at >= timestamptz '2026-10-11 00:00:00-04' THEN excluded.lunch_hours ELSE employee_work_logs.lunch_hours END,0)-coalesce(employee_work_logs.downtime_hours,0))::numeric,2),0),
    labor_amount=round(greatest(round((least(12,(extract(epoch from(excluded.time_out-employee_work_logs.time_in))/3600 + CASE WHEN excluded.time_out<employee_work_logs.time_in THEN 24 ELSE 0 END))-coalesce(CASE WHEN employee_work_logs.created_at >= timestamptz '2026-10-11 00:00:00-04' THEN excluded.lunch_hours ELSE employee_work_logs.lunch_hours END,0)-coalesce(employee_work_logs.downtime_hours,0))::numeric,2),0)*(SELECT coalesce(hourly_rate,0) FROM public.employees WHERE id=excluded.employee_id),2),
    missed_punch=excluded.missed_punch,auto_closed_reason=excluded.auto_closed_reason,punch_error=excluded.punch_error
  WHERE employee_work_logs.source='zkt' AND employee_work_logs.time_out IS NULL AND employee_work_logs.time_in=excluded.time_in AND excluded.time_out IS NOT NULL
    AND NOT coalesce(employee_work_logs.approved,false) AND NOT coalesce(employee_work_logs.manually_edited,false) AND NOT coalesce(employee_work_logs.manual_time_in,false) AND NOT coalesce(employee_work_logs.manual_time_out,false) AND NOT coalesce(employee_work_logs.is_deleted,false);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  perform set_config('farmplast.zkt_identity_processing','off',true);
  PERFORM employee_presence_private.refresh_snapshot();
  RETURN jsonb_build_object('ok',true,'affected',v_count,'historical_rebuild_disabled',true);
END;
$function$;
DO $verify$ DECLARE c record; j jsonb; old_j jsonb; BEGIN
 FOR c IN SELECT * FROM presence_cache_contexts LOOP
  PERFORM set_config('request.jwt.claims',c.claims::text,true);
  SELECT jsonb_agg(to_jsonb(v)-ARRAY['presence_checked_at','company_id','default_lunch_hours','plant_location','tax_profile'] ORDER BY v.id)
    INTO j FROM public.v_employee_current_presence v;
  SELECT rows INTO STRICT old_j FROM presence_cache_baseline WHERE claims=c.claims;
  IF j IS DISTINCT FROM old_j THEN RAISE EXCEPTION 'Cached presence differs; rolling back'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{}',true);
END $verify$;
NOTIFY pgrst,'reload schema';
COMMIT;
