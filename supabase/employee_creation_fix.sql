-- P0 Add Employee fix. Review and apply separately before the matching UI release.
-- No data/configuration changes; lifecycle/reuse gates and provisioning RPCs stay intact.
begin;

-- One local HR namespace. With reuse OFF, retain every historical employee,
-- reservation, proposed terminal identity and raw attendance identifier.
-- INT's storage limit is not a claim about any terminal's supported range.
create or replace function public.employee_creation_used_numbers()
returns table(number numeric) language sql stable security definer
set search_path=public,pg_temp as $$
  select employee_number::numeric from public.employees
  union select zkt_user_id::numeric from public.employees where zkt_user_id is not null
  union select employee_number::numeric from public.employee_number_reservations
  union select employee_number::numeric from public.employee_employment_periods
  union select terminal_user_id::numeric from public.employee_employment_periods where terminal_user_id is not null
  union select terminal_user_id::numeric from public.zkt_identity_principals
  union select terminal_user_id::numeric from public.zkt_reserved_terminal_identifiers
  union select employee_number::numeric from public.zkt_attendance_logs where employee_number is not null
$$;
revoke all on function public.employee_creation_used_numbers() from public,anon,authenticated,service_role;

create or replace function public.next_unused_employee_number() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  with used as materialized (
    select number from public.employee_creation_used_numbers() where number>=1 and number<=2147483647
  ), candidates as (
    select 1::numeric as number union select number+1 from used where number<2147483647
  )
  select min(c.number)::integer into candidate from candidates c
    where not exists(select 1 from used u where u.number=c.number);
  if candidate is null then raise exception 'No unused Farmplast employee numbers available'; end if;
  return candidate;
end $$;
revoke all on function public.next_unused_employee_number() from public,anon,authenticated,service_role;

create or replace function public.employee_creation_zkt_ready(p_number integer) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.employee_number_config c
      where c.singleton and c.maximum is not null and p_number between c.minimum and c.maximum)
    and exists(select 1 from public.zkt_identity_devices where plant_location='NJ')
    and exists(select 1 from public.zkt_identity_devices where plant_location='PA')
    and not exists(select 1 from public.zkt_identity_devices where not verified or not inventory_verified)
$$;
revoke all on function public.employee_creation_zkt_ready(integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.next_available_employee_number()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  -- Automatic assignment of a never-used HR number is not number reuse.
  if not public.employee_feature_enabled('employee_number_reuse')
    or not exists(select 1 from public.employee_number_config where reuse_enabled) then
    return public.next_unused_employee_number();
  end if;
  if exists(select 1 from public.employee_number_config where reuse_enabled)
    and not public.employee_reuse_release_verified() then
    raise exception 'Number reuse release evidence is missing or expired';
  end if;
  return public.next_available_employee_number_pre_release();
end $function$;

CREATE OR REPLACE FUNCTION public.allocate_employee_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.employee_number_config%rowtype;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict c from public.employee_number_config where singleton;
  -- Validate new profiles on the server, including direct PostgREST INSERTs.
  if nullif(btrim(new.first_name),'') is null then
    raise exception 'First name is required' using errcode='23514';
  end if;
  if not public.employee_feature_enabled('employee_number_reuse') or not c.reuse_enabled then
    -- The same allocation mutex serializes both automatic and explicit numbers.
    if new.employee_number is null then new.employee_number:=public.next_unused_employee_number(); end if;
    if new.employee_number<1 then raise exception 'A positive employee number is required' using errcode='23514'; end if;
    if exists(select 1 from public.employee_creation_used_numbers() where number=new.employee_number) then
      raise exception 'Employee number has already been used or reserved; refresh the suggested number' using errcode='23505';
    end if;
    new.zkt_user_id:=new.employee_number;
    new.zkt_sync_status:=case when coalesce(new.zkt_enabled,false) then 'pending' else 'disabled' end;
    new.zkt_sync_error:=case
      when not coalesce(new.zkt_enabled,false) then null
      when c.maximum is null then 'Terminal employee number range is not configured.'
      when new.employee_number<c.minimum or new.employee_number>c.maximum then 'Employee number is outside the verified terminal range.'
      when not public.employee_creation_zkt_ready(new.employee_number) then 'Terminal inventories are not verified.'
      else null end;
    -- A requested sync is not an acknowledgement from a terminal.
    new.zkt_enabled:=false;
    new.zkt_synced_at:=null;
    return new;
  end if;
  if new.employee_number is null then
    if to_regclass('public.employee_feature_flags') is not null then perform public.employee_require_feature('employee_number_reuse'); end if;
    new.employee_number:=public.next_available_employee_number();
  end if;
  if c.maximum is null then raise exception 'Terminal employee number range must be verified and configured'; end if;
  if new.employee_number<c.minimum or (c.maximum is not null and new.employee_number>c.maximum) then raise exception 'Employee number outside configured range'; end if;
  if exists(select 1 from public.employee_number_reservations where employee_number=new.employee_number and (released_at is null or not c.reuse_enabled)) then
    raise exception 'Employee number remains reserved; refresh the suggested number' using errcode='23505'; end if;
  if exists(select 1 from public.zkt_reserved_terminal_identifiers where terminal_user_id::numeric=new.employee_number) then
    raise exception 'Employee number belongs to a reserved terminal account'; end if;
  if exists(select 1 from public.employee_number_reservations r join public.employee_employment_periods p on p.id=r.period_id
      where p.terminal_user_id=new.employee_number and (r.released_at is null or not c.reuse_enabled)) then
    raise exception 'Employee number belongs to a retained terminal account'; end if;
  if not exists(select 1 from public.zkt_identity_devices where plant_location='NJ') or not exists(select 1 from public.zkt_identity_devices where plant_location='PA')
    or exists(select 1 from public.zkt_identity_devices where not verified or not inventory_verified) then
    raise exception 'Verified complete NJ/PA terminal inventories required before provisioning a new identity'; end if;
  new.zkt_user_id:=new.employee_number;
  -- Provisioning is recorded and acknowledged separately from profile creation.
  new.zkt_enabled:=false;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.record_employee_first_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare pid bigint;
begin
  insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,legacy_inactive,terminal_user_id)
  values(new.id,new.employee_number,new.hire_date,new.position,new.company_id,new.plant_location,new.hourly_rate,new.active is not true,new.zkt_user_id) returning id into pid;
  insert into public.employee_number_reservations values(pid,new.id,new.employee_number,null,now());
  insert into public.zkt_identity_principals values(new.id,new.zkt_user_id);
  if new.active is true then
    if (public.employee_feature_enabled('employee_number_reuse')
        and exists(select 1 from public.employee_number_config where reuse_enabled))
      or (new.zkt_sync_status='pending' and public.employee_creation_zkt_ready(new.employee_number)) then
      -- Existing dispatcher/ACK checks remain the only path to terminal provisioning.
      perform public.queue_employee_integrations(pid,'activate');
    else
      -- Keep the existing SACS outbox contract, without queuing unsafe/unrequested ZKT work.
      insert into public.employee_integration_operations(period_id,employee_id,action,target,payload)
      values(pid,new.id,'activate','SACS',jsonb_build_object(
        'source_employee_id',new.id,'employee_number',new.employee_number::text,
        'full_name',trim(new.first_name||' '||coalesce(new.last_name,'')),
        'phone',new.phone,'email',new.email,'position',new.position,'is_active',true))
      on conflict do nothing;
    end if;
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';
commit;
