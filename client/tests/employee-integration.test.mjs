import test from 'node:test'
import assert from 'node:assert/strict'
import {createIntegrationRunner} from '../server/employeeIntegration.mjs'
const id='00000000-0000-0000-0000-000000000003'
const setup=()=>{
  const calls=[]
  const lookup={eq(){return this},in(){return this},order(){return this},async limit(){return {data:[{id:'job'}]}}}
  const client={from:()=>({select:()=>lookup}),rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_employee_integration'?{id:'job',employee_id:id,claim_token:'claim',payload:{source_employee_id:id,is_active:false}}:null}}}
  return {client,calls}
}
test('SACS worker records exact source UUID acknowledgement and sends its immutable snapshot',async()=>{
  const {client,calls}=setup()
  const run=createIntegrationRunner({client,secret:'test-secret',url:'https://sacs.invalid',fetchImpl:async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body).employees,[{source_employee_id:id,is_active:false}])
    return Response.json({results:[{source_employee_id:id,status:'updated'}]})
  }})
  assert.equal((await run(id))[0].status,'succeeded')
  assert.deepEqual(calls[1].args.p_result,{ok:true,source_employee_id:id,is_active:false})
})
test('timeout, rejected request or wrong UUID retains an uncertain claim; no delayed inactive write can race rehire',async()=>{
  for(const fetchImpl of [async()=>{throw Error('timeout')},async()=>new Response('',{status:503}),async()=>Response.json({results:[{source_employee_id:'wrong',status:'updated'}]})]){
    const {client,calls}=setup()
    const run=createIntegrationRunner({client,secret:'test',url:'https://sacs.invalid',fetchImpl})
    assert.equal((await run(id))[0].status,'uncertain')
    assert.equal(calls.length,1)
  }
  const {client,calls}=setup()
  await assert.rejects(createIntegrationRunner({client})(id),/not configured/)
  assert.equal(calls.length,0)
})
