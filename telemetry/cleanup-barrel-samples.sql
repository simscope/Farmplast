-- Apply after both real barrel streams are accepted on MSI and the website
-- production source list includes all five NJ assets. No sample archive/export.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if (select count(*) from public.assets where (asset_code,id) in
  (('BARREL-NJ-01','0014e66c-a0d1-4b92-8209-1d10b2bca942'::uuid),
   ('BARREL-NJ-02','3b035658-b8e0-493b-b868-33d0bea04ece'::uuid)))<>2
 then raise exception 'Barrel identity changed'; end if;
 if exists(select 1 from public.telemetry_latest t join public.assets a on a.id=t.asset_id
  where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02') and t.updated_at>now()-interval '90 seconds')
 then raise exception 'Legacy barrel publisher is still active'; end if;
end $$;
delete from public.telemetry_latest_import where asset_id in(select id from public.assets where asset_code in('BARREL-NJ-01','BARREL-NJ-02'))
 or point_id in(select p.id from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02'));
delete from public.telemetry_latest where asset_id in(select id from public.assets where asset_code in('BARREL-NJ-01','BARREL-NJ-02'))
 or point_id in(select p.id from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02'));
delete from public.asset_points_latest where asset_code in('BARREL-NJ-01','BARREL-NJ-02');
commit;
