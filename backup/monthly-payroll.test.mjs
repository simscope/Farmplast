import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {safeChild,sha256,encryptArchive,verifyArchive,decryptArchive,restoreListWithoutBootstrapSchemas} from './monthly-payroll.mjs'

test('encrypted backup round-trips and rejects changed ciphertext, tags and wrong keys',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmplast-backup-test-'))
 t.after(async()=>{
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))
  assert.ok(path.basename(root).startsWith('farmplast-backup-test-'))
  await fs.rm(root,{recursive:true})
 })
 const bytes=crypto.randomBytes(2*1024*1024+17),key=crypto.randomBytes(32)
 const source=path.join(root,'source'),encrypted=path.join(root,'archive.enc'),restored=path.join(root,'restored')
 await fs.writeFile(source,bytes)
 await encryptArchive(source,encrypted,key)
 const digest=await sha256(source)
 await verifyArchive(encrypted,key,digest)
 await decryptArchive(encrypted,restored,key)
 assert.equal(await sha256(restored),digest)
 await assert.rejects(verifyArchive(encrypted,crypto.randomBytes(32),digest))
 await assert.rejects(verifyArchive(encrypted,key,'0'.repeat(64)),/checksum/)
 const original=await fs.readFile(encrypted)
 for(const offset of [0,30,original.length-1]){
  const tampered=Buffer.from(original);tampered[offset]^=1
  const file=path.join(root,'tampered-'+offset);await fs.writeFile(file,tampered)
  await assert.rejects(verifyArchive(file,key,digest))
 }
 await assert.rejects(encryptArchive(source,encrypted,key),/EEXIST/)
})

test('storage and staging paths cannot escape their assigned directory',()=>{
 const root=path.resolve('assigned-backup-directory')
 assert.equal(safeChild(root,'object.blob'),path.join(root,'object.blob'))
 assert.throws(()=>safeChild(root,'../outside'),/escapes/)
 assert.throws(()=>safeChild(root,'.'),/escapes/)
})

test('offline bootstrap skips only the two already-created schemas, preserving data, functions, policies and other schemas',()=>{
 const list='10; 2615 1 SCHEMA - public postgres\n11; 2615 2 SCHEMA - extensions postgres\n12; 2615 3 SCHEMA - auth supabase_auth_admin\n13; 1255 4 FUNCTION public f() postgres\n14; 0 5 TABLE DATA public employees postgres\n15; 3256 6 POLICY public employees select_policy postgres\n'
 assert.equal(restoreListWithoutBootstrapSchemas(list),list.split('\n').slice(2).join('\n'))
})
