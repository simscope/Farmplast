import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  X,
  Hash,
  User,
  Phone,
  Mail,
  Briefcase,
  ExternalLink,
  Upload,
  Loader2,
  CalendarDays,
  BadgeDollarSign,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const cardClass = 'rounded-xl border border-slate-800 bg-[#0b1220] shadow-sm'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

const ZK_BRIDGE_URL = 'http://localhost:8787'

function sanitizeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
}

async function uploadEmployeePhoto(file, employeeIdOrTemp = 'temp') {
  const ext = file.name.split('.').pop() || 'jpg'
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
  const filePath = `employees/${employeeIdOrTemp}/${Date.now()}-${safeName}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('employee-photos')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('employee-photos').getPublicUrl(filePath)
  return data?.publicUrl || ''
}

function EmployeeModal({
  open,
  onClose,
  onSave,
  form,
  setForm,
  saving,
  isEditing,
}) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!open) {
      setUploadingPhoto(false)
      setUploadError('')
    }
  }, [open])

  if (!open) return null

  async function handlePhotoUpload(e) {
    try {
      const file = e.target.files?.[0]
      if (!file) return

      setUploadingPhoto(true)
      setUploadError('')

      const photoUrl = await uploadEmployeePhoto(file, form.id || 'temp')

      setForm((prev) => ({
        ...prev,
        photo_url: photoUrl,
      }))
    } catch (err) {
      console.error('handlePhotoUpload error:', err)
      setUploadError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditing ? 'Edit employee' : 'Add employee'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Basic worker information and payment settings
            </p>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
            <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
              <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                {form.photo_url ? (
                  <img
                    src={form.photo_url}
                    alt="Employee"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                    No photo
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20">
                  {uploadingPhoto ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadingPhoto ? 'Uploading...' : 'Upload photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploadingPhoto || saving}
                  />
                </label>

                {uploadError ? (
                  <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {uploadError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">
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
                <label className="mb-1 block text-xs text-slate-300">
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
                <label className="mb-1 block text-xs text-slate-300">
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
                <label className="mb-1 block text-xs text-slate-300">Phone</label>
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
                <label className="mb-1 block text-xs text-slate-300">Email</label>
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
                <label className="mb-1 block text-xs text-slate-300">
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
                <label className="mb-1 block text-xs text-slate-300">
                  Hire date
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.hire_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      hire_date: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  Form Employer
                </label>
                <select
                  className={inputClass}
                  value={form.employer_form}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      employer_form: e.target.value,
                      company_name:
                        e.target.value === 'Other' ? prev.company_name || '' : '',
                    }))
                  }
                >
                  <option value="W2">W2</option>
                  <option value="1099">1099</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {form.employer_form === 'Other' ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-300">
                    Company name
                  </label>
                  <input
                    className={inputClass}
                    value={form.company_name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, company_name: e.target.value }))
                    }
                    placeholder="Enter company name"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs text-slate-300">
                  Payment type
                </label>
                <select
                  className={inputClass}
                  value={form.pay_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      pay_type: e.target.value,
                    }))
                  }
                >
                  <option value="hourly">Hourly</option>
                  <option value="monthly">Monthly fixed</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>

              {form.pay_type === 'hourly' ? (
                <div>
                  <label className="mb-1 block text-xs text-slate-300">
                    Hourly rate
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={form.hourly_rate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        hourly_rate: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-slate-300">
                    {form.pay_type === 'monthly' ? 'Monthly salary' : 'One-time amount'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={form.monthly_salary}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        monthly_salary: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-300">Status</label>
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
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
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
  const [zkLoading, setZkLoading] = useState(false)
  const [zkStatus, setZkStatus] = useState('')

  const emptyForm = {
    id: null,
    employee_number: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    position: 'worker',
    pay_type: 'hourly',
    hourly_rate: '',
    monthly_salary: '',
    active: true,
    hire_date: '',
    employer_form: 'W2',
    company_name: '',
    photo_url: '',
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
          'id, employee_number, first_name, last_name, phone, email, position, pay_type, hourly_rate, monthly_salary, active, hire_date, employer_form, company_name, photo_url, created_at'
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


  async function callZkBridge(endpoint, options = {}) {
    const response = await fetch(`${ZK_BRIDGE_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    let data = null

    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `ZKT bridge error ${response.status}`)
    }

    return data || {}
  }

  function getZkMessage(data, fallback) {
    if (!data) return fallback
    if (data.status) return data.status
    if (data.message) return data.message

    const parts = []

    if (data.device) parts.push(`Device: ${data.device}`)
    if (data.synced !== undefined) parts.push(`Synced: ${data.synced}`)
    if (data.inserted !== undefined) parts.push(`Inserted: ${data.inserted}`)
    if (data.skipped !== undefined) parts.push(`Skipped: ${data.skipped}`)
    if (data.total !== undefined) parts.push(`Total: ${data.total}`)

    return parts.length ? parts.join(' · ') : fallback
  }

  async function handleZkTest() {
    try {
      setZkLoading(true)
      setZkStatus('Testing ZKT connection...')
      setError('')

      const data = await callZkBridge('/test')
      setZkStatus(getZkMessage(data, 'ZKT connection OK'))
    } catch (err) {
      console.error('handleZkTest error:', err)
      setZkStatus(`ERROR: ${err.message || 'Failed to connect to ZKT bridge'}`)
    } finally {
      setZkLoading(false)
    }
  }

  async function handleZkSyncEmployees() {
    try {
      setZkLoading(true)
      setZkStatus('Syncing employees to ZKT...')
      setError('')

      const data = await callZkBridge('/sync-employees', { method: 'POST' })
      setZkStatus(getZkMessage(data, 'Employees synced to ZKT'))
    } catch (err) {
      console.error('handleZkSyncEmployees error:', err)
      setZkStatus(`ERROR: ${err.message || 'Failed to sync employees to ZKT'}`)
    } finally {
      setZkLoading(false)
    }
  }

  async function handleZkPullLogs() {
    try {
      setZkLoading(true)
      setZkStatus('Pulling attendance logs from ZKT...')
      setError('')

      const data = await callZkBridge('/pull-attendance', { method: 'POST' })
      setZkStatus(getZkMessage(data, 'Attendance logs pulled from ZKT'))
      await loadEmployees()
    } catch (err) {
      console.error('handleZkPullLogs error:', err)
      setZkStatus(`ERROR: ${err.message || 'Failed to pull attendance logs from ZKT'}`)
    } finally {
      setZkLoading(false)
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
      pay_type: 'hourly',
      hourly_rate: '',
      monthly_salary: '',
      active: true,
      hire_date: '',
      employer_form: 'W2',
      company_name: '',
      photo_url: '',
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
      pay_type: employee.pay_type || 'hourly',
      hourly_rate:
        employee.hourly_rate === null || employee.hourly_rate === undefined
          ? ''
          : employee.hourly_rate,
      monthly_salary:
        employee.monthly_salary === null || employee.monthly_salary === undefined
          ? ''
          : employee.monthly_salary,
      active: employee.active ?? true,
      hire_date: employee.hire_date || '',
      employer_form: employee.employer_form || 'W2',
      company_name: employee.company_name || '',
      photo_url: employee.photo_url || '',
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

    if (form.employer_form === 'Other' && !form.company_name.trim()) {
      setError('Company name is required when Form Employer is Other')
      return
    }

    if (form.pay_type === 'hourly') {
      if (form.hourly_rate !== '' && Number.isNaN(Number(form.hourly_rate))) {
        setError('Hourly rate is invalid')
        return
      }
    }

    if (form.pay_type === 'monthly' || form.pay_type === 'one_time') {
      if (form.monthly_salary !== '' && Number.isNaN(Number(form.monthly_salary))) {
        setError('Amount is invalid')
        return
      }
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
        pay_type: form.pay_type || 'hourly',
        hourly_rate:
          form.pay_type === 'hourly' && form.hourly_rate !== ''
            ? Number(form.hourly_rate)
            : null,
        monthly_salary:
          (form.pay_type === 'monthly' || form.pay_type === 'one_time') &&
          form.monthly_salary !== ''
            ? Number(form.monthly_salary)
            : null,
        active: Boolean(form.active),
        hire_date: form.hire_date || null,
        employer_form: form.employer_form || null,
        company_name:
          form.employer_form === 'Other' ? form.company_name.trim() || null : null,
        photo_url: form.photo_url || null,
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

  function getPayLabel(employee) {
    if (employee.pay_type === 'monthly') {
      return employee.monthly_salary !== null && employee.monthly_salary !== undefined
        ? `$${employee.monthly_salary}/mo`
        : '—'
    }

    if (employee.pay_type === 'one_time') {
      return employee.monthly_salary !== null && employee.monthly_salary !== undefined
        ? `$${employee.monthly_salary} one-time`
        : '—'
    }

    return employee.hourly_rate !== null && employee.hourly_rate !== undefined
      ? `$${employee.hourly_rate}/hr`
      : '—'
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
        (employee.position || '').toLowerCase().includes(q) ||
        (employee.pay_type || '').toLowerCase().includes(q) ||
        (employee.employer_form || '').toLowerCase().includes(q) ||
        (employee.company_name || '').toLowerCase().includes(q)
      )
    })
  }, [employees, search])

  const counts = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter((e) => e.active).length,
      inactive: employees.filter((e) => !e.active).length,
    }
  }, [employees])

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-[1900px] px-3 py-4 sm:px-4 lg:px-5">
        <div className={`${cardClass} mb-4 p-3`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                <LayoutDashboard size={22} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-white">Employees</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  Total: {counts.total} · Active: {counts.active} · Inactive: {counts.inactive}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadEmployees}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:border-cyan-500"
              >
                <RefreshCw size={15} />
                Refresh
              </button>

              <button
                onClick={handleZkTest}
                disabled={zkLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {zkLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Test ZKT
              </button>

              <button
                onClick={handleZkSyncEmployees}
                disabled={zkLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {zkLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Sync → ZKT
              </button>

              <button
                onClick={handleZkPullLogs}
                disabled={zkLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {zkLoading ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}
                Pull Logs
              </button>

              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
              >
                <Plus size={15} />
                Add employee
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-600/10 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-600/20"
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          </div>

          {zkStatus ? (
            <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              ZKT: {zkStatus}
            </div>
          ) : null}
        </div>

        <div className={cardClass}>
          <div className="flex flex-col gap-3 border-b border-slate-800 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Workers list</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Data is loaded from public.employees
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Search by number, name, phone, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-[260px] rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              />
              <button
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>

          <div className="p-3">
            {error ? (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-[#08101c] px-4 py-10 text-center text-sm text-slate-400">
                Loading employees...
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto rounded-xl border border-slate-800 lg:block">
                  <div className="min-w-[1500px]">
                    <div className="grid grid-cols-[70px_220px_150px_220px_140px_95px_120px_90px_260px] bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      <div>No.</div>
                      <div>Name</div>
                      <div>Phone</div>
                      <div>Email</div>
                      <div>Position</div>
                      <div>Form</div>
                      <div>Payment</div>
                      <div>Status</div>
                      <div>Actions</div>
                    </div>

                    {filteredEmployees.length === 0 ? (
                      <div className="bg-[#08101c] px-4 py-8 text-center text-sm text-slate-400">
                        No employees found
                      </div>
                    ) : (
                      filteredEmployees.map((employee) => (
                        <div
                          key={employee.id}
                          className="grid grid-cols-[70px_220px_150px_220px_140px_95px_120px_90px_260px] items-center border-t border-slate-800 bg-[#08101c] px-3 py-2 text-xs text-slate-200"
                        >
                          <div className="font-semibold text-cyan-300">
                            {employee.employee_number ?? '—'}
                          </div>

                          <div className="flex min-w-0 items-center gap-2 font-semibold text-white">
                            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-[#07101d]">
                              {employee.photo_url ? (
                                <img
                                  src={employee.photo_url}
                                  alt={getFullName(employee)}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0 leading-tight">
                              <div className="truncate">{getFullName(employee)}</div>
                              {employee.company_name ? (
                                <div className="truncate text-[11px] font-normal text-slate-400">
                                  {employee.company_name}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="truncate whitespace-nowrap">
                            {employee.phone || '—'}
                          </div>
                          <div className="truncate">{employee.email || '—'}</div>
                          <div className="truncate whitespace-nowrap">
                            {employee.position || 'worker'}
                          </div>

                          <div className="truncate whitespace-nowrap font-semibold text-sky-300">
                            {employee.employer_form || '—'}
                          </div>

                          <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                            {getPayLabel(employee)}
                          </div>

                          <div>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                employee.active
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-red-500/15 text-red-300'
                              }`}
                            >
                              {employee.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <Link
                              to={`/employees/${employee.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-2 py-1.5 text-cyan-300 transition hover:bg-cyan-600/20"
                            >
                              <ExternalLink size={13} />
                              Open
                            </Link>

                            <button
                              onClick={() => openEditModal(employee)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-white transition hover:border-cyan-500"
                            >
                              <Pencil size={13} />
                              Edit
                            </button>

                            <button
                              onClick={() => toggleActive(employee)}
                              className={`rounded-lg px-2 py-1.5 font-medium transition ${
                                employee.active
                                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                  : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              }`}
                            >
                              {employee.active ? 'Disable' : 'Enable'}
                            </button>

                            <button
                              onClick={() => handleDelete(employee.id)}
                              className="rounded-lg border border-red-500/30 bg-red-600/10 px-2 py-1.5 text-red-300 transition hover:bg-red-600/20"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3 lg:hidden">
                  {filteredEmployees.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-[#08101c] px-4 py-8 text-center text-sm text-slate-400">
                      No employees found
                    </div>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className="rounded-xl border border-slate-800 bg-[#08101c] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-xl border border-slate-700 bg-[#07101d]">
                              {employee.photo_url ? (
                                <img
                                  src={employee.photo_url}
                                  alt={getFullName(employee)}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs text-cyan-300">
                                <Hash size={13} />
                                {employee.employee_number ?? '—'}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                                <User size={14} />
                                <span className="truncate">{getFullName(employee)}</span>
                              </div>
                              <div className="mt-0.5 text-xs text-slate-400">
                                {employee.position || 'worker'}
                              </div>
                              {employee.company_name ? (
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {employee.company_name}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              employee.active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {employee.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Phone size={13} className="text-cyan-400" />
                            {employee.phone || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <Mail size={13} className="text-cyan-400" />
                            {employee.email || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <Briefcase size={13} className="text-cyan-400" />
                            {employee.position || 'worker'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <CalendarDays size={13} className="text-cyan-400" />
                            {employee.hire_date || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <BadgeDollarSign size={13} className="text-cyan-400" />
                            {employee.employer_form || '—'}
                          </div>
                          <div className="text-slate-300">{getPayLabel(employee)}</div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Link
                            to={`/employees/${employee.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-2 py-1.5 text-xs text-cyan-300"
                          >
                            <ExternalLink size={13} />
                            Open
                          </Link>

                          <button
                            onClick={() => openEditModal(employee)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                          >
                            <Pencil size={13} />
                            Edit
                          </button>

                          <button
                            onClick={() => toggleActive(employee)}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium ${
                              employee.active
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            }`}
                          >
                            {employee.active ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="rounded-lg border border-red-500/30 bg-red-600/10 px-2 py-1.5 text-red-300"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
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
