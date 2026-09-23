import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

function body(source, name) {
  const match = new RegExp('(?:TelemetryPostResult|void) '+name+'\\([^]*?\\) \\{').exec(source)
  assert(match, name)
  const start = match.index + match[0].length
  let end = start, depth = 1
  for (; depth; end++) {
    if (source[end] === '{') depth++
    if (source[end] === '}') depth--
  }
  return source.slice(start, end - 1)
}

// Execute the actual firmware statements with network/clock/PLC boundaries mocked.
// Only C++ declarations, casts and namespace syntax are translated to JavaScript.
function executable(text) {
  return text.replace(/CHILLER_DIAG_COUNT\(\w+\);/g, '') // Production default: diagnostics compile out.
    .replace(/WiFiClientSecure client;/g, 'let client = new WiFiClientSecure();')
    .replace(/HTTPClient http;/g, 'let http = new HTTPClient();')
    .replace(/\b(unsigned long|String|int|bool) (\w+) =/g, 'let $2 =')
    .replace(/\(unsigned int\)/g, '').replace(/HTTPClient::/g, 'HTTPClient.')
    .replace(/\bnullptr\b/g, 'null')
}

for (const device of ['Chiller2', 'Chiller3']) {
  const source = await readFile(new URL(`../../firmware/${device}/${device}.ino`, import.meta.url), 'utf8')
  function harness() {
    const calls = {http:0, begin:0, recover:0, ota:0, published:0, logs:[]}
    const ctx = {
      POST_SKIPPED_NO_DATA:0, POST_SKIPPED_TIME_NOT_READY:1,
      POST_NETWORK_FAILED:2, POST_HTTP_FAILED:3, POST_OK:4,
      ch:{valid:true}, nowSeconds:1800000000, online:true, httpCode:200, beginOK:true,
      consecutivePostFailures:0, WL_CONNECTED:1,
      CHILLER_OTA_CA_PEM:'test', SUPABASE_RPC_URL:'test', SUPABASE_ANON_KEY:'test', String,
      time:()=>ctx.nowSeconds, millis:()=>20000,
      WiFi:{status:()=>ctx.online ? 1 : 0},
      Serial:{println:x=>calls.logs.push(String(x)), print:x=>calls.logs.push(String(x)), printf:()=>{}},
      WiFiClientSecure:class {setCACert(){} setTimeout(){} stop(){}},
      HTTPClient:class {
        setReuse(){} setConnectTimeout(){} setTimeout(){} addHeader(){} end(){}
        begin(){calls.begin++; return ctx.beginOK}
        POST(){calls.http++; return ctx.httpCode}
        static errorToString(){return {c_str:()=>''}}
      },
      buildRpcBody:()=>({length:()=>100}), forceInternetToWiFi:()=>{}, diagnoseInternet:()=>{},
      chillerTelemetryPublished:()=>calls.published++, hardRecoverWiFi:()=>calls.recover++,
      lastPollMs:0, lastPostMs:0, lastNetStatusMs:0,
      POLL_INTERVAL_MS:2000, POST_INTERVAL_MS:15000, NET_STATUS_INTERVAL_MS:60000,
      serviceWiFi:()=>{}, pollChiller:()=>{ctx.ch.valid=false}, printNetworkStatus:()=>{},
      serviceOta:()=>calls.ota++, delay:()=>{},
    }
    vm.createContext(ctx)
    for (const name of ['postToSupabase','handlePostResult','loop']) {
      vm.runInContext(`function ${name}(${name==='handlePostResult'?'result':''}) {${executable(body(source,name))}}`,ctx)
    }
    return {ctx,calls,post:()=>{const result=ctx.postToSupabase();ctx.handlePostResult(result);return result}}
  }
  test(`${device}: invalid PLC and unsynchronized time preserve failure count and never recover Wi-Fi`,()=>{
    for (const cause of ['data','time']) for (const counter of [0,1,2,7]) {
      const h=harness();h.ctx.consecutivePostFailures=counter
      if(cause==='data')h.ctx.ch.valid=false;else h.ctx.nowSeconds=0
      assert.equal(h.post(),cause==='data'?h.ctx.POST_SKIPPED_NO_DATA:h.ctx.POST_SKIPPED_TIME_NOT_READY)
      assert.equal(h.ctx.consecutivePostFailures,counter)
      assert.equal(h.calls.recover,0);assert.equal(h.calls.begin,0);assert.equal(h.calls.http,0)
      assert(h.calls.logs.includes(cause==='data'?'[POST] Skip: no valid PLC sample':'[POST] Skip: time not ready'))
      assert(!h.calls.logs.some(x=>x.includes('Consecutive failures')))
    }
  })
  test(`${device}: HTTP failure increments, skipped PLC preserves count, second failure recovers, success resets`,()=>{
    const h=harness();h.ctx.httpCode=503
    assert.equal(h.post(),h.ctx.POST_HTTP_FAILED);assert.equal(h.ctx.consecutivePostFailures,1);assert.equal(h.calls.recover,0)
    h.ctx.ch.valid=false;h.post();assert.equal(h.ctx.consecutivePostFailures,1);assert.equal(h.calls.recover,0)
    h.ctx.ch.valid=true;h.post();assert.equal(h.ctx.consecutivePostFailures,2);assert.equal(h.calls.recover,1)
    h.ctx.httpCode=200;assert.equal(h.post(),h.ctx.POST_OK);assert.equal(h.ctx.consecutivePostFailures,0)
    assert.equal(h.calls.recover,1);assert.equal(h.calls.published,1)
  })
  test(`${device}: Wi-Fi offline and TLS/HTTP initialization failure remain genuine failures`,()=>{
    const h=harness();h.ctx.online=false
    assert.equal(h.post(),h.ctx.POST_NETWORK_FAILED);assert.equal(h.ctx.consecutivePostFailures,1);assert.equal(h.calls.http,0)
    h.ctx.online=true;h.ctx.beginOK=false
    assert.equal(h.post(),h.ctx.POST_HTTP_FAILED);assert.equal(h.ctx.consecutivePostFailures,2);assert.equal(h.calls.recover,1)
  })
  test(`${device}: scheduled failed PLC poll still services OTA without Wi-Fi hard recovery`,()=>{
    const h=harness();h.ctx.consecutivePostFailures=1;h.ctx.loop()
    assert.equal(h.ctx.ch.valid,false);assert.equal(h.calls.ota,1)
    assert.equal(h.ctx.consecutivePostFailures,1);assert.equal(h.calls.recover,0);assert.equal(h.calls.http,0)
  })
}
