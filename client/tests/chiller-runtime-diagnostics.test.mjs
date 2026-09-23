import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {inspectRuntimeImage,validateRuntimeBuild,OTA_SLOT_BYTES,MIN_HEADROOM_BYTES} from '../../firmware/validate-chiller-runtime-build.mjs'

const header=await readFile(new URL('../../firmware/common/ChillerRuntimeDiagnostics.h',import.meta.url),'utf8')
function body(source,name) {
  const start=source.indexOf('{',source.indexOf(`static void ${name}(`))
  let level=1,end=start+1
  for(;level;end++) {if(source[end]==='{')level++;if(source[end]==='}')level--}
  return source.slice(start+1,end-1)
}
function atomic(value=0) {
  return {load:()=>value,store:x=>{value=x},exchange:x=>{const old=value;value=x;return old},fetch_add:x=>{const old=value;value=(value+x)>>>0;return old}}
}
function harness() {
  let now=0;const lines=[]
  const runtimeDiag={}
  for(const [,name,value] of header.matchAll(/(\w+)\{(0|false)\}/g)) runtimeDiag[name]=atomic(value==='false'?false:0)
  const ctx={runtimeDiag,millis:()=>now,uint32_t:x=>x>>>0,nullptr:null,
    heap_caps_get_free_size:()=>100000,heap_caps_get_minimum_free_size:()=>80000,heap_caps_get_largest_free_block:()=>70000,
    MALLOC_CAP_8BIT:1,WiFi:{status:()=>1,RSSI:()=>-55},WL_CONNECTED:1,
    uxTaskGetStackHighWaterMark:()=>4096,Serial:{printf:(...values)=>lines.push(values)},
    RD_VALUE:name=>runtimeDiag[name].load()}
  vm.createContext(ctx)
  for(const name of ['runtimeDiagConnection','runtimeDiagWakeResult','runtimeDiagWorkerSample','runtimeDiagHealth']) {
    const args={runtimeDiagConnection:'connected',runtimeDiagWakeResult:'accepted',runtimeDiagWorkerSample:'',runtimeDiagHealth:'fallbackRemaining,pending,paused'}[name]
    const code=body(header,name).replace(/^#.*$/gm,'').replace(/std::memory_order_relaxed/g,'0')
      .replace(/const (bool|uint32_t) /g,'const ').replace(/\(unsigned\)/g,'')
      .replace(/RD_VALUE\((\w+)\)/g,"RD_VALUE('$1')").replace(/static uint32_t (\w+)=0;/g,(_,key)=>{ctx[key]=0;return ''})
    vm.runInContext(`function ${name}(${args}){${code}}`,ctx)
  }
  return {ctx,lines,at:value=>{now=value}}
}
test('diagnostic connections distinguish first join, reconnect, duplicate acknowledgement and disconnect',()=>{
  const {ctx}=harness(),d=ctx.runtimeDiag
  ctx.runtimeDiagConnection(true);ctx.runtimeDiagConnection(true)
  assert.equal(d.realtime_connections.load(),1);assert.equal(d.realtime_reconnect_count.load(),0)
  ctx.runtimeDiagConnection(false);assert.equal(d.realtime_connected.load(),false)
  ctx.runtimeDiagConnection(true);assert.equal(d.realtime_connections.load(),2);assert.equal(d.realtime_reconnect_count.load(),1)
})
test('wake classification counters wrap without changing scheduler results',()=>{
  const {ctx}=harness(),d=ctx.runtimeDiag
  ctx.runtimeDiagWakeResult(true);ctx.runtimeDiagWakeResult(false)
  assert.equal(d.realtime_wake_accepted.load(),1);assert.equal(d.realtime_wake_debounced.load(),1)
  d.realtime_wake_accepted.store(0xffffffff);ctx.runtimeDiagWakeResult(true)
  assert.equal(d.realtime_wake_accepted.load(),0)
})
test('health output is limited to one scalar snapshot per minute, including millis wrap',()=>{
  const {ctx,lines,at}=harness()
  at(59999);ctx.runtimeDiagHealth(1,false,false);assert.equal(lines.length,0)
  at(60000);ctx.runtimeDiagWorkerSample();ctx.runtimeDiagHealth(3540000,false,false)
  assert.equal(lines.length,1);assert.match(lines[0][0],/realtime_worker_stack_hwm=%u/)
  assert.equal(lines[0][5],4096)
  at(119999);ctx.runtimeDiagHealth(1,false,false);assert.equal(lines.length,1)
  at(120000);ctx.runtimeDiagHealth(1,false,false);assert.equal(lines.length,2)
  ctx.lastLine=0xfffffff0;at((0xfffffff0+60000)>>>0);ctx.runtimeDiagHealth(1,false,false)
  assert.equal(lines.length,3)
  assert.doesNotMatch(body(header,'runtimeDiagHealth'),/SUPABASE|SECRET|TOKEN|job\.|https:/)
})
function image(size,diagnostics=true) {
  const result=Buffer.alloc(size)
  result[0]=0xe9;result.writeUInt32LE(0xabcd5432,32)
  result.write('CH23OTA_VERSION=test\0CH23OTA_DEVICE=ESP32-CH2-PLC\0'+(diagnostics?'CH23_RUNTIME_DIAGNOSTICS=1\0[RUNTIME] uptime_ms=\0':''),128)
  return result
}
test('post-link gate accepts exactly 64 KiB headroom and rejects one byte less or mismatched modes/partitions',()=>{
  const max=OTA_SLOT_BYTES-MIN_HEADROOM_BYTES
  assert.equal(inspectRuntimeImage(image(max),'ESP32-CH2-PLC','test').ota_headroom_bytes,65536)
  assert.throws(()=>inspectRuntimeImage(image(max+1),'ESP32-CH2-PLC','test'),/headroom/)
  assert.throws(()=>inspectRuntimeImage(image(max,false),'ESP32-CH2-PLC','test'),/markers/)
  assert.throws(()=>inspectRuntimeImage(image(max),'ESP32-CH2-PLC','test',false),/markers/)
  assert.equal(inspectRuntimeImage(image(max,false),'ESP32-CH2-PLC','test',false).diagnostics,false)
  assert.throws(()=>validateRuntimeBuild(image(max),Buffer.alloc(3072),'ESP32-CH2-PLC','test'),/Partition table/)
})
