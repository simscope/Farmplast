// Generate network-only derivatives of the three verified production sources.
// Real headers and application images remain in the ignored private build tree.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

const project=process.cwd()
const ownerRoot='C:/Users/Owner/Documents/farmplast'
const privateRoot=process.env.FARMPLAST_MSI_PRIVATE_ROOT || path.join(project,'.private-build')
const provision=JSON.parse(fs.readFileSync(path.join(privateRoot,'owner-provision.json'),'utf8'))
const pub=path.join(project,'firmware/msi')
const priv=path.join(privateRoot,'firmware')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const expectedKeys={1:'811f1e0d9fd7',2:'301dd34587ab',3:'4c3abcb91c0f'}
const oldImages={1:'a442dbe364042cc97e2429561c8e5d2b689ec1b30a87d488ff193b42830e6c72',2:'804b93ff40609f5f8383c11dab0b29fdde4b5e669d21b25a18ca7dc94816e376',3:'6aa4b801b4f2d86e615a58ecf6dc57c5be4a07f18f982301b0ce93d7271d9d77'}
const replaceOnce=(text,before,after)=>{
 if(text.split(before).length!==2)throw Error('Production source no longer matches the reviewed network patch')
 return text.replace(before,after)
}
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')
function literal(text,name){
 const p=new RegExp('(?:#define\\s+'+name+'\\s+|(?:static\\s+)?const\\s+char\\s*\\*\\s*'+name+'\\s*=\\s*)"((?:\\\\.|[^"\\\\])*)"')
 const m=p.exec(text);if(!m)throw Error('Missing private configuration '+name)
 return JSON.parse('"'+m[1]+'"')
}
const commonSource=path.join(ownerRoot,'ch2-edgefree-1-real-src/common')
for(const file of ['ChillerOta.h','ChillerRuntimeDiagnostics.h','TelemetryPostResult.h','supabase-ca.h']){
 const body=read(path.join(commonSource,file))
 for(const dir of [pub,priv]){fs.mkdirSync(path.join(dir,'common'),{recursive:true});fs.writeFileSync(path.join(dir,'common',file),body)}
}
for(const dir of [pub,priv])fs.copyFileSync(path.join(project,'firmware/common/msi-ca.h'),path.join(dir,'common/msi-ca.h'))
const receipts=[]
for(const n of [1,2,3]){
 const source=n===1?path.join(ownerRoot,'ch1-edge-free/firmware/Chiller1'):path.join(ownerRoot,`ch${n}-edgefree-1-real-src/Chiller${n}`)
 const build=path.join(ownerRoot,n===1?'ch1-edgefree-2-real-build':`ch${n}-edgefree-1-real-build`)
 const original=fs.readFileSync(path.join(build,`Chiller${n}.ino.bin`))
 if(hash(original)!==oldImages[n])throw Error('Original approved image does not match device release')
 const out=path.join(pub,`Chiller${n}`),secure=path.join(priv,`Chiller${n}`)
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(secure,{recursive:true})
 let sketch=read(path.join(source,`Chiller${n}.ino`))
 const sourceHash=hash(Buffer.from(sketch))
 const ota=read(path.join(source,'ota_config.h'))
 const secrets=read(path.join(source,'secrets.h'))
 const legacy=literal(n===1?ota:secrets,n===1?'CH1_OTA_DEVICE_KEY':'DEVICE_SECRET')
 if(hash(Buffer.from(legacy)).slice(0,12)!==expectedKeys[n])throw Error('Private device configuration differs from live production')
 const version=`ch${n}-msi-1`
 if(n===1){
  let header=read(path.join(source,'Ch1Ota.h'))
  header=replaceOnce(header,'#pragma once','#pragma once\n#include "telemetry_config.h"\n#include "../common/msi-ca.h"')
  header=replaceOnce(header,'  doc["p_key"]=CH1_OTA_DEVICE_KEY;','  const bool telemetry = strcmp(endpoint,"/rest/v1/rpc/ingest_ch1")==0;\n  if(telemetry) doc.remove("p_key"); else doc["p_key"]=CH1_OTA_DEVICE_KEY;')
  const start=header.indexOf('static bool ch1Rpc('),end=header.indexOf('\nbool ch1PostTelemetry',start)
  let fn=header.slice(start,end)
  fn=replaceOnce(fn,'tls.setCACert(CH1_OTA_CA_PEM);','tls.setCACert(telemetry ? NJ_MSI_CA_PEM : CH1_OTA_CA_PEM);')
  fn=replaceOnce(fn,'String(SUPABASE_URL)+endpoint','telemetry ? String(NJ_TELEMETRY_URL) : String(SUPABASE_URL)+endpoint')
  fn=replaceOnce(fn,'http.addHeader("Content-Type","application/json");http.addHeader("apikey",SUPABASE_ANON_KEY);','http.addHeader("Content-Type","application/json");\n  if(telemetry) http.addHeader("Authorization",String("Bearer ")+NJ_TELEMETRY_BEARER);\n  else http.addHeader("apikey",SUPABASE_ANON_KEY);')
  header=header.slice(0,start)+fn+header.slice(end)
  fs.writeFileSync(path.join(out,'Ch1Ota.h'),header);fs.writeFileSync(path.join(secure,'Ch1Ota.h'),header)
 }else{
  sketch=replaceOnce(sketch,'#include "secrets.h"','#include "secrets.h"\n#include "telemetry_config.h"\n#include "../common/msi-ca.h"')
  sketch=replaceOnce(sketch,`"https://eeobivvwjzakbweluwtm.supabase.co/rest/v1/rpc/ingest_ch${n}"`,'NJ_TELEMETRY_URL')
  sketch=replaceOnce(sketch,'  body += "\\"device_secret\\":\\"";\n  body += DEVICE_SECRET;\n  body += "\\",";\n','')
  const start=sketch.indexOf('TelemetryPostResult postToSupabase()'),end=sketch.indexOf('\nvoid handlePostResult',start)
  let fn=sketch.slice(start,end)
  fn=replaceOnce(fn,'client.setCACert(CHILLER_OTA_CA_PEM);','client.setCACert(NJ_MSI_CA_PEM);')
  fn=replaceOnce(fn,'  http.addHeader("apikey", SUPABASE_ANON_KEY);\n','')
  fn=replaceOnce(fn,'"Bearer " + String(SUPABASE_ANON_KEY)','"Bearer " + String(NJ_TELEMETRY_BEARER)')
  sketch=sketch.slice(0,start)+fn+sketch.slice(end)
  const ds=sketch.indexOf('void diagnoseInternet()'),de=sketch.indexOf('\n// ======================================================\n// SUPABASE POST',ds)
  let diag=sketch.slice(ds,de)
  diag=diag.replaceAll('SUPABASE_HOST','NJ_TELEMETRY_HOST').replace('tcp.connect(resolved, 443, 3000)','tcp.connect(resolved, NJ_TELEMETRY_PORT, 3000)').replaceAll('[DIAG] SUPABASE TCP','[DIAG] MSI TCP')
  sketch=sketch.slice(0,ds)+diag+sketch.slice(de)
 }
 if(/eyJhbGci|WIFI_PASS\s*=\s*"[^"]+"/.test(sketch))throw Error('Credential found in public sketch')
 fs.writeFileSync(path.join(out,`Chiller${n}.ino`),sketch);fs.writeFileSync(path.join(secure,`Chiller${n}.ino`),sketch)
 fs.writeFileSync(path.join(out,'.gitignore'),'secrets.h\nota_config.h\nnetwork_config.h\ntelemetry_config.h\n*.bin\n*.elf\n')
 const example=`#pragma once\n#define NJ_TELEMETRY_URL "https://farmplast.vercel.app/api/nj-ingest/chiller-${n}"\n#define NJ_TELEMETRY_HOST "farmplast.vercel.app"\n#define NJ_TELEMETRY_PORT 443\n#define NJ_TELEMETRY_BEARER "REPLACE_WITH_DEVICE_SPECIFIC_PRIVATE_KEY"\n`
 fs.writeFileSync(path.join(out,'telemetry_config.example.h'),example)
 fs.writeFileSync(path.join(secure,'telemetry_config.h'),example.replace('REPLACE_WITH_DEVICE_SPECIFIC_PRIVATE_KEY',provision.devices[`chiller-${n}`]))
 fs.writeFileSync(path.join(secure,'secrets.h'),secrets)
 const macro=n===1?'CH1_OTA_VERSION':'CHILLER_OTA_VERSION'
 const revised=ota.replace(new RegExp('(#define '+macro+' )"[^"]+"'),'$1"'+version+'"')
 if(revised===ota)throw Error('OTA version was not changed')
 fs.writeFileSync(path.join(secure,'ota_config.h'),revised)
 if(n!==1)fs.copyFileSync(path.join(source,'network_config.h'),path.join(secure,'network_config.h'))
 const options=JSON.parse(read(path.join(build,'build.options.json')))
 receipts.push({device:n===1?'ESP32-CH1':`ESP32-CH${n}-PLC`,version,source_sha256:sourceHash,original_image_sha256:oldImages[n],fqbn:options.fqbn,core:'3.3.8',private_sketch:secure,compiled:false,flashed:false,control_logic_changed:false})
}
fs.writeFileSync(path.join(privateRoot,'chiller-build-plan.json'),JSON.stringify(receipts,null,2))
console.log(JSON.stringify(receipts.map(({private_sketch,...entry})=>entry),null,2))
