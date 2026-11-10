import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const empty = () => ({ schema: 1, devices: {}, zones: {}, releases: {}, jobs: {} });
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const versionPattern = /^[A-Za-z0-9._-]{1,64}$/;

export function validateId(id) { return typeof id === 'string' && idPattern.test(id); }
export function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
export function hmac(secret, text) { return crypto.createHmac('sha256',secret).update(text).digest('hex'); }
export function secureEqual(a,b) {
  if(typeof a!=='string' || typeof b!=='string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
export function token() { return crypto.randomBytes(32).toString('base64url'); }

export class ClimateStore {
  constructor(dir) {
    this.dir=path.resolve(dir);
    this.file=path.join(this.dir,'climate-state.json');
    this.logdir=path.join(this.dir,'telemetry');
    this.releasesdir=path.join(this.dir,'firmware');
    fs.mkdirSync(this.dir,{recursive:true});
    fs.mkdirSync(this.logdir,{recursive:true});
    fs.mkdirSync(this.releasesdir,{recursive:true});
    this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();
    if(this.state.schema!==1) throw Error('Unsupported climate state schema');
    if(!fs.existsSync(this.file)) this.persist();
  }
  persist() {
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(this.state,null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(tmp,this.file);
  }
  log(telemetry) {
    const day=new Date().toISOString().slice(0,10);
    fs.appendFileSync(path.join(this.logdir,day+'.ndjson'),JSON.stringify(telemetry)+'\n');
  }
  addDevice(deviceId,zoneId,model) {
    if(!validateId(deviceId)||!validateId(zoneId)||!validateId(model)) throw Error('Invalid identity');
    if(this.state.devices[deviceId]) throw Error('Device already registered');
    if(Object.values(this.state.devices).some(d=>d.zone_id===zoneId)) throw Error('Zone already assigned');
    const deviceToken=token(),otaKey=crypto.randomBytes(32).toString('hex');
    this.state.devices[deviceId]={device_id:deviceId,zone_id:zoneId,model,token_hash:sha256(deviceToken),ota_key:otaKey,registered_at:new Date().toISOString(),last_seen:null,last_telemetry:null};
    this.state.zones[zoneId]??={id:zoneId,name:zoneId,desired:{revision:1,target_f:72,mode:'AUTO',manual_heat:false}};
    this.persist();
    return {device_id:deviceId,zone_id:zoneId,device_token:deviceToken,ota_hmac_key:otaKey};
  }
  authenticate(deviceId,bearer) {
    const device=this.state.devices[deviceId];
    if(!device || typeof bearer!=='string' || bearer.length<30 || bearer.length>300)return null;
    return secureEqual(sha256(bearer),device.token_hash)?device:null;
  }
  setDesired(zoneId,update) {
    const zone=this.state.zones[zoneId];
    if(!zone || !Object.values(this.state.devices).some(d=>d.zone_id===zoneId))throw Error('Unknown zone');
    if(typeof update!=='object'||update===null)throw Error('Expected object');
    const d=zone.desired;
    const target=update.target_f??d.target_f;
    const mode=update.mode??d.mode;
    const manual=update.manual_heat??d.manual_heat;
    if(typeof target!=='number'||!Number.isFinite(target)||target<40||target>90 || !['AUTO','MANUAL','OFF'].includes(mode) || typeof manual!=='boolean') throw Error('Invalid desired state');
    zone.desired={revision:d.revision+1,target_f:target,mode,manual_heat:mode==='MANUAL' ? manual : false};
    this.persist();
    return zone.desired;
  }
  ingest(device,body) {
    if(body.protocol_version!==1||body.model!==device.model) throw Error('Protocol/model mismatch');
    if(!validateId(body.device_id)||body.device_id!==device.device_id)throw Error('Device mismatch');
    const v=x=>x===null||(typeof x==='number'&&Number.isFinite(x)&&x>=-40&&x<=176);
    if(!v(body.sensor_1_f)||!v(body.sensor_2_f)||!v(body.temperature_f))throw Error('Invalid temperature');
    const n=Number(body.sensor_1_f!==null)+Number(body.sensor_2_f!==null);
    if(body.sensor_count!==n || !Number.isInteger(body.revision) || body.revision<0 || typeof body.heat!=='boolean') throw Error('Invalid sensor/status fields');
    const average=n===2?(body.sensor_1_f+body.sensor_2_f)/2:n===1?(body.sensor_1_f??body.sensor_2_f):null;
    if(average===null ? body.temperature_f!==null : body.temperature_f===null||Math.abs(average-body.temperature_f)>0.25) throw Error('Average inconsistent with sensors');
    if(!['AUTO','MANUAL','OFF'].includes(body.mode)||typeof body.firmware!=='string'||!versionPattern.test(body.firmware)||!validateId(body.boot_id)||typeof body.target_f!=='number'||!Number.isFinite(body.target_f)||body.target_f<40||body.target_f>90)throw Error('Invalid runtime fields');
    const now=new Date().toISOString();
    const record={at:now,device_id:device.device_id,zone_id:device.zone_id,firmware:body.firmware,model:body.model,boot_id:body.boot_id,
      sensor_1_f:body.sensor_1_f,sensor_2_f:body.sensor_2_f,temperature_f:average,sensor_count:n,
      heat:body.heat,mode:body.mode,target_f:body.target_f,revision:body.revision,
      degraded:n===1,sensor_difference:n===2&&Math.abs(body.sensor_1_f-body.sensor_2_f)>5,
      relay_armed:body.relay_armed===true,rollback_enabled:body.rollback_enabled===true,ota_boot_validated:body.ota_boot_validated===true,last_ota_job:typeof body.last_ota_job==='string'?body.last_ota_job:null};
    this.log(record);
    device.last_seen=now;device.last_telemetry=record;
    this.persist();
    return record;
  }
  zones() {
    const now=Date.now();
    return Object.values(this.state.zones).sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true})).map(z=>{
      const d=Object.values(this.state.devices).find(x=>x.zone_id===z.id);
      const t=d?.last_telemetry??null;
      const online=!!t && now-Date.parse(t.at)<60000;
      const acknowledged=online&&t.revision===z.desired.revision&&t.mode===z.desired.mode&&Math.abs(t.target_f-z.desired.target_f)<0.01;
      return {id:z.id,name:z.name,device_id:d?.device_id??null,online,
        command_ack:{revision:z.desired.revision,acknowledged,status:!online?'offline':acknowledged?'applied':'pending'},
        desired:z.desired,reported:online?t:null,last_seen:d?.last_seen??null};
    });
  }
}
