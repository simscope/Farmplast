-- Apply after local control/display acceptance and explicit acceptance of the
-- CH3 USB limitation: telemetry works on MSI-1, future OTA needs USB MSI-2 first.
-- Delete Storage objects/buckets through Storage API, never SQL.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
 if not exists(select 1 from nj_msi_private.ch1_receipt where version='ch1-msi-2')
 or not exists(select 1 from public.chiller_ota_receipts where device='ESP32-CH2-PLC' and version='ch2-msi-2')
 or not exists(select 1 from public.ch1_ota_jobs j join public.ch1_ota_releases r on r.id=j.release_id where r.version='ch1-msi-2' and j.status='completed' and j.source_boot<>(select boot_id from nj_msi_private.ch1_receipt))
 or not exists(select 1 from public.chiller_ota_jobs j join public.chiller_ota_releases r on r.id=j.release_id join public.chiller_ota_receipts d on d.device=j.device where j.device='ESP32-CH2-PLC' and r.version='ch2-msi-2' and j.status='completed' and j.source_boot<>d.boot_id)
 or not exists(select 1 from public.chiller_ota_receipts d join public.chiller_ota_jobs j on j.id=d.job_id join public.chiller_ota_releases r on r.id=j.release_id where d.device='ESP32-CH3-PLC' and d.version='ch3-msi-1' and j.device=d.device and j.status='failed' and r.version='ch3-msi-2')
 or exists(select 1 from public.ch1_ota_jobs where status not in('completed','failed'))
 or exists(select 1 from public.chiller_ota_jobs where status not in('completed','failed'))
 then raise exception 'Final firmware/display acceptance missing or OTA remains active'; end if;
 if exists(select 1 from storage.buckets where id in ('ch1-firmware','chiller-firmware')) then raise exception 'Remove private firmware buckets through the Storage API first'; end if;
 if exists(select 1 from cron.job where command~*'(ch1|ch2|ch3|chiller|CH-NJ)') then raise exception 'Review remaining chiller cron jobs'; end if;
 if exists(select 1 from public.points p join public.devices d on d.id=p.device_id join public.assets a on a.id=d.asset_id
 where a.asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03') and p.asset_id<>d.asset_id) then raise exception 'Cross-asset point reference requires review'; end if;
 if exists(select 1 from public.alarms l join public.points p on p.id=l.point_id join public.assets a on a.id=p.asset_id
 where a.asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03') and l.asset_id is not null and l.asset_id<>p.asset_id) then raise exception 'Cross-asset alarm reference requires review'; end if;
end $$;

-- Preserve the existing barrel mapping and freshness, while removing dependencies
-- on all Cloud chiller views. Both zero and 100 percent remain valid readings.
create or replace view public.v_nj_monitoring_overview with(security_invoker=true) as
with slots(asset_code,asset_name,asset_type,source_code) as (
 values('BARREL-NJ-01'::text,'Material Barrel 1'::text,'barrel'::text,'BARREL-NJ-02'::text),
       ('BARREL-NJ-02'::text,'Material Barrel 2'::text,'barrel'::text,'BARREL-NJ-01'::text)
), levels as (
 select asset_code,max(updated_at) updated_at,max(value_number) level_percent
 from public.v_asset_points_latest
 where asset_code in ('BARREL-NJ-01','BARREL-NJ-02')
 and point_code in ('BARREL1_LEVEL_PERCENT','BARREL2_LEVEL_PERCENT')
 group by asset_code
)
select s.asset_code,s.asset_name,s.asset_type,p.updated_at,
 coalesce(p.updated_at>now()-interval '35 seconds' and p.updated_at<=now() and p.level_percent between 0 and 100,false) is_online,
 null::boolean comp_1a_enabled,null::boolean comp_1b_enabled,null::boolean comp_1c_enabled,
 null::boolean comp_2a_enabled,null::boolean comp_2b_enabled,null::boolean comp_2c_enabled,
 p.level_percent,null::boolean has_error from slots s left join levels p on p.asset_code=s.source_code;

-- Remove only retired chiller branches from generic legacy retention helpers.
-- Their unrelated cleanup behavior is preserved; neither helper is invoked here.
create or replace function public.cleanup_1day() returns void language plpgsql
set search_path to public,pg_temp as $$ begin
 delete from telemetry_history where created_at<now()-interval '1 day';
 delete from tech_locations where captured_at<now()-interval '1 day';
end $$;
create or replace function public.cleanup_old_telemetry() returns void language plpgsql
set search_path to public,pg_temp as $$ begin
 delete from telemetry_history where created_at<now()-interval '3 days';
end $$;
-- The generic command table remains. This trigger implements only CH1 fan/reset
-- writes into the retired Cloud sample table and is no longer an active path.
drop trigger if exists trg_apply_device_command on public.device_commands;

do $$ declare names text; item record; begin
 select string_agg(format('%I.%I',schemaname,viewname),',') into names from pg_views
 where schemaname='public' and viewname in ('v_ch2_dashboard','v_ch2_latest','v_ch2_points_latest','v_ch3_dashboard','v_chiller_dashboard');
 if names is not null then execute 'drop view '||names; end if;
 -- Other buckets see the same effective policy result: each removed boundary
 -- evaluated TRUE for every bucket except the two deleted firmware buckets.
 for item in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and policyname~'^(ch1|chiller)_firmware_' loop
  execute format('drop policy %I on %I.%I',item.policyname,item.schemaname,item.tablename);
 end loop;
 for item in select n.nspname,c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and (n.nspname in ('ch1_private','ch23_ota_private','nj_msi_private') or n.nspname='public' and c.relname~'^(ch1_|ch2_|ch3_|chiller_ota_)') loop
  execute format('drop trigger %I on %I.%I',item.tgname,item.nspname,item.relname);
 end loop;
 select string_agg(format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),',') into names
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and
 (n.nspname in ('ch1_private','ch23_ota_private','nj_msi_private') or n.nspname='public' and
 (p.proname~'^(ch1_|chiller_|ingest_ch[123]($|_)|ingest_chiller_)' or p.proname in ('nj_msi_exchange','ingest_monitor_telemetry','apply_device_command_v2')));
 if names is not null then execute 'drop function '||names; end if;
 select string_agg(format('%I.%I',n.nspname,c.relname),',') into names
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and
 (n.nspname in ('ch1_private','ch23_ota_private','nj_msi_private') or n.nspname='public' and c.relname~'^(ch1_|ch2_|ch3_|chiller_ota_)');
 if names is not null then execute 'drop table '||names; end if;
 -- No CASCADE: any unexpected dependency aborts this entire transaction.
 drop schema ch1_private,ch23_ota_private,nj_msi_private;
end $$;

delete from public.device_commands where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03');
delete from public.asset_points_latest where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03');
delete from public.telemetry_latest_import where asset_id in(select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03')) or point_id in(select p.id from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03'));
delete from public.telemetry_latest where asset_id in(select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03')) or point_id in(select p.id from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03'));
delete from public.alarms where asset_id in(select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03')) or point_id in(select p.id from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03'));
delete from public.points where asset_id in(select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03'));
delete from public.devices where asset_id in(select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03'));
delete from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03');

-- The synchronous HTTP extension was installed only for the retired relay.
-- RESTRICT protects any unexpected extension dependency.
drop extension http;
notify pgrst,'reload schema';
commit;
