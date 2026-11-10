// Explicit synthetic HTTP validation against the EXISTING gateway, never physical proof.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadConfig} from '../server/config.mjs';
const [configFile,phase='begin']=process.argv.slice(2),c=loadConfig(configFile);
const local=c.CLIMATE_LOCAL_BASE_URL,publicBase=new URL(local).origin+'/climate';
const id='SIMULATED-GATEWAY-VALIDATION',zone='simulated-gateway-validation',model='PA-ESP32-WROOM32E-N4-R1';
const folder=path.join(c.DATA_DIR,'validation');fs.mkdirSync(folder,{recursive:true});
const sessionFile=path.join(folder,'synthetic-session.json');
async function call(base,suffix,{method='GET',token,body,headers={}}={}) {
  const r=await fetch(base+suffix,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
  return {status:r.status,body:await r.json()};
}
const admin=(suffix,options={})=>call(local,'/v1/admin'+suffix,{token:c.CLIMATE_ADMIN_KEY,...options});
let evidence={synthetic:true,physical_test:false,at:new Date().toISOString(),checks:[]};
function check(name,condition){assert.ok(condition,name);evidence.checks.push(name);}
if(phase==='begin') {
  check('existing health route', (await call(publicBase,'/healthz')).status===200);
  for(const method of ['GET','POST'])check('public admin blocked '+method,(await call(publicBase,'/v1/admin/zones',{method,token:c.CLIMATE_ADMIN_KEY})).status===404);
  check('local admin requires authentication',(await call(local,'/v1/admin/zones')).status===401);
  check('operator rejects invalid JWT',(await call(publicBase,'/operator/zones',{token:'invalid.'.repeat(5)})).status===401);
  const reg=await admin('/devices',{method:'POST',body:{device_id:id,zone_id:zone,model}});
  check('synthetic registration',reg.status===201);
  const token=reg.body.device_token;
  fs.writeFileSync(sessionFile,JSON.stringify({token}),{mode:0o600,flag:'wx'});
  const report={protocol_version:1,device_id:id,model,firmware:'SIMULATED-validation',boot_id:'SIMBOOT1',sensor_1_f:70,sensor_2_f:74,temperature_f:72,sensor_count:2,target_f:72,mode:'AUTO',heat:false,relay_armed:false,revision:1,last_ota_job:''};
  const exchange=body=>call(publicBase,'/v1/exchange',{method:'POST',token,body:{...report,...body}});
  check('device authentication rejects wrong token',(await call(publicBase,'/v1/exchange',{method:'POST',token:'x'.repeat(43),body:report})).status===401);
  check('two sensor telemetry',(await exchange({})).status===200);
  let zones=(await admin('/zones')).body.zones,entry=zones.find(z=>z.id===zone);
  check('MSI calculates average and reports both temperatures',entry.reported.sensor_1_f===70&&entry.reported.sensor_2_f===74&&entry.reported.temperature_f===72);
  check('single sensor failure accepted',(await exchange({sensor_2_f:null,temperature_f:70,sensor_count:1})).status===200);
  entry=(await admin('/zones')).body.zones.find(z=>z.id===zone);check('single sensor marked degraded',entry.reported.degraded);
  check('both disconnected accepted as no reading',(await exchange({sensor_1_f:null,sensor_2_f:null,temperature_f:null,sensor_count:0})).status===200);
  entry=(await admin('/zones')).body.zones.find(z=>z.id===zone);check('no fabricated temperature',entry.reported.temperature_f===null&&entry.reported.heat===false);
  const command=await admin('/zones/'+zone+'/desired',{method:'POST',body:{target_f:73,mode:'OFF',manual_heat:false}});
  check('command revision issued',command.status===200&&command.body.desired.revision===2);
  entry=(await admin('/zones')).body.zones.find(z=>z.id===zone);check('command pending before ACK',entry.command_ack.status==='pending');
  check('ACK report accepted',(await exchange({target_f:73,mode:'OFF',revision:2,boot_id:'SIMBOOT2'})).status===200);
  entry=(await admin('/zones')).body.zones.find(z=>z.id===zone);check('reported ACK confirmed',entry.command_ack.status==='applied');
  const fw=Buffer.alloc(400);fw[0]=0xe9;fw.writeUInt32LE(0xabcd5432,32);Buffer.from('PA_CLIMATE_FW_VERSION=SIMULATED-validation\0PA_CLIMATE_FW_MODEL='+model+'\0').copy(fw,60);
  const upload=await admin('/releases',{method:'POST',body:fw,headers:{'X-Firmware-Model':model,'X-Firmware-Version':'SIMULATED-validation'}});
  check('synthetic release upload on existing gateway',upload.status===201);
  const session=JSON.parse(fs.readFileSync(sessionFile));session.firmwareSha=upload.body.sha256;
  const ota=await admin('/ota',{method:'POST',body:{device_id:id,sha256:upload.body.sha256,confirm:'STAGE PA OTA'}});
  check('OTA blocked while real HTTPS origin missing',!c.PUBLIC_ORIGIN&&ota.status===409);
  check('unsigned firmware denied',(await call(publicBase,'/v1/firmware/'+upload.body.sha256)).status===403);
  const ticket=await admin('/workstations',{method:'POST',body:{name:'SYNTHETIC HTTP validation'}});check('workstation ticket issued',ticket.status===201);
  const enrollment=await call(publicBase,'/workstation/enroll',{method:'POST',body:{ticket:ticket.body.ticket}});check('workstation enroll via existing gateway',enrollment.status===201);
  session.workstationId=enrollment.body.workstation_id;
  fs.writeFileSync(sessionFile,JSON.stringify(session),{mode:0o600});
  check('ticket replay rejected',(await call(publicBase,'/workstation/enroll',{method:'POST',body:{ticket:ticket.body.ticket}})).status===401);
  const scoped=enrollment.body.workstation_token;
  check('scoped credential cannot operate admin',(await call(local,'/v1/admin/zones',{token:scoped})).status===401);
  check('factory Zone 1 reserved',(await call(publicBase,'/workstation/zones',{token:scoped})).body.zones.some(z=>z.id==='pa-zone-1'&&z.reserved));
  check('workstation revocation', (await admin('/workstations',{method:'DELETE',body:{id:session.workstationId}})).status===200);
  check('revoked credential rejected',(await call(publicBase,'/workstation/zones',{token:scoped})).status===401);
}else if(phase==='after-restart') {
  const session=JSON.parse(fs.readFileSync(sessionFile));
  const entry=(await admin('/zones')).body.zones.find(z=>z.id===zone);
  check('registration survives existing runtime restart',entry?.device_id===id);
  check('command survives restart',entry?.desired.revision===2&&entry.desired.target_f===73&&entry.desired.mode==='OFF');
  check('telemetry survives restart',entry?.last_seen&&entry?.reported?.boot_id==='SIMBOOT2');
  check('release metadata survives restart',(await admin('/releases')).body.releases.some(r=>r.sha256===session.firmwareSha));
}else if(phase==='cleanup-stopped-runtime') {
  const session=JSON.parse(fs.readFileSync(sessionFile));const data=path.join(c.DATA_DIR,'data'),file=path.join(data,'climate-state.json');
  const state=JSON.parse(fs.readFileSync(file));
  assert.equal(state.devices[id]?.zone_id,zone);
  delete state.devices[id];delete state.zones[zone];delete state.releases[session.firmwareSha];
  for(const [key,job]of Object.entries(state.jobs))if(job.device_id===id)delete state.jobs[key];
  fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  const bin=path.join(data,'firmware',session.firmwareSha+'.bin');if(fs.existsSync(bin))fs.unlinkSync(bin);
  const workfile=path.join(data,'workstations.json'),work=JSON.parse(fs.readFileSync(workfile));delete work.clients[session.workstationId];fs.writeFileSync(workfile,JSON.stringify(work),{mode:0o600});
  fs.unlinkSync(sessionFile);check('synthetic state removed without deleting unrelated records',true);
}else throw Error('Unknown phase');
fs.writeFileSync(path.join(folder,'gateway-'+phase+'.json'),JSON.stringify(evidence,null,2));
console.log('PASS: '+evidence.checks.length+' '+phase+' HTTP/storage checks. SYNTHETIC ONLY; no physical ESP32 or OTA proof.');
