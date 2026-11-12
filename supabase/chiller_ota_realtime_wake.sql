-- Apply after observability and failure diagnostics; no telemetry schema/ingest changes.
begin;
alter table public.chiller_ota_jobs add column if not exists dispatched_at timestamptz;
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
 select r.device,r.version,r.boot_id,r.received_at into d from public.chiller_ota_receipts r where r.device=p_device and r.received_at>now()-interval '45 seconds';
 if d.device is null or not exists(select 1 from public.chiller_ota_devices where device=p_device) or not exists(select 1 from public.chiller_ota_receipts r where r.device=p_device and r.boot_id=d.boot_id and r.version=d.version and r.received_at>now()-interval '45 seconds') then raise exception 'Device offline or telemetry unavailable'; end if;
 if not exists(select 1 from public.chiller_ota_releases where id=p_release and device=p_device and approved and version<>d.version) then raise exception 'Release unavailable for device'; end if;
 insert into public.chiller_ota_jobs(id,device,operator_id,release_id,source_boot,expires_at) values(p_id,p_device,p_user,p_release,d.boot_id,now()+interval '70 minutes');
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
  if p_status=any(array['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','failed']) then
   perform public.chiller_ota_observe(p_device,j.id,'device_report_'||p_status);
  end if;
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
 -- Start the existing ten-minute install budget only on authenticated discovery.
 update public.chiller_ota_jobs set dispatched_at=now(),expires_at=least(expires_at,now()+interval '10 minutes')
 where device=p_device and status='authorized' and dispatched_at is null and expires_at>now();
 select jsonb_build_object('id',jobs.id,'action','update','device',jobs.device,'expires',floor(extract(epoch from jobs.expires_at))::bigint,
  'version',r.version,'sha256',r.sha256,'size',r.size,'path',r.storage_path,'model',r.model) into manifest
 from public.chiller_ota_jobs jobs join public.chiller_ota_releases r on r.id=jobs.release_id and r.device=jobs.device
 where jobs.device=p_device and jobs.status='authorized' and jobs.expires_at>now() and r.approved order by jobs.created_at limit 1;
 if manifest is not null then
  perform public.chiller_ota_observe(p_device,(manifest->>'id')::uuid,'manifest_selected');
 end if;
 return jsonb_build_object('device',p_device,'o',manifest,'a',ack);
end $$;


-- The queue transaction must finish before the Edge handler claims/publishes a wake.
create unique index if not exists chiller_ota_wake_once on public.chiller_ota_events(job_id,event) where event='wake_claimed';
create or replace function public.chiller_ota_claim_wake(p_device text,p_job uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed integer;
begin
 insert into public.chiller_ota_events(device,job_id,event)
 select device,id,'wake_claimed' from public.chiller_ota_jobs
 where device=p_device and id=p_job and status='authorized' and expires_at>now()
 on conflict do nothing;
 get diagnostics claimed=row_count;
 return claimed=1;
end $$;
revoke all on function public.chiller_ota_claim_wake(text,uuid) from public,anon,authenticated;
grant execute on function public.chiller_ota_claim_wake(text,uuid) to service_role;
commit;
