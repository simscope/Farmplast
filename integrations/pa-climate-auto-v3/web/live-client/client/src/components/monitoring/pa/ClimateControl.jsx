import {Link} from 'react-router-dom'
import {supabase} from '../../../lib/supabase'
import Target from './ZoneTarget'
import { useState, useRef, useEffect } from 'react'
import {toExistingPaClimateCard} from './climateUiData.mjs'
import { Flame, Thermometer } from 'lucide-react'
import ZoneOne from './ZoneOne'
import './climateControl.css'

const key = 'farmplast.pa.climate.targetDrafts.v1'
const valid = value => typeof value === 'number' && Number.isFinite(value)
function ZoneControls({ id, name, zone, refresh }) {
  const storageKey = 'farmplast.pa.climate.controlDraft.v1.' + id
  const [choice, setChoice] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved?.mode === 'MANUAL') return { mode: 'MANUAL', heat: saved.heat === true }
    } catch { /* Start with the default local preference. */ }
    return { mode: 'AUTO', heat: false }
  })
  const [error, setError] = useState('')
  async function select(mode, heat, heatOnly=false) {
    if(zone){
      try{await msiRequest('POST',heatOnly?{action:'heat',zone_id:id,manual_heat:heat}:{action:'mode',zone_id:id,mode});setError('');await refresh()}
      catch(e){setError(e.message)}
      return
    }
    const next = { mode, heat }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setChoice(next); setError('') }
    catch { setError('Could not save this setting.') }
  }
  const actual=zone?{mode:zone.reported?.mode??zone.desired.mode,heat:zone.reported?.heat===true}:choice
  const busy=zone&&(!zone.online||zone.command_ack?.status==='pending')
  const disabledForMode=mode=>zone&&(!zone.online||(zone.command_ack?.status==='pending'&&mode!=='OFF'))
  return <div className="cl-switches">
    <small>{zone?'Controller settings':'Local settings'}</small>
    <div role="group" aria-label={name + ' mode'}>{(zone?['AUTO','MANUAL','OFF']:['AUTO','MANUAL']).map(mode =>
      <button type="button" key={mode} disabled={disabledForMode(mode)} aria-pressed={actual.mode === mode} onClick={() => select(mode, mode === choice.mode && choice.heat)}>{mode}</button>)}</div>
    {actual.mode === 'MANUAL' && <div role="group" aria-label={name + ' manual heat'}>{[true, false].map(on =>
      <button type="button" key={String(on)} disabled={busy||(zone&&on&&zone.reported?.sensor_count===0)} aria-pressed={actual.heat === on} onClick={() => select('MANUAL', on, true)}>HEAT {on ? 'ON' : 'OFF'}</button>)}</div>}
    {error && <small role="alert">{error}</small>}
  </div>
}
async function msiRequest(method='GET',body){
 const {data}=await supabase.auth.getSession()
 if(!data.session)throw Error('Sign in to Farmplast.')
 const r=await fetch('/api/pa-climate-msi',{method,headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)})
 if(!r.ok)throw Error((await r.json()).error||'MSI unavailable')
 return r.json()
}
export default function ClimateControl({ zones }) {
  const [msiZones,setMsiZones]=useState([]),[adding,setAdding]=useState(false)
  const [zonePins,setZonePins]=useState({}),[zoneFeedback,setZoneFeedback]=useState({})
  async function refreshMsi(){
    try{const value=await msiRequest();setMsiZones(value.zones||[])}catch{setMsiZones(old=>old.map(z=>({...z,online:false,reported:null})))}
  }
  useEffect(()=>{let closed=false,t;async function poll(){if(closed)return;await refreshMsi();if(!closed)t=setTimeout(poll,4000)}poll();return()=>{closed=true;clearTimeout(t)}},[])
  const managed=new Map(msiZones.map(z=>[z.id,z]))
  const merge=z=>{const m=managed.get(z.id);return m?{...z,...toExistingPaClimateCard(m),msi:m,setpointF:m.desired.target_f,heatingActive:m.reported?.heat??null}:z}
  const viewZones=[...zones.map(merge),...msiZones.filter(z=>!zones.some(original=>original.id===z.id)).map(merge)]
  async function addController(){
    setAdding(true);setNotice('')
    try{
      const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in to Farmplast.')
      const r=await fetch('/api/pa-climate-msi',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'installer'})})
      if(!r.ok)throw Error((await r.json()).error||'Installer unavailable')
      const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Farmplast-Add-ESP32.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
      setNotice('Extract the ZIP on the factory Windows computer and run Add-ESP32.cmd. Start within 10 minutes.')
    }catch(e){setNotice(e.message)}finally{setAdding(false)}
  }
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
  })
  const [notice, setNotice] = useState('')
  const pinField=useRef(null)
  const [pin,setPin]=useState(''),[saving,setSaving]=useState(false)
  async function save(ids,target,localPin=''){
    if(saving)return
    const singleMsi=ids.length===1&&managed.has(ids[0])?ids[0]:null
    const enteredPin=localPin||pin
    setSaving(true);setNotice('')
    if(singleMsi)setZoneFeedback(v=>({...v,[singleMsi]:''}))
    try{
      if(!/^\d{4}$/.test(enteredPin)){if(!singleMsi)pinField.current?.focus();throw Error('Enter the four-digit temperature PIN before saving.')}
      const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in as an administrator.')
      const live=ids.includes('pa-zone-1')&&!managed.has('pa-zone-1'),url='/api/pa-zone1'
      const current=live?await (await fetch(url,{cache:'no-store'})).json():null
      if(live&&!Number.isSafeInteger(current?.revision))throw Error('Zone 1 is offline. No targets changed.')
      const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:live?'TARGET':'CHECK_PIN',target,pin:enteredPin,revision:current?.revision})})
      if(!r.ok)throw Error((await r.json()).error||'Target not accepted.')
      const connected=ids.filter(id=>managed.has(id))
      for(const id of connected)await msiRequest('POST',{action:'set',zone_id:id,target_f:target,pin:enteredPin})
      await refreshMsi()
      setPin('')
      if(singleMsi){
        setZonePins(v=>({...v,[singleMsi]:''}))
        setZoneFeedback(v=>({...v,[singleMsi]:'Target '+target+'°F sent to MSI; awaiting controller ACK.'}))
      }
      if(live){let confirmed=false;setNotice('Waiting for Zone 1…')
        for(let i=0;i<12;i++){await new Promise(resolve=>setTimeout(resolve,2500));const s=await (await fetch(url,{cache:'no-store'})).json();if(s.revision>current.revision&&s.target===target){confirmed=true;break}}
        if(!confirmed)throw Error('Zone 1 has not confirmed the new target. Check its reported temperature setting.')
      }
      const draftsOnly=ids.filter(id=>id!=='pa-zone-1'&&!managed.has(id))
      if(draftsOnly.length)saveDrafts(draftsOnly,target)
      setNotice((live?'Zone 1 confirmed '+target+' °F. ':'')+(connected.length?'Sent to MSI for '+connected.length+' controller(s); awaiting reported ACK. ':'')+(draftsOnly.length?'Local targets saved for '+draftsOnly.length+' unconnected zone(s).':''))
    }catch(e){setNotice(e.message);if(singleMsi)setZoneFeedback(v=>({...v,[singleMsi]:e.message}))}finally{setSaving(false)}
  }
  function saveDrafts(ids, target) {
    const next = { ...drafts, ...Object.fromEntries(ids.map(id => [id, target])) }
    try { localStorage.setItem(key, JSON.stringify(next)); setDrafts(next); setNotice('Saved ' + target + '°F locally for ' + ids.length + ' zone(s).') }
    catch { throw Error('Could not save local targets in this browser.') }
  }
  return <section className="cl-control">
    <div className="cl-bulk"><h2>Common target temperature</h2><p><Link to="/monitoring/pa/climate/programming">Programming &amp; diagnostics →</Link> <button type="button" disabled={adding} onClick={addController}>{adding?'Preparing…':'Add controller'}</button></p><div className="cl-pin-panel"><div><label htmlFor="cl-temperature-pin">Temperature PIN</label><small id="cl-pin-hint">Enter your 4-digit PIN before saving a temperature.</small></div>
      <input id="cl-temperature-pin" ref={pinField} aria-describedby="cl-pin-hint" type="password" inputMode="numeric" autoComplete="off" placeholder="Enter PIN" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} /></div>
      <Target label="All zones" min={40} max={90} disabled={saving} onSave={target => save(viewZones.map(z => z.id), target)} /><span role="status">{notice}</span></div>
    <div className="cl-grid">{viewZones.map(z => z.id === 'pa-zone-1'&&!z.msi ? <ZoneOne key={z.id} saveTarget={v=>save([z.id],v)} savingTarget={saving} /> : <article key={z.id}>
      <header><h2>{z.name}</h2><small>{z.connection}</small></header>
      <div className="cl-readings"><div><Thermometer color="#dc402b" /><strong>{z.temperatureF ?? '—'}°F</strong><small>{valid(z.temperatureF) ? ((z.temperatureF-32)*5/9).toFixed(1) + ' °C' : 'Temperature'}</small></div>
      <div title={valid(z.controlAverageF)?'Control average: '+z.controlAverageF.toFixed(1)+' °F':undefined}><Thermometer color="#1677dd" /><strong>{valid(z.secondTemperatureF)?z.secondTemperatureF.toFixed(1):'—'}°F</strong><small>Temperature 2</small></div></div>
      {z.msi&&<div className="cl-pin-panel"><label htmlFor={'cl-zone-pin-'+z.id}>Temperature PIN</label>
        <input id={'cl-zone-pin-'+z.id} type="password" inputMode="numeric" autoComplete="off" placeholder="4-digit PIN" maxLength={4}
          value={zonePins[z.id]||''} onChange={e=>setZonePins(v=>({...v,[z.id]:e.target.value.replace(/\\D/g,'')}))}/></div>}
      <Target key={String(drafts[z.id]) + ':' + (z.msi?.desired?.target_f??'')} min={40} max={90} disabled={saving} label={z.name + ' target'} initial={z.msi?z.setpointF:valid(drafts[z.id]) ? drafts[z.id] : z.setpointF} onSave={target => save([z.id],target,z.msi?zonePins[z.id]:'')} />
      {z.msi&&<small role="status">MSI target: {z.msi.desired?.target_f??'—'}°F · ESP32 target: {valid(z.msi.reported?.target_f)?z.msi.reported.target_f+'°F':'—'} · {z.msi.command_ack?.acknowledged?'Confirmed':z.msi.command_ack?.status==='pending'?'Awaiting controller ACK':'Not confirmed'}</small>}
      {zoneFeedback[z.id]&&<small role="alert">{zoneFeedback[z.id]}</small>}
      <ZoneControls id={z.id} name={z.name} zone={z.msi} refresh={refreshMsi} />
      <footer><Flame size={18} /> Reported heat {z.heatingActive == null ? '—' : z.heatingActive ? 'ON' : 'OFF'} · Mode {z.mode === 'NO_DATA' ? '—' : z.mode}</footer>
      {z.sensorWarning&&<strong role="status">One temperature sensor unavailable</strong>}
      {z.alarm === true && <strong>Active alarm</strong>}
    </article>)}</div></section>
}
