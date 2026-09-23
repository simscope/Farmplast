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
test('diagnostics are default-off, scalar-only and limited to once per minute',()=>{
 assert.match(header,/#define CHILLER_RUNTIME_DIAGNOSTICS 0/)
 const code=body(header,'chillerRuntimeHealth').replace('static uint32_t lastLine=0;','').replace('const uint32_t now','const now').replace(/\(unsigned\)/g,'')
 let now=0;const lines=[]
 const ctx={lastLine:0,millis:()=>now,uint32_t:x=>x>>>0,MALLOC_CAP_8BIT:1,runtimeDiag:{},WiFi:{status:()=>0},WL_CONNECTED:1,
 heap_caps_get_free_size:()=>1,heap_caps_get_minimum_free_size:()=>1,heap_caps_get_largest_free_block:()=>1,Serial:{printf:(...args)=>lines.push(args)}}
 const run=()=>vm.runInNewContext('(function(){'+code+'})()',ctx)
 now=59999;run();assert.equal(lines.length,0);now=60000;run();assert.equal(lines.length,1)
 now=119999;run();assert.equal(lines.length,1);now=120000;run();assert.equal(lines.length,2)
 ctx.lastLine=0xfffffff0;now=(0xfffffff0+60000)>>>0;run();assert.equal(lines.length,3)
 assert.doesNotMatch(code,/SUPABASE|SECRET|TOKEN|job\.|https:/)
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
