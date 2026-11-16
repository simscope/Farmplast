-- Prior exact Farmplast restore functions. Use only for targeted rollback.
begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.preview_restore_former_employee(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  e public.employees%rowtype;
  old_free boolean;
  assigned integer;
  latest_work date;
  latest_end date;
  start_after date;
begin
  if not public.employee_archive_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into strict e from public.employees where id = p_employee_id;
  if e.active is true then raise exception 'Employee is already active'; end if;
  old_free := public.employee_plant_number_range(e.plant_location) @> e.employee_number
    and not exists (select 1 from public.employee_hr_occupied_numbers() used where used.number = e.employee_number);
  assigned := case when old_free then e.employee_number else public.next_available_employee_number(e.plant_location) end;
  select max(work_date) into latest_work from public.employee_work_logs
    where employee_id=e.id and not coalesce(is_deleted,false);
  select max(termination_date) into latest_end from public.employee_employment_periods
    where employee_id=e.id;
  start_after := greatest(latest_work, latest_end);
  return jsonb_build_object(
    'employee_id',e.id,'previous_number',e.employee_number,'proposed_number',assigned,
    'previous_number_available',old_free,'plant_location',e.plant_location,
    'last_work_date',latest_work,'last_termination_date',latest_end,
    'earliest_date',case when start_after is null then null else start_after + 1 end,
    'today',(now() at time zone 'America/New_York')::date,
    'photo_url',e.photo_url
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.restore_former_employee(p_employee_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  e public.employees%rowtype;
  assigned integer;
  old_free boolean;
  latest_work date;
  latest_end date;
  today date := (now() at time zone 'America/New_York')::date;
  pid bigint;
begin
  if not public.employee_archive_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  perform public.employee_require_feature('employee_rehire');
  if not exists(select 1 from public.employee_release_config where singleton and actions_enabled) then
    raise exception 'Employee lifecycle release gate is OFF' using errcode='42501';
  end if;
  if p_date is null or p_date>today then
    raise exception 'Choose a valid rehire date, not in the future' using errcode='23514';
  end if;

  -- Same lock ordering as plant transfers: attendance before HR allocation.
  perform pg_advisory_xact_lock(736261,1);
  perform pg_advisory_xact_lock(736261,2);
  select * into strict e from public.employees where id=p_employee_id for update;
  if e.active is true then
    raise exception 'Employee already restored; refresh the page' using errcode='23505';
  end if;
  if exists(select 1 from public.employee_work_logs
      where employee_id=e.id and not coalesce(is_deleted,false)
        and time_in is not null and time_out is null) then
    raise exception 'Close existing open shifts before restoring this employee' using errcode='23514';
  end if;
  select max(work_date) into latest_work from public.employee_work_logs
    where employee_id=e.id and not coalesce(is_deleted,false);
  select max(termination_date) into latest_end from public.employee_employment_periods
    where employee_id=e.id;
  if p_date<=greatest(latest_work,latest_end) then
    raise exception 'Rehire date must follow the last recorded work or termination date' using errcode='23514';
  end if;
  if exists(select 1 from public.employee_employment_periods
      where employee_id=e.id and termination_date is null and not legacy_inactive) then
    raise exception 'Employment history must be reconciled before rehire' using errcode='23514';
  end if;
  if exists(select 1 from public.employee_integration_operations
      where employee_id=e.id and target='SACS' and status='running') then
    raise exception 'SACS synchronization in progress; try after acknowledgement' using errcode='40001';
  end if;

  old_free := public.employee_plant_number_range(e.plant_location) @> e.employee_number
    and not exists(select 1 from public.employee_hr_occupied_numbers() used where used.number=e.employee_number);
  assigned := case when old_free then e.employee_number else public.next_available_employee_number(e.plant_location) end;
  perform public.validate_employee_plant_number(e.plant_location,assigned);

  -- The photo, UUID, personal information and all historic records stay intact.
  -- ZKT is deliberately NOT enabled until physical identity is checked.
  perform set_config('farmplast.employee_lifecycle','on',true);
  perform set_config('farmplast.restore_former_employee',e.id::text,true);
  update public.employees set active=true,employee_number=assigned,zkt_user_id=assigned,
    hire_date=p_date,termination_date=null,termination_reason=null,termination_notes=null,
    zkt_enabled=false,zkt_synced_at=null,zkt_sync_status='disabled',
    zkt_sync_error='Re-register and verify this terminal identity before enabling ZKT.'
    where id=e.id;
  perform set_config('farmplast.restore_former_employee','',true);
  perform set_config('farmplast.employee_lifecycle','off',true);

  insert into public.employee_employment_periods
    (employee_id,employee_number,hire_date,position,company_id,plant_location,
      hourly_rate,terminal_user_id,work_started_at)
  values (e.id,assigned,p_date,e.position,e.company_id,e.plant_location,
      e.hourly_rate,assigned,clock_timestamp())
  returning id into pid;
  insert into public.employee_number_reservations(period_id,employee_id,employee_number)
  values(pid,e.id,assigned);

  -- SACS is synchronized using its existing integration queue; no ZKT commands
  -- are generated by this RPC. A running prior deactivation is rejected above.
  update public.employee_integration_operations set status='superseded'
    where employee_id=e.id and target='SACS' and action='disable'
      and status in ('pending','failed');
  insert into public.employee_integration_operations
    (period_id,employee_id,action,target,payload)
  values(pid,e.id,'activate','SACS',jsonb_build_object(
    'source_employee_id',e.id,'employee_number',assigned::text,
    'full_name',trim(concat_ws(' ',e.first_name,e.last_name)),
    'phone',e.phone,'email',e.email,'position',e.position,'is_active',true));
  return jsonb_build_object('employee_id',e.id,'employee_number',assigned,
    'original_number',e.employee_number,'original_number_restored',assigned=e.employee_number,
    'plant_location',e.plant_location);
end $function$
;
commit;
