-- Validate plant/current assignment and keep reserved device accounts protected.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
create function public.validate_zkt_assignment_sync(p_employee_id uuid,p_device_key text,p_serial_number text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype;d public.zkt_identity_devices%rowtype;pid bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501';end if;
 select * into strict d from public.zkt_identity_devices where device_key=p_device_key and serial_number=p_serial_number and verified;
 select * into strict e from public.employees where id=p_employee_id and active and plant_location=d.plant_location
  and (zkt_enabled or zkt_sync_status='pending');
 select id into strict pid from public.employee_employment_periods where employee_id=e.id and termination_date is null and not legacy_inactive and terminal_user_id=e.zkt_user_id;
 if exists(select 1 from public.zkt_reserved_terminal_identifiers r where r.terminal_user_id::numeric=e.zkt_user_id)
  and not exists(select 1 from public.zkt_identifier_history h where h.employee_id=e.id and h.period_id=pid and h.device_key=d.device_key and h.terminal_user_id=e.zkt_user_id::text and h.processing_verified and h.valid_to is null) then
  raise exception 'Reserved terminal account requires explicit verified assignment' using errcode='23514';
 end if;
end $$;
revoke all on function public.validate_zkt_assignment_sync(uuid,text,text) from public,anon,authenticated;
grant execute on function public.validate_zkt_assignment_sync(uuid,text,text) to service_role;
create or replace function public.confirm_zkt_assignment_readback(p_device_key text,p_serial_number text,p_users jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.zkt_identity_devices%rowtype; e record; h record; u jsonb;
 cutoff timestamptz; release_at timestamptz; confirmed integer:=0; accepted integer:=0; mismatched integer:=0; expected_name text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501'; end if;
 select * into strict d from public.zkt_identity_devices where device_key=p_device_key and verified and serial_number=p_serial_number;
 if jsonb_typeof(p_users) is distinct from 'array' or jsonb_array_length(p_users)>5000 then raise exception 'Invalid SDK user inventory'; end if;
 if exists(select 1 from jsonb_array_elements(p_users) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate terminal user in SDK inventory'; end if;
 perform pg_advisory_xact_lock(736261,2);
 select started_at into strict release_at from farmplast_zkt_private.import_release where singleton;
 for e in select person.*,p.id period_id,p.work_started_at,p.hire_date assignment_hire_date
  from public.employees person join public.employee_employment_periods p on p.employee_id=person.id
  where person.active and person.plant_location=d.plant_location and p.termination_date is null and not p.legacy_inactive
   and p.terminal_user_id=person.zkt_user_id and (person.zkt_enabled or person.zkt_sync_status='pending')
 loop
  if exists(select 1 from public.zkt_reserved_terminal_identifiers r where r.terminal_user_id::numeric=e.zkt_user_id)
    and not exists(select 1 from public.zkt_identifier_history proof where proof.employee_id=e.id and proof.period_id=e.period_id and proof.device_key=d.device_key and proof.terminal_user_id=e.zkt_user_id::text and proof.processing_verified and proof.valid_to is null) then
   mismatched:=mismatched+1;continue;
  end if;
  expected_name:=left(btrim(coalesce(nullif(btrim(e.zkt_name),''),concat_ws(' ',e.first_name,e.last_name))),24);
  select x into u from jsonb_array_elements(p_users) x where x->>'id'=e.zkt_user_id::text;
  if u is null or u->>'enabled'='false' or lower(btrim(u->>'name')) is distinct from lower(expected_name) then
   if e.zkt_sync_status not in ('disabled','deleted_from_zkt_sdk') and not exists(select 1 from public.zkt_reserved_terminal_identifiers reserved where reserved.terminal_user_id::numeric=e.zkt_user_id)
     and not exists(select 1 from public.zkt_bridge_commands q where q.command='sync_one_employee' and q.payload->>'employee_id'=e.id::text and q.status in ('pending','pending_pa','pending_attendance','running')) then
    insert into public.zkt_bridge_commands(command,payload,status) values('sync_one_employee',jsonb_build_object('employee_id',e.id,'plant_location',e.plant_location),case when e.plant_location='PA' then 'pending_pa' else 'pending' end);
   end if;
   mismatched:=mismatched+1;continue;
  end if;
  if exists(select 1 from public.zkt_identifier_history current_map where current_map.device_key=d.device_key
    and current_map.terminal_user_id=e.zkt_user_id::text and current_map.employee_id=e.id and current_map.period_id=e.period_id
    and current_map.valid_to is null and current_map.processing_verified) then
   if not e.zkt_enabled then update public.employees set zkt_enabled=true,zkt_sync_status='verified_sdk',zkt_sync_error=null,zkt_synced_at=clock_timestamp() where id=e.id;end if;
   accepted:=accepted+1;continue;
  end if;
  cutoff:=greatest(release_at,coalesce(e.work_started_at,release_at),coalesce(e.assignment_hire_date::timestamp at time zone 'America/New_York',release_at));
  -- A retained number may pass only from a closed/inactive assignment. Closing
  -- an interval must never exclude any of its permanently owned events.
  if exists(select 1 from public.zkt_identifier_history oldmap join public.employees oldperson on oldperson.id=oldmap.employee_id
    join public.employee_employment_periods oldperiod on oldperiod.id=oldmap.period_id
    where oldmap.device_key=d.device_key and oldmap.terminal_user_id=e.zkt_user_id::text
     and (oldmap.valid_to is null or oldmap.valid_to>cutoff)
     and (oldmap.valid_from>=cutoff or (oldperson.active and oldperiod.termination_date is null)
      or exists(select 1 from public.zkt_event_ownership o join public.zkt_identity_events r on r.id=o.event_id where o.mapping_id=oldmap.id and r.event_at>=cutoff))) then
   mismatched:=mismatched+1;continue;
  end if;
  for h in select id from public.zkt_identifier_history where device_key=d.device_key and terminal_user_id=e.zkt_user_id::text
    and valid_from<cutoff and (valid_to is null or valid_to>cutoff) loop
   update public.zkt_identifier_history set valid_to=cutoff where id=h.id;
  end loop;
  insert into public.zkt_identifier_history(device_key,terminal_user_id,employee_id,period_id,valid_from,evidence,shift_type,hourly_rate,default_lunch_hours,processing_verified)
   values(d.device_key,e.zkt_user_id::text,e.id,e.period_id,cutoff,'Current HR assignment plus serial-verified SDK user readback; forward binding only',coalesce(e.shift_type,'day'),coalesce(e.hourly_rate,0),coalesce(e.default_lunch_hours,1),true);
  if not e.zkt_enabled then
   update public.employees set zkt_enabled=true,zkt_sync_status='verified_sdk',zkt_sync_error=null,zkt_synced_at=clock_timestamp() where id=e.id;
  end if;
  confirmed:=confirmed+1;
  accepted:=accepted+1;
 end loop;
 return jsonb_build_object('confirmed',confirmed,'accepted',accepted,'mismatched',mismatched);
end $$;
create or replace function public.queue_new_zkt_assignment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.active and new.zkt_sync_status='pending'
  and not exists(select 1 from public.zkt_reserved_terminal_identifiers reserved where reserved.terminal_user_id::numeric=new.zkt_user_id)
  and exists(select 1 from public.zkt_identity_devices where verified and plant_location=new.plant_location)
  and not exists(select 1 from public.zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=new.id::text and status in ('pending','pending_pa','pending_attendance','running')) then
  insert into public.zkt_bridge_commands(command,payload,status) values('sync_one_employee',jsonb_build_object('employee_id',new.id,'plant_location',new.plant_location),case when new.plant_location='PA' then 'pending_pa' else 'pending' end);
 end if;
 return new;
end $$;
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
      and not exists (select 1 from public.zkt_reserved_terminal_identifiers reserved where reserved.terminal_user_id::numeric=l.employee_number)
      -- A newly assigned UUID must not inherit old raw punches merely because
      -- no former HR profile exists for that retained terminal number.
      and not exists (
        select 1 from public.employee_employment_periods assignment
        where assignment.id=(select max(latest.id) from public.employee_employment_periods latest where latest.employee_id=e.id)
          and l.punch_time < greatest(assignment.work_started_at,assignment.hire_date::timestamp at time zone 'America/New_York')
      )
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
notify pgrst,'reload schema';
commit;
