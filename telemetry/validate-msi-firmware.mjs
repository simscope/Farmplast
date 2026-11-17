// Offline only. No publication, queue, serial connection or controller command.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {inspectFirmware as inspectCh1} from '../client/src/utils/ch1Firmware.js'
import {inspectFirmware as inspectCh23} from '../client/src/utils/chillerFirmware.js'
const root=process.env.FARMPLAST_MSI_PRIVATE_ROOT || 'C:/Users/Owner/AppData/Local/FarmplastMsi20261116'
const revision=process.env.FARMPLAST_MSI_FW_REVISION||'1'
if(!['1','2'].includes(revision))throw Error('Unknown reviewed revision')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const reports=[]
for(const n of [1,2,3]){
 const dir=path.join(root,`build/ch${n}${revision==='2'?'v2':''}`)
 const image=fs.readFileSync(path.join(dir,`Chiller${n}.ino.bin`))
 const device=n===1?'ESP32-CH1':`ESP32-CH${n}-PLC`
 const metadata=await (n===1?inspectCh1:inspectCh23)(new File([image],`Chiller${n}.ino.bin`),device)
 if(metadata.version!==`ch${n}-msi-${revision}` || metadata.headroom<65536)throw Error('Version or actual OTA-slot headroom rejected')
 const partitionHash=hash(fs.readFileSync(path.join(dir,`Chiller${n}.ino.partitions.bin`)))
 if(partitionHash!=='148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1')throw Error('Partition layout differs from installed firmware')
 let at=24,checksum=0xef
 if(image[1]<1 || image[1]>16)throw Error('Invalid segment count')
 for(let i=0;i<image[1];i++){
  if(at+8>image.length)throw Error('Truncated segment header')
  const length=image.readUInt32LE(at+4);at+=8
  if(at+length>image.length)throw Error('Truncated segment')
  for(const byte of image.subarray(at,at+length))checksum^=byte
  at+=length
 }
 const checksumAt=Math.ceil((at+1)/16)*16-1
 if(image[checksumAt]!==checksum || image[23]!==1 || checksumAt+33!==image.length || hash(image.subarray(0,checksumAt+1))!==image.subarray(checksumAt+1).toString('hex'))throw Error('Full ESP checksum/appended SHA rejected')
 if(!image.includes(Buffer.from(`https://farmplast.vercel.app/api/nj-ingest/chiller-${n}`)))throw Error('MSI HTTPS ingress marker missing')
 if(revision==='2' && (image.includes(Buffer.from('.supabase.co'))||!image.includes(Buffer.from(`https://farmplast.vercel.app/api/nj-report/chiller-${n}`))||!image.includes(Buffer.from('https://farmplast.vercel.app/storage/v1/object/sign/'))))throw Error('Standalone OTA/report transport rejected')
 for(const forbidden of ['/functions/v1/','WebSocketsClient','realtime/v1/websocket'])if(image.includes(Buffer.from(forbidden)))throw Error('Obsolete runtime dependency present')
 reports.push({...metadata,partition_sha256:partitionHash,checksum:'PASS',appended_sha:'PASS',minimum_headroom:65536,compiled:true,validation_stage:'offline'})
}
fs.writeFileSync(path.join(root,revision==='2'?'standalone-firmware-validation.json':'firmware-validation.json'),JSON.stringify(reports,null,2))
console.log(JSON.stringify(reports,null,2))
