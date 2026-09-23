import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {inspectImage} from './prepare-chiller-release.mjs'

export const OTA_SLOT_BYTES=0x140000
export const MIN_HEADROOM_BYTES=64*1024
export const PARTITIONS_SHA256='148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1'

// Post-link build gate: use the entire app image, not just the sketch text size.
// This utility has no upload, release registration or flash operation.
export function inspectRuntimeImage(image,device,version,diagnostics=true) {
  const metadata=inspectImage(image,device,version)
  const headroom=OTA_SLOT_BYTES-image.length
  if(headroom<MIN_HEADROOM_BYTES) throw new Error('OTA slot headroom below required 65536 bytes')
  for(const marker of ['CH23_RUNTIME_DIAGNOSTICS=1','[RUNTIME] uptime_ms=']) {
    if(image.includes(Buffer.from(marker))!==diagnostics) throw new Error('Diagnostic mode markers do not match requested build mode')
  }
  return {device,version,sha256:metadata.sha256,size:image.length,ota_slot_bytes:OTA_SLOT_BYTES,
    ota_headroom_bytes:headroom,minimum_headroom_bytes:MIN_HEADROOM_BYTES,
    diagnostics,compile_only:true,physical_validation:'NOT RUN',production_release:false}
}
export function validateRuntimeBuild(image,partitions,device,version,diagnostics=true) {
  const result=inspectRuntimeImage(image,device,version,diagnostics)
  const partitionSha256=createHash('sha256').update(partitions).digest('hex')
  if(partitionSha256!==PARTITIONS_SHA256) throw new Error('Partition table differs from PR #19 default OTA layout')
  return {...result,partition_sha256:partitionSha256}
}

async function main() {
  const [device,app,partitions,version,output,mode]=process.argv.slice(2)
  if(!output || (mode && mode!=='--production')) throw new Error('Usage: node validate-chiller-runtime-build.mjs device app.bin partitions.bin version output.json [--production]')
  const result=validateRuntimeBuild(await readFile(app),await readFile(partitions),device,version,mode!=='--production')
  await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(result,null,2))
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main()
