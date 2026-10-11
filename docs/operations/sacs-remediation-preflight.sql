-- Read-only, no raw credentials, connection strings, user records or messages.
WITH target AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname='cli_login_postgres')
SELECT jsonb_build_object(
 'checked_at',now(),'readonly',current_setting('transaction_read_only'),
 'database',current_database(),'database_oid',(SELECT oid FROM pg_database WHERE datname=current_database()),
 'audit_user',current_user,'audit_user_can_set_grantor',pg_has_role(current_user,'supabase_admin','SET'),
 'role',(SELECT jsonb_build_object('name',rolname,'oid',oid,'login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,'create_role',rolcreaterole,'create_db',rolcreatedb,'replication',rolreplication,'bypass_rls',rolbypassrls,'valid_until',rolvaliduntil,'connection_limit',rolconnlimit,'verifier_present',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=t.oid)) FROM target t),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'role_oid',r.oid,'member',t.rolname,'member_oid',t.oid,'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)),'[]') FROM pg_auth_members m JOIN target t ON t.oid=m.member JOIN pg_roles r ON r.oid=m.roleid),
 'parent_memberships',(SELECT count(*) FROM pg_auth_members m JOIN target t ON t.oid=m.roleid),
 'active_connections',(SELECT count(*) FROM pg_stat_activity WHERE usename='cli_login_postgres'),
 'oldest_current_connection',(SELECT min(backend_start) FROM pg_stat_activity WHERE usename='cli_login_postgres'),
 'can_read_all_stats',pg_has_role(current_user,'pg_read_all_stats','USAGE'),
 'shared_dependencies',(SELECT count(*) FROM pg_shdepend d JOIN target t ON t.oid=d.refobjid WHERE d.refclassid='pg_authid'::regclass),
 'owned_objects',jsonb_build_object('relations',(SELECT count(*) FROM pg_class c JOIN target t ON t.oid=c.relowner),'functions',(SELECT count(*) FROM pg_proc p JOIN target t ON t.oid=p.proowner),'schemas',(SELECT count(*) FROM pg_namespace n JOIN target t ON t.oid=n.nspowner),'databases',(SELECT count(*) FROM pg_database d JOIN target t ON t.oid=d.datdba)),
 'effective_direct_tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'relation',c.relname,'select',has_table_privilege(t.oid,c.oid,'SELECT'),'insert',has_table_privilege(t.oid,c.oid,'INSERT'),'update',has_table_privilege(t.oid,c.oid,'UPDATE'),'delete',has_table_privilege(t.oid,c.oid,'DELETE'),'truncate',has_table_privilege(t.oid,c.oid,'TRUNCATE'))),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN target t WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND has_table_privilege(t.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),
 'execute_functions',(SELECT count(*) FROM pg_proc p CROSS JOIN target t WHERE has_function_privilege(t.oid,p.oid,'EXECUTE')),
 'explicit_relation_acl_entries',(SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a CROSS JOIN target t WHERE a.grantee=t.oid OR a.grantor=t.oid),
 'explicit_function_acl_entries',(SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a CROSS JOIN target t WHERE a.grantee=t.oid OR a.grantor=t.oid),
 'cron_jobs',jsonb_build_object('total',(SELECT count(*) FROM cron.job),'cli_user',(SELECT count(*) FROM cron.job WHERE username='cli_login_postgres'),'role_references',(SELECT count(*) FROM cron.job WHERE command ILIKE '%cli_login_postgres%')),
 'routine_role_references',(SELECT count(*) FROM pg_proc p WHERE p.prokind='f' AND pg_get_functiondef(p.oid) ILIKE '%cli_login_postgres%'),
 'role_config_references',(SELECT count(*) FROM pg_roles WHERE array_to_string(rolconfig,',') ILIKE '%cli_login_postgres%'),
 'database_role_config_references',(SELECT count(*) FROM pg_db_role_setting WHERE array_to_string(setconfig,',') ILIKE '%cli_login_postgres%'),
 'postgres_stats_reset',(SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),
 'logging',jsonb_build_object('log_connections',current_setting('log_connections',true),'log_disconnections',current_setting('log_disconnections',true),'log_statement',current_setting('log_statement',true),'log_destination',current_setting('log_destination',true),'logging_collector',current_setting('logging_collector',true)),
 'audit_log_current_user_key_references',(SELECT count(*) FROM public.audit_logs WHERE to_jsonb(audit_logs)::text ILIKE '%cli_login_postgres%'),
 'sacs_markers',jsonb_build_object('config',to_regclass('public.farmplast_sync_config') IS NOT NULL,'sync',to_regprocedure('public.sync_farmplast_employee(jsonb)') IS NOT NULL)
) evidence;
