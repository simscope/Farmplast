// Fetch adapter for the existing Supabase MAIN worker. Creates no HTTP listener.
import { Writable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { createClimateHandler } from '../server/app.mjs';
import { Workstations } from '../server/workstations.mjs';
import { secureEqual } from '../server/storage.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipFiles} from '../server/zip.mjs';

const reply = (status, body) => Response.json(body, { status, headers: {'Cache-Control':'no-store'} });
export function nodeHandlerAsFetch(handler) {
  return async request => {
    const url = new URL(request.url);
    const req = {
      method: request.method, url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      async *[Symbol.asyncIterator]() {
        if (request.body) for await (const chunk of request.body) yield Buffer.from(chunk);
      },
    };
    let status = 200, headers = {}, size = 0;
    const chunks = [];
    const res = new Writable({write(chunk, _encoding, done) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) return done(Error('Response too large'));
      chunks.push(Buffer.from(chunk)); done();
    }});
    res.writeHead = (code, values) => { status = code; headers = values; return res; };
    const finished = new Promise((resolve, reject) => {res.once('finish', resolve); res.once('error', reject);});
    await handler(req, res);
    await finished;
    return new Response(Buffer.concat(chunks), {status, headers});
  };
}

export function createClimateFetch(config, {fetchImpl = fetch} = {}) {
  const {handler, store} = createClimateHandler(config);
  const dispatch = nodeHandlerAsFetch(handler);
  const workstations = new Workstations(config.dir);
  const reserved = new Set(config.reservedZoneIds || ['pa-zone-1']);
  const model = 'PA-ESP32-WROOM32E-N4-R1';
  const protectedDevices=new Set(config.protectedDeviceIds||['PA-CLIM-70D38CA99B20']); // MAC from the verified live Zone 1 API.
  async function object(request) {
    let size=0;const chunks=[];
    if(request.body)for await(const chunk of request.body){size+=chunk.length;if(size>8192)throw Error('Request too large');chunks.push(Buffer.from(chunk));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const credential = request => request.headers.get('authorization')?.match(/^Bearer (\S{30,100})$/)?.[1] || '';
  const allowed = new Set((config.allowedUserIds || '').split(',').map(s => s.trim()).filter(Boolean));
  async function operator(request, suffix) {
    if (!config.authUrl || !config.authAnonKey || !allowed.size) return reply(503, {error:'Farmplast operator access is not configured'});
    const token = request.headers.get('authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
    if (!token) return reply(401, {error:'Farmplast login required'});
    let response;
    try {response = await fetchImpl(config.authUrl + '/auth/v1/user', {headers:{apikey:config.authAnonKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(7000),redirect:'error'});}
    catch {return reply(503,{error:'Farmplast authentication unavailable'});}
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) return reply(401,{error:'Invalid Farmplast login'});
    if (!allowed.has(user.id)) return reply(403,{error:'Climate operator access required'});
    if(request.method==='POST'&&suffix==='/installer') {
      if(!config.publicOrigin)return reply(409,{error:'Public HTTPS endpoint is not configured'});
      const ticket=workstations.issue('Factory Windows');
      const names=['automation/Auto-Add-ESP32.ps1','automation/Install-Workstation.ps1','automation/onboard.mjs','server/config.mjs','firmware/FarmplastClimate/FarmplastClimate.ino','firmware/FarmplastClimate/device_config.h','firmware/FarmplastClimate/ClimateLogic.h'];
      // Edge Runtime relocates import.meta.url into its compiled virtual filesystem.
      // Installer assets are ordinary files in the existing MSI bind mount.
      const sourceDir=config.installerSourceDir||fileURLToPath(new URL('../',import.meta.url));
      const files=names.map(name=>['module/'+name,fs.readFileSync(path.join(sourceDir,name))]);
      files.push(['workstation-bootstrap.json',JSON.stringify({public_origin:config.publicOrigin,...ticket})]);
      files.push(['Add-ESP32.cmd','@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0module\\automation\\Install-Workstation.ps1"\r\npause\r\n']);
      return new Response(zipFiles(files),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Farmplast-Add-ESP32.zip"','Cache-Control':'private, no-store'}});
    }
    // No device credentials or admin secret can be returned by the browser API.
    const permitted = request.method === 'GET' && ['/zones','/releases','/ota'].includes(suffix)
      || request.method === 'POST' && (/^\/zones\/[A-Za-z0-9_-]{1,64}\/desired$/.test(suffix) || ['/releases','/ota'].includes(suffix));
    if (!permitted) return reply(404,{error:'Not found'});
    const url = new URL(request.url); url.pathname = '/v1/admin' + suffix;
    const headers = new Headers(request.headers); headers.set('authorization','Bearer '+config.adminKey);
    return dispatch(new Request(url, {method:request.method,headers,body:request.body,duplex:'half'}));
  }
  return {store, async route(request) {
    const url = new URL(request.url), p = url.pathname;
    if(p === '/climate-local/v1/admin/workstations') {
      if(!secureEqual(credential(request),config.adminKey))return reply(401,{error:'Admin authentication required'});
      if(request.method==='GET')return reply(200,{workstations:workstations.list()});
      try {
        const body=await object(request);
        if(request.method==='POST')return reply(201,workstations.issue(body.name));
        if(request.method==='DELETE')return reply(workstations.revoke(body.id)?200:404,{revoked:true});
      }catch{return reply(400,{error:'Invalid workstation request'});}
      return reply(405,{error:'Method not allowed'});
    }
    if(p === '/climate/workstation/enroll' && request.method==='POST') {
      try {const credentials=workstations.redeem((await object(request)).ticket);return credentials?reply(201,credentials):reply(401,{error:'Invalid or expired enrollment ticket'});}
      catch{return reply(400,{error:'Invalid enrollment request'});}
    }
    if(p.startsWith('/climate/workstation/')) {
      if(!workstations.authenticate(credential(request)))return reply(401,{error:'Workstation authentication required'});
      if(p==='/climate/workstation/releases'&&request.method==='POST') {
        if(request.headers.get('x-firmware-model')!==model)return reply(400,{error:'Invalid firmware model'});
        const target=new URL(request.url);target.pathname='/v1/admin/releases';
        const headers=new Headers(request.headers);headers.set('authorization','Bearer '+config.adminKey);
        return dispatch(new Request(target,{method:'POST',headers,body:request.body,duplex:'half'}));
      }
      if(p==='/climate/workstation/zones'&&request.method==='GET') {
        const zones=store.zones().map(({id,device_id,online,reported,command_ack})=>({id,device_id,online,firmware:reported?.firmware??null,sensor_count:reported?.sensor_count??0,command_ack}));
        for(const id of reserved)if(!zones.some(z=>z.id===id))zones.push({id,device_id:null,online:false,reserved:true});
        return reply(200,{zones});
      }
      if(p==='/climate/workstation/devices'&&request.method==='POST') {
        try {
          const body=await object(request);
          if(!/^PA-CLIM-[0-9A-F]{12}$/.test(body.device_id)||body.model!==model)return reply(400,{error:'Invalid device/model'});
          if(protectedDevices.has(body.device_id))return reply(403,{error:'Existing PA Climate 1.2.0 Zone 1 controller is protected'});
          let zone=body.zone_id;
          if(!zone)for(let n=1;n<10000;n++){const candidate='pa-zone-'+n;if(!reserved.has(candidate)&&!store.state.zones[candidate]){zone=candidate;break;}}
          // One explicit migration only: the owner has USB-flashed the physical
          // ESP32 with MAC 20:9B:A9:8C:D2:58 using the new climate firmware.
          // Never unlock pa-zone-1 generally and never rotate another device.
          const zone1Migration=zone==='pa-zone-1' &&
            body.device_id==='PA-CLIM-209BA98CD258' &&
            body.migration_confirm==='MIGRATE EXISTING PA ZONE 1';
          if(!/^pa-zone-[1-9][0-9]*$/.test(zone)||(reserved.has(zone)&&!zone1Migration))
            return reply(409,{error:'Zone reserved or invalid'});
          if(zone1Migration && (store.state.devices[body.device_id] ||
              Object.values(store.state.devices).some(device=>device.zone_id==='pa-zone-1')))
            return reply(409,{error:'Zone 1 already registered; no credential rotation'});
          return reply(201,store.addDevice(body.device_id,zone,model));
        }catch{return reply(409,{error:'Device or zone already registered, or invalid request'});}
      }
      return reply(404,{error:'Not found'});
    }
    if (p.startsWith('/climate-local/')) {
      // This namespace is loopback management only; it MUST be excluded at HTTPS ingress.
      url.pathname = p.slice('/climate-local'.length);
      return dispatch(new Request(url, request));
    }
    if (p !== '/climate' && !p.startsWith('/climate/')) return null;
    const suffix = p.slice('/climate'.length);
    if (suffix.startsWith('/operator/')) return operator(request, suffix.slice('/operator'.length));
    const permitted = request.method === 'GET' && suffix === '/healthz'
      || request.method === 'POST' && suffix === '/v1/exchange'
      || request.method === 'GET' && /^\/v1\/firmware\/[a-f0-9]{64}$/.test(suffix);
    // Deny admin even with a valid admin key. Public route is an explicit allowlist.
    if (!permitted) return reply(404,{error:'Not found'});
    url.pathname = suffix;
    return dispatch(new Request(url, request));
  }};
}
