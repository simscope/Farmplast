import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ClimateAudit} from '../audit.mjs';import {createClimateFetch} from '../../integration/fetch-existing-runtime.mjs';
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'climate-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('Audit records denied bearer and confirmed revision without leaking headers, bodies, query secrets or response keys',async t=>{
 const dir=temp(t),r=createClimateFetch({dir,adminKey:'a'.repeat(64)}),id='PA-CLIM-AABBCCDDEEFF';const p=r.store.addDevice(id,'pa-zone-2','PA-ESP32-WROOM32E-N4-R1');
 const report={protocol_version:1,device_id:id,model:'PA-ESP32-WROOM32E-N4-R1',firmware:'pa-climate-msi-2.1.0',boot_id:'audit',sensor_1_f:null,sensor_2_f:null,temperature_f:null,sensor_count:0,revision:1,target_f:72,mode:'AUTO',heat:false,password:'never-log-this-wifi-password'};
 const call=(key)=>r.route(new Request('https://farmplast.vercel.app/climate/v1/exchange?sig=never-log-this-url-token',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(report)}));
 assert.equal((await call('invalid-bearer-do-not-log-this')).status,401);assert.equal((await call(p.device_token)).status,200);
 const text=fs.readFileSync(path.join(dir,'audit/climate-http.ndjson'),'utf8'),lines=text.trim().split('\n').map(JSON.parse);assert.equal(lines[0].reason,'device_authentication_failed');assert.equal(lines[1].confirmed_revision,1);assert.equal(lines[1].zone_id,'pa-zone-2');
 for(const secret of ['never-log-this','invalid-bearer-do-not-log-this',p.device_token,p.ota_hmac_key,'Authorization','password'])assert.ok(!text.includes(secret),secret);
});
test('Audit retention is bounded and unexpected fields cannot enter persisted logs',t=>{
 const dir=temp(t),audit=new ClimateAudit(dir,{maxBytes:1024,keep:2});for(let n=0;n<100;n++)audit.record({status:401,route:'exchange',reason:'authentication_failed',authorization:'denied',body:'secret-body',headers:{authorization:'secret-token'},raw_url:'secret-url'});
 const files=fs.readdirSync(dir);assert.equal(files.length,3);for(const f of files){const b=fs.readFileSync(path.join(dir,f));assert.ok(b.length<=1024);assert.ok(!b.toString().includes('secret-'));for(const line of b.toString().trim().split('\n'))assert.equal(JSON.parse(line).status,401);}
});
test('Oversized telemetry is rejected without an audit-stream deadlock or payload logging',async t=>{
 const dir=temp(t),r=createClimateFetch({dir,adminKey:'a'.repeat(64)});
 const request=new Request('https://farmplast.vercel.app/climate/v1/exchange',{method:'POST',body:JSON.stringify({password:'do-not-log-large-body'.repeat(10000)})});
 let timer;try{const result=await Promise.race([r.route(request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('audit deadlock')),2000)})]);assert.equal(result.status,413);}finally{clearTimeout(timer);}
 const log=fs.readFileSync(path.join(dir,'audit/climate-http.ndjson'),'utf8');assert.ok(!log.includes('do-not-log-large-body'));assert.equal(JSON.parse(log).reason,'request_too_large');
});
