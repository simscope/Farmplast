"""Phase 6: deny-all, disposable PG17 full restore only; never production.

Requires private source-catalog.json/source-structure.json/structure.sql, a
successful restore-summary.json and the two immutable release SQL files.
Raw catalog/rows/errors stay private. Outputs only aggregate proof.
"""
import collections, hashlib, json, pathlib, subprocess
root=pathlib.Path('/vercel/phase6'); private=root/'private'; pg=root/'pg/bin'
def sql(text):
    r=subprocess.run([str(pg/'psql'),'-X','-h','127.0.0.1','-p','55440','-U','phase6_admin','-d','phase6_restore','-At','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True)
    if r.returncode:
        (private/'rehearsal-error.log').write_text(r.stderr)
        raise RuntimeError('SQL failure: private log retained')
    return r.stdout.strip()
q=lambda x:'"'+x.replace('"','""')+'"'
assert sql("select current_setting('data_directory')")==str(root/'data')
assert sql("select current_setting('cron.launch_active_jobs')")=='off'
assert sql("select to_regclass('public.employee_feature_flags') is null")=='t'
catalog=json.loads((private/'source-catalog.json').read_text())
source=json.loads((private/'source-structure.json').read_text())['evidence']
# pg_dump recreates extension objects under the restoring administrator. Their
# managed-source ownership is supplemental metadata, not a dump modification.
for f in source['functions']:
    sql('alter function '+q(f['schema'])+'.'+q(f['name'])+'('+f['signature']+') owner to '+q(f['owner']))
for r in source['relations']:
    kind={'S':'sequence','v':'view','m':'materialized view','f':'foreign table'}.get(r['kind'],'table')
    sql('alter '+kind+' '+q(r['schema'])+'.'+q(r['name'])+' owner to '+q(r['owner']))
for s in source['schemas']:
    sql('alter schema '+q(s['name'])+' owner to '+q(s['owner']))
# Supplemental grants for managed schemas and extension sequences. pg_dump
# can omit default-equivalent ACLs; it also inherited a local PUBLIC sequence
# SELECT grant from restored default privileges. Restore effective privileges.
rights={'r':'select','a':'insert','w':'update','d':'delete','D':'truncate','x':'references','t':'trigger','m':'maintain','U':'usage','C':'create','X':'execute'}
def restore_acl(obj,kind,target):
    entries=(obj['acl'] or '').strip('{}').split(',') if obj['acl'] else []
    owner=obj['owner']
    sql('revoke all on '+kind+' '+target+' from public, phase6_admin')
    for entry in entries:
        grantee,tail=entry.split('=',1); privileges,grantor=tail.split('/',1)
        grantee=q(grantee) if grantee else 'public'
        index=0
        while index<len(privileges):
            char=privileges[index]; index+=1
            option=index<len(privileges) and privileges[index]=='*'
            if option: index+=1
            sql('set role '+q(grantor)+'; grant '+rights[char]+' on '+kind+' '+target+' to '+grantee+(' with grant option' if option else '')+';reset role;')
    if not entries:
        sql('grant all on '+kind+' '+target+' to '+q(owner))
for s in source['schemas']:
    restore_acl(s,'schema',q(s['name']))
for r in source['relations']:
    restore_acl(r,'sequence' if r['kind']=='S' else 'table',q(r['schema'])+'.'+q(r['name']))
restored=json.loads(sql((private/'structure.sql').read_text()))
(private/'restored-structure.json').write_text(json.dumps(restored,indent=2))
result={'dump_sha256':json.loads((private/'restore-summary.json').read_text())['dump_sha256'],'structure':{},'roles_isolated':True}
def canonical(rows):
    out=[]
    for item in rows or []:
        item=dict(item)
        if 'acl' in item:
            acl=item['acl']
            if acl is None:
                owner=item['owner']
                if 'kind' in item: acl='{'+owner+'='+('rwU' if item['kind']=='S' else 'arwdDxtm')+'/'+owner+'}'
                elif 'signature' in item: acl='{=X/'+owner+','+owner+'=X/'+owner+'}'
                else: acl='{'+owner+'=UC/'+owner+'}'
            item['acl']=','.join(sorted(acl.strip('{}').split(',')))
        if 'function' in item and '.' not in item['function']:
            matches=[f for f in source['functions'] if f['name']==item['function']]
            assert len(matches)==1, 'Unqualified event trigger function is ambiguous'
            item['function']=matches[0]['schema']+'.'+item['function']
        out.append(json.dumps(item,sort_keys=True))
    return sorted(out)
for key in ['functions','relations','schemas','default_acls','column_acls','constraints','triggers','event_triggers']:
    a,b=canonical(source[key]),canonical(restored[key])
    result['structure'][key]={'source':len(a),'restored':len(b),'equal':a==b,'missing':len(set(a)-set(b)),'extra':len(set(b)-set(a))}
# Replay global role attributes (never passwords / LOGIN), omitted by pg_dump.
# Managed Supabase administrative role implementation is modelled locally.
for role in source['roles']:
    if role['rolname'].startswith('pg_'): continue
    attrs=[]
    for name,yes,no in [('rolsuper','superuser','nosuperuser'),('rolinherit','inherit','noinherit'),('rolcreaterole','createrole','nocreaterole'),('rolcreatedb','createdb','nocreatedb'),('rolreplication','replication','noreplication'),('rolbypassrls','bypassrls','nobypassrls')]:
        attrs.append(yes if role[name] else no)
    attrs+=['nologin','connection limit '+str(role['rolconnlimit'])]
    sql('alter role '+q(role['rolname'])+' '+' '.join(attrs))
    if role['rolvaliduntil'] is not None:
        sql('alter role '+q(role['rolname'])+" valid until '"+role['rolvaliduntil'].replace("'","''")+"'")
    for config in role['rolconfig'] or []:
        key,value=config.split('=',1)
        # search_path is a GUC identifier list; one quoted string changes it.
        rendered=value if key=='search_path' else "'"+value.replace("'","''")+"'"
        sql('alter role '+q(role['rolname'])+' set '+q(key)+' to '+rendered)
# Preserve membership ADMIN / INHERIT / SET options, not just legacy ADMIN.
for m in source['memberships'] or []:
    sql('set role '+q(m['grantor'])+'; grant '+q(m['role'])+' to '+q(m['member'])+' with admin '+str(m['admin_option']).lower()+', inherit '+str(m['inherit_option']).lower()+', set '+str(m['set_option']).lower()+';reset role;')
    sql('revoke '+q(m['role'])+' from '+q(m['member'])+' granted by phase6_admin')
after=json.loads(sql((private/'structure.sql').read_text()))
rolefields=['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','rolconnlimit','rolvaliduntil','rolconfig']
localroles={r['rolname']:r for r in after['roles']}
for r in source['roles']:
    if r['rolconfig']: r['rolconfig']=sorted(r['rolconfig'])
    if localroles[r['rolname']]['rolconfig']: localroles[r['rolname']]['rolconfig']=sorted(localroles[r['rolname']]['rolconfig'])
result['global_role_attributes_match']=all(all(r[k]==localroles[r['rolname']][k] for k in rolefields) for r in source['roles'])
result['roles_isolated']=all(not localroles[r['rolname']]['rolcanlogin'] for r in source['roles'] if not r['rolname'].startswith('pg_'))
def memberships(rows): return sorted((r['role'],r['member'],r['admin_option'],r['inherit_option'],r['set_option']) for r in rows or [])
result['membership_options_match']=memberships(source['memberships'])==memberships(after['memberships'])
result['membership_grantor_exact']=canonical(source['memberships'])==canonical(after['memberships'])
(private/'structure-proof.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)
assert all(v['equal'] for v in result['structure'].values()), 'Catalog mismatch; do not weaken verification'
assert result['global_role_attributes_match'] and result['roles_isolated'] and result['membership_options_match'] and result['membership_grantor_exact']
original={}
for table in catalog['tables']:
    name=q(table['schemaname'])+'.'+q(table['tablename'])
    rows=json.loads(sql("select coalesce(json_agg(to_jsonb(t)),'[]'::json) from "+name+' t'))
    cols=json.loads(sql("select json_agg(attname order by attnum) from pg_attribute where attrelid='"+name+"'::regclass and attnum>0 and not attisdropped"))
    original[name]=(cols,collections.Counter(json.dumps(r,sort_keys=True) for r in rows))
def preserve():
    for name,(cols,before) in original.items():
        rows=json.loads(sql("select coalesce(json_agg(to_jsonb(t)),'[]'::json) from "+name+' t'))
        after=collections.Counter(json.dumps({k:r[k] for k in cols},sort_keys=True) for r in rows)
        assert not before-after, 'Original-column row changed'
    return len(original)
result['migrations']=[]
for name in ['former_employees.sql','employee_archive_feature_flags.sql']:
    text=(private/name).read_text(); sql(text)
    result['migrations'].append({'file':name,'sha256':hashlib.sha256(text.encode()).hexdigest(),'preserved_tables':preserve()})
assert sql('select count(*) from public.employee_employment_periods')=='65'
assert sql('select count(*) from public.employee_feature_flags where enabled')=='0'
admin=sql("select id from public.profiles where role='admin' limit 1")
assert admin
claims="set local role authenticated;select set_config('request.jwt.claim.sub','"+admin+"',true);select set_config('request.jwt.claim.role','authenticated',true);"
def deny(command):
    text="do $test$ begin begin "+command+"; raise exception 'Unexpected success'; exception when insufficient_privilege then null; end; end $test$;"
    sql('begin;'+claims+text+'rollback;')
deny('perform public.list_former_employees()')
result['archive_off_denied']=True
sql("update public.employee_feature_flags set enabled=true where flag='former_employees_archive_readonly'")
visible=sql('begin;'+claims+'select count(*) from public.list_former_employees();rollback;')
assert '8' in visible.splitlines()
sql("begin;set local role anon;do $test$ begin begin perform public.list_former_employees(); raise exception 'Unexpected success'; exception when insufficient_privilege then null; end; end $test$;rollback;")
result['archive_admin_8_anon_denied']=True
assert sql("select count(*) from public.employees where id='00000000-0000-0000-0000-000000000099'")=='0'
sql("insert into public.employees(id,employee_number,first_name,last_name,active,hire_date,plant_location) values('00000000-0000-0000-0000-000000000099',9999,'Phase6','Synthetic',true,'2026-10-11','NJ')")
sql("insert into public.employee_work_logs(id,employee_id,work_date,time_in,time_out,approved) values('00000000-0000-0000-0000-000000000097','00000000-0000-0000-0000-000000000099','2026-10-11','08:00','16:00',true)")
sql("insert into public.employee_payments(id,employee_id,period_start,period_end,total_labor,net_pay) values('00000000-0000-0000-0000-000000000098','00000000-0000-0000-0000-000000000099','2026-10-11','2026-10-11',160,160)")
deny("update public.employees set active=false where id='00000000-0000-0000-0000-000000000099'")
deny("update public.employees set employee_number=9998 where id='00000000-0000-0000-0000-000000000099'")
sql('update public.employee_feature_flags set enabled=false')
deny('perform public.list_former_employees()')
assert sql("select count(*) from public.employees where id='00000000-0000-0000-0000-000000000099'")=='1'
assert sql("select count(*) from public.employee_employment_periods where employee_id='00000000-0000-0000-0000-000000000099'")=='1'
assert sql("select count(*) from public.employee_work_logs where id='00000000-0000-0000-0000-000000000097'")=='1'
assert sql("select net_pay=160 from public.employee_payments where id='00000000-0000-0000-0000-000000000098'")=='t'
result['rollback']={'retained_schema':True,'preserved_tables':preserve(),'retained_post_migration_employee_period_payroll_attendance':True,'flags_enabled':int(sql('select count(*) from public.employee_feature_flags where enabled'))}
# Old ZKT / SSO contracts must remain byte-for-byte equal.
now=json.loads(sql((private/'structure.sql').read_text()))
legacy=[f for f in source['functions'] if f['schema']=='public' and ('zkt' in f['name'] or 'sacs' in f['name'])]
local={(f['schema'],f['name'],f['signature']):f['definition'] for f in now['functions']}
assert all(local[(f['schema'],f['name'],f['signature'])]==f['definition'] for f in legacy)
result['legacy_zkt_sacs_function_definitions_preserved']=len(legacy)
result['final_counts']=json.loads(sql("select json_build_object('employees',count(*),'active',count(*) filter(where active),'former',count(*) filter(where active is not true)) from public.employees"))
result['cron_launch_active_jobs']=sql("select current_setting('cron.launch_active_jobs')")
(private/'phase6-proof.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)
