// Exercise the installed adapter against an isolated temporary store and a
// synthetic Auth server. Never connect to a production controller or cloud API.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

const {createClimateFetch} = await import(pathToFileURL(process.argv[2]).href)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmplast-auth-probe-'))
const id = '00000000-0000-4000-8000-000000000001'
const authUrl = 'https://synthetic-auth.invalid'
const payload = Buffer.from(JSON.stringify({sub:id,iss:authUrl+'/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')
const token = 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.synthetic-signature'
let authCalls = 0, accepted = true
const runtime = createClimateFetch({dir,adminKey:'a'.repeat(64),authUrl,authAnonKey:'synthetic-public',allowedUserIds:id}, {
  fetchImpl: async url => {
    assert.equal(url, authUrl+'/auth/v1/user')
    authCalls++
    return accepted ? Response.json({id}) : Response.json({error:'revoked'}, {status:401})
  },
})
const request = (method='GET') => new Request('http://localhost/climate/operator/zones'+(method==='POST'?'/synthetic-zone/desired':''), {method,headers:{Authorization:'Bearer '+token}})
try {
  for (let i=0;i<30;i++) assert.equal((await runtime.route(request())).status, 200)
  assert.equal(authCalls, 1)
  accepted = false
  assert.equal((await runtime.route(request('POST'))).status, 401)
  assert.equal(authCalls, 2)
  assert.equal((await runtime.route(request())).status, 401)
  assert.equal(authCalls, 3)
  console.log(JSON.stringify({readRequests:30,readAuthRequests:1,freshMutationRejected:true,failedVerificationInvalidatedReadCache:true}))
} finally {
  // Only this directly-created OS temporary directory is removed.
  const resolved = fs.realpathSync(dir), tempRoot = fs.realpathSync(os.tmpdir())
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('farmplast-auth-probe-')) throw Error('Unsafe temporary path')
  fs.rmSync(resolved, {recursive:true})
}
