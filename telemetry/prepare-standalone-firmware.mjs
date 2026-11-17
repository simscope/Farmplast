// Once-only derivative of the installed MSI-1 sources. No upload or flashing.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const root=process.env.FARMPLAST_MSI_PRIVATE_ROOT||'C:/Users/Owner/AppData/Local/FarmplastMsi20261116'
const pub=path.resolve('firmware/msi'),out=path.join(root,'standalone-firmware')
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')
const base=file=>execFileSync('git',['show','048afaca0d137cd509e75b5b6f90095dd293a2a9:firmware/msi/'+file],{encoding:'utf8'}).replaceAll('\r\n','\n')
const replace=(text,old,value)=>{if(text.split(old).length!==2)throw Error('Reviewed source changed');return text.replace(old,value)}
let common=base('common/ChillerOta.h')
common=replace(common,'String("https://")+SUPABASE_HOST+"/rest/v1/rpc/chiller_ota_report"','String(NJ_REPORT_URL)')
common=replace(common,'String("https://")+SUPABASE_HOST+"/storage/v1/object/sign/chiller-firmware/"','String("https://farmplast.vercel.app/storage/v1/object/sign/chiller-firmware/")')
common=common.replaceAll('CHILLER_OTA_CA_PEM','NJ_MSI_CA_PEM')
common=replace(common,'http.addHeader("Content-Type","application/json");http.addHeader("apikey",SUPABASE_ANON_KEY);','http.addHeader("Content-Type","application/json");')
common=replace(common,'String("Bearer ")+SUPABASE_ANON_KEY','String("Bearer ")+NJ_TELEMETRY_BEARER')
fs.writeFileSync(path.join(pub,'common/ChillerOta.h'),common)
fs.mkdirSync(path.join(out,'common'),{recursive:true})
for(const file of ['ChillerOta.h','ChillerRuntimeDiagnostics.h','TelemetryPostResult.h','msi-ca.h'])fs.copyFileSync(path.join(pub,'common',file),path.join(out,'common',file))
for(const n of [1,2,3]){
 const dir=path.join(pub,`Chiller${n}`),secure=path.join(out,`Chiller${n}`),old=path.join(root,'firmware',`Chiller${n}`)
 fs.mkdirSync(secure,{recursive:true})
 let sketch=base(`Chiller${n}/Chiller${n}.ino`)
 if(n===1){
  let header=base('Chiller1/Ch1Ota.h').replaceAll('CH1_OTA_CA_PEM','NJ_MSI_CA_PEM')
  header=replace(header,'String(SUPABASE_URL)+"/storage/v1/object/sign/ch1-firmware/"','String("https://farmplast.vercel.app/storage/v1/object/sign/ch1-firmware/")')
  header=replace(header,'telemetry ? String(NJ_TELEMETRY_URL) : String(SUPABASE_URL)+endpoint','telemetry ? String(NJ_TELEMETRY_URL) : String(NJ_REPORT_URL)')
  header=replace(header,'  if(telemetry) http.addHeader("Authorization",String("Bearer ")+NJ_TELEMETRY_BEARER);\n  else http.addHeader("apikey",SUPABASE_ANON_KEY);','  http.addHeader("Authorization",String("Bearer ")+NJ_TELEMETRY_BEARER);')
  header=header.replaceAll('/rest/v1/rpc/ingest_ch1','telemetry').replaceAll('/rest/v1/rpc/ch1_ota_report','report')
  fs.writeFileSync(path.join(dir,'Ch1Ota.h'),header);fs.writeFileSync(path.join(secure,'Ch1Ota.h'),header)
 }else{
  sketch=replace(sketch,'static const char* SUPABASE_HOST = "eeobivvwjzakbweluwtm.supabase.co";','')
  sketch=sketch.replaceAll('SUPABASE_RPC_URL','TELEMETRY_RPC_URL').replaceAll('SUPABASE_HOST','NJ_TELEMETRY_HOST').replaceAll('postToSupabase','postTelemetry').replaceAll('SUPABASE_ANON_KEY is defined in ignored secrets.h.','Device authentication is scoped to this controller.').replaceAll('SUPABASE','MSI')
 }
 fs.writeFileSync(path.join(dir,`Chiller${n}.ino`),sketch);fs.writeFileSync(path.join(secure,`Chiller${n}.ino`),sketch)
 let credentials=read(path.join(old,'secrets.h'))
 credentials=credentials.replace(/^(?:static\s+)?const\s+char\s*\*\s*SUPABASE_[A-Z_]+\s*=\s*"(?:\\.|[^"\\])*"\s*;\s*$/gm,'').replace(/^\s*#define\s+SUPABASE_[A-Z_]+[^\n]*$/gm,'')
 fs.writeFileSync(path.join(secure,'secrets.h'),credentials)
 let ota=read(path.join(old,'ota_config.h')).replace(`"ch${n}-msi-1"`,`"ch${n}-msi-2"`).replaceAll('../common/supabase-ca.h','../common/msi-ca.h').replaceAll('SUPABASE_CA_PEM','NJ_MSI_CA_PEM')
 fs.writeFileSync(path.join(secure,'ota_config.h'),ota)
 if(n!==1)fs.copyFileSync(path.join(old,'network_config.h'),path.join(secure,'network_config.h'))
 const header=read(path.join(old,'telemetry_config.h'))+`\n#define NJ_REPORT_URL "https://farmplast.vercel.app/api/nj-report/chiller-${n}"\n`
 fs.writeFileSync(path.join(secure,'telemetry_config.h'),header)
 const example=base(`Chiller${n}/telemetry_config.example.h`)+`\n#define NJ_REPORT_URL "https://farmplast.vercel.app/api/nj-report/chiller-${n}"\n`
 fs.writeFileSync(path.join(dir,'telemetry_config.example.h'),example)
}
console.log('Prepared three MSI-2 candidates. GPIO, sampling, control and rollback logic unchanged.')
