-- Partial SDK readbacks must not queue unrelated employees.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
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
notify pgrst,'reload schema';
commit;
