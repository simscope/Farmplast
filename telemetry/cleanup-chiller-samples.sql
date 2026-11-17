-- Owner authorized deleting old readings after the verified chiller transfer.
-- Barrels stay in Cloud until their USB installation. No sample backup is made.
begin;
do $$
begin
 if (select count(*) from nj_msi_private.routes where mode='relay')<>3
 or not exists(select 1 from nj_msi_private.ch1_receipt where version='ch1-msi-1' and received_at>now()-interval '16 seconds')
 or (select count(*) from public.chiller_ota_receipts where (device,version) in (('ESP32-CH2-PLC','ch2-msi-1'),('ESP32-CH3-PLC','ch3-msi-1')) and received_at>now()-interval '45 seconds')<>2
 or not exists(select 1 from public.ch1_ota_jobs j join public.ch1_ota_releases r on r.id=j.release_id where r.version='ch1-msi-1' and j.status='completed')
 or (select count(distinct j.device) from public.chiller_ota_jobs j join public.chiller_ota_releases r on r.id=j.release_id where (j.device,r.version) in (('ESP32-CH2-PLC','ch2-msi-1'),('ESP32-CH3-PLC','ch3-msi-1')) and j.status='completed')<>2
 then raise exception 'Fresh installed firmware and all three completed OTA jobs are required'; end if;
 if (select count(*) from public.assets where (asset_code,id) in
 (('CH-NJ-01','4327afc7-a56b-4253-97c9-3de3632fb189'::uuid),('CH-NJ-02','7a271a50-2521-44ed-a2c1-2c3308ca45ba'::uuid),('CH-NJ-03','a349bc94-410c-4c29-8055-553c6dfdf12f'::uuid)))<>3
 then raise exception 'Asset catalog changed'; end if;
end $$;
with
 a as (select id from public.assets where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03')),
 p as (select id from public.points where asset_id in (select id from a)),
 d1 as (delete from public.telemetry_latest where asset_id in (select id from a) or point_id in (select id from p) returning 1),
 d2 as (delete from public.telemetry_latest_import where asset_id in (select id from a) or point_id in (select id from p) returning 1),
 d3 as (delete from public.ch2_latest where asset_code='CH-NJ-02' returning 1),
 d4 as (delete from public.ch3_latest where asset_code='CH-NJ-03' returning 1),
 d5 as (delete from public.asset_points_latest where asset_code in ('CH-NJ-01','CH-NJ-02','CH-NJ-03') returning 1)
select jsonb_build_object('telemetry_latest',(select count(*) from d1),'telemetry_latest_import',(select count(*) from d2),'ch2_latest',(select count(*) from d3),'ch3_latest',(select count(*) from d4),'asset_points_latest',(select count(*) from d5)) as deleted_readings;
commit;
