import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ClimateStore, secureEqual, sha256, hmac, validateId } from './storage.mjs';

const json = (res, code, value) => {
  const bytes=Buffer.from(JSON.stringify(value));
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});
  res.end(bytes);
};
const bad=(res,code,message)=>json(res,code,{error:message});
const bearer=req=>(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._~+\/-]{24,300})$/)?.[1]??'';
const limitedBody = async (req,max=8192) => {
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>max) throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk);}
  return Buffer.concat(chunks);
};
const parseObject = b => {const v=JSON.parse(b.toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected object');return v;};
const safeVersion=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,48}$/.test(v);
const firmwareSha = s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);

export function createClimateHandler({dir,adminKey,publicOrigin='',allowAdmin=true}={}) {
  if(typeof adminKey!=='string'||adminKey.length<40)throw Error('CLIMATE_ADMIN_KEY is required, 40+ characters');
  const origin=publicOrigin?new URL(publicOrigin):null;
  if(origin && (origin.protocol!=='https:'||origin.username||origin.password||!['/','/climate'].includes(origin.pathname)||origin.search||origin.hash))throw Error('PUBLIC_ORIGIN must be HTTPS with root or /climate path');
  const publicBase=origin?origin.origin+(origin.pathname==='/'?'':origin.pathname):'';
  const store=new ClimateStore(dir);
  const handler=async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const pathname=url.pathname;
    try {
      if(req.method==='GET' && pathname==='/healthz')return json(res,200,{service:'farmplast-pa-climate',status:'ok'});
      if(req.method==='POST' && pathname==='/v1/exchange') {
        const body=parseObject(await limitedBody(req));
        const device=store.authenticate(body.device_id,bearer(req));
        if(!device)return bad(res,401,'Device authentication failed');
        const telemetry=store.ingest(device,body);
        const zone=store.state.zones[device.zone_id];
        const result={server_time:new Date().toISOString(),zone_id:device.zone_id,desired:zone.desired};
        const pending=Object.values(store.state.jobs).find(j=>j.device_id===device.device_id&&['queued','delivered'].includes(j.status));
        // OTA completion is recognized from real post-reboot telemetry, not the download response.
        for(const job of Object.values(store.state.jobs))if(job.device_id===device.device_id && ['queued','delivered'].includes(job.status) &&
          telemetry.last_ota_job===job.id && telemetry.firmware===job.version && telemetry.boot_id!==job.previous_boot_id && telemetry.sensor_count>=1 && telemetry.rollback_enabled && telemetry.ota_boot_validated) {
          job.status='completed';job.completed_at=new Date().toISOString();store.persist();
        }
        if(pending && pending.status!=='completed' && publicBase) {
          const age=Date.now()-Date.parse(pending.created_at);
          const release=store.state.releases[pending.sha256];
          if(age>600000){pending.status='expired';store.persist();}
          else if(release && !telemetry.heat && telemetry.sensor_count>=1 && telemetry.boot_id===pending.previous_boot_id){
            const exp=Math.floor(Date.now()/1000)+300;
            const downloadPath=`/v1/firmware/${release.sha256}`;
            const signed=`${device.device_id}\n${release.sha256}\n${exp}`;
            const sig=hmac(device.ota_key,signed);
            const imageUrl=`${publicBase}${downloadPath}?device=${encodeURIComponent(device.device_id)}&exp=${exp}&sig=${sig}`;
            const otaMessage=`PA-OTA-V1\n${device.device_id}\n${device.model}\n${pending.id}\n${pending.version}\n${imageUrl}\n${release.sha256}`;
            result.ota={device_id:device.device_id,model:device.model,job_id:pending.id,version:pending.version,url:imageUrl,sha256:release.sha256,hmac_sha256:hmac(device.ota_key,otaMessage)};
            pending.status='delivered';store.persist();
          }
        }
        return json(res,200,result);
      }
      if(req.method==='GET' && pathname.startsWith('/v1/firmware/')) {
        const sha=pathname.substring('/v1/firmware/'.length),id=url.searchParams.get('device'),exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig');
        if(!firmwareSha(sha)||!validateId(id)||!Number.isSafeInteger(exp)||exp<Math.floor(Date.now()/1000)||exp>Math.floor(Date.now()/1000)+360||!firmwareSha(sig))return bad(res,403,'Invalid download link');
        const device=store.state.devices[id];
        if(!device||!secureEqual(hmac(device.ota_key,`${id}\n${sha}\n${exp}`),sig))return bad(res,403,'Invalid download signature');
        const job=Object.values(store.state.jobs).find(j=>j.device_id===id && j.sha256===sha && j.status==='delivered');
        const rel=store.state.releases[sha];
        if(!job||!rel||rel.model!==device.model)return bad(res,403,'No authorized release');
        const f=path.join(store.releasesdir,sha+'.bin');
        if(!fs.existsSync(f))return bad(res,404,'Firmware unavailable');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':fs.statSync(f).size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
        return fs.createReadStream(f).pipe(res);
      }
      if(pathname.startsWith('/v1/admin/')) {
        if(!allowAdmin||!secureEqual(bearer(req),adminKey))return bad(res,401,'Admin authentication required');
        if(req.method==='GET' && pathname==='/v1/admin/zones')return json(res,200,{zones:store.zones()});
        if(req.method==='GET' && pathname==='/v1/admin/releases')return json(res,200,{releases:Object.values(store.state.releases)});
        if(req.method==='GET' && pathname==='/v1/admin/ota')return json(res,200,{jobs:Object.values(store.state.jobs).map(({id,device_id,version,status,created_at,completed_at})=>({id,device_id,version,status,created_at,completed_at}))});
        if(req.method==='POST' && pathname==='/v1/admin/devices'){
          const body=parseObject(await limitedBody(req));
          const creds=store.addDevice(body.device_id,body.zone_id,body.model);
          return json(res,201,creds); // One-time response: NEVER show in browser UI.
        }
        const match=pathname.match(/^\/v1\/admin\/zones\/([A-Za-z0-9_-]{1,64})\/desired$/);
        if(req.method==='POST' && match){
          const result=store.setDesired(match[1],parseObject(await limitedBody(req)));
          return json(res,200,{desired:result});
        }
        if(req.method==='POST' && pathname==='/v1/admin/releases') {
          const model=req.headers['x-firmware-model'],version=req.headers['x-firmware-version'];
          if(!validateId(model)||!safeVersion(version))return bad(res,400,'Model/version required');
          const image=await limitedBody(req,1310720);
          if(image.length<256||image[0]!==0xE9||image.readUInt16LE(12)!==0||image.readUInt32LE(32)!==0xabcd5432)return bad(res,400,'Expected classic ESP32 application .bin with app descriptor');
          if(!image.includes(Buffer.from(`PA_CLIMATE_FW_VERSION=${version}\0`))||!image.includes(Buffer.from(`PA_CLIMATE_FW_MODEL=${model}\0`)))return bad(res,400,'Image identity markers are missing');
          const sha=sha256(image);const f=path.join(store.releasesdir,sha+'.bin');
          if(!fs.existsSync(f))fs.writeFileSync(f,image,{flag:'wx',mode:0o600});
          store.state.releases[sha]={sha256:sha,version,model,size:image.length,uploaded_at:new Date().toISOString()};
          store.persist();return json(res,201,{sha256:sha,size:image.length,version,model});
        }
        if(req.method==='POST' && pathname==='/v1/admin/ota') {
          const body=parseObject(await limitedBody(req));
          if(body.confirm!=='STAGE PA OTA'||!validateId(body.device_id)||!firmwareSha(body.sha256))return bad(res,400,'Explicit confirmation and valid release required');
          if(!publicBase)return bad(res,409,'PUBLIC_ORIGIN is not configured');
          const device=store.state.devices[body.device_id],release=store.state.releases[body.sha256];
          if(!device||!release||device.model!==release.model)return bad(res,404,'Device/release mismatch');
          if(Object.values(store.state.jobs).some(j=>j.device_id===device.device_id&&['queued','delivered'].includes(j.status)))return bad(res,409,'Device already has active OTA');
          const t=device.last_telemetry;
          if(!t||Date.now()-Date.parse(t.at)>60000||t.sensor_count===0||t.heat)return bad(res,409,'Device must be recently online, sensors valid, heating off');
          if(!t.rollback_enabled)return bad(res,409,'Controller must report bootloader rollback support');
          const id=crypto.randomUUID();
          store.state.jobs[id]={id,device_id:device.device_id,sha256:release.sha256,version:release.version,model:release.model,status:'queued',created_at:new Date().toISOString(),previous_boot_id:t.boot_id};
          store.persist();return json(res,201,{job_id:id,status:'queued'});
        }
        return bad(res,404,'Unknown admin endpoint');
      }
      return bad(res,404,'Not found');
    }catch(e){
      if(e instanceof SyntaxError)return bad(res,400,'Invalid JSON');
      if(e.status===413)return bad(res,413,'Request too large');
      if(e.message && /Invalid|Unknown|Expected|mismatch|inconsistent|already|required|not registered|unsupported/i.test(e.message))return bad(res,400,e.message);
      console.error('Climate API error:',e.message);
      return bad(res,500,'Internal server error');
    }
  };
  return {handler,store};
}

// Compatibility for offline automated tests only. No climate listener needs to run
// on the user's MSI; mount createClimateHandler() into the EXISTING HTTP gateway.
export function createClimateServer(config={}) {
  const {handler,store}=createClimateHandler(config);
  const server=http.createServer(handler);
  server.headersTimeout=12000;server.requestTimeout=18000;
  return {server,store};
}


// Framework-neutral request middleware. Mount ONLY inside the existing MSI HTTP server.
// Native Node: call it before other routes and then call next() for unrelated URLs.
// Express: app.use('/climate', route), where Express strips the prefix itself.
export function createClimateRoute(options={}) {
  const {handler,store}=createClimateHandler(options);
  const route=async (req,res,next)=>{
    const u=req.url||'/';
    const prefixed=u==='/climate'||u.startsWith('/climate/');
    const alreadyStripped=(req.baseUrl==='/climate')&&(u==='/healthz'||u.startsWith('/v1/'));
    if(!prefixed&&!alreadyStripped){ if(typeof next==='function')next();return false; }
    const oldUrl=req.url;
    if(prefixed)req.url=u.slice('/climate'.length)||'/';
    try { await handler(req,res); }
    finally { req.url=oldUrl; }
    return true;
  };
  return {route,store};
}
