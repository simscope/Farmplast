"""Disposable, network-denied PG17 recovery only. No production credentials.

Requires the immutable dump, snapshot catalog/globals, Phase 6 structural
rehearsal and its private inputs. All TOC entries are executed; extension
creation is run under the original owner, without editing the dump/catalog.
"""
import hashlib,json,pathlib,re,subprocess,runpy
root=pathlib.Path('/vercel/phase7'); private=root/'private'; pg=root/'pg/bin'
def sql(text,db='postgres'):
    r=subprocess.run([str(pg/'psql'),'-X','-h','127.0.0.1','-p','55440','-U','phase7_admin','-d',db,'-At','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True)
    if r.returncode:
        (private/'globals-error.log').write_text(r.stderr)
        raise RuntimeError('Isolated SQL failed; private log retained')
    return r.stdout.strip()
q=lambda s:'"'+s.replace('"','""')+'"'
v=lambda s:"'"+s.replace("'","''")+"'"
assert sql("select current_setting('data_directory')")==str(root/'data')
assert sql("select current_setting('cron.launch_active_jobs')")=='off'
assert sql("select count(*) from pg_database where datname='phase7_restore'")=='0'
dump=private/'farmplast-full.dump'
sha=hashlib.sha256(dump.read_bytes()).hexdigest()
assert sha=='d42b02b909aeb9151e4921f6ccb708e78809b9e25910979133825b5b1806c229'
catalog=json.loads((private/'source-catalog.json').read_text())
source=json.loads((private/'source-globals.json').read_text())['evidence']
existing=set(sql('select rolname from pg_roles').splitlines())
for r in catalog['roles']:
    if r['rolname'] not in existing: sql('create role '+q(r['rolname'])+' nologin '+('inherit' if r['rolinherit'] else 'noinherit')+' '+('bypassrls' if r['rolbypassrls'] else 'nobypassrls'))
for m in catalog['memberships']: sql('grant '+q(m['role'])+' to '+q(m['member'])+(' with admin option' if m['admin_option'] else ''))
sql('alter role supabase_admin superuser; alter role postgres superuser')
d=source['database']
assert d['locale_provider']=='i'
sql('create database phase7_restore template template0 owner '+q(d['owner'])+' encoding '+v(d['encoding'])+' lc_collate '+v(d['collation'])+' lc_ctype '+v(d['ctype'])+' locale_provider icu icu_locale '+v(d['locale']))
assert sql("select datcollversion from pg_database where datname=current_database()",'phase7_restore')=='153.120', 'Source ICU collation version mismatch'
listing=subprocess.check_output([str(pg/'pg_restore'),'--list',str(dump)],text=True)
entries=[line for line in listing.splitlines() if re.match(r'^\d+;',line)]
schemas=[s for s in entries if re.search(r'\bSCHEMA - ',s)]
extensions=[s for s in entries if re.search(r'\bEXTENSION - ',s)]
rest=[s for s in entries if s not in schemas+extensions]
assert len(schemas)+len(extensions)+len(rest)==len(entries)
assert len({s.split(';')[0] for s in schemas+extensions+rest})==len(entries)
def restore(lines,name,owner=None):
    path=private/(name+'.list'); path.write_text('\n'.join(lines)+'\n')
    args=[str(pg/'pg_restore'),'--exit-on-error','--use-list',str(path)]
    if owner:
        text=subprocess.check_output(args+['--file','-',str(dump)],text=True)
        sql('set role '+q(owner)+';\n'+text,'phase7_restore')
    else:
        with (private/(name+'.log')).open('w') as log:
            r=subprocess.run(args+['-h','127.0.0.1','-p','55440','-U','phase7_admin','-d','phase7_restore',str(dump)],stdout=log,stderr=log)
        assert r.returncode==0, 'Restore failed; private log retained'
restore(schemas,'schemas')
for line in extensions:
    name=line.split('EXTENSION - ',1)[1].split()[0]
    owner=next(e['owner'] for e in source['extensions'] if e['name']==name)
    restore([line],'extension-'+name,owner)
restore(rest,'remaining')
checks=[]
for t in catalog['tables']:
    actual=json.loads(sql("select json_build_object('count',count(*)::text,'checksum',md5(coalesce(string_agg(h,'' order by h),''))) from (select md5(to_jsonb(t)::text) h from "+q(t['schemaname'])+'.'+q(t['tablename'])+' t) x','phase7_restore'))
    checks.append(actual['count']==t['count'] and actual['checksum']==t['checksum'])
assert all(checks)
(private/'restore-summary.json').write_text(json.dumps({'dump_sha256':sha,'restore_exit':0,'tables_preserved':len(checks)}))
# Reuse the unchanged Phase 6 structural/migration/rollback assertions.
runpy.run_path(str(private/'phase7-archive-rehearsal.py'))
rights={'C':'create','T':'temporary','c':'connect'}
sql('revoke all on database phase7_restore from public,phase7_admin')
for entry in d['acl'].strip('{}').split(','):
    grantee,tail=entry.split('=',1); permissions,grantor=tail.split('/',1)
    i=0
    while i<len(permissions):
        char=permissions[i]; i+=1; option=i<len(permissions) and permissions[i]=='*'
        if option:i+=1
        sql('set role '+q(grantor)+';grant '+rights[char]+' on database phase7_restore to '+(q(grantee) if grantee else 'public')+(' with grant option' if option else '')+';reset role')
for setting in source['database_role_settings']:
    for config in setting['config']:
        key,value=config.split('=',1)
        target=('alter role '+q(setting['role'])) if setting['role'] else 'alter database phase7_restore'
        if setting['role'] and setting['database']: target+=' in database phase7_restore'
        sql(target+' set '+q(key)+' to '+(value if key=='search_path' else v(value)))
actual=json.loads(sql((private/'globals.sql').read_text(),'phase7_restore'))
actual['database']['name']=d['name']
def normalized_db(x):
    x=dict(x); x['acl']=sorted(x['acl'].strip('{}').split(',')); return x
def settings(rows):
    return sorted((('postgres' if r['database']=='phase7_restore' else r['database']),r['role'],tuple(sorted(r['config']))) for r in rows)
proof={'dump_sha256':sha,'all_toc_entries_executed':len(entries),'toc_entries_excluded':0,'tables_counts_checksums_match':len(checks),'database_properties_acl_match':normalized_db(actual['database'])==normalized_db(d),'database_role_settings_match':settings(actual['database_role_settings'])==settings(source['database_role_settings']),'database_role_settings_count':len(source['database_role_settings']),'extension_owners_versions_match':sorted(actual['extensions'],key=lambda e:e['name'])==sorted(source['extensions'],key=lambda e:e['name']),'source_collation_version':'153.120','restored_collation_version':sql("select datcollversion from pg_database where datname=current_database()",'phase7_restore'),'cron_launch_active_jobs':sql("select current_setting('cron.launch_active_jobs')"),'network_policy':'deny-all','production_credentials_loaded':False}
assert hashlib.sha256(dump.read_bytes()).hexdigest()==sha
(private/'phase7-globals-proof.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(proof),flush=True)
assert proof['database_properties_acl_match'] and proof['database_role_settings_match'] and proof['extension_owners_versions_match']
