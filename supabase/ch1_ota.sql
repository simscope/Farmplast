-- LOCAL CANDIDATE ONLY. Apply separately after review; no existing telemetry policies change.
begin;
create table if not exists public.ch1_ota_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[A-Za-z0-9._-]{1,48}$'),
  model text not null default 'CH1-ESP32S3-v1' check (model = 'CH1-ESP32S3-v1'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size integer not null check (size > 0 and size <= 1310720),
  storage_path text not null unique,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.ch1_ota_grants (
  token_hash text primary key,
  used boolean not null default false,
  operator_id uuid not null,
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create or replace function public.ch1_ota_immutable_release() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.version,new.model,new.sha256,new.size,new.storage_path) is distinct from (old.version,old.model,old.sha256,old.size,old.storage_path) then
    raise exception 'Approved release metadata is immutable';
  end if;
  return new;
end $$;
drop trigger if exists ch1_ota_immutable_release on public.ch1_ota_releases;
create trigger ch1_ota_immutable_release before update on public.ch1_ota_releases for each row execute function public.ch1_ota_immutable_release();
revoke all on function public.ch1_ota_immutable_release() from public,anon,authenticated;
grant execute on function public.ch1_ota_immutable_release() to service_role;
create table if not exists public.ch1_ota_attempts (
  operator_id uuid primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 0
);
create table if not exists public.ch1_ota_jobs (
  id uuid primary key,
  operator_id uuid not null,
  release_id uuid not null references public.ch1_ota_releases(id),
  status text not null default 'authorized' check (status in ('authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  source_boot text not null,
  failure text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  updated_at timestamptz not null default now()
);
create table if not exists public.ch1_ota_device (
  id text primary key check (id='ESP32-CH1'),
  version text not null,
  boot_id text not null,
  last_seen timestamptz not null default now()
);
create table if not exists public.ch1_ota_events (
  id bigint generated always as identity primary key,
  job_id uuid references public.ch1_ota_jobs(id),
  operator_id uuid,
  event text not null,
  created_at timestamptz not null default now()
);
alter table public.ch1_ota_releases enable row level security;
alter table public.ch1_ota_grants enable row level security;
alter table public.ch1_ota_attempts enable row level security;
alter table public.ch1_ota_jobs enable row level security;
alter table public.ch1_ota_device enable row level security;
alter table public.ch1_ota_events enable row level security;
revoke all on public.ch1_ota_releases,public.ch1_ota_grants,public.ch1_ota_attempts,public.ch1_ota_jobs,public.ch1_ota_device,public.ch1_ota_events from public,anon,authenticated;
grant all on public.ch1_ota_releases,public.ch1_ota_grants,public.ch1_ota_attempts,public.ch1_ota_jobs,public.ch1_ota_device,public.ch1_ota_events to service_role;
grant usage,select on sequence public.ch1_ota_events_id_seq to service_role;

create or replace function public.ch1_ota_audit_job() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    insert into public.ch1_ota_events(job_id,operator_id,event) values(new.id,new.operator_id,new.status);
  elsif new.status is distinct from old.status then
    insert into public.ch1_ota_events(job_id,operator_id,event) values(new.id,new.operator_id,new.status);
  end if;
  return new;
end $$;
drop trigger if exists ch1_ota_audit_job on public.ch1_ota_jobs;
create trigger ch1_ota_audit_job after insert or update on public.ch1_ota_jobs for each row execute function public.ch1_ota_audit_job();

create or replace function public.ch1_ota_attempt(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  insert into public.ch1_ota_attempts(operator_id,attempts) values(p_user,1)
  on conflict(operator_id) do update set
    attempts=case when ch1_ota_attempts.started_at<now()-interval '15 minutes' then 1 else ch1_ota_attempts.attempts+1 end,
    started_at=case when ch1_ota_attempts.started_at<now()-interval '15 minutes' then now() else ch1_ota_attempts.started_at end
  returning attempts into n;
  insert into public.ch1_ota_events(operator_id,event) values(p_user,case when n<=5 then 'code_attempt' else 'code_rate_limited' end);
  delete from public.ch1_ota_grants where expires_at<=now();
  return n<=5;
end $$;

create or replace function public.ch1_ota_queue(p_user uuid,p_grant text,p_id uuid,p_release uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare grant_user uuid; boot text;
begin
  perform pg_catalog.pg_advisory_xact_lock(714001);
  if exists(select 1 from public.ch1_ota_jobs where id=p_id and operator_id=p_user and release_id=p_release) then return p_id; end if;
  update public.ch1_ota_grants set used=true where token_hash=p_grant and operator_id=p_user and expires_at>now() and not used returning operator_id into grant_user;
  if grant_user is null then raise exception 'Authorization expired or already used'; end if;
  update public.ch1_ota_jobs set status='failed',failure='deadline_exceeded',updated_at=now() where status not in ('completed','failed') and expires_at<=now();
  if exists(select 1 from public.ch1_ota_jobs where status not in ('completed','failed')) then raise exception 'An update is already active'; end if;
  select boot_id into boot from public.ch1_ota_device where last_seen>now()-interval '2 minutes';
  if boot is null then raise exception 'Gateway offline or not provisioned'; end if;
  if not exists(select 1 from public.ch1_ota_releases where id=p_release and approved) then raise exception 'Release is not approved'; end if;
  if exists(select 1 from public.ch1_ota_releases r join public.ch1_ota_device d on d.version=r.version where r.id=p_release) then raise exception 'Version is already running'; end if;
  insert into public.ch1_ota_jobs(id,operator_id,release_id,source_boot) values(p_id,p_user,p_release,boot);
  return p_id;
end $$;


-- Desired values are isolated from device-reported telemetry. Seed once for compatibility.
create table if not exists public.ch1_desired_state (
 id text primary key check(id='ESP32-CH1'),
 values jsonb not null,
 revision integer not null default 0,
 reset_sequence integer not null default 0,
 updated_at timestamptz not null default now()
);
create table if not exists public.ch1_control_commands (
 id uuid primary key,operator_id uuid not null,command_type text not null,
 requested jsonb not null,revision integer not null,reset_sequence integer not null,
 status text not null default 'pending' check(status in ('pending','applied','timeout')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '45 seconds',
 applied_at timestamptz
);
alter table public.ch1_desired_state enable row level security;
alter table public.ch1_control_commands enable row level security;
revoke all on public.ch1_desired_state,public.ch1_control_commands from public,anon,authenticated;
grant all on public.ch1_desired_state,public.ch1_control_commands to service_role;
insert into public.ch1_desired_state(id,values)
select 'ESP32-CH1',jsonb_build_object(
 'setpoint',coalesce(max(value_number) filter(where point_code='CH1_SETPOINT'),85),
 'd1',coalesce(max(value_number) filter(where point_code='CH1_D1'),2),
 'd2',coalesce(max(value_number) filter(where point_code='CH1_D2'),5),
 'hyst',coalesce(max(value_number) filter(where point_code='CH1_HYST'),1),
 'auto',coalesce(bool_or(value_boolean) filter(where point_code='CH1_AUTO'),true),
 'fan_enable',coalesce(bool_or(value_boolean) filter(where point_code='CH1_FAN_ENABLE'),false),
 'fan_30',coalesce(bool_or(value_boolean) filter(where point_code='CH1_FAN_30'),false),
 'fan_60',coalesce(bool_or(value_boolean) filter(where point_code='CH1_FAN_60'),false))
from public.v_asset_points_latest where asset_code='CH-NJ-01'
on conflict(id) do nothing;

create or replace function public.ch1_control_request(p_user uuid,p_id uuid,p_type text,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.ch1_desired_state; existing public.ch1_control_commands; next_values jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(714001);
 select * into existing from public.ch1_control_commands where id=p_id;
 if existing.id is not null then
   if existing.operator_id<>p_user or existing.command_type<>p_type or existing.requested<>p_patch then raise exception 'Request id conflict'; end if;
   return to_jsonb(existing);
 end if;
 update public.ch1_control_commands set status='timeout' where status='pending' and expires_at<=now();
 if exists(select 1 from public.ch1_control_commands where status='pending') then raise exception 'Previous command pending'; end if;
 if not exists(select 1 from public.ch1_ota_device where last_seen>now()-interval '30 seconds') then raise exception 'ESP32 offline'; end if;
 if exists(select 1 from public.ch1_ota_jobs where status not in ('completed','failed') and expires_at>now()) then raise exception 'Programming active'; end if;
 if p_type not in ('fan_mode','fan_off','fan_speed','fan_setpoint','d1','d2','hyst','reset_alert') or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Invalid command'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('auto','fan_enable','fan_30','fan_60','setpoint','d1','d2','hyst','reset')) then raise exception 'Invalid command field'; end if;
 select * into d from public.ch1_desired_state where id='ESP32-CH1' for update;
 next_values=d.values||(p_patch-'reset');
 if exists(select 1 from jsonb_each(next_values) x where (x.key in ('auto','fan_enable','fan_30','fan_60') and jsonb_typeof(x.value)<>'boolean') or (x.key in ('setpoint','d1','d2','hyst') and jsonb_typeof(x.value)<>'number')) then raise exception 'Invalid field type'; end if;
 if (next_values->>'setpoint')::numeric not between -100 and 300 or (next_values->>'d1')::numeric not between 0 and 100 or (next_values->>'d2')::numeric not between 0 and 100 or (next_values->>'hyst')::numeric not between 0 and 100 or (next_values->>'d2')::numeric<(next_values->>'d1')::numeric then raise exception 'Invalid threshold range'; end if;
 update public.ch1_desired_state set values=next_values,revision=revision+1,reset_sequence=reset_sequence+case when p_type='reset_alert' then 1 else 0 end,updated_at=now() where id=d.id returning * into d;
 insert into public.ch1_control_commands(id,operator_id,command_type,requested,revision,reset_sequence) values(p_id,p_user,p_type,p_patch,d.revision,d.reset_sequence) returning * into existing;
 insert into public.ch1_ota_events(operator_id,event) values(p_user,'control_requested:'||p_id::text);
 return to_jsonb(existing);
end $$;

create or replace function public.ch1_control_reconcile() returns void
language plpgsql security invoker set search_path='' as $$
declare metadata jsonb; actual jsonb; matched record;
begin
 select raw_payload->'gateway' into metadata from public.telemetry_latest where point_id='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid and device_id='db7a7808-8ceb-407a-bfbf-c215e42ffb93'::uuid;
 select jsonb_object_agg(case point_code when 'CH1_AUTO' then 'auto' when 'CH1_FAN_ENABLE' then 'fan_enable' when 'CH1_FAN_30' then 'fan_30' when 'CH1_FAN_60' then 'fan_60' when 'CH1_SETPOINT' then 'setpoint' when 'CH1_D1' then 'd1' when 'CH1_D2' then 'd2' when 'CH1_HYST' then 'hyst' end,
 case when point_code in ('CH1_SETPOINT','CH1_D1','CH1_D2','CH1_HYST') then to_jsonb(value_number) else to_jsonb(value_boolean) end) into actual
 from public.v_asset_points_latest where asset_code='CH-NJ-01' and point_code in ('CH1_AUTO','CH1_FAN_ENABLE','CH1_FAN_30','CH1_FAN_60','CH1_SETPOINT','CH1_D1','CH1_D2','CH1_HYST');
 for matched in update public.ch1_control_commands c set status='applied',applied_at=now()
 where status='pending' and expires_at>now()
 and case when coalesce(metadata->>'command_revision','')~'^[0-9]+$' then (metadata->>'command_revision')::numeric>=c.revision else false end
 and ((command_type='reset_alert' and case when coalesce(metadata->>'reset_sequence','')~'^[0-9]+$' then (metadata->>'reset_sequence')::numeric>=c.reset_sequence else false end)
 or (command_type<>'reset_alert' and not exists(select 1 from jsonb_each(c.requested) x where
   case when jsonb_typeof(x.value)='number' then actual->>x.key is null or abs((actual->>x.key)::numeric-(x.value#>>'{}')::numeric)>0.05
   else actual->x.key is distinct from x.value end))) returning id,operator_id
 loop
   insert into public.ch1_ota_events(operator_id,event) values(matched.operator_id,'control_applied:'||matched.id::text);
 end loop;
 update public.ch1_control_commands set status='timeout' where status='pending' and expires_at<=now();
end $$;
revoke all on function public.ch1_control_request(uuid,uuid,text,jsonb),public.ch1_control_reconcile() from public,anon,authenticated;
grant execute on function public.ch1_control_request(uuid,uuid,text,jsonb),public.ch1_control_reconcile() to service_role;

-- Single compact device exchange: legacy values actually consumed by the supplied sketch,
-- plus OTA manifest/ack. No full latest-view response and no second OTA polling loop.
create or replace function public.ch1_device_sync(p_version text,p_boot text,p_job uuid,p_status text,p_progress integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.ch1_ota_jobs; points jsonb; manifest jsonb; ack text; current_rank integer; next_rank integer; desired public.ch1_desired_state; reset_request integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(714001);
  insert into public.ch1_ota_device(id,version,boot_id) values('ESP32-CH1',p_version,p_boot)
  on conflict(id) do update set version=excluded.version,boot_id=excluded.boot_id,last_seen=now();
  select * into j from public.ch1_ota_jobs where id=p_job for update;
  if j.id is not null and j.status not in ('completed','failed') then
    current_rank=array_position(array['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry'],j.status);
    next_rank=array_position(array['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry'],p_status);
    if p_status='failed' then
      update public.ch1_ota_jobs set status='failed',failure='device_reported_failure',updated_at=now() where id=j.id;
    elsif next_rank>=current_rank and p_progress between 0 and 100 and
      ((p_boot=j.source_boot and p_status<>'waiting_for_telemetry') or
       (p_boot<>j.source_boot and p_status='waiting_for_telemetry' and exists(select 1 from public.ch1_ota_releases where id=j.release_id and version=p_version))) then
      update public.ch1_ota_jobs set status=p_status,progress=greatest(progress,p_progress),updated_at=now() where id=j.id;
    end if;
    -- Completion requires a NEW boot, the selected version, and an actual telemetry row
    -- written by that boot. A status-only heartbeat cannot complete an update.
    if exists(select 1 from public.ch1_ota_jobs where id=j.id and status='waiting_for_telemetry') and p_boot<>j.source_boot and exists(
      select 1 from public.telemetry_latest t join public.ch1_ota_releases r on r.id=j.release_id
      where t.point_id='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid
        and t.device_id='db7a7808-8ceb-407a-bfbf-c215e42ffb93'::uuid
        and r.version=p_version and t.raw_payload->'gateway'->>'version'=p_version
        and t.raw_payload->'gateway'->>'boot'=p_boot and t.raw_payload->'gateway'->>'job'=p_job::text
    ) then
      update public.ch1_ota_jobs set status='completed',progress=100,updated_at=now() where id=j.id;
    end if;
  end if;
  update public.ch1_ota_jobs set status='failed',failure='deadline_exceeded',updated_at=now() where status not in ('completed','failed') and expires_at<=now();
  update public.ch1_ota_jobs jobs set status='failed',failure='release_revoked',updated_at=now() where status='authorized' and not exists(select 1 from public.ch1_ota_releases r where r.id=jobs.release_id and approved);
  select status into ack from public.ch1_ota_jobs where id=p_job;
  perform public.ch1_control_reconcile();
  select * into desired from public.ch1_desired_state where id='ESP32-CH1';
  points=desired.values;
  if exists(select 1 from public.ch1_control_commands where command_type='reset_alert' and status='pending' and expires_at>now()) then reset_request=desired.reset_sequence; end if;
  select jsonb_build_object('id',jobs.id,'action','update','expires',floor(extract(epoch from jobs.expires_at))::bigint,
    'version',r.version,'sha256',r.sha256,'size',r.size,'path',r.storage_path,'model',r.model)
  into manifest from public.ch1_ota_jobs jobs join public.ch1_ota_releases r on r.id=jobs.release_id
  where jobs.status='authorized' and jobs.expires_at>now() and r.approved order by jobs.created_at limit 1;
  return jsonb_build_object('c',jsonb_build_array(points->'setpoint',points->'d1',points->'d2',points->'hyst',points->'auto',points->'fan_enable',points->'fan_30',points->'fan_60',false),'o',manifest,'a',ack,'r',desired.revision,'q',reset_request);
end $$;
revoke all on function public.ch1_ota_attempt(uuid),public.ch1_ota_queue(uuid,text,uuid,uuid),public.ch1_device_sync(text,text,uuid,text,integer),public.ch1_ota_audit_job() from public,anon,authenticated;
grant execute on function public.ch1_ota_attempt(uuid),public.ch1_ota_queue(uuid,text,uuid,uuid),public.ch1_device_sync(text,text,uuid,text,integer),public.ch1_ota_audit_job() to service_role;
-- Private bucket; no public/client upload policies. Release preparation uses a server-side tool.
insert into storage.buckets(id,name,public,file_size_limit) values('ch1-firmware','ch1-firmware',false,1310720) on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='ch1-firmware' and public) then raise exception 'Existing CH1 firmware bucket must be private'; end if;
end $$;
-- Restrictive boundary also blocks any pre-existing broad authenticated storage policies.
drop policy if exists ch1_firmware_private_boundary on storage.objects;
create policy ch1_firmware_private_boundary on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'ch1-firmware') with check (bucket_id <> 'ch1-firmware');
commit;
