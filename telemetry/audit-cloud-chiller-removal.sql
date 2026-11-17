-- Read-only catalog/count verification. Does not return sensor or personal data.
select jsonb_build_object(
 'chiller_schemas',(select count(*) from pg_namespace where nspname in('ch1_private','ch23_ota_private','nj_msi_private')),
 'chiller_tables',(select count(*) from pg_tables where schemaname='public' and tablename~'^(ch1_|ch2_|ch3_|chiller_ota_)'),
 'chiller_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname='public' and (p.proname~*'(ch[123]|chiller|nj_msi)' or p.prosrc~*'(CH-NJ-0[123]|ESP32-CH[123]|ch1_|ch2_|ch3_|chiller_|nj_msi_)')),
 'chiller_views',(select count(*) from pg_views where schemaname='public' and (viewname~*'(ch[123]|chiller)' or definition~*'(CH-NJ-0[123]|ESP32-CH[123]|ch1_|ch2_|ch3_|chiller_|nj_msi_)')),
 'chiller_policies',(select count(*) from pg_policies where policyname~*'^(ch1|chiller)_firmware_' or coalesce(qual,'')||coalesce(with_check,'')~*'(CH-NJ-0[123]|ESP32-CH[123]|ch1_|ch2_|ch3_|chiller_|nj_msi_)'),
 'chiller_assets',(select count(*) from public.assets where asset_code in('CH-NJ-01','CH-NJ-02','CH-NJ-03')),
 'chiller_devices',(select count(*) from public.devices where device_code in('ESP32-CH1','ESP32-CH2-PLC','ESP32-CH3-PLC')),
 'chiller_named_points',(select count(*) from public.points where point_code~'^(CH[123]_|CHILLER_)'),
 'firmware_buckets',(select count(*) from storage.buckets where id in('ch1-firmware','chiller-firmware')),
 'firmware_objects',(select count(*) from storage.objects where bucket_id in('ch1-firmware','chiller-firmware')),
 'employees',(select count(*) from public.employees),
 'auth_users',(select count(*) from auth.users),
 'barrel_assets',(select count(*) from public.assets where asset_code in('BARREL-NJ-01','BARREL-NJ-02')),
 'barrel_devices',(select count(*) from public.devices d join public.assets a on a.id=d.asset_id where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02')),
 'barrel_points',(select count(*) from public.points p join public.assets a on a.id=p.asset_id where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02')),
 'barrel_latest_rows',(select count(*) from public.telemetry_latest t join public.assets a on a.id=t.asset_id where a.asset_code in('BARREL-NJ-01','BARREL-NJ-02')),
 'barrel_overview',(select jsonb_agg(jsonb_build_object('asset_code',asset_code,'is_online',is_online) order by asset_code) from public.v_nj_monitoring_overview),
 'remaining_cron',(select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'active',active) order by jobid) from cron.job),
 'unrelated_columns_digest',(select md5(string_agg(table_schema||'.'||table_name||'.'||column_name||':'||udt_name,E'\n' order by table_schema,table_name,ordinal_position)) from information_schema.columns where table_schema in('public','farmplast_zkt_private') and table_name!~'^(ch1_|ch2_|ch3_|chiller_|v_ch[123]|v_chiller)' and table_name<>'v_nj_monitoring_overview'),
 'unrelated_functions_digest',(select md5(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||pg_get_functiondef(p.oid),E'\n' order by n.nspname,p.proname,p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in('public','farmplast_zkt_private') and p.proname!~'^(ch1_|chiller_|ingest_ch[123]($|_)|ingest_chiller_)' and p.proname not in('nj_msi_exchange','ingest_monitor_telemetry','apply_device_command_v2','cleanup_1day','cleanup_old_telemetry'))
) as audit;
