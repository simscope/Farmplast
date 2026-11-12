-- Prepared only; separate owner authorization required for production.
-- Existing compatibility and identity migrations must already be present. No backfill or flag changes.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.zkt_attendance_logs IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_advisory_xact_lock(736261,1);
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.process_zkt_attendance_to_work_logs()'::regprocedure))<>'f618d5d8b24604c610ddc54113cb7b14'
 OR md5(pg_get_functiondef('public.ingest_zkt_identity_events(text,text,jsonb)'::regprocedure))<>'1b7a07f3c338565fa998292972d0f6b1'
 OR md5(pg_get_viewdef('public.v_employee_current_presence'::regclass,true))<>'7c8baf19c36fc14c764ac7a9aeb59163' THEN RAISE EXCEPTION 'Attendance definition drift; STOP'; END IF;
 IF (SELECT count(*) FROM public.employee_feature_flags WHERE flag IN('employee_terminate','employee_rehire','employee_number_reuse') AND NOT enabled)<>3
 OR NOT EXISTS(SELECT 1 FROM public.employee_feature_flags WHERE flag='former_employees_archive_readonly' AND enabled) THEN RAISE EXCEPTION 'Archive ON/actions OFF required'; END IF;
END $$;

CREATE INDEX zkt_identity_device_time_lookup ON public.zkt_identity_events(device_key,terminal_user_id,local_timestamp);
CREATE INDEX zkt_identity_legacy_time_lookup ON public.zkt_identity_events(terminal_user_id,local_timestamp) WHERE legacy_raw_id IS NOT NULL;
-- SDK event identity, excluding transport aliases/metadata. Device identity is checked separately.
CREATE FUNCTION public.zkt_event_fingerprint(r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_array(coalesce(r->>'deviceUserId',r->>'userId'),r->>'timestamp',
 r->>'verifyMode',r->>'inOutMode',r->>'workCode',r->>'recordId',r->>'eventId',r->>'logId')
$$;
REVOKE ALL ON FUNCTION public.zkt_event_fingerprint(jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.zkt_event_fingerprint(jsonb) TO authenticated,service_role;

-- No guessed device. Potential legacy duplicates cannot generate a second work day.
CREATE FUNCTION public.zkt_native_attendance_input() RETURNS TABLE
(event_id bigint,employee_id uuid,period_id bigint,work_date date,local_timestamp timestamp,
 device_key text,punch_type text,hourly_rate numeric,default_lunch_hours numeric)
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 WITH events AS (
 SELECT r.id,r.local_timestamp,coalesce(r.device_key,input_proof.device_key) device_key,r.raw,o.employee_id,h.period_id,h.hourly_rate,h.default_lunch_hours,
 CASE WHEN h.shift_type='night' AND r.local_timestamp::time<time '12:00' THEN r.local_timestamp::date-1 ELSE r.local_timestamp::date END work_date
 FROM public.zkt_identity_events r JOIN public.zkt_event_ownership o ON o.event_id=r.id
 LEFT JOIN public.zkt_legacy_device_evidence input_proof ON input_proof.event_id=r.id
 JOIN public.zkt_identifier_history h ON h.id=o.mapping_id
 JOIN public.employee_employment_periods p ON p.id=h.period_id AND p.employee_id=o.employee_id
 JOIN public.employees e ON e.id=o.employee_id
 WHERE coalesce(r.device_key,input_proof.device_key)=h.device_key AND r.terminal_user_id=h.terminal_user_id
 AND r.event_at>=h.valid_from AND (h.valid_to IS NULL OR r.event_at<h.valid_to)
 AND h.processing_verified AND NOT p.legacy_inactive
 AND (p.hire_date IS NULL OR r.local_timestamp::date>=p.hire_date)
 AND (p.termination_date IS NULL OR r.local_timestamp::date<=p.termination_date)
 AND h.hourly_rate IS NOT DISTINCT FROM coalesce(e.hourly_rate,0)
 AND h.shift_type=coalesce(e.shift_type,'day') AND h.default_lunch_hours=coalesce(e.default_lunch_hours,1)
 AND (r.legacy_raw_id IS NOT NULL OR NOT EXISTS(
 SELECT 1 FROM public.zkt_identity_events old
 LEFT JOIN public.zkt_legacy_device_evidence proof ON proof.event_id=old.id
 WHERE old.legacy_raw_id IS NOT NULL AND old.terminal_user_id=r.terminal_user_id AND old.local_timestamp=r.local_timestamp
 AND (proof.device_key IS NULL OR (proof.device_key=r.device_key AND public.zkt_event_fingerprint(old.raw)=public.zkt_event_fingerprint(r.raw)))))
 -- Existing canonical duplicates from before this patch are retained, but not double-counted.
 AND NOT EXISTS(SELECT 1 FROM public.zkt_identity_events prev LEFT JOIN public.zkt_legacy_device_evidence prev_proof ON prev_proof.event_id=prev.id
 WHERE prev.id<r.id AND coalesce(prev.device_key,prev_proof.device_key)=coalesce(r.device_key,input_proof.device_key)
 AND prev.terminal_user_id=r.terminal_user_id AND prev.local_timestamp=r.local_timestamp
 AND (r.legacy_raw_id IS NULL OR prev.legacy_raw_id IS NOT NULL)
 AND public.zkt_event_fingerprint(prev.raw)=public.zkt_event_fingerprint(r.raw))
 ) SELECT id,employee_id,period_id,work_date,local_timestamp,device_key,
 CASE raw->>'inOutMode' WHEN '0' THEN 'IN' WHEN '1' THEN 'OUT'
 WHEN '255' THEN CASE WHEN row_number() OVER(PARTITION BY employee_id,period_id,work_date ORDER BY local_timestamp,id)%2=1 THEN 'IN' ELSE 'OUT' END
 ELSE 'REVIEW' END,hourly_rate,default_lunch_hours FROM events
$$;
REVOKE ALL ON FUNCTION public.zkt_native_attendance_input() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.zkt_native_attendance_input() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ingest_zkt_identity_events(p_device_key text, p_serial_number text, p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.zkt_identity_devices%rowtype; r jsonb; stamp timestamp; instant timestamptz;
  uid text; eid bigint; legacy_id bigint; legacy_count integer; possible_legacy boolean; reason text; accepted integer:=0; review integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501'; end if;
  select * into strict d from public.zkt_identity_devices where device_key=p_device_key and verified and serial_number=p_serial_number;
  perform pg_advisory_xact_lock(736261,1);
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

    legacy_id:=NULL; legacy_count:=0; possible_legacy:=false;
    IF reason IS NULL THEN
      SELECT count(*),min(old.id) INTO legacy_count,legacy_id FROM public.zkt_identity_events old
      JOIN public.zkt_legacy_device_evidence proof ON proof.event_id=old.id AND proof.device_key=d.device_key
      WHERE old.legacy_raw_id IS NOT NULL AND old.terminal_user_id=uid AND old.local_timestamp=stamp
        AND public.zkt_event_fingerprint(old.raw)=public.zkt_event_fingerprint(r);
      IF legacy_count=1 THEN
        IF public.zkt_assign_event(legacy_id) THEN accepted:=accepted+1; END IF;
        CONTINUE;
      END IF;
      SELECT EXISTS(SELECT 1 FROM public.zkt_identity_events old
        LEFT JOIN public.zkt_legacy_device_evidence proof ON proof.event_id=old.id
        WHERE old.legacy_raw_id IS NOT NULL AND old.terminal_user_id=uid AND old.local_timestamp=stamp
        AND (proof.device_key IS NULL OR (proof.device_key=d.device_key AND public.zkt_event_fingerprint(old.raw)=public.zkt_event_fingerprint(r)))) INTO possible_legacy;
      IF possible_legacy THEN reason:='Possible legacy duplicate: confirmed device/event evidence required'; END IF;
    END IF;
    -- Re-evaluate confirmed legacy evidence before skipping a native replay.
    SELECT previous.id INTO eid FROM public.zkt_identity_events previous WHERE previous.device_key=d.device_key
      AND previous.terminal_user_id IS NOT DISTINCT FROM uid AND previous.local_timestamp IS NOT DISTINCT FROM stamp
      AND public.zkt_event_fingerprint(previous.raw)=public.zkt_event_fingerprint(r) ORDER BY previous.id LIMIT 1;
    IF FOUND THEN
      IF possible_legacy THEN INSERT INTO public.zkt_identity_review(event_id,reason) VALUES(eid,reason) ON CONFLICT DO NOTHING; END IF;
      CONTINUE;
    END IF;

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
CREATE OR REPLACE FUNCTION public.process_zkt_attendance_to_work_logs() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
declare
  r record; g record; w public.employee_work_logs%rowtype; wid uuid; hours numeric; lunch numeric; downtime numeric; native_changed integer:=0;

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

  -- Existing identity processor semantics, now wired to the same canonical RPC.
  INSERT INTO public.zkt_identity_review(event_id,reason)
  SELECT evt.id,'Identity input held: verify context or legacy duplication evidence'
  FROM public.zkt_identity_events evt JOIN public.zkt_event_ownership o ON o.event_id=evt.id
  JOIN public.zkt_identifier_history h ON h.id=o.mapping_id
  JOIN public.employee_employment_periods p ON p.id=h.period_id JOIN public.employees e ON e.id=o.employee_id
  WHERE evt.legacy_raw_id IS NULL AND e.active IS TRUE AND p.termination_date IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.zkt_native_attendance_input() ni JOIN public.zkt_identity_events nr ON nr.id=ni.event_id
      WHERE ni.employee_id=o.employee_id AND ni.period_id=h.period_id AND ni.device_key=evt.device_key
        AND public.zkt_event_fingerprint(nr.raw)=public.zkt_event_fingerprint(evt.raw))
    AND NOT EXISTS(SELECT 1 FROM public.zkt_identity_events prev WHERE prev.id<evt.id AND prev.device_key=evt.device_key
      AND prev.terminal_user_id=evt.terminal_user_id AND prev.local_timestamp=evt.local_timestamp
      AND public.zkt_event_fingerprint(prev.raw)=public.zkt_event_fingerprint(evt.raw))
  ON CONFLICT DO NOTHING;
  FOR g IN SELECT employee_id,period_id,work_date,hourly_rate,default_lunch_hours,
    array_agg(event_id) ids,count(*) n,count(DISTINCT device_key) devices,
    min(local_timestamp) FILTER(WHERE punch_type='IN') in_stamp,
    max(local_timestamp) FILTER(WHERE punch_type='OUT') out_stamp,
    count(*) FILTER(WHERE punch_type='IN') in_count,count(*) FILTER(WHERE punch_type='OUT') out_count
    FROM public.zkt_native_attendance_input() GROUP BY employee_id,period_id,work_date,hourly_rate,default_lunch_hours
  LOOP
    -- Former history and incident-era days are never rebuilt by this patch.
    IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.employee_employment_periods p ON p.employee_id=e.id WHERE e.id=g.employee_id AND e.active IS TRUE AND p.id=g.period_id AND p.termination_date IS NULL) THEN CONTINUE; END IF;
    IF g.devices<>1 OR g.n>2 OR g.n<>g.in_count+g.out_count OR g.in_count<>1 OR g.out_count>1
      OR (g.out_stamp IS NOT NULL AND (g.out_stamp<=g.in_stamp OR g.out_stamp-g.in_stamp>interval '13 hours')) THEN
      INSERT INTO public.zkt_identity_review(event_id,reason) SELECT unnest(g.ids),'Unsupported or conflicting identity punch sequence' ON CONFLICT DO NOTHING; CONTINUE;
    END IF;
    IF EXISTS(SELECT 1 FROM public.payroll_checks WHERE employee_id=g.employee_id AND g.work_date BETWEEN pay_period_start AND pay_period_end AND voided_at IS NULL) THEN CONTINUE; END IF;
    SELECT * INTO w FROM public.employee_work_logs WHERE employee_id=g.employee_id AND work_date=g.work_date FOR UPDATE;
    IF FOUND THEN
      -- A closed historical day is frozen even if a later replay is different.
      IF w.time_out IS NOT NULL OR coalesce(w.approved,false) OR coalesce(w.manually_edited,false)
        OR coalesce(w.manual_time_in,false) OR coalesce(w.manual_time_out,false) OR coalesce(w.is_deleted,false)
        OR (NOT EXISTS(SELECT 1 FROM public.zkt_work_log_provenance WHERE work_log_id=w.id AND period_id=g.period_id)
          AND NOT (g.work_date>=date '2026-10-11' AND w.source='zkt'
            AND NOT EXISTS(SELECT 1 FROM public.zkt_work_log_provenance WHERE work_log_id=w.id)
            AND EXISTS(SELECT 1 FROM public.zkt_native_attendance_input() ni JOIN public.zkt_identity_events er ON er.id=ni.event_id
              WHERE er.legacy_raw_id IS NOT NULL AND ni.employee_id=g.employee_id AND ni.period_id=g.period_id AND ni.work_date=g.work_date AND ni.punch_type='IN' AND ni.local_timestamp::time=w.time_in)))
        OR w.time_in IS DISTINCT FROM g.in_stamp::time OR g.out_stamp IS NULL THEN CONTINUE; END IF;
      lunch:=coalesce(w.lunch_hours,0); downtime:=coalesce(w.downtime_hours,0);
      IF NOT EXISTS(SELECT 1 FROM public.zkt_work_log_provenance WHERE work_log_id=w.id) THEN
        -- Adopt only a proven open compatibility day; preserve its established lunch rule.
        IF w.created_at >= timestamptz '2026-10-11 00:00:00-04' THEN lunch:=CASE WHEN g.out_stamp-g.in_stamp>=interval '4 hours' THEN 1 ELSE 0 END; END IF;
        INSERT INTO public.zkt_work_log_provenance VALUES(w.id,g.employee_id,g.period_id,g.work_date);
      END IF;
      hours:=greatest(0,least(12,extract(epoch FROM(g.out_stamp-g.in_stamp))/3600)-lunch-downtime);
      UPDATE public.employee_work_logs SET time_out=g.out_stamp::time,lunch_hours=lunch,reg_hours=round(hours,2),labor_amount=round(hours*g.hourly_rate,2),missed_punch=false,auto_closed_reason=NULL,punch_error=NULL WHERE id=w.id;
    ELSE
      lunch:=CASE WHEN g.out_stamp IS NULL OR g.out_stamp-g.in_stamp>=interval '4 hours' THEN g.default_lunch_hours ELSE 0 END;
      hours:=CASE WHEN g.out_stamp IS NULL THEN 0 ELSE greatest(0,least(12,extract(epoch FROM(g.out_stamp-g.in_stamp))/3600)-lunch) END;
      INSERT INTO public.employee_work_logs(employee_id,work_date,time_in,time_out,lunch_hours,downtime_hours,reg_hours,labor_amount,source,approved,manually_edited,is_deleted,missed_punch,auto_closed_reason)
      VALUES(g.employee_id,g.work_date,g.in_stamp::time,g.out_stamp::time,lunch,0,round(hours,2),round(hours*g.hourly_rate,2),'zkt',false,false,false,g.out_stamp IS NULL,
        CASE WHEN g.out_stamp IS NULL THEN 'OPEN SHIFT: waiting for OUT punch' ELSE NULL END) RETURNING id INTO wid;
      INSERT INTO public.zkt_work_log_provenance VALUES(wid,g.employee_id,g.period_id,g.work_date);
    END IF;
    native_changed:=native_changed+1;
  END LOOP;

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
      where NOT EXISTS(SELECT 1 FROM public.zkt_native_attendance_input() ni WHERE ni.employee_id=e.id AND ni.work_date=CASE WHEN coalesce(e.shift_type,'day')='night' AND l.punch_time_local::time<time '12:00' THEN l.punch_time_local::date-1 ELSE l.punch_time_local::date END)
      AND l.punch_time_local is not null and e.active is true and (case when coalesce(e.shift_type,'day')='night' and l.punch_time_local::time<time '12:00' then l.punch_time_local::date-1 else l.punch_time_local::date end) >= date '2026-10-11'
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
  RETURN jsonb_build_object('ok',true,'affected',v_count,'identity_days',native_changed,'historical_rebuild_disabled',true);
END;
$function$;

CREATE OR REPLACE VIEW public.v_employee_current_presence WITH (security_invoker='true') AS
 WITH resolved_punches AS MATERIALIZED (
 SELECT raw_log.id::text id,raw_log.employee_number,raw_log.punch_time_local,public.zkt_compat_event_owner(raw_log.id) AS employee_id,NULL::text punch_type
 FROM public.zkt_attendance_logs raw_log WHERE raw_log.punch_time_local IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.zkt_native_attendance_input() ni JOIN public.zkt_identity_events er ON er.id=ni.event_id WHERE er.legacy_raw_id=raw_log.id)
 UNION ALL SELECT 'identity-'||n.event_id::text,e.employee_number,n.local_timestamp,n.employee_id,n.punch_type FROM public.zkt_native_attendance_input() n JOIN public.employees e ON e.id=n.employee_id
), last_punch AS (
         SELECT DISTINCT ON (l.employee_id) l.employee_id AS employee_id,
            l.punch_time_local AS last_punch_time,
                CASE WHEN l.punch_type IN ('IN','OUT') THEN l.punch_type
                    WHEN ((row_number() OVER (PARTITION BY l.employee_id, (CASE WHEN coalesce(punch_employee.shift_type,'day')='night' AND l.punch_time_local::time<time '12:00' THEN l.punch_time_local::date-1 ELSE l.punch_time_local::date END) ORDER BY l.punch_time_local) % (2)::bigint) = 1) THEN 'IN'::text
                    ELSE 'OUT'::text
                END AS last_punch_type,
            (CASE WHEN coalesce(punch_employee.shift_type,'day')='night' AND l.punch_time_local::time<time '12:00' THEN l.punch_time_local::date-1 ELSE l.punch_time_local::date END) AS last_work_date
           FROM resolved_punches l JOIN public.employees punch_employee ON punch_employee.id=l.employee_id
          WHERE (l.punch_time_local IS NOT NULL) AND l.employee_id IS NOT NULL
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
            WHEN (lp.last_punch_type = 'IN'::text) THEN true
            ELSE false
        END AS is_on_site,
    lp.last_work_date,
        CASE
            WHEN (lp.last_work_date IS NULL) THEN NULL::integer
            ELSE GREATEST((CURRENT_DATE - lp.last_work_date), 0)
        END AS absence_days,
        CASE
            WHEN (lp.last_punch_time IS NULL) AND (EXISTS(SELECT 1 FROM public.zkt_attendance_logs unowned WHERE unowned.employee_number=e.employee_number) OR EXISTS(SELECT 1 FROM public.zkt_identity_events unowned WHERE unowned.terminal_user_id=e.employee_number::text)) THEN 'UNKNOWN'::text
            WHEN (lp.last_punch_time IS NULL) THEN 'ABSENT'::text
            WHEN (lp.last_punch_type = 'IN'::text) THEN 'ON_SITE'::text
            WHEN (lp.last_punch_type = 'OUT'::text) THEN 'OFF_SITE'::text
            ELSE 'ABSENT'::text
        END AS presence_status
   FROM (public.employees e
     LEFT JOIN last_punch lp ON ((lp.employee_id = e.id)));




COMMIT;
