import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {queueFirmware,requiresPhysicalMigration} from '../utils/ch1Firmware'
import Ch1FirmwareUpload from './Ch1FirmwareUpload'

const button={padding:'12px 16px',borderRadius:12,border:'1px solid #64748b',background:'#0f172a',color:'#fff',cursor:'pointer',fontWeight:800}
const labels={idle:'IDLE',authorized:'AUTHORIZED',downloading:'DOWNLOADING',verifying:'VERIFYING',installing:'INSTALLING',rebooting:'REBOOTING',waiting_for_telemetry:'WAITING FOR DEVICE / TELEMETRY',completed:'PROGRAMMING SUCCESSFUL',failed:'FAILED'}
export default function Ch1Programming({data,error,onRefresh}) {
  const [upload,setUpload]=useState(false)
  const [open,setOpen]=useState(false),[code,setCode]=useState(''),[release,setRelease]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[submitted,setSubmitted]=useState(null)
  const guard=useRef(false),request=useRef(null)
  const observed=data?.jobs?.[0]
  const latest=!observed || (submitted && submitted.id!==observed.id && Date.parse(submitted.created_at)>Date.parse(observed.created_at)) ? submitted : observed
  const active=latest && !['completed','failed'].includes(latest.status)
  const online=!!data?.device && Date.now()-Date.parse(data.device.last_seen)<120000
  const physicalMigration=requiresPhysicalMigration(data?.device)
  const versions=data?.releases?.filter(r=>r.version!==data?.device?.version)||[]
  const selected=versions.find(r=>r.id===release)
  async function program(event) {
    event.preventDefault()
    if(guard.current || active || !online || !selected || physicalMigration) return
    guard.current=true;setBusy(true);setMessage('')
    try {
      if(request.current?.release!==release) request.current={id:crypto.randomUUID(),release}
      const result=await queueFirmware(supabase,{code,release:selected,requestId:request.current.id})
      setSubmitted({id:result,status:'authorized',progress:0,created_at:new Date().toISOString(),release:{version:selected.version}})
      setOpen(false);setMessage('Job accepted. Waiting for verified firmware and telemetry after reboot.')
      onRefresh()
    }catch(err){setMessage(err.message)}finally{setCode('');guard.current=false;setBusy(false)}
  }
  const timestamp=value=>value?new Date(value).toLocaleString():'—'
  return <div>
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
      <div>Firmware: <strong>{data?.device?.version||'Not registered'}</strong> {active && <>→ {latest.release?.version||selected?.version||'selected version'}</>}<br />Available: {versions[0]?.version||'No approved update'}<br />Last seen: {timestamp(data?.device?.last_seen)} · {online?'ONLINE':'OFFLINE'}</div>
      <button type="button" style={button} disabled={busy || !!active} onClick={()=>setUpload(true)}>UPLOAD FIRMWARE</button>
      <button type="button" style={button} disabled={busy || !!active || !online || !versions.length || physicalMigration} onClick={()=>{setOpen(true);setMessage('');setCode('')}}>{active?'PROGRAMMING…':'PROGRAM FIRMWARE'}</button>
    </div>
    {physicalMigration && <p role="alert"><strong>PHYSICAL MIGRATION REQUIRED</strong><br />Current ch1-ota-2 cannot safely perform the first Internet OTA.<br />Install ch1-edgefree-2 by USB once.</p>}
    <p role="status">OTA: {labels[latest?.status||'idle']}</p>
    {active && <><progress aria-label="Firmware update progress" max="100" value={latest.progress||0} /> {latest.progress||0}%</>}
    <p>Last attempt: {timestamp(observed?.created_at)} · Last successful update: {timestamp(data?.last_successful_update?.updated_at)}</p>
    {latest?.failure && <p role="alert">{latest.failure}</p>}
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    {upload && <Ch1FirmwareUpload device="ESP32-CH1" onClose={()=>setUpload(false)} onApproved={onRefresh}/>}
    {open && <div role="dialog" aria-modal="true" aria-labelledby="program-title" style={{position:'fixed',inset:0,zIndex:2100,background:'rgba(2,6,23,.85)',display:'grid',placeItems:'center',padding:16}}>
      <form onSubmit={program} style={{background:'#0f172a',border:'1px solid #64748b',borderRadius:20,padding:24,width:'100%',maxWidth:480}}>
        <h2 id="program-title">Program Chiller 1 firmware?</h2>
        <p>The ESP32 will download firmware and reboot. Monitoring will be temporarily unavailable. Success is confirmed only after the expected firmware reconnects and telemetry resumes.</p>
        <p><label>Target version <select required value={release} disabled={busy} onChange={e=>{setRelease(e.target.value);request.current=null}}><option value="">Select firmware</option>{versions.map(r=><option key={r.id} value={r.id}>{r.version} · {r.size} bytes</option>)}</select></label></p>
        <p><label>Programming code <input autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={code} disabled={busy} onChange={e=>setCode(e.target.value)} /></label></p>
        <p role="alert">{message}</p>
        <div style={{display:'flex',gap:12}}><button type="button" style={button} disabled={busy} onClick={()=>{setOpen(false);setCode('')}}>Cancel</button><button style={button} disabled={busy || !online || !selected || code.length!==4 || physicalMigration}>{busy?'AUTHORIZING…':'CONFIRM PROGRAMMING'}</button></div>
      </form>
    </div>}
  </div>
}
