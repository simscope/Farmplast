import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import useEmployeeFeatureFlags from '../hooks/useEmployeeFeatureFlags'

export default function EmployeeEmploymentPanel({ employee, onChanged }) {
  const { flags } = useEmployeeFeatureFlags()
  const { profile } = useAuth()
  const [periods, setPeriods] = useState([])
  const [blockers, setBlockers] = useState([])
  const [action, setAction] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [lifecycleReady, setLifecycleReady] = useState(false)
  const [operations, setOperations] = useState([])
  const [reservations, setReservations] = useState([])
  const [suggestion, setSuggestion] = useState(null)
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const isAdmin = profile?.role === 'admin'
  const actionEnabled = employee?.active===true ? flags.employee_terminate : flags.employee_rehire

  useEffect(() => {
    let cancelled = false
    if (!employee?.id || !isAdmin || !flags.former_employees_archive_readonly) return
    setReady(false)
    supabase.rpc('employee_archive_capabilities').then(capabilities => {
      if(capabilities.error)throw capabilities.error
      const lifecycle=capabilities.data?.lifecycle===true
      if (!cancelled) setLifecycleReady(lifecycle)
      return Promise.all([
      supabase.from('employee_employment_periods').select('*').eq('employee_id', employee.id).order('id'),
      supabase.rpc('employee_lifecycle_blockers'),
      lifecycle ? supabase.from('employee_integration_operations').select('id,period_id,action,target,status,error,finished_at').eq('employee_id',employee.id).order('period_id') : Promise.resolve({data:[]}),
      lifecycle ? supabase.from('employee_number_reservations').select('period_id,employee_number,released_at').eq('employee_id',employee.id) : Promise.resolve({data:[]}),
      ])
    }).then(([history, readiness, jobs, numbers]) => {
      if (cancelled) return
      if (history.error || readiness.error || jobs.error || numbers.error) {
        setError(history.error?.message || readiness.error?.message || jobs.error?.message || numbers.error?.message)
        return
      }
      setPeriods(history.data || [])
      setBlockers(readiness.data || [])
      setOperations(jobs.data || [])
      setReservations(numbers.data || [])
      setError('')
      setReady(true)
    }).catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [employee?.id, employee?.active, isAdmin, refresh, flags.former_employees_archive_readonly])

  if (!employee || !isAdmin || !flags.former_employees_archive_readonly) return null

  async function deliverIntegrations() {
    const session=await supabase.auth.getSession()
    const response=await fetch('/api/employee-integrations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data?.session?.access_token}`},body:JSON.stringify({employee_id:employee.id})})
    if(!response.ok)throw Error('Profile saved. SACS delivery is pending; the employee number remains protected.')
    const result=await response.json()
    if(result.results.some(row=>row.status!=='succeeded'))throw Error('Profile saved. SACS acknowledgement is pending or uncertain; review integration status before retrying.')
  }
  async function openAction() {
    if (!actionEnabled) return
    setAction(employee.active === true?'terminate':'rehire');setDate('');setReason('');setNotes('');setError('')
    if(employee.active!==true){
      const result=await supabase.rpc('next_available_employee_number')
      if(result.error)setError(result.error.message);else setSuggestion(result.data)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (action==='reconcile' ? !flags.employee_terminate : !actionEnabled) return
    if (!window.confirm(`${action === 'reconcile' ? 'Record confirmed termination date for' : action === 'terminate' ? 'Terminate' : 'Rehire'} ${employee.first_name} ${employee.last_name} on ${date}? Employment and payroll history will be retained.`)) return
    setBusy(true)
    setError('')
    try {
      const result = action==='reconcile' ? await supabase.rpc('reconcile_legacy_termination',{p_employee_id:employee.id,p_date:date,p_evidence:notes}) : await supabase.rpc('change_employee_employment', {
        p_employee_id: employee.id, p_action: action, p_date: date,
        p_reason: reason || null, p_notes: notes || null,
      })
      if (result.error) throw result.error
      setAction('')
      setNotice('Profile saved. Device acknowledgements and number reservation are tracked below.')
      if(action!=='reconcile')try{await deliverIntegrations()}catch(err){setNotice(err.message)}
      await onChanged?.()
    } catch (err) { setError(err.message || 'Employment change failed') }
    finally { setRefresh(value=>value+1); setBusy(false) }
  }

  return <section className="my-4 rounded-xl border border-slate-700 bg-slate-900 p-4 no-print">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-bold">Employment history · {employee.active === true ? 'Active' : 'Former Employee'}</h2>
      <button type="button" disabled={!actionEnabled || !ready || busy || blockers.length > 0}
        className="rounded-lg border border-cyan-500 px-3 py-2 disabled:opacity-40"
        onClick={openAction}>
        {employee.active === true ? 'Terminate Employee' : 'Rehire'}
      </button>
    </div>
    {employee.active !== true && <p className="mt-2 text-sm text-slate-300">Original Employee Number: {employee.employee_number} · Termination Date: {employee.termination_date || 'Not recorded'}</p>}
    {employee.termination_reason && <p className="mt-2">Reason: {employee.termination_reason}</p>}
    {employee.termination_notes && <p className="mt-2 whitespace-pre-wrap">Notes: {employee.termination_notes}</p>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-3 text-amber-200">{notice}</p>}
    {flags.employee_terminate&&lifecycleReady&&employee.active!==true&&!employee.termination_date&&<button className="mt-3 rounded border border-slate-600 px-3 py-2" onClick={()=>{setAction('reconcile');setDate('');setNotes('')}}>Record confirmed termination date</button>}
    {reservations.length>0&&<p className="mt-3 text-sm text-slate-300">Number reservations: {reservations.map(row=>`#${row.employee_number} — ${row.released_at?'device release confirmed':'reserved'}`).join(' · ')}. Reuse remains subject to the release gate.</p>}
    {operations.length>0&&<div className="mt-3 overflow-x-auto"><h3 className="font-semibold">Integration status</h3><table className="w-full text-left text-sm"><thead><tr>{['Period','System','Action','Status','Details'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{operations.map(job=><tr key={job.id} className="border-t border-slate-700"><td className="p-2">{job.period_id}</td><td className="p-2">{job.target}</td><td className="p-2">{job.action}</td><td className="p-2">{job.status}</td><td className="p-2">{job.error||job.finished_at||'Awaiting acknowledgement'}</td></tr>)}</tbody></table>
      <button type="button" disabled={busy||(!flags.employee_terminate&&!flags.employee_rehire)} className="mt-2 rounded border border-slate-600 px-3 py-2" onClick={async()=>{
        setBusy(true);try{const result=await supabase.rpc('retry_employee_integrations',{p_employee_id:employee.id});if(result.error)throw result.error;await deliverIntegrations();await onChanged?.()}catch(err){setNotice(err.message)}finally{setRefresh(value=>value+1);setBusy(false)}
      }}>Retry pending integrations</button></div>}
    {blockers.length > 0 && <div className="mt-3 text-sm text-amber-200">
      <p>Employment changes are awaiting integration verification. Employee numbers remain reserved.</p>
      <ul className="mt-2 list-disc pl-5">{blockers.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{['Original Number', 'Hire Date', 'Termination Date', 'Position', 'Plant', 'Hourly Rate', 'Reason / Notes'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
      <tbody>{periods.map(period => <tr key={period.id} className="border-t border-slate-700">
        <td className="p-2">{period.employee_number}</td><td className="p-2">{period.hire_date || 'Not recorded'}</td>
        <td className="p-2">{period.termination_date || (period.legacy_inactive ? 'Not recorded' : 'Current')}</td>
        <td className="p-2">{period.position || '—'}</td><td className="p-2">{period.plant_location || '—'}</td>
        <td className="p-2">{period.hourly_rate ?? '—'}</td><td className="p-2 whitespace-pre-wrap">{[period.termination_reason, period.notes].filter(Boolean).join(' · ') || '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {action && <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
      {action==='rehire'&&suggestion!==null&&<p>Suggested Employee Number: {suggestion}. Final number is reserved when saved.</p>}
      <label className="grid gap-1">{action === 'rehire' ? 'New Hire Date' : 'Termination Date'}<input required type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>
      {action === 'terminate' && <label className="grid gap-1">Reason (optional)<input value={reason} onChange={event => setReason(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>}
      <label className="grid gap-1">{action==='reconcile'?'Evidence (required)':'Notes (optional)'}<textarea required={action==='reconcile'} value={notes} onChange={event => setNotes(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>
      <button disabled={busy} className="rounded bg-cyan-700 px-4 py-2">{busy ? 'Saving…' : 'Review and confirm'}</button>
      <button type="button" disabled={busy} onClick={() => setAction('')} className="rounded border border-slate-600 px-4 py-2">Cancel</button>
    </form>}
  </section>
}
