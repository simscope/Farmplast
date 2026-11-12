import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deliverEmployeeIntegrations } from '../utils/deliverEmployeeIntegrations'
import { terminateEmployee, terminationBlockers } from '../utils/terminateEmployee'

export default function EmployeeTerminationDialog({ employee, onClose, onArchived }) {
  const [preview, setPreview] = useState(null)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef(null)
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ')
  useEffect(() => {
    const previouslyFocused = document.activeElement
    dialog.current?.focus()
    let cancelled = false
    supabase.rpc('employee_termination_preview', { p_employee_id: employee.id }).then(({ data, error }) => {
      if (cancelled) return
      if (error) throw Error(error.message)
      setPreview(data); setDate(data.last_work_date || '')
    }).catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true; previouslyFocused?.focus() }
  }, [employee.id])
  const blockers = preview ? terminationBlockers(preview) : []
  function keyDown(event) {
    if (event.key === 'Escape' && !saving) onClose()
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus() }
  }
  async function submit(event) {
    event.preventDefault()
    if (!preview || blockers.length) return
    if (preview.last_work_date && date < preview.last_work_date) { setError('Work history exists after this date. Choose the actual last working day.'); return }
    setSaving(true); setError('')
    try {
      const result = await terminateEmployee({ client: supabase, employeeId: employee.id, date, reason,
        deliver: id => deliverEmployeeIntegrations(id, { getSession: () => supabase.auth.getSession() }) })
      const notice = `Employee #${employee.employee_number} moved to Former Employees. Work and payroll history are preserved. ${result.sacsConfirmed ? 'SACS deactivation confirmed.' : 'SACS synchronization is pending.'} Terminal deactivation is tracked separately.`
      await onArchived(notice)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" onKeyDown={keyDown}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="employee-termination-title" className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#07111f] p-5 text-white shadow-2xl">
      <h2 id="employee-termination-title" className="text-lg font-bold">Terminate employee</h2>
      <p className="mt-2 font-semibold">#{employee.employee_number} · {name}</p>
      <p className="mt-2 text-sm text-slate-300">Move this employee to the read-only archive. Existing work hours and payroll history will be kept.</p>
      <p className="mt-2 text-xs text-slate-400">This action changes employment status only. Save any other profile edits first.</p>
      {!preview && !error && <p role="status" className="mt-4 text-sm">Checking employment and work history…</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {blockers.length > 0 && <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-amber-200">{blockers.map(text => <li key={text}>{text}</li>)}</ul>}
      {blockers.length > 0 && <a className="mt-3 inline-block text-sm text-cyan-300 underline" href={`/employees/${employee.id}`}>Open employee work log and payroll</a>}
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div><label htmlFor="employee-termination-date" className="mb-1 block text-sm">Last working day</label>
          <input id="employee-termination-date" type="date" required min={preview?.hire_date || undefined} max={preview?.today || undefined} value={date} onChange={e => setDate(e.target.value)} disabled={!preview || saving} className="w-full rounded-lg border border-slate-700 bg-[#08101c] p-2 text-white [color-scheme:dark]" />
          {preview && !preview.last_work_date && <p className="mt-1 text-xs text-slate-400">No recorded working day. Enter the actual last working day.</p>}
        </div>
        <div><label htmlFor="employee-termination-reason" className="mb-1 block text-sm">Reason (optional)</label>
          <textarea id="employee-termination-reason" value={reason} onChange={e => setReason(e.target.value)} disabled={saving} rows={2} className="w-full rounded-lg border border-slate-700 bg-[#08101c] p-2" />
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !preview || !date || blockers.length > 0} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? 'Archiving…' : 'Confirm termination'}</button>
        </div>
      </form>
    </section>
  </div>
}
