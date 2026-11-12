import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { employmentDuration } from '../utils/formerEmployeeDates'
import { formerPeriods, periodPayments, withinRange } from '../utils/formerEmployeeDetails'
import './FormerEmployeeDetails.css'
const card = 'rounded-xl border border-slate-800 bg-[#0f172a] p-4 sm:p-5'
const input = 'w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white [color-scheme:dark]'
const display = value => value == null || value === '' ? 'Not recorded' : value
const money = value => value == null ? 'Not recorded' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const time = value => {
  if (!value) return '—'
  const match = String(value).match(/^(\d{2}):(\d{2})/)
  return match ? `${Number(match[1]) % 12 || 12}:${match[2]} ${Number(match[1]) >= 12 ? 'PM' : 'AM'}` : value
}
async function readAll(table, employeeId, order) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(table).select('*').eq('employee_id', employeeId).order(order).order('id').range(offset, offset + 499)
    if (result.error) throw result.error
    rows.push(...(result.data || []))
    if ((result.data || []).length < 500) return rows
  }
}
function Information({ label, value }) {
  return <div><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{display(value)}</dd></div>
}
function HistoryTable({ headers, rows, empty }) {
  if (!rows.length) return <p className="py-4 text-sm text-slate-400">{empty}</p>
  return <div className="former-history-table max-h-[26rem] overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{headers.map(label => <th key={label} className="sticky top-0 whitespace-nowrap bg-[#0f172a] px-3 py-3 text-xs font-medium text-slate-400">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-800">{row.cells.map((value, index) => <td key={index} className="whitespace-nowrap px-3 py-3">{value}</td>)}</tr>)}</tbody></table></div>
}
export default function FormerEmployeeDetails({ employee }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(null)
  const [rangeError, setRangeError] = useState('')
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const availability = await supabase.rpc('employee_feature_flags_status')
        if (availability.error) throw availability.error
        if (availability.data?.former_employees_archive_readonly !== true) throw Error('Former Employees archive is disabled.')
        const [periods, logs, payments] = await Promise.all([readAll('employee_employment_periods', employee.id, 'id'), readAll('employee_work_logs', employee.id, 'work_date'), readAll('employee_payments', employee.id, 'period_start')])
        const engagements = formerPeriods(employee, periods, logs)
        const index = engagements.length - 1
        if (!cancelled) {
          setData({ periods: engagements, payments })
          setSelection({ index, start: engagements[index].rangeStart || '', end: engagements[index].rangeEnd || '' })
        }
      } catch (err) { if (!cancelled) setError(err.message || 'Could not load employee history.') }
    }
    load()
    return () => { cancelled = true }
  }, [employee])
  const period = data?.periods[selection?.index]
  const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
  function selectPeriod(index) {
    const next = data.periods[index]
    setSelection({ index, start: next.rangeStart || '', end: next.rangeEnd || '' })
    setRangeError('')
  }
  function selectDate(field, value) {
    const next = { ...selection, [field]: value }
    if (!withinRange(next.start, next.end, period.rangeStart, period.rangeEnd)) { setRangeError('Choose a valid range within this employment period.'); return }
    setRangeError('')
    setSelection(next)
  }
  const logs = period?.logs.filter(row => (!selection.start || row.work_date >= selection.start) && (!selection.end || row.work_date <= selection.end)) || []
  const payments = period ? periodPayments(data.payments, employee.id, period, selection.start, selection.end) : []
  return <div className="former-employee-details min-h-screen bg-[#020817] text-white"><main className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-6">
    <div className="former-print-controls flex items-center gap-2">
    <Link to="/employees/former" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold"><ArrowLeft size={16} />Back</Link>
    {period && !error && <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"><Printer size={16} />Print</button>}
    </div>
    {error ? <p role="alert" className={card + ' text-red-300'}>{error}</p> : !period ? <p className={card}>Loading employee history…</p> : <>
      <section className={card} aria-labelledby="employee-information"><div className="flex items-start gap-4">
        {employee.photo_url && <img src={employee.photo_url} alt={name} className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24" />}
        <div className="min-w-0"><p className="text-xs font-medium text-cyan-300">Former Employee · Read only</p><h1 className="mt-1 break-words text-2xl font-bold">{name}</h1><h2 id="employee-information" className="mt-3 text-sm text-slate-300">Employee Information</h2></div>
      </div><dl className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Information label="Employee Number" value={period.employee_number} /><Information label="First Name" value={employee.first_name} /><Information label="Last Name" value={employee.last_name} />
        <Information label="Plant" value={period.plant_location ?? employee.plant_location} /><Information label="Position" value={period.position ?? employee.position} /><Information label="Hourly Rate" value={money(period.hourly_rate ?? employee.hourly_rate)} />
        {['phone', 'email', 'address'].filter(field => employee[field]).map(field => <Information key={field} label={field[0].toUpperCase() + field.slice(1)} value={employee[field]} />)}
      </dl></section>
      <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Employment Period</h2>
        {data.periods.length > 1 && <label className="former-print-controls text-sm text-slate-300">Period<select aria-label="Employment period" className={input} value={selection.index} onChange={event => selectPeriod(Number(event.target.value))}>{data.periods.map((item, index) => <option key={item.id} value={index}>{display(item.hire_date)} → {display(item.termination_date)}</option>)}</select></label>}
      </div><dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><Information label="Hire Date" value={period.hire_date} /><Information label="Termination Date" value={period.termination_date} /><Information label="Employment Duration" value={employmentDuration(period)} /></dl>
      {(!period.hire_date || !period.termination_date) && <p className="mt-4 text-sm text-slate-400">Employment dates are incomplete. Available historical records are shown below.</p>}</section>
      <section className={card}><div className="flex flex-wrap items-end justify-between gap-4"><h2 className="font-semibold">Work History</h2><div className="former-print-controls grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">{['start', 'end'].map(field => <label key={field} className="text-xs text-slate-400">{field === 'start' ? 'From' : 'To'}<input aria-label={field === 'start' ? 'Date range start' : 'Date range end'} type="date" className={input + ' mt-1'} min={field === 'end' ? selection.start || period.rangeStart || undefined : period.rangeStart || undefined} max={field === 'start' ? selection.end || period.rangeEnd || undefined : period.rangeEnd || undefined} value={selection[field]} disabled={!period.rangeStart || !period.rangeEnd} onChange={event => selectDate(field, event.target.value)} /></label>)}</div></div>
        {rangeError && <p role="alert" className="former-print-controls mt-3 text-sm text-amber-300">{rangeError}</p>}
        <p className="former-print-range">Selected dates: {display(selection.start)} → {display(selection.end)}</p>
        <HistoryTable headers={['Date', 'IN', 'OUT', 'Lunch (h)', 'Downtime (h)', 'Work Hours']} empty="No work records in this period." rows={logs.map(row => ({ id: row.id, cells: [row.work_date, time(row.time_in), time(row.time_out), row.lunch_hours ?? '—', row.downtime_hours ?? '—', row.reg_hours ?? '—'] }))} />
        <h3 className="mt-5 border-t border-slate-800 pt-4 font-semibold">Payroll History</h3>
        <HistoryTable headers={['Period', 'Paid At', 'Gross Pay', 'Net Pay']} empty="No saved payroll records in this period." rows={payments.map(row => ({ id: row.id, cells: [`${row.period_start} → ${row.period_end}`, row.paid_at?.slice(0, 10) || '—', money(row.total_labor ?? row.gross_pay), money(row.net_pay)] }))} />
      </section>
    </>}
  </main></div>
}
