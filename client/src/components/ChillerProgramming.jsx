import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const button={padding:'12px 16px',borderRadius:12,border:'1px solid #64748b',background:'#0f172a',color:'#fff',cursor:'pointer',fontWeight:800}
const field={display:'block',boxSizing:'border-box',width:'100%',minWidth:0,minHeight:44,marginTop:6,padding:'10px 12px',borderRadius:10,border:'1px solid #64748b',background:'#0f172a',color:'#ffffff',colorScheme:'dark',fontSize:16}
const option={background:'#0f172a',color:'#ffffff'}
const labels={idle:'IDLE',authorized:'AUTHORIZED',downloading:'DOWNLOADING',verifying:'VERIFYING',installing:'INSTALLING',rebooting:'REBOOTING',waiting_for_telemetry:'WAITING FOR DEVICE / TELEMETRY',completed:'PROGRAMMING SUCCESSFUL',failed:'FAILED'}
async function call(body) {
  const {data,error}=await supabase.functions.invoke('chiller-ota',{body,timeout:15000})
  if(error || data?.error) {
    let detail=data?.error
    try{detail ||= (await error?.context?.json())?.error}catch{ /* fallback */ }
    throw new Error(detail || 'Programming service unavailable or access denied.')
  }
  return data
}
export default function ChillerProgramming({deviceCode,label,data,error,onRefresh,online:telemetryOnline}) {
  const [open,setOpen]=useState(false),[code,setCode]=useState(''),[release,setRelease]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[submitted,setSubmitted]=useState(null)
  const guard=useRef(false),request=useRef(null)
  const observed=data?.jobs?.[0]
  const latest=!observed || (submitted && submitted.id!==observed.id && Date.parse(submitted.created_at)>Date.parse(observed.created_at)) ? submitted : observed
  const active=latest && !['completed','failed'].includes(latest.status)
  const online=!!data?.device && (telemetryOnline ?? Date.now()-Date.parse(data.device.last_seen)<45000)
  const deviceStatus=error?'STATUS UNAVAILABLE':!data?'LOADING':!data.device?'OTA NOT INITIALIZED':online?'ONLINE':'DEVICE OFFLINE'
  const versions=data?.releases?.filter(r=>r.version!==data?.device?.version)||[]
  const selected=versions.find(r=>r.id===release)
  async function program(event) {
    event.preventDefault()
    if(guard.current || active || !online || !selected) return
    guard.current=true;setBusy(true);setMessage('')
    try {
      const {grant}=await call({op:'unlock',device:deviceCode,code})
      if(request.current?.release!==release) request.current={id:crypto.randomUUID(),release}
      const result=await call({op:'queue',device:deviceCode,grant,action:'update',...request.current})
      setSubmitted({id:result.id,status:'authorized',progress:0,created_at:new Date().toISOString(),release:{version:selected.version}})
      setOpen(false);setMessage(result.wake==='fallback'?'Job accepted. Wake unavailable; automatic fallback may take up to one hour.':'Job accepted. Waiting for verified firmware and telemetry after reboot.')
      onRefresh(true)
    }catch(err){setMessage(err.message)}finally{setCode('');guard.current=false;setBusy(false)}
  }
  const timestamp=value=>value?new Date(value).toLocaleString():'—'
  return <section aria-label="Firmware Programming">
    <h2 className="mb-4 text-xl font-bold">Firmware Programming</h2>
    <button type="button" style={button} onClick={()=>onRefresh()}>REFRESH FIRMWARE STATUS</button>
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
      <dl className="grid flex-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {[['Current Firmware',data?.device?.version||'—'],['Device OTA Status',deviceStatus],['Last Seen',timestamp(data?.device?.last_seen)],['Available Version',data&&!error?(versions[0]?.version||(data.releases?.length?'No newer approved version':'NO APPROVED FIRMWARE AVAILABLE')):'—'],['Last Attempt',timestamp(observed?.created_at)],['Last Successful Update',timestamp(data?.last_successful_update?.updated_at)]].map(([name,value])=><div key={name}><dt className="text-sm text-slate-400">{name}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
      </dl>
      <button type="button" style={button} disabled={busy || !!active || !online || !versions.length} onClick={()=>{setOpen(true);setMessage('');setCode('');onRefresh()}}>{active?'PROGRAMMING…':'PROGRAM FIRMWARE'}</button>
    </div>
    {data&&!error&&!data.device&&<div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3"><p>Initial physical firmware installation is required before Internet programming can be used.</p>{deviceCode==='ESP32-CH3-PLC'&&<p className="mt-1">CH3 hardware is not present.</p>}</div>}
    <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900 p-3" role="status">
      <strong>{labels[latest?.status||'idle']}</strong>
      {latest&&Number.isFinite(latest.progress)&&<div className="mt-2"><progress aria-label="Firmware update progress" max="100" value={latest.progress} /> <span>{latest.progress}%</span></div>}
    </div>
    {latest?.failure && <div role="alert"><p>{latest.failure==='device_reported_failure'?'Device reported an OTA failure before installation completed.':latest.failure==='deadline_exceeded'?'The firmware update timed out before completion was confirmed.':'The firmware update failed. Review the diagnostic code before retrying.'}</p><p className="mt-1 break-words text-xs text-slate-400">Diagnostic code: {latest.failure}</p></div>}
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    {open && <div role="dialog" aria-modal="true" aria-labelledby="program-title" style={{position:'fixed',inset:0,zIndex:2100,background:'rgba(2,6,23,.85)',display:'grid',placeItems:'center',padding:16}}>
      <form onSubmit={program} style={{background:'#0f172a',border:'1px solid #64748b',borderRadius:20,padding:24,width:'100%',maxWidth:480,maxHeight:'calc(100dvh - 32px)',overflowY:'auto',boxSizing:'border-box'}}>
        <h2 id="program-title">Program {label} firmware?</h2>
        <p>Current version: <strong>{data?.device?.version||'—'}</strong></p>
        <p>The controller will download the firmware and reboot.<br />Monitoring will be temporarily unavailable.</p>
        <p><label>Target version <select style={field} required value={release} disabled={busy} onChange={e=>{setRelease(e.target.value);request.current=null}}><option style={option} value="">Select firmware</option>{versions.map(r=><option style={option} key={r.id} value={r.id}>{r.version} · {r.size} bytes</option>)}</select></label></p>
        {selected?.size!=null&&<p>Firmware size: {selected.size.toLocaleString()} bytes</p>}
        <p><label>Programming code <input style={field} autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={code} disabled={busy} onChange={e=>setCode(e.target.value)} /></label></p>
        <p role="alert">{message}</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button type="button" style={button} disabled={busy} onClick={()=>{setOpen(false);setCode('')}}>CANCEL</button><button style={button} disabled={busy || !online || !selected || code.length!==4}>{busy?'AUTHORIZING…':'CONFIRM PROGRAMMING'}</button></div>
      </form>
    </div>}
  </section>
}
