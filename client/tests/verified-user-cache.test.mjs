import test from 'node:test'
import assert from 'node:assert/strict'
import {createUserVerifier} from '../server/verifiedUser.mjs'

const config={authUrl:'https://farmplast-auth.example',authAnonKey:'public-synthetic-anon-key'}
const userId='00000000-0000-4000-8000-000000000001'
const initialTime=1_900_000_000_000
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt=(claims={},signature='synthetic-signature')=>[
  encode({alg:'ES256',typ:'JWT',kid:'synthetic-key'}),
  encode({sub:userId,iss:config.authUrl+'/auth/v1',aud:'authenticated',exp:initialTime/1000+600,...claims}),
  signature,
].join('.')
const ok=()=>Response.json({id:userId,user_metadata:{role:'admin'},email:'synthetic@example.test'})
function deferred(){
  let resolve,reject
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
const turn=()=>new Promise(resolve=>setImmediate(resolve))

test('read polling reuses only a remotely verified identity for the exact bearer',async()=>{
  const calls=[]
  const token=jwt()
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async(url,options)=>{calls.push({url,options});return ok()}})
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  assert.equal(calls.length,1)
  assert.equal(String(calls[0].url),config.authUrl+'/auth/v1/user')
  const headers=new Headers(calls[0].options.headers)
  assert.equal(headers.get('apikey'),config.authAnonKey)
  assert.equal(headers.get('authorization'),'Bearer '+token)
})

test('concurrent reads share one in-flight remote verification',async()=>{
  let calls=0
  const remote=deferred()
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:()=>{calls++;return remote.promise}})
  const reads=Array.from({length:8},()=>verify(config,jwt(),{readOnly:true}))
  await turn()
  assert.equal(calls,1)
  remote.resolve(ok())
  assert.deepEqual(await Promise.all(reads),Array.from({length:8},()=>({id:userId})))
  assert.deepEqual(await verify(config,jwt(),{readOnly:true}),{id:userId})
  assert.equal(calls,1)
})

test('cache lifetime is fixed and repeated reads do not extend it',async()=>{
  let clock=initialTime,calls=0
  const verify=createUserVerifier({now:()=>clock,fetchImpl:async()=>{calls++;return ok()}})
  const token=jwt()
  await verify(config,token,{readOnly:true})
  clock+=59_000
  await verify(config,token,{readOnly:true})
  assert.equal(calls,1)
  clock+=1_000
  await verify(config,token,{readOnly:true})
  assert.equal(calls,2)
})

test('a shorter configured cache lifetime is respected',async()=>{
  let clock=initialTime,calls=0
  const verify=createUserVerifier({ttlMs:1_000,now:()=>clock,fetchImpl:async()=>{calls++;return ok()}})
  await verify(config,jwt(),{readOnly:true})
  clock+=999
  await verify(config,jwt(),{readOnly:true})
  assert.equal(calls,1)
  clock++
  await verify(config,jwt(),{readOnly:true})
  assert.equal(calls,2)
})

test('cached identities stop at JWT expiry even before the cache TTL',async()=>{
  let clock=initialTime,calls=0
  const token=jwt({exp:initialTime/1000+5})
  const verify=createUserVerifier({now:()=>clock,fetchImpl:async()=>{calls++;return ok()}})
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  clock+=4_999
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  clock++
  assert.equal(await verify(config,token,{readOnly:true}),null)
  assert.equal(await verify(config,token),null)
  assert.equal(calls,1)
})

test('an already expired JWT is rejected without a remote request',async()=>{
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
  for(const exp of [initialTime/1000,initialTime/1000-1]){
    assert.equal(await verify(config,jwt({exp}),{readOnly:true}),null)
    assert.equal(await verify(config,jwt({exp})),null)
  }
  assert.equal(calls,0)
})

test('a different signature cannot reuse a cached token with identical claims',async()=>{
  const original=jwt({},'original-signature'),forged=jwt({},'forged-signature')
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async(url,options)=>{
    calls++
    return new Headers(options.headers).get('authorization')==='Bearer '+original?ok():Response.json({error:'invalid token'},{status:401})
  }})
  assert.deepEqual(await verify(config,original,{readOnly:true}),{id:userId})
  assert.equal(await verify(config,forged,{readOnly:true}),null)
  assert.deepEqual(await verify(config,original,{readOnly:true}),{id:userId})
  assert.equal(calls,2)
})

test('different Supabase URLs and API credentials have independent cache entries',async()=>{
  const calls=[]
  const token=jwt(),otherKey={...config,authAnonKey:'another-public-synthetic-key'},otherUrl={...config,authUrl:'https://other-auth.example'}
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async(url,options)=>{calls.push({url:String(url),key:new Headers(options.headers).get('apikey')});return ok()}})
  await verify(config,token,{readOnly:true})
  await verify(otherKey,token,{readOnly:true})
  await verify(otherKey,token,{readOnly:true})
  assert.equal(calls.length,2)
  await verify(otherUrl,token,{readOnly:true})
  assert.equal(calls.length,3)
  await verify(config,token,{readOnly:true})
  assert.equal(calls.length,3)
  assert.deepEqual(calls.map(call=>call.key),[config.authAnonKey,otherKey.authAnonKey,otherUrl.authAnonKey])
  assert.equal(calls[2].url,otherUrl.authUrl+'/auth/v1/user')
})

test('mutations always verify freshly despite a populated read cache',async()=>{
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
  const token=jwt()
  await verify(config,token,{readOnly:true})
  assert.equal(calls,1)
  assert.deepEqual(await verify(config,token),{id:userId})
  assert.deepEqual(await verify(config,token,{readOnly:false}),{id:userId})
  assert.equal(calls,3)
})

test('mutations do not join an in-flight read verification',async()=>{
  const readRemote=deferred(),mutationRemote=deferred()
  let calls=0,readSettled=false
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:()=>++calls===1?readRemote.promise:mutationRemote.promise})
  const read=verify(config,jwt(),{readOnly:true}).finally(()=>{readSettled=true})
  const mutation=verify(config,jwt())
  await turn()
  assert.equal(calls,2)
  mutationRemote.resolve(ok())
  assert.deepEqual(await mutation,{id:userId})
  assert.equal(readSettled,false)
  readRemote.resolve(ok())
  assert.deepEqual(await read,{id:userId})
})

test('a fresh authentication rejection invalidates an earlier cached identity',async()=>{
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>++calls===1?ok():Response.json({error:'revoked'},{status:401})})
  const token=jwt()
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  assert.equal(await verify(config,token),null)
  assert.equal(await verify(config,token,{readOnly:true}),null)
  assert.equal(calls,3)
})

test('an older in-flight read cannot repopulate the cache after a fresh rejection',async()=>{
  const remote=deferred()
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:()=>++calls===1?remote.promise:Promise.resolve(Response.json({error:'revoked'},{status:401}))})
  const token=jwt(),read=verify(config,token,{readOnly:true})
  await turn()
  assert.equal(await verify(config,token),null)
  remote.resolve(ok())
  await read
  assert.equal(await verify(config,token,{readOnly:true}),null)
  assert.equal(calls,3)
})

test('a fresh network failure invalidates cached authentication instead of serving it',async()=>{
  let calls=0
  const unavailable=new Error('synthetic auth outage')
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{if(++calls===1)return ok();throw unavailable}})
  const token=jwt()
  await verify(config,token,{readOnly:true})
  await assert.rejects(verify(config,token),error=>error===unavailable)
  await assert.rejects(verify(config,token,{readOnly:true}),error=>error===unavailable)
  assert.equal(calls,3)
})

test('an expired cache never falls back to stale identity during an auth outage',async()=>{
  let clock=initialTime,calls=0
  const verify=createUserVerifier({now:()=>clock,fetchImpl:async()=>{if(++calls===2)throw new Error('synthetic outage');return ok()}})
  const token=jwt()
  await verify(config,token,{readOnly:true})
  clock+=60_000
  await assert.rejects(verify(config,token,{readOnly:true}),/synthetic outage/)
  assert.deepEqual(await verify(config,token,{readOnly:true}),{id:userId})
  assert.equal(calls,3)
})

test('failed single-flight reads are cleared so the next read retries authentication',async()=>{
  const remote=deferred()
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:()=>++calls===1?remote.promise:Promise.resolve(ok())})
  const first=verify(config,jwt(),{readOnly:true}),second=verify(config,jwt(),{readOnly:true})
  const failures=Promise.allSettled([first,second])
  await turn()
  assert.equal(calls,1)
  remote.reject(new Error('synthetic outage'))
  assert.deepEqual((await failures).map(result=>result.status),['rejected','rejected'])
  assert.deepEqual(await verify(config,jwt(),{readOnly:true}),{id:userId})
  assert.equal(calls,2)
})

test('opaque legacy tokens remain remotely authenticated on every read',async()=>{
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
  for(let i=0;i<2;i++)assert.deepEqual(await verify(config,'opaque-legacy-access-token',{readOnly:true}),{id:userId})
  assert.equal(calls,2)
})

test('tokens without trustworthy cache claims are never retained',async t=>{
  const missingExpiry={sub:userId,iss:config.authUrl+'/auth/v1',aud:'authenticated'}
  const cases={
    'malformed payload':'header.not-valid-json.signature',
    'missing expiry':[encode({alg:'ES256'}),encode(missingExpiry),'signature'].join('.'),
    'string expiry':jwt({exp:String(initialTime/1000+600)}),
    'fractional expiry':jwt({exp:initialTime/1000+600.5}),
    'wrong subject':jwt({sub:'00000000-0000-4000-8000-000000000002'}),
    'wrong issuer':jwt({iss:'https://different-auth.example/auth/v1'}),
    'wrong audience':jwt({aud:'service_role'}),
    'missing audience':jwt({aud:undefined}),
  }
  for(const [name,token] of Object.entries(cases))await t.test(name,async()=>{
    let calls=0
    const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
    await verify(config,token,{readOnly:true})
    await verify(config,token,{readOnly:true})
    assert.equal(calls,2)
  })
})

test('an authenticated audience inside an array can use the bounded read cache',async()=>{
  let calls=0
  const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
  const token=jwt({aud:['another-audience','authenticated']})
  await verify(config,token,{readOnly:true})
  await verify(config,token,{readOnly:true})
  assert.equal(calls,1)
})

test('remote failures and responses without a user id are not cached',async t=>{
  for(const [name,reply] of [
    ['unauthorized',()=>Response.json({error:'invalid token'},{status:401})],
    ['missing id',()=>Response.json({user_metadata:{role:'admin'}})],
  ])await t.test(name,async()=>{
    let calls=0
    const verify=createUserVerifier({now:()=>initialTime,fetchImpl:async()=>{calls++;return reply()}})
    assert.equal(await verify(config,jwt(),{readOnly:true}),null)
    assert.equal(await verify(config,jwt(),{readOnly:true}),null)
    assert.equal(calls,2)
  })
})

test('the configured entry bound evicts cached identities without retaining every bearer',async()=>{
  let calls=0
  const verify=createUserVerifier({maxEntries:2,now:()=>initialTime,fetchImpl:async()=>{calls++;return ok()}})
  const tokens=['first','second','third'].map(signature=>jwt({},signature))
  await verify(config,tokens[0],{readOnly:true})
  await verify(config,tokens[1],{readOnly:true})
  await verify(config,tokens[0],{readOnly:true})
  await verify(config,tokens[1],{readOnly:true})
  assert.equal(calls,2)
  await verify(config,tokens[2],{readOnly:true})
  assert.equal(calls,3)
  for(const token of tokens)await verify(config,token,{readOnly:true})
  assert.ok(calls>3,'at least one of three identities must be evicted by a two-entry cache')
})
