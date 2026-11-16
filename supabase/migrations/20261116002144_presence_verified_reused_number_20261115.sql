-- Keep snapshot Presence consistent with zkt_compat_event_owner:
-- include only serial-verified, period-bound ownership for reused terminal IDs.
-- No backfills, attendance updates, employee changes or payroll recalculations.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $guard$ begin
 if md5(pg_get_functiondef('employee_presence_private.refresh_snapshot()'::regprocedure)) <> '62f0c935a3c6e65a99ff28728bb6a7a9' then
  raise exception 'Current Presence snapshot function changed; stop';
 end if;
end $guard$;
CREATE OR REPLACE FUNCTION employee_presence_private.refresh_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    union all
    -- Explicit, verified terminal evidence survives reuse of an HR number.
    -- Never infer ownership by number alone when it belongs to multiple UUIDs.
    select l.id as raw_id, o.employee_id, h.period_id
    from raw_event l
    join public.zkt_identity_events r on r.legacy_raw_id is null
      and r.terminal_user_id = l.employee_number::text
      and r.local_timestamp = l.punch_time_local and r.event_at = l.punch_time
    join public.zkt_event_ownership o on o.event_id = r.id
    join public.zkt_identifier_history h on h.id = o.mapping_id
    join public.zkt_identity_devices d on d.device_key = r.device_key and d.verified
    where h.processing_verified
      and h.device_key = r.device_key
      and h.terminal_user_id = r.terminal_user_id
      and r.event_at >= h.valid_from
      and (h.valid_to is null or r.event_at < h.valid_to)
      and not exists (
        select 1 from public.zkt_identity_events prior
        join public.zkt_event_ownership held on held.event_id = prior.id
        where prior.legacy_raw_id = l.id
      )
  ), numbered as (
    select l.id as raw_id, e.id from raw_event l join public.employees e on e.employee_number = l.employee_number
    where not exists (select 1 from public.employees other where other.employee_number = l.employee_number and other.id <> e.id)
      and not exists (select 1 from public.employee_employment_periods p where p.employee_number = l.employee_number and p.employee_id <> e.id)
      and not exists (select 1 from public.zkt_identifier_history h where h.terminal_user_id = l.employee_number::text and h.employee_id <> e.id
        and l.punch_time >= h.valid_from and (h.valid_to is null or l.punch_time < h.valid_to))
      and not exists (select 1 from public.employee_feature_flags where flag = 'employee_number_reuse' and enabled)
      -- Guard actual ambiguity rather than the mere availability of Rehire.
      and not exists (select 1 from public.zkt_reserved_terminal_identifiers reserved where reserved.terminal_user_id::numeric=l.employee_number)
      and not exists (
        select 1 from public.employee_employment_periods assignment
        where assignment.id=(select max(latest.id) from public.employee_employment_periods latest where latest.employee_id=e.id)
          and l.punch_time < greatest(assignment.work_started_at,assignment.hire_date::timestamp at time zone 'America/New_York')
      )
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
$function$
;
commit;
