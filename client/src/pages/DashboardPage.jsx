import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Archive,
  LogOut,
  Plus,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Loader2,
  BadgeCheck,
  ShieldCheck,
  Zap,
  FileText,
  Printer,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import useEmployeeFeatureFlags from '../hooks/useEmployeeFeatureFlags'
import useEmployeePlantTransfer from '../hooks/useEmployeePlantTransfer'
import { employeeNumberForSave } from '../utils/employeeNumber'
import {
  employeeAssignmentForEdit,
  employeeTransferNotice,
  saveEmployeeEdit,
} from '../utils/employeePlantTransfer'
import { deliverEmployeeIntegrations } from '../utils/deliverEmployeeIntegrations'
import EmployeeModal from '../components/EmployeeModal'
import EmployeeTerminationDialog from '../components/EmployeeTerminationDialog'
import PayrollReport from '../components/PayrollReport'
import SacsLink from '../components/SacsLink'
import { runEmployeeSyncTargets } from '../utils/employeeSyncTargets'
import WorkersList from '../components/workers/WorkersList'
import { useEmployeeList } from '../hooks/useEmployeeList'
import {
  calculatePayrollTotals,
  normalizePayrollRow,
} from '../utils/payrollMath'
import {
  calculatePrintedCheckYtd,
} from '../utils/paymentHistory'
import {
  getPayrollPaymentDate,
  getPayrollYtdTotals,
  loadPayrollPaymentHistory,
} from '../utils/payrollYtd'
import { calculatePaystubDetails } from '../lib/payrollTaxMath'
import {
  createFarmplastBackup,
  downloadJson,
  getBackupFileName,
} from '../utils/backupExport'
import PayrollPrintDocument from '../components/payroll/PayrollPrintDocument'
import { mapPayrollRowToCheckTotals, savePrintedPayrollRows } from '../utils/payrollPrint'
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

function normalizeDefaultLunchHours(value) {
  const hours = Number(value)
  return [0, 0.5, 1].includes(hours) ? hours : 1
}

function normalizePlantLocation(value) {
  return String(value || 'NJ').toUpperCase() === 'PA' ? 'PA' : 'NJ'
}

function getPlantLocationLabel(value) {
  return normalizePlantLocation(value) === 'PA' ? 'PA' : 'NJ'
}

function buildZktPayloadForLocation(plantLocation, extraPayload = {}) {
  return {
    ...extraPayload,
    plant_location: normalizePlantLocation(plantLocation),
  }
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
  const { signOut, role } = useAuth()
  const { flags } = useEmployeeFeatureFlags()

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
    default_lunch_hours: '1',
    plant_location: 'NJ',
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
  const [refreshingPresence, setRefreshingPresence] = useState(false)
  const [presenceCheckedAt, setPresenceCheckedAt] = useState(null)
  const employeeLoadRef = useRef(null)
  const employeeDataLoadedRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [zkLoading, setZkLoading] = useState(false)
  const [zkStatus, setZkStatus] = useState('')
  const [sacsLoading, setSacsLoading] = useState(false)
  const [sacsStatus, setSacsStatus] = useState('')
  const [activeZkAction, setActiveZkAction] = useState('')
  const [activeCommandId, setActiveCommandId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [terminationEmployee, setTerminationEmployee] = useState(null)
  const [employeeCreationNotice, setEmployeeCreationNotice] = useState('')
  const [form, setForm] = useState(emptyForm)
  const transfer = useEmployeePlantTransfer({ open: modalOpen, allowed: role === 'admin', form, setForm })
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

  function renderZktActionIcon(actionKey, icon) {
    if (activeZkAction === actionKey) {
      return <Loader2 size={15} className="animate-spin" />
    }

    return icon
  }

  useEffect(() => {
    loadEmployees()
    let debounceTimer
    const scheduleReload = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => { void loadEmployees() }, 500)
    }
    const channel = supabase.channel('dashboard-employees-cached-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_work_logs' }, scheduleReload)
      .subscribe()
    return () => { clearTimeout(debounceTimer); supabase.removeChannel(channel) }
  }, [])

  async function refreshPresence() {
    setRefreshingPresence(true)
    setError('')
    try {
      const { error: refreshError } = await supabase.rpc('refresh_employee_presence')
      if (refreshError) throw refreshError
      // Any list request already in flight may contain the previous snapshot.
      if (employeeLoadRef.current) await employeeLoadRef.current
      await loadEmployees()
    } catch (err) {
      setError(err.message || 'Failed to refresh presence')
    } finally { setRefreshingPresence(false) }
  }

  async function loadEmployees() {
    if (employeeLoadRef.current) return employeeLoadRef.current
    const request = (async () => {
    try {
      if (!employeeDataLoadedRef.current) setLoading(true)
      setError('')

      const week = getCurrentWeekRange()
      const [employeeResult, workLogResult] = await Promise.all([
      supabase
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
          presence_status,
          presence_checked_at,
          company_id,
          last_payment_date,
          last_payment_amount,
          last_check_number,
          default_lunch_hours,
          plant_location,
          tax_profile
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('employee_work_logs')
        .select('employee_id, work_date, time_in, time_out, missed_punch, auto_closed_reason, punch_error')
        .gte('work_date', week.startText)
        .lte('work_date', week.endText)
        .eq('is_deleted', false)
        .order('work_date', { ascending: true })
      ])
      const { data, error } = employeeResult
      const { data: workLogs, error: workLogsError } = workLogResult
      if (error) throw error
      if (workLogsError) throw workLogsError

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
        const paymentMeta = employee

        return {
          ...employee,
          company_id: paymentMeta.company_id || null,
          last_payment_date: paymentMeta.last_payment_date || null,
          last_payment_amount: paymentMeta.last_payment_amount ?? null,
          last_check_number: paymentMeta.last_check_number ?? null,
          default_lunch_hours: normalizeDefaultLunchHours(paymentMeta.default_lunch_hours),
          plant_location: normalizePlantLocation(paymentMeta.plant_location),
          tax_profile: normalizeTaxProfile(employee.tax_profile),
          punch_errors_week: punchErrorsByEmployee.get(employee.id) || [],
          punch_errors_week_start: week.startText,
          punch_errors_week_end: week.endText,
        }
      })

      setEmployees(employeesWithPunchErrors)
      setPresenceCheckedAt((data || []).find(employee => employee.presence_checked_at)?.presence_checked_at || null)
      employeeDataLoadedRef.current = true
    } catch (err) {
      console.error('loadEmployees error:', err)
      setError(err.message || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
    })()
    employeeLoadRef.current = request
    try { await request } finally { if (employeeLoadRef.current === request) employeeLoadRef.current = null }
  }

  async function createZktCommand(command, payload = {}) {
    const plantLocation = normalizePlantLocation(payload?.plant_location)
    const status = plantLocation === 'PA' ? 'pending_pa' : 'pending'

    const { data, error } = await supabase
      .from('zkt_bridge_commands')
      .insert({
        command,
        status,
        payload,
      })
      .select('id, command, status, created_at')
      .single()

    if (error) throw error
    return data
  }

  async function wakeZktBridge(commandRow) {
    if (!commandRow?.id) return

    const channel = supabase.channel('zkt-bridge-command-wake')

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Wake subscribe timeout')), 1500)

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer)
            resolve()
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timer)
            reject(new Error(`Wake channel ${status}`))
          }
        })
      })

      await channel.send({
        type: 'broadcast',
        event: 'wake',
        payload: {
          id: commandRow.id,
          command: commandRow.command,
        },
      })
    } catch (err) {
      console.warn('ZKT bridge wake skipped:', err)
    } finally {
      supabase.removeChannel(channel)
    }
  }

  function getZktCommandMaxAttempts(command) {
    if (command === 'sync_employees' || command === 'sync_one_employee') return 300
    return 120
  }

  async function waitForZktCommand(commandId, label, command) {
    const maxAttempts = getZktCommandMaxAttempts(command)

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { data, error } = await supabase
        .from('zkt_bridge_commands')
        .select('id, command, status, result, error, created_at, picked_at, finished_at')
        .eq('id', commandId)
        .single()

      if (error) throw error
      if (!data) throw new Error('Command not found')

      if (['pending','pending_pa','pending_attendance'].includes(data.status)) {
        setZkStatus(`${label}: waiting for bridge... (${attempt}/${maxAttempts})`)
      }

      if (data.status === 'running') {
        setZkStatus(`${label}: running on ZKT bridge... (${attempt}/${maxAttempts})`)
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

    throw new Error('Timeout: ZKT bridge did not finish command')
  }

  async function runZktCommand(command, label, payload = {}, afterDone, actionKey = '') {
    try {
      setZkLoading(true)
      setActiveZkAction(actionKey)
      setError('')
      setActiveCommandId(null)
      setZkStatus(`${label}: creating command...`)

      const created = await createZktCommand(command, payload)

      setActiveCommandId(created.id)
      setZkStatus(`${label}: command created. ID: ${created.id}`)
      await wakeZktBridge(created)

      const finished = await waitForZktCommand(created.id, label, command)

      if (typeof afterDone === 'function') {
        await afterDone(finished)
      }
    } catch (err) {
      console.error(`runZktCommand ${command} error:`, err)
      setZkStatus(`ERROR: ${label}: ${err.message || 'Failed to run command'}`)
    } finally {
      setZkLoading(false)
      setActiveZkAction('')
    }
  }

  async function runEmployeeSync(command, label, payload, actionKey = '') {
    setSacsLoading(true)
    setSacsStatus(`${label}: syncing...`)
    try {
      await runEmployeeSyncTargets(
        () => runZktCommand(command, label, payload, loadEmployees, actionKey),
        async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Sign in required')
            const selection = payload.employee_id
              ? { employee_id: payload.employee_id }
              : { plant_location: payload.plant_location }
            const response = await fetch('/api/sync-sacs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify(selection),
              signal: AbortSignal.timeout(45000),
            })
            if (!response.ok) throw new Error('SACS unavailable')
            const result = await response.json()
            const failures = (result.results || []).filter(row => row.status === 'failed')
              .map(row => `#${row.employee_number}: ${row.error}`).join('; ')
            setSacsStatus(`${result.failed ? 'ERROR: ' : ''}${label}: ${result.synced} synced / ${result.failed} failed${failures ? ` — ${failures}` : ''}`)
          } catch {
            setSacsStatus(`ERROR: ${label}: SACS sync failed. Retry when the service is available.`)
          }
        }
      )
    } finally {
      setSacsLoading(false)
    }
  }

  async function handleZkTest(plantLocation) {
    const label = getPlantLocationLabel(plantLocation)
    await runZktCommand(
      'test',
      `TEST ZKT ${label}`,
      buildZktPayloadForLocation(plantLocation),
      undefined,
      `test-${label}`
    )
  }

  async function handleZkSyncEmployees(plantLocation) {
    const label = getPlantLocationLabel(plantLocation)
    await runEmployeeSync(
      'sync_employees',
      `SYNC ${label} EMPLOYEES`,
      buildZktPayloadForLocation(plantLocation),
      `sync-${label}`
    )
  }

  async function handleZkVerifyEmployees(plantLocation) {
    const label = getPlantLocationLabel(plantLocation)
    await runZktCommand(
      'verify_employees',
      `VERIFY ${label} ZKT`,
      buildZktPayloadForLocation(plantLocation),
      loadEmployees,
      `verify-${label}`
    )
  }

  async function handleZkPullLogs(plantLocation) {
    const label = getPlantLocationLabel(plantLocation)
    await runZktCommand(
      'pull_attendance',
      `PULL ${label} ATTENDANCE`,
      buildZktPayloadForLocation(plantLocation),
      loadEmployees,
      `pull-${label}`
    )
  }

  async function handleDeleteFromZkt(employee) {
    const name = getFullName(employee)
    const ok = window.confirm(`Delete ${name} from ZKT device only? Database employee will stay.`)
    if (!ok) return

    await runZktCommand(
      'delete_employee_from_zkt',
      `DELETE FROM ZKT ${name}`,
      buildZktPayloadForLocation(employee.plant_location, { employee_id: employee.id }),
      loadEmployees
    )
  }

  async function handleSyncEmployeeToZkt(employee) {
    const name = getFullName(employee)

    await runEmployeeSync(
      'sync_one_employee',
      `SYNC ZKT ${name}`,
      buildZktPayloadForLocation(employee.plant_location, { employee_id: employee.id })
    )
  }

  async function handleVerifyEmployeeInZkt(employee) {
    const name = getFullName(employee)

    await runZktCommand(
      'verify_employees',
      `VERIFY ZKT ${name}`,
      buildZktPayloadForLocation(employee.plant_location, { employee_id: employee.id }),
      loadEmployees
    )
  }

  function openAddModal() {
    setError('')
    setEmployeeCreationNotice('')
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEditModal(employee) {
    setError('')
    const originalAssignment = employeeAssignmentForEdit(employee, normalizePlantLocation(employee.plant_location))
    setForm({
      id: employee.id,
      originalAssignment,
      ...originalAssignment,
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
      default_lunch_hours: String(normalizeDefaultLunchHours(employee.default_lunch_hours)),
      shift_type: normalizeShiftType(employee.shift_type),
      active: employee.active ?? true,
      exclude_from_payroll_report: employee.exclude_from_payroll_report === true,
      hire_date: employee.hire_date || '',
      employer_form: employee.employer_form || 'W2',
      company_name: employee.company_name || '',
      company_id: employee.company_id || null,
      photo_url: employee.photo_url || '',
      zkt_enabled: employee.zkt_enabled !== false || employee.zkt_sync_status === 'pending',
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

    if (form.id && (form.employee_number === '' || Number.isNaN(Number(form.employee_number)))) {
      setError('Employee number is required')
      return
    }

    if (!form.first_name.trim()) {
      setError('First name is required')
      return
    }

    if (form.id && form.zkt_enabled && !form.zkt_user_id) {
      setError('ZKT user ID is required when ZKT enabled')
      return
    }

    try {
      setSaving(true)
      setError('')

      const fullName = `${form.first_name || ''} ${form.last_name || ''}`.trim()

      const payload = {
        employee_number: employeeNumberForSave(form),
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
        default_lunch_hours: normalizeDefaultLunchHours(form.default_lunch_hours),
        plant_location: normalizePlantLocation(form.plant_location),
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
      let createdEmployee = null
      let transferredEmployee = null

      if (form.id) {
        const saved = await saveEmployeeEdit(supabase, form, payload)
        if (transfer.active) transferredEmployee = saved
      } else {
        const { data, error } = await supabase
          .from('employees')
          .insert(payload)
          .select('id,employee_number,zkt_enabled,zkt_sync_status,zkt_sync_error')
          .single()
        if (error) throw error
        savedEmployeeId = data?.id
        createdEmployee = data
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

      let deliveryNotice=''
      if(!form.id&&savedEmployeeId&&flags.employee_rehire){
        try{await deliverEmployeeIntegrations(savedEmployeeId,{getSession:()=>supabase.auth.getSession()});deliveryNotice='SACS identity synchronized. Terminal provisioning is tracked separately.'}
        catch(err){deliveryNotice=`ERROR: ${err.message}`}
      }
      if (createdEmployee) {
        setEmployeeCreationNotice(`Employee #${createdEmployee.employee_number} saved in Farmplast. ${form.zkt_enabled
          ? `ZKT synchronization is pending. ${createdEmployee.zkt_sync_error || 'Awaiting terminal acknowledgement.'} The employee has not been confirmed on the terminal.`
          : 'ZKT synchronization was not requested.'}`)
      }
      if (transferredEmployee) setEmployeeCreationNotice(employeeTransferNotice(transferredEmployee))
      closeModal()
      await loadEmployees()
      if(deliveryNotice)setSacsStatus(deliveryNotice)
    } catch (err) {
      console.error('handleSave error:', err)
      setError(err.message || 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(id) {
    const employee = employees.find(row => row.id === id)
    if (!employee || !flags.employee_terminate) return
    setTerminationEmployee(employee)
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

  async function loadPreviousWeekWorkLogs() {
    const week = getPreviousWeekRange()

    const { data, error } = await supabase
      .from('employee_work_logs')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .gte('work_date', week.startText)
      .lte('work_date', week.endText)
      .order('work_date', { ascending: true })
      .limit(10000)

    if (error) throw error

    const logs = data || []

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

  async function loadPriorPayrollPayments() {
    return loadPayrollPaymentHistory(supabase, { employeeIds: employees.map((employee) => employee.id) })
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

  function roundDollars(value) {
    const number = Number(value || 0)
    if (!Number.isFinite(number)) return 0
    return Math.round(number)
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

  function getEmployeePayroll(employee, week, logsByEmployeeAndDate, deductionsRows, priorPayments, paymentDate) {
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
    const ytd = getPayrollYtdTotals(priorPayments, {
      employeeId: employee.id,
      periodStart: week.startText,
      periodEnd: week.endText,
      paymentDate,
    })

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
      ...ytd,
    })
    const employeeTaxNum = roundDollars(taxTotals.totalEmployeeTaxes || 0)
    const mainTaxNum = roundDollars(
      (taxTotals.employeeTaxes || []).find((tax) => tax.key === 'federalIncomeTax')?.amount || 0
    )
    const overtimeTaxNum = roundDollars(employeeTaxNum - mainTaxNum)
    const totalDeductions = roundDollars(employeeTaxNum + manualDeductions)
    const netPay = roundDollars(Number(taxTotals.netPay || 0))
    const printedYtd = calculatePrintedCheckYtd(
      ytd.priorYtdEmployeeTaxes,
      employeeTaxNum,
      ytd.priorYtdNetPay,
      netPay
    )

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
      ytdEmployeeTaxes: printedYtd.ytdEmployeeTaxes,
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
      ytdRent: taxTotals.deductions?.ytdRent || rentNum,
      ytdElectric: taxTotals.deductions?.ytdElectric || electricNum,
      ytdWater: taxTotals.deductions?.ytdWater || waterNum,
      ytdClean: taxTotals.deductions?.ytdClean || cleanNum,
      ytdTransport: taxTotals.deductions?.ytdTransport || transportNum,
      employeeDeductions: manualDeductions,
      totalDeductions,
      netPay,
      ytdNetPay: printedYtd.ytdNetPay,
    }

    return {
      employee,
      paymentDate: ytd.paymentDate,
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
    const paymentDate = options.paymentDate || getPayrollPaymentDate(new Date())
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
      getEmployeePayroll(
        employee,
        week,
        logsByEmployeeAndDate,
        deductionsRows,
        options.priorPayments || [],
        paymentDate
      )
    )
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
      .dashboard-selected-check-page { page-break-after: always; break-after: page; }
      .dashboard-selected-check-page:last-child { page-break-after: auto; break-after: auto; }
    `
    printDocument.head.appendChild(style)
  }

  function createPayrollPrintWindow() {
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
  <div id="print-root" style="font-family: Arial, sans-serif; padding: 20px;">Preparing payroll checks...</div>
</body>
</html>`)
    printWindow.document.close()

    return printWindow
  }

  function openSelectedChecksPrintWindow(week, payrollRows, printWindow, { recalculateRow, onConfirm }) {
    const targetWindow = printWindow || createPayrollPrintWindow()

    copyPrintStylesToWindow(targetWindow.document)

    const rootElement = targetWindow.document.getElementById('print-root')
    const root = createRoot(rootElement)
    const payDate = payrollRows[0]?.paymentDate || getPayrollPaymentDate(new Date())

    root.render(
      <PayrollPrintDocument
        rows={payrollRows}
        week={week}
        defaultPayDate={payDate}
        getFullName={getFullName}
        printWindow={targetWindow}
        recalculateRow={recalculateRow}
        onConfirm={onConfirm}
      />
    )

    setTimeout(() => {
      targetWindow.focus()
    }, 150)
  }

  function openPayrollDraftWindow(week, logs, deductionsRows, priorPayments, companyLookup, printRows, printWindow) {
    const logsByEmployeeAndDate = new Map()
    for (const log of logs) {
      const key = `${getLogEmployeeId(log)}__${getLogDate(log)}`
      const dayLogs = logsByEmployeeAndDate.get(key) || []
      dayLogs.push(log)
      logsByEmployeeAndDate.set(key, dayLogs)
    }
    openSelectedChecksPrintWindow(week, printRows, printWindow, {
      recalculateRow(item, paymentDate) {
        const sources = item.grouped_company ? item.grouped_items : [item]
        const recalculated = sources.map((source) => getEmployeePayroll(
          source.employee, week, logsByEmployeeAndDate, deductionsRows, priorPayments, paymentDate
        ))
        return mergeCompanyPayrollRows(recalculated, companyLookup)[0]
      },
      async onConfirm(chosenRows) {
        await savePrintedPayrollRows(supabase, week, chosenRows)
        // A failed dashboard refresh must never re-issue saved checks.
        loadEmployees().catch((err) => console.warn('Could not refresh employees after printing:', err))
        return chosenRows
      },
    })
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
      const companyId = employee.company_id ? String(employee.company_id) : ''
      const companyName = String(
        employee.company_name ||
          employee.company_display_name ||
          ''
      ).trim()
      const isCompanyEmployee =
        employee.employer_form === 'Other' &&
        (companyId || companyName)

      if (!isCompanyEmployee) {
        output.push(item)
        continue
      }

      const key = companyId || `name:${companyName.toLowerCase()}`

      if (!companyGroups.has(key)) {
        const displayName =
          (companyId ? companyLookup.get(companyId) : '') ||
          companyName ||
          getFullName(employee)

        companyGroups.set(key, {
          companyId,
          companyKey: key,
          companyName: displayName,
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
        ytdEmployeeTaxes: 0,
        ytdRent: 0,
        ytdElectric: 0,
        ytdWater: 0,
        ytdClean: 0,
        ytdTransport: 0,
        employeeDeductions: 0,
        totalDeductions: 0,
        netPay: 0,
        ytdNetPay: 0,
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
        combinedTotals.ytdEmployeeTaxes += Number(totals.ytdEmployeeTaxes || totals.employeeTaxNum || 0)
        combinedTotals.ytdRent += Number(totals.ytdRent || totals.rentNum || 0)
        combinedTotals.ytdElectric += Number(totals.ytdElectric || totals.electricNum || 0)
        combinedTotals.ytdWater += Number(totals.ytdWater || totals.waterNum || 0)
        combinedTotals.ytdClean += Number(totals.ytdClean || totals.cleanNum || 0)
        combinedTotals.ytdTransport += Number(totals.ytdTransport || totals.transportNum || 0)
        combinedTotals.employeeDeductions += Number(totals.employeeDeductions || 0)
        combinedTotals.totalDeductions += Number(totals.totalDeductions || 0)
        combinedTotals.netPay += Number(totals.netPay || 0)
        combinedTotals.ytdNetPay += Number(totals.ytdNetPay || totals.netPay || 0)

        combinedTotals.rows.push(...(totals.rows || item.rows || []))
        combinedTotals.filteredForView.push(...(totals.filteredForView || item.rows || []))

        Object.entries(totals.rowsByDate || item.rowsByDate || {}).forEach(([dateKey, row]) => {
          combinedTotals.rowsByDate[dateKey] = row
        })
      }

      const groupedEmployee = {
        ...firstEmployee,
        id: `company-${group.companyKey}`,
        first_name: group.companyName,
        last_name: '',
        employee_number: '',
        company_id: group.companyId || null,
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

  async function handlePrintSingleCheck(employee) {
    try {
      setReportLoading(true)
      setReportError('')
      setError('')

      if (!employee?.id) {
        throw new Error('Employee not found for check printing')
      }

      const printWindow = createPayrollPrintWindow()
      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const priorPayments = await loadPriorPayrollPayments()
      const allPayrollRows = buildPayrollRows(week, logs, deductionsRows, {
        includeExcluded: true,
        priorPayments,
      })
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

      openPayrollDraftWindow(week, logs, deductionsRows, priorPayments, companyLookup, printRows, printWindow)
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

      const printWindow = createPayrollPrintWindow()
      const selectedIdSet = new Set(selectedCheckIds)
      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const priorPayments = await loadPriorPayrollPayments()
      const payrollRows = buildPayrollRows(week, logs, deductionsRows, {
        includeExcluded: true,
        priorPayments,
      })
        .filter((item) => selectedIdSet.has(item.employee.id))
        .filter((item) => Number(item.netPay || 0) > 0)

      if (payrollRows.length === 0) {
        throw new Error('Selected employees have no net pay for previous week')
      }

      const companyLookup = await loadCompanyLookupForPayrollRows(payrollRows)
      const printRows = mergeCompanyPayrollRows(payrollRows, companyLookup)

      openPayrollDraftWindow(week, logs, deductionsRows, priorPayments, companyLookup, printRows, printWindow)
      setSelectedCheckIds([])
    } catch (err) {
      console.error('handlePrintSelectedChecks error:', err)
      const message = err.message || 'Failed to print selected checks'
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
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                <LayoutDashboard size={22} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-white">Employees</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  Total: {counts.total} · Presence: {counts.presenceOnline} online · {counts.offSite} off site · {counts.openShift} missed out · {counts.punchErrors} punch errors · {counts.absent} absent
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Presence after ZKT sync: 8 AM / 8 PM (New York)
                  {presenceCheckedAt ? ' · Updated ' + new Date(presenceCheckedAt).toLocaleString('en-US', {timeZone:'America/New_York', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : ''}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap gap-2">
              <button
                onClick={refreshPresence}
                disabled={refreshingPresence}
                title="Refresh presence from the latest imported ZKT punches"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:border-cyan-500"
              >
                <RefreshCw size={15} className={refreshingPresence ? 'animate-spin' : ''} />
                {refreshingPresence ? 'Refreshing…' : 'Refresh'}
              </button>

              <div className="grid max-w-full grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 sm:grid-flow-col sm:grid-cols-none sm:grid-rows-2">
              <button
                onClick={() => handleZkTest('NJ')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('test-NJ', <Zap size={15} />)}
                Test NJ
              </button>

              <button
                onClick={() => handleZkTest('PA')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('test-PA', <Zap size={15} />)}
                Test PA
              </button>

              <button
                onClick={() => handleZkSyncEmployees('NJ')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('sync-NJ', <UploadCloud size={15} />)}
                Sync NJ → ZKT
              </button>

              <button
                onClick={() => handleZkSyncEmployees('PA')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('sync-PA', <UploadCloud size={15} />)}
                Sync PA → ZKT
              </button>

              <button
                onClick={() => handleZkVerifyEmployees('NJ')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('verify-NJ', <BadgeCheck size={15} />)}
                Verify NJ
              </button>

              <button
                onClick={() => handleZkVerifyEmployees('PA')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('verify-PA', <BadgeCheck size={15} />)}
                Verify PA
              </button>

              <button
                onClick={() => handleZkPullLogs('NJ')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('pull-NJ', <DownloadCloud size={15} />)}
                Pull NJ
              </button>

              <button
                onClick={() => handleZkPullLogs('PA')}
                disabled={zkLoading || sacsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renderZktActionIcon('pull-PA', <DownloadCloud size={15} />)}
                Pull PA
              </button>
              </div>

              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
              >
                <Plus size={15} />
                Add employee
              </button>

              {role === 'admin' && (
                <Link
                  to="/employees/former"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-500/40 bg-slate-500/10 px-2.5 py-2 text-center text-sm font-medium leading-tight text-slate-200 transition hover:bg-slate-500/20"
                >
                  <Archive size={15} />
                  <span>Former<br />Employees</span>
                </Link>
              )}

              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-2 text-center text-sm font-medium leading-tight text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {backupLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {backupLoading ? 'Backup...' : <span>Database<br />Backup</span>}
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

          {sacsStatus ? (
            <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-xs ${sacsStatus.startsWith('ERROR:') ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'}`}>
              SACS: {sacsStatus}
            </div>
          ) : null}

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

        <div className="mb-3 grid items-stretch gap-3 md:grid-cols-[minmax(0,3fr)_minmax(228px,1fr)]">
          <PayrollReport employees={employees} />
          <section className={`${cardClass} flex min-w-0 flex-wrap items-center justify-between gap-3 p-3`} aria-labelledby="safety-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={22} className="shrink-0 text-emerald-300" aria-hidden="true" />
              <div>
                <h2 id="safety-title" className="text-base font-bold text-white">Safety</h2>
                <p className="text-xs text-slate-400">SACS</p>
              </div>
            </div>
            <SacsLink className="inline-flex w-fit shrink-0 items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400" />
          </section>
        </div>

        {employeeCreationNotice && <p role="status" className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{employeeCreationNotice}</p>}
        <WorkersList
          canTerminate={flags.employee_terminate}
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
          zkLoading={zkLoading || sacsLoading}
        />

        <EmployeeModal
          open={modalOpen}
          onClose={closeModal}
          onSave={handleSave}
          form={form}
          setForm={setForm}
          saving={saving}
          isEditing={isEditing}
          error={error}
          canTerminate={flags.employee_terminate}
          onTerminate={handleDelete}
          transfer={transfer}
        />
        {terminationEmployee && <EmployeeTerminationDialog key={terminationEmployee.id} employee={terminationEmployee}
          onClose={() => setTerminationEmployee(null)} onArchived={async notice => {
            setTerminationEmployee(null); closeModal(); setEmployeeCreationNotice(notice); await loadEmployees()
          }} />}
      </div>
    </div>
  )
}
