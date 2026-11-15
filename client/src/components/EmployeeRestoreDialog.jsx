import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function EmployeeRestoreDialog({ employee, onClose, onRestored }) {
  const [preview, setPreview] = useState(null)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ')

  useEffect(() => {
    let cancelled = false
    const previousFocus = document.activeElement
    dialog.current?.focus()
    supabase.rpc('preview_restore_former_employee', { p_employee_id: employee.id })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError) throw Error(rpcError.message)
        setPreview(data)
        setDate(data.today || '')
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not check employee number') })
    return () => { cancelled = true; previousFocus?.focus() }
  }, [employee.id])

  async function submit(event) {
    event.preventDefault()
    if (!preview || !date || saving) return
    if (preview.earliest_date && date < preview.earliest_date) {
      setError('Rehire date must follow the last work or termination date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('restore_former_employee', {
        p_employee_id: employee.id,
        p_date: date,
      })
      if (rpcError) throw Error(rpcError.message)
      if (!data?.employee_id) throw Error('Restore was not confirmed. Refresh the archive.')
      onRestored(data)
    } catch (err) {
      setError(err.message || 'Failed to restore employee')
    } finally {
      setSaving(false)
    }
  }

  function keyDown(event) {
    if (event.key === 'Escape' && !saving) onClose()
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled])')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus()
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" onKeyDown={keyDown}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby="employee-restore-title"
      className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#07111f] p-5 text-white shadow-2xl">
      <h2 id="employee-restore-title" className="text-xl font-bold">Restore employee</h2>
      <div className="mt-4 flex items-center gap-4">
        {employee.photo_url
          ? <img src={employee.photo_url} alt={name} className="h-20 w-20 rounded-xl object-cover" />
          : <div aria-label="No saved photo" className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-800 text-xs text-slate-400">No photo</div>}
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-slate-300">Original #{employee.employee_number} · {employee.plant_location}</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {!preview && !error && <p role="status" className="mt-4 text-sm text-slate-300">Checking number availability…</p>}
      {preview && <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">
          <p>Proposed employee number: <strong>#{preview.proposed_number}</strong> ({preview.plant_location})</p>
          <p className="mt-1 text-slate-300">{preview.previous_number_available
            ? 'Original number is available and will be restored.'
            : 'Original number is occupied or outside this plant range. A free number will be assigned.'}</p>
          <p className="mt-2 text-xs text-slate-400">Number availability is checked again when you confirm.</p>
        </div>
        <label className="block text-sm" htmlFor="employee-rehire-date">Rehire date
          <input id="employee-rehire-date" type="date" required value={date}
            min={preview.earliest_date || undefined} max={preview.today || undefined}
            onChange={event => setDate(event.target.value)} disabled={saving}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 [color-scheme:dark]" />
        </label>
        {preview.earliest_date && <p className="text-xs text-slate-400">Earliest permitted date: {preview.earliest_date}</p>}
        <p className="text-sm text-slate-300">The same employee record, saved photo and historical hours/payroll will be preserved. A new employment period starts on the selected date.</p>
        <p className="text-xs text-amber-200">ZKT access stays disabled until the terminal identity is verified. SACS activation is queued separately.</p>
        <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !date || (preview.earliest_date && date < preview.earliest_date)}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? 'Restoring…' : 'Confirm restore'}</button>
        </div>
      </form>}
      {!preview && <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Close</button></div>}
    </section>
  </div>
}
