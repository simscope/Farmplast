import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Activity,
  ArrowRight,
  Phone,
  Mail,
  Briefcase,
  DollarSign,
  CheckCircle2,
  XCircle,
  X,
  Users,
  Hash,
  User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const cardClass =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-cyan-500'

function EmployeeModal({
  open,
  onClose,
  onSave,
  form,
  setForm,
  saving,
  isEditing,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {isEditing ? 'Edit employee' : 'Add employee'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Employee card with number, name, contacts, position, rate and status
            </p>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-6 px-6 py-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Employee number
              </label>
              <input
                type="number"
                className={inputClass}
                value={form.employee_number}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    employee_number: e.target.value,
                  }))
                }
                placeholder="Employee number"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                First name
              </label>
              <input
                className={inputClass}
                value={form.first_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, first_name: e.target.value }))
                }
                placeholder="First name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Last name
              </label>
              <input
                className={inputClass}
                value={form.last_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, last_name: e.target.value }))
                }
                placeholder="Last name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Phone</label>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="Phone number"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Position
              </label>
              <input
                className={inputClass}
                value={form.position}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, position: e.target.value }))
                }
                placeholder="worker"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Hourly rate
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, hourly_rate: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Status</label>
              <select
                className={inputClass}
                value={form.active ? 'true' : 'false'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    active: e.target.value === 'true',
                  }))
                }
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-white transition hover:border-slate-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { signOut } = useAuth()

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const emptyForm = {
    id: null,
    employee_number: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    position: 'worker',
    hourly_rate: '',
    active: true,
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const isEditing = Boolean(form.id)

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('employees')
        .select(
          'id, employee_number, first_name, last_name, phone, email, position, hourly_rate, active, created_at'
        )
        .order('created_at', { ascending: false })

      if (error) throw error

      setEmployees(data || [])
    } catch (err) {
      console.error('loadEmployees error:', err)
      setError(err.message || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setForm({
      id: null,
      employee_number: '',
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      position: 'worker',
      hourly_rate: '',
      active: true,
    })
    setModalOpen(true)
  }

  function openEditModal(employee) {
    setForm({
      id: employee.id,
      employee_number:
        employee.employee_number === null || employee.employee_number === undefined
          ? ''
          : employee.employee_number,
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      position: employee.position || 'worker',
      hourly_rate:
        employee.hourly_rate === null || employee.hourly_rate === undefined
          ? ''
          : employee.hourly_rate,
      active: employee.active ?? true,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setForm(emptyForm)
  }

  async function handleSave(e) {
    e.preventDefault()

    if (form.employee_number === '' || Number.isNaN(Number(form.employee_number))) {
      setError('Employee number is required')
      return
    }

    if (!form.first_name.trim()) {
      setError('First name is required')
      return
    }

    try {
      setSaving(true)
      setError('')

      const payload = {
        employee_number: Number(form.employee_number),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        position: form.position.trim() || 'worker',
        hourly_rate:
          form.hourly_rate === '' || form.hourly_rate === null
            ? null
            : Number(form.hourly_rate),
        active: Boolean(form.active),
      }

      if (form.id) {
        const { error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', form.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(payload)

        if (error) throw error
      }

      closeModal()
      await loadEmployees()
    } catch (err) {
      console.error('handleSave error:', err)
      setError(err.message || 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    const ok = window.confirm('Delete this employee?')
    if (!ok) return

    try {
      setError('')

      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error

      await loadEmployees()
    } catch (err) {
      console.error('handleDelete error:', err)
      setError(err.message || 'Failed to delete employee')
    }
  }

  async function toggleActive(employee) {
    try {
      setError('')

      const { error } = await supabase
        .from('employees')
        .update({ active: !employee.active })
        .eq('id', employee.id)

      if (error) throw error

      await loadEmployees()
    } catch (err) {
      console.error('toggleActive error:', err)
      setError(err.message || 'Failed to update status')
    }
  }

  async function handleLogout() {
    await signOut()
  }

  function getFullName(employee) {
    return [employee.first_name, employee.last_name].filter(Boolean).join(' ') || '—'
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees

    return employees.filter((employee) => {
      const fullName = [employee.first_name, employee.last_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return (
        String(employee.employee_number || '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (employee.first_name || '').toLowerCase().includes(q) ||
        (employee.last_name || '').toLowerCase().includes(q) ||
        (employee.phone || '').toLowerCase().includes(q) ||
        (employee.email || '').toLowerCase().includes(q) ||
        (employee.position || '').toLowerCase().includes(q)
      )
    })
  }, [employees, search])

  const stats = useMemo(() => {
    const total = employees.length
    const active = employees.filter((e) => e.active).length
    const inactive = employees.filter((e) => !e.active).length

    const rates = employees
      .map((e) => Number(e.hourly_rate))
      .filter((n) => !Number.isNaN(n) && n > 0)

    const avgRate = rates.length
      ? (rates.reduce((sum, value) => sum + value, 0) / rates.length).toFixed(2)
      : '0.00'

    return { total, active, inactive, avgRate }
  }, [employees])

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className={`${cardClass} mb-6 overflow-hidden`}>
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-3xl bg-cyan-500/10 p-4 text-cyan-400">
                <LayoutDashboard size={32} />
              </div>

              <div>
                <h1 className="text-3xl font-bold text-white">Employees Dashboard</h1>
                <p className="mt-2 max-w-2xl text-slate-400">
                  Employees only. Add, edit, activate, deactivate and delete workers.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadEmployees}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-white transition hover:border-cyan-500"
              >
                <RefreshCw size={18} />
                Refresh
              </button>

              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500"
              >
                <Plus size={18} />
                Add employee
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-600/10 px-5 py-3 font-semibold text-red-300 transition hover:bg-red-600/20"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                <Users size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                total
              </span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.total}</div>
            <div className="mt-2 text-sm text-slate-400">All employees</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                <CheckCircle2 size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                active
              </span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.active}</div>
            <div className="mt-2 text-sm text-slate-400">Active workers</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                <XCircle size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                inactive
              </span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.inactive}</div>
            <div className="mt-2 text-sm text-slate-400">Inactive workers</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-400">
                <DollarSign size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                avg
              </span>
            </div>
            <div className="text-3xl font-bold text-white">${stats.avgRate}</div>
            <div className="mt-2 text-sm text-slate-400">Average hourly rate</div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.9fr_0.9fr]">
          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Workers</h2>
                <p className="mt-1 text-slate-400">
                  Data is loaded from public.employees
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  placeholder="Search by number, name, phone, email, position..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-[260px] rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                />
                <button
                  onClick={openAddModal}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500"
                >
                  <Plus size={18} />
                  Add
                </button>
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-12 text-center text-slate-400">
                Loading employees...
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-slate-800 lg:block">
                  <div className="grid grid-cols-[0.8fr_1.4fr_1fr_1.2fr_1fr_0.8fr_0.8fr_1.2fr] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
                    <div>No.</div>
                    <div>Name</div>
                    <div>Phone</div>
                    <div>Email</div>
                    <div>Position</div>
                    <div>Rate</div>
                    <div>Status</div>
                    <div>Actions</div>
                  </div>

                  {filteredEmployees.length === 0 ? (
                    <div className="bg-[#0b1220] px-4 py-10 text-center text-slate-400">
                      No employees found
                    </div>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className="grid grid-cols-[0.8fr_1.4fr_1fr_1.2fr_1fr_0.8fr_0.8fr_1.2fr] items-center border-t border-slate-800 bg-[#0b1220] px-4 py-4 text-sm text-slate-200"
                      >
                        <div className="font-semibold text-cyan-300">
                          {employee.employee_number ?? '—'}
                        </div>

                        <div className="font-semibold text-white">
                          {getFullName(employee)}
                        </div>

                        <div>{employee.phone || '—'}</div>

                        <div className="truncate">{employee.email || '—'}</div>

                        <div>{employee.position || 'worker'}</div>

                        <div className="font-semibold text-cyan-300">
                          {employee.hourly_rate !== null && employee.hourly_rate !== undefined
                            ? `$${employee.hourly_rate}`
                            : '—'}
                        </div>

                        <div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              employee.active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {employee.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEditModal(employee)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white transition hover:border-cyan-500"
                          >
                            <Pencil size={16} />
                            Edit
                          </button>

                          <button
                            onClick={() => toggleActive(employee)}
                            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                              employee.active
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            }`}
                          >
                            {employee.active ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300 transition hover:bg-red-600/20"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-4 lg:hidden">
                  {filteredEmployees.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-10 text-center text-slate-400">
                      No employees found
                    </div>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-sm text-cyan-300">
                              <Hash size={14} />
                              {employee.employee_number ?? '—'}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                              <User size={16} />
                              {getFullName(employee)}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">
                              {employee.position || 'worker'}
                            </div>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              employee.active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {employee.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Phone size={15} className="text-cyan-400" />
                            {employee.phone || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <Mail size={15} className="text-cyan-400" />
                            {employee.email || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <Briefcase size={15} className="text-cyan-400" />
                            {employee.position || 'worker'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <DollarSign size={15} className="text-cyan-400" />
                            {employee.hourly_rate !== null &&
                            employee.hourly_rate !== undefined
                              ? `$${employee.hourly_rate}`
                              : '—'}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => openEditModal(employee)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                          >
                            <Pencil size={16} />
                            Edit
                          </button>

                          <button
                            onClick={() => toggleActive(employee)}
                            className={`rounded-xl px-3 py-2 text-sm font-medium ${
                              employee.active
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            }`}
                          >
                            {employee.active ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-6">
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-400">
                  <Activity size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Quick access</h3>
                  <p className="text-sm text-slate-400">Only useful links</p>
                </div>
              </div>

              <div className="grid gap-3">
                <Link
                  to="/monitoring"
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-4 transition hover:border-cyan-500"
                >
                  <div>
                    <div className="font-semibold text-white">Monitoring</div>
                    <div className="text-sm text-slate-400">
                      Open equipment dashboard
                    </div>
                  </div>
                  <ArrowRight className="text-cyan-400" size={18} />
                </Link>

                <Link
                  to="/"
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-4 transition hover:border-cyan-500"
                >
                  <div>
                    <div className="font-semibold text-white">Home</div>
                    <div className="text-sm text-slate-400">Return to main page</div>
                  </div>
                  <ArrowRight className="text-cyan-400" size={18} />
                </Link>

                <button
                  onClick={openAddModal}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-4 text-left transition hover:border-cyan-500"
                >
                  <div>
                    <div className="font-semibold text-white">Add employee</div>
                    <div className="text-sm text-slate-400">
                      Open employee modal
                    </div>
                  </div>
                  <Plus className="text-cyan-400" size={18} />
                </button>
              </div>
            </div>

            <div className={`${cardClass} p-6`}>
              <h3 className="text-xl font-bold text-white">What this page does</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-xl bg-[#0b1220] p-4">
                  Reads employees from Supabase table
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  Saves full employee edit form
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  Switches active / inactive
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  Deletes employee from table
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  Default position on create: worker
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmployeeModal
        open={modalOpen}
        onClose={closeModal}
        onSave={handleSave}
        form={form}
        setForm={setForm}
        saving={saving}
        isEditing={isEditing}
      />
    </div>
  )
}
