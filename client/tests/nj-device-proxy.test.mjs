import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createNjDeviceHandler} from '../server/njDeviceProxy.mjs'
test('device gateway sends scoped credentials only to MSI and preserves the bounded signed reply',async()=>{
 const calls=[],result={}
 const value={o:{url:'https://private.invalid/test-only',mac:'a'.repeat(64)}}
 const handler=createNjDeviceHandler({NJ_TELEMETRY_UPSTREAM:'https://msi.tail4626fb.ts.net:10000'},async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(value))})
 const req={method:'POST',query:{device:'chiller-2'},headers:{authorization:'Bearer '+'a'.repeat(64)},body:{payload:{readings:[]}}}
 const res={setHeader(k,v){result[k]=v},status(code){result.status=code;return this},json(body){result.body=body}}
 await handler(req,res)
 assert.equal(result.status,200);assert.deepEqual(result.body,value)
 assert.equal(calls[0].url,'https://msi.tail4626fb.ts.net:10000/v1/ingest/chiller-2')
 assert.equal(calls[0].options.headers.Authorization,req.headers.authorization)
 assert.equal(calls[0].options.redirect,'error');assert.match(result['Cache-Control'],/no-store/)
 await handler({...req,query:{device:'employees'}},res);assert.equal(result.status,404)
 await handler({...req,headers:{}},res);assert.equal(result.status,401)
 await handler({...req,method:'GET'},res);assert.equal(result.status,405)
 assert.equal(calls.length,1)
 await handler({...req,body:{large:'x'.repeat(32769)}},res);assert.equal(result.status,413)
})
