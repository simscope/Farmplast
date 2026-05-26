import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Upload,
  Loader2,
  CalendarDays,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EmployeeModal from '../components/EmployeeModal'
import PayrollReport from '../components/PayrollReport'
import WorkersList from '../components/workers/WorkersList'
import { useEmployeeList } from '../hooks/useEmployeeList'
import {
  calculatePayrollTotals,
  normalizePayrollRow,
} from '../utils/payrollMath'
import { calculatePaystubDetails } from '../lib/payrollTaxMath'
import {
  createFarmplastBackup,
  downloadJson,
  getBackupFileName,
} from '../utils/backupExport'
import PayrollCheck from '../components/payroll/PayrollCheck'
import CompanyPayrollCheck from '../components/payroll/CompanyPayrollCheck'
import '../components/payroll/PayrollCheck.css'

const cardClass = 'rounded-xl border border-slate-800 bg-[#0b1220] shadow-sm'
const MAX_OPEN_SHIFT_MINUTES = 13 * 60
const RECENT_OUT_MINUTES = 15 * 60

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function getCurrentWeekRange() {
  const today = new Date()
  const currentDay = today.getDay() || 7

  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  start.setDate(today.getDate() - currentDay + 1)

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

function formatCheckDate(value) {
  if (!value) return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

function addMinutes(date, minutes) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  d.setMinutes(d.getMinutes() + minutes)
  return d
}

function getMinutesSince(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / 60000)
}

function normalizeShiftType(value) {
  return String(value || 'day').toLowerCase() === 'night' ? 'night' : 'day'
}

function getShiftLabel(employee) {
  return normalizeShiftType(employee?.shift_type) === 'night' ? 'NIGHT' : 'DAY'
}

function getShiftBadgeClass(employee) {
  return normalizeShiftType(employee?.shift_type) === 'night'
    ? 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300'
    : 'border-sky-500/30 bg-sky-500/15 text-sky-300'
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

const defaultTaxProfile = {
  federal_filing_status: 'single',
  federal_w4_step3: '0',
  federal_w4_step4a: '0',
  federal_w4_step4b: '0',
  federal_w4_step4c: '0',
  nj_withholding_rate: 'A',
  nj_allowances: '0',
  nj_additional_withholding: '0',
  nj_exempt: false,
}

function normalizeTaxProfile(profile = {}) {
  return {
    federal_filing_status: profile.federal_filing_status || 'single',
    federal_w4_step3: String(profile.federal_w4_step3 ?? '0'),
    federal_w4_step4a: String(profile.federal_w4_step4a ?? '0'),
    federal_w4_step4b: String(profile.federal_w4_step4b ?? '0'),
    federal_w4_step4c: String(profile.federal_w4_step4c ?? '0'),
    nj_withholding_rate: profile.nj_withholding_rate || 'A',
    nj_allowances: String(profile.nj_allowances ?? '0'),
    nj_additional_withholding: String(profile.nj_additional_withholding ?? '0'),
    nj_exempt: profile.nj_exempt === true,
  }
}

function buildTaxProfilePayload(form, employeeId) {
  return {
    employee_id: employeeId,
    federal_filing_status: form.federal_filing_status || 'single',
    federal_w4_step3: Number(form.federal_w4_step3 || 0),
    federal_w4_step4a: Number(form.federal_w4_step4a || 0),
    federal_w4_step4b: Number(form.federal_w4_step4b || 0),
    federal_w4_step4c: Number(form.federal_w4_step4c || 0),
    nj_withholding_rate: form.nj_withholding_rate || 'A',
    nj_allowances: Number(form.nj_allowances || 0),
    nj_additional_withholding: Number(form.nj_additional_withholding || 0),
    nj_exempt: form.nj_exempt === true,
  }
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
    downtime_enabled: true,
    shift_type: 'day',
    active: true,
    exclude_from_payroll_report: false,
    hire_date: '',
    employer_form: 'W2',
    company_name: '',
    company_id: null,
    photo_url: '',
    zkt_enabled: true,
    zkt_user_id: '',
    zkt_name: '',
    zkt_password: '',
    zkt_card_number: '',
    zkt_privilege: '0',
    ...defaultTaxProfile,
  }

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [zkLoading, setZkLoading] = useState(false)
  const [zkStatus, setZkStatus] = useState('')
  const [activeCommandId, setActiveCommandId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [selectedCheckIds, setSelectedCheckIds] = useState([])
  const {
    employeeSort,
    filteredEmployees,
    handleEmployeeSort,
    search,
    setSearch,
  } = useEmployeeList(employees, {
    getFullName,
    getShiftLabel,
    normalizeShiftType,
  })

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
          downtime_enabled,
          shift_type,
          active,
          exclude_from_payroll_report,
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
          is_on_site,
          last_work_date,
          absence_days,
          presence_status
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const week = getCurrentWeekRange()

      const { data: workLogs, error: workLogsError } = await supabase
        .from('employee_work_logs')
        .select('employee_id, work_date, time_in, time_out, missed_punch, auto_closed_reason, punch_error')
        .gte('work_date', week.startText)
        .lte('work_date', week.endText)
        .eq('is_deleted', false)
        .order('work_date', { ascending: true })

      if (workLogsError) throw workLogsError

      const employeeIds = (data || []).map((employee) => employee.id).filter(Boolean)
      const employeePaymentMetaById = new Map()
      const taxProfileByEmployeeId = new Map()

      if (employeeIds.length > 0) {
        const { data: paymentMetaRows, error: paymentMetaError } = await supabase
          .from('employees')
          .select('id, company_id, last_payment_date, last_payment_amount, last_check_number')
          .in('id', employeeIds)

        if (paymentMetaError) throw paymentMetaError

        ;(paymentMetaRows || []).forEach((row) => {
          employeePaymentMetaById.set(row.id, row)
        })

        const { data: taxProfileRows, error: taxProfileError } = await supabase
          .from('employee_tax_profiles')
          .select('*')
          .in('employee_id', employeeIds)

        if (taxProfileError) {
          console.warn('employee_tax_profiles load skipped:', taxProfileError)
        } else {
          ;(taxProfileRows || []).forEach((row) => {
            taxProfileByEmployeeId.set(row.employee_id, row)
          })
        }
      }

      const punchErrorsByEmployee = new Map()

      ;(workLogs || []).forEach((log) => {
        const errorText = String(
          log.punch_error || log.auto_closed_reason || ''
        ).trim()
        const hasError = log.missed_punch === true || Boolean(errorText)

        if (!hasError || !log.employee_id) return

        const current = punchErrorsByEmployee.get(log.employee_id) || []
        current.push({
          work_date: log.work_date,
          time_in: log.time_in,
          time_out: log.time_out,
          error: errorText || 'Punch error',
        })
        punchErrorsByEmployee.set(log.employee_id, current)
      })

      const employeesWithPunchErrors = (data || []).map((employee) => {
        const paymentMeta = employeePaymentMetaById.get(employee.id) || {}

        return {
          ...employee,
          company_id: paymentMeta.company_id || null,
          last_payment_date: paymentMeta.last_payment_date || null,
          last_payment_amount: paymentMeta.last_payment_amount ?? null,
          last_check_number: paymentMeta.last_check_number ?? null,
          tax_profile: normalizeTaxProfile(taxProfileByEmployeeId.get(employee.id)),
          punch_errors_week: punchErrorsByEmployee.get(employee.id) || [],
          punch_errors_week_start: week.startText,
          punch_errors_week_end: week.endText,
        }
      })

      setEmployees(employeesWithPunchErrors)
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
      downtime_enabled: employee.downtime_enabled ?? true,
      shift_type: normalizeShiftType(employee.shift_type),
      active: employee.active ?? true,
      exclude_from_payroll_report: employee.exclude_from_payroll_report === true,
      hire_date: employee.hire_date || '',
      employer_form: employee.employer_form || 'W2',
      company_name: employee.company_name || '',
      company_id: employee.company_id || null,
      photo_url: employee.photo_url || '',
      zkt_enabled: employee.zkt_enabled ?? true,
      zkt_user_id: employee.zkt_user_id ?? employee.employee_number ?? '',
      zkt_name: employee.zkt_name || '',
      zkt_password: employee.zkt_password || '',
      zkt_card_number: employee.zkt_card_number ?? '',
      zkt_privilege: employee.zkt_privilege ?? '0',
      ...normalizeTaxProfile(employee.tax_profile),
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
        downtime_enabled: form.downtime_enabled !== false,
        shift_type: normalizeShiftType(form.shift_type),
        active: Boolean(form.active),
        exclude_from_payroll_report: form.exclude_from_payroll_report === true,
        hire_date: form.hire_date || null,
        employer_form: form.employer_form || null,
        company_name: null,
        company_id:
          form.employer_form === 'Other'
            ? form.company_id || null
            : null,
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

      let savedEmployeeId = form.id

      if (form.id) {
        const { error } = await supabase.from('employees').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('employees')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        savedEmployeeId = data?.id
      }

      if (savedEmployeeId) {
        const { error: taxProfileError } = await supabase
          .from('employee_tax_profiles')
          .upsert(buildTaxProfilePayload(form, savedEmployeeId), {
            onConflict: 'employee_id',
          })

        if (taxProfileError) {
          console.warn('employee_tax_profiles save skipped:', taxProfileError)
        }
      }

      await rebuildZktWorkLogs()
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

  async function rebuildZktWorkLogs() {
    const { error } = await supabase.rpc('process_zkt_attendance_to_work_logs')
    if (error) throw error
  }

  async function handleShiftChange(employeeId, shiftType) {
    const nextShiftType = normalizeShiftType(shiftType)

    try {
      setError('')

      const { error } = await supabase
        .from('employees')
        .update({ shift_type: nextShiftType })
        .eq('id', employeeId)

      if (error) throw error

      await rebuildZktWorkLogs()
      await loadEmployees()
    } catch (err) {
      console.error('handleShiftChange error:', err)
      setError(err.message || 'Failed to update shift and rebuild ZKT work logs')
      await loadEmployees()
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
    const normalizedRows = week.days.flatMap((day) => {
      const dayText = toLocalDateString(day)
      const dayLogs = logsByEmployeeAndDate.get(`${employee.id}__${dayText}`) || []

      return dayLogs.map((log) => normalizePayrollRow(log, employee))
    })

    const payrollTotals = calculatePayrollTotals(normalizedRows, employee)
    const calculatedRows = payrollTotals.rows || normalizedRows
    const employeeDeductions = findEmployeeDeductions(employee, deductionsRows)

    const rentNum = roundDollars(sumDeductions(employeeDeductions, ['rent']))
    const electricNum = roundDollars(sumDeductions(employeeDeductions, ['electric', 'electricity']))
    const waterNum = roundDollars(sumDeductions(employeeDeductions, ['water']))
    const cleanNum = roundDollars(sumDeductions(employeeDeductions, ['clean', 'cleaning']))
    const transportNum = roundDollars(sumDeductions(employeeDeductions, ['transport', 'transportation']))
    const manualDeductions = roundDollars(rentNum + electricNum + waterNum + cleanNum + transportNum)

    const taxTotals = calculatePaystubDetails({
      employee,
      taxProfile: employee.tax_profile,
      logs: calculatedRows,
      deductions: {
        rent: rentNum,
        electric: electricNum,
        water: waterNum,
        clean: cleanNum,
        transport: transportNum,
      },
      periodStart: week.startText,
      periodEnd: week.endText,
    })
    const employeeTaxNum = roundDollars(taxTotals.totalEmployeeTaxes || 0)
    const mainTaxNum = roundDollars(
      (taxTotals.employeeTaxes || []).find((tax) => tax.key === 'federalIncomeTax')?.amount || 0
    )
    const overtimeTaxNum = roundDollars(employeeTaxNum - mainTaxNum)
    const totalDeductions = roundDollars(employeeTaxNum + manualDeductions)
    const netPay = roundDollars(Number(taxTotals.netPay || 0))

    const rowsByDate = {}
    calculatedRows.forEach((row) => {
      if (row?.work_date) rowsByDate[row.work_date] = row
    })

    const days = week.days.map((day) => {
      const dayText = toLocalDateString(day)
      const rows = calculatedRows
        .filter((row) => row?.work_date === dayText)
        .map((row) => ({
          inTime: row.time_in ? String(row.time_in).slice(0, 5) : '',
          outTime: row.time_out ? String(row.time_out).slice(0, 5) : '',
          lunchHours: Number(row.lunch_hours || 0),
          downtimeHours: Number(row.downtime_hours || 0),
          regularHours: Number(row.reg_hours || 0),
          labor: Number(row.labor_amount || 0),
          status: row.punch_error || row.auto_closed_reason || row.status || row.note || '',
        }))

      return {
        date: day,
        dateText: dayText,
        rows,
        totalRegularHours: rows.reduce((sum, row) => sum + Number(row.regularHours || 0), 0),
        totalLunchHours: rows.reduce((sum, row) => sum + Number(row.lunchHours || 0), 0),
        totalLabor: rows.reduce((sum, row) => sum + Number(row.labor || 0), 0),
      }
    })

    const checkTotals = {
      ...payrollTotals,
      employeeTaxNum,
      mainTax: mainTaxNum,
      overtimeTax: overtimeTaxNum,
      employeeTaxes: taxTotals.employeeTaxes || [],
      rows: calculatedRows,
      filteredForView: calculatedRows,
      rowsByDate,
      taxableHours: payrollTotals.mainHours,
      taxableLabor: payrollTotals.mainLabor,
      rentNum,
      electricNum,
      waterNum,
      cleanNum,
      transportNum,
      employeeDeductions: manualDeductions,
      totalDeductions,
      netPay,
    }

    return {
      employee,
      rows: calculatedRows,
      rowsByDate,
      totals: checkTotals,
      checkTotals,
      days,
      totalRegularHours: Number(payrollTotals.totalReg || 0),
      regularHours: Number(payrollTotals.mainHours || 0),
      overtimeHours: Number(payrollTotals.overtimeHours || 0),
      regularLabor: roundDollars(payrollTotals.mainLabor || 0),
      overtimeLabor: roundDollars(payrollTotals.overtimeLabor || 0),
      mainTax: mainTaxNum,
      overtimeTax: overtimeTaxNum,
      grossPay: roundDollars(payrollTotals.totalLabor || 0),
      deductions: {
        tax: employeeTaxNum,
        rent: rentNum,
        electric: electricNum,
        water: waterNum,
        clean: cleanNum,
        transport: transportNum,
      },
      otherDeductions: manualDeductions,
      totalDeductions,
      netPay,
    }
  }


  function buildPayrollRows(week, logs, deductionsRows, options = {}) {
    const logsByEmployeeAndDate = new Map()
    const includeExcluded = options.includeExcluded === true
    const excludedOnly = options.excludedOnly === true
    const sourceEmployees = excludedOnly
      ? employees.filter((employee) => employee.exclude_from_payroll_report === true)
      : includeExcluded
        ? employees
        : employees.filter((employee) => employee.exclude_from_payroll_report !== true)

    logs.forEach((log) => {
      const employeeId = getLogEmployeeId(log)
      const dateText = getLogDate(log)

      if (!employeeId || !dateText) return

      const key = `${employeeId}__${dateText}`
      const current = logsByEmployeeAndDate.get(key) || []
      current.push(log)
      logsByEmployeeAndDate.set(key, current)
    })

    return sourceEmployees.map((employee) =>
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

  function buildPayrollReportHtml(week, logs, deductionsRows, options = {}) {
    const payrollRows = buildPayrollRows(week, logs, deductionsRows, options)
    const isExcludedReport = options.excludedOnly === true
    const reportBrand = isExcludedReport ? 'Excluded Payroll Report' : 'Payroll Report'
    const reportTitle = isExcludedReport ? 'Excluded Weekly Payroll' : 'Weekly Payroll'

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
  <title>${escapeHtml(reportBrand)} ${week.startText} - ${week.endText}</title>
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
        <div class="brand">${escapeHtml(reportBrand)}</div>
        <h1>${escapeHtml(reportTitle)}</h1>
        <div class="period">Previous week: ${escapeHtml(week.startText)} - ${escapeHtml(week.endText)}</div>
        <div class="rules">If Overtime is enabled: first 40h/week at regular rate, hours over 40h at 1.5x. Employee tax uses the W-4/NJ-W4 payroll tax profile. All money rounded to whole dollars.</div>
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
          <th>Federal tax</th>
          <th>Other emp tax</th>
          <th>Emp Tax</th>
          <th>Deduct.</th>
          <th>Net Pay</th>
        </tr>
      </thead>
      <tbody>${summaryRows || '<tr><td colspan="21">No employees found</td></tr>'}</tbody>
    </table>

    <div class="footer-note">${isExcludedReport ? 'Excluded payroll report generated only for employees marked as excluded from the main payroll report.' : 'Report generated from employees and employee_work_logs.'} Employee tax uses the W-4/NJ-W4 payroll tax profile. Rent/electric/water/clean/transport stay as manual deductions when available.</div>
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
      'Federal Tax',
      'Other Employee Tax',
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

  function mapPayrollRowToCheckTotals(item) {
    if (item?.checkTotals) return item.checkTotals
    if (item?.totals) return item.totals

    return {
      mainHours: item.regularHours,
      overtimeHours: item.overtimeHours,
      totalLabor: item.grossPay,
      mainLabor: item.regularLabor,
      overtimeLabor: item.overtimeLabor,
      employeeTaxNum: item.deductions?.tax || 0,
      rentNum: item.deductions?.rent || 0,
      electricNum: item.deductions?.electric || 0,
      waterNum: item.deductions?.water || 0,
      cleanNum: item.deductions?.clean || 0,
      transportNum: item.deductions?.transport || 0,
      netPay: item.netPay,
      rows: item.rows || [],
      filteredForView: item.rows || [],
      rowsByDate: item.rowsByDate || {},
    }
  }


  function copyPrintStylesToWindow(printDocument) {
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((node) => {
      try {
        printDocument.head.appendChild(node.cloneNode(true))
      } catch (err) {
        console.warn('Could not copy print style node:', err)
      }
    })

    const style = printDocument.createElement('style')
    style.textContent = `
      @page { size: 215.9mm 279.4mm; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; color: black; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root { background: white; }
      .dashboard-selected-checks-print { background: white; }
      .dashboard-selected-checks-print > * { page-break-after: always; break-after: page; }
      .dashboard-selected-checks-print > *:last-child { page-break-after: auto; break-after: auto; }
    `
    printDocument.head.appendChild(style)
  }

  function openSelectedChecksPrintWindow(week, payrollRows) {
    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      throw new Error('Popup blocked. Allow popups for this site and click Print selected checks again.')
    }

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Selected payroll checks</title>
</head>
<body>
  <div id="print-root"></div>
</body>
</html>`)
    printWindow.document.close()

    copyPrintStylesToWindow(printWindow.document)

    const rootElement = printWindow.document.getElementById('print-root')
    const root = createRoot(rootElement)
    const payDate = toLocalDateString(new Date())

    root.render(
      <div className="dashboard-selected-checks-print">
        {payrollRows.map((item) => {
          const employee = item.employee
          const checkNumber = item.print_check_number || employee?.last_check_number || 0

          const totals = item.checkTotals || item.totals || mapPayrollRowToCheckTotals(item)

          if (item.grouped_company) {
            return (
              <CompanyPayrollCheck
                key={`${employee.id}-${checkNumber}`}
                companyName={item.fullName || getFullName(employee)}
                groupedItems={item.grouped_items || []}
                totals={totals}
                periodStart={week.startText}
                periodEnd={week.endText}
                checkNumber={checkNumber}
                payDate={payDate}
              />
            )
          }

          return (
            <PayrollCheck
              key={`${employee.id}-${checkNumber}`}
              employee={employee}
              fullName={item.fullName || getFullName(employee)}
              totals={totals}
              periodStart={week.startText}
              periodEnd={week.endText}
              checkNumber={checkNumber}
              payDate={payDate}
            />
          )
        })}
      </div>
    )

    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 500)
  }

  function toggleSelectedCheck(employeeId) {
    setSelectedCheckIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    )
  }

  function toggleAllVisibleChecks() {
    const visibleIds = filteredEmployees.map((employee) => employee.id).filter(Boolean)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCheckIds.includes(id))

    setSelectedCheckIds((prev) => {
      if (allSelected) return prev.filter((id) => !visibleIds.includes(id))
      return Array.from(new Set([...prev, ...visibleIds]))
    })
  }


  function mergeCompanyPayrollRows(payrollRows, companyLookup = new Map()) {
    const output = []
    const companyGroups = new Map()

    for (const item of payrollRows) {
      const employee = item.employee || {}
      const companyId = employee.company_id
      const isCompanyEmployee =
        employee.employer_form === 'Other' &&
        companyId

      if (!isCompanyEmployee) {
        output.push(item)
        continue
      }

      const key = String(companyId)

      if (!companyGroups.has(key)) {
        const companyName =
          companyLookup.get(key) ||
          employee.company_name ||
          employee.company_display_name ||
          getFullName(employee)

        companyGroups.set(key, {
          companyId: key,
          companyName,
          items: [],
        })
      }

      companyGroups.get(key).items.push(item)
    }

    for (const group of companyGroups.values()) {
      const firstItem = group.items[0]
      const firstEmployee = firstItem.employee || {}
      const baseTotals = firstItem.checkTotals || firstItem.totals || mapPayrollRowToCheckTotals(firstItem)

      const combinedTotals = {
        ...baseTotals,
        mainHours: 0,
        taxableHours: 0,
        overtimeHours: 0,
        totalLabor: 0,
        mainLabor: 0,
        taxableLabor: 0,
        overtimeLabor: 0,
        employeeTaxNum: 0,
        rentNum: 0,
        electricNum: 0,
        waterNum: 0,
        cleanNum: 0,
        transportNum: 0,
        employeeDeductions: 0,
        totalDeductions: 0,
        netPay: 0,
        rows: [],
        filteredForView: [],
        rowsByDate: {},
      }

      for (const item of group.items) {
        const totals = item.checkTotals || item.totals || mapPayrollRowToCheckTotals(item)

        combinedTotals.mainHours += Number(totals.mainHours || totals.taxableHours || 0)
        combinedTotals.taxableHours += Number(totals.taxableHours || totals.mainHours || 0)
        combinedTotals.overtimeHours += Number(totals.overtimeHours || 0)
        combinedTotals.totalLabor += Number(totals.totalLabor || 0)
        combinedTotals.mainLabor += Number(totals.mainLabor || totals.taxableLabor || 0)
        combinedTotals.taxableLabor += Number(totals.taxableLabor || totals.mainLabor || 0)
        combinedTotals.overtimeLabor += Number(totals.overtimeLabor || 0)
        combinedTotals.employeeTaxNum += Number(totals.employeeTaxNum || 0)
        combinedTotals.rentNum += Number(totals.rentNum || 0)
        combinedTotals.electricNum += Number(totals.electricNum || 0)
        combinedTotals.waterNum += Number(totals.waterNum || 0)
        combinedTotals.cleanNum += Number(totals.cleanNum || 0)
        combinedTotals.transportNum += Number(totals.transportNum || 0)
        combinedTotals.employeeDeductions += Number(totals.employeeDeductions || 0)
        combinedTotals.totalDeductions += Number(totals.totalDeductions || 0)
        combinedTotals.netPay += Number(totals.netPay || 0)

        combinedTotals.rows.push(...(totals.rows || item.rows || []))
        combinedTotals.filteredForView.push(...(totals.filteredForView || item.rows || []))

        Object.entries(totals.rowsByDate || item.rowsByDate || {}).forEach(([dateKey, row]) => {
          combinedTotals.rowsByDate[dateKey] = row
        })
      }

      const groupedEmployee = {
        ...firstEmployee,
        id: `company-${group.companyId}`,
        first_name: group.companyName,
        last_name: '',
        employee_number: '',
        company_id: group.companyId,
        company_name: group.companyName,
      }

      output.push({
        ...firstItem,
        employee: groupedEmployee,
        fullName: group.companyName,
        grouped_company: true,
        grouped_items: group.items,
        rows: combinedTotals.rows,
        rowsByDate: combinedTotals.rowsByDate,
        totals: combinedTotals,
        checkTotals: combinedTotals,
        regularHours: combinedTotals.mainHours,
        overtimeHours: combinedTotals.overtimeHours,
        regularLabor: roundDollars(combinedTotals.mainLabor),
        overtimeLabor: roundDollars(combinedTotals.overtimeLabor),
        mainTax: group.items.reduce((sum, item) => sum + Number(item.mainTax || 0), 0),
        overtimeTax: group.items.reduce((sum, item) => sum + Number(item.overtimeTax || 0), 0),
        grossPay: roundDollars(combinedTotals.totalLabor),
        deductions: {
          tax: roundDollars(combinedTotals.employeeTaxNum),
          rent: roundDollars(combinedTotals.rentNum),
          electric: roundDollars(combinedTotals.electricNum),
          water: roundDollars(combinedTotals.waterNum),
          clean: roundDollars(combinedTotals.cleanNum),
          transport: roundDollars(combinedTotals.transportNum),
        },
        otherDeductions: roundDollars(combinedTotals.employeeDeductions),
        totalDeductions: roundDollars(combinedTotals.totalDeductions),
        netPay: roundDollars(combinedTotals.netPay),
      })
    }

    return output
  }

  async function loadCompanyLookupForPayrollRows(payrollRows) {
    const companyIds = Array.from(
      new Set(
        payrollRows
          .map((item) => item.employee?.company_id)
          .filter(Boolean)
          .map(String)
      )
    )

    const companyLookup = new Map()

    if (companyIds.length === 0) {
      return companyLookup
    }

    const { data, error } = await supabase
      .from('employee_companies')
      .select('id, company_name')
      .in('id', companyIds)

    if (error) throw error

    ;(data || []).forEach((company) => {
      companyLookup.set(String(company.id), company.company_name)
    })

    return companyLookup
  }

  async function savePrintedPayrollRows(week, printRows) {
    const nowIso = new Date().toISOString()
    const today = nowIso.slice(0, 10)

    for (const item of printRows) {
      const employee = item.employee
      const totals = item.checkTotals || item.totals || mapPayrollRowToCheckTotals(item)

      const sourceItems = item.grouped_company ? item.grouped_items : [item]
      const checkEmployeeId = item.grouped_company
        ? sourceItems[0]?.employee?.id
        : employee.id

      if (!checkEmployeeId) {
        throw new Error('Employee not found for payroll check')
      }

      const { data: createdCheck, error: createCheckError } = await supabase.rpc(
        'create_payroll_check',
        {
          p_employee_id: checkEmployeeId,
          p_pay_period_start: week.startText,
          p_pay_period_end: week.endText,
          p_regular_hours: Number(totals.mainHours || totals.taxableHours || 0),
          p_overtime_hours: Number(totals.overtimeHours || 0),
          p_regular_labor: Number(totals.mainLabor || totals.taxableLabor || 0),
          p_overtime_labor: Number(totals.overtimeLabor || 0),
          p_gross_pay: Number(totals.totalLabor || 0),
          p_employee_tax: Number(totals.employeeTaxNum || 0),
          p_rent: Number(totals.rentNum || 0),
          p_electric: Number(totals.electricNum || 0),
          p_water: Number(totals.waterNum || 0),
          p_clean: Number(totals.cleanNum || 0),
          p_transport: Number(totals.transportNum || 0),
          p_net_pay: Number(totals.netPay || 0),
        }
      )

      if (createCheckError) throw createCheckError
      if (!createdCheck?.id) throw new Error('Check record was not created')
      if (!createdCheck?.check_number) throw new Error('Check number was not created')

      const nextCheckNumber = createdCheck.check_number

      const { data: printedCheck, error: printedError } = await supabase.rpc(
        'mark_payroll_check_printed',
        {
          p_check_id: createdCheck.id,
        }
      )

      if (printedError) throw printedError

      const confirmedAt =
        printedCheck?.printed_confirmed_at ||
        printedCheck?.printed_at ||
        nowIso

      for (const sourceItem of sourceItems) {
        const sourceEmployee = sourceItem.employee
        const sourceTotals =
          sourceItem.checkTotals ||
          sourceItem.totals ||
          mapPayrollRowToCheckTotals(sourceItem)

        const paymentPayload = {
          employee_id: sourceEmployee.id,
          period_start: week.startText,
          period_end: week.endText,
          total_labor: Number(sourceTotals.totalLabor || 0),
          employee_tax: Number(sourceTotals.employeeTaxNum || 0),
          rent: Number(sourceTotals.rentNum || 0),
          electric: Number(sourceTotals.electricNum || 0),
          water: Number(sourceTotals.waterNum || 0),
          clean: Number(sourceTotals.cleanNum || 0),
          transport: Number(sourceTotals.transportNum || 0),
          net_pay: Number(sourceTotals.netPay || 0),
          paid_at: confirmedAt,
        }

        const { error: paymentError } = await supabase
          .from('employee_payments')
          .insert(paymentPayload)

        if (paymentError) throw paymentError

        const { error: employeeUpdateError } = await supabase
          .from('employees')
          .update({
            last_payment_date: today,
            last_payment_amount: Number(sourceTotals.netPay || 0),
            last_check_number: nextCheckNumber,
          })
          .eq('id', sourceEmployee.id)

        if (employeeUpdateError) throw employeeUpdateError
      }

      item.print_check_number = nextCheckNumber
      employee.last_payment_date = today
      employee.last_payment_amount = Number(totals.netPay || 0)
      employee.last_check_number = nextCheckNumber
    }
  }

  async function handlePrintSingleCheck(employee) {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      if (!employee?.id) {
        throw new Error('Employee not found for check printing')
      }

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const allPayrollRows = buildPayrollRows(week, logs, deductionsRows, { includeExcluded: true })
        .filter((item) => Number(item.netPay || 0) > 0)

      let rowsToPrint = []

      if (employee.employer_form === 'Other' && employee.company_id) {
        rowsToPrint = allPayrollRows.filter(
          (item) =>
            item.employee.employer_form === 'Other' &&
            item.employee.company_id &&
            String(item.employee.company_id) === String(employee.company_id)
        )
      } else {
        rowsToPrint = allPayrollRows.filter((item) => item.employee.id === employee.id)
      }

      if (rowsToPrint.length === 0) {
        throw new Error('This employee has no net pay for previous week')
      }

      const companyLookup = await loadCompanyLookupForPayrollRows(rowsToPrint)
      const printRows = mergeCompanyPayrollRows(rowsToPrint, companyLookup)

      await savePrintedPayrollRows(week, printRows)
      openSelectedChecksPrintWindow(week, printRows)
      await loadEmployees()
    } catch (err) {
      console.error('handlePrintSingleCheck error:', err)
      const message = err.message || 'Failed to print check'
      setReportError(message)
      setError(message)
    } finally {
      setReportLoading(false)
    }
  }

  async function handlePrintSelectedChecks() {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      if (selectedCheckIds.length === 0) {
        throw new Error('Select at least one employee for check printing')
      }

      const selectedIdSet = new Set(selectedCheckIds)
      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const payrollRows = buildPayrollRows(week, logs, deductionsRows, { includeExcluded: true })
        .filter((item) => selectedIdSet.has(item.employee.id))
        .filter((item) => Number(item.netPay || 0) > 0)

      if (payrollRows.length === 0) {
        throw new Error('Selected employees have no net pay for previous week')
      }

      const companyLookup = await loadCompanyLookupForPayrollRows(payrollRows)
      const printRows = mergeCompanyPayrollRows(payrollRows, companyLookup)

      await savePrintedPayrollRows(week, printRows)
      openSelectedChecksPrintWindow(week, printRows)

      setSelectedCheckIds([])
      await loadEmployees()
    } catch (err) {
      console.error('handlePrintSelectedChecks error:', err)
      const message = err.message || 'Failed to print selected checks'
      setReportError(message)
      setError(message)
    } finally {
      setReportLoading(false)
    }
  }

  async function handleExcludedPayrollPdfReport() {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const html = buildPayrollReportHtml(week, logs, deductionsRows, { excludedOnly: true })

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        throw new Error('Popup blocked. Allow popups for this site and click Excluded Payroll PDF again.')
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
      console.error('handleExcludedPayrollPdfReport error:', err)
      const message = err.message || 'Failed to build excluded payroll PDF report'
      setReportError(message)
      setError(message)
    } finally {
      setReportLoading(false)
    }
  }

  async function handleDownloadBackup() {
    try {
      setBackupLoading(true)
      setBackupStatus('Creating backup...')
      setError('')

      const backup = await createFarmplastBackup({
        onProgress: (tableName, progress) => {
          if (progress.status === 'running') {
            setBackupStatus(`Backing up ${tableName}...`)
          }

          if (progress.status === 'done') {
            setBackupStatus(`Backed up ${tableName}: ${progress.count || 0}`)
          }
        },
      })

      const fileName = getBackupFileName()
      downloadJson(fileName, backup)

      setBackupStatus(
        backup.summary.warnings.length > 0
          ? `Backup downloaded with warnings: ${fileName}`
          : `Backup downloaded: ${fileName}`
      )
    } catch (err) {
      console.error('handleDownloadBackup error:', err)
      const message = err.message || 'Failed to create backup'
      setBackupStatus(`Backup error: ${message}`)
      setError(message)
    } finally {
      setBackupLoading(false)
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

  function getTodayText() {
    return toLocalDateString(new Date())
  }

  function normalizeDateText(value) {
    if (!value) return ''

    const asString = String(value)

    if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
      return asString
    }

    const date = new Date(asString)
    if (Number.isNaN(date.getTime())) return asString.slice(0, 10)

    return toLocalDateString(date)
  }

  function getDaysSinceDate(value) {
    const dateText = normalizeDateText(value)
    if (!dateText) return null

    const start = new Date(`${dateText}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (Number.isNaN(start.getTime())) return null

    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
    return diff >= 0 ? diff : 0
  }

  function getPresenceKind(employee) {
    const direction = String(employee?.last_punch_type || '').trim().toUpperCase()
    const minutesSinceLastPunch = getMinutesSince(employee?.last_punch_time)

    if (direction === 'IN') {
      if (Number.isFinite(minutesSinceLastPunch) && minutesSinceLastPunch > MAX_OPEN_SHIFT_MINUTES) {
        return 'open_shift'
      }

      return 'on_site'
    }

    if (direction === 'OUT') {
      if (Number.isFinite(minutesSinceLastPunch) && minutesSinceLastPunch <= RECENT_OUT_MINUTES) {
        return 'off_site'
      }

      return 'off_site'
    }

    const status = String(employee?.presence_status || '').trim().toUpperCase()

    if (status === 'ON_SITE' || status === 'PRESENT') return 'on_site'
    if (status === 'OFF_SITE') return 'off_site'

    return 'absent'
  }

  function getPresenceLabel(employee) {
    const kind = getPresenceKind(employee)

    if (kind === 'on_site') return 'ON SITE'
    if (kind === 'off_site') return 'OFF SITE'
    if (kind === 'open_shift') return 'MISSED OUT'

    const byLastPunchDate = getDaysSinceDate(employee?.last_punch_time)
    const byLastWorkDate = getDaysSinceDate(employee?.last_work_date)
    const fromView = Number(employee?.absence_days)

    const days = Number.isFinite(byLastPunchDate)
      ? byLastPunchDate
      : Number.isFinite(byLastWorkDate)
        ? byLastWorkDate
        : Number.isFinite(fromView)
          ? fromView
          : null

    if (Number.isFinite(days) && days > 0) {
      return `ABSENT ${days} ${days === 1 ? 'DAY' : 'DAYS'}`
    }

    return 'ABSENT'
  }

  function getPresenceTitle(employee) {
    const direction = String(employee?.last_punch_type || '').trim().toUpperCase()

    if (direction !== 'IN' || !employee?.last_punch_time) return ''

    const missedOutAt = addMinutes(employee.last_punch_time, MAX_OPEN_SHIFT_MINUTES)
    if (!missedOutAt) return ''

    return `MISSED OUT after: ${formatPresenceTime(missedOutAt)}`
  }

  function getPresenceBadgeClass(employee) {
    const kind = getPresenceKind(employee)

    if (kind === 'on_site') {
      return 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
    }

    if (kind === 'off_site') {
      return 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
    }

    if (kind === 'open_shift') {
      return 'border border-red-500/40 bg-red-500/15 text-red-300'
    }

    return 'text-red-400'
  }

  function formatPresenceTime(value) {
    if (!value) return '—'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'

    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getPresenceDirection(employee) {
    return employee?.last_punch_type || '—'
  }


  function normalizePunchErrorText(value) {
    const text = String(value || '').toUpperCase()

    if (text.includes('MISSED IN')) return 'MISSED IN'
    if (text.includes('MISSING OUT') || text.includes('MISSED OUT') || text.includes('OPEN SHIFT OVER')) return 'MISSED OUT'
    if (text.includes('OPEN SHIFT')) return 'OPEN SHIFT'

    return text ? 'PUNCH ERROR' : ''
  }

  function formatPunchErrorDay(value) {
    if (!value) return ''

    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
    })
  }

  function getPunchErrorItems(employee) {
    return Array.isArray(employee?.punch_errors_week)
      ? employee.punch_errors_week
      : []
  }

  function getPunchErrorLabel(employee) {
    const items = getPunchErrorItems(employee)

    if (!items.length) return 'OK'

    const shortItems = items.slice(0, 2).map((item) => {
      const type = normalizePunchErrorText(item.error)
      const day = formatPunchErrorDay(item.work_date)
      return `${day} ${type}`.trim()
    })

    const rest = items.length > 2 ? ` +${items.length - 2}` : ''
    return `${shortItems.join(' · ')}${rest}`
  }

  function getPunchErrorTitle(employee) {
    const items = getPunchErrorItems(employee)

    if (!items.length) {
      return `No punch errors for current payroll week`
    }

    return items
      .map((item) => {
        const day = formatPunchErrorDay(item.work_date)
        const time = `${formatTimeValue(item.time_in) || '—'} - ${formatTimeValue(item.time_out) || '—'}`
        return `${day}: ${normalizePunchErrorText(item.error)} (${time})`
      })
      .join('\n')
  }

  function getPunchErrorBadgeClass(employee) {
    const items = getPunchErrorItems(employee)

    if (!items.length) {
      return 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    }

    const hasMissedOut = items.some((item) =>
      normalizePunchErrorText(item.error) === 'MISSED OUT'
    )

    if (hasMissedOut) {
      return 'border border-red-500/40 bg-red-500/15 text-red-300'
    }

    return 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
  }

  const counts = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter((e) => e.active).length,
      inactive: employees.filter((e) => !e.active).length,
      onSite: employees.filter((e) => getPresenceKind(e) === 'on_site').length,
      presenceOnline: employees.filter((e) => getPresenceKind(e) === 'on_site').length,
      offSite: employees.filter((e) => getPresenceKind(e) === 'off_site').length,
      absent: employees.filter((e) => getPresenceKind(e) === 'absent').length,
      openShift: employees.filter((e) => getPresenceKind(e) === 'open_shift').length,
      punchErrors: employees.filter((e) => getPunchErrorItems(e).length > 0).length,
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
                  Total: {counts.total} · Presence: {counts.presenceOnline} online · {counts.offSite} off site · {counts.openShift} missed out · {counts.punchErrors} punch errors · {counts.absent} absent
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
                type="button"
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {backupLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {backupLoading ? 'Backup...' : 'Database Backup'}
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

          {backupStatus ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                backupStatus.startsWith('Backup error:')
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : backupStatus.includes('downloaded')
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-sky-500/20 bg-sky-500/10 text-sky-200'
              }`}
            >
              {backupStatus}
            </div>
          ) : null}
        </div>

        <PayrollReport employees={employees} />

        <WorkersList
          cardClass={cardClass}
          counts={counts}
          employeeSort={employeeSort}
          error={error}
          filteredEmployees={filteredEmployees}
          formatPresenceTime={formatPresenceTime}
          formatReportDate={formatReportDate}
          getFullName={getFullName}
          getOvertimeBadgeClass={getOvertimeBadgeClass}
          getOvertimeLabel={getOvertimeLabel}
          getPayLabel={getPayLabel}
          getPresenceBadgeClass={getPresenceBadgeClass}
          getPresenceDirection={getPresenceDirection}
          getPresenceLabel={getPresenceLabel}
          getPresenceTitle={getPresenceTitle}
          getPunchErrorBadgeClass={getPunchErrorBadgeClass}
          getPunchErrorLabel={getPunchErrorLabel}
          getPunchErrorTitle={getPunchErrorTitle}
          getShiftBadgeClass={getShiftBadgeClass}
          getShiftLabel={getShiftLabel}
          handleDelete={handleDelete}
          handleDeleteFromZkt={handleDeleteFromZkt}
          handleEmployeeSort={handleEmployeeSort}
          handlePrintSelectedChecks={handlePrintSelectedChecks}
          handlePrintSingleCheck={handlePrintSingleCheck}
          handleShiftChange={handleShiftChange}
          handleSyncEmployeeToZkt={handleSyncEmployeeToZkt}
          handleVerifyEmployeeInZkt={handleVerifyEmployeeInZkt}
          loading={loading}
          normalizeShiftType={normalizeShiftType}
          openEditModal={openEditModal}
          reportError={reportError}
          reportLoading={reportLoading}
          search={search}
          selectedCheckIds={selectedCheckIds}
          setSearch={setSearch}
          toggleAllVisibleChecks={toggleAllVisibleChecks}
          toggleSelectedCheck={toggleSelectedCheck}
          zkLoading={zkLoading}
        />

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
