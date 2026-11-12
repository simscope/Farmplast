import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {failureCodes} from '../../supabase/functions/chiller-ota/protocol.mjs'
const source=await readFile(new URL('../../firmware/common/ChillerOta.h',import.meta.url),'utf8')
function body(name) {
 const match=new RegExp('(?:static )?(?:bool|void|String) '+name+'\\([^]*?\\) \\{').exec(source)
 assert(match, name);let start=match.index+match[0].length,depth=1,end=start
 for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--}
 return source.slice(start,end-1)
}

test('device diagnostic vocabulary exactly matches backend; persistent and reported data exclude secrets',()=>{
 const block=source.match(/otaFailureCodes\[\]=\{([^]*?)\};/)[1]
 assert.deepEqual([...block.matchAll(/"([a-z0-9_]+)"/g)].map(x=>x[1]).sort(),[...failureCodes].sort())
 const save=body('otaSave')
 assert.deepEqual([...save.matchAll(/doc\["([^"]+)"\]/g)].map(x=>x[1]),['job','target','state','previous','failure'])
 assert.match(save,/putString\("record",record\)==record.length\(\)/)
 assert.doesNotMatch(save,/url|response|secret|token|key/i)
 const sync=body('chillerGatewayMetadata')
 assert.match(sync,/if\(otaPhase=="failed" && otaFailureCode.length\(\)\) doc\["failure_code"\]=otaFailureCode;/)
 assert.equal([...source.matchAll(/doc\["failure_code"\]/g)].length,1)
 const logs=source.split('\n').filter(x=>x.includes('Serial.')).join('\n')
 assert.doesNotMatch(logs,/job\.url|response|secret|token|device_key/i)
 assert.match(logs,/otaSafeJobId\(otaJobId\)/)
 assert.match(logs,/otaSafePhase\(otaPhase\)/)
 assert.match(source,/switch\(esp_reset_reason\(\)\)/)
})

test('actual stage body aborts save/sync failures but never mislabels successful terminal ACK',()=>{
 // This C++ function body uses the common JS/C++ expression subset, so run its
 // actual statements with fault-injected boundaries rather than copying its logic.
 const stage=body('otaStage')
 function run(saveResults,syncResult,terminal=false) {
  const calls=[];const ctx={phase:'authorized',progress:0,otaPhase:'idle',otaProgress:0,failure:''}
  ctx.otaSave=()=>{calls.push('save');return saveResults.shift()??true}
  ctx.otaCheckpoint=()=>{}
  ctx.otaFail=code=>{calls.push(code);ctx.failure ||= code;return false}
  ctx.chillerReportOta=()=>{calls.push('sync');if(terminal)ctx.otaPhase='failed';return syncResult}
  const result=vm.runInNewContext('(function(){'+stage+'})()',ctx)
  return {result,calls,failure:ctx.failure,phase:ctx.otaPhase}
 }
 assert.deepEqual(run([false],true),{result:false,calls:['save','state_save_failed'],failure:'state_save_failed',phase:'authorized'})
 assert.deepEqual(run([true,true],false),{result:false,calls:['save','sync','stage_sync_failed','save'],failure:'stage_sync_failed',phase:'authorized'})
 assert.deepEqual(run([true,false],false).failure,'stage_sync_failed')
 assert.deepEqual(run([true],true,true),{result:false,calls:['save','sync'],failure:'',phase:'failed'})
 assert.equal(run([true],true).result,true)
})

test('new jobs alone clear failure; restoration retains safe cause and prevents replay',()=>{
 const run=body('otaRun'),init=body('chillerOtaInit')
 assert(run.indexOf('if(job.id==otaJobId || !otaReady) return;')<run.indexOf('otaFailureCode=""'))
 assert.equal([...source.matchAll(/otaFailureCode=""/g)].length,1)
 assert.match(run,/otaPhase="failed";otaSave\(\);chillerReportOta\(\)/)
 assert.match(init,/String restoredFailure=record\["failure"\]\|""/)
 assert.match(init,/otaFailureCode=otaAllowedFailure\(restoredFailure\)\?restoredFailure:String\(""\)/)
 assert.match(init,/otaPhase!="idle" && otaPhase!="completed" && otaPhase!="failed"/)
 assert.match(init,/else \{otaFail\("interrupted_update"\);otaPhase="failed";\}/)
 assert.doesNotMatch(init,/otaRun\(|otaInstall\(/)
 assert.match(body('otaFail'),/!otaFailureCode.length\(\) && otaAllowedFailure\(code\)/)
 assert.doesNotMatch(body('chillerReportOta'),/otaFailureCode\s*=/)
})

test('each existing OTA failure branch is distinguished without relaxing validation or timeouts',()=>{
 for(const code of failureCodes) assert(source.includes('otaFail("'+code+'")'),code)
 const install=body('otaInstall')
 assert.match(install,/http.GET\(\)!=200/)
 assert.match(install,/http.getSize\(\)!=int\(job.size\)/)
 assert.match(install,/http.setTimeout\(10000\);http.setConnectTimeout\(5000\)/)
 assert.match(install,/millis\(\)-lastData>15000/)
 assert.match(install,/otaHex\(digest,32\)!=job.sha/)
 assert.match(install,/versionNeedle.length\(\)\+1/)
 assert.match(install,/deviceNeedle.length\(\)\+1/)
 assert.match(body('otaDecode'),/mbedtls_md_hmac/)
 assert.match(body('otaDecode'),/strlen\(CHILLER_OTA_DEVICE_KEY\)<32/)
 assert.match(body('otaDecode'),/strlen\(CHILLER_OTA_CA_PEM\)<100/)
 assert.match(source,/esp_ota_mark_app_invalid_rollback_and_reboot/)
 assert.doesNotMatch(source,/setInsecure|setFollowRedirects|xTaskCreate/)
})

