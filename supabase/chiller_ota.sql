-- CH2/CH3 only. CH1 objects and telemetry frequency are unchanged.
begin;
create table if not exists public.chiller_ota_devices (
 device text primary key check(device in ('ESP32-CH2-PLC','ESP32-CH3-PLC')),
 version text not null, boot_id text not null, last_seen timestamptz not null default now()
);
create table if not exists public.chiller_ota_receipts (
 device text primary key check(device in ('ESP32-CH2-PLC','ESP32-CH3-PLC')),
 version text not null, boot_id text not null, job_id uuid,
 received_at timestamptz not null default now()
);
create table if not exists public.chiller_ota_releases (
 id uuid primary key default gen_random_uuid(),
 device text not null check(device in ('ESP32-CH2-PLC','ESP32-CH3-PLC')),
 version text not null check(version ~ '^[A-Za-z0-9._-]{1,48}$'),
 model text not null,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 size integer not null check(size between 1 and 1310720),
 storage_path text not null unique,
 approved boolean not null default false, created_at timestamptz not null default now(),
 unique(device,version), unique(id,device),
 check(model=case device when 'ESP32-CH2-PLC' then 'CH2-WT32-ETH01-v1' else 'CH3-WT32-ETH01-v1' end),
 check(storage_path=device||'/'||version||'/'||sha256||'.bin')
);
create table if not exists public.chiller_ota_grants (
 token_hash text primary key, device text not null, operator_id uuid not null,
 used boolean not null default false, expires_at timestamptz not null default now()+interval '5 minutes'
);
create table if not exists public.chiller_ota_attempts (
 operator_id uuid primary key, started_at timestamptz not null default now(), attempts integer not null default 0
);
create table if not exists public.chiller_ota_jobs (
 id uuid primary key, device text not null, operator_id uuid not null,
 release_id uuid not null, source_boot text not null,
 status text not null default 'authorized' check(status in ('authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')),
 progress integer not null default 0 check(progress between 0 and 100), failure text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 foreign key(release_id,device) references public.chiller_ota_releases(id,device)
);
create unique index if not exists chiller_ota_one_active on public.chiller_ota_jobs(device) where status not in ('completed','failed');
create index if not exists chiller_ota_recent on public.chiller_ota_jobs(device,created_at desc);
create table if not exists public.chiller_ota_events (
 id bigint generated always as identity primary key, device text, job_id uuid references public.chiller_ota_jobs(id),
 operator_id uuid, event text not null, created_at timestamptz not null default now()
);

create or replace function public.chiller_ota_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' or new.status is distinct from old.status then
  insert into public.chiller_ota_events(device,job_id,operator_id,event) values(new.device,new.id,new.operator_id,new.status);
 end if;
 return new;
end $$;
drop trigger if exists chiller_ota_audit on public.chiller_ota_jobs;
create trigger chiller_ota_audit after insert or update on public.chiller_ota_jobs for each row execute function public.chiller_ota_audit();
create or replace function public.chiller_ota_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (new.device,new.version,new.model,new.sha256,new.size,new.storage_path) is distinct from
    (old.device,old.version,old.model,old.sha256,old.size,old.storage_path) then raise exception 'Release metadata is immutable'; end if;
 return new;
end $$;
drop trigger if exists chiller_ota_immutable on public.chiller_ota_releases;
create trigger chiller_ota_immutable before update on public.chiller_ota_releases for each row execute function public.chiller_ota_immutable();

create or replace function public.chiller_ota_attempt(p_user uuid,p_device text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.chiller_ota_attempts(operator_id,attempts) values(p_user,1)
 on conflict(operator_id) do update set
  attempts=case when chiller_ota_attempts.started_at<now()-interval '15 minutes' then 1 else chiller_ota_attempts.attempts+1 end,
  started_at=case when chiller_ota_attempts.started_at<now()-interval '15 minutes' then now() else chiller_ota_attempts.started_at end returning attempts into n;
 insert into public.chiller_ota_events(device,operator_id,event) values(p_device,p_user,case when n<=5 then 'code_attempt' else 'code_rate_limited' end);
 delete from public.chiller_ota_grants where expires_at<=now();
 return n<=5;
end $$;

create or replace function public.chiller_ota_expire(p_device text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.chiller_ota_jobs set status='failed',failure='deadline_exceeded',updated_at=now()
 where device=p_device and status not in ('completed','failed') and expires_at<=now();
 update public.chiller_ota_jobs j set status='failed',failure='release_revoked',updated_at=now()
 where device=p_device and status not in ('completed','failed') and not exists(select 1 from public.chiller_ota_releases r where r.id=j.release_id and r.approved);
end $$;

create or replace function public.chiller_ota_queue(p_user uuid,p_device text,p_grant text,p_id uuid,p_release uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.chiller_ota_devices; existing public.chiller_ota_jobs; grant_user uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(714023);
 select * into existing from public.chiller_ota_jobs where id=p_id;
 if existing.id is not null then
  if existing.device<>p_device or existing.operator_id<>p_user or existing.release_id<>p_release then raise exception 'Request id conflict'; end if;
  return p_id;
 end if;
 update public.chiller_ota_grants set used=true where token_hash=p_grant and device=p_device and operator_id=p_user and not used and expires_at>now() returning operator_id into grant_user;
 if grant_user is null then raise exception 'Authorization expired or already used'; end if;
 perform public.chiller_ota_expire(p_device);
 select * into d from public.chiller_ota_devices where device=p_device and last_seen>now()-interval '45 seconds';
 if d.device is null or not exists(select 1 from public.chiller_ota_receipts r where r.device=p_device and r.boot_id=d.boot_id and r.version=d.version and r.received_at>now()-interval '45 seconds') then raise exception 'Device offline or telemetry unavailable'; end if;
 if not exists(select 1 from public.chiller_ota_releases where id=p_release and device=p_device and approved and version<>d.version) then raise exception 'Release unavailable for device'; end if;
 insert into public.chiller_ota_jobs(id,device,operator_id,release_id,source_boot) values(p_id,p_device,p_user,p_release,d.boot_id);
 return p_id;
end $$;

create or replace function public.chiller_device_sync(p_device text,p_version text,p_boot text,p_job uuid,p_status text,p_progress integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.chiller_ota_jobs; manifest jsonb; ack text; old_rank integer; new_rank integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(714023);
 if p_device not in ('ESP32-CH2-PLC','ESP32-CH3-PLC') or p_version !~ '^[A-Za-z0-9._-]{1,48}$' or p_boot !~ '^[0-9a-f]{32}$' or p_progress not between 0 and 100 then raise exception 'Invalid device report'; end if;
 insert into public.chiller_ota_devices(device,version,boot_id) values(p_device,p_version,p_boot)
 on conflict(device) do update set version=excluded.version,boot_id=excluded.boot_id,last_seen=now();
 perform public.chiller_ota_expire(p_device);
 select * into j from public.chiller_ota_jobs where id=p_job and device=p_device for update;
 if j.id is not null and j.status not in ('completed','failed') then
  old_rank=array_position(array['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry'],j.status);
  new_rank=array_position(array['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry'],p_status);
  if p_status='failed' then
   update public.chiller_ota_jobs set status='failed',failure='device_reported_failure',updated_at=now() where id=j.id;
  elsif new_rank>=old_rank and ((p_boot=j.source_boot and p_status<>'waiting_for_telemetry') or
   (p_boot<>j.source_boot and p_status='waiting_for_telemetry' and exists(select 1 from public.chiller_ota_releases where id=j.release_id and version=p_version))) then
   update public.chiller_ota_jobs set status=p_status,progress=greatest(progress,p_progress),updated_at=now() where id=j.id;
  end if;
  if exists(select 1 from public.chiller_ota_jobs where id=j.id and status='waiting_for_telemetry') and p_boot<>j.source_boot and exists(
   select 1 from public.chiller_ota_receipts t join public.chiller_ota_releases r on r.id=j.release_id and r.device=t.device
   where t.device=p_device and t.version=p_version and r.version=p_version and t.boot_id=p_boot and t.job_id=j.id
   and t.received_at>=j.created_at and t.received_at>now()-interval '45 seconds'
  ) then update public.chiller_ota_jobs set status='completed',progress=100,updated_at=now() where id=j.id; end if;
 end if;
 select status into ack from public.chiller_ota_jobs where id=p_job and device=p_device;
 select jsonb_build_object('id',jobs.id,'action','update','device',jobs.device,'expires',floor(extract(epoch from jobs.expires_at))::bigint,
  'version',r.version,'sha256',r.sha256,'size',r.size,'path',r.storage_path,'model',r.model) into manifest
 from public.chiller_ota_jobs jobs join public.chiller_ota_releases r on r.id=jobs.release_id and r.device=jobs.device
 where jobs.device=p_device and jobs.status='authorized' and jobs.expires_at>now() and r.approved order by jobs.created_at limit 1;
 return jsonb_build_object('device',p_device,'o',manifest,'a',ack);
end $$;

-- Called only by authenticated ingestion after its actual fifteen current points were saved.
-- This is one overwriteable receipt per device, never telemetry history.
create or replace function public.chiller_ota_record_telemetry(p_device text,p_metadata jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then return; end if;
 if coalesce(p_metadata->>'version','') !~ '^[A-Za-z0-9._-]{1,48}$' or coalesce(p_metadata->>'boot','') !~ '^[0-9a-f]{32}$' then return; end if;
 if coalesce(p_metadata->>'job','')<>'' and p_metadata->>'job' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
 insert into public.chiller_ota_receipts(device,version,boot_id,job_id)
 values(p_device,p_metadata->>'version',p_metadata->>'boot',nullif(p_metadata->>'job','')::uuid)
 on conflict(device) do update set version=excluded.version,boot_id=excluded.boot_id,job_id=excluded.job_id,received_at=now();
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['chiller_ota_devices','chiller_ota_receipts','chiller_ota_releases','chiller_ota_grants','chiller_ota_attempts','chiller_ota_jobs','chiller_ota_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'chiller_ota_%' or p.proname='chiller_device_sync') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant usage,select on sequence public.chiller_ota_events_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('chiller-firmware','chiller-firmware',false,1310720) on conflict(id) do nothing;
do $$ begin if exists(select 1 from storage.buckets where id='chiller-firmware' and public) then raise exception 'Firmware bucket must remain private'; end if; end $$;
drop policy if exists chiller_firmware_private_boundary on storage.objects;
create policy chiller_firmware_private_boundary on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'chiller-firmware') with check(bucket_id<>'chiller-firmware');
CREATE OR REPLACE FUNCTION public.ingest_ch2(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_device_code   text;
    v_device_secret text;
    v_asset_code    text := 'CH-NJ-02';
    v_device_ok     boolean;
    r               jsonb;
    v_point_code    text;
    v_point_name    text;
    v_value_number  numeric;
    v_value_boolean boolean;
    v_raw_register  integer;
    v_raw_value     numeric;
BEGIN
    v_device_code   := payload->>'device_code';
    v_device_secret := payload->>'device_secret';

    SELECT EXISTS (
        SELECT 1
        FROM devices d
        WHERE d.device_code = v_device_code
          AND d.device_code = 'ESP32-CH2-PLC'
          AND d.device_secret = v_device_secret
          AND COALESCE(d.is_active, true) = true
    )
    INTO v_device_ok;

    IF NOT v_device_ok THEN
        RAISE EXCEPTION 'ingest_ch2: invalid device credentials for %', v_device_code;
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(payload->'readings')
    LOOP
        v_point_code := r->>'point_code';

        IF v_point_code IS NULL OR v_point_code NOT IN ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F') THEN
            CONTINUE;
        END IF;

        v_value_number := NULL;
        v_value_boolean := NULL;
        v_raw_register := NULL;
        v_raw_value := NULL;

        IF r ? 'value_number' AND COALESCE(r->>'value_number', '') <> '' THEN
            v_value_number := (r->>'value_number')::numeric;
        END IF;

        IF r ? 'value_boolean' AND COALESCE(r->>'value_boolean', '') <> '' THEN
            v_value_boolean := (r->>'value_boolean')::boolean;
        END IF;

        IF v_point_code ~ '^CH2_R[0-9]+$' THEN
            v_raw_register := replace(v_point_code, 'CH2_R', '')::integer;
            v_raw_value := v_value_number;
        END IF;

        SELECT pm.point_name
        INTO v_point_name
        FROM ch2_point_map pm
        WHERE pm.point_code = v_point_code
        LIMIT 1;

        IF v_point_name IS NULL THEN
            v_point_name := v_point_code;
        END IF;

        DELETE FROM ch2_latest
        WHERE asset_code = v_asset_code
          AND device_code = v_device_code
          AND point_code = v_point_code;

        INSERT INTO ch2_latest (
            asset_code,
            device_code,
            point_code,
            point_name,
            value_number,
            value_boolean,
            raw_register,
            raw_value,
            updated_at
        )
        VALUES (
            v_asset_code,
            v_device_code,
            v_point_code,
            v_point_name,
            v_value_number,
            v_value_boolean,
            v_raw_register,
            v_raw_value,
            now()
        );
    END LOOP;

    -- Receipt is bound to this authenticated device and rows actually written in this transaction.
    IF (SELECT count(*) FROM public.ch2_latest WHERE device_code=v_device_code
        AND updated_at=now() AND point_code IN ('CH2_R40023','CH2_R40024','CH2_R40025','CH2_R40051','CH2_R40052','CH2_R40056','CH2_R40057','CH2_R40061','CH2_SYSTEM_RUNNING','CH2_COMP_1A_ENABLED','CH2_COMP_1B_ENABLED','CH2_COMP_1C_ENABLED','CH2_COMP_2A_ENABLED','CH2_COMP_2B_ENABLED','CH2_COMP_2C_ENABLED')) = 15 THEN
        PERFORM public.chiller_ota_record_telemetry(v_device_code,payload->'gateway');
    END IF;

    RETURN jsonb_build_object('ok', true, 'asset_code', v_asset_code, 'device_code', v_device_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_ch3(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_device_code   text;
    v_device_secret text;
    v_asset_code    text := 'CH-NJ-03';
    v_device_ok     boolean;
    r               jsonb;
    v_point_code    text;
    v_point_name    text;
    v_value_number  numeric;
    v_value_boolean boolean;
    v_raw_register  integer;
    v_raw_value     numeric;
BEGIN
    v_device_code   := payload->>'device_code';
    v_device_secret := payload->>'device_secret';

    SELECT EXISTS (
        SELECT 1
        FROM devices d
        WHERE d.device_code = v_device_code
          AND d.device_code = 'ESP32-CH3-PLC'
          AND d.device_secret = v_device_secret
          AND COALESCE(d.is_active, true) = true
    )
    INTO v_device_ok;

    IF NOT v_device_ok THEN
        RAISE EXCEPTION 'ingest_ch3: invalid device credentials for %', v_device_code;
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(payload->'readings')
    LOOP
        v_point_code := r->>'point_code';

        IF v_point_code IS NULL OR v_point_code NOT IN ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F') THEN
            CONTINUE;
        END IF;

        v_value_number := NULL;
        v_value_boolean := NULL;
        v_raw_register := NULL;
        v_raw_value := NULL;

        IF r ? 'value_number' AND COALESCE(r->>'value_number', '') <> '' THEN
            v_value_number := (r->>'value_number')::numeric;
        END IF;

        IF r ? 'value_boolean' AND COALESCE(r->>'value_boolean', '') <> '' THEN
            v_value_boolean := (r->>'value_boolean')::boolean;
        END IF;

        IF v_point_code ~ '^CH2_R[0-9]+$' THEN
            v_raw_register := replace(v_point_code, 'CH2_R', '')::integer;
            v_raw_value := v_value_number;
        END IF;

        SELECT pm.point_name
        INTO v_point_name
        FROM ch3_point_map pm
        WHERE pm.point_code = v_point_code
        LIMIT 1;

        IF v_point_name IS NULL THEN
            v_point_name := v_point_code;
        END IF;

        DELETE FROM ch3_latest
        WHERE asset_code = v_asset_code
          AND device_code = v_device_code
          AND point_code = v_point_code;

        INSERT INTO ch3_latest (
            asset_code,
            device_code,
            point_code,
            point_name,
            value_number,
            value_boolean,
            raw_register,
            raw_value,
            updated_at
        )
        VALUES (
            v_asset_code,
            v_device_code,
            v_point_code,
            v_point_name,
            v_value_number,
            v_value_boolean,
            v_raw_register,
            v_raw_value,
            now()
        );
    END LOOP;

    -- Receipt is bound to this authenticated device and rows actually written in this transaction.
    IF (SELECT count(*) FROM public.ch3_latest WHERE device_code=v_device_code
        AND updated_at=now() AND point_code IN ('CH2_R40023','CH2_R40024','CH2_R40025','CH2_R40051','CH2_R40052','CH2_R40056','CH2_R40057','CH2_R40061','CH2_SYSTEM_RUNNING','CH2_COMP_1A_ENABLED','CH2_COMP_1B_ENABLED','CH2_COMP_1C_ENABLED','CH2_COMP_2A_ENABLED','CH2_COMP_2B_ENABLED','CH2_COMP_2C_ENABLED')) = 15 THEN
        PERFORM public.chiller_ota_record_telemetry(v_device_code,payload->'gateway');
    END IF;

    RETURN jsonb_build_object('ok', true, 'asset_code', v_asset_code, 'device_code', v_device_code);
END;
$function$;

commit;
