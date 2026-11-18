import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {ROOT,BACKUPS,readJson,writeJson,sql,assertCluster,literal} from './runtime-utils.mjs'
await assertCluster()
const state=await readJson(path.join(ROOT,'runtime/status.json'))
assert.equal(state.mode,'standby');assert.equal(state.ready,true)
const credentials=await readJson(path.join(ROOT,'private/credentials.json'))
const fixtureFile=path.join(ROOT,'private/acceptance-user.json')
const adminHeaders={Authorization:'Bearer '+credentials.serviceKey,apikey:credentials.serviceKey,'Content-Type':'application/json'}
const auth='http://127.0.0.1:18623'
const base='http://127.0.0.1:18640'
const {tableDigestSql}=await import(pathToFileURL(path.join(BACKUPS,'scripts/monthly-payroll.mjs')).href)
const businessDigests=async()=>JSON.parse((await sql(state.generation,tableDigestSql(['public','employee_presence_private','farmplast_zkt_private'])+';')).trim())
const baselineFile=path.join(ROOT,'private/acceptance-business-digests.json')
async function profileFixture(id,create){
 assert.match(id,/^[0-9a-f-]{36}$/)
 await sql(state.generation,'BEGIN;ALTER TABLE public.profiles DISABLE TRIGGER farmplast_reserve_ro_row;'+(create?
  "INSERT INTO public.profiles(id,email,full_name,role) VALUES("+literal(id)+"::uuid,'reserve-acceptance@example.invalid','Reserve acceptance','admin');":
  'DELETE FROM public.profiles WHERE id='+literal(id)+'::uuid;')+
  'ALTER TABLE public.profiles ENABLE TRIGGER farmplast_reserve_ro_row;COMMIT;')
}
if(process.argv.includes('--cleanup')){
 const fixture=await readJson(fixtureFile)
 assert.equal(fixture.generation,state.generation)
 await profileFixture(fixture.id,false)
 const response=await fetch(auth+'/admin/users/'+fixture.id,{method:'DELETE',headers:adminHeaders})
 assert.equal(response.ok,true)
 assert.deepEqual(await businessDigests(),await readJson(baselineFile))
 assert.equal(Number((await sql(state.generation,'select count(*) from auth.users;')).trim()),fixture.originalUsers)
 const receipt=await readJson(path.join(ROOT,'runtime/acceptance-api.json'))
 await writeJson(path.join(ROOT,'runtime/acceptance-api.json'),{...receipt,fixtureRemoved:true,businessDataUnchanged:true})
 await fs.unlink(fixtureFile)
 await fs.unlink(baselineFile)
 console.log(JSON.stringify({fixtureRemoved:true,businessDataUnchanged:true}));process.exit(0)
}
let fixture
if(process.argv.includes('--resume')){
 fixture=await readJson(fixtureFile);assert.equal(fixture.generation,state.generation)
}else{
 await fs.access(fixtureFile).then(()=>{throw Error('Acceptance fixture already exists')},error=>{if(error.code!=='ENOENT')throw error})
 await writeJson(baselineFile,await businessDigests())
 fixture={email:'reserve-acceptance@example.invalid',password:crypto.randomBytes(30).toString('base64url'),generation:state.generation,originalUsers:Number((await sql(state.generation,'select count(*) from auth.users;')).trim())}
 const created=await fetch(auth+'/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email:fixture.email,password:fixture.password,email_confirm:true})})
 if(!created.ok)throw Error('Acceptance user creation failed: HTTP '+created.status)
 fixture.id=(await created.json()).id
 await writeJson(fixtureFile,fixture)
 await profileFixture(fixture.id,true)
}
const login=await fetch(base+'/supabase/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:credentials.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})})
assert.equal(login.status,200)
const session=await login.json(),cookie=login.headers.get('set-cookie')?.split(';')[0]
assert.ok(cookie)
const headers={apikey:credentials.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'}
const counts={}
for(const table of ['employees','employee_payments','payroll_checks','employee_work_logs']){
 const response=await fetch(base+'/supabase/rest/v1/'+table+'?select=id&limit=1',{headers:{...headers,Prefer:'count=exact'}})
 assert.ok([200,206].includes(response.status),table+' HTTP '+response.status)
 counts[table]=Number(response.headers.get('content-range').split('/')[1])
}
assert.equal(counts.employees,73)
const employee=await fetch(base+'/supabase/rest/v1/employees?select=id,photo_url&photo_url=not.is.null&limit=1',{headers}).then(r=>r.json())
assert.ok(employee[0].photo_url.startsWith('https://msi.tail4626fb.ts.net:9444/'))
const photoUrl=new URL(employee[0].photo_url)
const photo=await fetch(base+photoUrl.pathname,{headers:{Cookie:cookie}})
assert.equal(photo.status,200);assert.ok((await photo.arrayBuffer()).byteLength>100)
const photoMap=await readJson(path.join(state.release,'photos.json')),names=Object.keys(photoMap)
for(let start=0;start<names.length;start+=10){
 await Promise.all(names.slice(start,start+10).map(async name=>{
  const response=await fetch(base+'/supabase/storage/v1/object/public/employee-photos/'+name.split('/').map(encodeURIComponent).join('/'),{headers:{Cookie:cookie}})
  assert.equal(response.status,200)
  const actual=Buffer.from(await response.arrayBuffer()),expected=await fs.readFile(path.join(state.release,'photos',photoMap[name].file))
  assert.deepEqual(crypto.createHash('sha256').update(actual).digest(),crypto.createHash('sha256').update(expected).digest())
 }))
}
const write=await fetch(base+'/supabase/rest/v1/employees?id=eq.'+employee[0].id,{method:'PATCH',headers,body:'{"first_name":"must-not-write"}'})
assert.equal(write.status,423)
const external=await fetch(base+'/api/sync-sacs',{method:'POST',headers,body:'{}'})
assert.equal(external.status,423)
const worker=await fetch(base+'/api/reserve/bridge-health',{headers:adminHeaders}).then(r=>r.json())
assert.equal(worker.commandsEnabled,false)
const workerRead=await fetch(base+'/supabase/rest/v1/employees?select=id&limit=1',{headers:adminHeaders})
assert.equal(workerRead.status,423)
const refresh=await fetch(base+'/supabase/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:credentials.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})})
assert.equal(refresh.status,200)
const refreshed=await refresh.json()
assert.equal((await fetch(base+'/supabase/auth/v1/logout',{method:'POST',headers:{...headers,Authorization:'Bearer '+refreshed.access_token}})).status,204)
const checksTotal=Number((await sql(state.generation,'select count(*) from public.payroll_checks;')).trim())
const receipt={verifiedAt:new Date().toISOString(),generation:state.generation,counts,totalStoredChecks:checksTotal,checkRlsPreserved:true,login:true,refresh:true,logout:true,authenticatedPhotos:names.length,restWritesBlocked:true,externalWritesBlocked:true,workersBlocked:true,storageReady:state.storageReady}
await writeJson(path.join(ROOT,'runtime/acceptance-api.json'),receipt)
console.log(JSON.stringify(receipt))
