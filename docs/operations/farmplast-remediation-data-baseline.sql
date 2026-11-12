-- Farmplast read-only aggregate baseline for the separate SACS role operation.
SELECT jsonb_build_object('checked_at',now(),'readonly',current_setting('transaction_read_only'),
 'employees',(SELECT jsonb_build_object('count',count(*),'active',count(*) FILTER(WHERE active),'former',count(*) FILTER(WHERE active IS NOT TRUE),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT active,md5(to_jsonb(t)::text) h FROM public.employees t) x),
 'payments',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.employee_payments t) x),
 'payroll_checks',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.payroll_checks t) x),
 'deductions',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.employee_payroll_deductions t) x),
 'work_logs',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.employee_work_logs t) x),
 'attendance',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public.zkt_attendance_logs t) x)
) evidence;
