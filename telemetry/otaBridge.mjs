import { ASSETS } from './state.mjs'
import { gatewayFor, controlReport } from './protocol.mjs'
export function createCloudBridge(config, fetcher = fetch) {
  if (config.cloud?.url !== 'https://eeobivvwjzakbweluwtm.supabase.co' || !config.cloud.anonKey || ['chiller-1','chiller-2','chiller-3'].some(id => typeof config.legacyKeys?.[id] !== 'string' || config.legacyKeys[id].length < 16)) return null
  return async (producer, body) => {
    const gateway = gatewayFor(producer,body)
    const report = producer === 'chiller-1' ? controlReport(Array.isArray(body) ? body : body.p_rows) : {}
    const response = await fetcher(config.cloud.url + '/rest/v1/rpc/nj_msi_exchange', {
      method:'POST', headers:{'Content-Type':'application/json',apikey:config.cloud.anonKey,Authorization:'Bearer '+config.cloud.anonKey},
      body:JSON.stringify({p_device:ASSETS.find(a=>a.producer===producer).device_code,p_key:config.legacyKeys[producer],p_gateway:gateway,p_reported:report}),
      redirect:'error', cache:'no-store', signal:AbortSignal.timeout(4000),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('Control exchange unavailable') }
    const reader = response.body.getReader()
    let size = 0
    const chunks = []
    try {
      while (true) {
        const {done,value} = await reader.read()
        if (done) break
        size += value.length
        if (size > 4096) { await reader.cancel(); throw new Error('Control response too large') }
        chunks.push(Buffer.from(value))
      }
    } finally { reader.releaseLock() }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result) || (producer === 'chiller-1' && (!Array.isArray(result.c) || result.c.length !== 9))) throw new Error('Invalid control response')
    return result
  }
}
