import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {ROOT,BACKUPS,ident,literal,readJson,writeJson,run,docker,sql,assertCluster,cleanupWork} from './runtime-utils.mjs'
const snapshotArg=process.argv[process.argv.indexOf('--snapshot')+1]
async function main(){
let lock,work,previousStatus,previousCompose
try{
 const config=await readJson(path.join(ROOT,'config.json'))
 if(config.project!=='eeobivvwjzakbweluwtm'||config.clusterName!=='farmplast-payroll-standby')throw Error('Unexpected standby configuration')
 if(config.mode!=='standby'){console.log(JSON.stringify({status:'skipped_active_standby',mode:config.mode}));return}
 const snapshot=path.resolve(snapshotArg||'')
 if(path.dirname(snapshot)!==path.resolve(BACKUPS,'snapshots')||!/^(?:\d{4}-(?:W\d{2}|\d{2})|manual-[A-Za-z0-9-]+)$/.test(path.basename(snapshot)))throw Error('Unexpected snapshot directory')
 const manifest=await readJson(path.join(snapshot,'manifest.json'))
 if(manifest.project!==config.project||manifest.status!=='verified'||!manifest.verification?.rowDigestsMatch)throw Error('Snapshot is not verified')
 const lockFile=path.join(ROOT,'private','refresh.lock')
 lock=await fs.open(lockFile,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}))
 const lockedConfig=await readJson(path.join(ROOT,'config.json'))
 if(lockedConfig.mode!=='standby'){console.log(JSON.stringify({status:'skipped_active_standby',mode:lockedConfig.mode}));return}
 previousStatus=await readJson(path.join(ROOT,'runtime','status.json'))
 const newerSnapshot=previousStatus.ready&&Date.parse(previousStatus.snapshotAt)>Date.parse(manifest.createdAt)
 if(previousStatus.ready&&previousStatus.storageReady&&(previousStatus.snapshotHash===manifest.encryptedSha256||newerSnapshot)){
  await assertCluster()
  const credentials=await readJson(path.join(ROOT,'private','credentials.json'))
  const [auth,rest,storage]=await Promise.all([
   fetch('http://127.0.0.1:18623/health',{signal:AbortSignal.timeout(10000)}),
   fetch('http://127.0.0.1:18621/',{headers:{Authorization:'Bearer '+credentials.serviceKey},signal:AbortSignal.timeout(10000)}),
   fetch('http://127.0.0.1:18624/status',{signal:AbortSignal.timeout(10000)})
  ])
  if(!auth.ok||!rest.ok||!storage.ok)throw Error('Existing standby services are unavailable')
  const mode=(await sql(previousStatus.generation,'select mode from _farmplast_reserve.state where id;')).trim()
  if(mode!=='standby')throw Error('Existing database is not fenced read-only')
  console.log(JSON.stringify({status:newerSnapshot?'kept_newer_snapshot':'already_current',snapshotAt:previousStatus.snapshotAt,tables:previousStatus.tables,photos:previousStatus.photos}));return
 }
 await assertCluster()
 work=path.join(ROOT,'work','refresh-'+crypto.randomUUID());await fs.mkdir(work)
 const helpers=await import(pathToFileURL(path.join(BACKUPS,'scripts','monthly-payroll.mjs')).href)
 const key=await readJson(path.join(BACKUPS,'private','archive-key.json')),archive=path.join(snapshot,'payroll.tar.enc')
 if(key.keyId!==manifest.keyId||await helpers.sha256(archive)!==manifest.encryptedSha256)throw Error('Snapshot authentication mismatch')
 await helpers.verifyArchive(archive,Buffer.from(key.key,'base64'),manifest.plaintextSha256)
 const tar=path.join(work,'payload.tar'),payload=path.join(work,'payload');await fs.mkdir(payload)
 await helpers.decryptArchive(archive,tar,Buffer.from(key.key,'base64'))
 await run('C:/Windows/System32/tar.exe',['-xf',tar,'-C',payload])
 const roles=await readJson(path.join(payload,'roles.json')),before=await readJson(path.join(payload,'table-checksums.json')),context=await readJson(path.join(payload,'context.json'))
 const credentials=await readJson(path.join(ROOT,'private','credentials.json'))
 if(!credentials.storagePassword){credentials.storagePassword=crypto.randomBytes(36).toString('base64url');await writeJson(path.join(ROOT,'private','credentials.json'),credentials)}
 let roleSql=''
 for(const role of roles){
  if(role.rolname==='postgres'||role.rolname.startsWith('pg_'))continue
  roleSql+="DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname="+literal(role.rolname)+") THEN EXECUTE "+literal('CREATE ROLE '+ident(role.rolname)+' NOLOGIN')+"; END IF; END$$;\n"
  roleSql+='ALTER ROLE '+ident(role.rolname)+' '+(role.rolinherit?'INHERIT':'NOINHERIT')+' '+(role.rolbypassrls?'BYPASSRLS':'NOBYPASSRLS')+';\n'
 }
 roleSql+='ALTER ROLE supabase_auth_admin LOGIN PASSWORD '+literal(credentials.authPassword)+'; ALTER ROLE supabase_auth_admin SET search_path=auth,public,extensions;\n'
 roleSql+='ALTER ROLE authenticator LOGIN NOINHERIT PASSWORD '+literal(credentials.restPassword)+'; GRANT anon,authenticated,service_role TO authenticator;\n'
 roleSql+='ALTER ROLE supabase_storage_admin LOGIN PASSWORD '+literal(credentials.storagePassword)+'; ALTER ROLE supabase_storage_admin SET search_path=storage,public,extensions;\n'
 roleSql+='GRANT anon,authenticated,service_role TO supabase_storage_admin;\n'
 await sql('payroll_base',roleSql)
 const generation='payroll_'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'_'+crypto.randomBytes(3).toString('hex')
 await sql('payroll_base','CREATE DATABASE '+ident(generation)+' TEMPLATE template0 ENCODING '+literal('UTF8')+';')
 await sql(generation,'CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;')
 const bin='E:/SimScopeData/Backups/FarmplastPayroll/tools/pgsql/bin/pg_restore.exe'
 const dump=path.join(payload,'database.dump'),list=path.join(work,'restore.list')
 await fs.writeFile(list,helpers.restoreListWithoutBootstrapSchemas(await run(bin,['--list',dump])))
 const importName='farmplast-'+crypto.randomUUID()
 await docker(['cp',dump,'farmplast-payroll-db:/tmp/'+importName+'.dump'])
 await docker(['cp',list,'farmplast-payroll-db:/tmp/'+importName+'.list'])
 try{await docker(['exec','farmplast-payroll-db','pg_restore','-U','postgres','--exit-on-error','--use-list=/tmp/'+importName+'.list','--dbname='+generation,'/tmp/'+importName+'.dump'])}
 finally{await docker(['exec','farmplast-payroll-db','rm','-f','/tmp/'+importName+'.dump','/tmp/'+importName+'.list'])}
 const restored=JSON.parse((await sql(generation,helpers.tableDigestSql(context.schemas)+';')).trim())
 if(JSON.stringify(before)!==JSON.stringify(restored))throw Error('Standby restored contents differ from snapshot')
 await sql(generation,[
  'CREATE SCHEMA _farmplast_reserve AUTHORIZATION postgres;',
  'REVOKE ALL ON SCHEMA _farmplast_reserve FROM PUBLIC,anon,authenticated,service_role;',
  'CREATE TABLE _farmplast_reserve.state(id boolean PRIMARY KEY DEFAULT true CHECK(id),mode text NOT NULL CHECK(mode IN(\'standby\',\'active\')),snapshot_at timestamptz NOT NULL);',
  'INSERT INTO _farmplast_reserve.state VALUES(true,\'standby\','+literal(manifest.createdAt)+');',
  "CREATE FUNCTION _farmplast_reserve.block_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF (SELECT mode FROM _farmplast_reserve.state WHERE id) <> 'active' THEN RAISE EXCEPTION 'Payroll reserve is read-only until activation' USING ERRCODE='25006';END IF;IF TG_OP='DELETE' THEN RETURN OLD;ELSIF TG_LEVEL='STATEMENT' THEN RETURN NULL;ELSE RETURN NEW;END IF;END$$;",
  'REVOKE ALL ON FUNCTION _farmplast_reserve.block_writes() FROM PUBLIC,anon,authenticated,service_role;',
  "DO $$DECLARE r record;BEGIN FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','employee_presence_private','farmplast_zkt_private') AND c.relkind IN('r','p') LOOP EXECUTE format('CREATE TRIGGER farmplast_reserve_ro_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION _farmplast_reserve.block_writes()',r.nspname,r.relname);EXECUTE format('CREATE TRIGGER farmplast_reserve_ro_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION _farmplast_reserve.block_writes()',r.nspname,r.relname);END LOOP;END$$;",
  'GRANT CONNECT ON DATABASE '+ident(generation)+' TO authenticator,supabase_auth_admin,supabase_storage_admin;'
 ].join('\n'))
 const admin=JSON.parse((await sql(generation,"select jsonb_build_object('user',(select id from public.profiles where role='admin' order by id limit 1),'employee',(select id from public.employees order by id limit 1));")).trim())
 let blocked=false
 try{await sql(generation,"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claims',"+literal(JSON.stringify({sub:admin.user,role:'authenticated'}))+",true);UPDATE public.employees SET first_name=first_name WHERE id="+literal(admin.employee)+"::uuid;ROLLBACK;")}
 catch(error){if(error.diagnostic?.includes('Payroll reserve is read-only'))blocked=true;else throw error}
 if(!blocked)throw Error('Standby database write guard failed')
 const photos=await readJson(path.join(payload,'storage-objects.json')),release=path.join(ROOT,'releases',generation)
 await fs.mkdir(path.join(release,'photos'),{recursive:true})
 const photoMap={}
 for(const photo of photos){
  const source=path.resolve(payload,photo.file)
  if(!source.startsWith(path.resolve(payload)+path.sep)||await helpers.sha256(source)!==photo.sha256)throw Error('Photo authentication mismatch')
  await fs.copyFile(source,path.join(release,'photos',photo.id+'.blob'))
  photoMap[photo.name]={file:photo.id+'.blob',type:photo.metadata?.mimetype||'application/octet-stream',size:photo.bytes}
 }
 await writeJson(path.join(release,'photos.json'),photoMap)
 const composeFile=path.join(ROOT,'private','compose.json')
 previousCompose=await fs.readFile(composeFile,'utf8')
 const compose=JSON.parse(previousCompose.replace(/^\uFEFF/,''))
 compose.services.auth.environment.GOTRUE_DB_DATABASE_URL='postgresql://supabase_auth_admin:'+credentials.authPassword+'@db:5432/'+generation+'?sslmode=disable'
 compose.services.rest.environment.PGRST_DB_URI='postgresql://authenticator:'+credentials.restPassword+'@db:5432/'+generation+'?sslmode=disable'
 compose.services.storage={image:config.images.storage||'supabase/storage-api@sha256:92c5fe87ba5291915d0c21ca530ece9a58e13cc76a36a6c84fc69121a8dde799',pull_policy:'never',container_name:'farmplast-payroll-storage',restart:'unless-stopped',profiles:['api'],ports:['127.0.0.1:18624:5000'],
  environment:{ANON_KEY:credentials.anonKey,SERVICE_KEY:credentials.serviceKey,POSTGREST_URL:'http://rest:3000',PGRST_JWT_SECRET:credentials.jwtSecret,AUTH_JWT_SECRET:credentials.jwtSecret,DATABASE_URL:'postgresql://supabase_storage_admin:'+credentials.storagePassword+'@db:5432/'+generation+'?sslmode=disable',FILE_SIZE_LIMIT:'52428800',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',TENANT_ID:generation,REGION:'local',GLOBAL_S3_BUCKET:'payroll',ENABLE_IMAGE_TRANSFORMATION:'false',LOG_LEVEL:'error'},
  volumes:['payroll-storage:/var/lib/storage']}
 compose.volumes['payroll-storage']={name:'farmplast-payroll-standby-storage'}
 await writeJson(path.join(ROOT,'runtime','status.json'),{...previousStatus,ready:false,refreshing:true})
 await writeJson(composeFile,compose)
 await docker(['compose','-p','farmplast-payroll-standby','-f',composeFile,'up','-d','--no-deps','--pull','never','auth','rest','storage'])
 let healthy=false
 for(let attempt=0;attempt<45;attempt++){
  try{
   const auth=await fetch('http://127.0.0.1:18623/health',{signal:AbortSignal.timeout(3000)})
   const rest=await fetch('http://127.0.0.1:18621/',{headers:{Authorization:'Bearer '+credentials.serviceKey},signal:AbortSignal.timeout(3000)})
   const storage=await fetch('http://127.0.0.1:18624/status',{signal:AbortSignal.timeout(3000)})
   if(auth.ok&&rest.ok&&storage.ok){healthy=true;break}
  }catch{}
  await new Promise(yes=>setTimeout(yes,1000))
 }
 if(!healthy)throw Error('Restored Auth/REST services did not become healthy')
 for(const photo of photos){
  const endpoint='http://127.0.0.1:18624/object/employee-photos/'+photo.name.split('/').map(encodeURIComponent).join('/')
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+credentials.serviceKey,apikey:credentials.serviceKey,'x-upsert':'true','Content-Type':photo.metadata?.mimetype||'application/octet-stream'},body:await fs.readFile(path.join(release,'photos',photo.id+'.blob')),signal:AbortSignal.timeout(60000)})
  if(!response.ok){const error=Error('Local Storage materialization failed: HTTP '+response.status);error.diagnostic=await response.text();throw error}
  const check=await fetch('http://127.0.0.1:18624/object/public/employee-photos/'+photo.name.split('/').map(encodeURIComponent).join('/'),{signal:AbortSignal.timeout(60000)})
  if(!check.ok||crypto.createHash('sha256').update(Buffer.from(await check.arrayBuffer())).digest('hex')!==photo.sha256)throw Error('Local Storage photo integrity check failed')
 }
 const state={mode:'standby',ready:true,source:'Supabase',snapshotAt:manifest.createdAt,snapshotHash:manifest.encryptedSha256,generation,release,
  tables:manifest.verification.tables,photos:photos.length,protectedTables:before.filter(t=>/^(public|employee_presence_private|farmplast_zkt_private)\./.test(t.relation)).length,
  rowDigestsMatch:true,databaseWriteGuard:true,storageReady:true,refreshedAt:new Date().toISOString()}
 await writeJson(path.join(ROOT,'runtime','status.json'),state)
 await writeJson(path.join(ROOT,'private','current-generation.json'),state)
 await cleanupWork(work);work=null
 console.log(JSON.stringify({status:'updated',snapshotAt:state.snapshotAt,tables:state.tables,photos:state.photos,databaseWriteGuard:true,generation}))
}catch(error){
 let rollbackHealthy=true
 if(work){await writeJson(path.join(work,'failure.json'),{error:error.message,failedAt:new Date().toISOString()});if(error.diagnostic)await fs.writeFile(path.join(work,'diagnostic-private.log'),error.diagnostic)}
 if(previousCompose){
  await fs.writeFile(path.join(ROOT,'private','compose.json'),previousCompose)
  if(previousStatus?.ready)await docker(['compose','-p','farmplast-payroll-standby','-f',path.join(ROOT,'private','compose.json'),'up','-d','--no-deps','--pull','never','auth','rest','storage']).catch(()=>{rollbackHealthy=false})
 }
 if(previousStatus&&lock)await writeJson(path.join(ROOT,'runtime','status.json'),{...previousStatus,ready:previousStatus.ready&&rollbackHealthy,lastRefreshError:error.message})
 console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1
}finally{if(lock){await lock.close();await fs.unlink(path.join(ROOT,'private','refresh.lock'))}}
}
await main()
