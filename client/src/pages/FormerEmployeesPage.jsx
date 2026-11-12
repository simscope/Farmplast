import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { archiveDates, employmentDuration } from '../utils/formerEmployeeDates'
import { supabase } from '../lib/supabase'
import useEmployeeFeatureFlags from '../hooks/useEmployeeFeatureFlags'


export default function FormerEmployeesPage() {
  const { flags, loading: flagsLoading } = useEmployeeFeatureFlags()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [plant, setPlant] = useState('')
  const [position, setPosition] = useState('')
  const [sort, setSort] = useState('employee_number')
  const [direction, setDirection] = useState(1)
  useEffect(() => {
    let cancelled = false
    if (flagsLoading || !flags.former_employees_archive_readonly) { setEmployees([]); return }
    async function load() {
      try {
        // PostgREST's default row cap must not silently truncate the archive.
        const all = []
        for (let start = 0; ; start += 500) {
          const result = await supabase.rpc('list_former_employees',{p_offset:start,p_limit:500})
          if (result.error) throw result.error
          all.push(...(result.data || []))
          if ((result.data || []).length < 500) break
        }
        // Dates are read by permanent UUID; reused numbers never join histories.
        const history = all.length ? await supabase.from('employee_employment_periods')
          .select('id,employee_id,hire_date,termination_date').in('employee_id', all.map(employee => employee.id)) : { data: [] }
        if (history.error) throw history.error
        const dated = await Promise.all(all.map(async employee => {
          const workDates = ascending => supabase.from('employee_work_logs').select('work_date').eq('employee_id', employee.id)
            .or('is_deleted.eq.false,is_deleted.is.null').order('work_date', { ascending }).limit(1)
          const [first, last] = await Promise.all([workDates(true), workDates(false)])
          if (first.error || last.error) throw first.error || last.error
          return archiveDates(employee, history.data || [], first.data?.[0]?.work_date, last.data?.[0]?.work_date)
        }))
        if (!cancelled) setEmployees(dated)
      } catch (err) { if (!cancelled) setError(err.message || 'Failed to load former employees') }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [flagsLoading, flags.former_employees_archive_readonly])
  const rows = useMemo(() => employees.filter(employee => {
    const text = `${employee.employee_number} ${employee.first_name || ''} ${employee.last_name || ''}`.toLowerCase()
    return text.includes(search.trim().toLowerCase()) && (!plant || employee.plant_location === plant) && (!position || employee.position === position)
  }).sort((a, b) => {
    if (sort === 'employee_number') return (a.employee_number - b.employee_number) * direction
    const value = row => sort === 'name' ? `${row.last_name || ''} ${row.first_name || ''}` : String(row[sort] || '')
    return value(a).localeCompare(value(b), undefined, { numeric: true }) * direction
  }), [employees, search, plant, position, sort, direction])
  if (flagsLoading) return <p className="p-6 text-white">Checking archive availability…</p>
  if (!flags.former_employees_archive_readonly) return <div className="p-6 text-white"><p>Former Employees archive is disabled.</p><Link to="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500"><ArrowLeft size={16} />Back</Link></div>
  return <div className="min-h-screen bg-[#020817] text-white"><main className="mx-auto max-w-[1800px] px-3 py-6 sm:px-6">
    <Link to="/dashboard" className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500"><ArrowLeft size={16} />Back</Link>
    <h1 className="text-2xl font-bold">Former Employees</h1>
    <p className="my-3 text-slate-300">{loading ? 'Loading…' : `${employees.length} Former Employees · ${rows.length} shown`}</p>
    <div className="mb-4 flex flex-wrap gap-3">
      <input aria-label="Search former employees" placeholder="Name or employee number" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 w-full sm:w-auto sm:flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2" />
      <select aria-label="Plant filter" value={plant} onChange={event => setPlant(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="">All plants</option><option>NJ</option><option>PA</option></select>
      <select aria-label="Position filter" value={position} onChange={event => setPosition(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="">All positions</option>{[...new Set(employees.map(row => row.position).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Sort former employees" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="employee_number">Employee Number</option><option value="name">Name</option><option value="hire_date">Hire Date</option><option value="termination_date">Termination Date</option><option value="last_work_date">Last Work Date</option></select>
      <button className="rounded-lg border border-slate-700 px-3" onClick={() => setDirection(value => -value)}>{direction === 1 ? 'Ascending' : 'Descending'}</button>
    </div>
    {error && <p role="alert" className="my-4 text-red-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900"><table className="w-full text-left text-sm">
      <thead><tr>{['Employee Number','First Name / Last Name','Plant','Position','Hire Date','Termination Date','Employment Duration','Last Work Date','Actions'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
      <tbody>{rows.map(employee => <tr key={employee.id} className="border-t border-slate-700">
        <td className="p-3">{employee.employee_number}</td><td className="p-3">{employee.first_name} {employee.last_name}</td>
        <td className="p-3">{employee.plant_location || 'Not recorded'}</td><td className="p-3">{employee.position || 'Not recorded'}</td>
        <td className="p-3">{employee.hire_date || 'Not recorded'}</td><td className="p-3">{employee.termination_date || 'Not recorded'}{employee.termination_needs_review && <span className="block text-xs text-amber-300">Historical correction needs review</span>}</td>
        <td className="p-3">{employmentDuration(employee)}</td><td className="p-3">{employee.last_work_date || 'Not recorded'}</td>
        <td className="whitespace-nowrap p-3"><Link className="text-cyan-300" to={`/employees/${employee.id}`}>View</Link></td>
      </tr>)}</tbody>
    </table></div>
    {!loading && !error && rows.length === 0 && <p className="mt-4 text-slate-300">No former employees match these filters.</p>}
  </main></div>
}
