import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
const root='C:/Users/Owner/AppData/Local/FarmplastMsi20261116/payroll-standby'
await fs.mkdir(root,{recursive:true})
const file=path.join(root,'sacs-msi.env')
const value=crypto.randomBytes(48).toString('base64url')
await fs.writeFile(file,'SACS_FARMPLAST_MSI_SYNC_SECRET='+value+'\n',{flag:'wx'})
await fs.writeFile(path.join(root,'sacs-msi-key.json'),JSON.stringify({name:'SACS_FARMPLAST_MSI_SYNC_SECRET',value},null,2),{flag:'wx'})
console.log(JSON.stringify({created:true,name:'SACS_FARMPLAST_MSI_SYNC_SECRET',sha256:crypto.createHash('sha256').update(value).digest('hex')}))
