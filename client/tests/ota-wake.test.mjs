import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {startOtaStatusPolling} from '../src/utils/otaStatusPolling.js'
import {createHandler} from '../../supabase/functions/chiller-ota/handler.mjs'

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function browser(load) {
  const callbacks=new Map();let next=0,visibility
  const document={visibilityState:'visible',addEventListener:(_,cb)=>{visibility=cb},removeEventListener:()=>{}}
  const timers={setTimeout:cb=>{callbacks.set(++next,cb);return next},clearTimeout:id=>callbacks.delete(id)}
  const polling=startOtaStatusPolling(load,document,timers)
  return {polling,callbacks,hide(){document.visibilityState='hidden';visibility()},show(){document.visibilityState='visible';visibility()},fire(){const [id,cb]=callbacks.entries().next().value;callbacks.delete(id);cb()}}
}
test('browser reads idle status once; active polling ends immediately at either terminal state',async()=>{
  for(const terminal of ['completed','failed']) {
    let calls=0,status=null
    const b=browser(async()=>{calls++;return {jobs:status?[{status}]:[]}})
    await tick();assert.equal(calls,1);assert.equal(b.callbacks.size,0)
    b.hide();b.show();await tick();assert.equal(calls,1)
    status='authorized';await b.polling.refresh(true);assert.equal(calls,2);assert.equal(b.callbacks.size,1)
    b.hide();assert.equal(b.callbacks.size,0);await b.polling.refresh();assert.equal(calls,2)
    b.show();await tick();assert.equal(calls,3);assert.equal(b.callbacks.size,1)
    status=terminal;b.fire();await tick();assert.equal(b.callbacks.size,0)
    b.polling.stop()
  }
})
test('hidden page aborts in-flight status and an active job resumes visibly',async()=>{
  let signal,finish
  const b=browser(s=>{signal=s;return new Promise(r=>{finish=r})})
  await tick();b.hide();assert.equal(signal.aborted,true)
  finish({jobs:[]});await tick();assert.equal(b.callbacks.size,0)
  b.polling.stop()
})
test('successful committed queue publishes minimal scoped wake; failed queue and exact retries do not',async()=>{
  for(const device of ['ESP32-CH2-PLC','ESP32-CH3-PLC']) {
    let failed=false,claimed=false,networkFailure=false;const calls=[],messages=[]
    const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'private-test-only',CHILLER_OTA_OPERATOR_IDS:'operator'}
    const handler=createHandler(()=>({auth:{getUser:async()=>({data:{user:{id:'operator'}}})},rpc:async name=>{
      calls.push(name)
      if(name==='chiller_ota_queue') return failed?{error:true}:{data:'00000000-0000-4000-8000-000000000001'}
      if(name==='chiller_ota_claim_wake') {const first=!claimed;claimed=true;return {data:first}}
      throw new Error(name)
    }}),name=>env[name],async(url,options)=>{messages.push(JSON.parse(options.body));if(networkFailure)throw new Error('offline');return {ok:true}})
    const request=()=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify({op:'queue',device,action:'update',id:'00000000-0000-4000-8000-000000000001',release:'00000000-0000-4000-8000-000000000002',grant:'test'})})
    failed=true;assert.equal((await handler(request())).status,503);assert.equal(messages.length,0)
    failed=false;assert.equal((await handler(request())).status,200)
    assert.deepEqual(calls.slice(-2),['chiller_ota_queue','chiller_ota_claim_wake'])
    assert.deepEqual(messages[0],{messages:[{topic:'chiller-ota-wake:'+device,event:'wake',payload:{device},private:false}]})
    await handler(request());assert.equal(messages.length,1)
    claimed=false;networkFailure=true
    const result=await handler(request());assert.equal(result.status,200);assert.equal((await result.json()).wake,'fallback')
  }
})

test('status uses telemetry freshness but still requires authenticated OTA registration',async()=>{
  let registered=true
  const receipt={version:'current',boot_id:'a'.repeat(32),received_at:new Date().toISOString()}
  const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only',CHILLER_OTA_OPERATOR_IDS:'operator'}
  const handler=createHandler(()=>({auth:{getUser:async()=>({data:{user:{id:'operator'}}})},rpc:async()=>({data:null}),from:table=>{
    const data=table==='chiller_ota_devices'?(registered?{device:'ESP32-CH2-PLC'}:null):table==='chiller_ota_receipts'?receipt:[]
    const query={then:resolve=>Promise.resolve({data}).then(resolve)}
    for(const method of ['select','eq','order','limit','maybeSingle'])query[method]=()=>query
    return query
  }}),name=>env[name])
  const request=()=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify({op:'status',device:'ESP32-CH2-PLC'})})
  let data=await (await handler(request())).json();assert.equal(data.device.last_seen,receipt.received_at);assert.equal(data.device.version,'current')
  registered=false;data=await (await handler(request())).json();assert.equal(data.device,null)
})
