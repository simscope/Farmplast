import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from './handler.mjs'
const primary='source-primary-'.repeat(4),secondary='reserve-secondary-'.repeat(4)
const employee={source_employee_id:'aaaaaaaa-1111-4111-8111-111111111111',full_name:'Synthetic fixture',employee_number:'fixture',phone:null,email:null,position:null,is_active:true}
test('original and standby keys authenticate; wrong and short keys are denied',async()=>{
 let writes=0
 const handler=createHandler({secret:primary,additionalSecrets:[secondary,'short'],enabled:async()=>true,sync:async()=>{writes++;return {status:'synced'}}})
 for(const key of [primary,secondary])assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{'x-farmplast-sync-secret':key},body:JSON.stringify({employees:[employee]})}))).status,200)
 for(const key of ['wrong','short',''])assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{'x-farmplast-sync-secret':key},body:JSON.stringify({employees:[employee]})}))).status,401)
 assert.equal(writes,2)
})
test('empty roster auth probe has no database or employee side effects',async()=>{
 let calls=0
 const handler=createHandler({secret:primary,additionalSecrets:[secondary],enabled:async()=>{calls++;return true},sync:async()=>{calls++}})
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'x-farmplast-sync-secret':secondary},body:'{"employees":[]}'}))
 assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_payload'});assert.equal(calls,0)
})
test('existing single key configuration remains supported',async()=>{
 const handler=createHandler({secret:primary,enabled:async()=>false,sync:async()=>assert.fail('sync must not run')})
 assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{'x-farmplast-sync-secret':primary},body:JSON.stringify({employees:[employee]})}))).status,503)
})
