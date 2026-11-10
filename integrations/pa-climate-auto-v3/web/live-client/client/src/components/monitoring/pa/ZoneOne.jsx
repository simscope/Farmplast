import Target from './ZoneTarget'
import {useEffect,useState} from 'react'
import {Flame,Thermometer} from 'lucide-react'
import {Link} from 'react-router-dom'
import {supabase} from '../../../lib/supabase'
import {useAuth} from '../../../context/useAuth'
export default function ZoneOne({saveTarget,savingTarget}){
 const {profile,user}=useAuth(),[s,set]=useState(null),[pending,wait]=useState(null),[error,issue]=useState('')
 useEffect(()=>{let closed=false,t;async function poll(){try{const r=await fetch('/api/pa-zone1',{cache:'no-store',signal:AbortSignal.timeout(4500)});if(!r.ok)throw Error();const v=await r.json();if(!closed)set(v)}catch{if(!closed)set(null)}finally{if(!closed)t=setTimeout(poll,4000)}}poll();return()=>{closed=true;clearTimeout(t)}},[])
 const live=s&&Number.isFinite(s.at)&&Date.now()-s.at<30000,mode=live?['AUTO','MANUAL','OFF'][s.mode]:null
 const busy=pending&&(pending.sending||(Date.now()<pending.until&&s?.revision===pending.rev))
 async function act(action,target){if(!live||busy)return;wait({sending:true});issue('')
 try{const {data}=await supabase.auth.getSession();if(!data.session)throw Error()
 const r=await fetch('/api/pa-zone1',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,target,revision:s.revision})});if(!r.ok)throw Error();wait({rev:s.revision,until:Date.now()+22000})}catch{wait(null);issue('Command not accepted. Refresh and try again.')}}
 return <article aria-label="Zone 1"><header><h2>Zone 1</h2><small>{live?'Online':'Offline'}</small></header>
 <div className="cl-readings"><div><Thermometer color="#dc402b" /><strong>{live?s.temperature.toFixed(1):'—'}°F</strong><small>{live?((s.temperature-32)*5/9).toFixed(1)+' °C':'Temperature'}</small></div>
 <div><Thermometer color="#1677dd" /><strong>{live&&Number.isFinite(s.sensor_2_f)?s.sensor_2_f.toFixed(1):'—'}°F</strong><small>Temperature 2</small></div></div>
 <Target key={live?String(s.target):'offline'} label="Zone 1 target" initial={live?s.target:null} min={40} max={90} disabled={savingTarget||!live||busy||profile?.role!=='admin'} onSave={saveTarget} />
 <div className="cl-switches"><small>Controller settings</small><div role="group" aria-label="Zone 1 mode">{['AUTO','MANUAL','OFF'].map(m=><button key={m} disabled={!live||busy||profile?.role!=='admin'} aria-pressed={mode===m} onClick={()=>act(m)}>{m}</button>)}</div>
 {mode==='MANUAL'&&<div role="group" aria-label="Zone 1 manual heat">{['ON','OFF'].map(x=><button key={x} aria-pressed={s.output===(x==='ON')} disabled={!live||busy||profile?.role!=='admin'||(x==='ON'&&s.fault)} onClick={()=>act('HEAT_'+x)}>HEAT {x}</button>)}</div>}</div>
 <footer><Flame size={18}/><strong className={'cl-heat-state '+(live?(s.output?'is-on':'is-off'):'')}>{live?(s.output?'HEAT ON':'HEAT OFF'):'HEAT —'}</strong> · Mode {mode??'—'}</footer>
 {mode==='AUTO'&&<p className="cl-auto-note">{Number.isFinite(s.target)&&Number.isFinite(s.band)
   ? <>Target <strong>{s.target} °F</strong> · Heat on at or below {+(s.target-s.band/2).toFixed(2)} °F, off at or above {+(s.target+s.band/2).toFixed(2)} °F.</>
   : 'The thermostat switches heat on and off to maintain the target temperature.'}</p>}
 {!user&&<Link to="/login">Sign in to control</Link>}{busy&&<small role="status">Sending…</small>}{error&&<small role="alert">{error}</small>}</article>
}
