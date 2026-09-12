// Local-only UI fixture. All Supabase operations are replaced before rendering.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {supabase} from '../src/lib/supabase'
import Chiller1HMIPage from '../src/pages/Chiller1HMIPage'
import {commandPatch} from '../../supabase/functions/ch1-ota/commands.mjs'
const values={setpoint:85,d1:2,d2:5,hyst:1,auto:true,fan_enable:false,fan_30:false,fan_60:false}
const actual={...values,online:true,cdw_out:80,cdw_in:78,chw_in:60,chw_out:55,comp1:true,comp2:false,alarm:false,stage30:false,stage60:false,reset:false}
const state={desired:{values,revision:0},commands:[],device:{version:'test-1',last_seen:new Date().toISOString()},releases:[{id:'test-release',version:'test-2',size:1000000}],jobs:[]}
let offline=false
const rows=()=>Object.entries(actual).map(([key,value])=>({asset_id:'test',asset_code:'CH-NJ-01',asset_name:'Chiller 1',asset_type:'chiller',point_id:key,point_code:'CH1_'+key.toUpperCase(),point_name:key,data_type:typeof value==='boolean'?'boolean':'number',value_boolean:typeof value==='boolean'?value:null,value_number:typeof value==='number'?value:null,updated_at:new Date().toISOString()}))
supabase.from=()=>{const chain=new Proxy({}, {get:(_,key)=>key==='then'?(yes)=>Promise.resolve({data:rows(),error:null}).then(yes):()=>chain});return chain}
const invoke=async(_,{body})=>{
 if(body.op==='status'){if(!offline) state.device.last_seen=new Date().toISOString();return {data:structuredClone(state),error:null}}
 if(body.op==='command'){
  if(body.type==='reset_alert' && body.pin!=='1234')return {data:{error:'Invalid PIN code'}}
  const patch=commandPatch(body.type,body.value);Object.assign(values,patch)
  const command={id:body.id,requested:patch,status:'pending',expires_at:new Date(Date.now()+45000).toISOString()};state.commands.unshift(command)
  return {data:{command:structuredClone(command)}}
 }
 if(body.op==='unlock')return body.code==='1234'?{data:{grant:'test-grant'}}:{data:{error:'Incorrect code'}}
 if(body.op==='queue'){state.jobs=[{id:body.id,status:'authorized',progress:0,created_at:new Date().toISOString(),release:{version:'test-2'}}];return {data:{id:body.id}}}
 throw new Error('Unexpected fixture request')
}
Object.defineProperty(supabase,'functions',{value:{invoke}})
function simulate(action){
 if(action==='reported'){Object.assign(actual,values);for(const c of state.commands)c.status='applied'}
 else if(action==='offline'){offline=true;state.device.last_seen=new Date(0).toISOString()}
 else if(state.jobs[0]){state.jobs[0].status=action;state.jobs[0].progress=action==='completed'?100:50;if(action==='completed'){state.device.version='test-2';state.last_successful_update={updated_at:new Date().toISOString()}}}
 document.dispatchEvent(new Event('visibilitychange'))
}
createRoot(document.getElementById('root')).render(<MemoryRouter><div style={{padding:12,background:'#fff'}}>ISOLATED FIXTURE — NO PRODUCTION REQUESTS. Test PIN: 1234. {['reported','downloading','rebooting','waiting_for_telemetry','completed','failed','offline'].map(x=><button key={x} onClick={()=>simulate(x)}>Test {x}</button>)}</div><Chiller1HMIPage/></MemoryRouter>)
