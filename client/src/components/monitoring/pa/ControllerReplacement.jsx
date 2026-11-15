import {useCallback,useEffect,useRef,useState} from 'react'
import {supabase} from '../../../lib/supabase'
async function request(view='',body){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in to Farmplast with an authorized operator account.')
 const r=await fetch('/api/pa-climate-msi'+view,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(25000)})
 if(!r.ok){const b=await r.json();throw Error(b.error||'MSI unavailable')}
 return r
}
const absent=v=>v===null||v===undefined?'Not reported':String(v)
export default function ControllerReplacement(){
 const [zones,setZones]=useState([]),[otaJobs,setOtaJobs]=useState([]),[operations,setOperations]=useState([]),[history,setHistory]=useState([]),[selected,select]=useState(''),[pin,setPin]=useState(''),[restore,setRestore]=useState(false),[heatAck,setHeatAck]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const requestId=useRef(null)
 const refresh=useCallback(async()=>{try{const [a,b,c]=await Promise.all([request().then(r=>r.json()),request('?view=replacements').then(r=>r.json()),request('?view=jobs').then(r=>r.json())]);setZones(a.zones||[]);setOperations(b.replacements||[]);setHistory(b.history||[]);setOtaJobs(c.jobs||[])}catch(e){setMessage(e.message)}},[])
 useEffect(()=>{refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer)},[refresh])
 const zone=zones.find(z=>z.id===selected),op=operations.find(o=>o.zone_id===selected&&!['cancelled','completed'].includes(o.status)),manualOn=op?.saved_desired.mode==='MANUAL'&&op?.saved_desired.manual_heat
 async function perform(action){
  if(busy||!zone)return
  setBusy(true);setMessage('')
  try{
   if(!/^\d{4}$/.test(pin))throw Error('Enter the existing four-digit Farmplast PIN.')
   let body={action,pin}
   if(action==='replacement_create'){
    requestId.current??=crypto.randomUUID()
    body={...body,zone_id:zone.id,old_device_id:zone.device_id,request_id:requestId.current,expected_device_id:zone.id==='pa-zone-1'&&!zone.device_id?'PA-CLIM-209BA98DBF90':null}
   }else body.operation_id=op.id
   if(action==='replacement_commit'){
    if(!window.confirm('Replace '+op.zone_name+' controller?\nOld: '+(op.old_device_id||'unassigned')+'\nNew: '+op.new_device_id+'\n'+(restore?'Restore saved '+op.saved_desired.mode+' mode.':'Keep the output OFF.')))return
    body={...body,old_device_id:op.old_device_id,new_device_id:op.new_device_id,restore_mode:restore,acknowledge_heat:heatAck}
   }
   const response=await request('',body)
   if(action==='replacement_installer'){
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='Farmplast-Replace-Controller.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
    setMessage('Extract the ZIP on the Windows PC beside the new ESP32 and run Run-Replacement.cmd. No MSI desktop login is needed. The operation capability expires after 24 hours; download again here to resume.')
   }else{
    await response.json();setMessage(action==='replacement_create'?'Operation prepared. Download the USB installer; no assignment has changed.':action==='replacement_cancel'?'Operation cancelled. Previous assignment retained.':'Assignment switched. The displayed output and command status below require a fresh device acknowledgement.')
    if(action!=='replacement_create'){setPin('');requestId.current=null}
   }
   await refresh()
  }catch(e){setMessage(e.message);await refresh()}finally{setBusy(false)}
 }
 return <article style={{overflowWrap:'anywhere'}}><h2>Controllers · assignment and replacement</h2>
  <p>Choose a zone, prepare its new board over USB, then explicitly confirm the assignment. Until confirmation the new board stays OFF. Existing zone settings and history are retained.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'}}>{zones.map(z=><section key={z.id} style={{border:'1px solid #ccd6e3',borderRadius:10,padding:12}}>
   <h3>{z.name}</h3><p>{z.device_id||'No controller assigned'} · {z.online?'Online':'Offline'}</p>
   <p>Firmware: {absent(z.firmware)}<br/>Last message: {z.last_seen?new Date(z.last_seen).toLocaleString():'Never received'}<br/>Target: {z.desired.target_f} °F · {z.desired.mode}<br/>T1 / T2: {absent(z.reported?.sensor_1_f)} / {absent(z.reported?.sensor_2_f)} °F<br/>Sensors: {absent(z.reported?.sensor_count)} · Heat: {z.reported?z.reported.heat?'ON':'OFF':'Not reported'}<br/>RSSI / IP: {absent(z.reported?.wifi_rssi)} / {absent(z.reported?.ip)}<br/>Registration: {z.registration_state}<br/>Command: {z.command_ack.status}</p>
   <p>Sensor state: {!z.reported?'Not reported':z.reported.sensor_count===0?'Both sensors unavailable':z.reported.sensor_count===1?'One sensor unavailable':'Two sensors reporting'}<br/>Hysteresis / minimum switch interval: {absent(z.desired.hysteresis_f)} °F / {absent(z.desired.min_switch_ms)} ms<br/>OTA: {otaJobs.filter(j=>j.device_id===z.device_id).at(-1)?.status||'No OTA job'}</p>
   <button type="button" disabled={busy} onClick={()=>{select(z.id);setMessage('');requestId.current=null;setRestore(false);setHeatAck(false)}}>Replace controller · {z.name}</button>
  </section>)}</div>
  {zone&&<section aria-label="Controller replacement" style={{marginTop:16}}><h3>{zone.name} · replacement</h3>
   <p>Current controller: {zone.device_id||'unassigned'}<br/>Saved target: {op?.saved_desired.target_f??zone.desired.target_f} °F · mode {op?.saved_desired.mode??zone.desired.mode}</p>
   <label>Existing Farmplast PIN <input aria-label="Replacement PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label>
   {!op?<p><button disabled={busy} onClick={()=>perform('replacement_create')}>Prepare replacement</button></p>:<>
    <p>Old: {op.old_device_id||'unassigned'}<br/>New: {op.new_device_id||op.expected_device_id||'Detected by the USB installer'}<br/>Operation: {op.status}<br/>New-board telemetry: {op.last_seen?new Date(op.last_seen).toLocaleString():'Not received'} · sensors {absent(op.reported?.sensor_count)} · heat {op.reported?op.reported.heat?'ON':'OFF':'Not reported'}</p>
    <p><button disabled={busy} onClick={()=>perform('replacement_installer')}>Download / resume Windows USB setup</button>{' '}<button disabled={busy} onClick={()=>perform('replacement_cancel')}>Cancel operation</button></p>
    <label><input type="checkbox" checked={restore} onChange={e=>setRestore(e.target.checked)}/> Restore saved mode after replacement (otherwise remain OFF)</label>
    {restore&&manualOn&&<p><label><input type="checkbox" checked={heatAck} onChange={e=>setHeatAck(e.target.checked)}/> I understand saved MANUAL ON may turn on heating after confirmation.</label></p>}
    <p><button disabled={busy||op.status!=='ready'||(restore&&manualOn&&!heatAck)} onClick={()=>perform('replacement_commit')}>Confirm replacement · {op.new_device_id||'awaiting board'}</button></p>
   </>}
  </section>}
  <p role="status">{message}</p>
  {operations.length>0&&<details><summary>Registration / replacement status</summary><ul>{operations.map(o=><li key={o.id}>{o.zone_name} · {o.old_device_id||'unassigned'} → {o.new_device_id||'USB pending'} · {o.status}</li>)}</ul></details>}
  {history.length>0&&<details><summary>Assignment history</summary><ul>{history.map(h=><li key={h.operation_id}>{new Date(h.at).toLocaleString()} · {h.zone_id}: {h.old_device_id||'unassigned'} → {h.new_device_id}</li>)}</ul></details>}
 </article>
}
