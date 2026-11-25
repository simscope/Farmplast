import test from 'node:test'
import assert from 'node:assert/strict'
import {Buffer} from 'node:buffer'
import {Readable} from 'node:stream'
import {config as controlApiConfig} from '../api/nj-control.js'
import {createNjTelemetryHandler} from '../server/njTelemetryProxy.mjs'
import {createNjControlHandler} from '../server/njControlProxy.mjs'

const user = '00000000-0000-4000-8000-000000000001'
const authUrl = 'https://auth.example'
function environment() {
  return {
    NJ_TELEMETRY_UPSTREAM: 'https://msi.tail4626fb.ts.net:10000',
    NJ_TELEMETRY_ALLOWED_USER_IDS: user,
    NJ_TELEMETRY_READ_KEY: 'private-test-read-key',
    NJ_CONTROL_API_KEY: 'private-test-control-key',
    VITE_SUPABASE_URL: authUrl,
    VITE_SUPABASE_ANON_KEY: 'public-test-anon-key',
  }
}
function token() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  // Auth is mocked below; this synthetic token only supplies cache-bound claims.
  return `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({
    sub: user, iss: authUrl + '/auth/v1', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic-signature`
}
function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.code = code; return this },
    json(body) { this.body = body; return this },
    send(body) { this.body = body; return this },
  }
}
function streamedRpc(bytes, jwt, headers = {}) {
  // Model Vercel's bodyParser:false request, including arbitrary stream chunks.
  const req = Readable.from([bytes.subarray(0, 7), bytes.subarray(7, 29), bytes.subarray(29)])
  Object.assign(req, {
    method: 'POST', url: '/api/nj-control?kind=rpc',
    headers: {authorization: 'Bearer ' + jwt, 'content-type': 'application/json', ...headers},
  })
  return req
}

test('NJ telemetry reuses verified identity while fetching fresh data and enforcing the current allowlist', async () => {
  const env = environment(), jwt = token()
  let authCalls = 0, upstreamCalls = 0
  const handler = createNjTelemetryHandler(env, async (url, options) => {
    if (String(url) === authUrl + '/auth/v1/user') {
      authCalls++
      assert.equal(options.headers.Authorization, 'Bearer ' + jwt)
      return Response.json({id: user})
    }
    assert.equal(String(url), env.NJ_TELEMETRY_UPSTREAM + '/v1/read/v_ch2_dashboard')
    assert.equal(options.headers.Authorization, 'Bearer ' + env.NJ_TELEMETRY_READ_KEY)
    assert.equal(options.cache, 'no-store')
    return Response.json([{asset_code: 'CH-NJ-02', sample: ++upstreamCalls}])
  })
  const req = {
    method: 'GET', url: '/api/nj-telemetry?view=v_ch2_dashboard',
    headers: {authorization: 'Bearer ' + jwt},
  }
  for (const sample of [1, 2]) {
    const res = response()
    await handler(req, res)
    assert.equal(res.code, 200)
    assert.deepEqual(res.body, [{asset_code: 'CH-NJ-02', sample}])
    assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0')
  }
  assert.equal(authCalls, 1)
  assert.equal(upstreamCalls, 2)

  env.NJ_TELEMETRY_ALLOWED_USER_IDS = 'another-operator'
  const denied = response()
  await handler(req, denied)
  assert.equal(denied.code, 403)
  assert.equal(authCalls, 1)
  assert.equal(upstreamCalls, 2)

  env.NJ_TELEMETRY_ALLOWED_USER_IDS = user
  const restored = response()
  await handler(req, restored)
  assert.equal(restored.code, 200)
  assert.equal(restored.body[0].sample, 3)
  assert.equal(authCalls, 1)
})

test('streamed firmware status RPCs share read verification; commands verify afresh and reject revoked login', async () => {
  assert.equal(controlApiConfig.api.bodyParser, false)
  const env = environment(), jwt = token(), forwarded = []
  let authCalls = 0, rejectAuth = false
  const handler = createNjControlHandler(env, async (url, options) => {
    if (String(url) === authUrl + '/auth/v1/user') {
      authCalls++
      return rejectAuth ? Response.json({message: 'revoked'}, {status: 401}) : Response.json({id: user})
    }
    assert.equal(String(url), env.NJ_TELEMETRY_UPSTREAM + '/v1/control/rpc')
    assert.equal(options.headers.Authorization, 'Bearer ' + env.NJ_CONTROL_API_KEY)
    assert.equal(options.headers['X-Operator-ID'], user)
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.equal(options.cache, 'no-store')
    forwarded.push(options.body)
    return Response.json({sample: forwarded.length})
  })
  const statuses = [
    Buffer.from(' { "name" : "ch1_firmware_status", "args" : {} }\n'),
    Buffer.from('{\n"args":{"p_device":"chiller-2"}, "name":"chiller_firmware_status" }\n'),
  ]
  for (const [index, bytes] of statuses.entries()) {
    const req = streamedRpc(bytes, jwt), res = response()
    assert.equal(req.body, undefined)
    await handler(req, res)
    assert.equal(res.code, 200)
    assert.deepEqual(forwarded[index], bytes)
    assert.deepEqual(JSON.parse(res.body.toString()), {sample: index + 1})
  }
  assert.equal(authCalls, 1)

  const command = Buffer.from('{"name":"ch1_command","args":{"p_command":"reset_alert","p_payload":{"reset":true}}}')
  rejectAuth = true
  const denied = response()
  await handler(streamedRpc(command, jwt), denied)
  assert.equal(denied.code, 401)
  assert.equal(authCalls, 2)
  assert.equal(forwarded.length, 2)

  // A rejected fresh verification also invalidates the earlier cached read.
  rejectAuth = false
  const recovered = response()
  await handler(streamedRpc(statuses[0], jwt), recovered)
  assert.equal(recovered.code, 200)
  assert.equal(authCalls, 3)
  assert.equal(forwarded.length, 3)
  assert.deepEqual(forwarded[2], statuses[0])

  const accepted = response()
  await handler(streamedRpc(command, jwt), accepted)
  assert.equal(accepted.code, 200)
  assert.equal(authCalls, 4)
  assert.deepEqual(forwarded[3], command)
})

test('oversized streamed RPCs reject before Auth or MSI, including a misleading content-length', async () => {
  const env = environment(), jwt = token()
  let networkCalls = 0
  const handler = createNjControlHandler(env, async () => {
    networkCalls++
    throw Error('Oversized requests must not reach the network')
  })
  const bytes = Buffer.from(JSON.stringify({name: 'ch1_firmware_status', args: {padding: 'x'.repeat(32768)}}))
  for (const headers of [{}, {'content-length': '1'}, {'content-length': String(bytes.length)}]) {
    const res = response()
    await handler(streamedRpc(bytes, jwt, headers), res)
    assert.equal(res.code, 413)
    assert.equal(res.body.message, 'Request too large')
  }
  assert.equal(networkCalls, 0)
})
