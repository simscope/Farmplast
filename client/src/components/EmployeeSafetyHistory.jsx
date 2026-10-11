import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {useAuth} from '../context/useAuth'

export default function EmployeeSafetyHistory({employeeId}){
  const {profile}=useAuth()
  const [history,setHistory]=useState(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [offset,setOffset]=useState(0)
  useEffect(()=>{
    let cancelled=false
    if(!employeeId||profile?.role!=='admin')return
    async function load(){
      setBusy(true);setError('')
      try{
        const session=await supabase.auth.getSession()
        const token=session.data?.session?.access_token
        if(!token)throw Error('Sign in to view safety history')
        const response=await fetch('/api/employee-safety-history',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({employee_id:employeeId,offset})})
        const data=await response.json()
        if(!response.ok)throw Error(data.error==='sacs_history_not_configured'?'SACS history connection is not configured.': 'SACS history is temporarily unavailable. Retry after the connection is restored.')
        if(!cancelled)setHistory(previous=>offset===0?data:{...data,records:[...(previous?.records||[]),...data.records],assignments:[...(previous?.assignments||[]),...data.assignments]})
      }catch(err){if(!cancelled)setError(err.message)}
      finally{if(!cancelled)setBusy(false)}
    }
    load();return ()=>{cancelled=true}
  },[employeeId,profile?.role,offset])
  if(profile?.role!=='admin')return null
  const assignments=history?[...history.assignments,...history.group_assignments]:[]
  return <section className="my-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
    <h2 className="font-bold">Safety / SACS History</h2>
    {error&&<p role="alert" className="mt-3 text-amber-200">{error}</p>}
    {busy&&<p className="mt-3">Loading safety history…</p>}
    {history&&<>
      <h3 className="mt-4 font-semibold">Safety Assignments</h3>
      <p className="my-2 text-xs text-slate-400">One-time assignment history and current group assignments retained by SACS.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Training / Check','Assigned','Completion Date','Status'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{assignments.map(row=><tr key={row.id} className="border-t border-slate-700"><td className="p-2">{row.title||'Mixed training'}</td><td className="p-2">{row.assigned_at?.slice(0,10)||'—'}</td><td className="p-2">{row.completed_at?.slice(0,10)||'—'}</td><td className="p-2">{row.status}</td></tr>)}</tbody></table></div>
      {assignments.length===0&&<p className="mt-2 text-sm text-slate-400">No stored assignments.</p>}
      <h3 className="mt-4 font-semibold">Safety Check Records / Completed Training</h3>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Training / Check','Session Date','Completion Date','Status','Score'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{history.records.map(row=><tr key={row.id} className="border-t border-slate-700"><td className="p-2">{row.title}</td><td className="p-2">{row.session_date}</td><td className="p-2">{row.completed_at?.slice(0,10)||'—'}</td><td className="p-2">{row.status}</td><td className="p-2">{row.score??'—'}</td></tr>)}</tbody></table></div>
      {history.records.length===0&&<p className="mt-2 text-sm text-slate-400">No stored safety sessions.</p>}
      {history.next_offset!==null&&<button disabled={busy} onClick={()=>setOffset(history.next_offset)} className="mt-3 rounded border border-slate-600 px-3 py-2">Load more history</button>}
    </>}
  </section>
}
