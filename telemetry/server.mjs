import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createTelemetryState, VIEW_NAMES } from './state.mjs'

function equal(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function createTelemetryServer(config, state = createTelemetryState()) {
  for (const key of [config.readKey, ...['chiller-1', 'chiller-2', 'chiller-3', 'barrels'].map(id => config.devices?.[id])]) {
    if (typeof key !== 'string' || key.length < 48) throw new Error('Provision independent read/device keys before starting')
  }
  if (new Set([config.readKey, ...Object.values(config.devices)]).size !== 5) throw new Error('Keys must be distinct')
  const lastPost = new Map()
  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)) }
    const url = new URL(req.url, 'http://localhost')
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{48,128})$/)?.[1]
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
    const producer = /^\/v1\/ingest\/(chiller-[123]|barrels)$/.exec(url.pathname)?.[1]
    if (!producer) return send(404, { error: 'Unknown route' })
    if (req.method !== 'POST') return send(405, { error: 'POST required' })
    if (!equal(token, config.devices[producer])) return send(401, { error: 'Authentication required' })
    // Chiller OTA currently depends on the cloud ingest response. Keep those
    // routes closed until a tested metadata-only OTA adapter has been installed.
    if (producer.startsWith('chiller-')) return send(503, { error: 'Chiller cutover not armed: metadata-only OTA adapter required' })
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required' })
    if (Number(req.headers['content-length']) > 24576) return send(413, { error: 'Batch too large' })
    if (Date.now() - (lastPost.get(producer) || 0) < 500) return send(429, { error: 'Too many requests' })
    lastPost.set(producer, Date.now())
    try {
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > 24576) { send(413, { error: 'Batch too large' }); req.destroy(); return }
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const result = state.ingest(producer, body)
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
  const config = JSON.parse(readFileSync(process.env.NJ_TELEMETRY_CONFIG, 'utf8'))
  const server = createTelemetryServer(config)
  server.listen(Number(process.env.PORT || 18220), '127.0.0.1', () => process.stdout.write('Farmplast NJ RAM telemetry listening on loopback\n'))
}
