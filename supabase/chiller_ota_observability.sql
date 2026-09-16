-- Additive audit only. No historical backfill. Apply before the updated Edge Function.
begin;
create unique index if not exists chiller_ota_observation_once on public.chiller_ota_events(job_id,event)
 where event in ('manifest_selected','manifest_signed_and_returned','device_report_authorized','device_report_downloading','device_report_verifying','device_report_installing','device_report_rebooting','device_report_waiting_for_telemetry','device_report_failed');
create or replace function public.chiller_ota_observe(p_device text,p_job uuid,p_event text)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.chiller_ota_jobs;
begin
 if p_event is null or not(p_event=any(array['manifest_selected','manifest_signed_and_returned','device_report_authorized','device_report_downloading','device_report_verifying','device_report_installing','device_report_rebooting','device_report_waiting_for_telemetry','device_report_failed'])) then raise exception 'Invalid observation'; end if;
 select * into j from public.chiller_ota_jobs where id=p_job and device=p_device for update;
 if j.id is null or j.status in ('completed','failed') or j.expires_at<=now() then return; end if;
 if p_event like 'manifest_%' and (j.status<>'authorized' or not exists(select 1 from public.chiller_ota_releases where id=j.release_id and device=p_device and approved)) then return; end if;
 if p_event='manifest_signed_and_returned' and not exists(select 1 from public.chiller_ota_events where job_id=p_job and device=p_device and event='manifest_selected') then return; end if;
 insert into public.chiller_ota_events(device,job_id,event) values(p_device,p_job,p_event) on conflict do nothing;
end $$;
revoke all on function public.chiller_ota_observe(text,uuid,text) from public,anon,authenticated;
grant execute on function public.chiller_ota_observe(text,uuid,text) to service_role;

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
 select jsonb_build_object('id',jobs.id,'action','update','device',jobs.device,'expires',floor(extract(epoch from jobs.expires_at))::bigint,
  'version',r.version,'sha256',r.sha256,'size',r.size,'path',r.storage_path,'model',r.model) into manifest
 from public.chiller_ota_jobs jobs join public.chiller_ota_releases r on r.id=jobs.release_id and r.device=jobs.device
 where jobs.device=p_device and jobs.status='authorized' and jobs.expires_at>now() and r.approved order by jobs.created_at limit 1;
 if manifest is not null then
  perform public.chiller_ota_observe(p_device,(manifest->>'id')::uuid,'manifest_selected');
 end if;
 return jsonb_build_object('device',p_device,'o',manifest,'a',ack);
end $$;


commit;
