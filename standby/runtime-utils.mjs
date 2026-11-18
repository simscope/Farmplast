import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
export const ROOT='E:/SimScopeData/Farmplast/PayrollStandby'
export const BACKUPS='E:/SimScopeData/Backups/FarmplastPayroll'
export const ident=value=>'"'+value.replaceAll('"','""')+'"'
export const literal=value=>"'"+value.replaceAll("'","''")+"'"
export const readJson=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''))
export const writeJson=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n')
export function run(exe,args,{input,env=process.env,noOutput=false,cwd}={}){
 return new Promise((yes,no)=>{
  const child=spawn(exe,args,{env,cwd,windowsHide:true,stdio:[input===undefined?'ignore':'pipe',noOutput?'ignore':'pipe',noOutput?'ignore':'pipe']})
  let output='',error=''
  child.stdout?.on('data',data=>{output+=data.toString('utf8')})
  child.stderr?.on('data',data=>{error+=data.toString('utf8')})
  child.on('error',no);child.on('close',code=>{if(code===0)yes(output);else{const failure=Error(path.basename(exe)+' failed (exit '+code+')');failure.diagnostic=error;no(failure)}})
  if(input!==undefined)child.stdin.end(input)
 })
}
export const docker=(args,options={})=>run('docker.exe',args,{...options,env:{...process.env,...options.env,DOCKER_HOST:'npipe:////./pipe/dockerDesktopLinuxEngine'}})
export const sql=(database,query)=>docker(['exec','-i','-e','PGCLIENTENCODING=UTF8','-e','PGOPTIONS=-c timezone=UTC','farmplast-payroll-db','psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:query})
export async function assertCluster(){
 const cluster=(await sql('payroll_base',"select current_setting('cluster_name')||':'||current_database();")).trim()
 if(cluster!=='farmplast-payroll-standby:payroll_base')throw Error('Refuse unexpected PostgreSQL target')
}
export async function cleanupWork(directory){
 const base=path.resolve(ROOT,'work'),target=path.resolve(directory)
 if(path.dirname(target)!==base||!/^refresh-[0-9a-f-]{36}$/.test(path.basename(target)))throw Error('Unsafe standby work cleanup target')
 await fs.rm(target,{recursive:true,force:false})
}
