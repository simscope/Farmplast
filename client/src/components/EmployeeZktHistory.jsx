import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../context/useAuth'
import {Link} from 'react-router-dom'
export default function EmployeeZktHistory({employeeId}){
  const {profile}=useAuth()
  const [rows,setRows]=useState([])
  const [error,setError]=useState('')
  const [identityReady,setIdentityReady]=useState(false)
  useEffect(()=>{
    let cancelled=false
    if(!employeeId||profile?.role!=='admin')return
    async function load(){
      const all=[]
      try{
        const capabilities=await supabase.rpc('employee_archive_capabilities')
        if(capabilities.error)throw capabilities.error
        if(capabilities.data?.identity!==true){if(!cancelled){setRows([]);setIdentityReady(false)}return}
        if(!cancelled)setIdentityReady(true)
        for(let start=0;;start+=500){
          const result=await supabase.from('zkt_event_ownership').select('event_id,zkt_identity_events(device_key,local_timestamp,raw),zkt_identifier_history(period_id)')
            .eq('employee_id',employeeId).order('event_id',{ascending:false}).range(start,start+499)
          if(result.error)throw result.error
          all.push(...(result.data||[]));if((result.data||[]).length<500)break
        }
        if(!cancelled)setRows(all)
      }catch(err){if(!cancelled)setError(err.message)}
    }
    load();return()=>{cancelled=true}
  },[employeeId,profile?.role])
  if(profile?.role!=='admin')return null
  return <section className="my-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
    <h2 className="font-bold">Attendance Events · {rows.length}</h2>
    <p className="my-2 text-xs text-slate-400">Events with verified permanent ownership. Historical work logs remain in Payroll History. Unresolved events are retained for administrator review.</p>
    {identityReady ? <Link to="/employees/zkt-review" className="text-cyan-300 underline">Review unresolved ZKT events</Link> : <p className="mt-2 text-sm text-slate-300">Verified device identity history is not enabled. Existing Attendance remains available in Work Logs.</p>}
    {error&&<p role="alert" className="my-2 text-amber-200">{error}</p>}
    <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Device','Terminal Time','Punch','Employment Period'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=>{const e=row.zkt_identity_events;return <tr key={row.event_id} className="border-t border-slate-700"><td className="p-2">{e.device_key||'Confirmed legacy device'}</td><td className="p-2 whitespace-nowrap">{e.local_timestamp?.replace('T',' ')}</td><td className="p-2">{({0:'Clock In',1:'Clock Out'})[e.raw.inOutMode]||`Punch mode ${e.raw.inOutMode??'unknown'} (review)`}</td><td className="p-2">{row.zkt_identifier_history.period_id}</td></tr>})}</tbody>
    </table></div>
  </section>
}
