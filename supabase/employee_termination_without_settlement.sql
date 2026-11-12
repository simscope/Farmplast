-- Archive independently of unfinished work logs and payroll checks.
-- Preserve all existing work/payroll records without recalculation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(736261,2);
create or replace function public.terminate_employee(p_employee_id uuid,p_date date,p_reason text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype; p public.employee_employment_periods%rowtype; preview jsonb;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform public.employee_require_feature('employee_terminate');
  perform pg_advisory_xact_lock(736261,2);
  perform 1 from public.employee_release_config where singleton and actions_enabled for share;
  if not found then raise exception 'Employee termination is temporarily unavailable'; end if;
  if p_date is null or p_date>(now() at time zone 'America/New_York')::date then raise exception 'Enter the last working day, not a future date' using errcode='23514'; end if;
  -- Work-log/payroll guards take a shared lock on this same row. Waiting writers
  -- recheck the now-closed employment period after this transaction commits.
  select * into strict e from public.employees where id=p_employee_id for update;
  if e.active is not true then raise exception 'Employee is already inactive. Refresh the employee list' using errcode='23514'; end if;
  preview:=public.employee_termination_preview(e.id);
  if (preview->>'open_periods')::int<>1 then raise exception 'Employment period requires reconciliation'; end if;
  select * into strict p from public.employee_employment_periods where employee_id=e.id and termination_date is null and not legacy_inactive;
  if p.hire_date>p_date then raise exception 'Last working day cannot precede the hire date' using errcode='23514'; end if;
  if (preview->>'last_work_date')::date>p_date then raise exception 'Work history exists after this date. Choose the actual last working day' using errcode='23514'; end if;
  if (preview->>'running_sacs')::int>0 then raise exception 'SACS synchronization is still awaiting acknowledgement. Resolve it before termination'; end if;
  -- Legacy approved=false is not a business approval workflow in Farmplast:
  -- the UI has no approval action. Keep those closed rows exactly as stored.
  update public.employee_employment_periods set termination_date=p_date,termination_reason=nullif(btrim(p_reason),''),notes=nullif(btrim(p_notes),'') where id=p.id;
  perform set_config('farmplast.employee_lifecycle','on',true);
  update public.employees set active=false,zkt_enabled=false,termination_date=p_date,termination_reason=nullif(btrim(p_reason),''),termination_notes=nullif(btrim(p_notes),''),
    zkt_sync_status='pending',zkt_synced_at=null,zkt_sync_error='Archived in Farmplast. Terminal deactivation has not been confirmed.' where id=e.id;
  perform set_config('farmplast.employee_lifecycle','off',true);
  update public.employee_integration_operations set status='superseded' where employee_id=e.id and action='activate' and status in ('pending','failed');
  perform public.queue_employee_integrations(p.id,'disable');
  -- Preserve the UUID contract for employees whose last name is empty too.
  update public.employee_integration_operations set payload=payload||jsonb_build_object('full_name',btrim(concat_ws(' ',e.first_name,e.last_name)))
    where employee_id=e.id and period_id=p.id and target='SACS' and action='disable' and status='pending';
  return e.id;
end $$;
revoke all on function public.terminate_employee(uuid,date,text,text) from public,anon,service_role;
grant execute on function public.terminate_employee(uuid,date,text,text) to authenticated;


notify pgrst,'reload schema';
commit;
