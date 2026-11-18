import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {ensureBackup} from './monthly-payroll.mjs'
const root='E:/SimScopeData/Backups/FarmplastPayroll'
try{
 const standbyConfig='E:/SimScopeData/Farmplast/PayrollStandby/config.json'
 try{
  const config=JSON.parse((await fs.readFile(standbyConfig,'utf8')).replace(/^\uFEFF/,''))
  if(config.mode!=='standby')throw Error('MSI is active or activating: configure MSI-primary backups; refuse Cloud backup/refresh')
 }catch(error){if(error.code!=='ENOENT')throw error}
 const backup=await ensureBackup('weekly',{fresh:process.argv.includes('--fresh')})
 const refresh='E:/SimScopeData/Farmplast/PayrollStandby/scripts/refresh-standby.mjs'
 let standby={status:'not_configured'}
 try{await fs.access(refresh)
  standby=await new Promise((yes,no)=>{
   const child=spawn(process.execPath,[refresh,'--snapshot',path.dirname(backup.archive)],{windowsHide:true,stdio:['ignore','pipe','pipe']})
   let output=''
   child.stdout.on('data',data=>{output+=data.toString('utf8')})
   child.stderr.on('data',()=>{})
   child.on('error',no);child.on('close',code=>code===0?yes(JSON.parse(output.trim())):no(Error('Standby refresh failed; backup is verified')))
  })
 }catch(error){if(error.code!=='ENOENT')throw error}
 const result={...backup,standby,checkedAt:new Date().toISOString()}
 await fs.writeFile(path.join(root,'last-weekly-status.json'),JSON.stringify(result,null,2))
 console.log(JSON.stringify(result))
}catch(error){
 await fs.writeFile(path.join(root,'last-weekly-status.json'),JSON.stringify({status:'failed',checkedAt:new Date().toISOString(),message:error.message},null,2)).catch(()=>{})
 console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1
}
