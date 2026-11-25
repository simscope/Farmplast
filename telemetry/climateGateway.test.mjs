import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {createClimateGateway} from './climateGateway.mjs'
import {createTelemetryServer} from './server.mjs'
import {signRequest,verifyRequest,permittedPath} from '../client/server/climateWire.mjs'
import {transportFetch} from '../client/server/climateTransport.mjs'

test('signed transport authenticates body, operator headers, path, time and nonce; hidden management routes stay closed',()=>{
  const key='a'.repeat(64),body=Buffer.from('{"mode":"OFF"}'),req=new Request('https://example.test/climate/operator/zones/pa-zone-2/desired',{method:'POST',headers:{authorization:'Bearer synthetic', 'x-fp-operator-id':'operator'}})
  const at=Date.now(),headers=signRequest(key,req,body,at),seen=new Map(),path=new URL(req.url).pathname
  assert.equal(verifyRequest(key,'POST',path,new Headers(headers),body,seen,at),true)
  assert.equal(verifyRequest(key,'POST',path,new Headers(headers),body,seen,at),false)
  for(const [method,p,b,h,now]of [['GET',path,body,headers,at],['POST',path+'/x',body,headers,at],['POST',path,Buffer.from('{}'),headers,at],['POST',path,body,{...headers,'x-fp-operator-id':'other'},at],['POST',path,body,headers,at+31000]])assert.equal(verifyRequest(key,method,p,new Headers(h),b,new Map(),now),false)
  assert.equal(permittedPath('GET','/climate-local/admin',true),false)
  assert.equal(permittedPath('POST','/climate/v1/legacy-zone1',false),false)
})
test('real HTTP MSI gateway forwards only signed allowlisted requests and preserves binary OTA responses',async t=>{
  const secret='a'.repeat(64),file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cl-gateway-')),'legacy.json'),calls=[]
  const gateway=createClimateGateway({secret,target:'http://127.0.0.1:18000',legacyFile:file,allowedUserIds:['admin']},async(url,init)=>{calls.push({url,init});return new Response(Buffer.from([0,255,1]),{headers:{'Content-Type':'application/octet-stream'}})})
  const server=http.createServer(async(req,res)=>{if(!await gateway(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end()}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  const origin=`http://127.0.0.1:${server.address().port}`,realFetch=fetch
  const request=new Request('https://example.test/climate/v1/firmware/'+'a'.repeat(64),{headers:{Authorization:'Bearer controller'}})
  const out=await transportFetch({secret},request,(url,init)=>realFetch(origin+new URL(url).pathname,init))
  assert.deepEqual(Buffer.from(await out.arrayBuffer()),Buffer.from([0,255,1]));assert.equal(calls[0].init.headers.authorization,'Bearer controller')
  assert.equal((await realFetch(origin+'/climate/healthz')).status,401)
  assert.equal((await realFetch(origin+'/climate-local/zones')).status,404)
  assert.equal((await realFetch(origin+'/climate/operator/not-an-operation')).status,404)
})
test('existing NJ gateway still serves scoped telemetry with the optional climate route enabled',async t=>{
  const config={readKey:'r'.repeat(64),devices:Object.fromEntries(['chiller-1','chiller-2','chiller-3','barrels'].map((k,i)=>[k,String(i).repeat(64)])),climateProxy:{secret:'a'.repeat(64),target:'http://127.0.0.1:18000',legacyFile:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cl-nj-')),'legacy.json'),allowedUserIds:[]}}
  const server=createTelemetryServer(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  const base=`http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(base+'/healthz')).status,200)
  assert.equal((await fetch(base+'/v1/read/v_nj_monitoring_overview',{headers:{Authorization:'Bearer '+config.readKey}})).status,200)
  assert.equal((await fetch(base+'/v1/read/v_nj_monitoring_overview')).status,401)
})
