export const devices = Object.freeze({
 'ESP32-CH2-PLC':{model:'CH2-WT32-ETH01-v1',key:'CH2_OTA_DEVICE_KEY'},
 'ESP32-CH3-PLC':{model:'CH3-WT32-ETH01-v1',key:'CH3_OTA_DEVICE_KEY'},
})
// Future firmware only: closed vocabulary, never URLs, keys or server response text.
export const failureCodes = Object.freeze(['stage_sync_failed','state_save_failed','slot_invalid','job_expired','download_begin_failed','download_http_status','download_size_mismatch','ota_begin_failed','download_timeout','ota_write_failed','sha256_mismatch','version_marker_missing','device_marker_missing','ota_end_failed','boot_partition_failed','interrupted_update','telemetry_timeout'])
export const validFailureReport = body => body.failure_code == null ||
 (body.status === 'failed' && typeof body.failure_code === 'string' && failureCodes.includes(body.failure_code) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.job || ''))
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
export async function equalSecret(a, b) {
  const left = await digest(a), right = await digest(b)
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}
export function canonical(job) {
  return [job.id, job.action, job.device, job.model, job.version, job.sha256, job.size, job.expires].join('|')
}
export async function sign(job, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical(job))))
}
export function validQueue(body) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  return body.action === 'update' && uuid.test(body.id || '') && uuid.test(body.release || '')
}
