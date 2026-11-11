import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClimateFetch} from '../../integration/fetch-existing-runtime.mjs';

test('Fetch runtime preserves unrelated routes, blocks public admin with real key, and persists local registration', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-fetch-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={dir,adminKey:'a'.repeat(48)}, runtime=createClimateFetch(config);
  const call=(p,method='GET',data,key=config.adminKey)=>runtime.route(new Request('http://localhost'+p,{method,headers:{Authorization:'Bearer '+key},body:data?JSON.stringify(data):undefined}));
  assert.equal(await call('/rest/v1/'),null);
  assert.equal((await call('/climate/healthz')).status,200);
  for(const method of ['GET','POST']) assert.equal((await call('/climate/v1/admin/devices',method)).status,404);
  assert.equal((await call('/climate-local/v1/admin/zones','GET',null,'wrong')).status,401);
  const r=await call('/climate-local/v1/admin/devices','POST',{device_id:'PA-CLIM-001122334455',zone_id:'pa-zone-2',model:'PA-ESP32-WROOM32E-N4-R1'});
  assert.equal(r.status,201);
  const creds=await r.json(); assert.ok(creds.device_token);
  const reopened=createClimateFetch(config);
  assert.equal(reopened.store.zones()[0].device_id,creds.device_id);
  assert.equal((await call('/climate/v1/exchange','POST',{device_id:creds.device_id},'wrong')).status,401);
});

test('Operator uses verified Farmplast JWT and allowlist; never exposes device registration',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-auth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={dir,adminKey:'x'.repeat(48),authUrl:'https://auth.example',authAnonKey:'public',allowedUserIds:'owner'};
  let user='other';let ok=true;
  const runtime=createClimateFetch(config,{fetchImpl:async()=>Response.json({id:user},{status:ok?200:401})});
  const call=p=>runtime.route(new Request('http://localhost/climate/operator'+p,{headers:{Authorization:'Bearer '+'j'.repeat(40)}}));
  assert.equal((await call('/zones')).status,403);
  user='owner'; assert.equal((await call('/zones')).status,200);
  assert.equal((await call('/devices')).status,404);
  ok=false;assert.equal((await call('/zones')).status,401);
});

test('Factory enrollment is one use, scoped, reserves Zone 1, survives restart and can be revoked', async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-workstation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={dir,adminKey:'x'.repeat(48)};let runtime=createClimateFetch(config);
  const call=(p,method='GET',body,key)=>runtime.route(new Request('http://localhost'+p,{method,headers:key?{Authorization:'Bearer '+key}:{},body:body?JSON.stringify(body):undefined}));
  const issue=await call('/climate-local/v1/admin/workstations','POST',{name:'PA test'},config.adminKey);
  assert.equal(issue.status,201);const {ticket}=await issue.json();
  const enroll=await call('/climate/workstation/enroll','POST',{ticket});assert.equal(enroll.status,201);
  const {workstation_id,workstation_token:key}=await enroll.json();
  assert.equal((await call('/climate/workstation/devices','POST',{device_id:'PA-CLIM-70D38CA99B20',model:'PA-ESP32-WROOM32E-N4-R1'},key)).status,403);
  assert.equal((await call('/climate/workstation/enroll','POST',{ticket})).status,401);
  assert.equal((await call('/climate/workstation/devices','POST',{device_id:'PA-CLIM-112233445566',model:'PA-ESP32-WROOM32E-N4-R1',zone_id:'pa-zone-1'},key)).status,409);
  const r=await call('/climate/workstation/devices','POST',{device_id:'PA-CLIM-112233445566',model:'PA-ESP32-WROOM32E-N4-R1'},key);
  assert.equal(r.status,201);const registered=await r.json();assert.equal(registered.zone_id,'pa-zone-2');
  assert.ok(registered.device_token);assert.equal(Object.hasOwn(registered,'adminKey'),false);
  assert.equal((await call('/climate/v1/admin/zones','GET',null,key)).status,404);
  assert.equal((await call('/climate-local/v1/admin/zones','GET',null,key)).status,401);
  assert.equal((await call('/climate/workstation/ota','POST',{},key)).status,404);
  runtime=createClimateFetch(config);
  const zones=await (await call('/climate/workstation/zones','GET',null,key)).json();
  assert.ok(zones.zones.some(z=>z.id==='pa-zone-1'&&z.reserved));
  assert.equal(zones.zones.some(z=>JSON.stringify(z).includes(registered.device_token)),false);
  assert.equal((await call('/climate-local/v1/admin/workstations','DELETE',{id:workstation_id},config.adminKey)).status,200);
  assert.equal((await call('/climate/workstation/zones','GET',null,key)).status,401);
});

test('Installer ZIP reads the configured disk assets when runtime module URLs are relocated', async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-installer-assets-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const assets=path.join(dir,'mounted-module');
  const names=['automation/Auto-Add-ESP32.ps1','automation/Install-Workstation.ps1','automation/onboard.mjs','server/config.mjs','firmware/FarmplastClimate/FarmplastClimate.ino','firmware/FarmplastClimate/device_config.h','firmware/FarmplastClimate/ClimateLogic.h'];
  for(const name of names){const file=path.join(assets,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'mounted installer asset: '+name);}
  const runtime=createClimateFetch({dir,adminKey:'x'.repeat(48),publicOrigin:'https://farmplast.vercel.app/climate',authUrl:'https://auth.example',authAnonKey:'public',allowedUserIds:'owner',installerSourceDir:assets},{fetchImpl:async()=>Response.json({id:'owner'})});
  const response=await runtime.route(new Request('https://farmplast.vercel.app/climate/operator/installer',{method:'POST',headers:{Authorization:'Bearer '+'j'.repeat(40)}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/zip');
  assert.match(response.headers.get('cache-control'),/no-store/);
  const zip=Buffer.from(await response.arrayBuffer());
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  for(const name of names)assert.ok(zip.includes(Buffer.from('mounted installer asset: '+name)),name);
});
