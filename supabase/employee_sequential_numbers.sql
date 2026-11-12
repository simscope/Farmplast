-- Apply after employee_creation_fix.sql, only with separate production approval.
-- HR number availability is independent of physical terminal identity release.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(736261,2);

alter table public.employee_number_reservations add column hr_released_at timestamptz;
alter table public.employee_employment_periods add column work_started_at timestamptz;
drop index public.employee_held_number;
create unique index employee_held_number on public.employee_number_reservations(employee_number)
  where released_at is null and hr_released_at is null;
-- Former profiles retain their original identifier; only active identities must be unique.
do $$ begin
  if exists(select 1 from pg_constraint where conrelid='public.employees'::regclass and conname='employees_zkt_user_id_key') then
    alter table public.employees drop constraint employees_zkt_user_id_key;
  else
    drop index public.employees_zkt_user_id_key;
  end if;
end $$;
create unique index employees_active_zkt_user_id_key on public.employees(zkt_user_id) where active is true;

create function public.employee_hr_occupied_numbers() returns table(number numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  select employee_number::numeric from public.employees where active is true
  union select zkt_user_id::numeric from public.employees where active is true and zkt_user_id is not null
  union select r.employee_number::numeric from public.employee_number_reservations r
    join public.employee_employment_periods p on p.id=r.period_id
    join public.employees e on e.id=r.employee_id
    where r.released_at is null and r.hr_released_at is null
      and not (e.active is not true and (p.legacy_inactive or p.termination_date is not null))
$$;
revoke all on function public.employee_hr_occupied_numbers() from public,anon,authenticated,service_role;

create or replace function public.next_available_employee_number() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.employee_number_config%rowtype; candidate integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into strict c from public.employee_number_config where singleton;
  -- NULL maximum means no configured HR cap. INT storage is not a terminal range.
  with used as materialized(select number from public.employee_hr_occupied_numbers()
      where number>=c.minimum and number<=coalesce(c.maximum,2147483647)),
  candidates as (select c.minimum::numeric number union select number+1 from used where number<coalesce(c.maximum,2147483647))
  select min(n.number)::integer into candidate from candidates n
    where not exists(select 1 from used u where u.number=n.number);
  if candidate is null then raise exception 'No free Employee Number in the configured range' using errcode='23514'; end if;
  return candidate;
end $$;

create function public.employee_creation_terminal_clear(p_number integer,p_employee uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.employee_creation_zkt_ready(p_number)
    and not exists(select 1 from public.zkt_reserved_terminal_identifiers where terminal_user_id::numeric=p_number)
    and not exists(select 1 from public.employee_number_reservations r
      join public.employee_employment_periods p on p.id=r.period_id
      where p.terminal_user_id=p_number and r.employee_id<>p_employee and r.released_at is null)
    and not exists(select 1 from public.zkt_identifier_history
      where terminal_user_id::numeric=p_number and employee_id<>p_employee and valid_to is null)
$$;
revoke all on function public.employee_creation_terminal_clear(integer,uuid) from public,anon,authenticated,service_role;

create or replace function public.allocate_employee_insert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.employee_number_config%rowtype;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict c from public.employee_number_config where singleton;
  if nullif(btrim(new.first_name),'') is null then raise exception 'First name is required' using errcode='23514'; end if;
  if new.employee_number is null then new.employee_number:=public.next_available_employee_number(); end if;
  if new.employee_number<c.minimum or new.employee_number>coalesce(c.maximum,2147483647) then
    raise exception 'Employee number outside configured HR range' using errcode='23514'; end if;
  if exists(select 1 from public.employee_hr_occupied_numbers() where number=new.employee_number) then
    raise exception 'Employee number % is currently assigned or reserved. Next free Employee Number: %.',new.employee_number,public.next_available_employee_number() using errcode='23505'; end if;
  -- Close only the HR claim of an already archived/terminated person.
  -- released_at remains physical terminal/SACS proof and is never forged here.
  update public.employee_number_reservations r set hr_released_at=clock_timestamp()
    from public.employee_employment_periods p,public.employees e
    where p.id=r.period_id and e.id=r.employee_id and r.employee_number=new.employee_number
      and e.active is not true and (p.legacy_inactive or p.termination_date is not null)
      and r.released_at is null and r.hr_released_at is null;
  new.zkt_user_id:=new.employee_number;
  new.zkt_sync_status:=case when coalesce(new.zkt_enabled,false) then 'pending' else 'disabled' end;
  new.zkt_sync_error:=case
    when not coalesce(new.zkt_enabled,false) then null
    when exists(select 1 from public.zkt_identity_principals where terminal_user_id=new.employee_number and employee_id<>new.id)
      and not public.employee_creation_terminal_clear(new.employee_number,new.id)
      then 'Previous terminal identity must be replaced and verified. Farmplast history remains separate.'
    when c.maximum is null then 'Terminal employee number range is not configured.'
    when not public.employee_creation_terminal_clear(new.employee_number,new.id) then 'Terminal identity or inventories require verification.'
    else null end;
  new.zkt_enabled:=false;
  new.zkt_synced_at:=null;
  return new;
end $$;

create or replace function public.guard_employee_feature_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Ordinary INSERT allocates a free HR number without enabling lifecycle UI.
  -- Existing profiles, status changes and renumbering keep their original gates.
  if tg_op='UPDATE' then
    if old.active is true and new.active is not true then perform public.employee_require_feature('employee_terminate'); end if;
    if old.active is not true and new.active is true then perform public.employee_require_feature('employee_rehire'); end if;
    if (new.termination_date,new.termination_reason,new.termination_notes) is distinct from (old.termination_date,old.termination_reason,old.termination_notes) then
      perform public.employee_require_feature(case when old.active is not true and new.active is true then 'employee_rehire' else 'employee_terminate' end);
    end if;
    if new.employee_number is distinct from old.employee_number then perform public.employee_require_feature('employee_number_reuse'); end if;
  end if;
  return new;
end $$;

create or replace function public.record_employee_first_period() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid bigint;
begin
  insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,legacy_inactive,terminal_user_id,work_started_at)
    values(new.id,new.employee_number,new.hire_date,new.position,new.company_id,new.plant_location,new.hourly_rate,new.active is not true,new.zkt_user_id,
      greatest(clock_timestamp(),new.hire_date::timestamp at time zone 'America/New_York')) returning id into pid;
  insert into public.employee_number_reservations(period_id,employee_id,employee_number) values(pid,new.id,new.employee_number);
  insert into public.zkt_identity_principals values(new.id,new.zkt_user_id);
  if new.active is true then
    if new.zkt_sync_status='pending' and public.employee_creation_terminal_clear(new.employee_number,new.id) then
      perform public.queue_employee_integrations(pid,'activate');
    else
      insert into public.employee_integration_operations(period_id,employee_id,action,target,payload)
        values(pid,new.id,'activate','SACS',jsonb_build_object('source_employee_id',new.id,'employee_number',new.employee_number::text,
          'full_name',trim(new.first_name||' '||coalesce(new.last_name,'')),'phone',new.phone,'email',new.email,'position',new.position,'is_active',true))
        on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- Timestamp boundary for newly created UUIDs. Historical mappings are untouched.
create function public.guard_new_employee_mapping_start() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.employee_employment_periods p where p.id=new.period_id
      and p.work_started_at is not null and new.valid_from<p.work_started_at) then
    raise exception 'Terminal mapping precedes the employee assignment start'; end if;
  return new;
end $$;
revoke all on function public.guard_new_employee_mapping_start() from public,anon,authenticated,service_role;
create trigger guard_new_employee_mapping_start before insert or update on public.zkt_identifier_history
  for each row execute function public.guard_new_employee_mapping_start();

create function public.guard_new_employee_work_start() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare floor_at timestamptz; shift text; punch_at timestamptz;
begin
  if coalesce(new.is_deleted,false) or (new.time_in is null and new.time_out is null) then return new; end if;
  select p.work_started_at,e.shift_type into floor_at,shift from public.employee_employment_periods p
    join public.employees e on e.id=p.employee_id where p.employee_id=new.employee_id and p.work_started_at is not null
      and p.termination_date is null and not p.legacy_inactive order by p.id desc limit 1;
  if floor_at is null then return new; end if;
  punch_at:=(new.work_date+coalesce(new.time_in,new.time_out)+case when shift='night' and coalesce(new.time_in,new.time_out)<time '12:00' then interval '1 day' else interval '0 day' end) at time zone 'America/New_York';
  if punch_at<floor_at then raise exception 'Work time precedes the employee assignment start' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.guard_new_employee_work_start() from public,anon,authenticated,service_role;
create trigger guard_new_employee_work_start before insert or update on public.employee_work_logs
  for each row execute function public.guard_new_employee_work_start();

notify pgrst,'reload schema';
commit;
