-- Additive migration. Keep the legacy CH1 Edge/RPC path until physical migration passes.
begin;
create schema ch1_private;
revoke all on schema ch1_private from public,anon,authenticated;
create table ch1_private.config (
 singleton boolean primary key default true check(singleton),
 origin text not null check(origin ~ '^https://[a-z0-9]+[.]supabase[.]co$'),
 code_hash text not null check(code_hash ~ '^\$2[aby]\$1[2-6]\$'),
 device_key text not null check(length(device_key)>=32)
);
create table ch1_private.operators(id uuid primary key);
create table ch1_private.downloads(job_id uuid primary key references public.ch1_ota_jobs(id),url text not null,expires_at timestamptz not null);
create table ch1_private.verifications(release_id uuid primary key references public.ch1_ota_releases(id),operator_id uuid not null,object_id uuid not null,verified_sha256 text not null,verified_at timestamptz not null default now());
alter table public.ch1_ota_device add column protocol integer;

create function public.ch1_firmware_operator() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from ch1_private.operators where id=auth.uid())
$$;
revoke all on function public.ch1_firmware_operator() from public;
grant execute on function public.ch1_firmware_operator() to anon,authenticated;

drop policy ch1_firmware_private_boundary on storage.objects;
create policy ch1_firmware_read_boundary on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'ch1-firmware' or (auth.role()='authenticated' and public.ch1_firmware_operator()));
create policy ch1_firmware_insert_boundary on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'ch1-firmware' or (auth.role()='authenticated' and public.ch1_firmware_operator()
 and name ~ '^ESP32-CH1/[A-Za-z0-9._-]{1,48}/[0-9a-f]{64}[.]bin$' and split_part(name,'/',2) not in ('.','..')));
create policy ch1_firmware_update_boundary on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'ch1-firmware') with check(bucket_id<>'ch1-firmware');
create policy ch1_firmware_delete_boundary on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'ch1-firmware');
create policy ch1_firmware_operator_read on storage.objects for select to authenticated using(bucket_id='ch1-firmware' and public.ch1_firmware_operator());
create policy ch1_firmware_operator_insert on storage.objects for insert to authenticated with check(bucket_id='ch1-firmware' and public.ch1_firmware_operator());

create function public.ch1_firmware_unlock(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare hashed text; token text;
begin
 if not public.ch1_firmware_operator() then return jsonb_build_object('error','access_denied'); end if;
 if not public.ch1_ota_attempt(auth.uid()) then return jsonb_build_object('error','rate_limited'); end if;
 select code_hash into hashed from ch1_private.config where singleton;
 if p_code is null or p_code !~ '^[0-9]{4}$' or hashed is null or extensions.crypt(p_code,hashed)<>hashed then return jsonb_build_object('error','invalid_code'); end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.ch1_ota_grants(token_hash,operator_id) values(encode(extensions.digest(token,'sha256'),'hex'),auth.uid());
 return jsonb_build_object('grant',token);
end $$;

create function public.ch1_command(p_id uuid,p_type text,p_value jsonb,p_pin text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare patch jsonb; hashed text; n numeric;
begin
 if not public.ch1_firmware_operator() then return jsonb_build_object('error','access_denied'); end if;
 if p_id is null then raise exception 'Request identity required'; end if;
 case
 when p_type='fan_mode' and p_value in ('"auto"'::jsonb,'"manual"'::jsonb) then patch=jsonb_build_object('auto',p_value='"auto"'::jsonb);
 when p_type='fan_off' then patch='{"auto":false,"fan_enable":false,"fan_30":false,"fan_60":false}';
 when p_type='fan_speed' and p_value in ('30'::jsonb,'60'::jsonb,'"30"'::jsonb,'"60"'::jsonb) then patch=jsonb_build_object('auto',false,'fan_enable',true,'fan_30',(p_value#>>'{}')::int=30,'fan_60',(p_value#>>'{}')::int=60);
 when p_type in ('fan_setpoint','d1','d2','hyst') and jsonb_typeof(p_value) in ('number','string') then
  n=(p_value#>>'{}')::numeric;
  if n='NaN'::numeric or n not between (case when p_type='fan_setpoint' then -100 else 0 end) and (case when p_type='fan_setpoint' then 300 else 100 end) then raise exception 'Invalid threshold'; end if;
  patch=jsonb_build_object(case when p_type='fan_setpoint' then 'setpoint' else p_type end,n);
 when p_type='reset_alert' then
  -- Failed PIN attempts return normally so the rate-limit record commits.
  if not public.ch1_ota_attempt(auth.uid()) then return jsonb_build_object('error','rate_limited'); end if;
  select code_hash into hashed from ch1_private.config where singleton;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or hashed is null or extensions.crypt(p_pin,hashed)<>hashed then return jsonb_build_object('error','invalid_code'); end if;
  patch='{"reset":true}';
 else raise exception 'Invalid command';
 end case;
 return jsonb_build_object('command',public.ch1_control_request(auth.uid(),p_id,p_type,patch));
end $$;

create function public.ch1_firmware_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.ch1_firmware_operator() then raise exception 'Operator access denied'; end if;
 perform public.ch1_control_reconcile();
 update public.ch1_ota_jobs set status='failed',failure='deadline_exceeded',updated_at=now() where status not in ('completed','failed') and expires_at<=now();
 return jsonb_build_object(
 'device',(select to_jsonb(d) from public.ch1_ota_device d where id='ESP32-CH1'),
 'desired',(select jsonb_build_object('values',values,'revision',revision,'updated_at',updated_at) from public.ch1_desired_state where id='ESP32-CH1'),
 'commands',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,command_type,requested,revision,status,created_at,expires_at,applied_at from public.ch1_control_commands order by created_at desc limit 5)c),'[]'::jsonb),
 'releases',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,version,size,sha256,storage_path,model from public.ch1_ota_releases where approved order by created_at desc limit 20)r),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from (select j.id,j.release_id,j.status,j.progress,j.failure,j.created_at,j.updated_at,j.expires_at,jsonb_build_object('version',r.version) release from public.ch1_ota_jobs j join public.ch1_ota_releases r on r.id=j.release_id order by j.created_at desc limit 5)j),'[]'::jsonb),
 'last_successful_update',(select jsonb_build_object('updated_at',updated_at) from public.ch1_ota_jobs where status='completed' order by updated_at desc limit 1));
end $$;

create function public.ch1_firmware_publish(p_version text,p_sha256 text,p_size integer,p_storage_path text,p_verified_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ch1_ota_releases; obj uuid;
begin
 if not public.ch1_firmware_operator() then raise exception 'Operator access denied'; end if;
 if p_version is null or p_version !~ '^[A-Za-z0-9._-]{1,48}$' or p_version in ('.','..')
 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_size is null or p_size not between 256 and 1245184
 or p_storage_path is distinct from 'ESP32-CH1/'||p_version||'/'||p_sha256||'.bin'
 or p_verified_sha256 is distinct from p_sha256 then raise exception 'Invalid release or unverified bytes'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714001);
 select id into obj from storage.objects where bucket_id='ch1-firmware' and name=p_storage_path and (metadata->>'size')::bigint=p_size;
 if obj is null then raise exception 'Stored object missing or size mismatch'; end if;
 select * into r from public.ch1_ota_releases where version=p_version;
 if r.id is not null then
  if r.sha256<>p_sha256 or r.size<>p_size or r.storage_path<>p_storage_path or not r.approved then raise exception 'Conflicting or revoked release'; end if;
  return r.id;
 end if;
 insert into public.ch1_ota_releases(version,model,sha256,size,storage_path,approved) values(p_version,'CH1-ESP32S3-v1',p_sha256,p_size,p_storage_path,true) returning * into r;
 insert into ch1_private.verifications(release_id,operator_id,object_id,verified_sha256) values(r.id,auth.uid(),obj,p_verified_sha256);
 return r.id;
end $$;

create function public.ch1_firmware_queue(p_grant text,p_id uuid,p_release uuid,p_signed_url text,p_signed_url_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ch1_ota_releases; existing public.ch1_ota_jobs; origin text; token text; claims jsonb; expiry timestamptz; job uuid;
begin
 if not public.ch1_firmware_operator() then raise exception 'Operator access denied'; end if;
 if p_id is null or p_release is null then raise exception 'Missing identity'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714001);
 select * into existing from public.ch1_ota_jobs where id=p_id;
 if existing.id is not null then
  if existing.operator_id<>auth.uid() or existing.release_id<>p_release then raise exception 'Request id conflict'; end if;
  return p_id;
 end if;
 select * into r from public.ch1_ota_releases where id=p_release and approved;
 select c.origin into origin from ch1_private.config c where singleton;
 if r.id is null or origin is null or p_signed_url is null or length(p_signed_url)>2048
 or left(p_signed_url,length(origin||'/storage/v1/object/sign/ch1-firmware/'||r.storage_path||'?token='))
 is distinct from origin||'/storage/v1/object/sign/ch1-firmware/'||r.storage_path||'?token=' then raise exception 'Invalid signed object URL'; end if;
 token=split_part(p_signed_url,'?token=',2);
 if token !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then raise exception 'Invalid URL token'; end if;
 token=translate(split_part(token,'.',2),'-_','+/');
 claims=convert_from(decode(rpad(token,((length(token)+3)/4)*4,'='),'base64'),'UTF8')::jsonb;
 expiry=to_timestamp((claims->>'exp')::bigint);
 if claims->>'url' is distinct from 'ch1-firmware/'||r.storage_path or expiry is null or p_signed_url_expires_at is null
 or expiry<>p_signed_url_expires_at or expiry<now()+interval '11 minutes' or expiry>now()+interval '31 minutes' then raise exception 'Signed URL scope or expiry invalid'; end if;
 job=public.ch1_ota_queue(auth.uid(),encode(extensions.digest(p_grant,'sha256'),'hex'),p_id,p_release);
 -- Preserve CH1's ten-minute HMAC manifest and original firmware decoder limit.
 insert into ch1_private.downloads values(job,p_signed_url,expiry);
 return job;
end $$;

create function ch1_private.exchange(m jsonb,discover boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare response jsonb; manifest jsonb; secret text; signed text; canonical text; job uuid;
begin
 if m is null or octet_length(m::text)>1024 or m->>'protocol' is distinct from '2'
 or coalesce(m->>'version','') !~ '^[A-Za-z0-9._-]{1,48}$' or coalesce(m->>'boot','') !~ '^[0-9a-f]{32}$'
 or coalesce(m->>'job','') !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
 or coalesce(m->>'status','') not in ('idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')
 or coalesce(m->>'progress','') !~ '^(100|[0-9]{1,2})$' then raise exception 'Invalid metadata'; end if;
 job=nullif(m->>'job','')::uuid;
 if not discover and (job is null or not exists(select 1 from public.ch1_ota_jobs where id=job)) then raise exception 'Unknown job'; end if;
 response=public.ch1_device_sync(m->>'version',m->>'boot',job,m->>'status',(m->>'progress')::int);
 update public.ch1_ota_device set protocol=2 where id='ESP32-CH1';
 manifest=response->'o';
 if discover and manifest is not null and manifest<>'null'::jsonb then
  select url into signed from ch1_private.downloads where job_id=(manifest->>'id')::uuid and expires_at>now();
  select device_key into secret from ch1_private.config where singleton;
  if signed is null or secret is null then raise exception 'Download not provisioned'; end if;
  canonical=(manifest->>'id')||'|update|CH1-ESP32S3-v1|'||(manifest->>'version')||'|'||(manifest->>'sha256')||'|'||(manifest->>'size')||'|'||(manifest->>'expires');
  response=jsonb_set(response,'{o}',(manifest-'path')||jsonb_build_object('url',signed,'mac',encode(extensions.hmac(canonical,secret,'sha256'),'hex')));
 else response=response-'o'; end if;
 return response;
end $$;

create function public.ingest_ch1(p_key text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret text; row jsonb; pid uuid; m jsonb; result jsonb;
begin
 select device_key into secret from ch1_private.config where singleton;
 if secret is null or p_key is null or extensions.digest(p_key,'sha256')<>extensions.digest(secret,'sha256') then raise exception 'Device authentication failed'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 19 or octet_length(p_rows::text)>32768 then raise exception 'Invalid telemetry'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714001);
 for row in select value from jsonb_array_elements(p_rows) loop
  pid=(row->>'point_id')::uuid;
  if row->>'asset_id' is distinct from '4327afc7-a56b-4253-97c9-3de3632fb189'
  or row->>'device_id' is distinct from 'db7a7808-8ceb-407a-bfbf-c215e42ffb93'
  or not exists(select 1 from public.v_asset_points_latest where asset_code='CH-NJ-01' and point_id=pid)
  then raise exception 'Wrong telemetry target'; end if;
  if pid='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid then m=row->'raw_payload'->'gateway'; end if;
  insert into public.telemetry_latest(point_id,asset_id,device_id,value_number,value_boolean,value_text,quality,source_timestamp,updated_at,raw_payload)
  values(pid,(row->>'asset_id')::uuid,(row->>'device_id')::uuid,(row->>'value_number')::double precision,(row->>'value_boolean')::boolean,row->>'value_text',row->>'quality',(row->>'source_timestamp')::timestamptz,now(),row->'raw_payload')
  on conflict(point_id) do update set asset_id=excluded.asset_id,device_id=excluded.device_id,value_number=excluded.value_number,value_boolean=excluded.value_boolean,value_text=excluded.value_text,quality=excluded.quality,source_timestamp=excluded.source_timestamp,updated_at=excluded.updated_at,raw_payload=excluded.raw_payload;
 end loop;
 result=ch1_private.exchange(m,true);
 return result;
end $$;

-- Active-transfer reports only: no idle timer and no synthetic telemetry writes.
create function public.ch1_ota_report(p_key text,p_gateway jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 select device_key into secret from ch1_private.config where singleton;
 if secret is null or p_key is null or extensions.digest(p_key,'sha256')<>extensions.digest(secret,'sha256') then raise exception 'Device authentication failed'; end if;
 return ch1_private.exchange(p_gateway,false);
end $$;

revoke all on all functions in schema ch1_private from public,anon,authenticated;
revoke all on function public.ch1_firmware_unlock(text),public.ch1_command(uuid,text,jsonb,text),public.ch1_firmware_status(),public.ingest_ch1(text,jsonb),public.ch1_ota_report(text,jsonb) from public,anon,authenticated;
grant execute on function public.ch1_firmware_unlock(text),public.ch1_command(uuid,text,jsonb,text),public.ch1_firmware_status() to authenticated;
grant execute on function public.ingest_ch1(text,jsonb),public.ch1_ota_report(text,jsonb) to anon,authenticated;
revoke all on function public.ch1_firmware_publish(text,text,integer,text,text),public.ch1_firmware_queue(text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ch1_firmware_publish(text,text,integer,text,text),public.ch1_firmware_queue(text,uuid,uuid,text,timestamptz) to authenticated;
commit;
