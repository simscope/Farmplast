// Offline replay of the scoped, private production backup. Never connects to a DB.
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
const directory=resolve(process.argv[2]?.startsWith('--')?'../../reports/former-employees-phase2-private':process.argv[2]||'../../reports/former-employees-phase2-private')
const manifest=JSON.parse(await readFile(join(directory,'schema-and-manifest.local.json'),'utf8'))
const q=value=>`"${value.replaceAll('"','""')}"`
const lit=value=>`'${String(value).replaceAll("'","''")}'`
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
let db,engine='offline PGlite'
const archiveRelease=process.argv.includes('--archive-release')
if(process.argv.includes('--postgres')){
  const runtime=resolve(archiveRelease?'../../reports/phase5-postgres-runtime':'../../reports/phase2-postgres-runtime')
  const require=createRequire(`${resolve('../../reports/phase2-postgres-runtime')}/package.json`),{Client}=require('pg')
  const options={host:'127.0.0.1',port:archiveRelease?55441:55439,user:archiveRelease?'phase5_local':'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
  const control=new Client(options);await control.connect()
  try{
    const system=(await control.query("select current_user,current_setting('data_directory') directory,version() version")).rows[0]
    assert.equal(system.current_user,options.user);assert.equal(resolve(system.directory).toLowerCase(),resolve(runtime,'data').toLowerCase())
    engine=system.version.split(' on ')[0]
    const database=`phase2_snapshot_${Date.now()}`
    await control.query(`create database ${database}`)
    const client=new Client({...options,database});await client.connect()
    db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:()=>client.end()}
  }finally{await control.end()}
}else db=new PGlite()
try{
  await db.exec(`do $$ declare r text; begin foreach r in array array['authenticated','anon','service_role'] loop
    if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if;end loop;end $$;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role',true),''),'authenticated') $$;
    create table employee_companies(id uuid primary key);`)
  const names=Object.keys(manifest.summary)
  const data={}
  for(const name of names){
    const columns=manifest.schema.filter(row=>row.table_name===name)
    for(const col of columns){
      const sequence=col.column_default?.match(/nextval\('([^']+)'::regclass\)/)?.[1]
      if(sequence)await db.exec(`create sequence if not exists ${sequence}`)
    }
    await db.exec(`create table ${q(name)}(${columns.map(col=>`${q(col.column_name)} ${col.udt_name==='timestamptz'?'timestamptz':col.udt_name}${col.is_nullable==='NO'?' not null':''}${col.column_default?` default ${col.column_default}`:''}`).join(',')})`)
    data[name]=JSON.parse(await readFile(join(directory,`${name}.local.json`),'utf8'))
    for(const row of data[name]){
      const keys=Object.keys(row)
      await db.query(`insert into ${q(name)}(${keys.map(q).join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(key=>typeof row[key]==='object'&&row[key]!==null?JSON.stringify(row[key]):row[key]))
    }
  }
  await db.exec('insert into auth.users select id from profiles;insert into employee_companies select distinct company_id from employees where company_id is not null;')
  // Primary/unique keys must exist before foreign keys referencing them.
  for(const constraint of [...manifest.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN'))-Number(b.definition.startsWith('FOREIGN')))){
    await db.exec(`alter table ${q(constraint.relation)} add constraint ${q(constraint.conname)} ${constraint.definition}`)
  }
  for(const f of manifest.functions)await db.exec(f.definition)
  for(const t of manifest.triggers)await db.exec(t.definition)
  for(const v of manifest.views)await db.exec(`create view ${q(v.viewname)} as ${v.definition}`)
  for(const policy of manifest.policies){
    const roles=policy.roles.replace(/[{}]/g,'').split(',').map(q).join(',')
    await db.exec(`alter table ${q(policy.tablename)} enable row level security;
      create policy ${q(policy.policyname)} on ${q(policy.tablename)} as ${policy.permissive} for ${policy.cmd} to ${roles}${policy.qual?` using(${policy.qual})`:''}${policy.with_check?` with check(${policy.with_check})`:''}`)
  }
  const originalColumns=Object.fromEntries(names.map(name=>[name,manifest.schema.filter(col=>col.table_name===name).map(col=>q(col.column_name)).join(',')]))
  const digests=async()=>{
    const out={}
    for(const name of names){const rows=(await db.query(`select ${originalColumns[name]} from ${q(name)}`)).rows;out[name]={count:rows.length,sha256:hash(rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))}}
    return out
  }
  const before=await digests()
  const admin=data.profiles.find(row=>row.role==='admin')
  assert.ok(admin,'Production admin required for offline processing verification')
  await db.exec(`set test.uid=${lit(admin.id)}`)
  if(archiveRelease){
    const contracts=(await db.query("select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%zkt%' or p.proname='can_use_sacs_sso') order by 1")).rows
    for(const name of ['former_employees.sql','employee_archive_feature_flags.sql'])await db.exec(await readFile(new URL(`../../supabase/${name}`,import.meta.url),'utf8'))
    assert.deepEqual(await digests(),before)
    assert.deepEqual((await db.query("select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%zkt%' or p.proname='can_use_sacs_sso') order by 1")).rows,contracts)
    assert.equal((await db.query('select count(*)::int n from employee_feature_flags where enabled')).rows[0].n,0)
    await db.exec('grant usage on schema public,auth to authenticated,anon; grant select,insert on employees to authenticated; set role authenticated')
    await assert.rejects(db.query('select list_former_employees()'),/archive is OFF/)
    assert.equal((await db.query('select count(*)::int n from employee_employment_periods')).rows[0].n,0)
    await assert.rejects(db.exec("update employee_feature_flags set enabled=true"),error=>error.code==='42501')
    const active=data.employees.find(e=>e.active===true)
    await assert.rejects(db.query("select change_employee_employment($1,'terminate',current_date)",[active.id]),/feature flag .* OFF/)
    await assert.rejects(db.query("select change_employee_employment_pre_flags($1,'terminate',current_date)",[active.id]),error=>error.code==='42501')
    await db.exec("reset role; update employee_feature_flags set enabled=true where flag='former_employees_archive_readonly'; set role authenticated")
    assert.equal((await db.query('select count(*)::int n from list_former_employees()')).rows[0].n,8)
    assert.equal((await db.query('select count(*)::int n from employee_employment_periods')).rows[0].n,65)
    await db.exec("set test.uid='00000000-0000-4000-8000-000000000099'")
    await assert.rejects(db.query('select list_former_employees()'),/Admin access/)
    assert.equal((await db.query('select count(*)::int n from employees where active is not true')).rows[0].n,0)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select list_former_employees()'),error=>error.code==='42501')
    await db.exec(`reset role; set test.uid=${lit(admin.id)}; update employee_feature_flags set enabled=false`)
    await assert.rejects(db.exec("update employee_feature_flags set enabled=true where flag='employee_terminate'"),/separately verified/)
    await assert.rejects(db.exec("update employee_feature_flags set enabled=true where flag='employee_rehire'"),/separately verified/)
    await assert.rejects(db.exec("update employee_feature_flags set enabled=true where flag='employee_number_reuse'"),/separately verified/)
    const synthetic='00000000-0000-4000-8000-000000000098'
    await db.exec('set role authenticated')
    await db.query("insert into employees(id,employee_number,first_name,last_name,active,hire_date,plant_location) values($1,10000,'Synthetic','Phase5',true,current_date,'NJ')",[synthetic])
    await db.exec('reset role')
    const after=await digests()
    for(const name of names.filter(n=>n!=='employees'))assert.deepEqual(after[name],before[name])
    const restored=(await db.query(`select ${originalColumns.employees} from employees where id<>$1`,[synthetic])).rows
    assert.equal(hash(restored.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))),before.employees.sha256)
    assert.equal((await db.query('select count(*)::int n from employees where id=$1',[synthetic])).rows[0].n,1)
    assert.equal((await db.query('select count(*)::int n from employee_employment_periods where employee_id=$1',[synthetic])).rows[0].n,1)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select list_former_employees()'),/archive is OFF/)
    assert.equal((await db.query('select count(*)::int n from employees where active is true')).rows[0].n,58)
    await db.exec('reset role')
    const report={passed:true,engine,mode:'scoped source-history replay; not full-dump restore',verified_at:new Date().toISOString(),tables_preserved:names.length,source_counts:{active:57,former:8},flags_default_off:true,permissions:true,legacy_contracts_preserved:contracts.length,ordinary_creation:true,rollback:'flags OFF; additive schema retained; post-migration employee/period preserved',original_tables:before}
    await writeFile(join(directory,'phase5-archive-verification.private.json'),JSON.stringify(report,null,2))
    console.log(JSON.stringify({...report,original_tables:undefined}))
  }else{
  for(const name of ['former_employees.sql','zkt_event_identity.sql','employee_lifecycle.sql','employee_release_gates.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/${name}`,import.meta.url),'utf8'))
    if(name==='employee_lifecycle.sql')assert.equal((await db.query('select actions_enabled from employee_release_config')).rows[0].actions_enabled,false)
  }
  assert.equal((await db.query('select actions_enabled from employee_release_config')).rows[0].actions_enabled,false)
  assert.equal((await db.query('select reuse_enabled from employee_number_config')).rows[0].reuse_enabled,false)
  await db.query('select process_zkt_attendance_to_work_logs()')
  const after=await digests()
  assert.deepEqual(after,before,'Migration or processing changed an original record')
  const counts=(await db.query(`select (select count(*)::int from zkt_identity_events) raw,(select count(*)::int from zkt_event_ownership) owned,
    (select count(*)::int from zkt_identity_review) review,(select count(*)::int from employees where active is true) active,
    (select count(*)::int from employees where active is not true) former`)).rows[0]
  assert.equal(counts.raw,10578);assert.equal(counts.owned,0);assert.equal(counts.active,57);assert.equal(counts.former,8)
  const policies=(await db.query('select schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check from pg_policies')).rows
  for(const old of manifest.policies)assert.deepEqual(policies.find(p=>p.tablename===old.tablename&&p.policyname===old.policyname),old,'Original RLS policy changed')
  const report={source_audit_at:manifest.checked_at,verified_at:new Date().toISOString(),mode:`${engine}; production untouched`,counts,original_tables:after,original_policies_preserved:manifest.policies.length}
  await writeFile(join(directory,process.argv.includes('--postgres')?'postgres-migration-verification.local.json':'offline-migration-verification.local.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:true,engine,counts,tables_preserved:names.length,policies_preserved:manifest.policies.length}))
  }
}finally{await db.close()}
