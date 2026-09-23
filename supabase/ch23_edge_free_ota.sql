-- PREPARED ONLY. Apply after PR19 migrations. Does not remove legacy RPCs/Edge.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions')
 then raise exception 'Expected pgcrypto in extensions schema'; end if;
end $$;
create schema if not exists ch23_ota_private;
revoke all on schema ch23_ota_private from public,anon,authenticated;
create table ch23_ota_private.operators (id uuid primary key);
create table ch23_ota_private.config (
 singleton boolean primary key default true check(singleton),
 origin text not null check(origin ~ '^https://[a-z0-9]+[.]supabase[.]co$'),
 code_hash text not null check(code_hash ~ '^\$2[aby]\$1[2-6]\$')
);
create table ch23_ota_private.device_keys (
 device text primary key check(device in ('ESP32-CH2-PLC','ESP32-CH3-PLC')),
 key text not null check(length(key)>=32)
);
create table ch23_ota_private.downloads (
 job_id uuid primary key references public.chiller_ota_jobs(id),
 url text not null, expires_at timestamptz not null
);
create table ch23_ota_private.verifications (
 release_id uuid primary key references public.chiller_ota_releases(id),
 operator_id uuid not null, object_id uuid not null, verified_sha256 text not null,
 verified_at timestamptz not null default now()
);
alter table public.chiller_ota_devices add column if not exists reset_reason text;
alter table public.chiller_ota_devices add column if not exists protocol integer;
-- Empty private provisioning is deliberately fail-closed. No real secrets in migration.
create function public.chiller_firmware_operator() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from ch23_ota_private.operators where id=auth.uid())
$$;
revoke all on function public.chiller_firmware_operator() from public,anon;
-- RLS may evaluate this predicate for anon on unrelated buckets. It returns false
-- without a UID and reveals no operator list; private tables stay inaccessible.
grant execute on function public.chiller_firmware_operator() to anon,authenticated;

-- Restrictive boundaries defeat unrelated permissive Storage policies. Operators
-- can INSERT and SELECT only; immutable objects cannot be replaced after readback.
drop policy if exists chiller_firmware_private_boundary on storage.objects;
create policy chiller_firmware_read_boundary on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'chiller-firmware' or (auth.role()='authenticated' and public.chiller_firmware_operator()));
create policy chiller_firmware_insert_boundary on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'chiller-firmware' or (auth.role()='authenticated' and public.chiller_firmware_operator()
 and name ~ '^ESP32-CH[23]-PLC/[A-Za-z0-9._-]{1,48}/[0-9a-f]{64}[.]bin$'
 and split_part(name,'/',2) not in ('.','..')));
create policy chiller_firmware_update_boundary on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'chiller-firmware') with check(bucket_id<>'chiller-firmware');
create policy chiller_firmware_delete_boundary on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'chiller-firmware');
create policy chiller_firmware_operator_read on storage.objects for select to authenticated
 using(bucket_id='chiller-firmware' and public.chiller_firmware_operator());
create policy chiller_firmware_operator_insert on storage.objects for insert to authenticated
 with check(bucket_id='chiller-firmware' and public.chiller_firmware_operator());
do $$ begin
 if not exists(select 1 from storage.buckets where id='chiller-firmware' and not public and file_size_limit<=1310720)
 then raise exception 'Private bounded firmware bucket required'; end if;
end $$;

create function public.chiller_firmware_publish(p_device text,p_version text,p_sha256 text,p_size integer,p_storage_path text,p_verified_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.chiller_ota_releases; obj uuid;
begin
 if not public.chiller_firmware_operator() then raise exception 'Operator access denied'; end if;
 if p_device is null or p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC')
 or p_version is null or p_version !~ '^[A-Za-z0-9._-]{1,48}$' or p_version in ('.','..')
 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 256 and 1310720
 or p_storage_path is distinct from p_device||'/'||p_version||'/'||p_sha256||'.bin'
 or p_verified_sha256 is distinct from p_sha256 then raise exception 'Invalid release or unverified stored bytes'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714023);
 select id into obj from storage.objects where bucket_id='chiller-firmware' and name=p_storage_path
 and (metadata->>'size')::bigint=p_size;
 if obj is null then raise exception 'Stored object missing or size mismatch'; end if;
 select * into r from public.chiller_ota_releases where device=p_device and version=p_version;
 if r.id is not null then
  if r.sha256<>p_sha256 or r.size<>p_size or r.storage_path<>p_storage_path then raise exception 'Conflicting device/version'; end if;
  if not r.approved then raise exception 'Release revoked; administrative review required'; end if;
  return r.id;
 end if;
 insert into public.chiller_ota_releases(device,version,model,sha256,size,storage_path,approved)
 values(p_device,p_version,case p_device when 'ESP32-CH2-PLC' then 'CH2-WT32-ETH01-v1' else 'CH3-WT32-ETH01-v1' end,p_sha256,p_size,p_storage_path,true) returning * into r;
 -- Approved operator attests authenticated byte readback; SQL cannot hash Storage's
 -- external bytes. Never interpret this attestation as independent server hashing.
 insert into ch23_ota_private.verifications(release_id,operator_id,object_id,verified_sha256)
 values(r.id,auth.uid(),obj,p_verified_sha256);
 return r.id;
end $$;

create function public.chiller_firmware_unlock(p_device text,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare hashed text; token text;
begin
 if not public.chiller_firmware_operator() then return jsonb_build_object('error','access_denied'); end if;
 if p_device is null or p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC') then return jsonb_build_object('error','invalid_device'); end if;
 -- Return errors, do NOT raise: failed attempts must commit to enforce rate limit.
 if not public.chiller_ota_attempt(auth.uid(),p_device) then return jsonb_build_object('error','rate_limited'); end if;
 select code_hash into hashed from ch23_ota_private.config where singleton;
 if p_code is null or p_code !~ '^[0-9]{4}$' or hashed is null or extensions.crypt(p_code,hashed)<>hashed
 then return jsonb_build_object('error','invalid_code'); end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.chiller_ota_grants(token_hash,device,operator_id)
 values(encode(extensions.digest(token,'sha256'),'hex'),p_device,auth.uid());
 return jsonb_build_object('grant',token);
end $$;

-- Authenticated overload: caller cannot nominate another operator. Legacy five
-- argument service-role-only overload remains available to the old Edge handler.
create function public.chiller_ota_queue(p_device text,p_grant text,p_id uuid,p_release uuid,p_signed_url text,p_signed_url_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.chiller_ota_releases; existing public.chiller_ota_jobs; origin text; token text; claims jsonb; expiry timestamptz; job uuid;
begin
 if not public.chiller_firmware_operator() then raise exception 'Operator access denied'; end if;
 if p_id is null or p_release is null or p_device is null then raise exception 'Missing request identity'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714023);
 select * into existing from public.chiller_ota_jobs where id=p_id;
 if existing.id is not null then
  if existing.device<>p_device or existing.operator_id<>auth.uid() or existing.release_id<>p_release then raise exception 'Request id conflict'; end if;
  return p_id;
 end if;
 select * into r from public.chiller_ota_releases where id=p_release and device=p_device and approved;
 select c.origin into origin from ch23_ota_private.config c where singleton;
 if r.id is null or origin is null or p_signed_url is null or length(p_signed_url)>2048 or
 left(p_signed_url,length(origin||'/storage/v1/object/sign/chiller-firmware/'||r.storage_path||'?token='))
 is distinct from origin||'/storage/v1/object/sign/chiller-firmware/'||r.storage_path||'?token='
 then raise exception 'Invalid signed object URL'; end if;
 token=split_part(p_signed_url,'?token=',2);
 if token !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then raise exception 'Invalid URL token'; end if;
 token=translate(split_part(token,'.',2),'-_','+/');
 claims=convert_from(decode(rpad(token,((length(token)+3)/4)*4,'='),'base64'),'UTF8')::jsonb;
 expiry=to_timestamp((claims->>'exp')::bigint);
 -- Storage validates token signature on download; SQL validates scope/lifetime.
 if claims->>'url' is distinct from 'chiller-firmware/'||r.storage_path or expiry is null
 or p_signed_url_expires_at is null or expiry<>p_signed_url_expires_at
 or expiry<now()+interval '11 minutes' or expiry>now()+interval '31 minutes'
 then raise exception 'Signed URL scope or expiry invalid'; end if;
 if not exists(select 1 from ch23_ota_private.device_keys where device=p_device) then raise exception 'Device signing key not provisioned'; end if;
 job=public.chiller_ota_queue(auth.uid(),p_device,encode(extensions.digest(p_grant,'sha256'),'hex'),p_id,p_release);
 update public.chiller_ota_jobs set expires_at=least(expiry-interval '1 minute',now()+interval '20 minutes') where id=job;
 insert into ch23_ota_private.downloads values(job,p_signed_url,expiry);
 return job;
end $$;

create function public.chiller_firmware_status(p_device text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.chiller_firmware_operator() then raise exception 'Operator access denied'; end if;
 if p_device is null or p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC') then raise exception 'Invalid device'; end if;
 perform public.chiller_ota_expire(p_device);
 select jsonb_build_object(
 'device',(select to_jsonb(d) from public.chiller_ota_devices d where device=p_device),
 'releases',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from public.chiller_ota_releases r where device=p_device and approved),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j) order by created_at desc) from (select j.id,j.status,j.progress,j.failure,j.created_at,j.updated_at,jsonb_build_object('version',r.version) release from public.chiller_ota_jobs j join public.chiller_ota_releases r on r.id=j.release_id where j.device=p_device order by j.created_at desc limit 10) j),'[]'::jsonb),
 'last_successful_update',(select jsonb_build_object('updated_at',updated_at) from public.chiller_ota_jobs where device=p_device and status='completed' order by updated_at desc limit 1)) into result;
 return result;
end $$;

-- Only authenticated ingestion or the separately authenticated active report RPC
-- calls this private helper. No raw device table or signing key is exposed.
create function ch23_ota_private.exchange(p_device text,m jsonb,discover boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare response jsonb; manifest jsonb; signed text; secret text; canonical text; job uuid; state text; progress integer;
begin
 if m is null or octet_length(m::text)>1024 or m->>'protocol' is distinct from '2'
 or coalesce(m->>'version','') !~ '^[A-Za-z0-9._-]{1,48}$' or coalesce(m->>'boot','') !~ '^[0-9a-f]{32}$'
 or coalesce(m->>'job','') !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
 or coalesce(m->>'status','') not in ('idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')
 or coalesce(m->>'progress','') !~ '^(100|[0-9]{1,2})$' then raise exception 'Invalid device metadata'; end if;
 job=nullif(m->>'job','')::uuid;state=m->>'status';progress=(m->>'progress')::integer;
 if not discover and (job is null or not exists(select 1 from public.chiller_ota_jobs where id=job and device=p_device)) then raise exception 'Unknown device job'; end if;
 if state='failed' and m ? 'failure_code' then
  response=public.chiller_device_sync_diagnostic(p_device,m->>'version',m->>'boot',job,state,progress,m->>'failure_code');
 else response=public.chiller_device_sync(p_device,m->>'version',m->>'boot',job,state,progress); end if;
 update public.chiller_ota_devices set protocol=2,reset_reason=case when m->>'reset' in ('power_on','software','panic','interrupt_watchdog','task_watchdog','brownout','other') then m->>'reset' else 'other' end where device=p_device;
 manifest=response->'o';
 if discover and manifest is not null and manifest<>'null'::jsonb then
  select d.url,k.key into signed,secret from ch23_ota_private.downloads d cross join ch23_ota_private.device_keys k
  where d.job_id=(manifest->>'id')::uuid and k.device=p_device and d.expires_at>now()+interval '30 seconds';
  if signed is not null and secret is not null then
   manifest=(manifest-'path')||jsonb_build_object('url',signed);
   canonical=concat_ws('|',manifest->>'id','update',p_device,manifest->>'model',manifest->>'version',manifest->>'sha256',manifest->>'size',manifest->>'expires',signed);
   manifest=manifest||jsonb_build_object('mac',encode(extensions.hmac(canonical,secret,'sha256'),'hex'));
  else manifest=null; end if;
 else manifest=null; end if;
 response=jsonb_build_object('o',manifest)||case when response->>'a' in ('completed','failed') then jsonb_build_object('a',response->>'a') else '{}'::jsonb end;
 return response;
end $$;

create function public.chiller_ota_report(p_device text,p_secret text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_device is null or p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC') or not exists(
 select 1 from public.devices where device_code=p_device and device_secret=p_secret and coalesce(is_active,true)) then raise exception 'Invalid device credentials'; end if;
 return ch23_ota_private.exchange(p_device,p_metadata,false);
end $$;

-- Preserve the EXACT installed ingestion implementation, indexes, point mapping
-- and legacy receipt logic. Abort on reapplication rather than wrapping twice.
alter function public.ingest_ch2(jsonb) set schema ch23_ota_private;
alter function public.ingest_ch3(jsonb) set schema ch23_ota_private;
revoke all on function ch23_ota_private.ingest_ch2(jsonb),ch23_ota_private.ingest_ch3(jsonb) from public,anon,authenticated;
create function public.ingest_ch2(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original jsonb;
begin
 original=ch23_ota_private.ingest_ch2(payload);
 if payload->'gateway'->>'protocol' is distinct from '2' then return original; end if;
 if exists(select 1 from public.chiller_ota_receipts where device='ESP32-CH2-PLC' and received_at=now() and boot_id=payload->'gateway'->>'boot') then
  -- Bad OTA metadata/configuration must not roll back valid PLC ingestion.
  begin return ch23_ota_private.exchange('ESP32-CH2-PLC',payload->'gateway',true);
  exception when others then return jsonb_build_object('o',null); end;
 end if;
 return jsonb_build_object('o',null);
end $$;
create function public.ingest_ch3(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original jsonb;
begin
 original=ch23_ota_private.ingest_ch3(payload);
 if payload->'gateway'->>'protocol' is distinct from '2' then return original; end if;
 if exists(select 1 from public.chiller_ota_receipts where device='ESP32-CH3-PLC' and received_at=now() and boot_id=payload->'gateway'->>'boot') then
  begin return ch23_ota_private.exchange('ESP32-CH3-PLC',payload->'gateway',true);
  exception when others then return jsonb_build_object('o',null); end;
 end if;
 return jsonb_build_object('o',null);
end $$;

revoke all on all tables in schema ch23_ota_private from public,anon,authenticated;
revoke all on all functions in schema ch23_ota_private from public,anon,authenticated;
revoke all on function public.chiller_firmware_publish(text,text,text,integer,text,text),public.chiller_firmware_unlock(text,text),public.chiller_ota_queue(text,text,uuid,uuid,text,timestamptz),public.chiller_firmware_status(text) from public,anon;
grant execute on function public.chiller_firmware_publish(text,text,text,integer,text,text),public.chiller_firmware_unlock(text,text),public.chiller_ota_queue(text,text,uuid,uuid,text,timestamptz),public.chiller_firmware_status(text) to authenticated;
revoke all on function public.chiller_ota_report(text,text,jsonb),public.ingest_ch2(jsonb),public.ingest_ch3(jsonb) from public;
grant execute on function public.chiller_ota_report(text,text,jsonb),public.ingest_ch2(jsonb),public.ingest_ch3(jsonb) to anon,authenticated,service_role;
-- Raw metadata mutation remains forbidden; publication only through validated RPC.
revoke all on public.chiller_ota_releases from anon,authenticated;
notify pgrst, 'reload schema';
commit;
