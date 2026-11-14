-- One device/identifier/assignment rule for current and future employees.
-- Never rebuild saved hours, reassign permanent owners, or backfill old punches.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select pg_advisory_xact_lock(736261,1);
create schema farmplast_zkt_private;
revoke all on schema farmplast_zkt_private from public,anon,authenticated,service_role;
create table farmplast_zkt_private.import_release(singleton boolean primary key default true check(singleton),started_at timestamptz not null default clock_timestamp());
alter table farmplast_zkt_private.import_release enable row level security;
insert into farmplast_zkt_private.import_release(singleton) values(true);

-- SDK readback confirms a current HR assignment. Existing explicit mappings
-- keep their verified dates; pre-release profiles get only a forward binding.
create function public.confirm_zkt_assignment_readback(p_device_key text,p_serial_number text,p_users jsonb) returns jsonb
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
  expected_name:=left(btrim(coalesce(nullif(btrim(e.zkt_name),''),concat_ws(' ',e.first_name,e.last_name))),24);
  select x into u from jsonb_array_elements(p_users) x where x->>'id'=e.zkt_user_id::text;
  if u is null or u->>'enabled'='false' or lower(btrim(u->>'name')) is distinct from lower(expected_name) then
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
revoke all on function public.confirm_zkt_assignment_readback(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_zkt_assignment_readback(text,text,jsonb) to service_role;

-- Device evidence and legacy rows commit together, before the unchanged payroll
-- processor runs once. Ignore duplicates rather than mutating original records.
create function public.ingest_zkt_attendance_batch(p_device_key text,p_serial_number text,p_events jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.zkt_identity_devices%rowtype; r jsonb; uid text; stamp timestamp; instant timestamptz;
 proofs jsonb:='[]'; native_result jsonb; inserted integer:=0; n integer; skipped integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501'; end if;
 select * into strict d from public.zkt_identity_devices where device_key=p_device_key and verified and serial_number=p_serial_number;
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>500 then raise exception 'Invalid attendance batch'; end if;
 for r in select value from jsonb_array_elements(p_events) loop
  uid:=r->>'deviceUserId';stamp:=null;instant:=null;
  begin
   if uid is null or uid!~'^[0-9]+$' or uid::numeric<1 or uid::numeric>2147483647 or coalesce(r->>'timestamp','')!~'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then raise exception 'Invalid SDK event';end if;
   stamp:=(r->>'timestamp')::timestamp;instant:=stamp at time zone d.timezone;
   if (instant at time zone d.timezone)<>stamp or ((instant-interval '1 hour') at time zone d.timezone)=stamp
    or ((instant+interval '1 hour') at time zone d.timezone)=stamp or instant>now()+interval '5 minutes' then raise exception 'Ambiguous SDK clock';end if;
  exception when others then skipped:=skipped+1;continue;end;
  if exists(select 1 from public.zkt_identifier_history h where h.device_key=d.device_key and h.terminal_user_id=uid and h.processing_verified
    and instant>=h.valid_from and (h.valid_to is null or instant<h.valid_to)) then proofs:=proofs||jsonb_build_array(r);end if;
 end loop;
 native_result:=public.ingest_zkt_identity_events(d.device_key,d.serial_number,proofs);
 perform set_config('farmplast.zkt_batch_import','on',true);
 for r in select value from jsonb_array_elements(p_events) loop
  begin
   uid:=r->>'deviceUserId';
   if uid is null or uid!~'^[0-9]+$' or uid::numeric<1 or uid::numeric>2147483647 or coalesce(r->>'timestamp','')!~'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then continue;end if;
   stamp:=(r->>'timestamp')::timestamp;instant:=stamp at time zone d.timezone;
   if (instant at time zone d.timezone)<>stamp or ((instant-interval '1 hour') at time zone d.timezone)=stamp
    or ((instant+interval '1 hour') at time zone d.timezone)=stamp or instant>now()+interval '5 minutes' then continue;end if;
   insert into public.zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw)
    values(uid::integer,instant,stamp,coalesce(r->'raw',r)||jsonb_build_object('device_key',d.device_key,'serial_number',d.serial_number,'plant_location',d.plant_location,'timestamp',r->>'timestamp'))
    on conflict(employee_number,punch_time) do nothing;
   get diagnostics n=row_count;inserted:=inserted+n;
  exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then continue;end;
 end loop;
 perform set_config('farmplast.zkt_batch_import','off',true);
 return jsonb_build_object('inserted',inserted,'skipped',skipped,'identity',native_result);
end $$;
revoke all on function public.ingest_zkt_attendance_batch(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_zkt_attendance_batch(text,text,jsonb) to service_role;
create or replace function public.after_zkt_attendance_log_insert() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_setting('farmplast.zkt_batch_import',true) is distinct from 'on' then perform public.process_zkt_attendance_to_work_logs();end if;
 return new;
end $$;

-- A single NJ attendance worker owns all attendance and individual-sync jobs.
-- The historical service continues to own bulk sync, verify, test and delete.
alter table public.zkt_bridge_commands drop constraint zkt_bridge_commands_status_check;
alter table public.zkt_bridge_commands add constraint zkt_bridge_commands_status_check check(status in ('pending','pending_pa','pending_attendance','running','done','error'));
create function public.route_zkt_general_import() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status in ('pending','pending_attendance') and coalesce(new.payload->>'plant_location','NJ')='NJ'
  and new.command in ('pull_attendance','sync_one_employee') then new.status:='pending_attendance';end if;
 return new;
end $$;
revoke all on function public.route_zkt_general_import() from public,anon,authenticated,service_role;
create trigger zz_route_zkt_general_import before insert or update on public.zkt_bridge_commands for each row execute function public.route_zkt_general_import();

-- Saving a requested new assignment queues the ordinary single-person sync.
-- No employee-specific jobs, identifiers or cron entries are created.
create function public.prepare_zkt_assignment_request() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()='authenticated' and public.employee_archive_admin() then
  if not new.zkt_enabled then new.zkt_sync_status:='disabled';new.zkt_sync_error:=null;
  elsif not old.zkt_enabled then new.zkt_enabled:=false;new.zkt_sync_status:='pending';new.zkt_sync_error:=null;end if;
 end if;
 return new;
end $$;
revoke all on function public.prepare_zkt_assignment_request() from public,anon,authenticated,service_role;
create trigger zz_prepare_zkt_assignment_request before update of zkt_enabled on public.employees for each row execute function public.prepare_zkt_assignment_request();
create function public.queue_new_zkt_assignment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.active and new.zkt_sync_status='pending'
  and exists(select 1 from public.zkt_identity_devices where verified and plant_location=new.plant_location)
  and not exists(select 1 from public.zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=new.id::text and status in ('pending','pending_pa','pending_attendance','running')) then
  insert into public.zkt_bridge_commands(command,payload,status) values('sync_one_employee',jsonb_build_object('employee_id',new.id,'plant_location',new.plant_location),case when new.plant_location='PA' then 'pending_pa' else 'pending' end);
 end if;
 return new;
end $$;
revoke all on function public.queue_new_zkt_assignment() from public,anon,authenticated,service_role;
create trigger zz_queue_new_zkt_assignment after insert or update on public.employees for each row execute function public.queue_new_zkt_assignment();
-- Resume previously requested, unconfirmed profiles through the same queue.
insert into public.zkt_bridge_commands(command,payload,status)
 select 'sync_one_employee',jsonb_build_object('employee_id',e.id,'plant_location',e.plant_location),case when e.plant_location='PA' then 'pending_pa' else 'pending' end
 from public.employees e where e.active and e.zkt_sync_status='pending'
  and exists(select 1 from public.zkt_identity_devices d where d.verified and d.plant_location=e.plant_location)
  and not exists(select 1 from public.zkt_bridge_commands q where q.command='sync_one_employee' and q.payload->>'employee_id'=e.id::text and q.status in ('pending','pending_pa','pending_attendance','running'));
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
