import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import handler from '../api/pa-climate-msi.js'
import legacyHandler from '../api/pa-zone1.js'
import {createClimateGateway} from '../../telemetry/climateGateway.mjs'
import {MSI_ORIGIN} from '../server/climateWire.mjs'

test('site → signed HTTPS → MSI: operator checks, local PIN throttling, firmware and replacement routes remain intact without Realtime/Storage',async t=>{
  const originalFetch=globalThis.fetch,originalWS=globalThis.WebSocket,originalEnv={...process.env}
  t.after(()=>{globalThis.fetch=originalFetch;globalThis.WebSocket=originalWS;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv)})
  const id='00000000-0000-4000-8000-000000000001',token='synthetic-user-jwt-'.repeat(3),secret='1'.repeat(64),messages=[],network=[]
  Object.assign(process.env,{VITE_SUPABASE_URL:'https://auth.example',VITE_SUPABASE_ANON_KEY:'public-test-key',PA_CLIMATE_TARGET_PIN:'1234',PA_CLIMATE_ALLOWED_USER_IDS:id,PA_CLIMATE_TRANSPORT_KEY:secret})
  delete process.env.FARMPLAST_SERVICE_ROLE_KEY
  const legacyFile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pa-climate-')),'legacy.json')
  const gateway=createClimateGateway({target:'http://127.0.0.1:18000',secret,legacyFile,allowedUserIds:[id]},async(url,init)=>{
    messages.push({path:new URL(url).pathname,headers:init.headers,body:init.body})
    return Response.json(init.method==='GET'?{zones:[]}:{desired:{revision:2}})
  })
  const server=http.createServer(async(req,res)=>{if(!await gateway(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end()}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  let caller=id
  globalThis.WebSocket=class{constructor(){throw Error('Realtime must never be opened')}}
  globalThis.fetch=async(url,init)=>{
    network.push(String(url))
    if(String(url).includes('/auth/v1/user'))return Response.json({id:caller})
    assert.ok(String(url).startsWith(MSI_ORIGIN))
    return originalFetch(`http://127.0.0.1:${server.address().port}`+new URL(url).pathname,init)
  }
  async function run(body,authorization='Bearer '+token,fn=handler){
    const res={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this},end(value){this.value=JSON.parse(value.toString());return this}}
    await fn({method:body?'POST':'GET',headers:authorization?{authorization}:{},query:{},body},res);return res
  }
  assert.equal((await run(undefined,'')).code,401)
  assert.equal((await run()).code,200)
  assert.equal(messages[0].path,'/climate/operator/zones')
  assert.equal(messages[0].headers.authorization,'Bearer '+token)
  const before=messages.length
  assert.equal((await run({action:'set',zone_id:'pa-zone-2',target_f:72,pin:'wrong'})).code,403)
  assert.equal(messages.length,before)
  assert.equal((await run({action:'set',zone_id:'pa-zone-2',target_f:72,pin:'1234'})).code,200)
  assert.deepEqual(JSON.parse(messages.at(-1).body),{target_f:72})
  assert.equal((await run({action:'register'})).code,400)
  assert.equal((await run({action:'replacement_create',zone_id:'pa-zone-1',old_device_id:null,request_id:'00000000-0000-4000-8000-000000000009',pin:'wrong'})).code,403)
  assert.equal((await run({action:'replacement_create',zone_id:'pa-zone-1',old_device_id:null,expected_device_id:'PA-CLIM-209BA98DBF90',request_id:'00000000-0000-4000-8000-000000000009',pin:'1234'})).code,200)
  assert.equal(messages.at(-1).path,'/climate/operator/replacements')
  assert.equal(JSON.parse(messages.at(-1).body).expected_device_id,'PA-CLIM-209BA98DBF90')
  for(const action of ['replacement_installer','replacement_commit','replacement_cancel'])assert.equal((await run({action,operation_id:'00000000-0000-4000-8000-000000000009',pin:'wrong'})).code,403)
  assert.equal((await run({action:'CHECK_PIN',pin:'1234'},'Bearer '+token,legacyHandler)).code,200)
  for(let i=0;i<5;i++)assert.equal((await run({action:'CHECK_PIN',pin:'0000'},'Bearer '+token,legacyHandler)).code,403)
  assert.equal((await run({action:'CHECK_PIN',pin:'1234'},'Bearer '+token,legacyHandler)).code,429)
  caller='other';assert.equal((await run()).code,403)
  assert.ok(network.every(u=>!u.includes('/storage/')&&!u.includes('/realtime/')))
  assert.ok(fs.existsSync(legacyFile));assert.ok(!fs.readFileSync(legacyFile,'utf8').includes('1234'))
})

test('PA read polling reuses a verified identity while keeping live data and fresh mutation authentication',async t=>{
  const originalFetch=globalThis.fetch,originalEnv={...process.env}
  t.after(()=>{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv)})
  const id='00000000-0000-4000-8000-000000000002',authUrl='https://read-auth.example'
  const claims={sub:id,iss:authUrl+'/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600}
  const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic-signature'
  Object.assign(process.env,{VITE_SUPABASE_URL:authUrl,VITE_SUPABASE_ANON_KEY:'public-test-key',PA_CLIMATE_ALLOWED_USER_IDS:id,PA_CLIMATE_TRANSPORT_KEY:'2'.repeat(64)})
  let authCalls=0,samples=0,accepted=true
  globalThis.fetch=async url=>{
    if(String(url)===authUrl+'/auth/v1/user'){authCalls++;return accepted?Response.json({id}):Response.json({error:'revoked'},{status:401})}
    assert.ok(String(url).startsWith(MSI_ORIGIN+'/climate/operator/zones'))
    return Response.json({sample:++samples})
  }
  async function run(body){
    const res={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this},end(value){this.value=JSON.parse(value.toString());return this}}
    await handler({method:body?'POST':'GET',headers:{authorization:'Bearer '+token},query:{},body},res)
    return res
  }
  for(let i=1;i<=20;i++){const r=await run();assert.equal(r.code,200);assert.equal(r.value.sample,i)}
  assert.equal(authCalls,1)
  process.env.PA_CLIMATE_ALLOWED_USER_IDS='another-operator'
  assert.equal((await run()).code,403)
  assert.equal(samples,20)
  process.env.PA_CLIMATE_ALLOWED_USER_IDS=id
  accepted=false
  assert.equal((await run({action:'mode',zone_id:'pa-zone-2',mode:'OFF'})).code,401)
  assert.equal(authCalls,2)
  assert.equal((await run()).code,401)
  assert.equal(authCalls,3)
  assert.equal(samples,20)
})
