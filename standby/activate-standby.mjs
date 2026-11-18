import fs from 'node:fs/promises'
import path from 'node:path'
import {ROOT,readJson,writeJson,sql,assertCluster} from './runtime-utils.mjs'
await assertCluster()
const config=await readJson(path.join(ROOT,'config.json')),state=await readJson(path.join(ROOT,'runtime/status.json'))
if(config.mode!=='standby'||state.mode!=='standby'||!state.ready||!state.storageReady)throw Error('Expected a healthy read-only reserve')
const ageMinutes=(Date.now()-Date.parse(state.snapshotAt))/60000
const hasFence=(await sql(state.generation,"select to_regclass('farmplast_zkt_private.msi_cutover_fence') is not null;")).trim()==='t'
const sourceFenced=hasFence&&(await sql(state.generation,'select frozen from farmplast_zkt_private.msi_cutover_fence where id;')).trim()==='t'
const serverEnv=await readJson(path.join(ROOT,'private/server-env.json'))
for(const key of ['FARMPLAST_SERVICE_ROLE_KEY','SACS_FARMPLAST_SYNC_SECRET','SACS_FARMPLAST_SSO_SECRET'])if(!serverEnv[key])throw Error('Missing private integration setting: '+key)
const report={mode:'standby',ready:true,snapshotAt:state.snapshotAt,ageMinutes:Math.round(ageMinutes),sourceFenceInSnapshot:sourceFenced,wouldQuarantineInheritedCommands:true}
if(!process.argv.includes('--activate')){console.log(JSON.stringify({...report,dryRun:true}));process.exit(0)}
if(!process.argv.includes('--ack-bridges-stopped'))throw Error('Stop both source bridges and acknowledge this before activation')
if(!sourceFenced||ageMinutes<0||ageMinutes>30)throw Error('A verified snapshot of the frozen source taken within 30 minutes is required; outage recovery needs a separate reviewed decision')
const lock=await fs.open(path.join(ROOT,'private/refresh.lock'),'wx')
try{
 await lock.writeFile(JSON.stringify({pid:process.pid,operation:'activate',startedAt:new Date().toISOString()}))
 const lockedConfig=await readJson(path.join(ROOT,'config.json')),lockedState=await readJson(path.join(ROOT,'runtime/status.json'))
 if(lockedConfig.mode!=='standby'||!lockedState.ready||lockedState.generation!==state.generation||lockedState.snapshotHash!==state.snapshotHash)throw Error('Reserve changed during preflight; rerun readiness checks')
 // Mark the reserve unavailable before changing either write gate. A partial activation fails closed.
 await writeJson(path.join(ROOT,'config.json'),{...config,mode:'activating'})
 await writeJson(path.join(ROOT,'runtime/status.json'),{...state,ready:false,activating:true})
 await sql(state.generation,[
  'BEGIN;',
  "UPDATE _farmplast_reserve.state SET mode='active' WHERE id;",
  'UPDATE farmplast_zkt_private.msi_cutover_fence SET frozen=false,changed_at=now() WHERE id;',
  "UPDATE public.zkt_bridge_commands SET status='error',error='Cancelled inherited command during MSI cutover; requeue explicitly if still needed',finished_at=now() WHERE status IN('pending','pending_pa','running','processing');",
  "UPDATE public.employees SET zkt_sync_status='error',zkt_sync_error='Inherited pending sync quarantined during MSI cutover; requeue explicitly' WHERE zkt_sync_status='pending';",
  'COMMIT;'
 ].join('\n'))
 await fs.copyFile(path.join(ROOT,'private/server-env.json'),path.join(ROOT,'runtime/server-env.json'))
 const active={...state,mode:'active',ready:true,activatedAt:new Date().toISOString(),activating:false}
 await writeJson(path.join(ROOT,'config.json'),{...config,mode:'active'})
 await writeJson(path.join(ROOT,'private/current-generation.json'),active)
 await writeJson(path.join(ROOT,'runtime/status.json'),active)
 console.log(JSON.stringify({activated:true,url:config.url,snapshotAt:state.snapshotAt,cloudRemainsFenced:true,next:'Switch prepared NJ/PA workers; configure weekly MSI-primary backups before resuming payroll operations'}))
}finally{await lock.close();await fs.unlink(path.join(ROOT,'private/refresh.lock'))}
