export const devices = Object.freeze({
 'ESP32-CH2-PLC':{model:'CH2-WT32-ETH01-v1',key:'CH2_OTA_DEVICE_KEY'},
 'ESP32-CH3-PLC':{model:'CH3-WT32-ETH01-v1',key:'CH3_OTA_DEVICE_KEY'},
})
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
