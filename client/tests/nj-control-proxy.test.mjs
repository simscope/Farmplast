import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createNjControlHandler} from '../server/njControlProxy.mjs'
const user='00000000-0000-0000-0000-000000000001'
const env={NJ_TELEMETRY_UPSTREAM:'https://msi.tail4626fb.ts.net:10000',NJ_CONTROL_API_KEY:'private-synthetic-control-key',NJ_TELEMETRY_ALLOWED_USER_IDS:user,VITE_SUPABASE_URL:'https://auth.example',VITE_SUPABASE_ANON_KEY:'public-synthetic-anon'}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.data=data;return this},send(data){this.data=data;return this}}}
test('control proxy verifies the Auth user and forwards only its own private key and verified UUID',async()=>{
 const calls=[]
 const handler=createNjControlHandler(env,async(url,options)=>{calls.push({url:String(url),options});return String(url).startsWith('https://auth.example')?Response.json({id:user}):Response.json({ok:true})})
 const res=response();await handler({url:'/api/nj-control?kind=rpc',method:'POST',headers:{authorization:'Bearer '+'j'.repeat(32),'x-operator-id':'spoofed'},body:{name:'ch1_firmware_status',args:{}}},res)
 assert.equal(res.code,200);assert.equal(calls.length,2)
 assert.equal(calls[1].url,env.NJ_TELEMETRY_UPSTREAM+'/v1/control/rpc')
 assert.equal(calls[1].options.headers['X-Operator-ID'],user)
 assert.equal(calls[1].options.headers.Authorization,'Bearer '+env.NJ_CONTROL_API_KEY)
 assert.equal(res.headers['Cache-Control'],'private, no-store, max-age=0')
})
test('a signed-in unlisted user cannot forward control or read private firmware',async()=>{
 let calls=0
 const handler=createNjControlHandler(env,async()=>{calls++;return Response.json({id:'unlisted-user',user_metadata:{role:'admin'}})})
 const res=response();await handler({url:'/api/nj-control?kind=download&bucket=ch1-firmware&path=file',method:'GET',headers:{authorization:'Bearer '+'j'.repeat(32)}},res)
 assert.equal(res.code,403);assert.equal(calls,1)
})
test('report proxy requires a scoped-format key, fixed producer and bounded payload',async()=>{
 const calls=[];const handler=createNjControlHandler(env,async(url,options)=>{calls.push({url:String(url),options});return Response.json({a:'completed'})})
 const bad=response();await handler({url:'/api/nj-report/chiller-2',query:{kind:'report',device:'chiller-2'},method:'POST',headers:{authorization:'Bearer invalid'},body:{}},bad)
 assert.equal(bad.code,401);assert.equal(calls.length,0)
 const large=response();await handler({url:'/?kind=report&device=chiller-2',method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64),'content-length':40000},body:{}},large)
 assert.equal(large.code,413);assert.equal(calls.length,0)
 const good=response();await handler({url:'/?kind=report&device=chiller-2',method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)},body:{p_device:'ESP32-CH2-PLC'}},good)
 assert.equal(good.code,200);assert.equal(calls[0].url,env.NJ_TELEMETRY_UPSTREAM+'/v1/report/chiller-2')
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+'a'.repeat(64))
})
