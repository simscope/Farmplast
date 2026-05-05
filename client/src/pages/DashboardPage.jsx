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
  ExternalLink,
  Upload,
  Loader2,
  CalendarDays,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const cardClass = 'rounded-xl border border-slate-800 bg-[#0b1220] shadow-sm'
const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
}

function formatCommandResult(result) {
  if (!result) return 'Done'

  const parts = []

  if (result.message) parts.push(result.message)
  if (result.total !== undefined) parts.push(`Total: ${result.total}`)
  if (result.synced !== undefined) parts.push(`Synced: ${result.synced}`)
  if (result.verified !== undefined) parts.push(`Verified: ${result.verified}`)
  if (result.already_on_device !== undefined) parts.push(`Already: ${result.already_on_device}`)
  if (result.on_device !== undefined) parts.push(`On ZKT: ${result.on_device}`)
  if (result.missing_on_zkt !== undefined) parts.push(`Missing: ${result.missing_on_zkt}`)
  if (result.inserted !== undefined) parts.push(`Inserted: ${result.inserted}`)
  if (result.skipped !== undefined) parts.push(`Skipped: ${result.skipped}`)
  if (result.error) parts.push(`Error: ${result.error}`)

  return parts.length ? parts.join(' · ') : JSON.stringify(result)
}

function getZktBadge(employee) {
  const status = employee.zkt_sync_status || 'not_synced'

  const map = {
    synced: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    already_exists: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    deleted_from_zkt: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    missing_on_zkt: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    skipped: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    error: 'bg-red-500/15 text-red-300 border-red-500/30',
    not_synced: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }

  return map[status] || map.not_synced
}

function getZktLabel(employee) {
  const status = employee.zkt_sync_status || 'not_synced'

  const map = {
    synced: 'Synced',
    verified: 'Verified',
    already_exists: 'Exists',
    deleted_from_zkt: 'Deleted',
    missing_on_zkt: 'Missing',
    skipped: 'Skipped',
    error: 'Error',
    not_synced: 'Not synced',
  }

  return map[status] || status
}

async function uploadEmployeePhoto(file, employeeIdOrTemp = 'temp') {
  const ext = file.name.split('.').pop() || 'jpg'
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
  const filePath = `employees/${employeeIdOrTemp}/${Date.now()}-${safeName}.${ext}`

  // 🔥 загрузка
  const { error: uploadError } = await supabase.storage
    .from('employee-photos')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) throw uploadError

  // ❗ ВАЖНО: сначала пробуем public
  const { data: publicData } = supabase.storage
    .from('employee-photos')
    .getPublicUrl(filePath)

  let url = publicData?.publicUrl

  // ❗ если public не работает → используем signed URL
  if (!url) {
    const { data: signedData, error: signedError } =
      await supabase.storage
        .from('employee-photos')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 год

    if (signedError) throw signedError

    url = signedData?.signedUrl
  }

  if (!url) {
    throw new Error('Failed to get image URL')
  }

  // 🔥 анти-кэш
  return `${url}?v=${Date.now()}`
}

function EmployeeModal({ open, onClose, onSave, form, setForm, saving, isEditing }) {
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
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditing ? 'Edit employee' : 'Add employee'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Worker information + ZKT device settings
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
                <label className="mb-1 block text-xs text-slate-300">Employee number</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.employee_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, employee_number: e.target.value }))
                  }
                  placeholder="Employee number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">First name</label>
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
                <label className="mb-1 block text-xs text-slate-300">Last name</label>
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
                <label className="mb-1 block text-xs text-slate-300">Position</label>
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
                <label className="mb-1 block text-xs text-slate-300">Hire date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.hire_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, hire_date: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Form Employer</label>
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
                  <label className="mb-1 block text-xs text-slate-300">Company name</label>
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
                <label className="mb-1 block text-xs text-slate-300">Payment type</label>
                <select
                  className={inputClass}
                  value={form.pay_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pay_type: e.target.value }))
                  }
                >
                  <option value="hourly">Hourly</option>
                  <option value="monthly">Monthly fixed</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>

              {form.pay_type === 'hourly' ? (
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Hourly rate</label>
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
                      setForm((prev) => ({ ...prev, monthly_salary: e.target.value }))
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
                    setForm((prev) => ({ ...prev, active: e.target.value === 'true' }))
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="md:col-span-2 mt-2 border-t border-slate-800 pt-3">
                <h3 className="text-sm font-bold text-cyan-300">ZKT settings</h3>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT enabled</label>
                <select
                  className={inputClass}
                  value={form.zkt_enabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      zkt_enabled: e.target.value === 'true',
                    }))
                  }
                >
                  <option value="true">Yes - send to ZKT</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT user ID</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.zkt_user_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_user_id: e.target.value }))
                  }
                  placeholder="Usually same as employee number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT name</label>
                <input
                  className={inputClass}
                  value={form.zkt_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_name: e.target.value }))
                  }
                  placeholder="Max 24 chars"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT password</label>
                <input
                  className={inputClass}
                  value={form.zkt_password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_password: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT card number</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.zkt_card_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_card_number: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT privilege</label>
                <select
                  className={inputClass}
                  value={form.zkt_privilege}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_privilege: e.target.value }))
                  }
                >
                  <option value="0">0 - User</option>
                  <option value="14">14 - Admin</option>
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
    zkt_enabled: true,
    zkt_user_id: '',
    zkt_name: '',
    zkt_password: '',
    zkt_card_number: '',
    zkt_privilege: '0',
  }

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [zkLoading, setZkLoading] = useState(false)
  const [zkStatus, setZkStatus] = useState('')
  const [activeCommandId, setActiveCommandId] = useState(null)
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
        .select(`
          id,
          employee_number,
          first_name,
          last_name,
          phone,
          email,
          position,
          pay_type,
          hourly_rate,
          monthly_salary,
          active,
          hire_date,
          employer_form,
          company_name,
          photo_url,
          created_at,
          zkt_enabled,
          zkt_user_id,
          zkt_name,
          zkt_password,
          zkt_card_number,
          zkt_privilege,
          zkt_sync_status,
          zkt_sync_error,
          zkt_synced_at
        `)
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

  async function createZktCommand(command, payload = {}) {
    const { data, error } = await supabase
      .from('zkt_bridge_commands')
      .insert({
        command,
        status: 'pending',
        payload,
      })
      .select('id, command, status, created_at')
      .single()

    if (error) throw error
    return data
  }

  async function waitForZktCommand(commandId, label) {
    const maxAttempts = 120

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { data, error } = await supabase
        .from('zkt_bridge_commands')
        .select('id, command, status, result, error, created_at, picked_at, finished_at')
        .eq('id', commandId)
        .single()

      if (error) throw error
      if (!data) throw new Error('Command not found')

      if (data.status === 'pending') {
        setZkStatus(`${label}: waiting for bridge... (${attempt}/${maxAttempts})`)
      }

      if (data.status === 'running') {
        setZkStatus(`${label}: running on Windows bridge...`)
      }

      if (data.status === 'done') {
        const resultText = formatCommandResult(data.result)
        setZkStatus(`${label}: DONE ✅ ${resultText}`)
        return data
      }

      if (data.status === 'error') {
        const message = data.error || data.result?.message || 'Unknown ZKT bridge error'
        throw new Error(message)
      }

      await sleep(1000)
    }

    throw new Error('Timeout: Windows bridge did not finish command')
  }

  async function runZktCommand(command, label, payload = {}, afterDone) {
    try {
      setZkLoading(true)
      setError('')
      setActiveCommandId(null)
      setZkStatus(`${label}: creating command...`)

      const created = await createZktCommand(command, payload)

      setActiveCommandId(created.id)
      setZkStatus(`${label}: command created. ID: ${created.id}`)

      const finished = await waitForZktCommand(created.id, label)

      if (typeof afterDone === 'function') {
        await afterDone(finished)
      }
    } catch (err) {
      console.error(`runZktCommand ${command} error:`, err)
      setZkStatus(`ERROR: ${label}: ${err.message || 'Failed to run command'}`)
    } finally {
      setZkLoading(false)
    }
  }

  async function handleZkTest() {
    await runZktCommand('test', 'TEST ZKT')
  }

  async function handleZkSyncEmployees() {
    await runZktCommand('sync_employees', 'SYNC EMPLOYEES', {}, loadEmployees)
  }

  async function handleZkVerifyEmployees() {
    await runZktCommand('verify_employees', 'VERIFY ZKT', {}, loadEmployees)
  }

  async function handleZkPullLogs() {
    await runZktCommand('pull_attendance', 'PULL ATTENDANCE', {}, loadEmployees)
  }

  async function handleDeleteFromZkt(employee) {
    const name = getFullName(employee)
    const ok = window.confirm(`Delete ${name} from ZKT device only? Database employee will stay.`)
    if (!ok) return

    await runZktCommand(
      'delete_employee_from_zkt',
      `DELETE FROM ZKT ${name}`,
      { employee_id: employee.id },
      loadEmployees
    )
  }

  function openAddModal() {
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEditModal(employee) {
    setForm({
      id: employee.id,
      employee_number: employee.employee_number ?? '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      position: employee.position || 'worker',
      pay_type: employee.pay_type || 'hourly',
      hourly_rate: employee.hourly_rate ?? '',
      monthly_salary: employee.monthly_salary ?? '',
      active: employee.active ?? true,
      hire_date: employee.hire_date || '',
      employer_form: employee.employer_form || 'W2',
      company_name: employee.company_name || '',
      photo_url: employee.photo_url || '',
      zkt_enabled: employee.zkt_enabled ?? true,
      zkt_user_id: employee.zkt_user_id ?? employee.employee_number ?? '',
      zkt_name: employee.zkt_name || '',
      zkt_password: employee.zkt_password || '',
      zkt_card_number: employee.zkt_card_number ?? '',
      zkt_privilege: employee.zkt_privilege ?? '0',
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

    if (form.zkt_enabled && !form.zkt_user_id) {
      setError('ZKT user ID is required when ZKT enabled')
      return
    }

    try {
      setSaving(true)
      setError('')

      const fullName = `${form.first_name || ''} ${form.last_name || ''}`.trim()

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

        zkt_enabled: Boolean(form.zkt_enabled),
        zkt_user_id: form.zkt_user_id !== '' ? Number(form.zkt_user_id) : Number(form.employee_number),
        zkt_name: form.zkt_name.trim() || fullName.slice(0, 24),
        zkt_password: form.zkt_password.trim() || null,
        zkt_card_number:
          form.zkt_card_number !== '' ? Number(form.zkt_card_number) : null,
        zkt_privilege:
          form.zkt_privilege !== '' ? Number(form.zkt_privilege) : 0,
      }

      if (form.id) {
        const { error } = await supabase.from('employees').update(payload).eq('id', form.id)
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
    const ok = window.confirm('Delete this employee from database?')
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
      return employee.monthly_salary != null ? `$${employee.monthly_salary}/mo` : '—'
    }

    if (employee.pay_type === 'one_time') {
      return employee.monthly_salary != null ? `$${employee.monthly_salary} one-time` : '—'
    }

    return employee.hourly_rate != null ? `$${employee.hourly_rate}/hr` : '—'
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
        String(employee.zkt_user_id || '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (employee.phone || '').toLowerCase().includes(q) ||
        (employee.email || '').toLowerCase().includes(q) ||
        (employee.position || '').toLowerCase().includes(q) ||
        (employee.zkt_sync_status || '').toLowerCase().includes(q)
      )
    })
  }, [employees, search])

  const counts = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter((e) => e.active).length,
      inactive: employees.filter((e) => !e.active).length,
      zktVerified: employees.filter((e) =>
        ['synced', 'verified', 'already_exists'].includes(e.zkt_sync_status)
      ).length,
      zktMissing: employees.filter((e) => e.zkt_sync_status === 'missing_on_zkt').length,
      zktError: employees.filter((e) => e.zkt_sync_status === 'error').length,
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
                  Total: {counts.total} · Active: {counts.active} · Inactive:{' '}
                  {counts.inactive} · ZKT OK: {counts.zktVerified} · Missing:{' '}
                  {counts.zktMissing} · Errors: {counts.zktError}
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
                onClick={handleZkVerifyEmployees}
                disabled={zkLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {zkLoading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                Verify ZKT
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
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                zkStatus.startsWith('ERROR:')
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : zkStatus.includes('DONE')
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
              }`}
            >
              ZKT: {zkStatus}
              {activeCommandId ? (
                <span className="ml-2 text-[11px] text-slate-400">
                  ID: {activeCommandId}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={cardClass}>
          <div className="flex flex-col gap-3 border-b border-slate-800 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Workers list</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Database employees + real ZKT sync status
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Search by number, ZKT ID, name, phone, email, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-[320px] rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
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
              <div className="hidden overflow-x-auto rounded-xl border border-slate-800 lg:block">
                <div className="min-w-[1780px]">
                  <div className="grid grid-cols-[70px_230px_110px_150px_220px_130px_110px_135px_190px_360px] bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <div>No.</div>
                    <div>Name</div>
                    <div>ZKT ID</div>
                    <div>Phone</div>
                    <div>Email</div>
                    <div>Position</div>
                    <div>Payment</div>
                    <div>Active</div>
                    <div>ZKT Status</div>
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
                        className="grid grid-cols-[70px_230px_110px_150px_220px_130px_110px_135px_190px_360px] items-center border-t border-slate-800 bg-[#08101c] px-3 py-2 text-xs text-slate-200"
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

                        <div className="font-semibold text-blue-300">
                          {employee.zkt_user_id ?? employee.employee_number ?? '—'}
                        </div>

                        <div className="truncate whitespace-nowrap">{employee.phone || '—'}</div>
                        <div className="truncate">{employee.email || '—'}</div>
                        <div className="truncate whitespace-nowrap">{employee.position || 'worker'}</div>

                        <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                          {getPayLabel(employee)}
                        </div>

                        <div>
                          <button
                            onClick={() => toggleActive(employee)}
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                              employee.active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {employee.active ? 'Active' : 'Inactive'}
                          </button>
                        </div>

                        <div>
                          <span
                            title={employee.zkt_sync_error || ''}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getZktBadge(employee)}`}
                          >
                            {employee.zkt_sync_status === 'error' ||
                            employee.zkt_sync_status === 'missing_on_zkt' ? (
                              <ShieldAlert size={12} />
                            ) : (
                              <ShieldCheck size={12} />
                            )}
                            {getZktLabel(employee)}
                          </span>
                          {employee.zkt_sync_error ? (
                            <div className="mt-1 truncate text-[10px] text-red-300">
                              {employee.zkt_sync_error}
                            </div>
                          ) : null}
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
                            onClick={() => handleDeleteFromZkt(employee)}
                            disabled={zkLoading}
                            className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 size={13} />
                            Delete ZKT
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
            )}

            <div className="space-y-3 lg:hidden">
              {filteredEmployees.map((employee) => (
                <div key={employee.id} className="rounded-xl border border-slate-800 bg-[#08101c] p-3">
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
                          {employee.employee_number ?? '—'} · ZKT:{' '}
                          {employee.zkt_user_id ?? employee.employee_number ?? '—'}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                          <User size={14} />
                          {getFullName(employee)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {employee.position || 'worker'} · {getPayLabel(employee)}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${getZktBadge(employee)}`}
                    >
                      {getZktLabel(employee)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Phone size={13} />
                      {employee.phone || '—'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail size={13} />
                      {employee.email || '—'}
                    </div>
                  </div>

                  {employee.zkt_sync_error ? (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {employee.zkt_sync_error}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to={`/employees/${employee.id}`}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-3 py-2 text-xs font-semibold text-cyan-300"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => openEditModal(employee)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteFromZkt(employee)}
                      disabled={zkLoading}
                      className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 disabled:opacity-60"
                    >
                      Delete from ZKT
                    </button>
                    <button
                      onClick={() => handleDelete(employee.id)}
                      className="rounded-lg border border-red-500/30 bg-red-600/10 px-3 py-2 text-xs font-semibold text-red-300"
                    >
                      Delete DB
                    </button>
                  </div>
                </div>
              ))}
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
    </div>
  )
}
