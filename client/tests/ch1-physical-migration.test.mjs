import test from 'node:test'
import assert from 'node:assert/strict'
import {queueFirmware,requiresPhysicalMigration} from '../src/utils/ch1Firmware.js'

test('unsafe source is blocked even with a contradictory protocol; edge-free source is allowed',()=>{
  assert.equal(requiresPhysicalMigration({version:'ch1-ota-2'}),true)
  assert.equal(requiresPhysicalMigration({version:'ch1-ota-2',protocol:2}),true)
  assert.equal(requiresPhysicalMigration({version:'ch1-edgefree-2',protocol:2}),false)
})
for(const device of [{version:'ch1-ota-2'},null]) test(`fresh status blocks unsafe or missing source ${JSON.stringify(device)} before any mutation`,async()=>{
  const calls=[]
  const client={rpc:async name=>{calls.push(name);return {data:{device}}},storage:{from:()=>{throw Error('Storage must not be accessed')}}}
  await assert.rejects(queueFirmware(client,{code:'0000',release:{},requestId:'test'}),/PHYSICAL MIGRATION REQUIRED/)
  assert.deepEqual(calls,['ch1_firmware_status'])
})
test('protocol 2 source retains normal single queue flow after fresh status',async()=>{
  const calls=[]
  const client={rpc:async name=>{calls.push(name);return {data:name==='ch1_firmware_status'?{device:{version:'ch1-edgefree-2',protocol:2}}:name==='ch1_firmware_unlock'?{grant:'test'}:'job'}},storage:{from:()=>({createSignedUrl:async()=>{calls.push('sign');return {data:{signedUrl:'https://example.test/object?token=e30.'+btoa(JSON.stringify({exp:2000000000}))+'.test'}}}})}}
  assert.equal(await queueFirmware(client,{code:'0000',release:{storage_path:'test',id:'release'},requestId:'request'}),'job')
  assert.deepEqual(calls,['ch1_firmware_status','ch1_firmware_unlock','sign','ch1_firmware_queue'])
})
