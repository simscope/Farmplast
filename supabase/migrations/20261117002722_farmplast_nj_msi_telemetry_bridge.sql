-- Telemetry payloads move to bounded MSI RAM. Cloud keeps only OTA receipts
-- and command acknowledgements; no sensor measurements are inserted here.
begin;
create extension if not exists http with schema extensions;
do $$ begin
 if to_regnamespace('nj_msi_private') is not null then raise exception 'MSI bridge already installed; inspect before replacing'; end if;
 if md5(replace(pg_get_functiondef('public.ingest_ch1(text,jsonb)'::regprocedure),chr(13),''))<>'d2e1ac209566ef70bd82b545f2cabcef'
 or md5(replace(pg_get_functiondef('public.ch1_control_reconcile()'::regprocedure),chr(13),''))<>'f2675053be85f9a40fb631488520129a'
 or md5(replace(pg_get_functiondef('public.ch1_device_sync(text,text,uuid,text,integer)'::regprocedure),chr(13),''))<>'fdc24ab1d8d8d10b632eb2bd2dc14dc4'
 then raise exception 'Production CH1 baseline changed; stop before applying'; end if;
end $$;
create schema nj_msi_private;
revoke all on schema nj_msi_private from public,anon,authenticated;
create table nj_msi_private.routes (
 device text primary key check(device in ('ESP32-CH1','ESP32-CH2-PLC','ESP32-CH3-PLC')),
 mode text not null default 'cloud' check(mode in ('cloud','mirror','relay'))
);
insert into nj_msi_private.routes(device) values('ESP32-CH1'),('ESP32-CH2-PLC'),('ESP32-CH3-PLC');
create table nj_msi_private.ch1_receipt (
 device text primary key check(device='ESP32-CH1'),
 version text not null, boot_id text not null, job_id uuid,
 received_at timestamptz not null default now()
);
alter table nj_msi_private.routes enable row level security;
alter table nj_msi_private.ch1_receipt enable row level security;
revoke all on all tables in schema nj_msi_private from public,anon,authenticated;

create function nj_msi_private.auth_device(p_device text,p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare expected text;
begin
 if p_key is null or length(p_key) not between 16 and 256 then return false; end if;
 if p_device='ESP32-CH1' then
  select device_key into expected from ch1_private.config where singleton;
 else
  if p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC') then return false; end if;
  select device_secret into expected from public.devices where device_code=p_device and coalesce(is_active,true);
 end if;
 return expected is not null and extensions.digest(p_key,'sha256')=extensions.digest(expected,'sha256');
end $$;

create function nj_msi_private.send(p_device text,p_key text,p_body jsonb,p_mirror boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare response extensions.http_response; producer text; bearer text; target text;
begin
 producer=case p_device when 'ESP32-CH1' then 'chiller-1' when 'ESP32-CH2-PLC' then 'chiller-2' when 'ESP32-CH3-PLC' then 'chiller-3' end;
 if producer is null or not nj_msi_private.auth_device(p_device,p_key) then raise exception 'Device authentication failed'; end if;
 if octet_length(p_body::text)>32768 then raise exception 'Invalid telemetry batch'; end if;
 target='https://msi.tail4626fb.ts.net:10000/v1/'||case when p_mirror then 'mirror/' else 'relay/' end||producer;
 bearer=translate(encode(convert_to(p_key,'UTF8'),'base64'),E'+/\n=','-_');
 perform set_config('http.curlopt_timeout_ms',case when p_mirror then '1500' else '6500' end,true);
 perform set_config('http.curlopt_connecttimeout_ms','1500',true);
 select * into response from extensions.http(('POST',target,array[('Authorization','Bearer '||bearer)::extensions.http_header], 'application/json',p_body::text)::extensions.http_request);
 if response.status<>200 or octet_length(response.content)>4096 then raise exception 'MSI telemetry unavailable'; end if;
 return response.content::jsonb;
end $$;

-- Exact installed writers remain available privately for a controlled rollback.
alter function public.ingest_ch1(text,jsonb) set schema nj_msi_private;
alter function nj_msi_private.ingest_ch1(text,jsonb) rename to legacy_ingest_ch1;
alter function public.ingest_ch2(jsonb) set schema nj_msi_private;
alter function nj_msi_private.ingest_ch2(jsonb) rename to legacy_ingest_ch2;
alter function public.ingest_ch3(jsonb) set schema nj_msi_private;
alter function nj_msi_private.ingest_ch3(jsonb) rename to legacy_ingest_ch3;

create function public.ingest_ch1(p_key text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mode text; result jsonb;
begin
 if not nj_msi_private.auth_device('ESP32-CH1',p_key) then raise exception 'Device authentication failed'; end if;
 select r.mode into mode from nj_msi_private.routes r where device='ESP32-CH1';
 if mode='relay' then return nj_msi_private.send('ESP32-CH1',p_key,jsonb_build_object('p_rows',p_rows),false); end if;
 result=nj_msi_private.legacy_ingest_ch1(p_key,p_rows);
 if mode='mirror' then begin
  perform nj_msi_private.send('ESP32-CH1',p_key,jsonb_build_object('p_rows',p_rows),true);
 exception when others then null; end; end if;
 return result;
end $$;
create function public.ingest_ch2(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mode text; result jsonb; key text=payload->>'device_secret';
begin
 if payload->>'device_code' is distinct from 'ESP32-CH2-PLC' or not nj_msi_private.auth_device('ESP32-CH2-PLC',key) then raise exception 'Device authentication failed'; end if;
 select r.mode into mode from nj_msi_private.routes r where device='ESP32-CH2-PLC';
 if mode='relay' then return nj_msi_private.send('ESP32-CH2-PLC',key,jsonb_build_object('payload',payload-'device_secret'),false); end if;
 result=nj_msi_private.legacy_ingest_ch2(payload);
 if mode='mirror' then begin
  perform nj_msi_private.send('ESP32-CH2-PLC',key,jsonb_build_object('payload',payload-'device_secret'),true);
 exception when others then null; end; end if;
 return result;
end $$;
create function public.ingest_ch3(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mode text; result jsonb; key text=payload->>'device_secret';
begin
 if payload->>'device_code' is distinct from 'ESP32-CH3-PLC' or not nj_msi_private.auth_device('ESP32-CH3-PLC',key) then raise exception 'Device authentication failed'; end if;
 select r.mode into mode from nj_msi_private.routes r where device='ESP32-CH3-PLC';
 if mode='relay' then return nj_msi_private.send('ESP32-CH3-PLC',key,jsonb_build_object('payload',payload-'device_secret'),false); end if;
 result=nj_msi_private.legacy_ingest_ch3(payload);
 if mode='mirror' then begin
  perform nj_msi_private.send('ESP32-CH3-PLC',key,jsonb_build_object('payload',payload-'device_secret'),true);
 exception when others then null; end; end if;
 return result;
end $$;

-- Authenticated MSI ingestion calls this only after validating the real packet.
-- Reported CH1 switch/configuration values exist only as call parameters. They
-- are compared to pending commands and are never inserted into a sample table.
create function public.nj_msi_exchange(p_device text,p_key text,p_gateway jsonb,p_reported jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare matched record; mode text;
begin
 if not nj_msi_private.auth_device(p_device,p_key) then raise exception 'Device authentication failed'; end if;
 select r.mode into mode from nj_msi_private.routes r where device=p_device;
 if mode is distinct from 'relay' then raise exception 'MSI route not active'; end if;
 if p_gateway is null or jsonb_typeof(p_gateway)<>'object' or octet_length(p_gateway::text)>1024
 or p_gateway->>'protocol' is distinct from '2'
 or coalesce(p_gateway->>'version','') !~ '^[A-Za-z0-9._-]{1,48}$'
 or coalesce(p_gateway->>'boot','') !~ '^[a-f0-9]{32}$'
 or coalesce(p_gateway->>'job','') !~ '^([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})?$'
 or coalesce(p_gateway->>'status','') not in ('idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')
 or coalesce(p_gateway->>'progress','') !~ '^(100|[0-9]{1,2})$' then raise exception 'Invalid gateway metadata'; end if;
 if p_device<>'ESP32-CH1' then
  if p_reported is distinct from '{}'::jsonb then raise exception 'Unexpected reported control state'; end if;
  perform public.chiller_ota_record_telemetry(p_device,p_gateway);
  return ch23_ota_private.exchange(p_device,p_gateway,true);
 end if;
 if jsonb_typeof(p_reported) is distinct from 'object' or octet_length(p_reported::text)>1024 or exists(
  select 1 from jsonb_each(p_reported) x where x.key not in ('auto','fan_enable','fan_30','fan_60','setpoint','d1','d2','hyst')
  or jsonb_typeof(x.value)<>case when x.key in ('auto','fan_enable','fan_30','fan_60') then 'boolean' else 'number' end
 ) then raise exception 'Invalid reported control state'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714001);
 insert into nj_msi_private.ch1_receipt(device,version,boot_id,job_id)
 values(p_device,p_gateway->>'version',p_gateway->>'boot',nullif(p_gateway->>'job','')::uuid)
 on conflict(device) do update set version=excluded.version,boot_id=excluded.boot_id,job_id=excluded.job_id,received_at=now();
 for matched in update public.ch1_control_commands c set status='applied',applied_at=now()
 where c.status='pending' and c.expires_at>now()
 and case when coalesce(p_gateway->>'command_revision','')~'^[0-9]+$' then (p_gateway->>'command_revision')::numeric>=c.revision else false end
 and ((c.command_type='reset_alert' and case when coalesce(p_gateway->>'reset_sequence','')~'^[0-9]+$' then (p_gateway->>'reset_sequence')::numeric>=c.reset_sequence else false end)
 or (c.command_type<>'reset_alert' and not exists(select 1 from jsonb_each(c.requested) x where
   case when jsonb_typeof(x.value)='number' then p_reported->>x.key is null or abs((p_reported->>x.key)::numeric-(x.value#>>'{}')::numeric)>0.05
   else p_reported->x.key is distinct from x.value end))) returning c.id,c.operator_id
 loop
  insert into public.ch1_ota_events(operator_id,event) values(matched.operator_id,'control_applied:'||matched.id::text);
 end loop;
 update public.ch1_control_commands set status='timeout' where status='pending' and expires_at<=now();
 return ch1_private.exchange(p_gateway,true);
end $$;

-- Patched compatibility helpers follow. They retain the original legacy path
-- unless CH1 has explicitly been switched to the MSI route.

CREATE OR REPLACE FUNCTION public.ch1_control_reconcile()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare metadata jsonb; actual jsonb; matched record;
begin
 if exists(select 1 from nj_msi_private.routes where device='ESP32-CH1' and mode='relay') then
  update public.ch1_control_commands set status='timeout' where status='pending' and expires_at<=now();
  return;
 end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.ch1_device_sync(p_version text, p_boot text, p_job uuid, p_status text, p_progress integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    if exists(select 1 from public.ch1_ota_jobs where id=j.id and status='waiting_for_telemetry') and p_boot<>j.source_boot and ((exists(select 1 from nj_msi_private.routes where device='ESP32-CH1' and mode='relay') and exists(select 1 from nj_msi_private.ch1_receipt t join public.ch1_ota_releases r on r.id=j.release_id where t.device='ESP32-CH1' and t.version=p_version and t.boot_id=p_boot and t.job_id=p_job and r.version=p_version and t.received_at>now()-interval '16 seconds')) or (not exists(select 1 from nj_msi_private.routes where device='ESP32-CH1' and mode='relay') and exists(
      select 1 from public.telemetry_latest t join public.ch1_ota_releases r on r.id=j.release_id
      where t.point_id='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid
        and t.device_id='db7a7808-8ceb-407a-bfbf-c215e42ffb93'::uuid
        and r.version=p_version and t.raw_payload->'gateway'->>'version'=p_version
        and t.raw_payload->'gateway'->>'boot'=p_boot and t.raw_payload->'gateway'->>'job'=p_job::text
    ))) then
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
end $function$;

revoke all on function public.ingest_ch1(text,jsonb),public.ingest_ch2(jsonb),public.ingest_ch3(jsonb),public.nj_msi_exchange(text,text,jsonb,jsonb) from public;
grant execute on function public.ingest_ch1(text,jsonb),public.ingest_ch2(jsonb),public.ingest_ch3(jsonb),public.nj_msi_exchange(text,text,jsonb,jsonb) to anon,authenticated,service_role;
revoke all on all functions in schema nj_msi_private from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='extensions' and p.proname ~ '^http($|_)' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
