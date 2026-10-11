import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useEmployeeFeatureFlags from '../hooks/useEmployeeFeatureFlags'

function duration(employee) {
  if (!employee.hire_date || !employee.termination_date) return 'Not recorded'
  const days = Math.round((Date.parse(employee.termination_date) - Date.parse(employee.hire_date)) / 86400000) + 1
  return Number.isFinite(days) && days > 0 ? `${days} days` : 'Not recorded'
}

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
        // Query real work dates by UUID, never by employee number.
        for (const employee of all) {
          const result = await supabase.from('employee_work_logs').select('work_date').eq('employee_id', employee.id)
            .or('is_deleted.eq.false,is_deleted.is.null').order('work_date', { ascending: false }).limit(1)
          if (result.error) throw result.error
          employee.last_work_date = result.data?.[0]?.work_date || null
        }
        if (!cancelled) setEmployees(all)
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
  if (!flags.former_employees_archive_readonly) return <div className="p-6 text-white"><p>Former Employees archive is disabled.</p><Link to="/employees" className="text-cyan-300">Employees</Link></div>
  return <div className="min-h-screen bg-[#020817] text-white"><main className="mx-auto max-w-[1800px] px-3 py-6 sm:px-6">
    <nav className="mb-4 flex gap-4"><Link to="/dashboard" className="text-cyan-300">Dashboard</Link><Link to="/employees" className="text-cyan-300">Employees</Link></nav>
    <h1 className="text-2xl font-bold">Former Employees</h1>
    <p className="my-3 text-slate-300">{loading ? 'Loading…' : `${employees.length} Former Employees · ${rows.length} shown`}</p>
    <div className="mb-4 flex flex-wrap gap-3">
      <input aria-label="Search former employees" placeholder="Name or original employee number" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 w-full sm:w-auto sm:flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2" />
      <select aria-label="Plant filter" value={plant} onChange={event => setPlant(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="">All plants</option><option>NJ</option><option>PA</option></select>
      <select aria-label="Position filter" value={position} onChange={event => setPosition(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="">All positions</option>{[...new Set(employees.map(row => row.position).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Sort former employees" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg bg-slate-900 p-2"><option value="employee_number">Original Number</option><option value="name">Name</option><option value="hire_date">Hire Date</option><option value="termination_date">Termination Date</option><option value="last_work_date">Last Work Date</option></select>
      <button className="rounded-lg border border-slate-700 px-3" onClick={() => setDirection(value => -value)}>{direction === 1 ? 'Ascending' : 'Descending'}</button>
    </div>
    {error && <p role="alert" className="my-4 text-red-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900"><table className="w-full text-left text-sm">
      <thead><tr>{['Original Employee Number','First Name / Last Name','Department','Plant','Position','Hire Date','Termination Date','Employment Duration','Last Work Date','Status','Actions'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
      <tbody>{rows.map(employee => <tr key={employee.id} className="border-t border-slate-700">
        <td className="p-3">{employee.employee_number}</td><td className="p-3">{employee.first_name} {employee.last_name}</td>
        <td className="p-3">Not stored</td><td className="p-3">{employee.plant_location || 'Not recorded'}</td><td className="p-3">{employee.position || 'Not recorded'}</td>
        <td className="p-3">{employee.hire_date || 'Not recorded'}</td><td className="p-3">{employee.termination_date || 'Not recorded'}</td>
        <td className="p-3">{duration(employee)}</td><td className="p-3">{employee.last_work_date || 'Not recorded'}</td>
        <td className="p-3">{employee.termination_date ? 'Terminated' : 'Inactive'}</td>
        <td className="whitespace-nowrap p-3"><Link className="text-cyan-300" to={`/employees/${employee.id}`}>View</Link>{flags.employee_rehire&&<Link className="ml-4 text-cyan-300" to={`/employees/${employee.id}#employment-history`}>Rehire</Link>}</td>
      </tr>)}</tbody>
    </table></div>
    {!loading && !error && rows.length === 0 && <p className="mt-4 text-slate-300">No former employees match these filters.</p>}
  </main></div>
}
