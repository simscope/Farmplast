-- Staged migration. Number reuse is deliberately NOT enabled.
begin;

alter table public.employees
  add column termination_date date,
  add column termination_reason text,
  add column termination_notes text;

create function public.employee_archive_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
revoke all on function public.employee_archive_admin() from public;
grant execute on function public.employee_archive_admin() to authenticated;

-- Restrictive policies intersect the existing permissive policies.
create policy employee_archive_read on public.employees as restrictive
for select to authenticated using (active is true or public.employee_archive_admin());
-- The dashboard presence view must use the caller's employee RLS policy.
alter view public.v_employee_current_presence set (security_invoker=true);

create table public.employee_employment_periods (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_number integer not null,
  hire_date date,
  termination_date date,
  termination_reason text,
  notes text,
  position text,
  company_id uuid,
  plant_location text,
  hourly_rate numeric,
  legacy_inactive boolean not null default false,
  recorded_at timestamptz not null default now(),
  check (termination_date is null or hire_date is null or termination_date >= hire_date)
);
create unique index employee_one_open_period on public.employee_employment_periods(employee_id)
where termination_date is null and not legacy_inactive;
alter table public.employee_employment_periods enable row level security;
revoke all on public.employee_employment_periods from public, anon, authenticated;
grant select on public.employee_employment_periods to authenticated;
create policy employee_period_admin_read on public.employee_employment_periods
for select to authenticated using (public.employee_archive_admin());
-- Unknown legacy termination dates remain unknown.
insert into public.employee_employment_periods
  (employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,legacy_inactive)
select id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,active is not true
from public.employees;

create table public.employee_lifecycle_readiness (
  singleton boolean primary key default true check(singleton),
  attendance_history_verified boolean not null default false,
  nj_deactivation_verified boolean not null default false,
  pa_deactivation_verified boolean not null default false,
  sacs_deactivation_verified boolean not null default false
);
insert into public.employee_lifecycle_readiness(singleton) values(true);
alter table public.employee_lifecycle_readiness enable row level security;
revoke all on public.employee_lifecycle_readiness from public, anon, authenticated;

create function public.employee_lifecycle_blockers() returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.employee_lifecycle_readiness%rowtype; result text[] := '{}';
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into strict r from public.employee_lifecycle_readiness where singleton;
  if not r.attendance_history_verified then result := array_append(result,'ZKT history processor and employment-date boundaries have not been verified'); end if;
  if not r.nj_deactivation_verified then result := array_append(result,'NJ terminal deactivation and acknowledgement have not been verified'); end if;
  if not r.pa_deactivation_verified then result := array_append(result,'PA terminal deactivation and acknowledgement have not been verified'); end if;
  if not r.sacs_deactivation_verified then result := array_append(result,'SACS inactive-roster delivery and acknowledgement have not been verified'); end if;
  return result;
end $$;

create function public.change_employee_employment(p_employee_id uuid, p_action text, p_date date,
  p_reason text default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.employees%rowtype; blockers text[]; latest_end date;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_action not in ('terminate','rehire') or p_action is null then raise exception 'Invalid employment action'; end if;
  if p_date is null or p_date > (now() at time zone 'America/New_York')::date then raise exception 'Enter a valid date that is not in the future'; end if;
  select * into strict e from public.employees where id=p_employee_id for update;
  if (p_action='terminate' and e.active is not true) or (p_action='rehire' and e.active is true) then raise exception 'Employee status has changed; refresh the page'; end if;
  if p_action='terminate' and e.hire_date > p_date then raise exception 'Termination precedes hire date'; end if;
  select max(termination_date) into latest_end from public.employee_employment_periods where employee_id=e.id;
  if p_action='rehire' and latest_end >= p_date then raise exception 'Rehire must follow the previous termination date'; end if;
  if p_action='rehire' and latest_end is null then raise exception 'Legacy termination date must be reconciled before rehire'; end if;
  -- Serialize with work-log writes so a new open shift cannot race this check.
  lock table public.employee_work_logs in share row exclusive mode;
  if exists(select 1 from public.employee_work_logs where employee_id=e.id
    and coalesce(is_deleted,false)=false and time_in is not null and time_out is null) then
    raise exception 'Close the employee open shifts before changing employment';
  end if;
  if p_action='terminate' and exists(select 1 from public.employee_work_logs where employee_id=e.id
    and coalesce(is_deleted,false)=false and coalesce(approved,false)=false) then
    raise exception 'Review and approve outstanding work logs before termination';
  end if;
  blockers := public.employee_lifecycle_blockers();
  if cardinality(blockers)>0 then raise exception 'Employment change blocked: %', array_to_string(blockers,'; '); end if;
  -- The readiness gate is intentionally closed until integration work is verified.
  perform set_config('farmplast.employee_lifecycle','on',true);
  if p_action='terminate' then
    update public.employee_employment_periods set termination_date=p_date,
      termination_reason=nullif(trim(p_reason),''),notes=nullif(trim(p_notes),'')
      where employee_id=e.id and termination_date is null and not legacy_inactive;
    if not found then raise exception 'Employment period requires reconciliation'; end if;
    update public.employees set active=false,zkt_enabled=false,termination_date=p_date,
      termination_reason=nullif(trim(p_reason),''),termination_notes=nullif(trim(p_notes),'') where id=e.id;
  else
    insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,notes)
    values(e.id,e.employee_number,p_date,e.position,e.company_id,e.plant_location,e.hourly_rate,nullif(trim(p_notes),''));
    -- Original number stays reserved globally; no unsafe number reassignment.
    update public.employees set active=true,hire_date=p_date,termination_date=null,
      termination_reason=null,termination_notes=null,zkt_enabled=false,zkt_sync_status='pending' where id=e.id;
  end if;
  perform set_config('farmplast.employee_lifecycle','off',true);
  return e.id;
end $$;

create function public.protect_employee_history() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'Employee history cannot be deleted; use Terminate Employee'; end if;
  if new.id is distinct from old.id or new.employee_number is distinct from old.employee_number then
    raise exception 'Employee identity and reserved number cannot be reassigned while ZKT reuse is blocked';
  end if;
  if (new.active is distinct from old.active or new.hire_date is distinct from old.hire_date
    or new.termination_date is distinct from old.termination_date
    or new.termination_reason is distinct from old.termination_reason
    or new.termination_notes is distinct from old.termination_notes)
    and current_setting('farmplast.employee_lifecycle',true) is distinct from 'on' then
    raise exception 'Use the verified employment lifecycle action to change employment dates or status';
  end if;
  return new;
end $$;
create trigger protect_employee_history before update or delete on public.employees
for each row execute function public.protect_employee_history();

create function public.record_employee_first_period() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,legacy_inactive)
  values(new.id,new.employee_number,new.hire_date,new.position,new.company_id,new.plant_location,new.hourly_rate,new.active is not true);
  return new;
end $$;
create trigger record_employee_first_period after insert on public.employees
for each row execute function public.record_employee_first_period();

revoke all on function public.employee_lifecycle_blockers() from public;
revoke all on function public.change_employee_employment(uuid,text,date,text,text) from public;
grant execute on function public.employee_lifecycle_blockers() to authenticated;
grant execute on function public.change_employee_employment(uuid,text,date,text,text) to authenticated;
commit;
