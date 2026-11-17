export const OTA_SLOT_BYTES=1310720
export const FIRMWARE_BUCKET='ch1-firmware'
export const SIGNED_URL_SECONDS=1800
export const requiresPhysicalMigration=device=>device?.version==='ch1-ota-2'
const devices=['ESP32-CH1']
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')
}
function uniqueMarker(text,name,pattern) {
  const values=[...new Set([...text.matchAll(new RegExp(`${name}=(${pattern})\\x00`,'g'))].map(m=>m[1]))]
  if(values.length!==1) throw new Error(`Missing or ambiguous ${name} marker.`)
  return values[0]
}
export async function inspectFirmware(file,target) {
  if(!/\.bin$/i.test(file.name)) throw new Error('Select an application .bin file.')
  if(file.size<256 || file.size>OTA_SLOT_BYTES-65536) throw new Error('Image exceeds the OTA slot or is too small.')
  const bytes=await file.arrayBuffer(), view=new DataView(bytes)
  if(bytes.byteLength!==file.size || view.getUint8(0)!==0xe9 || view.getUint16(12,true)!==9 || view.getUint32(32,true)!==0xabcd5432)
    throw new Error('Expected a ESP32-S3 application image, not a merged image.')
  // Header checks mirror the existing release validator. Device still validates
  // the complete ESP image, SHA/HMAC and embedded identities before activation.
  const text=new TextDecoder('latin1').decode(bytes)
  const device=uniqueMarker(text,'CH1OTA_DEVICE','[A-Za-z0-9_-]{1,48}')
  if(uniqueMarker(text,'CH1OTA_MODEL','[A-Za-z0-9_-]{1,48}')!=='CH1-ESP32S3-v1') throw new Error('Wrong CH1 model.');
  const version=uniqueMarker(text,'CH1OTA_VERSION','[A-Za-z0-9._-]{1,48}')
  if(version==='.' || version==='..') throw new Error('Invalid version path segment.')
  if(!devices.includes(device) || device!==target) throw new Error('Firmware target does not match this controller.')
  const hash=await sha256(bytes)
  return {device,version,sha256:hash,size:bytes.byteLength,headroom:OTA_SLOT_BYTES-bytes.byteLength,storage_path:`${device}/${version}/${hash}.bin`}
}
export async function rpc(client,name,args) {
  const {data,error}=await client.rpc(name,args)
  // Never display provider error text that could contain a URL or secret argument.
  if(error) throw new Error('Request rejected or unavailable. Refresh status before retrying.')
  if(data?.error) throw new Error(({rate_limited:'Too many code attempts. Wait 15 minutes.',invalid_code:'Invalid programming code.',access_denied:'Operator access denied.'})[data.error]||'Request rejected.')
  return data
}
export async function uploadAndVerify(client,file,target,expected) {
  // Re-inspect the actual selected bytes; a stale modal cannot approve another file.
  const image=await inspectFirmware(file,target)
  if(image.sha256!==expected.sha256) throw new Error('Selected image changed. Select it again.')
  const status=await rpc(client,'ch1_firmware_status',{})
  const existing=status.releases?.find(r=>r.version===image.version)
  if(existing && (existing.sha256!==image.sha256 || existing.size!==image.size)) throw new Error('Conflicting version already exists.')
  const bucket=client.storage.from(FIRMWARE_BUCKET)
  if(!existing) {
    const {error}=await bucket.upload(image.storage_path,file,{upsert:false,contentType:'application/octet-stream'})
    // An interrupted earlier upload can leave an immutable unapproved object.
    // Readback must still succeed and match before approval; never overwrite it.
    if(error && !['409','400'].includes(String(error.statusCode))) throw new Error('Private firmware upload failed. No release approved.')
  }
  const {data:stored,error}=await bucket.download(image.storage_path)
  if(error || !stored || stored.size!==image.size || await sha256(await stored.arrayBuffer())!==image.sha256)
    throw new Error('Stored-byte SHA verification failed. No release approved.')
  return image
}
export async function approveFirmware(client,file,target,verified) {
  if(!verified) throw new Error('Verify the stored image before approval.')
  const image=await inspectFirmware(file,target)
  if(['device','version','sha256','size','storage_path'].some(k=>image[k]!==verified[k])) throw new Error('Verification is stale. Verify the selected image again.')
  const {data:stored,error}=await client.storage.from(FIRMWARE_BUCKET).download(image.storage_path)
  if(error || !stored || stored.size!==image.size || await sha256(await stored.arrayBuffer())!==image.sha256)
    throw new Error('Stored-byte SHA verification failed. No release approved.')
  return rpc(client,'ch1_firmware_publish',{p_version:image.version,p_sha256:image.sha256,p_size:image.size,p_storage_path:image.storage_path,p_verified_sha256:image.sha256})
}
export function signedUrlExpiry(url) {
  // Read the actual Storage token exp instead of trusting the browser clock.
  const token=new URL(url).searchParams.get('token'),part=token?.split('.')[1]
  if(!part) throw new Error('Storage returned an invalid signed URL.')
  const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')))
  if(!Number.isSafeInteger(claims.exp)) throw new Error('Storage expiry is missing.')
  return new Date(claims.exp*1000).toISOString()
}
export async function queueFirmware(client,{code,release,requestId}) {
  // Recheck the live source before issuing any unlock, signed URL or queue RPC.
  const status=await rpc(client,'ch1_firmware_status',{})
  if(!status?.device || requiresPhysicalMigration(status.device))
    throw new Error('PHYSICAL MIGRATION REQUIRED. Install ch1-edgefree-2 by USB once.')
  const {grant}=await rpc(client,'ch1_firmware_unlock',{p_code:code})
  const {data,error}=await client.storage.from(FIRMWARE_BUCKET).createSignedUrl(release.storage_path,SIGNED_URL_SECONDS)
  if(error || !data?.signedUrl) throw new Error('Could not create a bounded download URL. No job queued.')
  return rpc(client,'ch1_firmware_queue',{p_grant:grant,p_id:requestId,p_release:release.id,p_signed_url:data.signedUrl,p_signed_url_expires_at:signedUrlExpiry(data.signedUrl)})
}

export async function loadFirmwareStatus(client,signal) {
  try {return await client.rpc('ch1_firmware_status').abortSignal(signal)}
  catch(error) {return {error}}
}
