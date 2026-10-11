import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'

export default function ZktReviewPage(){
  const [page,setPage]=useState(0)
  const [rows,setRows]=useState([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let cancelled=false
    supabase.from('zkt_identity_review').select('event_id,reason,created_at,zkt_identity_events(device_key,terminal_user_id,local_timestamp,legacy_raw_id,zkt_event_ownership(employee_id))')
      .order('event_id',{ascending:false}).range(page*100,page*100+99).then(result=>{
        if(cancelled)return
        setError(result.error?.message||'');setRows(result.data||[]);setLoading(false)
      }).catch(err=>{if(!cancelled){setError(err.message);setLoading(false)}})
    return()=>{cancelled=true}
  },[page])
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-8">
    <Link to="/employees/former" className="text-cyan-300 underline">Former Employees</Link>
    <h1 className="my-4 text-2xl font-bold">ZKT Attendance Review</h1>
    <p className="mb-4 max-w-3xl text-sm text-slate-300">Uncertain identity, time and payroll events are retained here. Ownership requires independent evidence of the device and its identifier assignment interval. A current employee number is insufficient. Previously owned events keep their owner even when payroll review remains necessary.</p>
    {error&&<p role="alert" className="my-3 text-red-300">{error}</p>}
    {loading?<p role="status">Loading review events…</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{['Event','Device','Terminal ID','Terminal Time','Permanent Owner','Review Reason'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=>{const event=row.zkt_identity_events;const owners=event?.zkt_event_ownership;const owner=Array.isArray(owners)?owners[0]?.employee_id:owners?.employee_id
        return <tr key={row.event_id} className="border-t border-slate-700"><td className="p-2">{row.event_id}</td><td className="p-2">{event?.device_key||'Device evidence required'}</td><td className="p-2">{event?.terminal_user_id||'Unknown'}</td><td className="whitespace-nowrap p-2">{event?.local_timestamp?.replace('T',' ')||'Invalid / missing'}</td><td className="p-2">{owner?<Link to={`/employees/${owner}`} className="text-cyan-300 underline">View owner</Link>:'Unassigned'}</td><td className="min-w-64 p-2">{row.reason}</td></tr>})}</tbody>
    </table>{rows.length===0&&<p className="p-3">No review events on this page.</p>}</div>}
    <div className="mt-4 flex gap-3"><button disabled={loading||page===0} onClick={()=>{setLoading(true);setPage(value=>value-1)}} className="rounded border p-2 disabled:opacity-40">Previous</button><span className="p-2">Page {page+1}</span><button disabled={loading||rows.length<100} onClick={()=>{setLoading(true);setPage(value=>value+1)}} className="rounded border p-2 disabled:opacity-40">Next</button></div>
  </main>
}
