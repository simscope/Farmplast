import test from 'node:test'
import assert from 'node:assert/strict'
import {deliverEmployeeIntegrations} from '../src/utils/deliverEmployeeIntegrations.js'
const employeeId='00000000-0000-4000-8000-000000000003'
const getSession=async()=>({data:{session:{access_token:'synthetic'}}})
test('creation and lifecycle deliver only the permanent employee UUID through the existing guarded API',async()=>{
  await deliverEmployeeIntegrations(employeeId,{getSession,fetchImpl:async(url,options)=>{
    assert.equal(url,'/api/employee-integrations')
    assert.deepEqual(JSON.parse(options.body),{employee_id:employeeId})
    assert.equal(options.headers.Authorization,'Bearer synthetic')
    return Response.json({results:[{status:'succeeded'}]})
  }})
})
test('failed or uncertain SACS delivery reports that the profile was saved, rather than inviting another creation',async()=>{
  for(const response of [new Response('',{status:503}),Response.json({results:[{status:'uncertain'}]}),Response.json({results:[]}),Response.json({invalid:true})]){
    await assert.rejects(deliverEmployeeIntegrations(employeeId,{getSession,fetchImpl:async()=>response}),/Profile saved/)
  }
})
