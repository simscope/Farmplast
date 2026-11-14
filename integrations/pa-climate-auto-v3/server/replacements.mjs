import crypto from 'node:crypto';
import {Buffer} from 'node:buffer';
import {sha256,secureEqual,token} from './storage.mjs';

const model='PA-ESP32-WROOM32E-N4-R1';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const active=d=>d&&d.registration_state!=='revoked'&&d.registration_state!=='staged';
export class Replacements {
  constructor(store,secret){this.store=store;this.key=crypto.createHash('sha256').update('replacement-profile-v1:'+secret).digest();}
  seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',this.key,iv);const bytes=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return {iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:bytes.toString('base64')};}
  open(value){const d=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(value.iv,'base64'));d.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(value.data,'base64')),d.final()]).toString());}
  save(previous){try{this.store.persist();}catch{this.store.state=previous;fail('Storage write failed; operation was not committed',503);}}
  assignment(zone){return Object.values(this.store.state.devices).find(d=>active(d)&&d.zone_id===zone)?.device_id??null;}
  get(id){const op=this.store.state.replacements?.[id];if(!op)fail('Replacement not found',404);return op;}
  state(op){const d=this.store.state.devices[op.new_device_id],t=d?.last_telemetry;return op.status==='prepared'&&t&&Date.now()-Date.parse(t.at)<60000&&t.commissioning_pending&&(op.saved_desired.hysteresis_f===undefined||op.saved_desired.hysteresis_f===t.hysteresis_f)&&(op.saved_desired.min_switch_ms===undefined||op.saved_desired.min_switch_ms===t.min_switch_ms)&&t.heat===false&&t.mode==='OFF'&&t.revision===op.saved_desired.revision&&Math.abs(t.target_f-op.saved_desired.target_f)<0.01?'ready':op.status;}
  view(op){const d=this.store.state.devices[op.new_device_id];return {id:op.id,zone_id:op.zone_id,zone_name:op.zone_name,old_device_id:op.old_device_id,new_device_id:op.new_device_id??null,expected_device_id:op.expected_device_id??null,status:this.state(op),saved_desired:op.saved_desired,created_at:op.created_at,completed_at:op.completed_at??null,last_seen:d?.last_seen??null,reported:d?.last_telemetry??null};}
  list(){return Object.values(this.store.state.replacements??{}).map(op=>this.view(op)).reverse();}
  create(body,actor){
    if(!/^pa-zone-[1-9][0-9]*$/.test(body.zone_id)||!/^[-a-f0-9]{36}$/.test(body.request_id??''))fail('Invalid zone or request identity',400);
    if(body.expected_device_id&&!/^PA-CLIM-[A-F0-9]{12}$/.test(body.expected_device_id))fail('Invalid expected controller',400);
    const previous=structuredClone(this.store.state),s=this.store.state;s.replacements??={};
    const replay=Object.values(s.replacements).find(op=>op.request_id===body.request_id);
    if(replay){if(replay.zone_id!==body.zone_id||replay.expected_device_id!==(body.expected_device_id||null)||replay.actor!==actor)fail('Request identity conflict');return this.view(replay);}
    if(Object.values(s.replacements).some(op=>op.zone_id===body.zone_id&&!['completed','cancelled'].includes(op.status)))fail('A replacement is already pending for this zone');
    const zone=s.zones[body.zone_id];if(!zone)fail('Unknown zone',404);
    const old=this.assignment(zone.id);if(body.old_device_id!==old)fail('Zone controller changed; refresh before replacing');
    const id=crypto.randomUUID(),grant=token();
    const op={id,request_id:body.request_id,zone_id:zone.id,zone_name:zone.name,old_device_id:old,expected_device_id:body.expected_device_id||null,actor,status:'awaiting_usb',saved_desired:structuredClone(zone.desired),created_at:new Date().toISOString(),grant_hash:sha256(grant),sealed_grant:this.seal(grant),grant_expires:Date.now()+86400000};
    s.replacements[id]=op;this.save(previous);return this.view(op);
  }
  grant(id){const op=this.get(id);if(['completed','cancelled'].includes(op.status))fail('Replacement is closed');const previous=structuredClone(this.store.state);op.grant_expires=Date.now()+86400000;this.save(previous);return this.open(op.sealed_grant);}
  authorized(id,credential){const op=this.store.state.replacements?.[id];return !!op&&!['cancelled','completed'].includes(op.status)&&op.grant_expires>Date.now()&&typeof credential==='string'&&secureEqual(sha256(credential),op.grant_hash);}
  prepare(id,body){
    const op=this.get(id),s=this.store.state;
    if(!['awaiting_usb','prepared'].includes(op.status))fail('Replacement is closed');
    if(!/^PA-CLIM-[A-F0-9]{12}$/.test(body.device_id??'')||body.model!==model||!/^pa-climate-msi-2\.1\.[0-9]+(?:[._-][A-Za-z0-9._-]+)?$/.test(body.firmware??''))fail('Safe replacement requires compatible firmware 2.1.0 or later',400);
    if(body.device_id==='PA-CLIM-70D38CA99B20')fail('Legacy controller is incompatible',400);
    if(op.expected_device_id&&body.device_id!==op.expected_device_id)fail('USB MAC does not match the expected controller',400);
    if(op.new_device_id){if(op.new_device_id!==body.device_id)fail('Replacement already prepared for another MAC');return this.open(op.sealed_profile);}
    const previous=s.devices[body.device_id];
    if(previous&&previous.registration_state!=='revoked')fail('Controller is already registered; credentials were not changed');
    if(this.assignment(op.zone_id)!==op.old_device_id)fail('Zone controller changed');
    const snapshot=structuredClone(s),profile={device_id:body.device_id,zone_id:op.zone_id,device_token:token(),ota_hmac_key:crypto.randomBytes(32).toString('hex')};
    const previousRegistrations=previous?[...(previous.previous_registrations??[]),{zone_id:previous.zone_id??previous.former_zone_id??previous.pending_zone_id,registered_at:previous.registered_at,revoked_at:previous.revoked_at,last_seen:previous.last_seen,last_telemetry:previous.last_telemetry}]:[];
    s.devices[body.device_id]={device_id:body.device_id,zone_id:null,pending_zone_id:op.zone_id,registration_state:'staged',replacement_id:id,model,token_hash:sha256(profile.device_token),ota_key:profile.ota_hmac_key,registered_at:new Date().toISOString(),last_seen:null,last_telemetry:null,previous_registrations:previousRegistrations};
    op.new_device_id=body.device_id;op.sealed_profile=this.seal(profile);op.status='prepared';this.save(snapshot);return profile;
  }
  stagedDesired(device){const op=this.get(device.replacement_id);return {...op.saved_desired,mode:'OFF',manual_heat:false};}
  commit(id,body){
    const op=this.get(id);if(op.status==='completed'){if(body.new_device_id!==op.new_device_id)fail('Controller confirmation mismatch');return this.view(op);}
    if(body.new_device_id!==op.new_device_id||body.old_device_id!==op.old_device_id)fail('Confirm both controller identities');
    if(this.state(op)!=='ready')fail('New controller must report a fresh OFF acknowledgement before confirmation');
    const s=this.store.state,zone=s.zones[op.zone_id];
    if(this.assignment(op.zone_id)!==op.old_device_id||JSON.stringify(zone.desired)!==JSON.stringify(op.saved_desired))fail('Zone controller or settings changed; cancel and prepare again');
    if(body.restore_mode!==true&&body.restore_mode!==false)fail('Choose whether to restore the saved mode',400);
    if(body.restore_mode&&op.saved_desired.mode==='MANUAL'&&op.saved_desired.manual_heat&&body.acknowledge_heat!==true)fail('Restoring MANUAL ON requires explicit heating confirmation',400);
    const previous=structuredClone(s),old=s.devices[op.old_device_id];if(old){old.registration_state='revoked';old.former_zone_id=op.zone_id;old.zone_id=null;old.revoked_at=new Date().toISOString();}
    const next=s.devices[op.new_device_id];next.zone_id=op.zone_id;next.registration_state='active';delete next.pending_zone_id;
    for(const job of Object.values(s.jobs))if(job.device_id===op.old_device_id&&['queued','delivered'].includes(job.status)){job.status='cancelled';job.reason='Controller replaced';}
    zone.desired={...zone.desired,revision:zone.desired.revision+1,...(body.restore_mode?{}:{mode:'OFF',manual_heat:false})};
    op.status='completed';op.completed_at=new Date().toISOString();delete op.sealed_profile;delete op.sealed_grant;
    s.assignment_history??=[];s.assignment_history.push({operation_id:id,zone_id:op.zone_id,old_device_id:op.old_device_id,new_device_id:op.new_device_id,at:op.completed_at,actor:op.actor,saved_desired:op.saved_desired,restored_mode:body.restore_mode});
    this.save(previous);return this.view(op);
  }
  cancel(id){const op=this.get(id);if(op.status==='completed')fail('Completed replacement cannot be cancelled');if(op.status==='cancelled')return this.view(op);const previous=structuredClone(this.store.state),d=this.store.state.devices[op.new_device_id];if(d){d.registration_state='revoked';d.revoked_at=new Date().toISOString();}op.status='cancelled';delete op.sealed_profile;delete op.sealed_grant;this.save(previous);return this.view(op);}
}
