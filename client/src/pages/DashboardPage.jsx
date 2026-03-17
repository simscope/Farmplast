import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Plus,
  Settings,
  Shield,
  User,
  Users,
  UserCog,
  Wrench,
  X,
  BadgePercent,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const roles = ['admin', 'manager', 'technician']
const payModes = ['hourly', 'percent', 'fixed']
const statuses = ['active', 'inactive']

const cardClass =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-cyan-500'

const labelClass = 'mb-2 block text-sm font-medium text-slate-300'

function Modal({ open, title, children, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Full employee configuration and payroll setup
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-82px)] overflow-y-auto px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, title, value, subtitle, accent = 'text-cyan-400' }) {
  return (
    <div className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div className={`rounded-2xl bg-slate-900 p-3 ${accent}`}>
          <Icon size={22} />
        </div>
        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
          overview
        </span>
      </div>

      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{subtitle}</div>
    </div>
  )
}

function EmptyValue({ children }) {
  return <span className="text-slate-500">{children}</span>
}

export default function DashboardPage() {
  const { profile, signOut } = useAuth()

  const displayName = profile?.full_name || 'No name'
  const displayEmail = profile?.email || 'No email'
  const displayRole = profile?.role || 'unknown'

  const [workers, setWorkers] = useState([
    {
      id: 1,
      full_name: displayName,
      email: displayEmail,
      phone: '',
      role: displayRole === 'unknown' ? 'admin' : displayRole,
      status: 'active',
      pay_mode: 'percent',
      rate: '',
      percent: 50,
      notes: 'Main account / owner access',
    },
    {
      id: 2,
      full_name: 'Alex Technician',
      email: 'alex@simscope.com',
      phone: '(201) 555-0101',
      role: 'technician',
      status: 'active',
      pay_mode: 'percent',
      rate: '',
      percent: 50,
      notes: 'Field tech - HVAC',
    },
    {
      id: 3,
      full_name: 'Maria Manager',
      email: 'maria@simscope.com',
      phone: '(201) 555-0102',
      role: 'manager',
      status: 'active',
      pay_mode: 'fixed',
      rate: 28,
      percent: '',
      notes: 'Dispatch / office',
    },
  ])

  const emptyWorker = {
    id: null,
    full_name: '',
    email: '',
    phone: '',
    role: 'technician',
    status: 'active',
    pay_mode: 'percent',
    rate: '',
    percent: 50,
    notes: '',
  }

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState(emptyWorker)
  const [search, setSearch] = useState('')

  async function handleLogout() {
    await signOut()
  }

  function openCreateModal() {
    setEditingWorker(emptyWorker)
    setIsModalOpen(true)
  }

  function openEditModal(worker) {
    setEditingWorker(worker)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingWorker(emptyWorker)
  }

  function handleFieldChange(field, value) {
    setEditingWorker((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function handleSaveWorker(e) {
    e.preventDefault()

    if (!editingWorker.full_name.trim() || !editingWorker.email.trim()) {
      alert('Name and email are required')
      return
    }

    if (editingWorker.id) {
      setWorkers((prev) =>
        prev.map((worker) =>
          worker.id === editingWorker.id ? { ...editingWorker } : worker
        )
      )
    } else {
      setWorkers((prev) => [
        {
          ...editingWorker,
          id: Date.now(),
        },
        ...prev,
      ])
    }

    closeModal()
  }

  function handleDeleteWorker(id) {
    const confirmed = window.confirm('Delete this employee?')
    if (!confirmed) return
    setWorkers((prev) => prev.filter((worker) => worker.id !== id))
  }

  const filteredWorkers = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return workers

    return workers.filter((worker) => {
      return (
        worker.full_name.toLowerCase().includes(q) ||
        worker.email.toLowerCase().includes(q) ||
        worker.role.toLowerCase().includes(q) ||
        (worker.phone || '').toLowerCase().includes(q)
      )
    })
  }, [workers, search])

  const stats = useMemo(() => {
    const total = workers.length
    const active = workers.filter((w) => w.status === 'active').length
    const technicians = workers.filter((w) => w.role === 'technician').length
    const managers = workers.filter((w) => w.role === 'manager').length
    const admins = workers.filter((w) => w.role === 'admin').length
    const payMissing = workers.filter((w) => {
      if (w.pay_mode === 'percent') return !w.percent && w.percent !== 0
      return !w.rate && w.rate !== 0
    }).length

    return {
      total,
      active,
      technicians,
      managers,
      admins,
      payMissing,
    }
  }, [workers])

  const urgentItems = useMemo(() => {
    const items = []

    if (stats.payMissing > 0) {
      items.push(`${stats.payMissing} employee(s) without payroll setup`)
    }

    const inactiveUsers = workers.filter((w) => w.status === 'inactive').length
    if (inactiveUsers > 0) {
      items.push(`${inactiveUsers} inactive employee(s)`)
    }

    const noPhone = workers.filter((w) => !w.phone).length
    if (noPhone > 0) {
      items.push(`${noPhone} employee(s) without phone number`)
    }

    if (items.length === 0) {
      items.push('Everything looks configured correctly')
    }

    return items
  }, [workers, stats.payMissing])

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <div className={`${cardClass} mb-6 overflow-hidden`}>
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-3xl bg-cyan-500/10 p-4 text-cyan-400">
                <LayoutDashboard size={32} />
              </div>

              <div>
                <h1 className="text-3xl font-bold text-white">
                  Admin Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-slate-400">
                  Employee management, payroll configuration, quick control links
                  and operational overview in one place.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
                    <span className="text-slate-500">Logged in:</span>{' '}
                    {displayName}
                  </div>
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm capitalize text-slate-300">
                    <span className="text-slate-500">Role:</span> {displayRole}
                  </div>
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
                    {displayEmail}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={openCreateModal}
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

        {/* STATS */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={Users}
            title="Total employees"
            value={stats.total}
            subtitle="All workers in the system"
            accent="text-cyan-400"
          />
          <StatCard
            icon={CheckCircle2}
            title="Active"
            value={stats.active}
            subtitle="Currently enabled accounts"
            accent="text-emerald-400"
          />
          <StatCard
            icon={Wrench}
            title="Technicians"
            value={stats.technicians}
            subtitle="Field service workers"
            accent="text-amber-400"
          />
          <StatCard
            icon={Briefcase}
            title="Managers"
            value={stats.managers}
            subtitle="Dispatch and coordination"
            accent="text-violet-400"
          />
          <StatCard
            icon={AlertTriangle}
            title="Need setup"
            value={stats.payMissing}
            subtitle="Payroll is incomplete"
            accent="text-red-400"
          />
        </div>

        {/* MAIN GRID */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          {/* EMPLOYEE MANAGEMENT */}
          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Employee management
                </h2>
                <p className="mt-1 text-slate-400">
                  Add workers, edit roles, phone, payroll mode, rates and status.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-[240px] rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                />
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500"
                >
                  <Plus size={18} />
                  New
                </button>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-800 lg:block">
              <div className="grid grid-cols-[1.6fr_1.6fr_1fr_1fr_1fr_1.1fr] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
                <div>Employee</div>
                <div>Contact</div>
                <div>Role</div>
                <div>Status</div>
                <div>Payroll</div>
                <div>Actions</div>
              </div>

              {filteredWorkers.map((worker) => (
                <div
                  key={worker.id}
                  className="grid grid-cols-[1.6fr_1.6fr_1fr_1fr_1fr_1.1fr] items-center border-t border-slate-800 bg-[#0b1220] px-4 py-4 text-sm text-slate-200"
                >
                  <div>
                    <div className="font-semibold text-white">{worker.full_name}</div>
                    <div className="mt-1 text-slate-400">
                      {worker.notes || <EmptyValue>No notes</EmptyValue>}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-cyan-400" />
                      <span>{worker.email}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-slate-400">
                      <Phone size={14} className="text-emerald-400" />
                      <span>{worker.phone || 'No phone'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                      {worker.role}
                    </span>
                  </div>

                  <div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        worker.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {worker.status}
                    </span>
                  </div>

                  <div>
                    {worker.pay_mode === 'percent' ? (
                      <div className="font-semibold text-amber-300">
                        {worker.percent || 0}%
                      </div>
                    ) : (
                      <div className="font-semibold text-cyan-300">
                        ${worker.rate || 0}
                        <span className="ml-1 text-slate-500">
                          / {worker.pay_mode}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(worker)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white transition hover:border-cyan-500"
                    >
                      <Pencil size={16} />
                      Edit
                    </button>

                    <button
                      onClick={() => handleDeleteWorker(worker.id)}
                      className="rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300 transition hover:bg-red-600/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {filteredWorkers.length === 0 && (
                <div className="px-4 py-10 text-center text-slate-400">
                  No employees found
                </div>
              )}
            </div>

            <div className="space-y-4 lg:hidden">
              {filteredWorkers.map((worker) => (
                <div key={worker.id} className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {worker.full_name}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">{worker.email}</div>
                    </div>

                    <button
                      onClick={() => openEditModal(worker)}
                      className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-white"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-900 p-3">
                      <div className="text-slate-500">Role</div>
                      <div className="mt-1 capitalize text-white">{worker.role}</div>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <div className="text-slate-500">Status</div>
                      <div className="mt-1 capitalize text-white">{worker.status}</div>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <div className="text-slate-500">Phone</div>
                      <div className="mt-1 text-white">{worker.phone || '—'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <div className="text-slate-500">Payroll</div>
                      <div className="mt-1 text-white">
                        {worker.pay_mode === 'percent'
                          ? `${worker.percent || 0}%`
                          : `$${worker.rate || 0} / ${worker.pay_mode}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="space-y-6">
            {/* PROFILE */}
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                  <UserCog size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Current profile</h3>
                  <p className="text-sm text-slate-400">Logged-in account info</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300">
                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="text-slate-500">Name</div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {displayName}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="text-slate-500">Email</div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {displayEmail}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="text-slate-500">Role</div>
                  <div className="mt-1 text-base font-semibold capitalize text-white">
                    {displayRole}
                  </div>
                </div>
              </div>
            </div>

            {/* QUICK ACCESS */}
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-400">
                  <Activity size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Quick access</h3>
                  <p className="text-sm text-slate-400">Fast navigation</p>
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
                    <div className="text-sm text-slate-400">
                      Return to main page
                    </div>
                  </div>
                  <ArrowRight className="text-cyan-400" size={18} />
                </Link>

                <button
                  onClick={openCreateModal}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-4 text-left transition hover:border-cyan-500"
                >
                  <div>
                    <div className="font-semibold text-white">Add worker</div>
                    <div className="text-sm text-slate-400">
                      Open create employee modal
                    </div>
                  </div>
                  <Plus className="text-cyan-400" size={18} />
                </button>
              </div>
            </div>

            {/* PAYROLL SETTINGS IDEA BLOCK */}
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Payroll logic</h3>
                  <p className="text-sm text-slate-400">
                    What this dashboard should control
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300">
                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    <BadgePercent size={16} className="text-amber-400" />
                    Percent mode
                  </div>
                  <div className="text-slate-400">
                    Good for technicians. Example: 50% from labor, materials excluded.
                  </div>
                </div>

                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    <DollarSign size={16} className="text-cyan-400" />
                    Hourly / fixed mode
                  </div>
                  <div className="text-slate-400">
                    Good for managers, office staff and fixed salary workers.
                  </div>
                </div>

                <div className="rounded-xl bg-[#0b1220] p-4">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    <Settings size={16} className="text-violet-400" />
                    Next step
                  </div>
                  <div className="text-slate-400">
                    Later connect rates to real Supabase tables and calculate payroll automatically.
                  </div>
                </div>
              </div>
            </div>

            {/* ATTENTION BLOCK */}
            <div className={`${cardClass} p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                  <Shield size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Needs attention</h3>
                  <p className="text-sm text-slate-400">
                    Configuration and staffing issues
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {urgentItems.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-800 bg-[#0b1220] px-4 py-3 text-sm text-slate-300"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      <Modal
        open={isModalOpen}
        title={editingWorker?.id ? 'Edit employee' : 'Add employee'}
        onClose={closeModal}
      >
        <form onSubmit={handleSaveWorker} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className={labelClass}>Full name</label>
              <input
                className={inputClass}
                value={editingWorker.full_name}
                onChange={(e) => handleFieldChange('full_name', e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                className={inputClass}
                type="email"
                value={editingWorker.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder="worker@company.com"
              />
            </div>

            <div>
              <label className={labelClass}>Phone</label>
              <input
                className={inputClass}
                value={editingWorker.phone}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                placeholder="(201) 555-0100"
              />
            </div>

            <div>
              <label className={labelClass}>Role</label>
              <select
                className={inputClass}
                value={editingWorker.role}
                onChange={(e) => handleFieldChange('role', e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role} value={role} className="bg-[#0b1220]">
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={editingWorker.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status} className="bg-[#0b1220]">
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Payroll mode</label>
              <select
                className={inputClass}
                value={editingWorker.pay_mode}
                onChange={(e) => handleFieldChange('pay_mode', e.target.value)}
              >
                {payModes.map((mode) => (
                  <option key={mode} value={mode} className="bg-[#0b1220]">
                    {mode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Payroll setup
            </h3>

            {editingWorker.pay_mode === 'percent' ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className={labelClass}>Percent</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    max="100"
                    value={editingWorker.percent}
                    onChange={(e) => handleFieldChange('percent', e.target.value)}
                    placeholder="50"
                  />
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
                  Use this for technicians when salary depends on completed job labor.
                </div>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {editingWorker.pay_mode === 'hourly'
                      ? 'Hourly rate'
                      : 'Fixed amount'}
                  </label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingWorker.rate}
                    onChange={(e) => handleFieldChange('rate', e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
                  Use hourly or fixed payment for office staff, managers, dispatchers or non-commission roles.
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={editingWorker.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              placeholder="Internal notes, permissions, specialty, comments..."
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-end">
            {editingWorker.id && (
              <button
                type="button"
                onClick={() => handleDeleteWorker(editingWorker.id)}
                className="rounded-xl border border-red-500/30 bg-red-600/10 px-5 py-3 font-semibold text-red-300 transition hover:bg-red-600/20"
              >
                Delete employee
              </button>
            )}

            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-white transition hover:border-slate-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500"
            >
              Save employee
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
