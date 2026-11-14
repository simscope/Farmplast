-- Add independently verified SDK ownership to the existing compatibility path.
-- Historical bridge, capture trigger, processor, raw data and payroll stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if md5(pg_get_functiondef('public.zkt_compat_event_owner(uuid)'::regprocedure)) <> '43df9b74dfe863d874fc0ebc666137dd' then
  raise exception 'ZKT compatibility baseline changed; stop before applying';
 end if;
end $$;
-- The resolver runs per legacy punch; keep the independent proof lookup indexed.
create index zkt_identity_verified_instant_lookup
 on public.zkt_identity_events(terminal_user_id,local_timestamp,event_at)
 where legacy_raw_id is null;
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
    -- Match independent serial-verified evidence by both local and UTC instants.
    union all
    select o.employee_id, h.period_id
    from raw_event l join public.zkt_identity_events r
      on r.legacy_raw_id is null and r.terminal_user_id = l.employee_number::text
      and r.local_timestamp = l.punch_time_local and r.event_at = l.punch_time
    join public.zkt_event_ownership o on o.event_id = r.id
    join public.zkt_identifier_history h on h.id = o.mapping_id
    join public.zkt_identity_devices d on d.device_key = r.device_key and d.verified
    where h.processing_verified
      and h.device_key = r.device_key and h.terminal_user_id = r.terminal_user_id
      and r.event_at >= h.valid_from and (h.valid_to is null or r.event_at < h.valid_to)
      and not exists (
        select 1 from public.zkt_identity_events prior
        join public.zkt_event_ownership held on held.event_id = prior.id
        where prior.legacy_raw_id = l.id
      )
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
$function$
;
commit;
