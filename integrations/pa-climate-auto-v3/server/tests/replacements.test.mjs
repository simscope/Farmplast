import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createClimateHandler} from '../app.mjs';
import {createClimateFetch} from '../../integration/fetch-existing-runtime.mjs';
import {hmac} from '../storage.mjs';
const model='PA-ESP32-WROOM32E-N4-R1',bf='PA-CLIM-209BA98DBF90';
function fixture(t,occupied=true){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-replacement-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const config={dir,adminKey:'k'.repeat(48)},api=createClimateHandler(config),{store,replacements:r}=api;let old;if(occupied)old=store.addDevice('PA-CLIM-AABBCCDDEE11','pa-zone-1',model);else{store.state.zones['pa-zone-1']={id:'pa-zone-1',name:'Zone 1',desired:{revision:1,target_f:50,mode:'OFF',manual_heat:false}};store.persist();}const others=[['PA-CLIM-209BA98CD370','pa-zone-2'],['PA-CLIM-209BA98CD258','pa-zone-3'],['PA-CLIM-209BA98DBF2C','pa-zone-4']].map(([id,zone])=>store.addDevice(id,zone,model));return {dir,config,api,store,r,old,others};}
function create(f){return f.r.create({zone_id:'pa-zone-1',old_device_id:f.old?.device_id??null,request_id:crypto.randomUUID(),expected_device_id:bf},'operator');}
function prepare(f,id){return f.r.prepare(id,{device_id:bf,model,firmware:'pa-climate-msi-2.1.0'});}
function ready(f,profile){const op=f.r.get(f.store.state.devices[bf].replacement_id);f.store.ingest(f.store.authenticate(bf,profile.device_token),{protocol_version:1,device_id:bf,model,firmware:'pa-climate-msi-2.1.0',boot_id:'newboot1',sensor_1_f:null,sensor_2_f:null,temperature_f:null,sensor_count:0,revision:op.saved_desired.revision,target_f:op.saved_desired.target_f,mode:'OFF',heat:false,commissioning_pending:true,hysteresis_f:op.saved_desired.hysteresis_f,min_switch_ms:op.saved_desired.min_switch_ms});}
test('BF90 staged assignment preserves settings/history and other zones; commits only after actual OFF ACK',t=>{
 const f=fixture(t);const zone=f.store.state.zones['pa-zone-1'];zone.desired={revision:8,target_f:50,mode:'AUTO',manual_heat:false,hysteresis_f:2,min_switch_ms:60000};zone.historyNote='retain';f.store.persist();
 const untouched=JSON.stringify(f.others.map(p=>[f.store.state.devices[p.device_id],f.store.state.zones[p.zone_id]]));const op=create(f),p=prepare(f,op.id);
 assert.equal(f.r.assignment('pa-zone-1'),f.old.device_id);assert.equal(f.r.stagedDesired(f.store.state.devices[bf]).mode,'OFF');
 assert.throws(()=>f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:false}),/fresh OFF/);
 ready(f,p);assert.equal(f.r.view(f.r.get(op.id)).status,'ready');
 const result=f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:false});assert.equal(result.status,'completed');assert.equal(f.r.assignment('pa-zone-1'),bf);assert.equal(zone.desired.mode,'OFF');assert.equal(zone.desired.target_f,50);assert.equal(zone.desired.hysteresis_f,2);assert.equal(zone.desired.min_switch_ms,60000);assert.equal(zone.historyNote,'retain');
 assert.equal(f.store.authenticate(f.old.device_id,f.old.device_token),null);assert.ok(f.store.authenticate(bf,p.device_token));assert.equal(f.store.state.assignment_history[0].old_device_id,f.old.device_id);assert.equal(f.store.state.assignment_history[0].new_device_id,bf);
 assert.equal(JSON.stringify(f.others.map(p=>[f.store.state.devices[p.device_id],f.store.state.zones[p.zone_id]])),untouched);
 assert.equal(f.r.commit(op.id,{new_device_id:bf,restore_mode:false}).status,'completed');assert.equal(f.store.state.assignment_history.length,1);
 assert.match(fs.readFileSync(path.join(f.store.logdir,new Date().toISOString().slice(0,10)+'.ndjson'),'utf8'),/"registration_state":"staged"/);
});
test('Retry, restart, conflict, incompatible models and cancellation never rotate or steal credentials',t=>{
 const f=fixture(t,false),request={zone_id:'pa-zone-1',old_device_id:null,expected_device_id:bf,request_id:crypto.randomUUID()};const op=f.r.create(request,'operator');assert.equal(f.r.create(request,'operator').id,op.id);
 assert.throws(()=>f.r.create({...request,request_id:crypto.randomUUID()},'other'),/already pending/);
 assert.throws(()=>f.r.prepare(op.id,{device_id:bf,model:'ESP32-C3',firmware:'pa-climate-msi-2.1.0'}),/compatible firmware/);
 assert.throws(()=>f.r.prepare(op.id,{device_id:bf,model,firmware:'pa-climate-msi-2.0.1'}),/compatible firmware/);
 const p=prepare(f,op.id),again=prepare(f,op.id);assert.deepEqual(again,p);
 assert.ok(!fs.readFileSync(f.store.file,'utf8').includes(p.device_token));
 const after=createClimateHandler(f.config);assert.deepEqual(after.replacements.prepare(op.id,{device_id:bf,model,firmware:'pa-climate-msi-2.1.0'}),p);
 f.r.cancel(op.id);assert.equal(f.store.authenticate(bf,p.device_token),null);assert.equal(f.r.assignment('pa-zone-1'),null);
 const next=create(f),nextProfile=prepare(f,next.id);assert.notEqual(nextProfile.device_token,p.device_token);assert.equal(f.store.authenticate(bf,p.device_token),null);assert.equal(f.store.state.devices[bf].previous_registrations.length,1);
});
test('Concurrent desired changes conflict; MANUAL ON restoration requires a separate explicit acknowledgement',t=>{
 const f=fixture(t);f.store.setDesired('pa-zone-1',{mode:'MANUAL',manual_heat:true,target_f:50});const op=create(f),p=prepare(f,op.id);ready(f,p);
 assert.throws(()=>f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:true}),/explicit heating/);
 f.store.setDesired('pa-zone-1',{target_f:51});assert.throws(()=>f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:true,acknowledge_heat:true}),/settings changed/);
 assert.ok(f.store.authenticate(f.old.device_id,f.old.device_token));f.r.cancel(op.id);
});
test('A failed storage commit retains the old credentials and can be retried safely',t=>{
 const f=fixture(t),op=create(f),p=prepare(f,op.id);ready(f,p);const persist=f.store.persist;
 f.store.persist=()=>{throw Error('simulated full disk')};
 assert.throws(()=>f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:false}),/not committed/);
 assert.ok(f.store.authenticate(f.old.device_id,f.old.device_token));assert.equal(f.r.assignment('pa-zone-1'),f.old.device_id);assert.equal(f.r.get(op.id).status,'prepared');assert.equal(f.store.state.assignment_history?.length??0,0);
 f.store.persist=persist;assert.equal(f.r.commit(op.id,{old_device_id:f.old.device_id,new_device_id:bf,restore_mode:false}).status,'completed');
});
test('Operation capability has no admin/commit privilege; staged exchange is OFF and revoked exchange is rejected',async t=>{
 const f=fixture(t,false),op=create(f),grant=f.r.grant(op.id),runtime=createClimateFetch(f.config);const url='https://farmplast.vercel.app/climate/workstation/replacements/'+op.id;
 const call=(u,method='GET',body,token=grant)=>runtime.route(new Request(u,{method,headers:{Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined}));
 assert.equal((await call(url,'GET',null,'wrong')).status,401);assert.equal((await call(url+'/commit','POST',{})).status,401);
 const res=await call(url+'/prepare','POST',{device_id:bf,model,firmware:'pa-climate-msi-2.1.0'});assert.equal(res.status,200);const p=await res.json();
 const telemetry={protocol_version:1,device_id:bf,model,firmware:'pa-climate-msi-2.1.0',boot_id:'boot',sensor_1_f:null,sensor_2_f:null,temperature_f:null,sensor_count:0,revision:1,target_f:50,mode:'OFF',heat:false,commissioning_pending:true};
 const result=await call('https://farmplast.vercel.app/climate/v1/exchange','POST',telemetry,p.device_token);assert.equal(result.status,200);const b=await result.json();assert.equal(b.registration_state,'staged');assert.equal(b.desired.mode,'OFF');assert.equal(b.desired.target_f,50);
 runtime.store.state.replacements[op.id].status='cancelled';runtime.store.state.devices[bf].registration_state='revoked';runtime.store.persist();assert.equal((await call('https://farmplast.vercel.app/climate/v1/exchange','POST',telemetry,p.device_token)).status,401);
});
test('Committed replacement rejects the previous bearer and previously signed OTA links',async t=>{
 const f=fixture(t),op=create(f),p=prepare(f,op.id),sha='a'.repeat(64),old=f.store.state.devices[f.old.device_id],oldKey=old.ota_key;
 f.store.state.jobs['old-job']={device_id:old.device_id,status:'delivered',sha256:sha};f.store.persist();ready(f,p);f.r.commit(op.id,{old_device_id:old.device_id,new_device_id:bf,restore_mode:false});assert.equal(f.store.state.jobs['old-job'].status,'cancelled');
 const runtime=createClimateFetch(f.config),exchange=await runtime.route(new Request('https://farmplast.vercel.app/climate/v1/exchange',{method:'POST',headers:{Authorization:'Bearer '+f.old.device_token},body:JSON.stringify({device_id:old.device_id})}));assert.equal(exchange.status,401);
 const exp=Math.floor(Date.now()/1000)+300,sig=hmac(oldKey,`${old.device_id}\n${sha}\n${exp}`),download=await runtime.route(new Request(`https://farmplast.vercel.app/climate/v1/firmware/${sha}?device=${old.device_id}&exp=${exp}&sig=${sig}`));assert.equal(download.status,403);
});
