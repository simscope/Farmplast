import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

const source=await readFile(new URL('../../firmware/common/ChillerOta.h',import.meta.url),'utf8')
function body(text,name) {
  const match=new RegExp('(?:static )?(?:bool|void) '+name+'\\([^]*?\\) \\{').exec(text)
  assert(match,name);const start=match.index+match[0].length
  let end=start,depth=1
  for(;depth;end++){if(text[end]==='{')depth++;if(text[end]==='}')depth--}
  return text.slice(start,end-1)
}
const sync=body(source,'chillerOtaResponse')
// Execute actual queue/consume statements and the post-HTTP sync tail. HTTP/JSON
// and authenticated decoding are mocked boundaries; their security checks remain
// covered by existing protocol/diagnostic tests. No copied queue implementation.
function translate(text) {
  return text.replace(/OtaJob job;/g,'let job={};')
    .replace(/OtaJob job=std::move\(otaPendingJob\);/g,'let job={...otaPendingJob};')
    .replace(/std::move\(job\)/g,'({...job})').replace(/OtaJob\{\}/g,'({})')
    .replace(/result\["o"\]\.is<JsonObject>\(\)/g,'(manifest !== null)')
    .replace(/result\["o"\]\.as<JsonObject>\(\)/g,'manifest')
    .replace(/job.id.c_str\(\)/g,'job.id').replace(/if\(discover &&/g,'if(ok && !updating &&')
}
function harness() {
  const calls=[]
  const ctx={otaPending:false,otaPendingJob:{},otaJobId:'',otaReady:true,otaReporting:false,
    ok:true,updating:false,manifest:null,httpContextAlive:false,
    otaLastExchange:0,chillerOtaSyncDue:()=>true,millis:()=>15000,
    otaCheckpoint:point=>calls.push(point),otaSafeJobId:()=>true,
    Serial:{printf:()=>{}},chillerOtaRecoveryCheck:()=>{},
    otaDecode:(manifest,job)=>{calls.push('decode');if(!manifest.valid)return false;Object.assign(job,manifest.job);return true},
    otaRun:job=>{
      assert.equal(ctx.httpContextAlive,false,'initial sync must have returned')
      assert.equal(ctx.otaPending,false,'consume before running')
      calls.push('run:'+job.id);ctx.otaJobId=job.id
      // Model a failed run. Consumed work must not survive to the next loop.
    },
  }
  vm.createContext(ctx)
  for(const name of ['otaQueueDecodedJob','chillerOtaRunPending']) {
    vm.runInContext(`function ${name}(${name==='otaQueueDecodedJob'?'job':''}){${translate(body(source,name))}}`,ctx)
  }
  const tail=translate(sync.slice(sync.indexOf('OtaJob job;')))
  ctx.chillerOtaResponse=updating=>{
    ctx.updating=updating;ctx.otaReporting=true;ctx.httpContextAlive=true
    try{return vm.runInContext(`(function(){${tail}})()`,ctx)}
    finally{ctx.otaReporting=false;ctx.httpContextAlive=false;calls.push('sync_returned')}
  }
  return {ctx,calls}
}
function manifest(id='11111111-1111-4111-8111-111111111111') {
  return {valid:true,job:{id,version:'test-v2',sha:'a'.repeat(64),url:'https://private.invalid/test',size:123,expires:1900000000}}
}

test('valid manifest queues owned job values without running inside sync',()=>{
  assert.doesNotMatch(sync,/\botaRun\s*\(/)
  const h=harness();h.ctx.manifest=manifest()
  assert.equal(h.ctx.chillerOtaResponse(false),true)
  assert.equal(h.ctx.otaPending,true)
  for(const key of ['id','version','sha','url','size','expires'])assert.equal(h.ctx.otaPendingJob[key],h.ctx.manifest.job[key])
  h.ctx.manifest.job.version='overwritten';h.ctx.manifest=null
  assert.equal(h.ctx.otaPendingJob.version,'test-v2')
  assert(!h.calls.some(c=>c.startsWith('run:')))
  assert.match(source,/struct OtaJob \{ String id,version,sha,url; uint32_t size; int64_t expires; \}/)
  assert.match(body(source,'otaQueueDecodedJob'),/otaPendingJob=std::move\(job\)/)
})

for(const device of ['Chiller2','Chiller3']) {
  const sketch=await readFile(new URL(`../../firmware/${device}/${device}.ino`,import.meta.url),'utf8')
  test(`${device}: shared pending runner runs exactly once after sync returns`,()=>{
    assert.match(sketch,/#include "\.\.\/common\/ChillerOta.h"/)
    const service=body(sketch,'serviceOta')
    assert.doesNotMatch(service,/chillerOtaResponse/)
    const h=harness();h.ctx.manifest=manifest()
    h.ctx.chillerOtaResponse(false)
    vm.runInContext(`(function(){${service}})()`,h.ctx)
    h.ctx.chillerOtaRunPending()
    assert.equal(h.calls.filter(x=>x.startsWith('run:')).length,1)
    assert(h.calls.indexOf('sync_returned')<h.calls.indexOf('deferred_run_begin'))
    h.ctx.chillerOtaResponse(false);h.ctx.chillerOtaRunPending()
    assert.equal(h.calls.filter(x=>x.startsWith('run:')).length,1,'failed current job cannot replay')
  })
}
test('invalid, absent, updating and failed initial responses cannot queue or run',()=>{
  for(const mode of ['invalid','absent','updating','failed']) {
    const h=harness();h.ctx.manifest=manifest()
    if(mode==='invalid')h.ctx.manifest.valid=false
    if(mode==='absent')h.ctx.manifest=null
    if(mode==='failed')h.ctx.ok=false
    h.ctx.chillerOtaResponse(mode==='updating');h.ctx.chillerOtaRunPending()
    assert.equal(h.ctx.otaPending,false)
    assert(!h.calls.some(x=>x.startsWith('run:')))
  }
})
test('one pending slot cannot be replaced; syncing prevents consumption; current ID never queues',()=>{
  const h=harness();h.ctx.manifest=manifest();h.ctx.chillerOtaResponse(false)
  const first=h.ctx.otaPendingJob.id
  h.ctx.manifest=manifest('22222222-2222-4222-8222-222222222222');h.ctx.chillerOtaResponse(false)
  assert.equal(h.ctx.otaPendingJob.id,first)
  h.ctx.otaReporting=true;h.ctx.chillerOtaRunPending();assert.equal(h.ctx.otaPending,true)
  h.ctx.otaReporting=false;h.ctx.chillerOtaRunPending();assert.equal(h.ctx.otaPending,false)
  assert.equal(h.calls.filter(x=>x.startsWith('run:')).length,1)
  const duplicate=harness();duplicate.ctx.manifest=manifest();duplicate.ctx.otaJobId=duplicate.ctx.manifest.job.id
  duplicate.ctx.chillerOtaResponse(false);assert.equal(duplicate.ctx.otaPending,false)
})
test('terminal server ACK continues to persist and update status before queuing',()=>{
  const ack=sync.slice(sync.indexOf('if((ack=='),sync.indexOf('\n  OtaJob job;'))
  for(const value of ['completed','failed']) {
    const ctx={ack:value,otaPhase:'authorized',otaProgress:7,otaJobId:{length:()=>36},saves:0}
    ctx.otaSave=()=>ctx.saves++
    vm.runInNewContext(ack,ctx)
    assert.equal(ctx.otaPhase,value);assert.equal(ctx.saves,1)
    assert.equal(ctx.otaProgress,value==='completed'?100:7)
  }
})
test('authorized checkpoints follow actual save/sync outcomes and log no secrets',()=>{
  function run(saveOK,syncOK,terminal=false) {
    const calls=[],ctx={phase:'authorized',progress:0,otaPhase:'idle',otaProgress:0}
    ctx.otaCheckpoint=p=>calls.push(p)
    ctx.otaSave=()=>{calls.push('save');return saveOK}
    ctx.chillerReportOta=()=>{calls.push('sync');if(terminal)ctx.otaPhase='failed';return syncOK}
    ctx.otaFail=c=>{calls.push(c);return false}
    const result=vm.runInNewContext(`(function(){${body(source,'otaStage')}})()`,ctx)
    return {calls,result}
  }
  assert.deepEqual(run(true,true).calls,['authorized_save_begin','save','authorized_save_ok','authorized_sync_begin','sync','authorized_sync_ok'])
  assert.deepEqual(run(false,true).calls,['authorized_save_begin','save','state_save_failed'])
  assert(!run(true,false).calls.includes('authorized_sync_ok'))
  assert.equal(run(true,true,true).result,false)
  assert(!run(true,true,true).calls.includes('authorized_sync_ok'))
  assert.match(source,/reset_reason=%s code=%d/)
  assert.match(source,/int\(esp_reset_reason\(\)\)/)
  const checkpoints=body(source,'otaCheckpoint')
  for(const api of ['heap_caps_get_free_size','heap_caps_get_minimum_free_size','heap_caps_get_largest_free_block','uxTaskGetStackHighWaterMark'])assert(checkpoints.includes(api))
  assert.match(checkpoints,/#if INCLUDE_uxTaskGetStackHighWaterMark/)
  assert.doesNotMatch(checkpoints,/job\.|url|key|mac|JsonDocument|otaSave\(/)
})
