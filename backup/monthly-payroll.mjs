import fs from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {pipeline} from 'node:stream/promises'
import {Writable, Transform} from 'node:stream'

const ROOT=path.resolve('E:/SimScopeData/Backups/FarmplastPayroll')
const MAGIC=Buffer.from('FPPAY01\n')
export function safeChild(root,child){
 const result=path.resolve(root,child)
 if(result===path.resolve(root)||!result.startsWith(path.resolve(root)+path.sep))throw Error('Path escapes backup directory')
 return result
}
export async function sha256(file){
 const hash=crypto.createHash('sha256')
 await pipeline(createReadStream(file),new Writable({write(chunk,_,next){hash.update(chunk);next()}}))
 return hash.digest('hex')
}
export async function encryptArchive(input,output,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv)
 cipher.setAAD(MAGIC)
 const target=createWriteStream(output,{flags:'wx'})
 target.write(Buffer.concat([MAGIC,iv]))
 await pipeline(createReadStream(input),cipher,target)
 await fs.appendFile(output,cipher.getAuthTag())
}
async function decipherFor(file,key){
 const stat=await fs.stat(file)
 if(stat.size<36)throw Error('Invalid encrypted archive')
 const handle=await fs.open(file,'r'),header=Buffer.alloc(20),tag=Buffer.alloc(16)
 try{await handle.read(header,0,20,0);await handle.read(tag,0,16,stat.size-16)}finally{await handle.close()}
 if(!header.subarray(0,8).equals(MAGIC))throw Error('Unknown encrypted archive format')
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(8))
 decipher.setAAD(MAGIC);decipher.setAuthTag(tag)
 return {stream:createReadStream(file,{start:20,end:stat.size-17}),decipher}
}
export async function verifyArchive(file,key,expectedPlaintextHash){
 const {stream,decipher}=await decipherFor(file,key),hash=crypto.createHash('sha256')
 await pipeline(stream,decipher,new Writable({write(chunk,_,next){hash.update(chunk);next()}}))
 if(hash.digest('hex')!==expectedPlaintextHash)throw Error('Decrypted archive checksum mismatch')
}
export async function decryptArchive(file,output,key){
 const {stream,decipher}=await decipherFor(file,key)
 await pipeline(stream,decipher,createWriteStream(output,{flags:'wx'}))
}
function run(executable,args,env,opts={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env,windowsHide:true,cwd:opts.cwd,stdio:opts.noOutput?'ignore':['ignore','pipe','pipe']})
  let stdout='',stderr=''
  child.stdout?.on('data',b=>{stdout+=b.toString('utf8')})
  child.stderr?.on('data',b=>{stderr+=b.toString('utf8')})
  child.on('error',reject)
  child.on('close',code=>{
   if(code===0)resolve(stdout)
   else{const error=Error(path.basename(executable)+' failed (exit '+code+')');error.diagnostic=stderr;reject(error)}
  })
 })
}
const ident=value=>'"'+value.replaceAll('"','""')+'"'
const literal=value=>"'"+value.replaceAll("'","''")+"'"
function commonEnv(config){
 return {...process.env,PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:config.user,
  PGPASSFILE:path.join(ROOT,'private','pgpass.conf'),PGSSLMODE:'verify-full',PGSSLROOTCERT:path.join(ROOT,'private','supabase-ca.crt'),
  PGCONNECT_TIMEOUT:'20',PGCLIENTENCODING:'UTF8',
  PGOPTIONS:'-c default_transaction_read_only=on -c row_security=off -c timezone=UTC -c application_name=Farmplast_MSI_Backup'}
}
function sqlClient(config,env,sql){return run(path.join(config.pgBin,'psql.exe'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],env)}
async function sqlJson(config,env,sql){return JSON.parse((await sqlClient(config,env,sql)).trim())}
async function openSnapshot(config,env){
 const child=spawn(path.join(config.pgBin,'psql.exe'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']})
 let stdout='',stderr='',resolveSnapshot,rejectSnapshot
 const snapshot=new Promise((yes,no)=>{resolveSnapshot=yes;rejectSnapshot=no})
 const done=new Promise((resolve,reject)=>{
  child.on('error',e=>{rejectSnapshot(e);reject(e)})
  child.stderr.on('data',b=>{stderr+=b.toString('utf8')})
  child.stdout.on('data',b=>{stdout+=b.toString('utf8');const match=stdout.match(/SNAPSHOT:([0-9A-F-]+)/);if(match)resolveSnapshot(match[1])})
  child.on('close',code=>{if(code===0)resolve();else{const error=Error('Source snapshot session failed');error.diagnostic=stderr;rejectSnapshot(error);reject(error)}})
 })
 done.catch(()=>{})
 child.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT 'SNAPSHOT:'||pg_export_snapshot();\n")
 const timer=setTimeout(()=>rejectSnapshot(Error('Source snapshot timed out')),25000)
 let snapshotId
 try{snapshotId=await snapshot}catch(error){child.stdin.end('ROLLBACK;\n');throw error}finally{clearTimeout(timer)}
 return {snapshotId,async close(){child.stdin.end('COMMIT;\n');await done}}
}
function inSnapshot(snapshotId,sql){return 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '+literal(snapshotId)+'; '+sql+'; COMMIT;'}
function tableDigestSql(schemas){
 return "with rels as(select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ("+schemas.map(literal).join(',')+") and c.relkind in('r','p')), calculated as(select nspname,relname,query_to_xml(format('select count(*)::text as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) as digest from %I.%I t',nspname,relname),false,true,'') as x from rels) select coalesce(jsonb_agg(jsonb_build_object('relation',nspname||'.'||relname,'rows',((xpath('/row/rows/text()',x))[1]::text)::bigint,'digest',(xpath('/row/digest/text()',x))[1]::text) order by nspname,relname),'[]'::jsonb) from calculated"
}
async function writeJson(file,value){await fs.writeFile(file,JSON.stringify(value,null,2)+'\n')}
export function restoreListWithoutBootstrapSchemas(list){
 return list.split(/\r?\n/).filter(line=>!/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+(?:public|extensions)\s/.test(line)).join('\n')
}
async function removeStage(directory){
 const snapshots=path.join(ROOT,'snapshots')
 if(path.dirname(directory)!==snapshots||!/^\.partial-[0-9a-f-]{36}$/.test(path.basename(directory)))throw Error('Refuse unsafe staging cleanup')
 await fs.rm(directory,{recursive:true,force:false})
}
async function restoreAndCompare(config,stage,before){
 const validation=path.join(stage,'validation')
 await fs.mkdir(validation)
 const password=crypto.randomBytes(32).toString('base64url'),passwordFile=path.join(validation,'password.txt'),data=path.join(validation,'data'),port=18887
 await fs.writeFile(passwordFile,password,{flag:'wx'})
 const env={...process.env,PGCLIENTENCODING:'UTF8',PGSSLMODE:'disable',PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'postgres',PGUSER:'postgres',
  PGPASSFILE:path.join(validation,'pgpass.conf'),PGOPTIONS:'-c timezone=UTC -c application_name=Farmplast_Offline_Restore_Test'}
 await fs.writeFile(env.PGPASSFILE,'127.0.0.1:'+port+':postgres:postgres:'+password+'\n')
 const exe=name=>path.join(config.pgBin,name+'.exe')
 await run(exe('initdb'),['-D',data,'-U','postgres','--encoding=UTF8','--locale=C','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile='+passwordFile],env)
 let started=false
 try{
  await run(exe('pg_ctl'),['-D',data,'-l',path.join(validation,'server.log'),'-o','-p '+port+' -h 127.0.0.1 -c log_statement=none -c log_min_error_statement=panic','-w','-t','45','start'],env,{noOutput:true})
  started=true
  const roles=JSON.parse(await fs.readFile(path.join(stage,'payload','roles.json'),'utf8'))
  for(const role of roles){if(role.rolname==='postgres'||role.rolname.startsWith('pg_'))continue;await sqlClient(config,env,'CREATE ROLE '+ident(role.rolname)+' NOLOGIN')}
  await sqlClient(config,env,'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions')
  const dump=path.join(stage,'payload','database.dump'),list=path.join(validation,'restore.list')
  await fs.writeFile(list,restoreListWithoutBootstrapSchemas(await run(exe('pg_restore'),['--list',dump],env)))
  await run(exe('pg_restore'),['--exit-on-error','--no-owner','--use-list='+list,'--dbname=postgres',dump],env)
  const after=await sqlJson(config,env,tableDigestSql(config.schemas))
  if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Offline restore table contents do not match source snapshot')
  return {restored:true,tables:after.length,rows:after.reduce((sum,t)=>sum+t.rows,0),rowDigestsMatch:true}
 }finally{if(started)await run(exe('pg_ctl'),['-D',data,'-w','-t','30','-m','fast','stop'],env)}
}
async function fetchPhotos(config,stage,objects){
 const target=path.join(stage,'payload','storage','employee-photos')
 await fs.mkdir(target,{recursive:true})
 const downloaded=[]
 for(const object of objects){
  if(object.bucket_id!=='employee-photos'||!/^[0-9a-f-]{36}$/i.test(object.id))throw Error('Unexpected storage object identity')
  const url=config.source+'/storage/v1/object/public/employee-photos/'+object.name.split('/').map(encodeURIComponent).join('/')
  const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)})
  if(!response.ok||!response.body)throw Error('Employee photo download failed: HTTP '+response.status)
  const output=safeChild(target,object.id+'.blob'),md5=crypto.createHash('md5')
  await pipeline(response.body,new Transform({transform(chunk,_,next){md5.update(chunk);next(null,chunk)}}),createWriteStream(output,{flags:'wx'}))
  const bytes=(await fs.stat(output)).size
  if(Number(object.metadata?.size)!==bytes)throw Error('Employee photo size differs from source snapshot')
  const expected=String(object.metadata?.eTag||object.metadata?.etag||'').replaceAll('"','')
  if(!/^[0-9a-f]{32}$/i.test(expected)||md5.digest('hex').toLowerCase()!==expected.toLowerCase())throw Error('Employee photo checksum differs from source snapshot')
  downloaded.push({...object,file:'storage/employee-photos/'+object.id+'.blob',bytes,sha256:await sha256(output)})
 }
 return downloaded
}
export async function ensureMonth(){
 if(process.platform!=='win32')throw Error('This backup runner requires the configured MSI Windows host')
 const config=JSON.parse(await fs.readFile(path.join(ROOT,'config.json'),'utf8'))
 if(config.project!=='eeobivvwjzakbweluwtm'||config.host!=='db.eeobivvwjzakbweluwtm.supabase.co'||config.user!=='farmplast_msi_backup')throw Error('Unexpected backup source')
 const secret=JSON.parse(await fs.readFile(path.join(ROOT,'private','archive-key.json'),'utf8')),key=Buffer.from(secret.key,'base64')
 if(key.length!==32)throw Error('Invalid archive key')
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:config.timeZone,year:'numeric',month:'2-digit'}).format(new Date())
 if(!/^\d{4}-\d{2}$/.test(month))throw Error('Invalid backup month')
 const snapshots=path.join(ROOT,'snapshots'),final=path.join(snapshots,month)
 await fs.mkdir(snapshots,{recursive:true})
 try{
  const manifest=JSON.parse(await fs.readFile(path.join(final,'manifest.json'),'utf8')),archive=path.join(final,'payroll.tar.enc')
  if(manifest.status!=='verified'||manifest.month!==month||manifest.project!==config.project||manifest.keyId!==secret.keyId||!manifest.verification?.restored||!manifest.verification?.rowDigestsMatch)throw Error('Existing monthly backup is not verified')
  if(await sha256(archive)!==manifest.encryptedSha256)throw Error('Existing encrypted archive checksum failed')
  await verifyArchive(archive,key,manifest.plaintextSha256)
  return {status:'already_verified',month,createdAt:manifest.createdAt,archive,verification:manifest.verification,photos:manifest.photos}
 }catch(error){if(error.code!=='ENOENT')throw error}
 const lockFile=path.join(ROOT,'private','backup.lock'),lock=await fs.open(lockFile,'wx')
 let stage,snapshot
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),month}))
  try{await fs.access(final);throw Error('Monthly target already exists; operator review required')}catch(error){if(error.code!=='ENOENT')throw error}
  stage=path.join(snapshots,'.partial-'+crypto.randomUUID())
  const payload=path.join(stage,'payload');await fs.mkdir(payload,{recursive:true})
  const env=commonEnv(config)
  const identity=await sqlJson(config,env,"select jsonb_build_object('user',current_user,'readOnly',current_setting('transaction_read_only'),'bypassRls',(select rolbypassrls from pg_roles where rolname=current_user),'version',version(),'appWriteGrants',exists(select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','p') and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))")
  if(identity.user!==config.user||identity.readOnly!=='on'||!identity.bypassRls||identity.appWriteGrants)throw Error('Backup connection is not the expected read-only identity')
  snapshot=await openSnapshot(config,env)
  const before=await sqlJson(config,env,inSnapshot(snapshot.snapshotId,tableDigestSql(config.schemas)))
  if(!before.some(t=>t.relation==='public.employees'&&t.rows>0)||!before.some(t=>t.relation==='public.employee_payments')||!before.some(t=>t.relation==='auth.users'))throw Error('Incomplete Payroll snapshot scope')
  await writeJson(path.join(payload,'table-checksums.json'),before)
  const roles=await sqlJson(config,env,inSnapshot(snapshot.snapshotId,"select jsonb_agg(jsonb_build_object('rolname',rolname,'rolsuper',rolsuper,'rolcanlogin',rolcanlogin,'rolbypassrls',rolbypassrls,'rolinherit',rolinherit) order by rolname) from pg_roles"))
  await writeJson(path.join(payload,'roles.json'),roles)
  await fs.writeFile(path.join(payload,'roles-nologin.sql'),roles.filter(r=>!r.rolname.startsWith('pg_')&&r.rolname!=='postgres').map(r=>'CREATE ROLE '+ident(r.rolname)+' NOLOGIN;').join('\n')+'\n')
  const context=await sqlJson(config,env,inSnapshot(snapshot.snapshotId,"select jsonb_build_object('extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),'cron',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'command',command,'active',active)) from cron.job),'memberships',(select jsonb_agg(jsonb_build_object('role',r.rolname,'member',u.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member))"))
  await writeJson(path.join(payload,'context.json'),{...context,project:config.project,source:config.source,createdAt:new Date().toISOString(),identity,schemas:config.schemas,sourceRemainsLive:true,storageFilesScope:config.storageBuckets,restoreNote:'Auth provider settings, API keys, external SACS/ZKT service credentials and live PA climate storage files are not contained in this Payroll backup. Do not enable cron or expose a restored database without a separate cutover decision.'})
  const objects=await sqlJson(config,env,inSnapshot(snapshot.snapshotId,"select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'metadata',metadata,'created_at',created_at,'updated_at',updated_at) order by name),'[]'::jsonb) from storage.objects where bucket_id='employee-photos'"))
  const dumpFile=path.join(payload,'database.dump')
  await run(path.join(config.pgBin,'pg_dump.exe'),['--format=custom','--compress=6','--no-large-objects','--lock-wait-timeout=10s','--snapshot='+snapshot.snapshotId,'--file='+dumpFile,...config.schemas.map(s=>'--schema='+s)],env)
  await run(path.join(config.pgBin,'pg_restore.exe'),['--schema-only','--file='+path.join(payload,'schema.sql'),dumpFile],env)
  const photos=await fetchPhotos(config,stage,objects)
  await writeJson(path.join(payload,'storage-objects.json'),photos)
  await snapshot.close();snapshot=null
  const verification=await restoreAndCompare(config,stage,before),tar=path.join(stage,'payroll.tar')
  await run('C:/Windows/System32/tar.exe',['-cf',tar,'-C',payload,'.'],process.env)
  const plaintextSha256=await sha256(tar),encrypted=path.join(stage,'payroll.tar.enc')
  await encryptArchive(tar,encrypted,key);await verifyArchive(encrypted,key,plaintextSha256)
  const manifest={format:1,status:'verified',project:config.project,month,createdAt:new Date().toISOString(),algorithm:'aes-256-gcm',keyId:secret.keyId,
   plaintextSha256,encryptedSha256:await sha256(encrypted),encryptedBytes:(await fs.stat(encrypted)).size,verification,photos:photos.length,retention:'keep_all',
   employees:before.find(t=>t.relation==='public.employees').rows,payments:before.find(t=>t.relation==='public.employee_payments').rows,
   checks:before.find(t=>t.relation==='public.payroll_checks').rows,postgresTools:(await run(path.join(config.pgBin,'pg_dump.exe'),['--version'],process.env)).trim()}
  const publish=path.join(stage,'complete');await fs.mkdir(publish)
  await fs.rename(encrypted,path.join(publish,'payroll.tar.enc'));await writeJson(path.join(publish,'manifest.json'),manifest)
  await fs.rename(publish,final)
  await removeStage(stage);stage=null
  return {status:'created_and_verified',month,archive:path.join(final,'payroll.tar.enc'),verification,photos:photos.length,encryptedBytes:manifest.encryptedBytes}
 }catch(error){
  if(stage)await writeJson(path.join(stage,'failure.json'),{failedAt:new Date().toISOString(),message:error.message})
  if(error.diagnostic&&stage)await fs.writeFile(path.join(stage,'diagnostic-private.log'),error.diagnostic)
  throw error
 }finally{if(snapshot)await snapshot.close().catch(()=>{});await lock.close();await fs.unlink(lockFile)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await ensureMonth();await writeJson(path.join(ROOT,'last-status.json'),{...result,checkedAt:new Date().toISOString()});console.log(JSON.stringify(result))
 }catch(error){
  await writeJson(path.join(ROOT,'last-status.json'),{status:'failed',checkedAt:new Date().toISOString(),message:error.message}).catch(()=>{})
  console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1
 }
}
