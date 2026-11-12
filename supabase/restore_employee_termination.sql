-- Restore the owner-requested termination workflow. No employee data backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(736261,2);

create or replace function public.employee_termination_preview(p_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype; first_day date; last_day date; open_count integer; pending_count integer; running_count integer; periods integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if not public.employee_feature_enabled('employee_terminate') then raise exception 'Employee termination is temporarily unavailable' using errcode='42501'; end if;
  select * into strict e from public.employees where id=p_employee_id;
  select count(*)::int,min(hire_date) into periods,first_day from public.employee_employment_periods
    where employee_id=e.id and termination_date is null and not legacy_inactive;
  select max(work_date::date),count(*) filter(where time_in is not null and time_out is null)::int into last_day,open_count
    from public.employee_work_logs where employee_id=e.id and not coalesce(is_deleted,false) and (time_in is not null or time_out is not null);
  select count(*)::int into pending_count from public.payroll_checks where employee_id=e.id and voided_at is null and (status is null or status not in ('printed','paid','voided'));
  select count(*)::int into running_count from public.employee_integration_operations where employee_id=e.id and target='SACS' and status='running';
  return jsonb_build_object('active',e.active is true,'hire_date',first_day,'last_work_date',last_day,'today',(now() at time zone 'America/New_York')::date,
    'open_shifts',open_count,'pending_checks',pending_count,'running_sacs',running_count,'open_periods',periods);
end $$;
revoke all on function public.employee_termination_preview(uuid) from public,anon,service_role;
grant execute on function public.employee_termination_preview(uuid) to authenticated;

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
  if (preview->>'open_shifts')::int>0 then raise exception 'Close the employee open shifts before termination'; end if;
  if (preview->>'last_work_date')::date>p_date then raise exception 'Work history exists after this date. Choose the actual last working day' using errcode='23514'; end if;
  if (preview->>'pending_checks')::int>0 then raise exception 'Finalize or void outstanding payroll checks before termination'; end if;
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

-- Keep the original RPC entry point working, while checking each independent flag.
create or replace function public.change_employee_employment(p_employee_id uuid,p_action text,p_date date,p_reason text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_action='terminate' then return public.terminate_employee(p_employee_id,p_date,p_reason,p_notes); end if;
  if p_action is distinct from 'rehire' then raise exception 'Invalid employment action'; end if;
  perform public.employee_require_feature('employee_rehire');
  return public.change_employee_employment_pre_release(p_employee_id,p_action,p_date,p_reason,p_notes);
end $$;

-- Enabling termination must not disable the existing legacy Attendance/Presence
-- input for every still-active worker. Keep all UUID/reused-number ambiguity
-- checks; only the unrelated terminate switch leaves this compatibility gate.
create or replace function public.zkt_compat_event_owner(p_raw_id uuid) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
 with raw_event as(select * from public.zkt_attendance_logs where id=p_raw_id),
 owned as(select o.employee_id from raw_event l join public.zkt_identity_events r on r.legacy_raw_id=l.id join public.zkt_event_ownership o on o.event_id=r.id),
 numbered as(
 select e.id from raw_event l join public.employees e on e.employee_number=l.employee_number
 where not exists(select 1 from public.employees other where other.employee_number=l.employee_number and other.id<>e.id)
 and not exists(select 1 from public.employee_employment_periods p where p.employee_number=l.employee_number and p.employee_id<>e.id)
 and not exists(select 1 from public.zkt_identifier_history h where h.terminal_user_id=l.employee_number::text and h.employee_id<>e.id
   and l.punch_time>=h.valid_from and(h.valid_to is null or l.punch_time<h.valid_to))
 and not exists(select 1 from public.employee_feature_flags where flag in('employee_rehire','employee_number_reuse') and enabled)
 ),resolved as(select employee_id id from owned union all select id from numbered where not exists(select 1 from owned))
 select case when count(distinct r.id)=1 then min(r.id::text)::uuid end from resolved r join public.employees e on e.id=r.id
 where e.active is true or public.employee_archive_admin()
$$;

-- Feature restoration only: no worker is terminated by applying this script.
update public.employee_release_config set actions_enabled=true where singleton;
update public.employee_feature_flags set enabled=true where flag='employee_terminate';
notify pgrst,'reload schema';
commit;
