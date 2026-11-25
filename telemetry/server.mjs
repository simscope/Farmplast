import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createTelemetryState, VIEW_NAMES } from './state.mjs'
import { createCloudBridge } from './otaBridge.mjs'
import {createCloudReporter} from './otaBridge.mjs'
import {openControlStore} from './controlStore.mjs'
import {createLocalControlHttp} from './localControlHttp.mjs'
import {createClimateGateway} from './climateGateway.mjs'

function equal(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function createTelemetryServer(config, state = createTelemetryState(), bridge = createCloudBridge(config), controlHttp = null) {
  for (const key of [config.readKey, ...['chiller-1', 'chiller-2', 'chiller-3', 'barrels'].map(id => config.devices?.[id])]) {
    if (typeof key !== 'string' || key.length < 48) throw new Error('Provision independent read/device keys before starting')
  }
  if (new Set([config.readKey, ...Object.values(config.devices)]).size !== 5) throw new Error('Keys must be distinct')
  const lastPost = new Map()
  const climate = config.climateProxy ? createClimateGateway(config.climateProxy) : null
  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)) }
    const url = new URL(req.url, 'http://localhost')
    if(climate && await climate(req,res,url))return
    if(controlHttp && await controlHttp(req,res,url))return
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,256})$/)?.[1]
    if (url.pathname === '/healthz' && req.method === 'GET') return send(200, { ok: true, storage: 'memory', history: false })
    if (url.pathname === '/v1/status') {
      if (req.method !== 'GET') return send(405, { error: 'Read only' })
      if (!equal(token, config.readKey)) return send(401, { error: 'Authentication required' })
      return send(200, state.status())
    }
    if (url.pathname.startsWith('/v1/read/')) {
      if (req.method !== 'GET') return send(405, { error: 'Read only' })
      if (!equal(token, config.readKey)) return send(401, { error: 'Authentication required' })
      const view = url.pathname.slice('/v1/read/'.length)
      if (!VIEW_NAMES.includes(view)) return send(404, { error: 'Unknown view' })
      let rows = state.read(view)
      const asset = url.searchParams.get('asset_code')
      if (asset) rows = rows.filter(r => r.asset_code === asset)
      return send(200, rows)
    }
    const route = /^\/v1\/(ingest|mirror|relay)\/(chiller-[123]|barrels)$/.exec(url.pathname)
    const producer = route?.[2], transport = route?.[1]
    if (!producer || (producer === 'barrels' && transport !== 'ingest')) return send(404, { error: 'Unknown route' })
    if (req.method !== 'POST') return send(405, { error: 'POST required' })
    const expected = transport === 'ingest' ? config.devices[producer] : config.legacyKeys?.[producer] && Buffer.from(config.legacyKeys[producer]).toString('base64url')
    if (!equal(token, expected)) return send(401, { error: 'Authentication required' })
    if (producer.startsWith('chiller-') && transport !== 'mirror' && !bridge) return send(503, { error: 'Chiller control exchange not configured' })
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required' })
    if (Number(req.headers['content-length']) > 32768) return send(413, { error: 'Batch too large' })
    const rateKey = transport + producer
    if (Date.now() - (lastPost.get(rateKey) || 0) < 500) return send(429, { error: 'Too many requests' })
    lastPost.set(rateKey, Date.now())
    try {
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > 32768) { send(413, { error: 'Batch too large' }); req.destroy(); return }
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const result = state.ingest(producer, body, transport === 'ingest' ? 'direct' : transport)
      if (producer.startsWith('chiller-') && transport !== 'mirror') {
        try { return send(200, await bridge(producer,body)) }
        catch { return send(503, { error:'Control exchange unavailable; readings accepted in RAM' }) }
      }
      return send(200, result)
    } catch {
      // Never log request bodies, bearer keys, readings, or error payloads.
      if (!res.headersSent) return send(400, { error: 'Invalid telemetry batch' })
    }
  })
  server.maxConnections = 32
  const expiry = setInterval(() => state.expire(), 1000)
  expiry.unref()
  server.on('close', () => clearInterval(expiry))
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
   const config = JSON.parse(readFileSync(process.env.NJ_TELEMETRY_CONFIG, 'utf8'))
   const store=config.control?await openControlStore(config.control):null
   const local=config.control?.mode==='local'
   const bridge=local?(producer,body)=>store.exchange(producer,body,config):createCloudBridge(config)
   const reporter=local?(producer,args)=>store.report(producer,args):createCloudReporter(config)
   const server = createTelemetryServer(config,createTelemetryState(),bridge,store?createLocalControlHttp(config,store,reporter):null)
   server.listen(Number(process.env.PORT || 18220), '127.0.0.1', () => process.stdout.write('Farmplast NJ RAM telemetry listening on loopback\n'))
   for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await store?.close();process.exit(0)}))
  } catch {process.stderr.write('MSI telemetry startup rejected; inspect private configuration without logging credentials.\n');process.exit(1)}
}
