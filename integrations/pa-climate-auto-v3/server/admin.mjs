import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadConfig} from './config.mjs';

const [,,command,...args]=process.argv;
if(!command) { console.error('Commands: init <config_path> | register <id> <zone> | zones | set <zone> <targetF> <AUTO|MANUAL|OFF> [heat=true|false] | upload <bin_path> <version> | ota <device_id> <sha256> | jobs');process.exit(2); }
if(command==='init'){
  const file=path.resolve(args[0]??'climate.env');
  const dir=path.dirname(file);
  fs.mkdirSync(dir,{recursive:true});
  if(fs.existsSync(file))throw Error(`Not overwriting existing file: ${file}`);
  const adminKey=crypto.randomBytes(48).toString('base64url');
  const contents=[
    '# Local Farmplast Climate MSI settings; keep private.',
    `DATA_DIR=${dir}`,`CLIMATE_ADMIN_KEY=${adminKey}`,
    '# Existing MSI gateway local climate route; no second server/listener.',
    'CLIMATE_LOCAL_BASE_URL=',
    '# HTTPS origin after creating a real public Cloudflare Tunnel hostname.',
    'PUBLIC_ORIGIN=',
    '# PEM root certificate for the PUBLIC_ORIGIN (actual verified chain).',
    'CA_PEM_FILE=',
    '# Wi-Fi credentials are stored by Auto-Add-ESP32.ps1 with Windows DPAPI.',
    ''
  ].join('\n');
  fs.writeFileSync(file,contents,{flag:'wx',mode:0o600});
  console.log(`Created configuration: ${file}\nAdmin secret stored only in file. No TLS hostname or certificate invented.`);
  process.exit(0);
}
const config=loadConfig(process.env.CLIMATE_CONFIG_FILE);
const base=config.CLIMATE_LOCAL_BASE_URL;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost)(:[0-9]+)?\/climate(?:-local)?$/.test(base))throw Error('Attach climate route to existing MSI HTTP service and set CLIMATE_LOCAL_BASE_URL first');
const endpoint=base+'/v1/admin';
const api=async (method,apiPath,body,extraHeaders={})=>{
  const r=await fetch(endpoint+apiPath,{method,headers:{Authorization:'Bearer '+config.CLIMATE_ADMIN_KEY,...extraHeaders},body,
     signal:AbortSignal.timeout(15000)});
  const text=await r.text(),data=JSON.parse(text);
  if(!r.ok)throw Error(`HTTP ${r.status}: ${data.error}`);
  return data;
};
const post=(p,obj)=>api('POST',p,JSON.stringify(obj),{'Content-Type':'application/json'});
if(command==='register') {
  const [deviceId,zoneId]=args;
  if(!deviceId||!zoneId)throw Error('register requires device ID and zone ID');
  const c=await post('/devices',{device_id:deviceId,zone_id:zoneId,model:'PA-ESP32-WROOM32E-N4-R1'});
  const targetDir=path.join(config.DATA_DIR,'provisioning',deviceId);
  fs.mkdirSync(targetDir,{recursive:true});
  const secretFile=path.join(targetDir,'device-secrets.json');
  fs.writeFileSync(secretFile,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`Registered ${deviceId} -> ${zoneId}\nCredentials stored privately: ${secretFile}\nDo not paste or commit this file.`);
}else if(command==='zones'){
  const data=await api('GET','/zones');
  console.table(data.zones.map(z=>({zone:z.id,device:z.device_id,online:z.online,T1:z.reported?.sensor_1_f??'—',T2:z.reported?.sensor_2_f??'—',average:z.reported?.temperature_f??'—',target:z.desired.target_f,mode:z.desired.mode})));
}else if(command==='set') {
  const [zone,targetStr,mode,manualStr]=args;
  const target=Number(targetStr),man=manualStr==='true';
  if(!zone||!targetStr||!['AUTO','MANUAL','OFF'].includes(mode)||!['true','false',undefined].includes(manualStr))throw Error('set <zone> <targetF> <AUTO|MANUAL|OFF> [true|false]');
  const data=await post(`/zones/${zone}/desired`,{target_f:target,mode,manual_heat:man});
  console.log(`${zone}: command revision ${data.desired.revision} queued; await reported ACK.`);
}else if(command==='upload') {
  const [filename,version]=args;
  if(!filename||!version)throw Error('upload <application.bin> <version>');
  const file=fs.readFileSync(filename);
  const data=await api('POST','/releases',file,{'Content-Type':'application/octet-stream','X-Firmware-Model':'PA-ESP32-WROOM32E-N4-R1','X-Firmware-Version':version});
  console.log(`Release accepted: SHA256 ${data.sha256}, size ${data.size} bytes. No OTA started.`);
}else if(command==='ota'){
  const [deviceId,sha]=args;
  if(!deviceId||!sha)throw Error('ota <device_id> <sha256>');
  const data=await post('/ota',{device_id:deviceId,sha256:sha,confirm:'STAGE PA OTA'});
  console.log(`OTA queued for ${deviceId}: ${data.job_id}; verify later with jobs.`);
}else if(command==='jobs'){
  console.table((await api('GET','/ota')).jobs);
}else throw Error('Unknown command');
