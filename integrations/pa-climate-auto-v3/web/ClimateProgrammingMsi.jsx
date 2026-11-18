/* Optional MSI OTA control page for the CURRENT Farmplast live source.
 * Save as client/src/pages/ClimateProgrammingMsi.jsx only when current source is recovered.
 * Do not replace existing USB programming until physical OTA tests pass.
 */
import {useCallback,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'

const theme={background:'#020617',color:'#f8fafc',minHeight:'100vh',padding:'28px 16px'}
const panel={padding:18,border:'1px solid #334155',borderRadius:15,background:'#0f172a',marginBottom:16}
const field={background:'#1e293b',color:'#f8fafc',padding:10,border:'1px solid #475569',borderRadius:8,width:'100%'}
const button={background:'#155e75',color:'white',padding:'10px 16px',border:0,borderRadius:9,cursor:'pointer'}
const rx=async (url,method='GET',payload)=>{
  const {data}=await supabase.auth.getSession()
  if(!data?.session)throw Error('Login required')
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},
    body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)})
  const value=await r.json().catch(()=>({}))
  if(!r.ok)throw Error(value.error||`HTTP ${r.status}`)
  return value
}
export default function ClimateProgrammingMsi(){
  const [zones,setZones]=useState([]),[releases,setReleases]=useState([]),[jobs,setJobs]=useState([]),[err,error]=useState(''),[info,setInfo]=useState('')
  const [file,setFile]=useState(null),[version,setVersion]=useState(''),[targetDevice,setTargetDevice]=useState(''),[release,setRelease]=useState(''),[busy,setBusy]=useState(false)
  const refresh=useCallback(async()=>{
    try{
      const [a,b,c]=await Promise.all([rx('/api/pa-climate-msi'),rx('/api/pa-climate-msi?view=releases'),rx('/api/pa-climate-msi?view=jobs')]);
      setZones(a.zones||[]);setReleases(b.releases||[]);setJobs(c.jobs||[]);error('')
    }catch(e){error(e.message)}
  },[])
  useEffect(()=>{refresh();const t=setInterval(refresh,10000);return()=>clearInterval(t)},[refresh])
  const upload=async()=>{
    if(!file||!version)return
    setBusy(true);error('');setInfo('')
    try{
      if(file.size<256||file.size>1310720)throw Error('Only classic ESP32 application .bin smaller than an OTA slot is accepted')
      if(!/^[A-Za-z0-9._-]{1,48}$/.test(version))throw Error('Invalid firmware version')
      const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('File read failed'));r.readAsDataURL(file)})
      const v=await rx('/api/pa-climate-msi','POST',{action:'upload',version,firmware_base64:raw})
      setInfo(`Uploaded release ${v.version}, SHA256 ${v.sha256}. No device updated yet.`)
      setRelease(v.sha256);await refresh()
    }catch(e){error(e.message)}finally{setBusy(false)}
  }
  const stage=async()=>{
    if(!targetDevice||!release||!window.confirm(`Start OTA for ${targetDevice}? Only while HEAT is OFF.`))return
    setBusy(true);error('');setInfo('')
    try{
      const v=await rx('/api/pa-climate-msi','POST',{action:'ota',device_id:targetDevice,sha256:release})
      setInfo(`OTA queued: ${v.job_id}. Completion is verified only after new telemetry.`)
      await refresh()
    }catch(e){error(e.message)}finally{setBusy(false)}
  }
  return <main style={theme}><div style={{maxWidth:1050,margin:'auto'}}>
    <p style={{color:'#67e8f9',fontSize:12,fontWeight:700}}>PENNSYLVANIA · MSI SERVER</p>
    <h1>Climate Programming & OTA</h1>
    <p style={{color:'#94a3b8'}}>Firmware and telemetry stored on home MSI. No automatic mass deployment.</p>
    <Link to="/monitoring/pa/climate" style={{color:'#67e8f9'}}>Back to Climate Control</Link>
    {err&&<div role="alert" style={{...panel,color:'#fecaca',marginTop:16}}>{err}</div>}
    {info&&<div role="status" style={{...panel,color:'#a7f3d0',marginTop:16}}>{info}</div>}
    <section style={{...panel,marginTop:18}}><h2>1. Upload compatible application .bin to MSI</h2>
      <p style={{color:'#94a3b8'}}>Upload does not start OTA. Source model and compiled version markers must match.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label style={{minWidth:260,flex:1}}>Firmware file<input type="file" accept=".bin" style={field} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        <label style={{minWidth:170}}>Version<input style={field} value={version} placeholder="pa-climate-msi-2.0.0" onChange={e=>setVersion(e.target.value)}/></label>
        <button style={button} disabled={busy||!file||!version} onClick={upload}>Upload to MSI</button>
      </div>
    </section>
    <section style={panel}><h2>2. Update one controller</h2>
      <p style={{color:'#94a3b8'}}>Physical relay and recovery verification are required before real OTA. Heating ON blocks update.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label style={{minWidth:240,flex:1}}>Device<select style={field} value={targetDevice} onChange={e=>setTargetDevice(e.target.value)}><option value="">Select device</option>{zones.map(z=>z.device_id&&<option key={z.id} value={z.device_id}>{z.name} · {z.device_id} · {z.online?'ONLINE':'OFFLINE'}</option>)}</select></label>
        <label style={{minWidth:280,flex:2}}>Release<select style={field} value={release} onChange={e=>setRelease(e.target.value)}><option value="">Select release</option>{releases.map(x=><option key={x.sha256} value={x.sha256}>{x.version} · {x.sha256.slice(0,14)}…</option>)}</select></label>
        <button style={button} disabled={busy||!targetDevice||!release} onClick={stage}>Start OTA</button>
      </div>
    </section>
    <section style={panel}><h2>3. OTA status</h2>
      {jobs.length===0?<p style={{color:'#94a3b8'}}>No OTA jobs yet.</p>:<div style={{display:'grid',gap:8}}>{jobs.slice().reverse().map(j=><div key={j.id} style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap',borderTop:'1px solid #334155',paddingTop:10}}><span>{j.device_id} · {j.version}</span><strong>{j.status}</strong></div>)}</div>}
    </section>
    <button onClick={refresh} style={button}>Refresh status</button>
  </div></main>
}