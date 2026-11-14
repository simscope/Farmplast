#!/usr/bin/env node
/* Farmplast Climate automatic ESP32 onboarding. Does NOT start or install a server.
 * Requires existing MSI gateway to mount server/createClimateHandler().
 * Credentials stay on MSI; no fabricated hostname, private keys, or insecure TLS.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../server/config.mjs';

const MODEL = 'PA-ESP32-WROOM32E-N4-R1';
const VERSION = 'pa-climate-msi-2.1.0';
const BOARD = 'esp32:esp32:esp32:FlashMode=dio,FlashFreq=40,PartitionScheme=default';
const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT),'..');

export function parseArgs(args) {
  const optionNames=new Set(['--config','--port','--zone','--arduino-cli','--esptool','--source','--device']);
  const flags=new Set(['--preflight','--confirm-new','--verify']);
  const out={};
  for(let i=0;i<args.length;i++) {
    const k=args[i];
    if(flags.has(k)) { out[k.slice(2)] = true; continue; }
    if(!optionNames.has(k)||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Unknown or incomplete argument: ${k}`);
    out[k.slice(2)] = args[++i];
  }
  return out;
}
export function parseMac(output) {
  const m=String(output).match(/(?:MAC(?: address)?|Base MAC)\s*:\s*((?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2})/i);
  if(!m)throw Error('ESP32 MAC address not found; use an official ESP32 esptool and check the USB serial adapter');
  return 'PA-CLIM-'+m[1].replace(/[:-]/g,'').toUpperCase();
}
export function nextZone(zones) {
  if(!Array.isArray(zones))throw Error('MSI API did not return the zone list');
  const used=new Set(zones.map(z=>z.id));
  for(let n=1;n<10000;n++) {const id=`pa-zone-${n}`;if(!used.has(id))return id;}
  throw Error('No free zone IDs');
}
export function provisioningPayload(c, wifi, endpoint, caPem) {
  if(!c||!/^[A-Za-z0-9_-]{1,64}$/.test(c.device_id||'') ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(c.zone_id||'')||
      typeof c.device_token!=='string'||c.device_token.length<32 ||
      !/^[a-f0-9]{64}$/i.test(c.ota_hmac_key||''))throw Error('Incomplete server-issued device credentials');
  const u=new URL(endpoint);
  if(u.protocol!=='https:'||u.username||u.password||!['/v1/exchange','/climate/v1/exchange'].includes(u.pathname)||u.search||u.hash)throw Error('Cloud endpoint must be the validated HTTPS exchange URL');
  if(!/^.{1,32}$/s.test(wifi.ssid)||typeof wifi.password!=='string'||wifi.password.length<8||wifi.password.length>63)throw Error('Wi-Fi SSID/password missing or invalid');
  if(!caPem.includes('-----BEGIN CERTIFICATE-----')||caPem.length>3600)throw Error('Validated CA PEM is required');
  return {device_id:c.device_id,ssid:wifi.ssid,password:wifi.password,
    exchange_url:endpoint,token:c.device_token,ota_hmac_key:c.ota_hmac_key,root_ca_pem:caPem};
}
export function localApiBase(config) {
  const s=config.CLIMATE_LOCAL_BASE_URL;
  if(!s)throw Error('Climate route is not connected to the EXISTING MSI HTTP gateway (CLIMATE_LOCAL_BASE_URL missing). No extra service will be started.');
  let u;try {u=new URL(s);}catch {throw Error('Invalid local API URL');}
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('Local API URL must use HTTP on loopback only');
  if(u.pathname!=='/' && !/^\/[a-z0-9/_-]+$/i.test(u.pathname))throw Error('Unsupported API mount path');
  return u.origin+(u.pathname==='/'?'':u.pathname.replace(/\/$/,''));
}
export function remoteApiBase(config) {
  const u=new URL(config.CLIMATE_HTTPS_BASE_URL);
  if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||u.pathname!=='/climate'||u.search||u.hash)throw Error('Workstation requires the verified MSI HTTPS /climate endpoint');
  if(config.PUBLIC_ORIGIN!==u.origin+'/climate')throw Error('Public exchange and workstation origins must match');
  return u.origin+'/climate';
}
export function privateCredentials(file,value) {
  if(process.platform!=='win32')throw Error('Workstation credentials require Windows DPAPI');
  const encrypt=value!==undefined;
  const script=encrypt
    ? '$s=[Console]::In.ReadToEnd() | ConvertTo-SecureString -AsPlainText -Force; $s | ConvertFrom-SecureString'
    : '$s=[Console]::In.ReadToEnd() | ConvertTo-SecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}';
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:encrypt?JSON.stringify(value):fs.readFileSync(file,'utf8'),encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,PSModulePath:path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules')}});
  if(result.status!==0||result.error) {
    const e=Error('Windows DPAPI operation failed; no plaintext fallback');
    if(/CryptographicException/.test(result.stderr||''))e.code='DPAPI_UNAVAILABLE';
    throw e;
  }
  if(encrypt)writePrivate(file,result.stdout.trim());
  else return JSON.parse(result.stdout);
}
export function spawn(cmd,args,options={}) {
  const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,timeout:options.timeout??180000,...options});
  const output=[r.stdout,r.stderr,r.error?.message].filter(Boolean).join('\n').trim();
  if(r.error||r.status!==0) {
    if(r.error?.code==='ETIMEDOUT') throw Error(path.basename(cmd)+' timed out after '+Math.ceil((options.timeout??180000)/60000)+' minutes.');
    // esptool v5 prints warnings to stderr and connection failures to stdout.
    // Showing only stderr hides the actual COM/bootloader connection error.
    const safe=output.replace(/(?:Bearer |device_token|ota_hmac_key)[^\n]{0,120}/gi,'[sensitive redacted]');
    throw Error(path.basename(cmd)+' failed (exit '+String(r.status??'N/A')+'): '+safe.slice(-2400));
  }
  return output;
}
// ESPTool 5 uses dashed subcommands. Never retry a hardware/serial error as
// read_mac: its deprecation warning otherwise replaces the real COM failure.
export function esptool(cmd,port,verb,args=[],timeout=90000,runner=spawn){
  const modern=verb.replaceAll('_','-');
  // The owner's PA relay PCB has IO0 and EN buttons but no automatic
  // DTR/RTS programming header. The operator enters ROM download mode once.
  // Keep the ESP32 in ROM download mode while reading its MAC.
  return runner(cmd,['--chip','esp32','--port',port,'--baud','115200',
    '--before','no-reset','--after','no-reset',modern,...args],{timeout});
}
function ensureFileParent(file) {fs.mkdirSync(path.dirname(file),{recursive:true});}
function writePrivate(file,value) {ensureFileParent(file);fs.writeFileSync(file,value,{flag:'wx',mode:0o600});}
async function call(base,key,method,route,data){
  const url=base+route;
  const res=await fetch(url,{method,headers:{Authorization:`Bearer ${key}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000),cache:'no-store'});
  const body=await res.json().catch(()=>({error:'Invalid JSON response'}));
  if(!res.ok)throw Error(`Existing MSI API HTTP ${res.status}: ${body.error||'request failed'}`);
  return body;
}
export async function preflight(config){
  const remote=!!config.CLIMATE_HTTPS_BASE_URL;
  const base=remote?remoteApiBase(config):localApiBase(config);
  const key=remote?process.env.PA_WORKSTATION_TOKEN:config.CLIMATE_ADMIN_KEY;
  if(typeof key!=='string'||key.length<(remote?30:40))throw Error('MSI or workstation authentication is not provisioned');
  if(!config.PUBLIC_ORIGIN||!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/climate)?$/.test(config.PUBLIC_ORIGIN))throw Error('Validated PUBLIC_ORIGIN HTTPS is not configured on MSI; no fake endpoint will be used');
  if(!config.CA_PEM_FILE||!fs.existsSync(config.CA_PEM_FILE))throw Error('Validated root CA PEM is not configured on MSI; no setInsecure()');
  const ca=fs.readFileSync(config.CA_PEM_FILE,'utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----')||ca.length>20000)throw Error('Invalid root CA file');
  const health=await fetch(base+'/healthz',{signal:AbortSignal.timeout(5000),cache:'no-store'});
  if(!health.ok||(await health.json()).status!=='ok')throw Error('Existing MSI climate route not reachable');
  const zones=(await call(base,key,'GET',remote?'/workstation/zones':'/v1/admin/zones')).zones;
  return {base,zones,ca,key,remote};
}
async function main() {
  const a=parseArgs(process.argv.slice(2));
  if(!a.config)throw Error('Pass --config <existing MSI climate config>');
  const config=loadConfig(a.config);
  const {base,zones,ca,key,remote}=await preflight(config);
  if(a.preflight){console.log('READY: existing MSI gateway has the climate API, HTTPS/CA and credentials. No changes made.');return;}
  if(a.verify) {
    if(!a.device||!/^PA-CLIM-[0-9A-F]{12}$/.test(a.device))throw Error('Invalid device ID for verification');
    for(let i=0;i<10;i++){
      const current=(await call(base,key,'GET',remote?'/workstation/zones':'/v1/admin/zones')).zones;
      if(current.some(z=>z.device_id===a.device&&z.online&&(z.reported?.firmware??z.firmware)===VERSION&&(z.reported?.sensor_count??z.sensor_count)===2&&z.command_ack?.acknowledged)){
        console.log('ONLINE VERIFIED: MSI received authenticated telemetry from '+a.device);return;
      }
      await new Promise(r=>setTimeout(r,5000));
    }
    throw Error('Provisioning finished, but MSI has not confirmed the expected firmware, both sensors and the initial command ACK');
  }
  if(!a['confirm-new'])throw Error('Physical confirmation required: run the Windows Add-ESP32.ps1 wizard');
  const port=a.port;
  if(!port||!/^COM\d{1,3}$/i.test(port))throw Error('Connect a single USB–UART and supply its COM port');
  const arduino=a['arduino-cli'];const esp=a.esptool;
  if(!arduino||!esp||!fs.existsSync(arduino)||!fs.existsSync(esp))throw Error('Arduino CLI or Espressif esptool executable not found');
  const wifi={ssid:process.env.PA_ONBOARD_WIFI_SSID,password:process.env.PA_ONBOARD_WIFI_PASSWORD};
  if(!wifi.ssid||!wifi.password)throw Error('Wi-Fi credentials must come from local Windows secure prompt, not command arguments');
  const dev=parseMac(esptool(esp,port,'read-mac'));
  if(dev==='PA-CLIM-70D38CA99B20')throw Error('Existing PA Climate 1.2.0 Zone 1 is protected. This installer is for new controllers only.');
  const exists=zones.find(z=>z.device_id===dev);
  if(exists?.online)throw Error(`${dev} is ONLINE in ${exists.id}. Refusing to overwrite an operating controller.`);
  const zone=a.zone||exists?.id||nextZone(zones);
  if(!/^pa-zone-[1-9][0-9]*$/.test(zone))throw Error('Zone ID must be pa-zone-N');
  if(zones.some(z=>z.id===zone&&z.device_id!==dev))throw Error(`Zone ${zone} already assigned to another device`);
  if(exists&&exists.id!==zone)throw Error(`Device already assigned to ${exists.id}`);
  const provisionDir=path.join(config.DATA_DIR,'provisioning',dev);
  const secretFile=path.join(provisionDir,remote?'device-secrets.dpapi':'device-secrets.json');
  let credentials;
  if(fs.existsSync(secretFile)) {
    credentials=remote?privateCredentials(secretFile):JSON.parse(fs.readFileSync(secretFile,'utf8'));
    if(credentials.device_id!==dev||credentials.zone_id!==zone)throw Error('Existing private provisioning belongs to another device/zone');
  } else {
    if(exists)throw Error('Device already registered, but its original local secret is missing; refusing to rotate silently');
    credentials=await call(base,key,'POST',remote?'/workstation/devices':'/v1/admin/devices',{
      device_id:dev,zone_id:zone,model:MODEL
    });
    if(remote)privateCredentials(secretFile,credentials);
    else writePrivate(secretFile,JSON.stringify(credentials,null,2)+'\n');
  }
  const endpoint=config.PUBLIC_ORIGIN+'/v1/exchange';
  const payload=provisioningPayload(credentials,wifi,endpoint,ca);
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'fp-climate-onboard-'));
  const sketch=path.join(work,'FarmplastClimate');
  const build=path.join(work,'build');
  fs.mkdirSync(sketch);fs.mkdirSync(build);
  const source=path.resolve(a.source||path.join(ROOT,'firmware','FarmplastClimate'));
  for(const name of ['FarmplastClimate.ino','ClimateLogic.h','device_config.h'])fs.copyFileSync(path.join(source,name),path.join(sketch,name));
  // Explicit first-install mode: confirmed NEW ESP32, never an already running controller.
  // Reading 4 MiB before a first flash is unnecessary and was blocking setup for minutes.
  // Existing online controllers and Zone 1 are protected above.
  try {
    console.log('New ESP32 confirmed: skipping full-chip flash backup. Reading MAC only, then uploading new application.');
    console.log('Compiling ESP32-WROOM-32E firmware (relay ENABLED; GPIO16 active HIGH)...');
    spawn(arduino,['compile','--fqbn',BOARD,'--output-dir',build,sketch],{timeout:300000});
    const binary=path.join(build,'FarmplastClimate.ino.bin');
    if(!fs.existsSync(binary)||fs.statSync(binary).size<256||fs.statSync(binary).size>1310720)throw Error('Application binary missing or too large for the selected OTA partition');
    const contents=fs.readFileSync(binary);
    if(!contents.includes(Buffer.from(`PA_CLIMATE_FW_MODEL=${MODEL}\0`)) ||
       !contents.includes(Buffer.from(`PA_CLIMATE_FW_VERSION=${VERSION}\0`)))
       throw Error('Built image lacks the expected model/version markers');
    const digest=crypto.createHash('sha256').update(contents).digest('hex');
    const uploaded=await fetch(base+(remote?'/workstation/releases':'/v1/admin/releases'),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/octet-stream','X-Firmware-Model':MODEL,'X-Firmware-Version':VERSION},body:contents,redirect:'error',signal:AbortSignal.timeout(30000)});
    const release=await uploaded.json().catch(()=>({}));
    if(!uploaded.ok||release.sha256!==digest)throw Error('MSI did not confirm the universal firmware release; no USB write attempted');
    const releasesDir=path.join(config.DATA_DIR,'universal-builds');
    fs.mkdirSync(releasesDir,{recursive:true});
    const releasePath=path.join(releasesDir,digest+'.bin');
    if(!fs.existsSync(releasePath))fs.writeFileSync(releasePath,contents,{flag:'wx',mode:0o600});
    console.log(`Shared OTA-compatible image saved privately on MSI: ${releasePath}`);
    console.log(`Uploading ${VERSION} to new controller ${dev} on ${port}...`);
    spawn(arduino,['upload','--port',port,'--fqbn',BOARD,'--input-dir',build,sketch],{timeout:240000});
    // The SAME application binary can be used for every device and OTA update.
    // Individual secrets are provisioned to NVS over the locally attached USB port.
    const pendingPath=path.join(provisionDir,'pending-provision.json');
    if(fs.existsSync(pendingPath))fs.rmSync(pendingPath);
    writePrivate(pendingPath,JSON.stringify(payload));
    console.log(`FLASH WRITTEN: universal ${VERSION} on ${dev}; relay behavior follows device_config.h.`);
    console.log(`FP_PROVISION_FILE=${pendingPath}`); // file PATH only, no credentials
    console.log('Waiting for local serial provisioner; the firmware contains NO per-device credentials.');
  }finally{
    // Remove temporary universal source/build artifacts from TEMP after upload.
    fs.rmSync(work,{recursive:true,force:true});
  }
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===SCRIPT;
if(direct)main().catch(e=>{console.error('STOP (no silent bypass): '+e.message);process.exitCode=1;});
