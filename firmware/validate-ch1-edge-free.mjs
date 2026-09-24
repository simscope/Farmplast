import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {inspectFirmware} from '../client/src/utils/ch1Firmware.js'

// Offline post-link gate only. Never uploads, publishes, queues or flashes.
const [app,partitionPath,version,output]=process.argv.slice(2)
if(!output) throw Error('Usage: node validate-ch1-edge-free.mjs app.bin partitions.bin version output.json')
const image=await readFile(app),partitions=await readFile(partitionPath)
const metadata=await inspectFirmware(new File([image],'app.bin'),'ESP32-CH1')
if(metadata.version!==version)throw Error('Unexpected firmware version')
const hash=b=>createHash('sha256').update(b).digest('hex')
const partitionHash=hash(partitions)
if(partitionHash!=='148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1')throw Error('Partition layout differs from preserved CH1 build')
for(const marker of ['/functions/v1/','WebSocketsClient','realtime/v1/websocket'])if(image.includes(Buffer.from(marker)))throw Error('Forbidden runtime dependency: '+marker)
let at=24,checksum=0xef
if(image[1]<1 || image[1]>16)throw Error('Invalid segment count')
for(let i=0;i<image[1];i++) {
 if(at+8>image.length)throw Error('Truncated segment header')
 const length=image.readUInt32LE(at+4);at+=8
 if(at+length>image.length)throw Error('Truncated segment')
 for(const byte of image.subarray(at,at+length))checksum^=byte
 at+=length
}
const checksumAt=Math.ceil((at+1)/16)*16-1
if(image[checksumAt]!==checksum)throw Error('ESP image checksum failed')
if(image[23]!==1 || checksumAt+33!==image.length || hash(image.subarray(0,checksumAt+1))!==image.subarray(checksumAt+1).toString('hex'))throw Error('ESP appended image SHA failed')
const report={...metadata,partition_sha256:partitionHash,checksum:'PASS',appended_sha:'PASS',edge_references:0,websocket_references:0,validation:'PASS',published:false,physical_validation:'NOT RUN'}
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
