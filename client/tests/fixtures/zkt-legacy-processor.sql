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
$function$
