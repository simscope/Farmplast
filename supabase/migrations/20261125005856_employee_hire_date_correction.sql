-- Correct an active employee's confirmed hire date without changing the
-- technical ZKT assignment floor, transfers, previous engagements or payroll.
create or replace function public.protect_employee_history() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare transferring boolean; lifecycle boolean; hire_edit boolean;
begin
  if tg_op = 'DELETE' then raise exception 'Employee history cannot be deleted'; end if;
  if new.id is distinct from old.id then raise exception 'Permanent employee identity cannot change'; end if;
  transferring := coalesce(current_setting('farmplast.employee_plant_transfer', true) = old.id::text, false)
    and current_user = (select pg_get_userbyid(proowner) from pg_proc
      where oid = 'public.save_employee_plant_transfer(uuid,text,integer,jsonb)'::regprocedure);
  lifecycle := coalesce(current_setting('farmplast.employee_lifecycle', true) = 'on', false);
  hire_edit := false;
  if new.hire_date is distinct from old.hire_date and auth.role() = 'authenticated'
    and old.active is true and new.active is true then
    hire_edit := public.employee_archive_admin();
  end if;
  if old.active is true and new.active is true and new.plant_location is distinct from old.plant_location
    and not transferring then raise exception 'Use the plant transfer form to change the plant'; end if;
  if (new.employee_number,new.zkt_user_id,new.active,new.termination_date,new.termination_reason,new.termination_notes)
    is distinct from (old.employee_number,old.zkt_user_id,old.active,old.termination_date,old.termination_reason,old.termination_notes)
    and not lifecycle and not transferring then
    raise exception 'Use employment lifecycle to change identity or employment';
  end if;
  if new.hire_date is distinct from old.hire_date and not lifecycle and not transferring and not hire_edit then
    raise exception 'Admin access required to correct the hire date' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.sync_employee_confirmed_hire_date() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  root_period public.employee_employment_periods%rowtype;
  chain bigint[] := '{}';
  previous_end date;
  earliest_work date;
begin
  -- Existing lifecycle functions create and close their own periods atomically.
  if current_setting('farmplast.employee_lifecycle',true) = 'on' then return new; end if;
  if auth.role() is distinct from 'authenticated' or not public.employee_archive_admin()
    or old.active is not true or new.active is not true then
    raise exception 'Admin access required to correct an active employee hire date' using errcode='42501';
  end if;
  if new.hire_date is null then raise exception 'Hire date is required' using errcode='23514'; end if;
  select * into strict root_period from public.employee_employment_periods
    where employee_id=new.id and termination_date is null and not legacy_inactive for update;
  loop
    if root_period.id = any(chain) then raise exception 'Invalid employment assignment chain'; end if;
    chain := array_append(chain,root_period.id);
    exit when root_period.transferred_from_period_id is null;
    select * into strict root_period from public.employee_employment_periods
      where id=root_period.transferred_from_period_id and employee_id=new.id and not legacy_inactive for update;
  end loop;
  select max(p.termination_date) into previous_end from public.employee_employment_periods p
    where p.employee_id=new.id and p.id < root_period.id and not (p.id=any(chain));
  if previous_end is not null and new.hire_date <= previous_end then
    raise exception 'Hire date overlaps a previous employment period' using errcode='23514';
  end if;
  if root_period.termination_date is not null and new.hire_date > root_period.termination_date then
    raise exception 'Hire date cannot follow the first plant assignment end' using errcode='23514';
  end if;
  -- Moving the human date earlier must never move the verified device cutoff.
  if root_period.work_started_at is not null and new.hire_date > (root_period.work_started_at at time zone 'America/New_York')::date then
    raise exception 'Hire date cannot follow the verified assignment start' using errcode='23514';
  end if;
  select min(w.work_date) into earliest_work from public.employee_work_logs w
    where w.employee_id=new.id and not coalesce(w.is_deleted,false)
      and (previous_end is null or w.work_date > previous_end)
      and (root_period.termination_date is null or w.work_date <= root_period.termination_date)
      and (w.time_in is not null or w.time_out is not null);
  if earliest_work is not null and new.hire_date > earliest_work then
    raise exception 'Hire date cannot exclude recorded work' using errcode='23514';
  end if;
  update public.employee_employment_periods set hire_date=new.hire_date where id=root_period.id;
  return new;
end $$;
revoke all on function public.sync_employee_confirmed_hire_date() from public,anon,authenticated,service_role;
drop trigger if exists sync_employee_confirmed_hire_date on public.employees;
create trigger sync_employee_confirmed_hire_date after update of hire_date on public.employees
  for each row when (old.hire_date is distinct from new.hire_date)
  execute function public.sync_employee_confirmed_hire_date();
