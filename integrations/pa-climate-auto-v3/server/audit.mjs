import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Buffer} from 'node:buffer';

const validDevice=v=>typeof v==='string'&&/^PA-CLIM-[A-F0-9]{12}$/.test(v)?v:null;
const validZone=v=>typeof v==='string'&&/^pa-zone-[1-9][0-9]{0,5}$/.test(v)?v:null;
const routes=new Set(['health','exchange','firmware_download','firmware_releases','device_registration','zone_desired','zones','workstation_enrollment','workstations','replacement_prepare','replacement_status','replacement_operator','other_climate_route']);
function routeName(p){
 if(p.endsWith('/healthz'))return 'health';if(p.endsWith('/v1/exchange'))return 'exchange';
 if(p.includes('/v1/firmware/'))return 'firmware_download';if(p.endsWith('/releases'))return 'firmware_releases';
 if(p.endsWith('/devices'))return 'device_registration';if(p.endsWith('/desired'))return 'zone_desired';
 if(p.endsWith('/zones'))return 'zones';if(p.endsWith('/workstation/enroll'))return 'workstation_enrollment';
 if(p.endsWith('/workstations'))return 'workstations';
 if(p.includes('/workstation/replacements/'))return p.endsWith('/prepare')?'replacement_prepare':'replacement_status';
 if(p.includes('/operator/replacements')||p.includes('/admin/replacements'))return 'replacement_operator';return 'other_climate_route';
}
const reasons=new Set(['ok','authentication_failed','device_authentication_failed','workstation_authentication_failed','operation_capability_invalid','operator_access_denied','forbidden','not_found','invalid_request','invalid_json','conflict','invalid_signature','invalid_firmware','unsafe_ota_state','rollback_required','request_too_large','internal_error','unavailable']);
function reason(status,error){
 if(status<400)return 'ok';const text=typeof error==='string'?error:'';
 if(status===401){if(/Device authentication/.test(text))return 'device_authentication_failed';if(/Workstation authentication/.test(text))return 'workstation_authentication_failed';if(/capability/.test(text))return 'operation_capability_invalid';return 'authentication_failed';}
 if(status===403)return /operator access/i.test(text)?'operator_access_denied':/signature|download link/.test(text)?'invalid_signature':'forbidden';
 if(status===404)return 'not_found';if(status===413)return 'request_too_large';
 if(status===409)return /rollback/.test(text)?'rollback_required':/sensors valid|heating off/.test(text)?'unsafe_ota_state':'conflict';
 if(status>=500)return status===503?'unavailable':'internal_error';
 return /JSON/.test(text)?'invalid_json':/image|firmware|Image/.test(text)?'invalid_firmware':'invalid_request';
}
export class ClimateAudit {
 constructor(dir,{maxBytes=1048576,keep=5}={}){this.dir=path.resolve(dir);this.file=path.join(this.dir,'climate-http.ndjson');this.maxBytes=Math.max(1024,maxBytes);this.keep=Math.max(1,Math.min(5,keep));this.nextWarning=0;}
 record(event){
  // Only typed, bounded fields enter the log. Never serialize request bodies,
  // response profiles, URLs/query strings, PINs, headers, tokens or exceptions.
  const record={at:new Date().toISOString(),request_id:/^[a-f0-9-]{36}$/.test(event.request_id??'')?event.request_id:crypto.randomUUID(),method:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(event.method)?event.method:'OTHER',route:routes.has(event.route)?event.route:'other_climate_route',status:Number.isInteger(event.status)&&event.status>=100&&event.status<600?event.status:500,reason:reasons.has(event.reason)?event.reason:'internal_error',authorization:['accepted','denied','not_required','not_evaluated'].includes(event.authorization)?event.authorization:'not_evaluated',device_id:validDevice(event.device_id),zone_id:validZone(event.zone_id),confirmed_revision:Number.isSafeInteger(event.confirmed_revision)&&event.confirmed_revision>=0?event.confirmed_revision:null,duration_ms:Number.isFinite(event.duration_ms)?Math.max(0,Math.min(300000,Math.round(event.duration_ms))):null,system_code:['ENOENT','EACCES','EPERM','EIO','ENOSPC','ETIMEDOUT','ECONNRESET','ECONNREFUSED'].includes(event.system_code)?event.system_code:null};
  try{
   fs.mkdirSync(this.dir,{recursive:true});const line=JSON.stringify(record)+'\n';
   if(fs.existsSync(this.file)&&fs.statSync(this.file).size+Buffer.byteLength(line)>this.maxBytes){
    const last=this.file+'.'+this.keep;if(fs.existsSync(last))fs.unlinkSync(last);
    for(let n=this.keep-1;n>=1;n--)if(fs.existsSync(this.file+'.'+n))fs.renameSync(this.file+'.'+n,this.file+'.'+(n+1));
    fs.renameSync(this.file,this.file+'.1');
   }
   fs.appendFileSync(this.file,line,{mode:0o600});return true;
  }catch{if(Date.now()>this.nextWarning){this.nextWarning=Date.now()+60000;console.error('Climate audit log unavailable');}return false;}
 }
}
async function deviceIdentity(request){
 if(!request.body)return null;const reader=request.clone().body.getReader();let size=0;const parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){reader.cancel().catch(()=>{});return null;}parts.push(Buffer.from(value));}return validDevice(JSON.parse(Buffer.concat(parts).toString('utf8')).device_id);}catch{return null;}finally{reader.releaseLock();}
}
export function withClimateAudit(handler,store,audit){return async request=>{
 const u=new URL(request.url);if(u.pathname!=='/climate'&&!u.pathname.startsWith('/climate/')&&!u.pathname.startsWith('/climate-local/'))return handler(request);
 const start=Date.now(),route=routeName(u.pathname),requestId=crypto.randomUUID();
 const id=['exchange','device_registration','replacement_prepare'].includes(route)?await deviceIdentity(request):route==='firmware_download'?validDevice(u.searchParams.get('device')):null;
 const emit=(status,error,systemCode)=>{const d=id?store.state.devices[id]:null;const zoneId=validZone(d?.zone_id??d?.pending_zone_id)??validZone(u.pathname.match(/\/zones\/(pa-zone-[0-9]+)/)?.[1]);const zone=status<400&&zoneId?store.zones().find(z=>z.id===zoneId):null;
  audit.record({request_id:requestId,method:request.method,route,status,reason:reason(status,error),authorization:route==='health'?'not_required':status===401||status===403?'denied':status<400?'accepted':'not_evaluated',device_id:id,zone_id:zoneId,confirmed_revision:zone?.command_ack?.acknowledged?zone.command_ack.revision:null,duration_ms:Date.now()-start,system_code:systemCode});};
 try{const response=await handler(request);if(response){let error;if(response.status>=400&&response.headers.get('content-type')?.includes('json')){try{error=(await response.clone().json()).error;}catch{}}emit(response.status,error);}return response;}catch(e){emit(500,null,e.code);throw e;}
};}
