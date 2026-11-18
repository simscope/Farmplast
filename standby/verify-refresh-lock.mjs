import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {ROOT,BACKUPS,readJson,run} from './runtime-utils.mjs'
const config=await readJson(path.join(ROOT,'config.json'))
assert.equal(config.mode,'standby')
const statusFile=path.join(ROOT,'runtime/status.json'),lockFile=path.join(ROOT,'private/refresh.lock')
const before=await fs.readFile(statusFile),marker=crypto.randomUUID()
const handle=await fs.open(lockFile,'wx')
try{
 await handle.writeFile(marker)
 let refused=false
 try{await run(process.execPath,[path.join(ROOT,'scripts/refresh-standby.mjs'),'--snapshot',path.join(BACKUPS,'snapshots/2026-W47')])}
 catch(error){assert.match(error.diagnostic,/EEXIST/);refused=true}
 assert.equal(refused,true)
 assert.deepEqual(await fs.readFile(statusFile),before)
 assert.equal(await fs.readFile(lockFile,'utf8'),marker)
 console.log(JSON.stringify({concurrentRefreshRefused:true,statusUnchanged:true,existingLockPreserved:true}))
}finally{await handle.close();if(await fs.readFile(lockFile,'utf8')===marker)await fs.unlink(lockFile)}
