import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Plus,
  Printer,
  Trash2,
  Wallet,
  User,
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

const pageCard =
  'rounded-xl border border-slate-800 bg-[#0f172a] shadow-[0_8px_24px_rgba(0,0,0,0.22)]'

const darkInput =
  'w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

function money(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2)}`
}

function formatDate(value) {
  if (!value) return '—'
  return value
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
    })
  } catch {
    return value
  }
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

// максимум 12 часов в день, обед вычитается всегда
function calcDayHours(timeIn, timeOut, lunchHours) {
  if (!timeIn || !timeOut) return 0

  const [inH, inM] = String(timeIn).split(':').map(Number)
  const [outH, outM] = String(timeOut).split(':').map(Number)

  if (
    Number.isNaN(inH) ||
    Number.isNaN(inM) ||
    Number.isNaN(outH) ||
    Number.isNaN(outM)
  ) {
    return 0
  }

  const start = inH * 60 + inM
  let end = outH * 60 + outM

  if (end < start) end += 24 * 60

  const rawHours = (end - start) / 60
  const cappedHours = Math.min(rawHours, 12)
  const lunch = Number(lunchHours || 0)

  return Math.max(0, round2(cappedHours - lunch))
}

function buildEmptyRow() {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: new Date().toISOString().slice(0, 10),
    time_in: '',
    time_out: '',
    lunch_hours: '1',
    reg_hours: '0',
    labor_amount: '0',
  }
}

function getSaturdayToFridayRange(baseDate = new Date()) {
  const d = new Date(baseDate)
  const day = d.getDay()

  const distanceToSaturday = day === 6 ? 0 : day + 1
  const saturday = new Date(d)
  saturday.setHours(0, 0, 0, 0)
  saturday.setDate(d.getDate() - distanceToSaturday)

  const friday = new Date(saturday)
  friday.setDate(saturday.getDate() + 6)

  return {
    start: saturday.toISOString().slice(0, 10),
    end: friday.toISOString().slice(0, 10),
  }
}

function numberToWordsUnder1000(n) {
  const ones = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ]

  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ]

  if (n < 20) return ones[n]
  if (n < 100) {
    const ten = Math.floor(n / 10)
    const rest = n % 10
    return rest ? `${tens[ten]}-${ones[rest]}` : tens[ten]
  }

  const hundred = Math.floor(n / 100)
  const rest = n % 100
  return rest
    ? `${ones[hundred]} hundred ${numberToWordsUnder1000(rest)}`
    : `${ones[hundred]} hundred`
}

function numberToWords(n) {
  const num = Math.floor(Number(n || 0))

  if (num === 0) return 'zero'
  if (num < 1000) return numberToWordsUnder1000(num)

  if (num < 1000000) {
    const thousands = Math.floor(num / 1000)
    const rest = num % 1000
    return rest
      ? `${numberToWordsUnder1000(thousands)} thousand ${numberToWordsUnder1000(rest)}`
      : `${numberToWordsUnder1000(thousands)} thousand`
  }

  const millions = Math.floor(num / 1000000)
  const rest = num % 1000000
  if (rest === 0) return `${numberToWords(millions)} million`
  return `${numberToWords(millions)} million ${numberToWords(rest)}`
}

function amountToWords(amount) {
  const value = Number(amount || 0)
  const dollars = Math.floor(value)
  const cents = Math.round((value - dollars) * 100)
  return `${numberToWords(dollars)} dollars and ${String(cents).padStart(2, '0')}/100`
}

function PrintPreviewModal({
  open,
  onClose,
  onPrintAndSave,
  printing,
  employee,
  fullName,
  periodStart,
  periodEnd,
  totals,
  filteredLogs,
}) {
  if (!open) return null

  const checkWords = amountToWords(totals.netPay)

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4 no-print">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Print preview</h2>
            <p className="mt-1 text-sm text-slate-400">
              Check on top, payroll calculation and work log below
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onPrintAndSave}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
            >
              <Printer size={16} />
              {printing ? 'Saving...' : 'Save & Print'}
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

        <div className="flex-1 overflow-y-auto bg-slate-200 p-5">
          <div className="print-modal-sheet mx-auto max-w-[920px] bg-white text-black shadow-lg">
            <div className="px-10 py-10">
              <div className="mb-10 overflow-hidden rounded border-2 border-gray-300">
                <div className="border-b border-gray-300 bg-gray-50 px-8 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-3xl font-bold tracking-wide">SIM SCOPE INC.</div>
                      <div className="mt-1 text-sm text-gray-600">PAYROLL CHECK</div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-gray-500">Date</div>
                      <div className="mt-1 text-lg font-semibold">
                        {new Date().toISOString().slice(0, 10)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-8 py-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="text-sm text-gray-500">Pay to the order of</div>
                      <div className="mt-2 border-b border-gray-400 pb-2 text-2xl font-bold">
                        {fullName}
                      </div>
                    </div>

                    <div className="min-w-[220px] rounded border-2 border-gray-400 px-4 py-3 text-right">
                      <div className="text-xs uppercase tracking-wider text-gray-500">
                        Amount
                      </div>
                      <div className="mt-1 text-3xl font-bold">{money(totals.netPay)}</div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="text-sm text-gray-500">Amount in words</div>
                    <div className="mt-2 border-b border-gray-400 pb-2 text-lg capitalize">
                      {checkWords}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="text-sm text-gray-500">Employee #</div>
                      <div className="mt-1 font-semibold">
                        {employee?.employee_number ?? '—'}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-gray-500">Memo / Period</div>
                      <div className="mt-1 font-semibold">
                        Payroll {periodStart} - {periodEnd}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-gray-500">Authorized signature</div>
                      <div className="mt-8 border-b border-gray-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="print-break" />

              <div className="mb-6">
                <h3 className="text-2xl font-bold">Payroll calculation</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Breakdown of how the payment was calculated
                </p>
              </div>

              <div className="mb-8 grid gap-4 md:grid-cols-2">
                <div className="rounded border border-gray-300 p-4">
                  <div className="mb-3 text-lg font-bold">Employee info</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Name</span>
                      <span className="font-medium">{fullName}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Employee #</span>
                      <span className="font-medium">{employee?.employee_number ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Employer form</span>
                      <span className="font-medium">{employee?.employer_form || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Pay type</span>
                      <span className="font-medium capitalize">{employee?.pay_type || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Rate / Salary</span>
                      <span className="font-medium">
                        {employee?.pay_type === 'monthly' || employee?.pay_type === 'one_time'
                          ? money(employee?.monthly_salary)
                          : money(employee?.hourly_rate)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Period</span>
                      <span className="font-medium">
                        {periodStart} - {periodEnd}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-gray-300 p-4">
                  <div className="mb-3 text-lg font-bold">Payment summary</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Total regular hours</span>
                      <span className="font-medium">{totals.totalReg.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Total labor</span>
                      <span className="font-medium">{money(totals.totalLabor)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Employee tax</span>
                      <span className="font-medium">{money(totals.employeeTaxNum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Rent</span>
                      <span className="font-medium">{money(totals.rentNum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Electric</span>
                      <span className="font-medium">{money(totals.electricNum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Water</span>
                      <span className="font-medium">{money(totals.waterNum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Clean</span>
                      <span className="font-medium">{money(totals.cleanNum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Transport</span>
                      <span className="font-medium">{money(totals.transportNum)}</span>
                    </div>
                    <div className="mt-2 border-t border-gray-300 pt-2" />
                    <div className="flex justify-between gap-4 font-bold">
                      <span>Net Pay</span>
                      <span>{money(totals.netPay)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-xl font-bold">Work log used in calculation</h4>
              </div>

              <div className="overflow-hidden rounded border border-gray-300">
                <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.7fr_0.7fr_0.9fr] bg-gray-100 px-4 py-3 text-sm font-bold">
                  <div>Date</div>
                  <div>Time In</div>
                  <div>Time Out</div>
                  <div>Lunch</div>
                  <div>Reg</div>
                  <div>Labor</div>
                </div>

                {filteredLogs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No work log rows in selected period
                  </div>
                ) : (
                  filteredLogs.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.7fr_0.7fr_0.9fr] border-t border-gray-200 px-4 py-3 text-sm"
                    >
                      <div>{row.work_date || '—'}</div>
                      <div>{row.time_in || '—'}</div>
                      <div>{row.time_out || '—'}</div>
                      <div>{Number(row.lunch_hours || 0).toFixed(2)}</div>
                      <div>{Number(row.reg_hours || 0).toFixed(2)}</div>
                      <div>{money(row.labor_amount)}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded border border-gray-300 p-4">
                  <div className="text-sm text-gray-600">Total regular hours</div>
                  <div className="mt-2 text-2xl font-bold">{totals.totalReg.toFixed(2)}</div>
                </div>

                <div className="rounded border border-gray-300 p-4">
                  <div className="text-sm text-gray-600">Total labor</div>
                  <div className="mt-2 text-2xl font-bold">{money(totals.totalLabor)}</div>
                </div>

                <div className="rounded border border-gray-300 p-4">
                  <div className="text-sm text-gray-600">Net pay</div>
                  <div className="mt-2 text-2xl font-bold">{money(totals.netPay)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const currentWeek = getSaturdayToFridayRange()

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [refreshingPayments, setRefreshingPayments] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [periodStart, setPeriodStart] = useState(currentWeek.start)
  const [periodEnd, setPeriodEnd] = useState(currentWeek.end)

  const [employeeTax, setEmployeeTax] = useState('0')
  const [rent, setRent] = useState('0')
  const [electric, setElectric] = useState('0')
  const [water, setWater] = useState('0')
  const [clean, setClean] = useState('0')
  const [transport, setTransport] = useState('0')

  useEffect(() => {
    loadPage()
  }, [id])

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

  function setCurrentWeek() {
    const range = getSaturdayToFridayRange()
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
  }

  function addRow() {
    setLogs((prev) => [buildEmptyRow(), ...prev])
  }

  function updateRowValue(rowId, field, value) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [field]: value }

        if (field === 'time_in' || field === 'time_out' || field === 'lunch_hours') {
          const computedHours = calcDayHours(
            nextRow.time_in,
            nextRow.time_out,
            nextRow.lunch_hours
          )

          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            const hourlyRate = Number(employee?.hourly_rate || 0)
            nextRow.labor_amount = String(round2(computedHours * hourlyRate))
          }
        }

        if (field === 'reg_hours' && employee?.pay_type === 'hourly') {
          const hourlyRate = Number(employee?.hourly_rate || 0)
          const reg = Number(value || 0)
          nextRow.labor_amount = String(round2(reg * hourlyRate))
        }

        return nextRow
      })
    )
  }

  async function saveRow(row) {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      if (!row.work_date) {
        setError('Date is required')
        return
      }

      const payload = {
        employee_id: id,
        work_date: row.work_date,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        lunch_hours: Number(row.lunch_hours || 0),
        reg_hours: Number(row.reg_hours || 0),
        labor_amount: Number(row.labor_amount || 0),
      }

      if (String(row.id).startsWith('new-')) {
        const { error } = await supabase.from('employee_work_logs').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_work_logs')
          .update(payload)
          .eq('id', row.id)

        if (error) throw error
      }

      setSuccess('Row saved')
      await loadPage()
    } catch (err) {
      console.error('saveRow error:', err)
      setError(err.message || 'Failed to save row')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row) {
    try {
      setError('')
      setSuccess('')

      if (String(row.id).startsWith('new-')) {
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

    let usedWeekHours = 0

    const recalculated = sorted.map((row) => {
      const baseHours = calcDayHours(row.time_in, row.time_out, row.lunch_hours)

      const regHours = Math.max(0, Math.min(baseHours, 40 - usedWeekHours))
      usedWeekHours += regHours

      let laborAmount = Number(row.labor_amount || 0)

      if (employee?.pay_type === 'hourly') {
        laborAmount = round2(regHours * Number(employee?.hourly_rate || 0))
      }

      return {
        ...row,
        reg_hours: regHours,
        labor_amount: laborAmount,
      }
    })

    const totalReg = recalculated.reduce(
      (sum, row) => sum + Number(row.reg_hours || 0),
      0
    )

    const totalLabor = recalculated.reduce(
      (sum, row) => sum + Number(row.labor_amount || 0),
      0
    )

    const employeeTaxNum = Number(employeeTax || 0)
    const rentNum = Number(rent || 0)
    const electricNum = Number(electric || 0)
    const waterNum = Number(water || 0)
    const cleanNum = Number(clean || 0)
    const transportNum = Number(transport || 0)

    const otherDeductions =
      rentNum + electricNum + waterNum + cleanNum + transportNum

    const employeeTaxAmount = round2((totalLabor * employeeTaxNum) / 100)
    const employeeDeductions = round2(employeeTaxAmount + otherDeductions)
    const netPay = round2(totalLabor - employeeDeductions)

    return {
      filteredForView: recalculated.sort((a, b) =>
        String(b.work_date || '').localeCompare(String(a.work_date || ''))
      ),
      totalReg: round2(totalReg),
      totalLabor: round2(totalLabor),
      employeeTaxNum: employeeTaxAmount,
      employeeTaxPercent: employeeTaxNum,
      rentNum,
      electricNum,
      waterNum,
      cleanNum,
      transportNum,
      employeeDeductions,
      netPay,
    }
  }, [filteredLogs, employee, employeeTax, rent, electric, water, clean, transport])

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

  function handleOpenPrintModal() {
    setError('')
    setSuccess('')
    setPrintModalOpen(true)
  }

  async function handleSaveAndPrint() {
    try {
      setPaying(true)
      setError('')
      setSuccess('')

      const netPay = Number(totals.netPay || 0)

      if (netPay <= 0) {
        setError('Net pay must be greater than 0')
        return
      }

      const nowIso = new Date().toISOString()
      const today = nowIso.slice(0, 10)

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
        net_pay: netPay,
        paid_at: nowIso,
      }

      const { error: paymentError } = await supabase
        .from('employee_payments')
        .insert(payload)

      if (paymentError) throw paymentError

      const { error: employeeUpdateError } = await supabase
        .from('employees')
        .update({
          last_payment_date: today,
          last_payment_amount: netPay,
        })
        .eq('id', id)

      if (employeeUpdateError) throw employeeUpdateError

      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              last_payment_date: today,
              last_payment_amount: netPay,
            }
          : prev
      )

      await loadPaymentsOnly()
      setSuccess('Payment saved')

      setTimeout(() => {
        window.print()
      }, 150)
    } catch (err) {
      console.error('handleSaveAndPrint error:', err)
      setError(err.message || 'Failed to save payment')
    } finally {
      setPaying(false)
    }
  }

  const displayLogs = totals.filteredForView || []

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
        @page {
          size: auto;
          margin: 12mm;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          .print-modal-sheet,
          .print-modal-sheet * {
            visibility: visible !important;
          }

          .print-modal-sheet {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 99999 !important;
            box-shadow: none !important;
          }

          .print-break {
            page-break-before: always;
            break-before: page;
          }

          .no-print {
            display: none !important;
          }
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

          <button
            onClick={setCurrentWeek}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-600/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-600/20"
          >
            <CalendarDays size={16} />
            Current Week
          </button>

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
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                    {employee?.photo_url ? (
                      <img
                        src={employee.photo_url}
                        alt={fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>

                  <div>
                    <h1 className="text-2xl font-bold text-white">{fullName}</h1>
                    <p className="mt-1 text-sm text-slate-400">
                      Weekly payroll card. Default week is Saturday → Friday.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-8">
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
                      <User size={14} />
                      Name
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">{fullName}</div>
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
                      Last payment date
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {formatDate(employee?.last_payment_date)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <DollarSign size={14} />
                      Last payment amount
                    </div>
                    <div className="mt-1 text-lg font-bold text-emerald-300">
                      {money(employee?.last_payment_amount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period end</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
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
                    <DollarSign size={14} />
                    Total labor
                  </div>
                  <div className="mt-1 text-xl font-bold text-cyan-300">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <DollarSign size={14} />
                    Employee tax
                  </div>
                  <div className="mt-1 text-xl font-bold text-yellow-300">
                    {money(totals.employeeTaxNum)}
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

                  <div className="grid gap-3 border-b border-slate-800 bg-[#0b1220] px-5 py-3 md:grid-cols-3">
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
                              {row.period_start || '—'} - {row.period_end || '—'}
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
                      Max 12h/day, lunch deducted, max 40h/week
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[1fr_0.95fr_0.95fr_0.8fr_0.8fr_0.95fr_0.8fr] bg-slate-900/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <div>Date</div>
                    <div>Time In</div>
                    <div>Time Out</div>
                    <div>Lunch</div>
                    <div>Reg</div>
                    <div>Labor</div>
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
                        className="grid grid-cols-[1fr_0.95fr_0.95fr_0.8fr_0.8fr_0.95fr_0.8fr] items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-2.5"
                      >
                        <input
                          type="date"
                          value={row.work_date || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'work_date', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="time"
                          value={row.time_in || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'time_in', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="time"
                          value={row.time_out || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'time_out', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.lunch_hours ?? '1'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'lunch_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
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

                        <div className="flex gap-2">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={saving}
                            className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                          >
                            Save
                          </button>

                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-lg border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300 transition hover:bg-red-600/20"
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
                  <label className="mb-1 block text-xs text-slate-300">Employee tax %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={employeeTax}
                    onChange={(e) => setEmployeeTax(e.target.value)}
                    className={darkInput}
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

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Total labor</div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Employee deductions</div>
                  <div className="mt-1 text-xl font-bold text-red-300">
                    {money(totals.employeeDeductions)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Employee tax</div>
                  <div className="mt-1 text-xl font-bold text-amber-300">
                    {money(totals.employeeTaxNum)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                  <div className="text-xs text-emerald-300">Net Pay</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <PrintPreviewModal
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          onPrintAndSave={handleSaveAndPrint}
          printing={paying}
          employee={employee}
          fullName={fullName}
          periodStart={periodStart}
          periodEnd={periodEnd}
          totals={totals}
          filteredLogs={displayLogs}
        />
      </div>
    </div>
  )
}
