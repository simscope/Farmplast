BEGIN; SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.process_zkt_attendance_to_work_logs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g record; w public.employee_work_logs%rowtype; wid uuid; changed integer:=0; hours numeric;
begin
  if auth.role() is distinct from 'service_role' and not public.employee_archive_admin() then raise exception 'Admin or bridge service required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,1);
  perform set_config('farmplast.zkt_identity_processing','on',true);
  for g in
    with owned as (
      select e.id,e.local_timestamp,e.raw,o.employee_id,h.period_id,h.hourly_rate,h.default_lunch_hours,
        case when h.shift_type='night' and e.local_timestamp::time<time '12:00' then e.local_timestamp::date-1 else e.local_timestamp::date end work_date,
        p.hire_date,p.termination_date,p.legacy_inactive,h.processing_verified,person.active currently_active,
        (h.hourly_rate is not distinct from coalesce(person.hourly_rate,0)
          and h.shift_type=coalesce(person.shift_type,'day') and h.default_lunch_hours=coalesce(person.default_lunch_hours,1)) context_matches
      from public.zkt_identity_events e join public.zkt_event_ownership o on o.event_id=e.id
      join public.zkt_identifier_history h on h.id=o.mapping_id join public.employee_employment_periods p on p.id=h.period_id
      join public.employees person on person.id=o.employee_id
    ) select employee_id,period_id,work_date,hourly_rate,default_lunch_hours,
        array_agg(id) ids,count(*) n,
        min(local_timestamp) filter(where raw->>'inOutMode'='0') in_stamp,
        max(local_timestamp) filter(where raw->>'inOutMode'='1') out_stamp,
        count(*) filter(where raw->>'inOutMode'='0') in_count,
        count(*) filter(where raw->>'inOutMode'='1') out_count,
        bool_and(currently_active is true) currently_active,
        bool_and(processing_verified and context_matches and not legacy_inactive and (hire_date is null or work_date>=hire_date) and (termination_date is null or work_date<=termination_date)) employed
      from owned group by employee_id,period_id,work_date,hourly_rate,default_lunch_hours
  loop
    if not g.employed or (g.out_stamp is null and not g.currently_active) or g.n>2 or g.n<>g.in_count+g.out_count or g.in_count<>1 or g.out_count>1 or (g.out_stamp is not null and (g.out_stamp<=g.in_stamp or g.out_stamp-g.in_stamp>interval '13 hours')) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Attendance needs review: payroll context, employment boundary or unsupported punch sequence' on conflict do nothing;
      continue;
    end if;
    -- A saved payroll check freezes its source day, including a late OUT punch.
    if exists(select 1 from public.payroll_checks where employee_id=g.employee_id and g.work_date between pay_period_start and pay_period_end and voided_at is null) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Saved payroll covers this work date; late punches require review' on conflict do nothing;
      continue;
    end if;
    select * into w from public.employee_work_logs where employee_id=g.employee_id and work_date=g.work_date for update;
    if found and (coalesce(w.approved,false) or coalesce(w.manually_edited,false) or coalesce(w.manual_time_in,false) or coalesce(w.manual_time_out,false) or coalesce(w.is_deleted,false)
      or not exists(select 1 from public.zkt_work_log_provenance where work_log_id=w.id and period_id=g.period_id)) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Existing historical/manual/approved work log retained; review attendance separately' on conflict do nothing;
      continue;
    end if;
    hours:=case when g.out_stamp is null then 0 else greatest(0,extract(epoch from(g.out_stamp-g.in_stamp))/3600-g.default_lunch_hours) end;
    if w.id is null then
      insert into public.employee_work_logs(employee_id,work_date,time_in,time_out,lunch_hours,reg_hours,labor_amount,source,approved,manually_edited,is_deleted,missed_punch,auto_closed_reason)
      values(g.employee_id,g.work_date,g.in_stamp::time,g.out_stamp::time,g.default_lunch_hours,round(hours,2),round(hours*g.hourly_rate,2),'zkt',false,false,false,g.out_stamp is null,
        case when g.out_stamp is null then 'OPEN SHIFT: waiting for OUT punch' else null end) returning id into wid;
      insert into public.zkt_work_log_provenance values(wid,g.employee_id,g.period_id,g.work_date);
    else
      update public.employee_work_logs set time_in=g.in_stamp::time,time_out=g.out_stamp::time,reg_hours=round(hours,2),labor_amount=round(hours*g.hourly_rate,2),
        missed_punch=g.out_stamp is null,auto_closed_reason=case when g.out_stamp is null then 'OPEN SHIFT: waiting for OUT punch' else null end
        where id=w.id and (time_in,time_out,reg_hours,labor_amount) is distinct from (g.in_stamp::time,g.out_stamp::time,round(hours,2),round(hours*g.hourly_rate,2));
    end if;
    changed:=changed+1;
  end loop;
  perform set_config('farmplast.zkt_identity_processing','off',true);
  return jsonb_build_object('ok',true,'processed_days',changed);
end $function$
;
CREATE OR REPLACE VIEW public.v_employee_current_presence WITH(security_invoker=true) AS  SELECT e.id,
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
    lp.local_timestamp AS last_punch_time,
    lp.punch_type AS last_punch_type,
    COALESCE(lp.punch_type = 'IN'::text, false) AS is_on_site,
    lp.work_date AS last_work_date,
        CASE
            WHEN lp.work_date IS NULL THEN NULL::integer
            ELSE GREATEST(CURRENT_DATE - lp.work_date, 0)
        END AS absence_days,
        CASE lp.punch_type
            WHEN 'IN'::text THEN 'ON_SITE'::text
            WHEN 'OUT'::text THEN 'OFF_SITE'::text
            ELSE 'ABSENT'::text
        END AS presence_status
   FROM employees e
     LEFT JOIN LATERAL ( SELECT r.local_timestamp,
                CASE r.raw ->> 'inOutMode'::text
                    WHEN '0'::text THEN 'IN'::text
                    WHEN '1'::text THEN 'OUT'::text
                    ELSE 'REVIEW'::text
                END AS punch_type,
                CASE
                    WHEN h.shift_type = 'night'::text AND r.local_timestamp::time without time zone < '12:00:00'::time without time zone THEN r.local_timestamp::date - 1
                    ELSE r.local_timestamp::date
                END AS work_date
           FROM zkt_event_ownership o
             JOIN zkt_identity_events r ON r.id = o.event_id
             JOIN zkt_identifier_history h ON h.id = o.mapping_id
             JOIN employee_employment_periods p ON p.id = h.period_id
          WHERE o.employee_id = e.id AND p.termination_date IS NULL AND NOT p.legacy_inactive
          ORDER BY r.event_at DESC, r.id DESC
         LIMIT 1) lp ON true;;
DROP FUNCTION IF EXISTS public.zkt_compat_event_owner(uuid);
COMMIT;
