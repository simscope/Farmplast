import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function inspectImage(image, device, version) {
  if (!['ESP32-CH2-PLC','ESP32-CH3-PLC'].includes(device) || !/^[A-Za-z0-9._-]{1,48}$/.test(version || '')) throw new Error('Invalid device/version')
  if (image.length<256 || image.length>1310720 || image[0]!==0xe9 || image.readUInt16LE(12)!==0 || image.readUInt32LE(32)!==0xabcd5432) throw new Error('Expected classic ESP32 app image fitting a 0x140000 OTA slot; not a merged image or ESP32-S3')
  if (!image.includes(Buffer.from(`CH23OTA_VERSION=${version}\0`)) || !image.includes(Buffer.from(`CH23OTA_DEVICE=${device}\0`))) throw new Error('Firmware identity/version does not match the selected device')
  const sha256=createHash('sha256').update(image).digest('hex')
  return {device,version,model:device==='ESP32-CH2-PLC'?'CH2-WT32-ETH01-v1':'CH3-WT32-ETH01-v1',sha256,size:image.length,storage_path:`${device}/${version}/${sha256}.bin`,approved:false}
}

async function main() {
  const [device,input,version,output,mode]=process.argv.slice(2)
  if(mode==='--publish') throw new Error('Use the authenticated Firmware Upload UI with stored-byte verification; direct table approval is retired.')
  if(!output || mode) throw new Error('Usage: node prepare-chiller-release.mjs ESP32-CH2-PLC app.bin version manifest.json')
  const image=await readFile(input), metadata=inspectImage(image,device,version)
  await writeFile(resolve(output),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'})
  console.log('Validated image; unapproved metadata written. Nothing uploaded or programmed.')
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main()
