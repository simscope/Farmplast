import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(process.argv[2] || 'E:/SimScopeData/Backups/FarmplastPayroll')
if (root !== path.resolve('E:/SimScopeData/Backups/FarmplastPayroll')) throw Error('Unexpected backup root')
const privateRoot = path.join(root, 'private')
await fs.mkdir(privateRoot, {recursive:true})
const keyFile = path.join(privateRoot, 'archive-key.json')
try { await fs.access(keyFile); throw Error('Provisioning already exists; refuse to rotate credentials or keys implicitly') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const password = crypto.randomBytes(48).toString('base64url')
const salt = crypto.randomBytes(16)
const salted = crypto.pbkdf2Sync(password, salt, 4096, 32, 'sha256')
const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest()
const storedKey = crypto.createHash('sha256').update(clientKey).digest('base64')
const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest('base64')
const verifier = 'SCRAM-SHA-256$4096:' + salt.toString('base64') + '$' + storedKey + ':' + serverKey
await fs.writeFile(path.join(privateRoot, 'pgpass.conf'), 'db.eeobivvwjzakbweluwtm.supabase.co:5432:postgres:farmplast_msi_backup:' + password + '\n', {flag:'wx'})
const key = {format:1,algorithm:'aes-256-gcm',keyId:crypto.randomUUID(),key:crypto.randomBytes(32).toString('base64'),createdAt:new Date().toISOString()}
await fs.writeFile(keyFile, JSON.stringify(key, null, 2), {flag:'wx'})
await fs.writeFile(path.join(privateRoot, 'credential-verifier.txt'), verifier, {flag:'wx'})
await fs.writeFile(path.join(root, 'config.json'), JSON.stringify({
  project:'eeobivvwjzakbweluwtm',source:'https://eeobivvwjzakbweluwtm.supabase.co',
  host:'db.eeobivvwjzakbweluwtm.supabase.co',port:5432,database:'postgres',user:'farmplast_msi_backup',
  pgBin:path.join(root,'tools','pgsql','bin'),timeZone:'America/New_York',
  schemas:['public','employee_presence_private','farmplast_zkt_private','auth','storage','supabase_migrations','extensions'],
  storageBuckets:['employee-photos'],retention:'keep_all_verified_monthly_snapshots'
}, null, 2), {flag:'wx'})
console.log(JSON.stringify({provisioned:true,keyId:key.keyId,...(process.argv.includes('--emit-scram-verifier')?{verifier}:{})}))
