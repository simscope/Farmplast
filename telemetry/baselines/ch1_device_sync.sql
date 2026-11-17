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
end $function$
