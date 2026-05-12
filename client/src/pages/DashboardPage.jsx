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
  FileText,
  FileSpreadsheet,
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

async function removeEmployeePhotos(employeeId) {
  if (!employeeId) return

  const folder = `employees/${employeeId}`

  const { data, error } = await supabase.storage
    .from('employee-photos')
    .list(folder)

  if (error) throw error

  const files = (data || []).map((file) => `${folder}/${file.name}`)

  if (files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('employee-photos')
      .remove(files)

    if (removeError) throw removeError
  }
}

async function uploadEmployeePhoto(file, employeeIdOrTemp = 'temp') {
  const ext = file.name.split('.').pop() || 'jpg'
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
  const filePath = `employees/${employeeIdOrTemp}/${Date.now()}-${safeName}.${ext}`

  if (employeeIdOrTemp !== 'temp') {
    await removeEmployeePhotos(employeeIdOrTemp)
  }

  const { error: uploadError } = await supabase.storage
    .from('employee-photos')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('employee-photos')
    .getPublicUrl(filePath)

  if (!data?.publicUrl) {
    throw new Error('Public URL was not created')
  }

  return data.publicUrl
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toLocalDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function getPreviousWeekRange() {
  const today = new Date()
  const currentDay = today.getDay() || 7

  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  start.setDate(today.getDate() - currentDay - 6)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })

  return {
    start,
    end,
    startText: toLocalDateString(start),
    endText: toLocalDateString(end),
    days,
  }
}

function formatReportDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatTimeValue(value) {
  if (!value) return ''

  const asString = String(value)

  if (/^\d{1,2}:\d{2}/.test(asString)) {
    return asString.slice(0, 5)
  }

  const date = new Date(asString)
  if (Number.isNaN(date.getTime())) return asString

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLogEmployeeId(log) {
  return String(
    log.employee_id ||
      log.employeeId ||
      log.employee_uuid ||
      log.worker_id ||
      log.user_id ||
      ''
  )
}

function getLogDate(log) {
  const rawDate =
    log.work_date ||
    log.date ||
    log.day ||
    log.shift_date ||
    log.log_date ||
    log.created_at ||
    log.clock_in ||
    log.check_in ||
    log.in_time ||
    log.start_time

  if (!rawDate) return ''

  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate
  }

  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return String(rawDate).slice(0, 10)

  return toLocalDateString(date)
}

function getLogHours(log) {
  const value =
    log.total_hours ??
    log.worked_hours ??
    log.net_hours ??
    log.hours ??
    log.duration_hours ??
    log.total_work_hours ??
    log.paid_hours ??
    null

  if (value === null || value === undefined || value === '') return ''

  const number = Number(value)
  if (Number.isNaN(number)) return String(value)

  return number.toFixed(2).replace(/\.00$/, '')
}

function getLogInTime(log) {
  return formatTimeValue(
    log.clock_in ||
      log.check_in ||
      log.in_time ||
      log.start_time ||
      log.first_in ||
      log.time_in
  )
}

function getLogOutTime(log) {
  return formatTimeValue(
    log.clock_out ||
      log.check_out ||
      log.out_time ||
      log.end_time ||
      log.last_out ||
      log.time_out
  )
}

function buildDayReportText(dayLogs) {
  if (!dayLogs.length) return 'No data'

  return dayLogs
    .map((log) => {
      const inTime = getLogInTime(log)
      const outTime = getLogOutTime(log)
      const hours = getLogHours(log)
      const status = log.status || log.note || log.notes || ''

      const parts = []
      if (inTime || outTime) parts.push(`${inTime || '—'} - ${outTime || '—'}`)
      if (hours) parts.push(`${hours} h`)
      if (status) parts.push(status)

      return parts.length ? parts.join(' · ') : 'Record found'
    })
    .join('<br/>')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function downloadTextFile(fileName, content, type = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
      e.target.value = ''

      if (!file) return

      if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('Please select image file')
      }

      setUploadingPhoto(true)
      setUploadError('')

      const photoUrl = await uploadEmployeePhoto(file, form.id || 'temp')

      if (form.id) {
        const { error } = await supabase
          .from('employees')
          .update({ photo_url: photoUrl })
          .eq('id', form.id)

        if (error) throw error
      }

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

  async function handleDeletePhoto() {
    try {
      setUploadingPhoto(true)
      setUploadError('')

      if (form.id) {
        await removeEmployeePhotos(form.id)

        const { error } = await supabase
          .from('employees')
          .update({ photo_url: null })
          .eq('id', form.id)

        if (error) throw error
      }

      setForm((prev) => ({
        ...prev,
        photo_url: '',
      }))
    } catch (err) {
      console.error('handleDeletePhoto error:', err)
      setUploadError(err.message || 'Failed to delete photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm">
      <div className="max-h-[98vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
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

        <form onSubmit={onSave} className="space-y-4 px-4 py-4 pb-10">
          <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
            <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
              <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                {form.photo_url ? (
                  <img
                key={form.photo_url}
                src={form.photo_url}
                alt="Employee"
                className="h-full w-full object-cover"
                onLoad={() => {
                console.log('PHOTO LOADED:', form.photo_url)
                }}
                onError={() => {
                console.error('PHOTO FAILED:', form.photo_url)
              }}
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

                {form.photo_url ? (
                  <button
                    type="button"
                    onClick={handleDeletePhoto}
                    disabled={uploadingPhoto || saving}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete photo
                  </button>
                ) : null}

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
                <label className="mb-1 block text-xs text-slate-300">Overtime</label>
                <select
                  className={inputClass}
                  value={form.overtime_enabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      overtime_enabled: e.target.value === 'true',
                    }))
                  }
                >
                  <option value="false">No overtime</option>
                  <option value="true">With overtime</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Default is No overtime. Select With overtime only for workers paid 1.5x after 40h/week.
                </p>
              </div>

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
    overtime_enabled: false,
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
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const isEditing = Boolean(form.id)

  useEffect(() => {
    loadEmployees()

    const channel = supabase
      .channel('dashboard-presence-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zkt_attendance_logs' },
        () => loadEmployees()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => loadEmployees()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadEmployees() {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('v_employee_current_presence')
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
          overtime_enabled,
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
          zkt_synced_at,
          last_punch_time,
          last_punch_type,
          is_on_site
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

  async function handleSyncEmployeeToZkt(employee) {
    const name = getFullName(employee)

    await runZktCommand(
      'sync_one_employee',
      `SYNC ZKT ${name}`,
      { employee_id: employee.id },
      loadEmployees
    )
  }

  async function handleVerifyEmployeeInZkt(employee) {
    const name = getFullName(employee)

    await runZktCommand(
      'verify_one_employee',
      `VERIFY ZKT ${name}`,
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
      overtime_enabled: employee.overtime_enabled ?? false,
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
        overtime_enabled: Boolean(form.overtime_enabled),
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

  async function loadPreviousWeekWorkLogs() {
    const week = getPreviousWeekRange()

    const { data, error } = await supabase
      .from('employee_work_logs')
      .select('*')
      .limit(10000)

    if (error) throw error

    const logs = (data || []).filter((log) => {
      const dateText = getLogDate(log)
      return dateText >= week.startText && dateText <= week.endText
    })

    return { week, logs }
  }

  async function tryLoadPayrollDeductions(week) {
    const possibleTables = [
      'employee_payroll_deductions',
      'payroll_deductions',
      'employee_deductions',
    ]

    for (const tableName of possibleTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(10000)

        if (error) continue

        const rows = (data || []).filter((row) => {
          const rawDate =
            row.period_start ||
            row.week_start ||
            row.pay_period_start ||
            row.date ||
            row.created_at

          if (!rawDate) return true

          const dateText =
            typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
              ? rawDate
              : toLocalDateString(new Date(rawDate))

          return dateText >= week.startText && dateText <= week.endText
        })

        return rows
      } catch (err) {
        console.warn(`Payroll deductions table ${tableName} not available`, err)
      }
    }

    return []
  }

  function getNumberFromObject(object, keys, fallback = 0) {
    for (const key of keys) {
      const value = object?.[key]
      if (value !== undefined && value !== null && value !== '') {
        const number = Number(value)
        if (!Number.isNaN(number)) return number
      }
    }
    return fallback
  }

  function getLunchHours(log) {
    return getNumberFromObject(log, [
      'lunch_hours',
      'lunch',
      'lunch_deducted',
      'lunch_deduction',
      'break_hours',
    ])
  }

  function getRegularHours(log) {
    const explicit = getNumberFromObject(log, [
      'regular_hours',
      'reg_hours',
      'reg',
      'paid_hours',
      'net_hours',
      'total_hours',
      'worked_hours',
      'hours',
    ], null)

    if (explicit !== null) return Math.min(Math.max(explicit, 0), 12)

    const inRaw = log.clock_in || log.check_in || log.in_time || log.start_time || log.first_in || log.time_in
    const outRaw = log.clock_out || log.check_out || log.out_time || log.end_time || log.last_out || log.time_out

    if (!inRaw || !outRaw) return 0

    const inDate = new Date(inRaw)
    const outDate = new Date(outRaw)

    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return 0

    const grossHours = Math.max((outDate.getTime() - inDate.getTime()) / 3600000, 0)
    const lunchHours = getLunchHours(log)
    return Math.min(Math.max(grossHours - lunchHours, 0), 12)
  }

  function getEmployeeHourlyRate(employee) {
    const rate = Number(employee.hourly_rate || 0)
    return Number.isNaN(rate) ? 0 : rate
  }

  function getLogLaborAmount(log, employee) {
    const explicit = getNumberFromObject(log, [
      'labor',
      'labor_amount',
      'gross_pay',
      'pay_amount',
      'amount',
    ], null)

    if (explicit !== null) return explicit
    return getRegularHours(log) * getEmployeeHourlyRate(employee)
  }

  function roundDollars(value) {
    const number = Number(value || 0)
    if (!Number.isFinite(number)) return 0
    return Math.round(number)
  }

  function formatMoney(value) {
    return `$${roundDollars(value).toLocaleString('en-US')}`
  }

  function formatCsvMoney(value) {
    return String(roundDollars(value))
  }

  function formatHours(value) {
    const number = Number(value || 0)
    return number.toFixed(2).replace(/\.00$/, '')
  }

  function findEmployeeDeductions(employee, deductionsRows) {
    const employeeId = String(employee.id || '')
    const employeeNumber = String(employee.employee_number || '')
    const zktUserId = String(employee.zkt_user_id || '')

    return (deductionsRows || []).filter((row) => {
      const rowEmployeeId = String(
        row.employee_id || row.employee_uuid || row.worker_id || row.user_id || ''
      )
      const rowEmployeeNumber = String(row.employee_number || '')
      const rowZktUserId = String(row.zkt_user_id || row.zkt_user || '')

      return (
        (employeeId && rowEmployeeId === employeeId) ||
        (employeeNumber && rowEmployeeNumber === employeeNumber) ||
        (zktUserId && rowZktUserId === zktUserId)
      )
    })
  }

  function sumDeductions(rows, keys) {
    return (rows || []).reduce((sum, row) => sum + getNumberFromObject(row, keys), 0)
  }

  function getEmployeePayroll(employee, week, logsByEmployeeAndDate, deductionsRows) {
    const hourlyRate = getEmployeeHourlyRate(employee)

    const days = week.days.map((day) => {
      const dayText = toLocalDateString(day)
      const dayLogs = logsByEmployeeAndDate.get(`${employee.id}__${dayText}`) || []

      let totalHours = 0
      let totalLunchHours = 0
      let baseLabor = 0

      const rows = dayLogs.map((log) => {
        const hours = getRegularHours(log)
        const lunchHours = getLunchHours(log)
        const labor = employee.pay_type === 'hourly' ? hours * hourlyRate : getLogLaborAmount(log, employee)

        totalHours += hours
        totalLunchHours += lunchHours
        baseLabor += labor

        return {
          inTime: getLogInTime(log),
          outTime: getLogOutTime(log),
          lunchHours,
          regularHours: hours,
          labor,
          status: log.status || log.note || log.notes || '',
        }
      })

      return {
        date: day,
        dateText: dayText,
        rows,
        totalRegularHours: totalHours,
        totalLunchHours,
        totalLabor: baseLabor,
      }
    })

    const totalHours = days.reduce((sum, day) => sum + day.totalRegularHours, 0)

    const overtimeEnabled = employee?.overtime_enabled === true

    let regularHours = totalHours
    let overtimeHours = 0
    let regularLabor = 0
    let overtimeLabor = 0

    if (employee.pay_type === 'hourly') {
      if (overtimeEnabled) {
        regularHours = Math.min(totalHours, 40)
        overtimeHours = Math.max(totalHours - 40, 0)
        regularLabor = regularHours * hourlyRate
        overtimeLabor = overtimeHours * hourlyRate * 1.5
      } else {
        regularHours = totalHours
        overtimeHours = 0
        regularLabor = regularHours * hourlyRate
        overtimeLabor = 0
      }
    } else if (employee.pay_type === 'monthly') {
      const monthly = Number(employee.monthly_salary || 0)
      regularHours = 0
      overtimeHours = 0
      regularLabor = Number.isNaN(monthly) ? 0 : monthly / 4.333333
      overtimeLabor = 0
    } else if (employee.pay_type === 'one_time') {
      const amount = Number(employee.monthly_salary || 0)
      regularHours = 0
      overtimeHours = 0
      regularLabor = Number.isNaN(amount) ? 0 : amount
      overtimeLabor = 0
    } else {
      regularLabor = days.reduce((sum, day) => sum + day.totalLabor, 0)
      overtimeLabor = 0
    }

    const grossPay = regularLabor + overtimeLabor
    const mainTax = regularLabor * 0.153
    const overtimeTax = overtimeLabor * 0.27
    const employeeTaxAmount = roundDollars(mainTax + overtimeTax)

    const employeeDeductions = findEmployeeDeductions(employee, deductionsRows)
    const deductions = {
      tax: employeeTaxAmount,
      rent: roundDollars(sumDeductions(employeeDeductions, ['rent'])),
      electric: roundDollars(sumDeductions(employeeDeductions, ['electric', 'electricity'])),
      water: roundDollars(sumDeductions(employeeDeductions, ['water'])),
      clean: roundDollars(sumDeductions(employeeDeductions, ['clean', 'cleaning'])),
      transport: roundDollars(sumDeductions(employeeDeductions, ['transport', 'transportation'])),
    }

    const otherDeductions = deductions.rent + deductions.electric + deductions.water + deductions.clean + deductions.transport
    const totalDeductions = deductions.tax + otherDeductions
    const netPay = roundDollars(grossPay) - totalDeductions

    return {
      employee,
      days,
      totalRegularHours: totalHours,
      regularHours,
      overtimeHours,
      regularLabor: roundDollars(regularLabor),
      overtimeLabor: roundDollars(overtimeLabor),
      mainTax: roundDollars(mainTax),
      overtimeTax: roundDollars(overtimeTax),
      grossPay: roundDollars(grossPay),
      deductions,
      otherDeductions,
      totalDeductions,
      netPay,
    }
  }

  function buildPayrollRows(week, logs, deductionsRows) {
    const logsByEmployeeAndDate = new Map()

    logs.forEach((log) => {
      const employeeId = getLogEmployeeId(log)
      const dateText = getLogDate(log)

      if (!employeeId || !dateText) return

      const key = `${employeeId}__${dateText}`
      const current = logsByEmployeeAndDate.get(key) || []
      current.push(log)
      logsByEmployeeAndDate.set(key, current)
    })

    return employees.map((employee) =>
      getEmployeePayroll(employee, week, logsByEmployeeAndDate, deductionsRows)
    )
  }

  function buildDayCompactHtml(day) {
    if (!day.rows.length) return '<span class="muted">—</span>'

    return day.rows
      .map((row) => {
        const time = `${escapeHtml(row.inTime || '—')}-${escapeHtml(row.outTime || '—')}`
        const lunch = Number(row.lunchHours || 0) > 0 ? ` L:${formatHours(row.lunchHours)}` : ''
        return `<div>${time}<br/><b>${formatHours(row.regularHours)}h</b>${lunch}</div>`
      })
      .join('')
  }

  function buildPayrollReportHtml(week, logs, deductionsRows) {
    const payrollRows = buildPayrollRows(week, logs, deductionsRows)

    const grandGross = payrollRows.reduce((sum, item) => sum + item.grossPay, 0)
    const grandRegularLabor = payrollRows.reduce((sum, item) => sum + item.regularLabor, 0)
    const grandOvertimeLabor = payrollRows.reduce((sum, item) => sum + item.overtimeLabor, 0)
    const grandTax = payrollRows.reduce((sum, item) => sum + item.deductions.tax, 0)
    const grandOtherDeductions = payrollRows.reduce((sum, item) => sum + item.otherDeductions, 0)
    const grandDeductions = payrollRows.reduce((sum, item) => sum + item.totalDeductions, 0)
    const grandNet = payrollRows.reduce((sum, item) => sum + item.netPay, 0)
    const grandHours = payrollRows.reduce((sum, item) => sum + item.totalRegularHours, 0)
    const grandOvertimeHours = payrollRows.reduce((sum, item) => sum + item.overtimeHours, 0)
    const generatedAt = new Date().toLocaleString('en-US')

    const dayHeaders = week.days
      .map((day) => `<th class="day-col">${escapeHtml(formatReportDate(day)).replace(', 202', '<br/>202')}</th>`)
      .join('')

    const summaryRows = payrollRows
      .map((item, index) => {
        const employee = item.employee
        const dayCells = item.days
          .map((day) => `<td class="day-cell">${buildDayCompactHtml(day)}</td>`)
          .join('')

        return `<tr>
          <td class="num tiny">${index + 1}</td>
          <td class="emp-cell">
            <b>${escapeHtml(getFullName(employee))}</b>
            <div class="muted">#${escapeHtml(employee.employee_number ?? '')} · ${escapeHtml(getPayLabel(employee))} · ${escapeHtml(getOvertimeLabel(employee))}</div>
          </td>
          ${dayCells}
          <td class="num">${formatHours(item.totalRegularHours)}</td>
          <td class="num strong">${formatHours(item.overtimeHours)}</td>
          <td class="num">${formatMoney(item.regularLabor)}</td>
          <td class="num">${formatMoney(item.overtimeLabor)}</td>
          <td class="num strong">${formatMoney(item.grossPay)}</td>
          <td class="num">${formatMoney(item.mainTax)}</td>
          <td class="num">${formatMoney(item.overtimeTax)}</td>
          <td class="num strong tax-cell">${formatMoney(item.deductions.tax)}</td>
          <td class="num">${formatMoney(item.otherDeductions)}</td>
          <td class="num strong total-net">${formatMoney(item.netPay)}</td>
        </tr>`
      })
      .join('')

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payroll Report ${week.startText} - ${week.endText}</title>
  <style>
    @page { size: Letter landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      color: #0f172a;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
    }
    .invoice-shell { width: 100%; margin: 0 auto; }
    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      margin-bottom: 8px;
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 8px;
    }
    .brand { font-size: 10px; font-weight: 900; color: #0369a1; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 2px 0 4px; font-size: 22px; line-height: 1; color: #0f172a; }
    .period { font-size: 11px; font-weight: 800; }
    .muted { color: #64748b; font-size: 8px; line-height: 1.2; }
    .rules { margin-top: 3px; color: #334155; font-size: 8px; }
    .top-actions { display: flex; align-items: start; gap: 8px; }
    .invoice-box {
      min-width: 250px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .invoice-box-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 7px;
      border-bottom: 1px solid #e2e8f0;
    }
    .invoice-box-row:last-child { border-bottom: 0; }
    .invoice-box-label { color: #64748b; }
    .invoice-box-value { font-weight: 900; text-align: right; }
    .summary {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 5px;
      margin: 7px 0;
    }
    .summary-card {
      border: 1px solid #bae6fd;
      border-radius: 7px;
      padding: 6px;
      background: #f0f9ff;
      min-height: 38px;
    }
    .summary-card span { display: block; color: #0369a1; font-weight: 800; font-size: 7px; text-transform: uppercase; }
    .summary-card b { display: block; font-size: 13px; margin-top: 2px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: top; }
    th { background: #0369a1; color: white; text-align: left; font-size: 7px; text-transform: uppercase; line-height: 1.1; }
    td { font-size: 8px; line-height: 1.15; }
    .tiny { width: 24px; }
    .emp-cell { width: 130px; }
    .day-col { width: 66px; }
    .day-cell { min-height: 34px; color: #0f172a; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 900; }
    .tax-cell { background: #fff7ed; color: #9a3412; }
    .total-net { background: #dcfce7; color: #166534; }
    .footer-note { margin-top: 6px; color: #64748b; font-size: 8px; }
    .no-print {
      border: 0;
      border-radius: 7px;
      background: #0ea5e9;
      color: white;
      padding: 7px 10px;
      font-size: 10px;
      font-weight: 900;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; font-size: 8px; }
      .no-print { display: none !important; }
      .summary-card { padding: 4px; }
      th, td { padding: 2px 3px; }
      h1 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="invoice-shell">
    <div class="top">
      <div>
        <div class="brand">Payroll Report</div>
        <h1>Weekly Payroll</h1>
        <div class="period">Previous week: ${escapeHtml(week.startText)} - ${escapeHtml(week.endText)}</div>
        <div class="rules">If Overtime is enabled: first 40h/week at regular rate, hours over 40h at 1.5x. If No OT: all hours stay regular. Main tax 15.3%, OT tax 27%. All money rounded to whole dollars.</div>
      </div>
      <div class="top-actions">
        <div class="invoice-box">
          <div class="invoice-box-row"><span class="invoice-box-label">Generated</span><span class="invoice-box-value">${escapeHtml(generatedAt)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Workers</span><span class="invoice-box-value">${payrollRows.length}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Total tax</span><span class="invoice-box-value">${formatMoney(grandTax)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Net payroll</span><span class="invoice-box-value">${formatMoney(grandNet)}</span></div>
        </div>
        <button class="no-print" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card"><span>Workers</span><b>${payrollRows.length}</b></div>
      <div class="summary-card"><span>Total hours</span><b>${formatHours(grandHours)}</b></div>
      <div class="summary-card"><span>OT hours</span><b>${formatHours(grandOvertimeHours)}</b></div>
      <div class="summary-card"><span>Main labor</span><b>${formatMoney(grandRegularLabor)}</b></div>
      <div class="summary-card"><span>OT labor</span><b>${formatMoney(grandOvertimeLabor)}</b></div>
      <div class="summary-card"><span>Employee tax</span><b>${formatMoney(grandTax)}</b></div>
      <div class="summary-card"><span>Net payroll</span><b>${formatMoney(grandNet)}</b><div class="muted">Other deductions: ${formatMoney(grandOtherDeductions)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="tiny">#</th>
          <th class="emp-cell">Employee</th>
          ${dayHeaders}
          <th>Total h</th>
          <th>OT h</th>
          <th>Main $</th>
          <th>OT $</th>
          <th>Gross</th>
          <th>15.3%</th>
          <th>OT 27%</th>
          <th>Emp Tax</th>
          <th>Deduct.</th>
          <th>Net Pay</th>
        </tr>
      </thead>
      <tbody>${summaryRows || '<tr><td colspan="21">No employees found</td></tr>'}</tbody>
    </table>

    <div class="footer-note">Report generated from employees and employee_work_logs. Employee tax amount = main labor tax + overtime labor tax. Rent/electric/water/clean/transport stay as manual deductions when available.</div>
  </div>
</body>
</html>`
  }

  function csvCell(value) {
    const text = String(value ?? '')
    return `"${text.replace(/"/g, '""')}"`
  }

  function buildPayrollCsv(week, logs, deductionsRows) {
    const payrollRows = buildPayrollRows(week, logs, deductionsRows)
    const lines = []

    lines.push([
      'Employee No',
      'Employee Name',
      'Overtime Mode',
      'Total Hours',
      'Main Hours Up To 40',
      'Overtime Hours',
      'Main Labor',
      'Overtime Labor',
      'Gross Pay',
      'Main Tax 15.3%',
      'Overtime Tax 27%',
      'Employee Tax Amount',
      'Other Deductions',
      'Total Deductions',
      'Net Pay',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ].map(csvCell).join(','))

    payrollRows.forEach((item) => {
      const employee = item.employee
      const dayValues = item.days.map((day) => {
        if (!day.rows.length) return ''
        return day.rows
          .map((row) => `${row.inTime || '—'}-${row.outTime || '—'} ${formatHours(row.regularHours)}h L:${formatHours(row.lunchHours)}`)
          .join(' | ')
      })

      lines.push([
        employee.employee_number ?? '',
        getFullName(employee),
        getOvertimeLabel(employee),
        formatHours(item.totalRegularHours),
        formatHours(item.regularHours),
        formatHours(item.overtimeHours),
        formatCsvMoney(item.regularLabor),
        formatCsvMoney(item.overtimeLabor),
        formatCsvMoney(item.grossPay),
        formatCsvMoney(item.mainTax),
        formatCsvMoney(item.overtimeTax),
        formatCsvMoney(item.deductions.tax),
        formatCsvMoney(item.otherDeductions),
        formatCsvMoney(item.totalDeductions),
        formatCsvMoney(item.netPay),
        ...dayValues,
      ].map(csvCell).join(','))
    })

    return `Payroll Report,${week.startText} to ${week.endText}\nAll money rounded to whole dollars\n${lines.join('\n')}`
  }

  async function handlePayrollPdfReport() {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const html = buildPayrollReportHtml(week, logs, deductionsRows)

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        throw new Error('Popup blocked. Allow popups for this site and click Payroll PDF again.')
      }

      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()

      setTimeout(() => {
        try {
          printWindow.print()
        } catch (printError) {
          console.warn('Auto print failed:', printError)
        }
      }, 500)
    } catch (err) {
      console.error('handlePayrollPdfReport error:', err)
      const message = err.message || 'Failed to build payroll PDF report'
      setReportError(message)
      setError(message)
    } finally {
      setReportLoading(false)
    }
  }

  async function handlePayrollCsvExport() {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const csv = buildPayrollCsv(week, logs, deductionsRows)
      const fileName = `payroll-report-${week.startText}-to-${week.endText}.csv`

      downloadTextFile(fileName, csv, 'text/csv;charset=utf-8')
    } catch (err) {
      console.error('handlePayrollCsvExport error:', err)
      const message = err.message || 'Failed to export payroll CSV'
      setReportError(message)
      setError(message)
    } finally {
      setReportLoading(false)
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

  function getOvertimeLabel(employee) {
    return employee?.overtime_enabled ? 'OT 1.5x' : 'No OT'
  }

  function getOvertimeBadgeClass(employee) {
    return employee?.overtime_enabled
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-slate-500/15 text-slate-300 border-slate-600/40'
  }

  function getPresenceLabel(employee) {
    return employee?.is_on_site ? 'ON SITE' : 'OFF SITE'
  }

  function getPresenceBadgeClass(employee) {
    return employee?.is_on_site
      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
      : 'border-red-500/30 bg-red-500/15 text-red-300'
  }

  function formatPresenceTime(value) {
    if (!value) return '—'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getPresenceDirection(employee) {
    return employee?.last_punch_type || '—'
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
        (employee.zkt_sync_status || '').toLowerCase().includes(q) ||
        (employee.last_punch_type || '').toLowerCase().includes(q) ||
        (employee.is_on_site ? 'on site на работе present' : 'off site не на работе absent').includes(q)
      )
    })
  }, [employees, search])

  const counts = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter((e) => e.active).length,
      inactive: employees.filter((e) => !e.active).length,
      onSite: employees.filter((e) => e.is_on_site === true).length,
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
                  Total: {counts.total} · Active: {counts.active} · On site: {counts.onSite} · Inactive:{' '}
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
                placeholder="Search by number, ZKT ID, name, presence, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-[320px] rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              />
              <button
                onClick={handlePayrollPdfReport}
                disabled={reportLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reportLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                Payroll PDF
              </button>

              <button
                onClick={handlePayrollCsvExport}
                disabled={reportLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reportLoading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                CSV export
              </button>
            </div>
          </div>

          <div className="p-3">
            {error ? (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            {reportError ? (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                Payroll report error: {reportError}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-xl border border-slate-800 bg-[#08101c] px-4 py-10 text-center text-sm text-slate-400">
                Loading employees...
              </div>
            ) : (
              <div className="hidden overflow-x-auto rounded-xl border border-slate-800 lg:block">
                <div className="min-w-[1900px]">
                  <div className="grid grid-cols-[70px_230px_110px_140px_170px_110px_110px_120px_135px_190px_360px] bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <div>No.</div>
                    <div>Name</div>
                    <div>ZKT ID</div>
                    <div>Presence</div>
                    <div>Last punch</div>
                    <div>Direction</div>
                    <div>Payment</div>
                    <div>Overtime</div>
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
                        className="grid grid-cols-[70px_230px_110px_140px_170px_110px_110px_120px_135px_190px_360px] items-center border-t border-slate-800 bg-[#08101c] px-3 py-2 text-xs text-slate-200"
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

                        <div>
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPresenceBadgeClass(employee)}`}
                          >
                            {getPresenceLabel(employee)}
                          </span>
                        </div>

                        <div className="truncate whitespace-nowrap font-semibold text-slate-200">
                          {formatPresenceTime(employee.last_punch_time)}
                        </div>

                        <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                          {getPresenceDirection(employee)}
                        </div>

                        <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                          {getPayLabel(employee)}
                        </div>

                        <div>
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getOvertimeBadgeClass(employee)}`}
                          >
                            {getOvertimeLabel(employee)}
                          </span>
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

                          <div className="group relative">
                            <button
                              type="button"
                              disabled={zkLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              ZKT Actions
                            </button>

                            <div className="absolute right-0 top-full z-50 mt-1 hidden min-w-[180px] overflow-hidden rounded-xl border border-slate-700 bg-[#08111f] shadow-2xl group-hover:block">
                              <button
                                type="button"
                                onClick={() => handleSyncEmployeeToZkt(employee)}
                                className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-cyan-300 transition hover:bg-slate-900"
                              >
                                Sync ZKT
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteFromZkt(employee)}
                                className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-orange-300 transition hover:bg-slate-900"
                              >
                                Delete from ZKT
                              </button>

                              <button
                                type="button"
                                onClick={() => handleVerifyEmployeeInZkt(employee)}
                                className="block w-full px-4 py-3 text-left text-xs font-semibold text-purple-300 transition hover:bg-slate-900"
                              >
                                Verify selected
                              </button>
                            </div>
                          </div>

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
                          {employee.position || 'worker'} · {getPayLabel(employee)} · {getOvertimeLabel(employee)}
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
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <span className="text-slate-400">Presence</span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPresenceBadgeClass(employee)}`}
                      >
                        {getPresenceLabel(employee)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <span className="text-slate-400">Last punch</span>
                      <span className="font-semibold text-white">{formatPresenceTime(employee.last_punch_time)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <span className="text-slate-400">Direction</span>
                      <span className="font-semibold text-cyan-300">{getPresenceDirection(employee)}</span>
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
                    <div className="group relative">
                      <button
                        type="button"
                        disabled={zkLoading}
                        className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ZKT Actions
                      </button>

                      <div className="absolute right-0 top-full z-50 mt-1 hidden min-w-[190px] overflow-hidden rounded-xl border border-slate-700 bg-[#08111f] shadow-2xl group-hover:block">
                        <button
                          type="button"
                          onClick={() => handleSyncEmployeeToZkt(employee)}
                          className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-cyan-300 transition hover:bg-slate-900"
                        >
                          Sync ZKT
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteFromZkt(employee)}
                          className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-orange-300 transition hover:bg-slate-900"
                        >
                          Delete from ZKT
                        </button>

                        <button
                          type="button"
                          onClick={() => handleVerifyEmployeeInZkt(employee)}
                          className="block w-full px-4 py-3 text-left text-xs font-semibold text-purple-300 transition hover:bg-slate-900"
                        >
                          Verify selected
                        </button>
                      </div>
                    </div>
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
