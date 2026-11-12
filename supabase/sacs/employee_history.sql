-- SACS database migration (not Farmplast). Existing tenant policies are unchanged.
begin;
create function public.farmplast_employee_safety_history(p_source_employee_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare company uuid; employee uuid; group_name text; records jsonb; assignments jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  if p_offset<0 or p_offset>100000 then raise exception 'Invalid offset'; end if;
  select company_id into strict company from public.farmplast_sync_config where singleton and enabled;
  -- Durable source UUID only. Include archived profiles; never match by number.
  select id,trade_group into strict employee,group_name from public.employees
    where company_id=company and source_system='farmplast' and source_employee_id=p_source_employee_id;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into records from (
    select s.id,m.title,m.code,s.status,s.session_date,s.started_at,s.completed_at,s.score,s.passed
    from public.daily_sessions s join public.training_modules m on m.id=s.module_id
    where s.company_id=company and s.employee_id=employee
    order by s.started_at desc,s.id limit 100 offset p_offset
  ) r;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into assignments from (
    select a.id,a.module_family_key as title,a.assigned_at,a.completed_at,a.cancelled_at,a.completed_session_id,
      case when a.completed_at is not null then 'completed' when a.cancelled_at is not null then 'cancelled' else 'assigned' end status
    from public.company_training_one_time_assignments a where a.company_id=company and a.employee_id=employee
    order by a.assigned_at desc,a.id limit 100 offset p_offset
  ) r;
  return jsonb_build_object('source_employee_id',p_source_employee_id,'sacs_employee_id',employee,
    'records',records,'assignments',assignments,'offset',p_offset,
    'next_offset',case when jsonb_array_length(records)=100 or jsonb_array_length(assignments)=100 then p_offset+100 else null end,
    'group_assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',m.title,'assigned_at',a.created_at,'status','group assignment'))
      from public.company_training_group_assignments a join public.training_modules m on m.id=a.module_id
      where a.company_id=company and lower(trim(a.trade_group))=lower(trim(group_name))),'[]'::jsonb));
end $$;
revoke all on function public.farmplast_employee_safety_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.farmplast_employee_safety_history(uuid,integer) to service_role;
commit;
