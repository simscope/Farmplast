-- Phase 5 archive-only release. Apply after former_employees.sql; all flags OFF.
-- Does not replace legacy ZKT/SACS/Payroll processors or normal employee INSERT.
begin;
create table public.employee_feature_flags (
  flag text primary key check (flag in ('former_employees_archive_readonly','employee_terminate','employee_rehire','employee_number_reuse')),
  enabled boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into public.employee_feature_flags(flag) values
 ('former_employees_archive_readonly'),('employee_terminate'),('employee_rehire'),('employee_number_reuse');
alter table public.employee_feature_flags enable row level security;
revoke all on public.employee_feature_flags from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
   revoke all on public.employee_feature_flags from service_role;
 end if;
end $$;

create function public.employee_feature_enabled(p_flag text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select enabled from public.employee_feature_flags where flag=p_flag),false)
$$;
revoke all on function public.employee_feature_enabled(text) from public,anon;
grant execute on function public.employee_feature_enabled(text) to authenticated;

create function public.employee_feature_flags_status() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_object_agg(flag,enabled and public.employee_archive_admin()) from public.employee_feature_flags
$$;
revoke all on function public.employee_feature_flags_status() from public,anon;
grant execute on function public.employee_feature_flags_status() to authenticated;

create function public.employee_require_feature(p_flag text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.employee_feature_flags where flag=p_flag and enabled for share;
 if not found then
   raise exception 'Employee feature flag % is OFF',p_flag using errcode='42501';
 end if;
end $$;
revoke all on function public.employee_require_feature(text) from public,anon,authenticated;

create function public.guard_employee_feature_enable() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.enabled and new.flag in ('employee_terminate','employee_rehire','employee_number_reuse') then
   if to_regclass('public.employee_release_config') is null or to_regclass('public.employee_number_config') is null then
     raise exception 'Advanced employee features require separately verified lifecycle migrations';
   end if;
   if new.flag='employee_number_reuse' and not public.employee_reuse_release_verified() then
     raise exception 'Number reuse requires all eight current release confirmations';
   end if;
 end if;
 new.changed_at=now();
 return new;
end $$;
create trigger employee_feature_enable_gate before insert or update on public.employee_feature_flags
for each row execute function public.guard_employee_feature_enable();

-- Archive has a dedicated DB-gated API. Existing admin roster SELECT rights are
-- retained for old Payroll/SSO/roster contracts; switching OFF hides the new API.
create function public.list_former_employees(p_offset integer default 0,p_limit integer default 500)
returns setof public.employees language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not public.employee_feature_enabled('former_employees_archive_readonly') then
   raise exception 'Former Employees archive is OFF' using errcode='42501';
 end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>500 then
   raise exception 'Invalid archive page' using errcode='22023';
 end if;
 return query select e.* from public.employees e where e.active is not true order by e.id offset p_offset limit p_limit;
end $$;
revoke all on function public.list_former_employees(integer,integer) from public,anon;
grant execute on function public.list_former_employees(integer,integer) to authenticated;

alter policy employee_period_admin_read on public.employee_employment_periods
using (public.employee_archive_admin() and public.employee_feature_enabled('former_employees_archive_readonly'));

-- The wrapper rejects requests before legacy readiness/state checks or writes.
alter function public.change_employee_employment(uuid,text,date,text,text) rename to change_employee_employment_pre_flags;
revoke all on function public.change_employee_employment_pre_flags(uuid,text,date,text,text) from public,anon,authenticated;
create function public.change_employee_employment(p_employee_id uuid,p_action text,p_date date,p_reason text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_action not in ('terminate','rehire') or p_action is null then raise exception 'Invalid employment action'; end if;
 perform public.employee_require_feature(case p_action when 'terminate' then 'employee_terminate' else 'employee_rehire' end);
 return public.change_employee_employment_pre_flags(p_employee_id,p_action,p_date,p_reason,p_notes);
end $$;
revoke all on function public.change_employee_employment(uuid,text,date,text,text) from public,anon;
grant execute on function public.change_employee_employment(uuid,text,date,text,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
   revoke all on function public.change_employee_employment_pre_flags(uuid,text,date,text,text) from service_role;
   revoke all on function public.employee_require_feature(text) from service_role;
   revoke all on function public.list_former_employees(integer,integer) from service_role;
 end if;
end $$;

-- Additional table guard: neither a direct status write nor a future lifecycle
-- function replacement may bypass independent flags. Normal new profiles work.
create function public.guard_employee_feature_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if old.active is true and new.active is not true then perform public.employee_require_feature('employee_terminate'); end if;
   if old.active is not true and new.active is true then perform public.employee_require_feature('employee_rehire'); end if;
   if (new.termination_date,new.termination_reason,new.termination_notes) is distinct from (old.termination_date,old.termination_reason,old.termination_notes) then
     perform public.employee_require_feature('employee_terminate');
   end if;
   if new.employee_number is distinct from old.employee_number then perform public.employee_require_feature('employee_number_reuse'); end if;
 end if;
 if exists(select 1 from public.employees e where e.id is distinct from new.id and e.employee_number=new.employee_number and e.active is not true) then
   perform public.employee_require_feature('employee_number_reuse');
 end if;
 return new;
end $$;
create trigger employee_feature_mutation_gate before insert or update on public.employees
for each row execute function public.guard_employee_feature_mutation();
commit;
