/* Save as client/src/components/monitoring/pa/ClimateControlMsi.jsx in the
 * CURRENT live Farmplast source. Replace its existing ClimateControl import
 * only after testing; the GitHub main branch is currently behind live Vercel.
 */
import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../../../lib/supabase'

const f=x=>typeof x==='number'&&Number.isFinite(x)?`${x.toFixed(1)}°F`:'—'
const modeSet=['AUTO','MANUAL','OFF']
const header=(title)=>({margin:0,fontSize:12,fontWeight:700,color:'#94a3b8',letterSpacing:'.06em',textTransform:'uppercase',textAlign:'center'})
const box={padding:'16px',border:'1px solid #334155',background:'#0f172a',borderRadius:16}
const card={...box,minWidth:260,display:'grid',gap:12}
const btn={padding:'10px 14px',background:'#1e293b',border:'1px solid #475569',color:'white',borderRadius:10,cursor:'pointer'}

export default function ClimateControlMsi(){
  const [zones,setZones]=useState([]),[error,setError]=useState(''),[working,setWorking]=useState(''),[lastPoll,setLastPoll]=useState(null)
  const [draft,setDraft]=useState({})
  useEffect(()=>{
    let stop=false,t
    async function poll(){
      try{
        const {data}=await supabase.auth.getSession()
        if(!data?.session)throw Error('Login to Farmplast to view PA Climate')
        const res=await fetch('/api/pa-climate-msi',{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:AbortSignal.timeout(9500)})
        if(!res.ok)throw Error((await res.json().catch(()=>({}))).error||'MSI unavailable')
        const v=await res.json()
        if(!stop){setZones(v.zones||[]);setError('');setLastPoll(new Date());}
      }catch(e){if(!stop){setError(e.message);setZones([])}}
      finally{if(!stop)t=setTimeout(poll,7000)}
    }
    poll();return()=>{stop=true;clearTimeout(t)}
  },[])
  async function send(zone,cmd){
    if(working)return
    setWorking(zone.id);setError('')
    try{
      const {data}=await supabase.auth.getSession()
      if(!data?.session)throw Error('Login required')
      const res=await fetch('/api/pa-climate-msi',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
        body:JSON.stringify({zone_id:zone.id,target_f:cmd.target_f,mode:cmd.mode,manual_heat:cmd.manual_heat})})
      if(!res.ok)throw Error((await res.json().catch(()=>({}))).error||'Command rejected')
      const revised=await res.json()
      setZones(old=>old.map(z=>z.id===zone.id?{...z,desired:revised.desired}:z))
    }catch(e){setError(e.message)}finally{setWorking('')}
  }
  return <main style={{minHeight:'100vh',background:'#020617',color:'#f8fafc',padding:'24px 18px'}}>
    <div style={{maxWidth:1280,margin:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:24}}>
        <div><p style={header()}>PENNSYLVANIA</p><h1 style={{margin:'8px 0'}}>Climate Control</h1><p style={{color:'#94a3b8'}}>MSI server · Temperatures °F · Two DS18B20 per zone</p></div>
        <Link to="/monitoring/pa" style={{color:'#67e8f9'}}>Back to PA Overview</Link>
      </div>
      {error&&<div role="alert" style={{...box,color:'#fecaca',marginBottom:14}}>{error}</div>}
      <p style={{fontSize:12,color:'#94a3b8'}}>{lastPoll?`Last update: ${lastPoll.toLocaleTimeString()}`:'Waiting for real MSI telemetry'} · Offline zones never display stale temperatures as current</p>
      {zones.length===0&&!error&&<div style={box}>No controllers registered on MSI.</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(275px,1fr))',gap:16}}>
        {zones.map(z=>{
          const d=z.desired||{target_f:72,mode:'OFF',manual_heat:false},r=z.online?z.reported:null
          const pending=!!r&&r.revision!==d.revision
          const target=draft[z.id]??String(d.target_f)
          return <section key={z.id} style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{fontSize:19,margin:0}}>{z.name||z.id}</h2><strong style={{fontSize:12,color:z.online?'#4ade80':'#fbbf24'}}>{z.online?'ONLINE':'OFFLINE'}</strong></div>
            <div style={{textAlign:'center'}}><p style={header()}>Average temperature</p><div style={{fontSize:36,fontWeight:800}}>{f(r?.temperature_f)}</div></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{...box,padding:10,textAlign:'center'}}><div style={header()}>Sensor 1</div><strong style={{fontSize:21}}>{f(r?.sensor_1_f)}</strong></div>
              <div style={{...box,padding:10,textAlign:'center'}}><div style={header()}>Sensor 2</div><strong style={{fontSize:21}}>{f(r?.sensor_2_f)}</strong></div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}><label htmlFor={'target-'+z.id} style={{fontSize:13}}>Target °F</label>
              <input id={'target-'+z.id} inputMode="decimal" type="number" step="0.5" min="45" max="90" value={target}
                onChange={e=>setDraft(old=>({...old,[z.id]:e.target.value}))}
                style={{width:85,...btn}}/>
              <button type="button" disabled={!!working||!Number.isFinite(Number(target))||Number(target)<45||Number(target)>90}
                style={{...btn,opacity:working?0.5:1}} onClick={()=>send(z,{target_f:Number(target),mode:d.mode,manual_heat:d.manual_heat})}>Save</button></div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{modeSet.map(m=><button key={m} type="button" disabled={!!working}
              style={{...btn,background:d.mode===m?'#155e75':'#1e293b'}} onClick={()=>send(z,{target_f:d.target_f,mode:m,manual_heat:false})}>{m}</button>)}</div>
            {d.mode==='MANUAL'&&<div style={{display:'flex',gap:8}}>{[false,true].map(on=><button key={String(on)} type="button" disabled={!!working}
              style={{...btn,background:d.manual_heat===on?'#155e75':'#1e293b'}} onClick={()=>send(z,{target_f:d.target_f,mode:'MANUAL',manual_heat:on})}>HEAT {on?'ON':'OFF'}</button>)}</div>}
            <div style={{fontSize:12,color:'#94a3b8'}}>{r?`Reported HEAT: ${r.heat?'ON':'OFF'} · Mode: ${r.mode}`:'No current output data'}{pending?' · COMMAND PENDING':''}{r?.degraded?' · ONE SENSOR FAILED':''}{r?.sensor_difference?' · TEMPERATURE DIFFERENCE':''}{r&&!r.relay_armed?' · RELAY LOCKED':''}</div>
          </section>
        })}
      </div>
    </div>
  </main>
}