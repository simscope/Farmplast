-- Apply after zkt_event_identity.sql. Reuse remains OFF pending release validation.
begin;
-- Keep actions OFF even between this migration and the Phase 3 release gates.
create table public.employee_release_config (
  singleton boolean primary key default true check(singleton),
  actions_enabled boolean not null default false
);
insert into public.employee_release_config default values;
alter table public.employee_release_config enable row level security;
revoke all on public.employee_release_config from public,anon,authenticated,service_role;
alter table public.zkt_bridge_commands drop constraint zkt_bridge_commands_command_check;
alter table public.zkt_bridge_commands add constraint zkt_bridge_commands_command_check check(command in
  ('test','sync_employees','verify_employees','pull_attendance','delete_employee_from_zkt','sync_one_employee','verify_one_employee','identity_disable_employee','identity_activate_employee'));
alter table public.employee_employment_periods add column terminal_user_id integer;
update public.employee_employment_periods p set terminal_user_id=coalesce(e.zkt_user_id,e.employee_number) from public.employees e where e.id=p.employee_id;
-- Never give another person an old terminal account with retained biometrics.
create table public.zkt_identity_principals (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  terminal_user_id integer not null unique check(terminal_user_id>0)
);
insert into public.zkt_identity_principals select id,coalesce(zkt_user_id,employee_number) from public.employees;
create trigger zkt_principals_immutable before update or delete on public.zkt_identity_principals
for each row execute function public.zkt_immutable_record();
create table public.employee_number_config (
  singleton boolean primary key default true check(singleton),
  minimum integer not null default 1 check(minimum>0),
  maximum integer check(maximum>=minimum),
  reuse_enabled boolean not null default false
);
insert into public.employee_number_config(singleton) values(true);
create table public.employee_number_reservations (
  period_id bigint primary key references public.employee_employment_periods,
  employee_id uuid not null references public.employees(id),
  employee_number integer not null,
  released_at timestamptz,
  reserved_at timestamptz not null default now()
);
create unique index employee_held_number on public.employee_number_reservations(employee_number) where released_at is null;
insert into public.employee_number_reservations(period_id,employee_id,employee_number)
select id,employee_id,employee_number from public.employee_employment_periods;
create table public.employee_integration_operations (
  id uuid primary key default gen_random_uuid(),
  period_id bigint not null references public.employee_employment_periods,
  employee_id uuid not null references public.employees(id),
  action text not null check(action in ('disable','activate')),
  target text not null check(target in ('NJ','PA','SACS')),
  device_key text references public.zkt_identity_devices,
  terminal_user_id text,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','running','failed','succeeded','superseded')),
  claim_token uuid, claimed_at timestamptz, attempts integer not null default 0,
  result jsonb,error text,finished_at timestamptz,
  unique(period_id,action,target,device_key)
);
create unique index employee_sacs_operation on public.employee_integration_operations(period_id,action) where target='SACS';

alter table public.employees drop constraint employees_employee_number_key;
create unique index employees_active_number_key on public.employees(employee_number) where active is true;

create function public.next_available_employee_number() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.employee_number_config%rowtype; candidate integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into strict c from public.employee_number_config where singleton;
  if c.maximum is null then raise exception 'Terminal employee number range must be verified and configured'; end if;
  -- Number of occupied values bounds the search; do not generate billions of rows.
  select min(n)::integer into candidate from generate_series(c.minimum::bigint,
    least(c.maximum::bigint,c.minimum::bigint+(select count(*) from public.employee_number_reservations))) n
  where not exists(select 1 from public.employee_number_reservations r where r.employee_number=n and (r.released_at is null or not c.reuse_enabled));
  if candidate is null then raise exception 'No safely available employee numbers in configured range'; end if;
  return candidate;
end $$;
create function public.allocate_employee_insert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.employee_number_config%rowtype; terminal_id integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict c from public.employee_number_config where singleton;
  if new.employee_number is null then
    if to_regclass('public.employee_feature_flags') is not null then perform public.employee_require_feature('employee_number_reuse'); end if;
    new.employee_number:=public.next_available_employee_number();
  end if;
  if c.maximum is null then raise exception 'Terminal employee number range must be verified and configured'; end if;
  if new.employee_number<c.minimum or (c.maximum is not null and new.employee_number>c.maximum) then raise exception 'Employee number outside configured range'; end if;
  if exists(select 1 from public.employee_number_reservations where employee_number=new.employee_number and (released_at is null or not c.reuse_enabled)) then
    raise exception 'Employee number remains reserved; refresh the suggested number' using errcode='23505'; end if;
  if not exists(select 1 from public.zkt_identity_devices where plant_location='NJ') or not exists(select 1 from public.zkt_identity_devices where plant_location='PA')
    or exists(select 1 from public.zkt_identity_devices where not verified or not inventory_verified) then
    raise exception 'Verified complete NJ/PA terminal inventories required before provisioning a new identity'; end if;
  select min(n)::integer into terminal_id from generate_series(1::bigint,least(coalesce(c.maximum,2147483647)::bigint,1+(select count(*) from public.zkt_identity_principals)+(select count(*) from public.zkt_identifier_history)+(select count(*) from public.zkt_reserved_terminal_identifiers))) n
    where not exists(select 1 from public.zkt_identity_principals where terminal_user_id=n)
      and not exists(select 1 from public.zkt_identifier_history where terminal_user_id::numeric=n)
      and not exists(select 1 from public.zkt_reserved_terminal_identifiers where terminal_user_id::numeric=n);
  if terminal_id is null then raise exception 'No never-used terminal user IDs available in verified range'; end if;
  new.zkt_user_id:=terminal_id;
  -- Provisioning is recorded and acknowledged separately from profile creation.
  new.zkt_enabled:=false;
  return new;
end $$;
create trigger allocate_employee_insert before insert on public.employees for each row execute function public.allocate_employee_insert();

create function public.queue_employee_integrations(p_period_id bigint,p_action text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.employee_employment_periods%rowtype; e public.employees%rowtype; d record; jid uuid; body jsonb;
begin
  select * into strict p from public.employee_employment_periods where id=p_period_id;
  select * into strict e from public.employees where id=p.employee_id;
  body:=jsonb_build_object('source_employee_id',e.id,'employee_number',p.employee_number::text,
    'full_name',trim(e.first_name||' '||e.last_name),'phone',e.phone,'email',e.email,'position',e.position,'is_active',p_action='activate');
  insert into public.employee_integration_operations(period_id,employee_id,action,target,payload)
    values(p.id,e.id,p_action,'SACS',body) on conflict do nothing;
  for d in select * from public.zkt_identity_devices where p_action='disable' or plant_location=e.plant_location loop
    insert into public.employee_integration_operations(period_id,employee_id,action,target,device_key,terminal_user_id,payload)
    values(p.id,e.id,p_action,d.plant_location,d.device_key,coalesce(p.terminal_user_id,p.employee_number)::text,jsonb_build_object('employee_id',e.id)) on conflict do nothing returning id into jid;
    if jid is null then continue; end if;
    insert into public.zkt_bridge_commands(command,payload,status)
      values('identity_'||p_action||'_employee',jsonb_build_object('operation_id',jid,'employee_id',e.id,'device_key',d.device_key,'plant_location',d.plant_location),
        case when d.plant_location='PA' then 'pending_pa' else 'pending' end);
  end loop;
end $$;

create or replace function public.record_employee_first_period() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid bigint;
begin
  insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,legacy_inactive,terminal_user_id)
  values(new.id,new.employee_number,new.hire_date,new.position,new.company_id,new.plant_location,new.hourly_rate,new.active is not true,new.zkt_user_id) returning id into pid;
  insert into public.employee_number_reservations values(pid,new.id,new.employee_number,null,now());
  insert into public.zkt_identity_principals values(new.id,new.zkt_user_id);
  if new.active is true then perform public.queue_employee_integrations(pid,'activate'); end if;
  return new;
end $$;

create or replace function public.change_employee_employment(p_employee_id uuid,p_action text,p_date date,p_reason text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype; pid bigint; previous_end date; assigned integer;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  perform 1 from public.employee_release_config where singleton and actions_enabled for share;
  if not found then raise exception 'Terminate/Rehire release gate is OFF'; end if;
  if p_action is null or p_action not in ('terminate','rehire') or p_date is null or p_date>(now() at time zone 'America/New_York')::date then raise exception 'Invalid employment action/date'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict e from public.employees where id=p_employee_id for update;
  if (p_action='terminate' and e.active is not true) or (p_action='rehire' and e.active is true) then raise exception 'Employee status changed; refresh'; end if;
  -- Work-log/payroll guards share-lock this employee row. The lifecycle row
  -- lock serializes their checks without a table-lock/row-lock inversion.
  if exists(select 1 from public.employee_work_logs where employee_id=e.id and not coalesce(is_deleted,false) and time_in is not null and time_out is null) then raise exception 'Close open shifts before changing employment'; end if;
  if p_action='terminate' then
    if e.hire_date>p_date then raise exception 'Termination precedes hire date'; end if;
    if exists(select 1 from public.employee_work_logs where employee_id=e.id and not coalesce(is_deleted,false) and (not coalesce(approved,false) or work_date>p_date)) then raise exception 'Review outstanding or post-termination work logs'; end if;
    if exists(select 1 from public.payroll_checks where employee_id=e.id and status not in ('printed','paid','voided') and voided_at is null) then raise exception 'Finalize outstanding payroll checks before termination'; end if;
    update public.employee_employment_periods set termination_date=p_date,termination_reason=nullif(trim(p_reason),''),notes=nullif(trim(p_notes),'')
      where employee_id=e.id and termination_date is null and not legacy_inactive returning id into pid;
    if pid is null then raise exception 'Employment period requires reconciliation'; end if;
    perform set_config('farmplast.employee_lifecycle','on',true);
    update public.employees set active=false,zkt_enabled=false,termination_date=p_date,termination_reason=nullif(trim(p_reason),''),termination_notes=nullif(trim(p_notes),'') where id=e.id;
    update public.employee_integration_operations set status='superseded' where employee_id=e.id and action='activate' and status in ('pending','failed');
    perform public.queue_employee_integrations(pid,'disable');
  else
    select max(termination_date) into previous_end from public.employee_employment_periods where employee_id=e.id;
    if previous_end is null then raise exception 'Reconcile the legacy termination date before rehire'; end if;
    if previous_end>=p_date then raise exception 'Rehire must follow prior termination'; end if;
    if exists(select 1 from public.employee_integration_operations where employee_id=e.id and target='SACS' and status='running') then raise exception 'SACS synchronization in progress; retry after acknowledgement'; end if;
    update public.employee_integration_operations set status='superseded' where employee_id=e.id and target='SACS' and status in ('pending','failed');
    assigned:=public.next_available_employee_number();
    perform set_config('farmplast.employee_lifecycle','on',true);
    update public.employees set active=true,employee_number=assigned,hire_date=p_date,termination_date=null,termination_reason=null,termination_notes=null,zkt_enabled=false,zkt_sync_status='pending' where id=e.id;
    insert into public.employee_employment_periods(employee_id,employee_number,hire_date,position,company_id,plant_location,hourly_rate,notes,terminal_user_id)
      values(e.id,assigned,p_date,e.position,e.company_id,e.plant_location,e.hourly_rate,nullif(trim(p_notes),''),coalesce(e.zkt_user_id,e.employee_number)) returning id into pid;
    insert into public.employee_number_reservations values(pid,e.id,assigned,null,now());
    perform public.queue_employee_integrations(pid,'activate');
  end if;
  perform set_config('farmplast.employee_lifecycle','off',true);
  return e.id;
end $$;

create function public.guard_employee_work_log_employment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype;
begin
  select * into strict e from public.employees where id=new.employee_id for share;
  if not coalesce(new.is_deleted,false) then
    if e.active is not true and new.time_in is not null and new.time_out is null then
      raise exception 'Cannot open a shift for a former employee'; end if;
    if not exists(select 1 from public.employee_employment_periods p where p.employee_id=new.employee_id
      and (p.hire_date is null or new.work_date>=p.hire_date)
      and (p.termination_date is null or new.work_date<=p.termination_date)
      and (not p.legacy_inactive or p.termination_date is not null))
      and not (tg_op='UPDATE' and new.employee_id=old.employee_id and new.work_date=old.work_date and new.time_out is not null) then
      raise exception 'Work date requires a confirmed employment period'; end if;
  end if;
  return new;
end $$;
create trigger guard_employee_work_log_employment before insert or update on public.employee_work_logs
for each row execute function public.guard_employee_work_log_employment();

create function public.guard_employee_payroll_employment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype;
begin
  select * into strict e from public.employees where id=new.employee_id for share;
  if e.active is not true and new.status='draft' and new.voided_at is null then
    raise exception 'Finalize payroll before terminating employment'; end if;
  return new;
end $$;
create trigger guard_employee_payroll_employment before insert or update on public.payroll_checks
for each row execute function public.guard_employee_payroll_employment();

create or replace function public.protect_employee_history() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'Employee history cannot be deleted'; end if;
  if new.id is distinct from old.id then raise exception 'Permanent employee identity cannot change'; end if;
  if (new.employee_number,new.zkt_user_id,new.active,new.hire_date,new.termination_date,new.termination_reason,new.termination_notes)
    is distinct from (old.employee_number,old.zkt_user_id,old.active,old.hire_date,old.termination_date,old.termination_reason,old.termination_notes)
    and current_setting('farmplast.employee_lifecycle',true) is distinct from 'on' then raise exception 'Use employment lifecycle to change identity or employment'; end if;
  return new;
end $$;

create function public.reconcile_legacy_termination(p_employee_id uuid,p_date date,p_evidence text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_date is null or p_date>(now() at time zone 'America/New_York')::date or nullif(trim(p_evidence),'') is null then raise exception 'Confirmed termination date and evidence required'; end if;
  perform 1 from public.employees where id=p_employee_id and active is not true for update;
  if not found then raise exception 'Former employee required'; end if;
  update public.employee_employment_periods set termination_date=p_date,notes=p_evidence where employee_id=p_employee_id and legacy_inactive and termination_date is null and (hire_date is null or hire_date<=p_date);
  if not found then raise exception 'No eligible legacy period'; end if;
  perform set_config('farmplast.employee_lifecycle','on',true);
  update public.employees set termination_date=p_date where id=p_employee_id;
  perform set_config('farmplast.employee_lifecycle','off',true);
end $$;

create function public.claim_employee_integration(p_operation_id uuid,p_device_key text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.employee_integration_operations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  -- If Phase 5 flags are installed, closed actions cannot start new deliveries.
  -- Finish remains available for an already claimed operation's truthful ACK.
  if to_regclass('public.employee_feature_flags') is not null then
    select * into strict j from public.employee_integration_operations where id=p_operation_id;
    perform public.employee_require_feature(case j.action when 'disable' then 'employee_terminate' else 'employee_rehire' end);
  end if;
  perform pg_advisory_xact_lock(736261,2);
  perform pg_advisory_xact_lock(736261,3);
  if exists(select 1 from public.employee_integration_operations op where op.id=p_operation_id and op.action='activate'
    and not exists(select 1 from public.employee_employment_periods p join public.employees e on e.id=p.employee_id
      where p.id=op.period_id and p.termination_date is null and not p.legacy_inactive and e.active is true and e.employee_number=p.employee_number)) then
    raise exception 'Stale activation cannot run after termination or rehire'; end if;
  if p_device_key is not null and exists(select 1 from public.employee_integration_operations where device_key=p_device_key and status='running') then
    raise exception 'Device already has an operation in progress'; end if;
  if exists(select 1 from public.employee_integration_operations op where op.id=p_operation_id and op.action='activate' and op.target<>'SACS'
    and exists(select 1 from public.employee_integration_operations prior where prior.employee_id=op.employee_id and prior.device_key=op.device_key
      and prior.period_id<>op.period_id and prior.action='disable' and prior.status<>'succeeded')) then
    raise exception 'Prior employment period requires device deactivation acknowledgement'; end if;
  update public.employee_integration_operations set status='running',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,error=null
    where id=p_operation_id and status in ('pending','failed') and device_key is not distinct from p_device_key returning * into j;
  if j.id is null then raise exception 'Operation unavailable or already claimed'; end if;
  return to_jsonb(j);
end $$;

create function public.finish_employee_integration(p_operation_id uuid,p_claim_token uuid,p_result jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.employee_integration_operations%rowtype; d public.zkt_identity_devices%rowtype; ok boolean; e public.employees%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  select * into strict j from public.employee_integration_operations where id=p_operation_id and status='running' and claim_token=p_claim_token for update;
  ok:=p_result->>'ok'='true';
  if j.target<>'SACS' then
    select * into strict d from public.zkt_identity_devices where device_key=j.device_key;
    ok:=coalesce(ok,false) and d.verified and p_result->>'serialNumber'=d.serial_number and p_result->>'userId'=j.terminal_user_id
      and p_result->>'readBackVerified'='true'
      and (case when j.action='disable' then p_result->>'enabled'='false' else p_result->>'enabled'='true' end);
  else
    ok:=coalesce(ok,false) and p_result->>'source_employee_id'=j.employee_id::text and p_result->>'is_active'=j.payload->>'is_active';
  end if;
  update public.employee_integration_operations set status=case when coalesce(ok,false) then 'succeeded' else 'failed' end,
    result=p_result,error=case when coalesce(ok,false) then null else 'No verified acknowledgement; number remains reserved' end,finished_at=now() where id=j.id;
  if not coalesce(ok,false) then return; end if;
  if j.target<>'SACS' and j.action='disable' then
    update public.zkt_identifier_history set valid_to=now() where device_key=j.device_key and employee_id=j.employee_id and period_id=j.period_id and valid_to is null;
  elsif j.target<>'SACS' and j.action='activate' then
    select * into strict e from public.employees where id=j.employee_id;
    insert into public.zkt_identifier_history(device_key,terminal_user_id,employee_id,period_id,valid_from,evidence,shift_type,hourly_rate,default_lunch_hours,processing_verified)
      values(j.device_key,j.terminal_user_id,j.employee_id,j.period_id,j.claimed_at,'SDK read-back acknowledgement '||j.id,coalesce(e.shift_type,'day'),coalesce(e.hourly_rate,0),coalesce(e.default_lunch_hours,1),true);
    if e.active is true and e.employee_number=(select employee_number from public.employee_employment_periods where id=j.period_id)
      and not exists(select 1 from public.employee_integration_operations where period_id=j.period_id and action='activate' and target<>'SACS' and status<>'succeeded') then
      update public.employees set zkt_enabled=true,zkt_sync_status='verified_sdk',zkt_synced_at=now() where id=e.id;
    end if;
  end if;
  -- Every configured terminal in BOTH plants must have acknowledged this period.
  if j.action='disable' and exists(select 1 from public.zkt_identity_devices where plant_location='NJ' and verified)
    and exists(select 1 from public.zkt_identity_devices where plant_location='PA' and verified)
    and not exists(select 1 from public.zkt_identity_devices device where not device.verified or not device.inventory_verified or not exists(select 1 from public.employee_integration_operations x
      where x.period_id=j.period_id and x.action='disable' and x.device_key=device.device_key and x.status='succeeded')) then
    update public.employee_number_reservations set released_at=now() where period_id=j.period_id and released_at is null;
  end if;
end $$;

create or replace function public.employee_lifecycle_blockers() returns text[]
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.employee_release_config where singleton and actions_enabled) then
    return array['Terminate/Rehire release gate is OFF'];
  end if;
  -- Once explicitly released, archiving never waits for hardware.
  return '{}'::text[];
end $$;

create function public.retry_employee_integrations(p_employee_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; j record;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if to_regclass('public.employee_feature_flags') is not null then
    perform public.employee_require_feature(case when (select active from public.employees where id=p_employee_id) is true then 'employee_rehire' else 'employee_terminate' end);
  end if;
  perform pg_advisory_xact_lock(736261,2);
  for p in select id from public.employee_employment_periods where employee_id=p_employee_id and termination_date is not null loop
    perform public.queue_employee_integrations(p.id,'disable');
  end loop;
  for j in select * from public.employee_integration_operations where employee_id=p_employee_id and target<>'SACS' and status='failed' loop
    if not exists(select 1 from public.zkt_bridge_commands where payload->>'operation_id'=j.id::text and status in ('pending','pending_pa','running')) then
      insert into public.zkt_bridge_commands(command,payload,status) values('identity_'||j.action||'_employee',
        jsonb_build_object('operation_id',j.id,'employee_id',j.employee_id,'device_key',j.device_key,'plant_location',j.target),case when j.target='PA' then 'pending_pa' else 'pending' end);
    end if;
  end loop;
end $$;

do $$ declare t text; f record;
begin
  foreach t in array array['employee_number_config','employee_number_reservations','employee_integration_operations','zkt_identity_principals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy archive_admin_read on public.%I for select to authenticated using(public.employee_archive_admin())',t);
  end loop;
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in
    ('next_available_employee_number','allocate_employee_insert','queue_employee_integrations','reconcile_legacy_termination','claim_employee_integration','finish_employee_integration','retry_employee_integrations') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname in ('next_available_employee_number','reconcile_legacy_termination','retry_employee_integrations') then execute format('grant execute on function %s to authenticated',f.signature); end if;
    if f.proname in ('claim_employee_integration','finish_employee_integration') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
grant select on public.employee_integration_operations,public.zkt_identity_devices to service_role;
commit;
