'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {config,dispatch}=require('../src/core.cjs');
const cfg=plant=>({...config({ZKT_IP:'127.0.0.1',ZKT_PLANT_LOCATION:plant,ZKT_IDENTITY_DEVICE_KEY:plant.toLowerCase(),ZKT_EXPECTED_SERIAL_NUMBER:plant+'-SERIAL'}),autoHours:[]});
test('identity import retains delayed, malformed and repeated raw rows for DB reconciliation in both plants',async()=>{
  for(const plant of ['NJ','PA']){
    const logs=[{deviceUserId:'3',timestamp:'2024-01-01 08:00:00',inOutMode:0},{deviceUserId:'bad',timestamp:'bad'}, {deviceUserId:'3',timestamp:'2024-01-01 08:00:00',inOutMode:0}];
    let saved=[];
    const result=await dispatch({command:'pull_attendance',payload:{plant_location:plant}}, {cfg:cfg(plant),db:{identityAttendance:async(device,serial,rows)=>{assert.equal(device,plant.toLowerCase());assert.equal(serial,plant+'-SERIAL');saved.push(...rows);return {owned:1,review:1}},processAttendance:async()=>({ok:true})},sdk:async()=>({ok:true,serialNumber:plant+'-SERIAL',logs})});
    assert.deepEqual(saved,logs);assert.equal(result.total,3);
    await assert.rejects(dispatch({command:'pull_attendance',payload:{plant_location:plant==='NJ'?'PA':'NJ'}},{cfg:cfg(plant)}),/different plant/);
  }
});
test('disable requires read-back serial/user/state proof; uncertain SDK outcome cannot acknowledge release',async()=>{
  const operation={id:'job',claim_token:'claim',employee_id:'employee',action:'disable',terminal_user_id:'3',target:'NJ'};
  const command={command:'identity_disable_employee',payload:{operation_id:'job',device_key:'nj',plant_location:'NJ'}};
  const outcomes=[];
  const db={claimIntegration:async()=>operation,finishIntegration:async(id,token,result)=>{assert.equal(id,'job');assert.equal(token,'claim');outcomes.push(result)}};
  for(const sdk of [async()=>({ok:true,serialNumber:'WRONG',userId:'3',enabled:false,readBackVerified:true}),async()=>({ok:true,serialNumber:'NJ-SERIAL',userId:'3',enabled:true,readBackVerified:true}),async()=>{throw Error('timeout')}]){
    await assert.rejects(dispatch(command,{cfg:cfg('NJ'),db,sdk}));assert.equal(outcomes.at(-1).ok,false);
  }
  const result=await dispatch(command,{cfg:cfg('NJ'),db,sdk:async request=>{assert.equal(request.user.userId,'3');return {ok:true,serialNumber:'NJ-SERIAL',userId:'3',enabled:false,readBackVerified:true}}});
  assert.equal(result.ok,true);assert.equal(outcomes.at(-1).enabled,false);
});
test('activation uses the claimed period terminal ID, preserving existing legacy jobs',async()=>{
  let uploaded;
  const result=await dispatch({command:'identity_activate_employee',payload:{operation_id:'job',device_key:'pa',plant_location:'PA'}},{cfg:cfg('PA'),db:{
    claimIntegration:async()=>({id:'job',claim_token:'claim',employee_id:'employee',action:'activate',terminal_user_id:'101',target:'PA'}),
    employee:async()=>({id:'employee',employee_number:3,zkt_user_id:101,first_name:'Robert',last_name:'Test',active:true,zkt_enabled:false}),
    finishIntegration:async()=>{},
  },sdk:async request=>{uploaded=request.user;return {ok:true,serialNumber:'PA-SERIAL',userId:'101',enabled:true,readBackVerified:true}}});
  assert.equal(uploaded.userId,'101');assert.equal(result.ok,true);
});
