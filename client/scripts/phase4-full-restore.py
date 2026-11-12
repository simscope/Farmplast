"""Full immutable-dump restore in the Phase 4 sandbox; all raw logs stay private."""
import json,pathlib,subprocess,hashlib,sys
root=pathlib.Path('/vercel/phase4'); private=root/'private'; pg=root/'pg/bin'
def sql(statement,database='postgres'):
    r=subprocess.run([str(pg/'psql'),'-X','-h','127.0.0.1','-p','55440','-U','phase4_admin','-d',database,'-At','-v','ON_ERROR_STOP=1'],input=statement,text=True,capture_output=True)
    if r.returncode: (private/'sql-error.log').write_text(r.stderr); raise RuntimeError('Local SQL failed; private log retained')
    return r.stdout.strip()
assert sql("select current_setting('data_directory')")==str(root/'data')
assert sql("select current_setting('cron.launch_active_jobs')")=='off'
dump=private/'farmplast-full.dump'
assert hashlib.sha256(dump.read_bytes()).hexdigest()=='45570234629a01a3e9f2d92faf3762fc216f05ceb324f2c6f99b743c7ac2fab9'
catalog=json.loads((private/'source-catalog.json').read_text())
quote=lambda s:'"'+s.replace('"','""')+'"'
existing=set(sql('select rolname from pg_roles').splitlines())
for role in catalog['roles']:
    if role['rolname'] not in existing:
        sql('create role '+quote(role['rolname'])+' nologin '+('inherit' if role['rolinherit'] else 'noinherit')+' '+('bypassrls' if role['rolbypassrls'] else 'nobypassrls'))
for membership in catalog['memberships']:
    sql('grant '+quote(membership['role'])+' to '+quote(membership['member'])+(' with admin option' if membership['admin_option'] else ''))
if sql("select count(*) from pg_database where datname='phase4_restore'")=='1':
    # Retry only this failed, disposable restore before any rehearsal writes.
    assert sql("select to_regclass('public.employee_employment_periods') is null",'phase4_restore')=='t', 'Refuse to replace a migrated database or its later records'
    sql('drop database phase4_restore with (force)')
# Native PostgreSQL requires the event-trigger owner to be superuser at bootstrap.
# Supabase supplies a managed privileged role. Restore its original flags below.
sql('alter role supabase_admin superuser')
sql('create database phase4_restore')
with (private/'restore.log').open('w') as log:
    r=subprocess.run([str(pg/'pg_restore'),'-h','127.0.0.1','-p','55440','-U','phase4_admin','-d','phase4_restore','--exit-on-error',str(dump)],stdout=log,stderr=log)
result={'restore_exit':r.returncode,'dump_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'cron_launch_active_jobs':sql("select current_setting('cron.launch_active_jobs')"),'database':'phase4_restore'}
if r.returncode==0:
    role=next(x for x in catalog['roles'] if x['rolname']=='supabase_admin')
    sql('alter role supabase_admin '+('superuser' if role['rolsuper'] else 'nosuperuser'))
    verified=[]
    for table in catalog['tables']:
        relation=quote(table['schemaname'])+'.'+quote(table['tablename'])
        actual=json.loads(sql("select json_build_object('count',count(*)::text,'checksum',md5(coalesce(string_agg(h,'' order by h),''))) from (select md5(to_jsonb(t)::text) h from "+relation+' t) x','phase4_restore'))
        verified.append({'schema':table['schemaname'],'table':table['tablename'],'matches':actual['count']==table['count'] and actual['checksum']==table['checksum']})
    result['table_checks']=verified
    result['tables_preserved']=sum(t['matches'] for t in verified)
    result['extensions']=json.loads(sql("select json_agg(json_build_object('name',extname,'version',extversion)) from pg_extension",'phase4_restore'))
    result['policies']=json.loads(sql("select json_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p",'phase4_restore'))
    def policy(p):
        p=dict(p)
        roles=p['roles']
        p['roles']=sorted(roles.strip('{}').split(',') if isinstance(roles,str) else roles)
        return p
    result['policy_matches']={json.dumps(policy(p),sort_keys=True) for p in result['policies']}=={json.dumps(policy(p),sort_keys=True) for p in catalog['policies']}
(private/'restore-summary.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['policies','table_checks']}))
if r.returncode==0:
    assert result['tables_preserved']==len(catalog['tables']), 'Full table integrity failed'
    assert result['policy_matches'], 'Policy integrity failed'
    assert {x['name']:x['version'] for x in result['extensions']}=={x['extname']:x['extversion'] for x in catalog['extensions']}, 'Extension version mismatch'
sys.exit(r.returncode)
