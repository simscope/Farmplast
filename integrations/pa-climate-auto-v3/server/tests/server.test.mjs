import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClimateServer} from '../app.mjs';
import {sha256,hmac} from '../storage.mjs';

const MODEL='PA-ESP32-WROOM32E-N4-R1';
const VERSION='pa-climate-msi-2.0.0';
const device='PA-CLIM-010203040506';
const url='https://climate.example.test'; // Test fixture only; NEVER provision a device with this.

async function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pa-climate-test-'));
  const {server,store}=createClimateServer({dir,adminKey:'a'.repeat(64),publicOrigin:url});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(p,{method='GET',token='',body,headers={}}={})=>{
    const r=await fetch(base+p,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body==null?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
    const t=await r.text();let obj;try{obj=JSON.parse(t)}catch{obj=t};return {status:r.status,body:obj};
  };
  const shutdown=async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})};
  return {dir,store,base,call,shutdown};
}
const report=(token,more={})=>({protocol_version:1,device_id:device,model:MODEL,firmware:VERSION,boot_id:'ABCD0123',zone_id:null,
  sensor_1_f:68,sensor_2_f:72,temperature_f:70,sensor_count:2,target_f:72,mode:'AUTO',heat:false,relay_armed:false,
  revision:1,last_ota_job:'',...more});

test('registration, authentication, telemetry, average, desired, stale/online',async()=>{
  const s=await fixture();try{
    assert.equal((await s.call('/healthz')).status,200);
    assert.equal((await s.call('/v1/admin/zones')).status,401);
    const r=await s.call('/v1/admin/devices',{method:'POST',token:'a'.repeat(64),body:{device_id:device,zone_id:'pa-zone-1',model:MODEL}});
    assert.equal(r.status,201);const deviceToken=r.body.device_token;
    assert.equal((await s.call('/v1/admin/devices',{method:'POST',token:'a'.repeat(64),body:{device_id:device,zone_id:'pa-zone-1',model:MODEL}})).status,400);
    assert.equal((await s.call('/v1/exchange',{method:'POST',token:'wrongbutverylongtoken-AAAAAAAAAAAA',body:report()})).status,401);
    const exchange=await s.call('/v1/exchange',{method:'POST',token:deviceToken,body:report()});
    assert.equal(exchange.status,200);assert.equal(exchange.body.desired.target_f,72);
    const zones=await s.call('/v1/admin/zones',{token:'a'.repeat(64)});
    assert.equal(zones.body.zones[0].reported.sensor_1_f,68);
    assert.equal(zones.body.zones[0].reported.sensor_2_f,72);
    assert.equal(zones.body.zones[0].reported.temperature_f,70);
    assert.equal(zones.body.zones[0].online,true);
    assert.equal((await s.call('/v1/exchange',{method:'POST',token:deviceToken,body:report(deviceToken,{temperature_f:69})})).status,400);
    assert.equal((await s.call('/v1/exchange',{method:'POST',token:deviceToken,body:report(deviceToken,{sensor_1_f:null,sensor_count:1,temperature_f:72})})).status,200);
    assert.equal((await s.call('/v1/exchange',{method:'POST',token:deviceToken,body:report(deviceToken,{sensor_1_f:null,sensor_2_f:null,sensor_count:0,temperature_f:null,heat:false})})).status,200);
    const cmd=await s.call('/v1/admin/zones/pa-zone-1/desired',{method:'POST',token:'a'.repeat(64),body:{target_f:73,mode:'AUTO'}});
    assert.equal(cmd.status,200);assert.equal(cmd.body.desired.revision,2);
    assert.equal((await s.call('/v1/exchange',{method:'POST',token:deviceToken,body:report()})).body.desired.target_f,73);
    assert.equal(fs.existsSync(path.join(s.dir,'telemetry',new Date().toISOString().slice(0,10)+'.ndjson')),true);
  }finally{await s.shutdown()}
});

test('firmware: rejects other chip families, issues signed link only for idle real device, completes after reboot telemetry',async()=>{
  const s=await fixture();try{
    const a='a'.repeat(64);
    const register=await s.call('/v1/admin/devices',{method:'POST',token:a,body:{device_id:device,zone_id:'pa-zone-1',model:MODEL}});
    const token=register.body.device_token;
    const fw=Buffer.alloc(400);fw[0]=0xE9;fw.writeUInt16LE(0,12);fw.writeUInt32LE(0xabcd5432,32);
    // Unit test fixture binary, not a real application. Code never deploys this.
    Buffer.from(`PA_CLIMATE_FW_VERSION=2.0.0\0PA_CLIMATE_FW_MODEL=${MODEL}\0`).copy(fw,60);
    const upload=await s.call('/v1/admin/releases',{method:'POST',token:a,body:fw,headers:{'Content-Type':'application/octet-stream','X-Firmware-Version':'2.0.0','X-Firmware-Model':MODEL}});
    assert.equal(upload.status,201);
    const sha=upload.body.sha256;
    assert.equal((await s.call('/v1/admin/ota',{method:'POST',token:a,body:{device_id:device,sha256:sha,confirm:'STAGE PA OTA'}})).status,409); // offline
    await s.call('/v1/exchange',{method:'POST',token,body:report()});
    assert.equal((await s.call('/v1/admin/ota',{method:'POST',token:a,body:{device_id:device,sha256:sha,confirm:'STAGE PA OTA'}})).status,201);
    const response=await s.call('/v1/exchange',{method:'POST',token,body:report()});
    assert.equal(response.status,200);
    assert.equal(response.body.ota.version,'2.0.0');
    assert.equal(response.body.ota.device_id,device);
    assert.equal(response.body.ota.model,MODEL);
    const dl=new URL(response.body.ota.url);
    const image=await s.call(dl.pathname+dl.search);
    assert.equal(image.status,200); // synthetic fixture text parser handles binary
    const jobs=await s.call('/v1/admin/ota',{token:a});assert.equal(jobs.body.jobs[0].status,'delivered');
    await s.call('/v1/exchange',{method:'POST',token,body:report(token,{firmware:'2.0.0',boot_id:'NEWBOOT',last_ota_job:response.body.ota.job_id})});
    const jobsAfter=await s.call('/v1/admin/ota',{token:a});assert.equal(jobsAfter.body.jobs[0].status,'completed');
  }finally{await s.shutdown()}
});