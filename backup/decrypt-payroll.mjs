import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {sha256,verifyArchive,decryptArchive} from './monthly-payroll.mjs'

const [snapshot,keyFile,output]=process.argv.slice(2)
if(!snapshot||!keyFile||!output)throw Error('Usage: node decrypt-payroll.mjs <snapshot-directory> <archive-key.json> <new-private-output-directory>')
const target=path.resolve(output)
const allowedRoots=['E:/SimScopeData/Backups/FarmplastPayroll/recovery','C:/Users/Owner/AppData/Local/FarmplastMsi20261116/payroll-backup-recovery'].map(p=>path.resolve(p)+path.sep)
if(!allowedRoots.some(root=>target.startsWith(root)))throw Error('Choose a new directory inside a configured private recovery root')
const manifest=JSON.parse(await fs.readFile(path.join(snapshot,'manifest.json'),'utf8'))
const secret=JSON.parse(await fs.readFile(keyFile,'utf8')),key=Buffer.from(secret.key,'base64')
if(manifest.keyId!==secret.keyId||manifest.status!=='verified')throw Error('Recovery key or snapshot mismatch')
const archive=path.join(snapshot,'payroll.tar.enc')
if(await sha256(archive)!==manifest.encryptedSha256)throw Error('Encrypted archive checksum mismatch')
await verifyArchive(archive,key,manifest.plaintextSha256)
// Refuse an existing destination; recovery never replaces an earlier copy or any database.
await fs.mkdir(path.dirname(target),{recursive:true})
await fs.mkdir(target)
const tar=path.join(target,'payroll.tar')
await decryptArchive(archive,tar,key)
await new Promise((yes,no)=>{
 const child=spawn('C:/Windows/System32/tar.exe',['-xf',tar,'-C',target],{windowsHide:true,stdio:'ignore'})
 child.on('error',no);child.on('close',code=>code===0?yes():no(Error('Archive extraction failed')))
})
const objects=JSON.parse(await fs.readFile(path.join(target,'storage-objects.json'),'utf8'))
for(const object of objects){
 const file=path.resolve(target,object.file)
 if(!file.startsWith(target+path.sep))throw Error('Invalid storage path')
 if(await sha256(file)!==object.sha256)throw Error('Restored employee photo checksum mismatch')
}
console.log(JSON.stringify({status:'decrypted_and_files_verified',directory:target,tables:manifest.verification.tables,photos:objects.length,databaseRestored:false}))

