-- Prepared for separate release approval. No employee is transferred by this patch.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.employee_employment_periods
  add column transferred_from_period_id bigint references public.employee_employment_periods(id);

-- Plant ranges constrain new HR assignments. Existing active numbers and
-- unfinished HR reservations still occupy their numbers globally.
create function public.employee_plant_number_range(p_plant text) returns int4range
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  case p_plant
    when 'NJ' then return int4range(1, 100);
    when 'PA' then return int4range(100, 200);
    else raise exception 'Choose NJ or PA' using errcode = '23514';
  end case;
end $$;
revoke all on function public.employee_plant_number_range(text) from public, anon, authenticated, service_role;

create function public.next_available_employee_number(p_plant text) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  bounds int4range;
  candidate integer;
begin
  if not public.employee_archive_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  bounds := public.employee_plant_number_range(p_plant);
  select min(n) into candidate from generate_series(lower(bounds), upper(bounds) - 1) n
    where not exists (select 1 from public.employee_hr_occupied_numbers() occupied where occupied.number = n);
  if candidate is null then
    raise exception 'No free Employee Number for % (%–%)', p_plant, lower(bounds), upper(bounds) - 1 using errcode = '23514';
  end if;
  return candidate;
end $$;
revoke all on function public.next_available_employee_number(text) from public, anon, service_role;
grant execute on function public.next_available_employee_number(text) to authenticated;

-- Both writers call this under the same allocation lock. Only release the
-- archived HR claim. Physical terminal reservations remain in force.
create function public.validate_employee_plant_number(p_plant text, p_number integer) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  bounds int4range := public.employee_plant_number_range(p_plant);
  suggestion integer;
begin
  if p_number is null or not (bounds @> p_number) then
    raise exception 'Employee Number for % must be between % and %', p_plant, lower(bounds), upper(bounds) - 1 using errcode = '23514';
  end if;
  if exists (select 1 from public.employee_hr_occupied_numbers() where number = p_number) then
    begin
      suggestion := public.next_available_employee_number(p_plant);
    exception when check_violation then
      raise exception 'Employee Number % is assigned or reserved. No free Employee Number for %.', p_number, p_plant using errcode = '23505';
    end;
    raise exception 'Employee Number % is assigned or reserved. Next free Employee Number: %.', p_number, suggestion using errcode = '23505';
  end if;
  update public.employee_number_reservations r set hr_released_at=clock_timestamp()
    from public.employee_employment_periods p,public.employees e
    where p.id=r.period_id and e.id=r.employee_id and r.employee_number=p_number
      and e.active is not true and (p.legacy_inactive or p.termination_date is not null)
      and r.released_at is null and r.hr_released_at is null;
end $$;
revoke all on function public.validate_employee_plant_number(text, integer) from public, anon, authenticated, service_role;

create or replace function public.allocate_employee_insert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.employee_number_config%rowtype;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict c from public.employee_number_config where singleton;
  if nullif(btrim(new.first_name),'') is null then raise exception 'First name is required' using errcode='23514'; end if;
  new.plant_location := coalesce(new.plant_location, 'NJ');
  if new.employee_number is null then
    new.employee_number := public.next_available_employee_number(new.plant_location);
  end if;
  perform public.validate_employee_plant_number(new.plant_location, new.employee_number);
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

create function public.preview_employee_plant_transfer(p_employee_id uuid, p_plant text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  employee public.employees%rowtype;
  period public.employee_employment_periods%rowtype;
  candidate integer;
begin
  if not public.employee_archive_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_plant is null or p_plant not in ('NJ', 'PA') then
    raise exception 'Choose NJ or PA' using errcode = '23514';
  end if;
  select * into strict employee from public.employees where id = p_employee_id and active is true;
  select * into strict period from public.employee_employment_periods
    where employee_id = employee.id and termination_date is null and not legacy_inactive;
  if p_plant = employee.plant_location
     and (period.plant_location is null or period.plant_location not in ('NJ', 'PA') or period.plant_location = p_plant) then
    raise exception 'There is no recorded plant transfer for this employee' using errcode = '23514';
  end if;
  candidate := public.next_available_employee_number(p_plant);
  return jsonb_build_object('employee_number', candidate, 'plant_location', p_plant,
    'previous_plant', period.plant_location, 'previous_number', employee.employee_number);
end $$;
revoke all on function public.preview_employee_plant_transfer(uuid, text) from public, anon, service_role;
grant execute on function public.preview_employee_plant_transfer(uuid, text) to authenticated;

create function public.save_employee_plant_transfer(
  p_employee_id uuid, p_expected_plant text, p_expected_number integer, p_updates jsonb
) returns public.employees
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  employee public.employees%rowtype;
  changes public.employees%rowtype;
  period public.employee_employment_periods%rowtype;
  transfer_at timestamptz;
  transfer_day date;
  new_period_id bigint;
begin
  if not public.employee_archive_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_updates) is distinct from 'object' then
    raise exception 'Invalid employee transfer fields' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_updates) as key(name)
    where key.name not in ('employee_number', 'plant_location', 'first_name', 'last_name', 'phone', 'email',
      'position', 'pay_type', 'hourly_rate', 'monthly_salary', 'overtime_enabled', 'downtime_enabled',
      'default_lunch_hours', 'shift_type', 'active', 'exclude_from_payroll_report', 'hire_date',
      'employer_form', 'company_name', 'company_id', 'zkt_enabled', 'zkt_user_id', 'zkt_name',
      'zkt_password', 'zkt_card_number', 'zkt_privilege', 'photo_url')
  ) then
    raise exception 'Invalid employee transfer fields' using errcode = '23514';
  end if;

  -- Serialize against attendance processing and employee-number allocation.
  perform pg_advisory_xact_lock(736261, 1);
  perform pg_advisory_xact_lock(736261, 2);
  select * into strict employee from public.employees where id = p_employee_id and active is true for update;
  if (employee.plant_location, employee.employee_number) is distinct from (p_expected_plant, p_expected_number) then
    raise exception 'Employee assignment changed. Reopen the form.' using errcode = '40001';
  end if;
  changes := jsonb_populate_record(employee, p_updates);
  if (changes.hire_date, changes.active) is distinct from (employee.hire_date, employee.active) then
    raise exception 'A plant transfer cannot change the hire date or employment status' using errcode = '23514';
  end if;
  if nullif(btrim(changes.first_name), '') is null then
    raise exception 'First name is required' using errcode = '23514';
  end if;
  perform public.validate_employee_plant_number(changes.plant_location, changes.employee_number);
  select * into strict period from public.employee_employment_periods
    where employee_id = employee.id and termination_date is null and not legacy_inactive for update;
  if changes.plant_location = employee.plant_location
     and (period.plant_location is null or period.plant_location not in ('NJ', 'PA') or period.plant_location = changes.plant_location) then
    raise exception 'There is no recorded plant transfer for this employee' using errcode = '23514';
  end if;
  transfer_at := clock_timestamp();
  transfer_day := greatest(period.hire_date, (transfer_at at time zone 'America/New_York')::date);
  transfer_at := greatest(transfer_at, transfer_day::timestamp at time zone 'America/New_York');

  -- The prior period and terminal reservation remain as recorded. A new
  -- period records the exact cutover without changing the original hire date.
  update public.employee_employment_periods set termination_date = greatest(period.hire_date, transfer_day - 1,
    (select max(w.work_date) from public.employee_work_logs w where w.employee_id = employee.id and w.work_date <= transfer_day))
  where id = period.id;
  update public.employee_number_reservations set hr_released_at = transfer_at
    where period_id = period.id and hr_released_at is null;
  insert into public.employee_employment_periods (employee_id, employee_number, hire_date, position,
    company_id, plant_location, hourly_rate, terminal_user_id, work_started_at, transferred_from_period_id)
  values (employee.id, changes.employee_number, transfer_day, changes.position, changes.company_id,
    changes.plant_location, changes.hourly_rate, changes.employee_number, transfer_at, period.id)
  returning id into new_period_id;
  insert into public.employee_number_reservations (period_id, employee_id, employee_number)
  values (new_period_id, employee.id, changes.employee_number);
  update public.employee_integration_operations set status = 'superseded'
    where period_id = period.id and action = 'activate' and status in ('pending', 'failed');

  perform set_config('farmplast.employee_plant_transfer', employee.id::text, true);
  update public.employees set
    employee_number = changes.employee_number, plant_location = changes.plant_location,
    first_name = changes.first_name, last_name = changes.last_name, phone = changes.phone,
    email = changes.email, position = changes.position, pay_type = changes.pay_type,
    hourly_rate = changes.hourly_rate, monthly_salary = changes.monthly_salary,
    overtime_enabled = changes.overtime_enabled, downtime_enabled = changes.downtime_enabled,
    default_lunch_hours = changes.default_lunch_hours, shift_type = changes.shift_type,
    exclude_from_payroll_report = changes.exclude_from_payroll_report, employer_form = changes.employer_form,
    company_name = changes.company_name, company_id = changes.company_id, photo_url = changes.photo_url,
    zkt_user_id = changes.employee_number, zkt_enabled = false, zkt_synced_at = null,
    zkt_sync_status = case when changes.zkt_enabled or employee.zkt_enabled then 'pending' else 'disabled' end,
    zkt_sync_error = case when changes.zkt_enabled or employee.zkt_enabled then
      'New terminal ID has not been verified. Confirm the destination terminal registration before enabling ZKT.' end,
    zkt_name = changes.zkt_name, zkt_password = changes.zkt_password,
    zkt_card_number = changes.zkt_card_number, zkt_privilege = changes.zkt_privilege
  where id = employee.id returning * into employee;
  perform set_config('farmplast.employee_plant_transfer', '', true);
  return employee;
end $$;
revoke all on function public.save_employee_plant_transfer(uuid, text, integer, jsonb) from public, anon, service_role;
grant execute on function public.save_employee_plant_transfer(uuid, text, integer, jsonb) to authenticated;

-- Keep direct identity edits protected. Only the definer of the validated
-- transfer RPC can use its transaction-local context for this exact UUID.
create or replace function public.protect_employee_history() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  transferring boolean;
begin
  if tg_op = 'DELETE' then raise exception 'Employee history cannot be deleted'; end if;
  if new.id is distinct from old.id then raise exception 'Permanent employee identity cannot change'; end if;
  transferring := coalesce(current_setting('farmplast.employee_plant_transfer', true) = old.id::text, false)
    and current_user = (select pg_get_userbyid(proowner) from pg_proc
      where oid = 'public.save_employee_plant_transfer(uuid,text,integer,jsonb)'::regprocedure);
  if old.active is true and new.active is true and new.plant_location is distinct from old.plant_location
    and not transferring then
    raise exception 'Use the plant transfer form to change the plant';
  end if;
  if (new.employee_number, new.zkt_user_id, new.active, new.hire_date, new.termination_date,
      new.termination_reason, new.termination_notes) is distinct from
     (old.employee_number, old.zkt_user_id, old.active, old.hire_date, old.termination_date,
      old.termination_reason, old.termination_notes)
    and current_setting('farmplast.employee_lifecycle', true) is distinct from 'on'
    and not transferring then
    raise exception 'Use employment lifecycle to change identity or employment';
  end if;
  return new;
end $$;

create or replace function public.guard_employee_feature_mutation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if old.active is true and new.active is not true then perform public.employee_require_feature('employee_terminate'); end if;
    if old.active is not true and new.active is true then perform public.employee_require_feature('employee_rehire'); end if;
    if (new.termination_date, new.termination_reason, new.termination_notes) is distinct from
       (old.termination_date, old.termination_reason, old.termination_notes) then
      perform public.employee_require_feature(case when old.active is not true and new.active is true then 'employee_rehire' else 'employee_terminate' end);
    end if;
    if new.employee_number is distinct from old.employee_number
      and (current_setting('farmplast.employee_plant_transfer', true) is distinct from old.id::text or not exists (
        select 1 from public.employee_employment_periods p
        where p.employee_id = old.id and p.termination_date is null and not p.legacy_inactive
          and p.transferred_from_period_id is not null and p.employee_number = new.employee_number
          and p.terminal_user_id = new.zkt_user_id and p.plant_location = new.plant_location
      )) then
      perform public.employee_require_feature('employee_number_reuse');
    end if;
  end if;
  return new;
end $$;

-- Historical corrections still use the assignment that owned their work day.
-- A transfer's exact cutover remains enforced for new work on its own dates.
create or replace function public.guard_new_employee_work_start() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  period public.employee_employment_periods%rowtype;
  shift text;
  punch_at timestamptz;
begin
  if coalesce(new.is_deleted, false) or (new.time_in is null and new.time_out is null) then return new; end if;
  select p.* into period from public.employee_employment_periods p
    where p.employee_id = new.employee_id and p.termination_date is null and not p.legacy_inactive
    order by p.id desc limit 1;
  if period.transferred_from_period_id is not null then
    if new.work_date < period.hire_date then
      select p.* into period from public.employee_employment_periods p
        where p.employee_id = new.employee_id and (p.hire_date is null or p.hire_date <= new.work_date)
          and p.termination_date >= new.work_date
        order by p.id desc limit 1;
    elsif tg_op = 'UPDATE' and old.employee_id = new.employee_id and old.work_date = new.work_date
        and coalesce(old.created_at <= period.work_started_at, true) then
      return new;
    end if;
  end if;
  if period.work_started_at is null then return new; end if;
  select shift_type into shift from public.employees where id = new.employee_id;
  punch_at := (new.work_date + coalesce(new.time_in, new.time_out) + case
    when shift = 'night' and coalesce(new.time_in, new.time_out) < time '12:00' then interval '1 day'
    else interval '0 day' end) at time zone 'America/New_York';
  if punch_at < period.work_started_at then
    raise exception 'Work time precedes the employee assignment start' using errcode = '23514';
  end if;
  return new;
end $$;

-- The deployed attendance processor uses this resolver. Keep raw records
-- and verified ownership intact; only route punches for the new assignment.
create or replace function public.zkt_compat_event_owner(p_raw_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  with raw_event as (select * from public.zkt_attendance_logs where id = p_raw_id),
  owned as (
    select o.employee_id, h.period_id
    from raw_event l join public.zkt_identity_events r on r.legacy_raw_id = l.id
    join public.zkt_event_ownership o on o.event_id = r.id
    join public.zkt_identifier_history h on h.id = o.mapping_id
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
$$;

notify pgrst, 'reload schema';
commit;
