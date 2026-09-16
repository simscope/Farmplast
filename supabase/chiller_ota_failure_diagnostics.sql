-- PREPARED ONLY. Do not apply until separately reviewed. No firmware release accompanies this.
-- Preserve the existing six-argument RPC for installed devices. No RLS/Storage/auth change.
begin;
create or replace function public.chiller_device_sync_diagnostic(
 p_device text,p_version text,p_boot text,p_job uuid,p_status text,p_progress integer,p_failure_code text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; changed integer; was_active boolean;
begin
 if p_status is distinct from 'failed' or p_job is null or p_failure_code is null or not (p_failure_code=any(array[
  'stage_sync_failed','state_save_failed','slot_invalid','job_expired','download_begin_failed',
  'download_http_status','download_size_mismatch','ota_begin_failed','download_timeout','ota_write_failed',
  'sha256_mismatch','version_marker_missing','device_marker_missing','ota_end_failed','boot_partition_failed',
  'interrupted_update','telemetry_timeout'
 ])) then raise exception 'Invalid failure code'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714023);
 select status not in ('completed','failed') into was_active from public.chiller_ota_jobs where id=p_job and device=p_device for update;
 result=public.chiller_device_sync(p_device,p_version,p_boot,p_job,p_status,p_progress);
 -- Attach the first safe reason only; no cross-device update, terminal success rewrite or repeated events.
 update public.chiller_ota_jobs set failure=p_failure_code
 where was_active and id=p_job and device=p_device and status='failed' and failure='device_reported_failure';
 get diagnostics changed = row_count;
 if changed=1 then
  insert into public.chiller_ota_events(device,job_id,event) values(p_device,p_job,'failure_code:'||p_failure_code);
 end if;
 return result;
end $$;
revoke all on function public.chiller_device_sync_diagnostic(text,text,text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.chiller_device_sync_diagnostic(text,text,text,uuid,text,integer,text) to service_role;
commit;
