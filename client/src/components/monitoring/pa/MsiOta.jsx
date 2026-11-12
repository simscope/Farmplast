import {useCallback,useEffect,useState} from 'react'
import {supabase} from '../../../lib/supabase'
async function api(view='',body){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in to Farmplast.')
 const r=await fetch('/api/pa-climate-msi'+view,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(25000)})
 const value=await r.json();if(!r.ok)throw Error(value.error||'MSI unavailable');return value
}
export default function MsiOta(){
 const [zones,setZones]=useState([]),[releases,setReleases]=useState([]),[jobs,setJobs]=useState([]),[device,setDevice]=useState(''),[release,setRelease]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const refresh=useCallback(async()=>{try{const [a,b,c]=await Promise.all([api(),api('?view=releases'),api('?view=jobs')]);setZones(a.zones||[]);setReleases(b.releases||[]);setJobs(c.jobs||[])}catch(e){setMessage(e.message)}},[])
 useEffect(()=>{refresh();const timer=setInterval(refresh,15000);return()=>clearInterval(timer)},[refresh])
 async function upload(file){
  if(!file)return;setBusy(true);setMessage('')
  try{
   if(file.size<256||file.size>1310720)throw Error('Select an ESP32 application image that fits the OTA slot.')
   const bytes=new Uint8Array(await file.arrayBuffer()),text=new TextDecoder('latin1').decode(bytes),version=text.match(/PA_CLIMATE_FW_VERSION=([A-Za-z0-9._-]{1,48})\0/)?.[1]
   if(!version||!text.includes('PA_CLIMATE_FW_MODEL=PA-ESP32-WROOM32E-N4-R1\0'))throw Error('Firmware identity not recognized.')
   let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192))
   const value=await api('',{action:'upload',version,firmware_base64:btoa(raw)});setRelease(value.sha256);setMessage('Release uploaded. No controller updated.');await refresh()
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 async function update(){
  if(!device||!release||!window.confirm('Update '+device+' to the selected release?'))return
  setBusy(true);setMessage('')
  try{const value=await api('',{action:'ota',device_id:device,sha256:release});setMessage('Update queued: '+value.job_id+'. Waiting for the controller to reboot and validate the image.');await refresh()}
  catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 return <article><h2>MSI controllers · remote firmware</h2>
  <p>The Windows installer uploads the shared release automatically. You can also select a new application below.</p>
  <input type="file" accept=".bin" aria-label="Upload MSI firmware" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/>
  <p><label>Controller <select aria-label="MSI controller" value={device} disabled={busy} onChange={e=>setDevice(e.target.value)}><option value="">Select controller</option>{zones.map(z=><option key={z.id} value={z.device_id}>{z.name} · {z.online?'Online':'Offline'}</option>)}</select></label>{' '}
  <label>Release <select aria-label="MSI firmware release" value={release} disabled={busy} onChange={e=>setRelease(e.target.value)}><option value="">Select release</option>{releases.map(r=><option key={r.sha256} value={r.sha256}>{r.version} · {r.sha256.slice(0,12)}</option>)}</select></label>{' '}
  <button disabled={busy||!device||!release} onClick={update}>Update controller</button></p>
  <p role="status">{message}</p>{jobs.length>0&&<ul>{jobs.map(j=><li key={j.id}>{j.device_id} · {j.version} · {j.status}</li>)}</ul>}
 </article>
}
