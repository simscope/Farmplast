-- Definition-only rollback, retaining every event/work-log/provenance row.
BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE public.zkt_attendance_logs IN SHARE ROW EXCLUSIVE MODE; SELECT pg_advisory_xact_lock(736261,1);
CREATE OR REPLACE FUNCTION public.ingest_zkt_identity_events(p_device_key text, p_serial_number text, p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.zkt_identity_devices%rowtype; r jsonb; stamp timestamp; instant timestamptz;
  uid text; eid bigint; reason text; accepted integer:=0; review integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501'; end if;
  select * into strict d from public.zkt_identity_devices where device_key=p_device_key and verified and serial_number=p_serial_number;
  if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>500 then raise exception 'Invalid event batch'; end if;
  for r in select value from jsonb_array_elements(p_events) loop
    reason:=null; stamp:=null; instant:=null; uid:=coalesce(r->>'deviceUserId',r->>'userId');
    begin
      if uid is null or uid !~ '^[0-9]+$' or r->>'timestamp' is null or r->>'timestamp' !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then
        raise exception 'Invalid SDK event'; end if;
      stamp:=(r->>'timestamp')::timestamp;
      instant:=stamp at time zone d.timezone;
      if (instant at time zone d.timezone)<>stamp then reason:='Nonexistent local time at DST transition'; end if;
      if ((instant-interval '1 hour') at time zone d.timezone)=stamp or ((instant+interval '1 hour') at time zone d.timezone)=stamp then
        reason:='Ambiguous local time at DST transition'; end if;
      if instant>now()+interval '5 minutes' then reason:='Terminal clock is in the future'; end if;
    exception when others then reason:='Invalid SDK identifier or timestamp'; end;
    if reason is not null then instant:=null; end if;
    insert into public.zkt_identity_events(device_key,terminal_user_id,local_timestamp,event_at,raw)
      values(d.device_key,uid,stamp,instant,r) on conflict(device_key,raw) do nothing returning id into eid;
    if eid is null then continue; end if;
    if reason is not null then
      insert into public.zkt_identity_review(event_id,reason) values(eid,reason); review:=review+1;
    elsif public.zkt_assign_event(eid) then accepted:=accepted+1;
    else review:=review+1; end if;
  end loop;
  return jsonb_build_object('owned',accepted,'review',review);
end $function$
;
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
      from (select * from public.zkt_attendance_logs where punch_time_local::date >= date '2026-10-11' offset 0) l
      join public.employees e
        on e.id = public.zkt_compat_event_owner(l.id)
      where l.punch_time_local is not null and e.active is true and (case when coalesce(e.shift_type,'day')='night' and l.punch_time_local::time<time '12:00' then l.punch_time_local::date-1 else l.punch_time_local::date end) >= date '2026-10-11'
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
  RETURN jsonb_build_object('ok',true,'affected',v_count,'historical_rebuild_disabled',true);
END;
$function$
;
CREATE OR REPLACE VIEW public.v_employee_current_presence WITH(security_invoker=true) AS  WITH resolved_punches AS MATERIALIZED (
         SELECT raw_log.id,
            raw_log.employee_number,
            raw_log.punch_time,
            raw_log.raw,
            raw_log.created_at,
            raw_log.punch_time_local,
            raw_log.synced_at,
            zkt_compat_event_owner(raw_log.id) AS employee_id
           FROM zkt_attendance_logs raw_log
          WHERE raw_log.punch_time_local IS NOT NULL
        ), last_punch AS (
         SELECT DISTINCT ON (l.employee_id) l.employee_id,
            l.punch_time_local AS last_punch_time,
                CASE
                    WHEN (row_number() OVER (PARTITION BY l.employee_id, (
                    CASE
                        WHEN COALESCE(punch_employee.shift_type, 'day'::text) = 'night'::text AND l.punch_time_local::time without time zone < '12:00:00'::time without time zone THEN l.punch_time_local::date - 1
                        ELSE l.punch_time_local::date
                    END) ORDER BY l.punch_time_local) % 2::bigint) = 1 THEN 'IN'::text
                    ELSE 'OUT'::text
                END AS last_punch_type,
                CASE
                    WHEN COALESCE(punch_employee.shift_type, 'day'::text) = 'night'::text AND l.punch_time_local::time without time zone < '12:00:00'::time without time zone THEN l.punch_time_local::date - 1
                    ELSE l.punch_time_local::date
                END AS last_work_date
           FROM resolved_punches l
             JOIN employees punch_employee ON punch_employee.id = l.employee_id
          WHERE l.punch_time_local IS NOT NULL AND l.employee_id IS NOT NULL
          ORDER BY l.employee_id, l.punch_time_local DESC, l.id DESC
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
               FROM zkt_attendance_logs unowned
              WHERE unowned.employee_number = e.employee_number)) THEN 'UNKNOWN'::text
            WHEN lp.last_punch_time IS NULL THEN 'ABSENT'::text
            WHEN lp.last_punch_type = 'IN'::text THEN 'ON_SITE'::text
            WHEN lp.last_punch_type = 'OUT'::text THEN 'OFF_SITE'::text
            ELSE 'ABSENT'::text
        END AS presence_status
   FROM employees e
     LEFT JOIN last_punch lp ON lp.employee_id = e.id;;
DROP FUNCTION public.zkt_native_attendance_input(); DROP FUNCTION public.zkt_event_fingerprint(jsonb);
DROP INDEX public.zkt_identity_device_time_lookup; DROP INDEX public.zkt_identity_legacy_time_lookup;
COMMIT;
