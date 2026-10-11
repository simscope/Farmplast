"""Run only inside the deny-all Phase 4 Linux sandbox, after full restore.

Preserves original-column row multisets across forward migrations and rollback.
Raw rows and errors stay in the private directory. No external credentials.
"""
import collections, hashlib, json, pathlib, subprocess
root=pathlib.Path('/vercel/phase4'); private=root/'private'; pg=root/'pg/bin'
def sql(statement):
    r=subprocess.run([str(pg/'psql'),'-X','-h','127.0.0.1','-p','55440','-U','phase4_admin','-d','phase4_restore','-At','-v','ON_ERROR_STOP=1'],input=statement,text=True,capture_output=True)
    if r.returncode:
        (private/'rehearsal-error.log').write_text(r.stderr)
        raise RuntimeError('Rehearsal SQL failed; details private')
    return r.stdout.strip()
q=lambda s:'"'+s.replace('"','""')+'"'
assert sql("select current_setting('data_directory')") == str(root/'data')
assert sql("select current_setting('cron.launch_active_jobs')") == 'off'
catalog=json.loads((private/'source-catalog.json').read_text())
summary=json.loads((private/'restore-summary.json').read_text())
def normalize(p):
    p=dict(p); r=p['roles']; p['roles']=sorted(r.strip('{}').split(',') if isinstance(r,str) else r); return p
assert {json.dumps(normalize(p),sort_keys=True) for p in summary['policies']}=={json.dumps(normalize(p),sort_keys=True) for p in catalog['policies']}
assert sql("select to_regclass('public.employee_employment_periods') is null")=='t', 'Never rerun on post-migration records'
summary['policy_matches']=True
(private/'restore-summary.json').write_text(json.dumps(summary,indent=2))
original={}
for t in catalog['tables']:
    name=q(t['schemaname'])+'.'+q(t['tablename'])
    rows=json.loads(sql('select coalesce(json_agg(to_jsonb(t)),\'[]\'::json) from '+name+' t'))
    cols=json.loads(sql("select json_agg(attname order by attnum) from pg_attribute where attrelid='"+name+"'::regclass and attnum>0 and not attisdropped"))
    original[name]=(cols,collections.Counter(json.dumps(row,sort_keys=True) for row in rows))
def preserve():
    checked=0
    for name,(cols,before) in original.items():
        rows=json.loads(sql('select coalesce(json_agg(to_jsonb(t)),\'[]\'::json) from '+name+' t'))
        after=collections.Counter(json.dumps({k:row[k] for k in cols},sort_keys=True) for row in rows)
        assert not before-after, 'Original rows changed: '+name
        checked+=1
    return checked
def counts():
    return json.loads(sql("select json_build_object('employees',count(*),'active',count(*) filter(where active),'former',count(*) filter(where active is not true)) from public.employees"))
def roles():
    return json.loads(sql("select json_agg(json_build_object('role',rolname,'login',rolcanlogin)) from pg_roles where rolname in ('postgres','supabase_admin','authenticated','anon','service_role')"))
result={'restore_tables':summary['tables_preserved'],'restore_policies':len(summary['policies']),'restore_policies_match':True,'original_counts':counts(),'source_roles_isolated':roles(),'steps':[]}
result['catalog_objects_before']=json.loads(sql("select json_build_object('functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'),'triggers',(select count(*) from pg_trigger where not tgisinternal),'event_triggers',(select count(*) from pg_event_trigger),'rls_tables',(select count(*) from pg_class where relrowsecurity),'constraints_unvalidated',(select count(*) from pg_constraint where not convalidated))"))
def migrate(name):
    text=(private/name).read_text(); sql(text)
    result['steps'].append({'migration':name,'sha256':hashlib.sha256(text.encode()).hexdigest(),'preserved_tables':preserve(),'counts':counts()})
migrate('former_employees.sql')
assert sql('select count(*) from public.employee_employment_periods')=='65'
admin=sql("select id from public.profiles where role='admin' limit 1")
assert admin
claims="set local role authenticated;select set_config('request.jwt.claim.sub','"+admin+"',true);select set_config('request.jwt.claim.role','authenticated',true);"
cap=sql('begin;'+claims+'select public.employee_archive_capabilities();rollback;').splitlines()
assert any('"lifecycle": false' in x and '"identity": false' in x for x in cap)
visible=sql('begin;'+claims+"select json_build_object('former',count(*) filter(where active is not true),'active',count(*) filter(where active)) from public.employees;rollback;")
assert '"former" : 8' in visible and '"active" : 57' in visible
denied=sql("begin;set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);select count(*) from public.employees where active is not true;rollback;")
assert '0' in denied.splitlines()
result['archive_admin_57_8']=True; result['archive_unprivileged_no_former']=True
# Lawful post-deployment write in the disposable database; retain it on rollback.
sql("insert into public.employees(id,employee_number,first_name,last_name,active,hire_date,plant_location) values('00000000-0000-0000-0000-000000000099',9999,'Phase4','Synthetic',true,'2026-10-11','NJ')")
result['archive_failure_simulation']='Application version rollback; additive schema retained'
assert sql("select count(*) from public.employees where id='00000000-0000-0000-0000-000000000099'")=='1'
assert preserve()==96
result['archive_rollback_preserves_post_migration_employee']=True
for name in ['zkt_event_identity.sql','employee_lifecycle.sql','employee_release_gates.sql']:
    migrate(name)
assert sql('select actions_enabled from public.employee_release_config')=='f'
assert sql('select reuse_enabled from public.employee_number_config')=='f'
result['full_failure_simulation']='Disable actions and reuse; retain forward-compatible schema; refuse legacy Bridge processor rollback'
sql("insert into public.employee_work_logs(id,employee_id,work_date,time_in,time_out,approved) values('00000000-0000-0000-0000-000000000097','00000000-0000-0000-0000-000000000099','2026-10-11','08:00','16:00',true)")
sql("insert into public.employee_payments(id,employee_id,period_start,period_end,total_labor,net_pay) values('00000000-0000-0000-0000-000000000098','00000000-0000-0000-0000-000000000099','2026-10-11','2026-10-11',160,160)")
sql('begin;update public.employee_release_config set actions_enabled=false;update public.employee_number_config set reuse_enabled=false;commit;')
assert sql("select count(*) from public.employees where id='00000000-0000-0000-0000-000000000099'")=='1'
result['full_rollback_preserved_tables']=preserve()
result['full_rollback_post_employee_preserved']=True
assert sql("select count(*) from public.employee_work_logs where id='00000000-0000-0000-0000-000000000097'")=='1'
assert sql("select net_pay=160 from public.employee_payments where id='00000000-0000-0000-0000-000000000098'")=='t'
result['full_rollback_post_attendance_payment_preserved']=True
result['final_counts']=counts()
result['employment_periods']=int(sql('select count(*) from public.employee_employment_periods'))
result['identity_ownership']=int(sql('select count(*) from public.zkt_event_ownership'))
result['identity_review']=int(sql('select count(*) from public.zkt_identity_review'))
result['cron_launch_active_jobs']=sql("select current_setting('cron.launch_active_jobs')")
result['cron_run_rows_unchanged']=preserve()==96
result['dump_sha256']=summary['dump_sha256']
(private/'rehearsal-summary.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
