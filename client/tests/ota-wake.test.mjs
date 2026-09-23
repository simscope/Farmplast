import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {startOtaStatusPolling} from '../src/utils/otaStatusPolling.js'
import {createHandler} from '../../supabase/functions/chiller-ota/handler.mjs'

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
const schedule=await read('firmware/common/OtaWakeSchedule.h')
function scheduler() {
  // Execute the production scheduler expressions with uint32 wrap semantics.
  const ctx={pending:false,seenWake:false,lastWake:0,lastAttempt:0,
    strcmp:(a,b)=>a===b?0:1,uint32_t:x=>x>>>0}
  for(const [,name,value] of schedule.matchAll(/constexpr uint32_t (\w+) = (\d+)UL/g)) ctx[name]=Number(value)
  vm.createContext(ctx)
  for(const name of ['wake','due','attempted']) {
    const [,args,body]=schedule.match(new RegExp(`(?:bool|void) ${name}\\(([^)]*)\\)(?: const)? \\{([^}]+)\\}`))
    const params=args.replace(/const char\* |uint32_t |bool /g,'')
    vm.runInContext(`function ${name}(${params}) {${body}}`,ctx)
  }
  return ctx
}
test('idle firmware hourly fallback, scoped immediate wake, debounce and wraparound',()=>{
  for(const device of ['ESP32-CH2-PLC','ESP32-CH3-PLC']) {
    const s=scheduler(),other=device.includes('CH2')?'ESP32-CH3-PLC':'ESP32-CH2-PLC'
    for(let now=15000;now<3600000;now+=15000) assert.equal(s.due(now,false),false)
    assert.equal(s.due(3600000,false),true)
    s.attempted(3600000)
    assert.equal(s.wake(other,device,3600001),false)
    assert.equal(s.due(3600001,false),false)
    assert.equal(s.wake(device,device,3600001),true)
    assert.equal(s.due(3600001,false),true);s.attempted(3600001)
    assert.equal(s.wake(device,device,3610000),false)
    assert.equal(s.due(3610000,false),false)
    assert.equal(s.wake(device,device,3630001),true)
    s.attempted(0xfffffff0)
    assert.equal(s.due((0xfffffff0+3600000)>>>0,false),true)
  }
})
test('Realtime worker is isolated from PLC/telemetry and never authorizes a manifest',async()=>{
  const rt=await read('firmware/common/ChillerOtaRealtime.h')
  assert.match(rt,/xTaskCreate\(otaRealtimeWorker/)
  assert.match(rt,/static void chillerOtaRealtimeInit\(\) \{[^]*?otaSchedule.pending=true/)
  assert.match(rt,/beginSslWithCA\(SUPABASE_HOST,443,path.c_str\(\),CHILLER_OTA_CA_PEM/)
  assert.match(rt,/backoff=std::min\(uint32_t\(60000\),backoff\*2\)/)
  assert.match(rt,/doc\["payload"\]\["payload"\]\["device"\]==DEVICE_CODE/)
  assert.doesNotMatch(rt,/ESP.restart|otaDecode|otaInstall|chillerDeviceSync\(/)
  for(const n of [2,3]) {
    const ino=await read(`firmware/Chiller${n}/Chiller${n}.ino`)
    const loop=ino.slice(ino.indexOf('void loop()'))
    assert.match(loop,/pollChiller\(\)/);assert.match(loop,/handlePostResult\(postToSupabase\(\)\)/)
    assert.doesNotMatch(loop,/socket|Realtime|otaRealtime/)
    assert.match(ino,/if \(chillerOtaSyncDue\(\)\) chillerDeviceSync\(false\)/)
    assert.doesNotMatch(ino,/OTA_CHECK_INTERVAL_MS/)
    assert.match(ino,/chillerOtaRealtimeInit\(\);/)
    const page=await read(`client/src/pages/Chiller${n}HMIPage.jsx`)
    assert.match(page,/refresh:refreshProgramming\}=useOtaStatus/)
    assert.doesNotMatch(page,/functions.invoke\('chiller-ota'/)
  }
})

test('actual loop keeps PLC and telemetry running during Realtime loss and discovers hourly work',async()=>{
  const rt=await read('firmware/common/ChillerOtaRealtime.h')
  const due=rt.slice(rt.indexOf('static bool chillerOtaSyncDue() {')+'static bool chillerOtaSyncDue() {'.length,rt.lastIndexOf('}'))
    .replace('const uint32_t now','const now').replace('const bool active','const active')
    .replace(/CHILLER_DIAG_(?:HEALTH|CHECKPOINT)\([^;]*\);/g,'')
    .replace(/CHILLER_DIAG_WAKE_RESULT\(([^;]+)\);/g,'$1;')
  for(const n of [2,3]) {
    const ino=await read(`firmware/Chiller${n}/Chiller${n}.ino`),s=scheduler()
    const loop=ino.slice(ino.indexOf('void loop() {')+'void loop() {'.length,ino.lastIndexOf('}')).replace('unsigned long now','let now')
    let now=0,plc=0,telemetry=0,syncs=0,paused=true
    const ctx={otaSchedule:s,otaPhase:'idle',DEVICE_CODE:`ESP32-CH${n}-PLC`,
      otaWakeRequested:{exchange:()=>false},otaRealtimePause:{store:()=>{}},otaRealtimePaused:{load:()=>paused},
      WiFi:{status:()=>1},WL_CONNECTED:1,millis:()=>now,otaReady:true,time:()=>1800000000,nullptr:null,
      lastPollMs:0,lastPostMs:0,lastNetStatusMs:0,
      serviceWiFi:()=>{},pollChiller:()=>{plc++},postToSupabase:()=>{telemetry++},handlePostResult:()=>{},printNetworkStatus:()=>{},delay:()=>{}}
    for(const name of ['POLL_INTERVAL_MS','POST_INTERVAL_MS','NET_STATUS_INTERVAL_MS']) ctx[name]=Number(ino.match(new RegExp(name+'\\s*=\\s*(\\d+)'))[1])
    vm.createContext(ctx)
    vm.runInContext(`function chillerOtaSyncDue(){${due}}`,ctx)
    ctx.serviceOta=()=>{if(ctx.chillerOtaSyncDue())syncs++}
    vm.runInContext(`function loop(){${loop}}`,ctx)
    for(now=0;now<=3600000;now+=100)ctx.loop()
    assert.equal(syncs,1);assert.equal(telemetry,3600000/ctx.POST_INTERVAL_MS);assert.equal(plc,Math.floor(3600000/ctx.POLL_INTERVAL_MS))
    // A worker still releasing TLS cannot block the main loop or start overlapping OTA TLS.
    paused=false
    for(now=3600100;now<=7200000;now+=100)ctx.loop()
    assert.equal(syncs,1);assert.equal(telemetry,7200000/ctx.POST_INTERVAL_MS);assert.equal(plc,Math.floor(7200000/ctx.POLL_INTERVAL_MS))
    paused=true;ctx.loop();assert.equal(syncs,2)
  }
})

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
