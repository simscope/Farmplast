-- SACS read-only aggregate baseline. No records, identifiers or credentials.
SELECT jsonb_build_object('checked_at',now(),'readonly',current_setting('transaction_read_only'),
 'employees',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(e)::text) h FROM public.employees e) x),
 'safety',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.daily_sessions t) x),
 'assignments',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.company_training_one_time_assignments t) x),
 'sso_last_success',(SELECT max(created_at) FROM public.audit_logs WHERE action='farmplast_sso_success'),
 'sso_recent_failures',(SELECT count(*) FROM public.audit_logs WHERE action='farmplast_sso_failed' AND created_at>now()-interval '3 hours'),
 'sso_permissions',jsonb_build_object('service_role_issue',has_function_privilege('service_role','public.issue_farmplast_sso(text,uuid)','EXECUTE'),'service_role_consume',has_function_privilege('service_role','public.consume_farmplast_sso(text)','EXECUTE'),'anon_issue',has_function_privilege('anon','public.issue_farmplast_sso(text,uuid)','EXECUTE'),'authenticated_consume',has_function_privilege('authenticated','public.consume_farmplast_sso(text)','EXECUTE'),'authenticated_read_codes',has_table_privilege('authenticated','public.farmplast_sso_codes','SELECT'))
) evidence;
