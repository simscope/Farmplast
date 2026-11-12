-- Apply after former_employees.sql. Additive storage; original raw rows stay unchanged.
begin;
create table public.zkt_identity_devices (
  device_key text primary key, plant_location text not null check(plant_location in ('NJ','PA')),
  serial_number text not null unique, verified boolean not null default false,
  inventory_verified boolean not null default false,
  timezone text not null default 'America/New_York' check(timezone='America/New_York')
);
-- Seed from complete terminal inventories before provisioning any new person.
-- Includes unknown/local accounts absent from the Farmplast roster.
create table public.zkt_reserved_terminal_identifiers (
  terminal_user_id text primary key check(terminal_user_id ~ '^[0-9]+$'),
  evidence text not null check(length(trim(evidence))>0)
);
create table public.zkt_identifier_history (
  id bigint generated always as identity primary key,
  device_key text not null references public.zkt_identity_devices,
  terminal_user_id text not null check(terminal_user_id ~ '^[0-9]+$'),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id bigint not null references public.employee_employment_periods(id),
  valid_from timestamptz not null, valid_to timestamptz,
  evidence text not null check(length(trim(evidence))>0),
  shift_type text not null default 'day' check(shift_type in ('day','night')),
  hourly_rate numeric not null default 0,
  default_lunch_hours numeric not null default 1,
  processing_verified boolean not null default false,
  check(valid_to is null or valid_to>valid_from)
);
create function public.protect_zkt_mapping() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
  lock table public.zkt_identifier_history in share row exclusive mode;
  if not exists(select 1 from public.employee_employment_periods p where p.id=new.period_id and p.employee_id=new.employee_id) then
    raise exception 'Mapping period does not belong to employee'; end if;
  if tg_op='UPDATE' and (new.device_key,new.terminal_user_id,new.employee_id,new.period_id,new.valid_from)
    is distinct from (old.device_key,old.terminal_user_id,old.employee_id,old.period_id,old.valid_from) then
    raise exception 'Historical terminal identity cannot be reassigned'; end if;
  if tg_op='UPDATE' and new.valid_to is not null and exists(select 1 from public.zkt_event_ownership o
    join public.zkt_identity_events e on e.id=o.event_id where o.mapping_id=old.id and e.event_at>=new.valid_to) then
    raise exception 'Mapping cannot exclude permanently owned events'; end if;
  if exists(select 1 from public.zkt_identifier_history h where h.id<>coalesce(new.id,0)
    and h.device_key=new.device_key and h.terminal_user_id=new.terminal_user_id
    and tstzrange(h.valid_from,h.valid_to,'[)') && tstzrange(new.valid_from,new.valid_to,'[)')) then
    raise exception 'Overlapping terminal identifier ownership'; end if;
  return new;
end $$;
create trigger protect_zkt_mapping before insert or update on public.zkt_identifier_history
for each row execute function public.protect_zkt_mapping();

create table public.zkt_identity_events (
  id bigint generated always as identity primary key,
  device_key text references public.zkt_identity_devices,
  legacy_raw_id uuid unique references public.zkt_attendance_logs(id) on delete restrict,
  terminal_user_id text,
  local_timestamp timestamp,
  event_at timestamptz,
  raw jsonb not null,
  imported_at timestamptz not null default now(),
  unique(device_key,raw)
);
create table public.zkt_event_ownership (
  event_id bigint primary key references public.zkt_identity_events(id),
  employee_id uuid not null references public.employees(id) on delete restrict,
  mapping_id bigint not null references public.zkt_identifier_history,
  assigned_at timestamptz not null default now()
);
create table public.zkt_identity_review (
  event_id bigint primary key references public.zkt_identity_events,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.zkt_work_log_provenance (
  work_log_id uuid primary key references public.employee_work_logs(id) on delete restrict,
  employee_id uuid not null references public.employees(id),
  period_id bigint not null references public.employee_employment_periods,
  work_date date not null,
  unique(employee_id,work_date)
);
create function public.zkt_immutable_record() returns trigger language plpgsql as $$
begin raise exception 'ZKT raw events and permanent ownership are immutable'; end $$;
create trigger zkt_events_immutable before update or delete on public.zkt_identity_events
for each row execute function public.zkt_immutable_record();
create trigger zkt_owners_immutable before update or delete on public.zkt_event_ownership
for each row execute function public.zkt_immutable_record();
create trigger zkt_original_logs_immutable before update or delete on public.zkt_attendance_logs
for each row execute function public.zkt_immutable_record();

-- Evidence supplements raw logs; it never rewrites the original device-less row.
create table public.zkt_legacy_device_evidence (
  event_id bigint primary key references public.zkt_identity_events,
  device_key text not null references public.zkt_identity_devices,
  evidence text not null check(length(trim(evidence))>0),
  confirmed_by uuid not null, confirmed_at timestamptz not null default now()
);
create trigger zkt_legacy_evidence_immutable before update or delete on public.zkt_legacy_device_evidence
for each row execute function public.zkt_immutable_record();

-- Legacy events have no reliable device/assignment provenance. Never infer it
-- from employees.employee_number or from a previously generated work-log join.
insert into public.zkt_identity_events(legacy_raw_id,terminal_user_id,local_timestamp,event_at,raw)
select id,employee_number::text,punch_time_local,punch_time,raw from public.zkt_attendance_logs;
insert into public.zkt_identity_review(event_id,reason)
select id,'Legacy event: device and historical identifier ownership require evidence' from public.zkt_identity_events;

create function public.zkt_capture_legacy_insert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare eid bigint;
begin
  insert into public.zkt_identity_events(legacy_raw_id,terminal_user_id,local_timestamp,event_at,raw)
  values(new.id,new.employee_number::text,new.punch_time_local,new.punch_time,new.raw) returning id into eid;
  insert into public.zkt_identity_review values(eid,'Legacy bridge: device identity missing',now());
  return new;
end $$;
create trigger zkt_capture_legacy_insert after insert on public.zkt_attendance_logs
for each row execute function public.zkt_capture_legacy_insert();

create function public.zkt_assign_event(p_event_id bigint) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.zkt_identity_events%rowtype; h public.zkt_identifier_history%rowtype; n integer;
begin
  select * into strict e from public.zkt_identity_events where id=p_event_id;
  if exists(select 1 from public.zkt_event_ownership where event_id=e.id) then return true; end if;
  if e.device_key is null then
    select device_key into e.device_key from public.zkt_legacy_device_evidence where event_id=e.id;
  end if;
  if e.device_key is null or e.event_at is null then return false; end if;
  select count(*) into n from public.zkt_identifier_history where device_key=e.device_key
    and terminal_user_id=e.terminal_user_id and e.event_at>=valid_from and (valid_to is null or e.event_at<valid_to);
  if n<>1 then
    insert into public.zkt_identity_review(event_id,reason) values(e.id,'No unique verified historical identifier interval') on conflict do nothing;
    return false;
  end if;
  select * into strict h from public.zkt_identifier_history where device_key=e.device_key
    and terminal_user_id=e.terminal_user_id and e.event_at>=valid_from and (valid_to is null or e.event_at<valid_to);
  insert into public.zkt_event_ownership(event_id,employee_id,mapping_id) values(e.id,h.employee_id,h.id) on conflict do nothing;
  return true;
end $$;

create function public.ingest_zkt_identity_events(p_device_key text,p_serial_number text,p_events jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.zkt_identity_devices%rowtype; r jsonb; stamp timestamp; instant timestamptz;
  uid text; eid bigint; reason text; accepted integer:=0; review integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Bridge service required' using errcode='42501'; end if;
  select * into strict d from public.zkt_identity_devices where device_key=p_device_key and verified and serial_number=p_serial_number;
  if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>500 then raise exception 'Invalid event batch'; end if;
  for r in select value from jsonb_array_elements(p_events) loop
    reason:=null; stamp:=null; instant:=null; uid:=coalesce(r->>'deviceUserId',r->>'userId');
    begin
      if uid is null or uid !~ '^[0-9]+$' or r->>'timestamp' is null or r->>'timestamp' !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then
        raise exception 'Invalid SDK event'; end if;
      stamp:=(r->>'timestamp')::timestamp;
      instant:=stamp at time zone d.timezone;
      if (instant at time zone d.timezone)<>stamp then reason:='Nonexistent local time at DST transition'; end if;
      if ((instant-interval '1 hour') at time zone d.timezone)=stamp or ((instant+interval '1 hour') at time zone d.timezone)=stamp then
        reason:='Ambiguous local time at DST transition'; end if;
      if instant>now()+interval '5 minutes' then reason:='Terminal clock is in the future'; end if;
    exception when others then reason:='Invalid SDK identifier or timestamp'; end;
    if reason is not null then instant:=null; end if;
    insert into public.zkt_identity_events(device_key,terminal_user_id,local_timestamp,event_at,raw)
      values(d.device_key,uid,stamp,instant,r) on conflict(device_key,raw) do nothing returning id into eid;
    if eid is null then continue; end if;
    if reason is not null then
      insert into public.zkt_identity_review(event_id,reason) values(eid,reason); review:=review+1;
    elsif public.zkt_assign_event(eid) then accepted:=accepted+1;
    else review:=review+1; end if;
  end loop;
  return jsonb_build_object('owned',accepted,'review',review);
end $$;

-- Replace every number-based rebuild entry point with the safe processor.
-- Legacy definitions are retained under uncallable names for controlled rollback.
do $$ declare f record; oldname text;
begin
  for f in select oid,proname,oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
    and proname in ('process_zkt_attendance_to_work_logs','rebuild_employee_work_log_day_from_zkt',
      'rebuild_employee_work_log_from_zkt','rebuild_employee_work_log_from_zkt_safe','rebuild_zkt_work_logs') loop
    oldname:=f.proname||'_pre_identity';
    execute format('alter function %s rename to %I',f.signature,oldname);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  end loop;
end $$;

create function public.process_zkt_attendance_to_work_logs() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g record; w public.employee_work_logs%rowtype; wid uuid; changed integer:=0; hours numeric;
begin
  if auth.role() is distinct from 'service_role' and not public.employee_archive_admin() then raise exception 'Admin or bridge service required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,1);
  perform set_config('farmplast.zkt_identity_processing','on',true);
  for g in
    with owned as (
      select e.id,e.local_timestamp,e.raw,o.employee_id,h.period_id,h.hourly_rate,h.default_lunch_hours,
        case when h.shift_type='night' and e.local_timestamp::time<time '12:00' then e.local_timestamp::date-1 else e.local_timestamp::date end work_date,
        p.hire_date,p.termination_date,p.legacy_inactive,h.processing_verified,person.active currently_active,
        (h.hourly_rate is not distinct from coalesce(person.hourly_rate,0)
          and h.shift_type=coalesce(person.shift_type,'day') and h.default_lunch_hours=coalesce(person.default_lunch_hours,1)) context_matches
      from public.zkt_identity_events e join public.zkt_event_ownership o on o.event_id=e.id
      join public.zkt_identifier_history h on h.id=o.mapping_id join public.employee_employment_periods p on p.id=h.period_id
      join public.employees person on person.id=o.employee_id
    ) select employee_id,period_id,work_date,hourly_rate,default_lunch_hours,
        array_agg(id) ids,count(*) n,
        min(local_timestamp) filter(where raw->>'inOutMode'='0') in_stamp,
        max(local_timestamp) filter(where raw->>'inOutMode'='1') out_stamp,
        count(*) filter(where raw->>'inOutMode'='0') in_count,
        count(*) filter(where raw->>'inOutMode'='1') out_count,
        bool_and(currently_active is true) currently_active,
        bool_and(processing_verified and context_matches and not legacy_inactive and (hire_date is null or work_date>=hire_date) and (termination_date is null or work_date<=termination_date)) employed
      from owned group by employee_id,period_id,work_date,hourly_rate,default_lunch_hours
  loop
    if not g.employed or (g.out_stamp is null and not g.currently_active) or g.n>2 or g.n<>g.in_count+g.out_count or g.in_count<>1 or g.out_count>1 or (g.out_stamp is not null and (g.out_stamp<=g.in_stamp or g.out_stamp-g.in_stamp>interval '13 hours')) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Attendance needs review: payroll context, employment boundary or unsupported punch sequence' on conflict do nothing;
      continue;
    end if;
    -- A saved payroll check freezes its source day, including a late OUT punch.
    if exists(select 1 from public.payroll_checks where employee_id=g.employee_id and g.work_date between pay_period_start and pay_period_end and voided_at is null) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Saved payroll covers this work date; late punches require review' on conflict do nothing;
      continue;
    end if;
    select * into w from public.employee_work_logs where employee_id=g.employee_id and work_date=g.work_date for update;
    if found and (coalesce(w.approved,false) or coalesce(w.manually_edited,false) or coalesce(w.manual_time_in,false) or coalesce(w.manual_time_out,false) or coalesce(w.is_deleted,false)
      or not exists(select 1 from public.zkt_work_log_provenance where work_log_id=w.id and period_id=g.period_id)) then
      insert into public.zkt_identity_review(event_id,reason) select unnest(g.ids),'Existing historical/manual/approved work log retained; review attendance separately' on conflict do nothing;
      continue;
    end if;
    hours:=case when g.out_stamp is null then 0 else greatest(0,extract(epoch from(g.out_stamp-g.in_stamp))/3600-g.default_lunch_hours) end;
    if w.id is null then
      insert into public.employee_work_logs(employee_id,work_date,time_in,time_out,lunch_hours,reg_hours,labor_amount,source,approved,manually_edited,is_deleted,missed_punch,auto_closed_reason)
      values(g.employee_id,g.work_date,g.in_stamp::time,g.out_stamp::time,g.default_lunch_hours,round(hours,2),round(hours*g.hourly_rate,2),'zkt',false,false,false,g.out_stamp is null,
        case when g.out_stamp is null then 'OPEN SHIFT: waiting for OUT punch' else null end) returning id into wid;
      insert into public.zkt_work_log_provenance values(wid,g.employee_id,g.period_id,g.work_date);
    else
      update public.employee_work_logs set time_in=g.in_stamp::time,time_out=g.out_stamp::time,reg_hours=round(hours,2),labor_amount=round(hours*g.hourly_rate,2),
        missed_punch=g.out_stamp is null,auto_closed_reason=case when g.out_stamp is null then 'OPEN SHIFT: waiting for OUT punch' else null end
        where id=w.id and (time_in,time_out,reg_hours,labor_amount) is distinct from (g.in_stamp::time,g.out_stamp::time,round(hours,2),round(hours*g.hourly_rate,2));
    end if;
    changed:=changed+1;
  end loop;
  perform set_config('farmplast.zkt_identity_processing','off',true);
  return jsonb_build_object('ok',true,'processed_days',changed);
end $$;

create or replace function public.mark_employee_work_log_manual_edit() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
  if current_setting('farmplast.zkt_identity_processing',true) is distinct from 'on' then
    if new.time_in is distinct from old.time_in then new.manual_time_in:=true; new.manually_edited:=true; end if;
    if new.time_out is distinct from old.time_out then new.manual_time_out:=true; new.manually_edited:=true; end if;
  end if;
  new.updated_at:=now(); return new;
end $$;
create function public.rebuild_employee_work_log_day_from_zkt(p_employee_id uuid,p_work_date date) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.process_zkt_attendance_to_work_logs() $$;
create function public.rebuild_employee_work_log_from_zkt(p_zkt_user_id integer,p_work_date date) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.process_zkt_attendance_to_work_logs(); end $$;
create function public.rebuild_employee_work_log_from_zkt_safe(p_employee_number integer,p_work_date date) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.process_zkt_attendance_to_work_logs(); end $$;
create function public.rebuild_zkt_work_logs() returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.process_zkt_attendance_to_work_logs() $$;

create function public.record_verified_zkt_mapping(p_device_key text,p_terminal_user_id text,p_employee_id uuid,p_period_id bigint,
  p_valid_from timestamptz,p_valid_to timestamptz,p_evidence text) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare mid bigint; eid bigint; e public.employees%rowtype;
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.zkt_identity_devices where device_key=p_device_key and verified) then raise exception 'Device is not verified'; end if;
  select * into strict e from public.employees where id=p_employee_id;
  insert into public.zkt_identifier_history(device_key,terminal_user_id,employee_id,period_id,valid_from,valid_to,evidence,shift_type,hourly_rate,default_lunch_hours)
  values(p_device_key,p_terminal_user_id,p_employee_id,p_period_id,p_valid_from,p_valid_to,p_evidence,coalesce(e.shift_type,'day'),coalesce(e.hourly_rate,0),coalesce(e.default_lunch_hours,1)) returning id into mid;
  for eid in select evt.id from public.zkt_identity_events evt left join public.zkt_legacy_device_evidence proof on proof.event_id=evt.id
    where coalesce(evt.device_key,proof.device_key)=p_device_key and evt.terminal_user_id=p_terminal_user_id and evt.event_at>=p_valid_from and (p_valid_to is null or evt.event_at<p_valid_to) loop
    perform public.zkt_assign_event(eid);
  end loop;
  return mid;
end $$;

create function public.confirm_legacy_zkt_device(p_event_id bigint,p_device_key text,p_evidence text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if nullif(trim(p_evidence),'') is null or not exists(select 1 from public.zkt_identity_devices where device_key=p_device_key and verified) then
    raise exception 'Verified device and independent source evidence required'; end if;
  if not exists(select 1 from public.zkt_identity_events where id=p_event_id and legacy_raw_id is not null and device_key is null and event_at is not null) then
    raise exception 'Eligible timestamped legacy event required'; end if;
  if exists(select 1 from public.zkt_identity_events e where e.id=p_event_id and
    (e.local_timestamp is null or (e.event_at at time zone 'America/New_York')<>e.local_timestamp
      or ((e.event_at-interval '1 hour') at time zone 'America/New_York')=e.local_timestamp
      or ((e.event_at+interval '1 hour') at time zone 'America/New_York')=e.local_timestamp)) then
    raise exception 'Legacy clock/timezone ambiguity requires independent event reconciliation'; end if;
  insert into public.zkt_legacy_device_evidence(event_id,device_key,evidence,confirmed_by) values(p_event_id,p_device_key,p_evidence,auth.uid());
  return public.zkt_assign_event(p_event_id);
end $$;

do $$ declare t text;
begin
  foreach t in array array['zkt_identity_devices','zkt_identifier_history','zkt_identity_events','zkt_event_ownership','zkt_identity_review','zkt_work_log_provenance','zkt_legacy_device_evidence','zkt_reserved_terminal_identifiers'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy archive_admin_read on public.%I for select to authenticated using(public.employee_archive_admin())',t);
  end loop;
end $$;
-- Preserve active-employee dashboard visibility through caller RLS, while
-- former employees and the review queue remain restricted to administrators.
create policy active_employee_owned_events on public.zkt_event_ownership for select to authenticated using
  (exists(select 1 from public.employees e where e.id=employee_id and e.active is true));
create policy active_employee_event_raw on public.zkt_identity_events for select to authenticated using
  (exists(select 1 from public.zkt_event_ownership o where o.event_id=id));
create policy active_employee_identifier_history on public.zkt_identifier_history for select to authenticated using
  (exists(select 1 from public.employees e where e.id=employee_id and e.active is true));

-- Keep the existing view's column order and grants; change its join to UUID.
do $$ declare columns_sql text;
begin
  select string_agg(case when a.attname in ('last_punch_time','last_punch_type','last_work_date','is_on_site','absence_days','presence_status') then
    case a.attname
      when 'last_punch_time' then 'lp.local_timestamp as last_punch_time'
      when 'last_punch_type' then 'lp.punch_type as last_punch_type'
      when 'last_work_date' then 'lp.work_date as last_work_date'
      when 'is_on_site' then 'coalesce(lp.punch_type=''IN'',false) as is_on_site'
      when 'absence_days' then 'case when lp.work_date is null then null::integer else greatest(current_date-lp.work_date,0) end as absence_days'
      when 'presence_status' then 'case lp.punch_type when ''IN'' then ''ON_SITE'' when ''OUT'' then ''OFF_SITE'' else ''ABSENT'' end as presence_status'
    end else format('e.%I',a.attname) end,', ' order by a.attnum) into columns_sql
  from pg_attribute a where a.attrelid='public.v_employee_current_presence'::regclass and a.attnum>0 and not a.attisdropped;
  execute 'create or replace view public.v_employee_current_presence with(security_invoker=true) as select '||columns_sql||
    ' from public.employees e left join lateral (select r.local_timestamp,case r.raw->>''inOutMode'' when ''0'' then ''IN'' when ''1'' then ''OUT'' else ''REVIEW'' end punch_type,'||
    'case when h.shift_type=''night'' and r.local_timestamp::time<time ''12:00'' then r.local_timestamp::date-1 else r.local_timestamp::date end work_date '||
    'from public.zkt_event_ownership o join public.zkt_identity_events r on r.id=o.event_id join public.zkt_identifier_history h on h.id=o.mapping_id '||
    'join public.employee_employment_periods p on p.id=h.period_id where o.employee_id=e.id and p.termination_date is null and not p.legacy_inactive '||
    'order by r.event_at desc,r.id desc limit 1) lp on true';
end $$;
create policy active_employee_period_read on public.employee_employment_periods for select to authenticated using
  (exists(select 1 from public.employees e where e.id=employee_id and e.active is true));
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='zkt_event_ownership') then
    alter publication supabase_realtime add table public.zkt_event_ownership;
  end if;
end $$;
revoke all on function public.zkt_assign_event(bigint) from public,anon,authenticated,service_role;
revoke all on function public.ingest_zkt_identity_events(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_zkt_identity_events(text,text,jsonb) to service_role;
revoke all on function public.process_zkt_attendance_to_work_logs() from public,anon;
grant execute on function public.process_zkt_attendance_to_work_logs() to authenticated,service_role;
revoke all on function public.record_verified_zkt_mapping(text,text,uuid,bigint,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.record_verified_zkt_mapping(text,text,uuid,bigint,timestamptz,timestamptz,text) to authenticated;
revoke all on function public.confirm_legacy_zkt_device(bigint,text,text) from public,anon;
grant execute on function public.confirm_legacy_zkt_device(bigint,text,text) to authenticated;
commit;
