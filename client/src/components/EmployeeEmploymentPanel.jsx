import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'

export default function EmployeeEmploymentPanel({ employee, onChanged }) {
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
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    if (!employee?.id || !isAdmin) return
    setReady(false)
    Promise.all([
      supabase.from('employee_employment_periods').select('*').eq('employee_id', employee.id).order('id'),
      supabase.rpc('employee_lifecycle_blockers'),
    ]).then(([history, readiness]) => {
      if (cancelled) return
      if (history.error || readiness.error) {
        setError(history.error?.message || readiness.error?.message)
        return
      }
      setPeriods(history.data || [])
      setBlockers(readiness.data || [])
      setError('')
      setReady(true)
    }).catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [employee?.id, employee?.active, isAdmin])

  if (!employee || !isAdmin) return null

  async function submit(event) {
    event.preventDefault()
    if (!window.confirm(`${action === 'terminate' ? 'Terminate' : 'Rehire'} ${employee.first_name} ${employee.last_name} on ${date}? Employment and payroll history will be retained.`)) return
    setBusy(true)
    setError('')
    try {
      const result = await supabase.rpc('change_employee_employment', {
        p_employee_id: employee.id, p_action: action, p_date: date,
        p_reason: reason || null, p_notes: notes || null,
      })
      if (result.error) throw result.error
      setAction('')
      await onChanged?.()
    } catch (err) { setError(err.message || 'Employment change failed') }
    finally { setBusy(false) }
  }

  return <section className="my-4 rounded-xl border border-slate-700 bg-slate-900 p-4 no-print">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-bold">Employment history · {employee.active === true ? 'Active' : 'Former Employee'}</h2>
      <button type="button" disabled={!ready || busy || blockers.length > 0}
        className="rounded-lg border border-cyan-500 px-3 py-2 disabled:opacity-40"
        onClick={() => { setAction(employee.active === true ? 'terminate' : 'rehire'); setDate(''); setReason(''); setNotes('') }}>
        {employee.active === true ? 'Terminate Employee' : 'Rehire'}
      </button>
    </div>
    {employee.active !== true && <p className="mt-2 text-sm text-slate-300">Original Employee Number: {employee.employee_number} · Termination Date: {employee.termination_date || 'Not recorded'}</p>}
    {employee.termination_reason && <p className="mt-2">Reason: {employee.termination_reason}</p>}
    {employee.termination_notes && <p className="mt-2 whitespace-pre-wrap">Notes: {employee.termination_notes}</p>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
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
      <label className="grid gap-1">{action === 'terminate' ? 'Termination Date' : 'New Hire Date'}<input required type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>
      {action === 'terminate' && <label className="grid gap-1">Reason (optional)<input value={reason} onChange={event => setReason(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>}
      <label className="grid gap-1">Notes (optional)<textarea value={notes} onChange={event => setNotes(event.target.value)} className="rounded border border-slate-600 bg-slate-950 p-2" /></label>
      <button disabled={busy} className="rounded bg-cyan-700 px-4 py-2">{busy ? 'Saving…' : 'Review and confirm'}</button>
      <button type="button" disabled={busy} onClick={() => setAction('')} className="rounded border border-slate-600 px-4 py-2">Cancel</button>
    </form>}
  </section>
}
