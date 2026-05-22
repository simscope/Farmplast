import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Plus,
  Printer,
  Trash2,
  Wallet,
  Hash,
  CheckCircle2,
  BadgeDollarSign,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculatePayrollTotals,
  normalizePayrollRow,
  round2,
  roundDollar,
  roundHoursToNearestQuarter,
  calcDayHours,
  getShiftLetter,
  getWeeksInSelectedPeriod,
} from '../utils/payrollMath'
import PayrollCheck from '../components/payroll/PayrollCheck'
import '../components/payroll/PayrollCheck.css'

const pageCard =
  'rounded-xl border border-slate-800 bg-[#0f172a] shadow-[0_8px_24px_rgba(0,0,0,0.22)]'

const darkInput =
  'w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

function toLocalDateString(date) {
  const d = date instanceof Date ? date : new Date(date)

  if (Number.isNaN(d.getTime())) {
    return ''
  }

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function money(value) {
  const num = Math.round(Number(value || 0))
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function moneyRaw(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2)}`
}

function formatDate(value) {
  if (!value) return '—'

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return value
  }
}

function formatDateInputUS(value) {
  if (!value) return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function parseUSDateInput(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)

  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  let year = Number(match[3])

  if (year < 100) year += 2000

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatTimeInputUS(value) {
  if (!value) return ''

  const text = String(value).trim()
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return text

  let hour = Number(match[1])
  const minute = match[2]

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return text

  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12
  if (hour === 0) hour = 12

  return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`
}

function parseUSTimeInput(value) {
  const text = String(value || '').trim().toUpperCase()
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)

  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const suffix = match[3]

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null

  if (suffix === 'AM' && hour === 12) hour = 0
  if (suffix === 'PM' && hour !== 12) hour += 12

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getManualEditLabel(row) {
  const manualIn = row?.manual_time_in === true
  const manualOut = row?.manual_time_out === true

  if (manualIn && manualOut) return 'IN + OUT'
  if (manualIn) return 'IN'
  if (manualOut) return 'OUT'
  return '—'
}

function rowHasAnyTime(row) {
  return Boolean(row?.time_in || row?.time_out)
}

function rowHasWorkData(row) {
  return (
    rowHasAnyTime(row) ||
    Number(row?.reg_hours || 0) > 0 ||
    Number(row?.labor_amount || 0) > 0
  )
}

function isRealSavedWorkLogRow(row) {
  const rowId = String(row?.id || '')

  return (
    row &&
    row.id &&
    !rowId.startsWith('new-') &&
    !rowId.startsWith('empty-') &&
    row?.is_deleted !== true
  )
}

function getDeductionNumber(value) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function buildEmptyRow(downtimeEnabled = true) {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: toLocalDateString(new Date()),
    time_in: '',
    time_out: '',
    lunch_hours: '1',
    downtime_hours: downtimeEnabled ? '1' : '0',
    reg_hours: '0',
    labor_amount: '0',
    manual_time_in: false,
    manual_time_out: false,
    manually_edited: false,
    is_dirty: true,
  }
}

function getPayrollWeekRange(type = 'last', baseDate = new Date()) {
  const today = new Date(baseDate)
  today.setHours(0, 0, 0, 0)

  const day = today.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() + diffToMonday)
  thisMonday.setHours(0, 0, 0, 0)

  const start = new Date(thisMonday)

  if (type === 'last') {
    start.setDate(thisMonday.getDate() - 7)
  }

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
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
    * { box-sizing: border-box; }
    html,
    body {
      width: 215.9mm;
      min-width: 215.9mm;
      max-width: 215.9mm;
      height: 279.4mm;
      min-height: 279.4mm;
      max-height: 279.4mm;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: white !important;
      color: black !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #print-root {
      width: 215.9mm;
      min-width: 215.9mm;
      max-width: 215.9mm;
      height: 279.4mm;
      min-height: 279.4mm;
      max-height: 279.4mm;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: white !important;
    }
    #print-root > * {
      margin: 0 !important;
      transform: none !important;
      zoom: 1 !important;
    }
    .no-print { display: none !important; }
  `
  printDocument.head.appendChild(style)
}

function openPayrollCheckPrintWindow({
  employee,
  fullName,
  totals,
  periodStart,
  periodEnd,
  checkNumber,
  payDate,
}) {
  const printWindow = window.open('', '_blank')

  if (!printWindow) {
    throw new Error('Popup blocked. Allow popups for this site and click Print again.')
  }

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payroll check #${checkNumber || ''}</title>
</head>
<body>
  <div id="print-root"></div>
</body>
</html>`)
  printWindow.document.close()

  copyPrintStylesToWindow(printWindow.document)

  const rootElement = printWindow.document.getElementById('print-root')
  const root = createRoot(rootElement)

  root.render(
    <PayrollCheck
      employee={employee}
      fullName={fullName}
      totals={totals}
      periodStart={periodStart}
      periodEnd={periodEnd}
      checkNumber={checkNumber}
      payDate={payDate}
    />
  )

  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 500)
}

function PrintPreviewModal({
  open,
  onClose,
  onPrintAndSave,
  printing,
  employee,
  fullName,
  totals,
  periodStart,
  periodEnd,
  checkNumber,
  payDate,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="no-print flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Print preview</h2>
            <p className="mt-1 text-sm text-slate-400">Check + payment report</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onPrintAndSave}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
            >
              <Printer size={16} />
              {printing ? 'Preparing...' : 'Print'}
            </button>

            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-red-500"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200 p-5">
          <div className="mx-auto w-fit bg-white shadow-lg">
            {checkNumber ? (
              <PayrollCheck
                employee={employee}
                fullName={fullName}
                totals={totals}
                periodStart={periodStart}
                periodEnd={periodEnd}
                checkNumber={checkNumber}
                payDate={payDate}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-white text-black"
                style={{
                  width: '215.9mm',
                  height: '279.4mm',
                  minWidth: '215.9mm',
                  minHeight: '279.4mm',
                }}
              >
                <div className="max-w-md rounded-xl border border-slate-300 p-6 text-center">
                  <div className="text-2xl font-bold">Check number pending</div>
                  <div className="mt-3 text-sm text-slate-700">
                    The check number must be created by the database before preview opens.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const defaultPayrollPeriod = getPayrollWeekRange('last')

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printCheckId, setPrintCheckId] = useState(null)
  const [printCheckNumber, setPrintCheckNumber] = useState(null)
  const [printCheckStatus, setPrintCheckStatus] = useState(null)
  const [printPayDate, setPrintPayDate] = useState(toLocalDateString(new Date()))

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [refreshingPayments, setRefreshingPayments] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [periodMode, setPeriodMode] = useState('last')
  const [periodStart, setPeriodStart] = useState(defaultPayrollPeriod.start)
  const [periodEnd, setPeriodEnd] = useState(defaultPayrollPeriod.end)

  const [employeeTax, setEmployeeTax] = useState('0')
  const [rent, setRent] = useState('0')
  const [electric, setElectric] = useState('0')
  const [water, setWater] = useState('0')
  const [clean, setClean] = useState('0')
  const [transport, setTransport] = useState('0')

  useEffect(() => {
    loadPage()
  }, [id])

  useEffect(() => {
    loadDeductionsForPeriod()
  }, [id, periodStart, periodEnd])

  async function loadDeductionsForPeriod() {
    try {
      if (!id || !periodStart || !periodEnd) {
        setRent('0')
        setElectric('0')
        setWater('0')
        setClean('0')
        setTransport('0')
        return
      }

      const { data, error } = await supabase
        .from('employee_payroll_deductions')
        .select('rent,electric,water,clean,transport')
        .eq('employee_id', id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle()

      if (error) throw error

      setRent(String(getDeductionNumber(data?.rent)))
      setElectric(String(getDeductionNumber(data?.electric)))
      setWater(String(getDeductionNumber(data?.water)))
      setClean(String(getDeductionNumber(data?.clean)))
      setTransport(String(getDeductionNumber(data?.transport)))
    } catch (err) {
      console.error('loadDeductionsForPeriod error:', err)
      setRent('0')
      setElectric('0')
      setWater('0')
      setClean('0')
      setTransport('0')
      setError(err.message || 'Failed to load payroll deductions')
    }
  }

  async function loadPaymentsOnly() {
    try {
      setRefreshingPayments(true)

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })

      if (paymentsError) throw paymentsError
      setPayments(paymentsData || [])
    } catch (err) {
      console.error('loadPaymentsOnly error:', err)
      setError(err.message || 'Failed to load payment history')
    } finally {
      setRefreshingPayments(false)
    }
  }

  async function loadPage() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (employeeError) throw employeeError

      if (!employeeData) {
        setEmployee(null)
        setLogs([])
        setPayments([])
        setError('Employee not found')
        return
      }

      setEmployee(employeeData)

      const { data: logsData, error: logsError } = await supabase
        .from('employee_work_logs')
        .select('*')
        .eq('employee_id', id)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (logsError) {
        console.error('employee_work_logs load error:', logsError)
        setLogs([])
      } else {
        setLogs(logsData || [])
      }

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })

      if (paymentsError) {
        console.error('employee_payments load error:', paymentsError)
        setPayments([])
      } else {
        setPayments(paymentsData || [])
      }
    } catch (err) {
      console.error('loadPage error:', err)
      setError(err.message || 'Failed to load employee page')
    } finally {
      setLoading(false)
    }
  }

  function applyPayrollPeriod(mode) {
    setPeriodMode(mode)

    if (mode === 'custom') return

    const range = getPayrollWeekRange(mode)
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
  }

  function addRow() {
    setLogs((prev) => [buildEmptyRow(employee?.downtime_enabled !== false), ...prev])
  }

  function buildDraftRowForDate(rowId) {
    const dateStr = String(rowId || '').startsWith('empty-')
      ? String(rowId).replace('empty-', '')
      : toLocalDateString(new Date())

    return {
      id: rowId,
      work_date: dateStr,
      time_in: '',
      time_out: '',
      lunch_hours: '',
      downtime_hours: employee?.downtime_enabled === false ? '0' : '',
      reg_hours: '0',
      labor_amount: '0',
      manual_time_in: false,
      manual_time_out: false,
      manually_edited: false,
      is_deleted: false,
      is_empty: true,
      is_dirty: false,
    }
  }

  function ensureEditableLogsRow(prev, rowId) {
    if (!String(rowId || '').startsWith('empty-')) return prev

    const exists = prev.some((row) => row.id === rowId)
    if (exists) return prev

    return [buildDraftRowForDate(rowId), ...prev]
  }

  function updateRowValue(rowId, field, value) {
    setLogs((prev) => {
      const editableLogs = ensureEditableLogsRow(prev, rowId)

      return editableLogs.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [field]: value, is_dirty: true }

        if (
          field === 'lunch_hours' ||
          field === 'downtime_hours' ||
          field === 'reg_hours' ||
          field === 'labor_amount'
        ) {
          nextRow.manually_edited = true
          nextRow.is_empty = false
        }

        if (employee?.downtime_enabled === false) {
          nextRow.downtime_hours = '0'
        }

        if (
          field === 'time_in' ||
          field === 'time_out' ||
          field === 'lunch_hours' ||
          field === 'downtime_hours'
        ) {
          const computedHours = calcDayHours(
            nextRow.time_in,
            nextRow.time_out,
            nextRow.lunch_hours,
            employee?.downtime_enabled === false ? 0 : nextRow.downtime_hours
          )

          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            const hourlyRate = Number(employee?.hourly_rate || 0)
            nextRow.labor_amount = String(round2(computedHours * hourlyRate))
          }
        }

        if (field === 'reg_hours' && employee?.pay_type === 'hourly') {
          const hourlyRate = Number(employee?.hourly_rate || 0)
          const reg = roundHoursToNearestQuarter(value)
          nextRow.reg_hours = String(reg)
          nextRow.labor_amount = String(round2(reg * hourlyRate))
        }

        return nextRow
      })
    })
  }

  function updateUsDateInput(rowId, displayValue) {
    const parsedDate = parseUSDateInput(displayValue)

    setLogs((prev) => {
      const editableLogs = ensureEditableLogsRow(prev, rowId)

      return editableLogs.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          work_date_display: displayValue,
          work_date: parsedDate || row.work_date,
          manually_edited: true,
          is_empty: false,
          is_dirty: true,
        }
      })
    })
  }

  function finishUsDateInput(rowId) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          work_date_display: undefined,
        }
      })
    )
  }

  function updateUsTimeInput(rowId, field, displayField, displayValue) {
    const parsedTime = parseUSTimeInput(displayValue)

    setLogs((prev) => {
      const editableLogs = ensureEditableLogsRow(prev, rowId)

      return editableLogs.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = {
          ...row,
          [displayField]: displayValue,
        }

        if (parsedTime) {
          nextRow[field] = parsedTime
          nextRow.is_dirty = true
          nextRow.is_empty = false

          if (nextRow.lunch_hours === '' || nextRow.lunch_hours === null || nextRow.lunch_hours === undefined) {
            nextRow.lunch_hours = '1'
          }

          if (employee?.downtime_enabled === false) {
            nextRow.downtime_hours = '0'
          } else if (nextRow.downtime_hours === '' || nextRow.downtime_hours === null || nextRow.downtime_hours === undefined) {
            nextRow.downtime_hours = '1'
          }

          if (field === 'time_in') {
            nextRow.manual_time_in = true
            nextRow.manually_edited = true
          }

          if (field === 'time_out') {
            nextRow.manual_time_out = true
            nextRow.manually_edited = true
          }

          const computedHours = calcDayHours(
            field === 'time_in' ? parsedTime : nextRow.time_in,
            field === 'time_out' ? parsedTime : nextRow.time_out,
            nextRow.lunch_hours,
            employee?.downtime_enabled === false ? 0 : nextRow.downtime_hours
          )

          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            const hourlyRate = Number(employee?.hourly_rate || 0)
            nextRow.labor_amount = String(round2(computedHours * hourlyRate))
          }
        }

        return nextRow
      })
    })
  }

  function finishUsTimeInput(rowId, displayField) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          [displayField]: undefined,
        }
      })
    )
  }

  function buildWorkLogPayload(row) {
    const hasAnyTime = rowHasAnyTime(row)

    return {
      employee_id: id,
      work_date: row.work_date,
      time_in: row.time_in || null,
      time_out: row.time_out || null,
      lunch_hours: hasAnyTime ? Number(row.lunch_hours || 0) : 0,
      downtime_hours: employee?.downtime_enabled === false ? 0 : hasAnyTime ? Number(row.downtime_hours || 0) : 0,
      reg_hours: hasAnyTime ? Number(row.reg_hours || 0) : 0,
      labor_amount: hasAnyTime ? Number(row.labor_amount || 0) : 0,
      source: 'manual',
      manually_edited:
        row.manually_edited === true ||
        row.manual_time_in === true ||
        row.manual_time_out === true,
      manual_time_in: row.manual_time_in === true,
      manual_time_out: row.manual_time_out === true,
      is_deleted: false,
      updated_at: new Date().toISOString(),
    }
  }

  function isRowChanged(row) {
    const rowId = String(row?.id || '')
    return (
      row?.is_dirty === true ||
      rowId.startsWith('new-') ||
      (rowId.startsWith('empty-') && row?.is_empty !== true)
    )
  }

  function buildDeductionsPayload() {
    if (!periodStart || !periodEnd) {
      throw new Error('Payroll period is required to save deductions')
    }

    return {
      employee_id: id,
      period_start: periodStart,
      period_end: periodEnd,
      rent: getDeductionNumber(rent),
      electric: getDeductionNumber(electric),
      water: getDeductionNumber(water),
      clean: getDeductionNumber(clean),
      transport: getDeductionNumber(transport),
      updated_at: new Date().toISOString(),
    }
  }

  async function saveChangedRows() {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const rowsToSave = logs.filter((row) => {
        if (!row?.work_date) return false
        if (row?.is_deleted === true) return false
        if (!isRowChanged(row)) return false
        if (!rowHasWorkData(row)) return false
        if (periodStart && row.work_date < periodStart) return false
        if (periodEnd && row.work_date > periodEnd) return false
        return true
      })

      for (const row of rowsToSave) {
        if (!row.work_date) {
          throw new Error('Date is required')
        }

        const payload = buildWorkLogPayload(row)

        if (String(row.id).startsWith('new-') || String(row.id).startsWith('empty-')) {
          const { error } = await supabase
            .from('employee_work_logs')
            .insert(payload)

          if (error) throw error
        } else {
          const { error } = await supabase
            .from('employee_work_logs')
            .update(payload)
            .eq('id', row.id)

          if (error) throw error
        }
      }

      const deductionsPayload = buildDeductionsPayload()

      const { error: deductionsError } = await supabase
        .from('employee_payroll_deductions')
        .upsert(deductionsPayload, {
          onConflict: 'employee_id,period_start,period_end',
        })

      if (deductionsError) throw deductionsError

      setSuccess(
        `${rowsToSave.length} changed work row${rowsToSave.length === 1 ? '' : 's'} saved. ` +
          `Deductions saved for selected payroll period.`
      )

      await Promise.all([loadPage(), loadDeductionsForPeriod()])
    } catch (err) {
      console.error('saveChangedRows error:', err)
      setError(err.message || 'Failed to save changed rows')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row) {
    try {
      setError('')
      setSuccess('')

      if (String(row.id).startsWith('new-') || String(row.id).startsWith('empty-')) {
        setLogs((prev) => prev.filter((item) => item.id !== row.id))
        return
      }

      const ok = window.confirm('Delete this work row?')
      if (!ok) return

      const { error } = await supabase
        .from('employee_work_logs')
        .delete()
        .eq('id', row.id)

      if (error) throw error

      setSuccess('Row deleted')
      await loadPage()
    } catch (err) {
      console.error('deleteRow error:', err)
      setError(err.message || 'Failed to delete row')
    }
  }

  async function rebuildRowFromZkt(row) {
    try {
      setError('')
      setSuccess('')

      if (!row.work_date) {
        setError('Date is required')
        return
      }

      const ok = window.confirm('Delete this row and rebuild it from ZKT punches?')
      if (!ok) return

      const { error } = await supabase.rpc('rebuild_employee_work_log_day_from_zkt', {
        p_employee_id: id,
        p_work_date: row.work_date,
      })

      if (error) throw error

      setSuccess('Row rebuilt from ZKT')
      await loadPage()
    } catch (err) {
      console.error('rebuildRowFromZkt error:', err)
      setError(err.message || 'Failed to rebuild row from ZKT')
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((row) => {
      if (!row.work_date) return true
      if (periodStart && row.work_date < periodStart) return false
      if (periodEnd && row.work_date > periodEnd) return false
      return true
    })
  }, [logs, periodStart, periodEnd])

  const totals = useMemo(() => {
    const sorted = [...filteredLogs].sort((a, b) =>
      String(a.work_date || '').localeCompare(String(b.work_date || ''))
    )

    const recalculated = sorted.map((row) =>
      normalizePayrollRow(row, employee)
    )

    const payrollTotals = calculatePayrollTotals(recalculated, employee)

    const weeksCount = getWeeksInSelectedPeriod(periodStart, periodEnd)

    const rentNum = roundDollar(rent)
    const electricNum = roundDollar(electric)
    const waterNum = roundDollar(water)
    const cleanNum = roundDollar(clean)
    const transportNum = roundDollar(transport)

    const employeeDeductions = roundDollar(
      rentNum + electricNum + waterNum + cleanNum + transportNum
    )

    const totalDeductions = roundDollar(
      Number(payrollTotals.employeeTaxNum || 0) + employeeDeductions
    )

    const netPay = roundDollar(
      Number(payrollTotals.totalLabor || 0) - totalDeductions
    )

    return {
      filteredForView: recalculated.sort((a, b) =>
        String(b.work_date || '').localeCompare(String(a.work_date || ''))
      ),
      weeksCount,
      ...payrollTotals,
      taxableHours: payrollTotals.mainHours,
      taxableLabor: payrollTotals.mainLabor,
      rentNum,
      electricNum,
      waterNum,
      cleanNum,
      transportNum,
      employeeDeductions,
      totalDeductions,
      netPay,
    }
  }, [filteredLogs, employee, rent, electric, water, clean, transport, periodStart, periodEnd])

  useEffect(() => {
    setEmployeeTax(String(totals.employeeTaxNum || 0))
  }, [totals.employeeTaxNum])

  const paymentStats = useMemo(() => {
    const totalPaid = payments.reduce((sum, row) => sum + Number(row.net_pay || 0), 0)
    const totalLaborPaid = payments.reduce(
      (sum, row) => sum + Number(row.total_labor || 0),
      0
    )

    return {
      count: payments.length,
      totalPaid,
      totalLaborPaid,
    }
  }, [payments])

  const fullName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'

  async function handleOpenPrintModal() {
    try {
      setPaying(true)
      setError('')
      setSuccess('')
      setPrintCheckId(null)
      setPrintCheckNumber(null)
      setPrintCheckStatus(null)
      setPrintPayDate(toLocalDateString(new Date()))

      const netPay = Number(totals.netPay || 0)

      if (netPay <= 0) {
        setError('Net pay must be greater than 0')
        return
      }

      const { data: createdCheck, error: checkError } = await supabase.rpc(
        'create_payroll_check',
        {
          p_employee_id: id,
          p_pay_period_start: periodStart,
          p_pay_period_end: periodEnd,
          p_regular_hours: Number(totals.mainHours || 0),
          p_overtime_hours: Number(totals.overtimeHours || 0),
          p_regular_labor: Number(totals.mainLabor || 0),
          p_overtime_labor: Number(totals.overtimeLabor || 0),
          p_gross_pay: Number(totals.totalLabor || 0),
          p_employee_tax: Number(totals.employeeTaxNum || 0),
          p_rent: Number(totals.rentNum || 0),
          p_electric: Number(totals.electricNum || 0),
          p_water: Number(totals.waterNum || 0),
          p_clean: Number(totals.cleanNum || 0),
          p_transport: Number(totals.transportNum || 0),
          p_net_pay: netPay,
        }
      )

      if (checkError) throw checkError
      if (!createdCheck?.id) throw new Error('Check record was not created')
      if (!createdCheck?.check_number) throw new Error('Check number was not created')

      const payDateSource =
        createdCheck.printed_at || createdCheck.created_at || new Date().toISOString()
      const payDate = String(payDateSource).slice(0, 10)

      flushSync(() => {
        setPrintCheckId(createdCheck.id)
        setPrintCheckNumber(createdCheck.check_number)
        setPrintCheckStatus(createdCheck.status || 'draft')
        setPrintPayDate(payDate)
        setEmployee((prev) =>
          prev
            ? {
                ...prev,
                last_payment_date: payDate,
                last_payment_amount: createdCheck.net_pay ?? netPay,
                last_check_number: createdCheck.check_number,
              }
            : prev
        )
        setPrintModalOpen(true)
      })

      setSuccess(`Draft check #${createdCheck.check_number} created. Print to confirm, or close to void.`)
    } catch (err) {
      console.error('handleOpenPrintModal error:', err)
      setError(err.message || 'Failed to create check')
    } finally {
      setPaying(false)
    }
  }

  async function handleClosePrintModal() {
    try {
      setError('')

      if (printCheckId && printCheckStatus === 'draft') {
        const { error: voidError } = await supabase.rpc('void_payroll_check', {
          p_check_id: printCheckId,
        })

        if (voidError) throw voidError
        setSuccess(`Draft check #${printCheckNumber} voided`)
      }
    } catch (err) {
      console.error('handleClosePrintModal error:', err)
      setError(err.message || 'Failed to void draft check')
    } finally {
      setPrintModalOpen(false)
      setPrintCheckId(null)
      setPrintCheckNumber(null)
      setPrintCheckStatus(null)
    }
  }

  async function handleSaveAndPrint() {
    try {
      setPaying(true)
      setError('')

      if (!printCheckId || !printCheckNumber) {
        setError('Check number was not created')
        return
      }

      const { data: printedCheck, error: printedError } = await supabase.rpc(
        'mark_payroll_check_printed',
        {
          p_check_id: printCheckId,
        }
      )

      if (printedError) throw printedError

      const confirmedAt =
        printedCheck?.printed_confirmed_at || printedCheck?.printed_at || new Date().toISOString()

      const payload = {
        employee_id: id,
        period_start: periodStart,
        period_end: periodEnd,
        total_labor: Number(totals.totalLabor || 0),
        employee_tax: Number(totals.employeeTaxNum || 0),
        rent: Number(totals.rentNum || 0),
        electric: Number(totals.electricNum || 0),
        water: Number(totals.waterNum || 0),
        clean: Number(totals.cleanNum || 0),
        transport: Number(totals.transportNum || 0),
        net_pay: Number(totals.netPay || 0),
        paid_at: confirmedAt,
      }

      const { error: paymentError } = await supabase
        .from('employee_payments')
        .insert(payload)

      if (paymentError) throw paymentError

      flushSync(() => {
        setPrintCheckStatus('printed')
        setPrintPayDate(String(confirmedAt).slice(0, 10))
      })

      await loadPaymentsOnly()
      setSuccess(`Check #${printCheckNumber} marked as printed`)

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve)
        })
      })

      openPayrollCheckPrintWindow({
        employee,
        fullName,
        totals,
        periodStart,
        periodEnd,
        checkNumber: printCheckNumber,
        payDate: String(confirmedAt).slice(0, 10),
      })
    } catch (err) {
      console.error('handleSaveAndPrint error:', err)
      setError(err.message || 'Failed to print check')
    } finally {
      setPaying(false)
    }
  }

  const displayLogs = useMemo(() => {
    if (!periodStart) return totals.filteredForView || []

    const map = {}

    ;(totals.filteredForView || []).forEach((row) => {
      if (row.work_date) map[row.work_date] = row
    })

    const result = []
    const start = new Date(`${periodStart}T00:00:00`)
    const end = periodEnd
      ? new Date(`${periodEnd}T00:00:00`)
      : new Date(start)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return totals.filteredForView || []
    }

    let current = new Date(start)

    while (current <= end) {
      const dateStr = toLocalDateString(current)

      result.push(
        map[dateStr] || {
          id: `empty-${dateStr}`,
          work_date: dateStr,
          time_in: '',
          time_out: '',
          lunch_hours: '',
          downtime_hours: employee?.downtime_enabled === false ? '0' : '',
          reg_hours: '',
          labor_amount: '',
                              manual_time_in: false,
          manual_time_out: false,
          manually_edited: false,
          is_empty: true,
        }
      )

      current.setDate(current.getDate() + 1)
    }

    return result.sort((a, b) =>
      String(b.work_date || '').localeCompare(String(a.work_date || ''))
    )
  }, [totals.filteredForView, periodStart, periodEnd, employee])

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 1;
          cursor: pointer;
        }
      `}</style>

      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="mb-4 flex flex-wrap gap-2 no-print">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            <Plus size={16} />
            Add row
          </button>

          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
            <button
              type="button"
              onClick={() => applyPayrollPeriod('last')}
              className={`px-3 py-2 text-sm font-semibold transition ${
                periodMode === 'last'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Last Week
            </button>

            <button
              type="button"
              onClick={() => applyPayrollPeriod('this')}
              className={`border-l border-slate-700 px-3 py-2 text-sm font-semibold transition ${
                periodMode === 'this'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => applyPayrollPeriod('custom')}
              className={`border-l border-slate-700 px-3 py-2 text-sm font-semibold transition ${
                periodMode === 'custom'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Custom
            </button>
          </div>

          <button
            onClick={handleOpenPrintModal}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
          >
            <Printer size={16} />
            Pay & Print
          </button>
        </div>

        {loading ? (
          <div className={`${pageCard} p-8 text-center text-slate-400`}>
            Loading employee...
          </div>
        ) : error && !employee ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`${pageCard} p-4 no-print`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                    {employee?.photo_url ? (
                      <img
                        src={employee.photo_url}
                        alt={fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>

                  <div>
                    <h1 className="text-2xl font-bold text-white">{fullName}</h1>
                    <p className="mt-1 text-sm text-slate-400">
                      Payroll card. Default period is last week, Monday → Sunday.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Hash size={14} />
                      Employee #
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {employee?.employee_number ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Wallet size={14} />
                      Pay type
                    </div>
                    <div className="mt-1 text-lg font-bold capitalize text-white">
                      {employee?.pay_type || '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <BadgeDollarSign size={14} />
                      Employer form
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {employee?.employer_form || '—'}
                    </div>
                    {employee?.employer_form === 'Other' && employee?.company_name ? (
                      <div className="mt-1 text-[11px] leading-tight text-slate-500">
                        {employee.company_name}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CalendarDays size={14} />
                      Hire date
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {formatDate(employee?.hire_date)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <DollarSign size={14} />
                      Rate / Salary
                    </div>
                    <div className="mt-1 text-lg font-bold text-cyan-300">
                      {employee?.pay_type === 'monthly' || employee?.pay_type === 'one_time'
                        ? money(employee?.monthly_salary)
                        : money(employee?.hourly_rate)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CheckCircle2 size={14} />
                      Last payment
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {formatDate(employee?.last_payment_date)}
                    </div>
                    <div className="mt-1 text-lg font-bold text-emerald-300">
                      {money(employee?.last_payment_amount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-8">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period start</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/DD/YYYY"
                    value={formatDateInputUS(periodStart)}
                    onFocus={() => setPeriodMode('custom')}
                    onChange={(e) => {
                      const parsedDate = parseUSDateInput(e.target.value)
                      if (parsedDate) setPeriodStart(parsedDate)
                    }}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period end</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/DD/YYYY"
                    value={formatDateInputUS(periodEnd)}
                    onFocus={() => setPeriodMode('custom')}
                    onChange={(e) => {
                      const parsedDate = parseUSDateInput(e.target.value)
                      if (parsedDate) setPeriodEnd(parsedDate)
                    }}
                    className={darkInput}
                  />
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Total reg
                  </div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {totals.totalReg.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Lunch h
                  </div>
                  <div className="mt-1 text-xl font-bold text-slate-200">
                    {totals.totalLunch.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Downtime h
                  </div>
                  <div className="mt-1 text-xl font-bold text-orange-200">
                    {totals.totalDowntime.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Overtime h
                  </div>
                  <div className="mt-1 text-xl font-bold text-yellow-200">
                    {totals.overtimeHours.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <DollarSign size={14} />
                    Total labor
                  </div>
                  <div className="mt-1 text-xl font-bold text-cyan-300">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-300">
                    <Wallet size={14} />
                    Net Pay
                  </div>
                  <div className="mt-1 text-xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 no-print">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 no-print">
                {success}
              </div>
            ) : null}

            <div className={`${pageCard} overflow-hidden no-print`}>
              <button
                type="button"
                onClick={() => setPaymentsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between border-b border-slate-800 px-5 py-4 text-left transition hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                    <History size={18} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Payment history</h2>
                    <p className="text-sm text-slate-400">When and how much was paid</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {paymentsOpen ? 'Hide' : 'Show'}
                  </span>
                  {paymentsOpen ? (
                    <ChevronUp size={18} className="text-slate-300" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-300" />
                  )}
                </div>
              </button>

              {paymentsOpen && (
                <>
                  <div className="flex justify-end border-b border-slate-800 bg-[#0b1220] px-5 py-3">
                    <button
                      onClick={loadPaymentsOnly}
                      disabled={refreshingPayments}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500 disabled:opacity-60"
                    >
                      <RefreshCw
                        size={14}
                        className={refreshingPayments ? 'animate-spin' : ''}
                      />
                      Refresh
                    </button>
                  </div>

                  <div className="grid gap-3 border-b border-slate-800 bg-[#0b1220] px-5 py-3 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Payments count</div>
                      <div className="mt-1 text-xl font-bold text-white">
                        {paymentStats.count}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Total paid</div>
                      <div className="mt-1 text-xl font-bold text-emerald-300">
                        {money(paymentStats.totalPaid)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Total labor paid</div>
                      <div className="mt-1 text-xl font-bold text-cyan-300">
                        {money(paymentStats.totalLaborPaid)}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[1120px]">
                      <div className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] bg-slate-900/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        <div>Date paid</div>
                        <div>Period</div>
                        <div>Net pay</div>
                        <div>Total labor</div>
                        <div>Employee tax</div>
                        <div>Rent</div>
                        <div>Utilities</div>
                        <div>Transport</div>
                      </div>

                      {payments.length === 0 ? (
                        <div className="bg-[#0b1220] px-4 py-8 text-center text-sm text-slate-400">
                          No payment history yet
                        </div>
                      ) : (
                        payments.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] items-center border-t border-slate-800 bg-[#0b1220] px-4 py-3 text-sm text-slate-200"
                          >
                            <div>{formatDateTime(row.paid_at)}</div>
                            <div>
                              {formatDate(row.period_start)} - {formatDate(row.period_end)}
                            </div>
                            <div className="font-semibold text-emerald-300">
                              {money(row.net_pay)}
                            </div>
                            <div className="font-semibold text-cyan-300">
                              {money(row.total_labor)}
                            </div>
                            <div>{money(row.employee_tax)}</div>
                            <div>{money(row.rent)}</div>
                            <div>
                              {money(
                                Number(row.electric || 0) +
                                  Number(row.water || 0) +
                                  Number(row.clean || 0)
                              )}
                            </div>
                            <div>{money(row.transport)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={`${pageCard} overflow-hidden no-print`}>
              <div className="border-b border-slate-800 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Work log</h2>
                    <p className="text-sm text-slate-400">
                      Max 12h/day, rounded to nearest 15 min. Lunch and downtime are deducted. Employee tax is calculated automatically: main labor 15.3%, overtime labor 27%.
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1280px]">
                  <div className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.35fr_0.55fr_0.65fr_0.55fr_0.7fr_0.65fr_1fr] bg-slate-900/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <div>Date</div>
                    <div>Time In</div>
                    <div>Time Out</div>
                    <div>S</div>
                    <div>Lunch</div>
                    <div>Downtime</div>
                    <div>Reg</div>
                    <div>Labor</div>
                    <div>Manual</div>
                    <div>Delete</div>
                  </div>

                  {displayLogs.length === 0 ? (
                    <div className="bg-[#0b1220] px-4 py-8 text-center text-sm text-slate-400">
                      No rows in selected period
                    </div>
                  ) : (
                    displayLogs.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.35fr_0.55fr_0.65fr_0.55fr_0.7fr_0.65fr_1fr] items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-2.5"
                      >
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="MM/DD/YYYY"
                            value={
                              row.work_date_display !== undefined
                                ? row.work_date_display
                                : formatDateInputUS(row.work_date)
                            }
                            onChange={(e) => updateUsDateInput(row.id, e.target.value)}
                            onBlur={() => finishUsDateInput(row.id)}
                            className={`${darkInput} pr-16`}
                          />

                          <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-white">
                            {row.work_date
                              ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
                                  new Date(`${row.work_date}T00:00:00`).getDay()
                                ]
                              : ''}
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="HH:MM AM"
                          value={
                            row.time_in_display !== undefined
                              ? row.time_in_display
                              : formatTimeInputUS(row.time_in)
                          }
                          onChange={(e) =>
                            updateUsTimeInput(
                              row.id,
                              'time_in',
                              'time_in_display',
                              e.target.value
                            )
                          }
                          onBlur={() => finishUsTimeInput(row.id, 'time_in_display')}
                          className={darkInput}
                        />

                        <input
                          type="text"
                          placeholder="HH:MM PM"
                          value={
                            row.time_out_display !== undefined
                              ? row.time_out_display
                              : formatTimeInputUS(row.time_out)
                          }
                          onChange={(e) =>
                            updateUsTimeInput(
                              row.id,
                              'time_out',
                              'time_out_display',
                              e.target.value
                            )
                          }
                          onBlur={() => finishUsTimeInput(row.id, 'time_out_display')}
                          className={darkInput}
                        />

                        <div className="rounded-lg border border-slate-800 bg-[#07101d] px-3 py-2 text-center text-sm font-bold text-cyan-300">
                          {getShiftLetter(row.time_in)}
                        </div>

                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={rowHasAnyTime(row) ? row.lunch_hours ?? '1' : ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'lunch_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          disabled={employee?.downtime_enabled === false}
                          value={
                            employee?.downtime_enabled === false
                              ? '0'
                              : rowHasAnyTime(row)
                                ? row.downtime_hours ?? '1'
                                : ''
                          }
                          onChange={(e) =>
                            updateRowValue(row.id, 'downtime_hours', e.target.value)
                          }
                          className={`${darkInput} ${
                            employee?.downtime_enabled === false
                              ? 'cursor-not-allowed opacity-60'
                              : ''
                          }`}
                        />

                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={row.reg_hours ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'reg_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.labor_amount ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'labor_amount', e.target.value)
                          }
                          className={darkInput}
                        />

                        <div
                          className={`rounded-lg border px-2 py-2 text-center text-xs font-bold ${
                            row.manual_time_in || row.manual_time_out || row.manually_edited
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : 'border-slate-800 bg-[#07101d] text-slate-500'
                          }`}
                          title="Manual correction"
                        >
                          {row.manually_edited && !row.manual_time_in && !row.manual_time_out
                            ? 'EDIT'
                            : getManualEditLabel(row)}
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={saveChangedRows}
                            disabled={saving}
                            className="rounded-lg bg-cyan-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                          >
                            Save All
                          </button>

                          <button
                            onClick={() => rebuildRowFromZkt(row)}
                            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                            title="Rebuild this day from ZKT punches"
                          >
                            ZKT
                          </button>

                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-lg border border-red-500/30 bg-red-600/10 px-2 py-2 text-red-300 transition hover:bg-red-600/20"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={`${pageCard} p-4 no-print`}>
              <h2 className="mb-4 text-xl font-bold text-white">Deductions</h2>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Employee tax amount</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={employeeTax}
                    readOnly
                    className={`${darkInput} cursor-not-allowed text-yellow-200`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Rent</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Electric</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={electric}
                    onChange={(e) => setElectric(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Water</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={water}
                    onChange={(e) => setWater(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Clean</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={clean}
                    onChange={(e) => setClean(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Transport</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    className={darkInput}
                  />
                </div>
              </div>

              {employee?.pay_type === 'monthly' ? (
                <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">
                  Monthly pay calculation: {money(employee?.monthly_salary)} / 4 ×{' '}
                  {totals.weeksCount} week(s) ={' '}
                  <span className="font-bold">{money(totals.totalLabor)}</span>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Main labor tax 15.3%</div>
                  <div className="mt-1 text-xl font-bold text-yellow-200">
                    {money(totals.mainTax)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Main labor: {money(totals.mainLabor)}
                    {employee?.pay_type === 'hourly'
                      ? ` / ${totals.mainHours.toFixed(2)} h up to 40 h/week`
                      : ''}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Overtime tax 27%</div>
                  <div className="mt-1 text-xl font-bold text-orange-300">
                    {money(totals.overtimeTax)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Overtime labor: {money(totals.overtimeLabor)}
                    {employee?.pay_type === 'hourly'
                      ? ` / ${totals.overtimeHours.toFixed(2)} h × 1.5 rate`
                      : ''}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Employee deductions</div>
                  <div className="mt-1 text-xl font-bold text-red-300">
                    {money(totals.employeeDeductions)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                  <div className="text-xs text-emerald-300">Net Pay</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-300/80">
                    Total labor {money(totals.totalLabor)} - tax {money(totals.employeeTaxNum)} - deductions {money(totals.employeeDeductions)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <PrintPreviewModal
          open={printModalOpen}
          onClose={handleClosePrintModal}
          onPrintAndSave={handleSaveAndPrint}
          printing={paying}
          employee={employee}
          fullName={fullName}
          totals={totals}
          periodStart={periodStart}
          periodEnd={periodEnd}
          checkNumber={printCheckNumber}
          payDate={printPayDate}
        />
      </div>
    </div>
  )
}
