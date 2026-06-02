import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Printer,
  ReceiptText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculatePaystubDetails,
  getDefaultPaystubPeriod,
} from '../lib/payrollTaxMath'
import { normalizePaymentHistory } from '../utils/paymentHistory'

const shell =
  'rounded-lg border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]'
const compactInput =
  'rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500'

function money(value) {
  const num = Number(value || 0)
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value) {
  if (!value) return '-'

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function getEmployeeName(employee) {
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || 'Employee'
}

function getPaystubPeriod(mode, baseDate = new Date()) {
  const today = new Date(baseDate)
  today.setHours(0, 0, 0, 0)

  const day = today.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() + diffToMonday)

  const start = new Date(thisMonday)
  if (mode === 'last') {
    start.setDate(thisMonday.getDate() - 7)
  }

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function PaystubSection({
  title,
  amount,
  ytdAmount,
  children,
  defaultOpen = false,
  tone = 'default',
}) {
  const [open, setOpen] = useState(defaultOpen)

  const toneClass =
    tone === 'net'
      ? 'bg-emerald-50 text-emerald-900'
      : tone === 'deduction'
        ? 'bg-rose-50 text-rose-950'
        : 'bg-white text-slate-950'

  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 ${toneClass}`}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </span>
        <span className="grid min-w-[210px] grid-cols-2 gap-4 text-right text-sm font-bold tabular-nums">
          <span>{money(amount)}</span>
          <span>{ytdAmount === undefined ? '-' : money(ytdAmount)}</span>
        </span>
      </button>

      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  )
}

function DetailRow({ label, value, ytdValue, muted = false }) {
  return (
    <div
      className={`grid grid-cols-[1fr_105px_105px] gap-4 border-t border-slate-100 py-2.5 text-sm ${
        muted ? 'text-slate-500' : 'text-slate-800'
      }`}
    >
      <span>{label}</span>
      <span className="text-right font-medium tabular-nums text-slate-950">{money(value)}</span>
      <span className="text-right font-medium tabular-nums text-slate-950">
        {ytdValue === undefined ? '-' : money(ytdValue)}
      </span>
    </div>
  )
}

function EarningsRow({ label, rate, hours, value, ytdValue }) {
  return (
    <div className="grid grid-cols-[1fr_90px_80px_105px_105px] gap-4 border-t border-slate-100 py-2.5 text-sm text-slate-800">
      <span>{label}</span>
      <span className="text-right tabular-nums text-slate-950">
        {rate ? money(rate) : '-'}
      </span>
      <span className="text-right tabular-nums text-slate-950">
        {Number(hours || 0).toFixed(2)}
      </span>
      <span className="text-right font-medium tabular-nums text-slate-950">{money(value)}</span>
      <span className="text-right font-medium tabular-nums text-slate-950">
        {ytdValue === undefined ? '-' : money(ytdValue)}
      </span>
    </div>
  )
}

export default function EmployeePayStubPage() {
  const { employeeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultPeriod = getDefaultPaystubPeriod()

  const [employee, setEmployee] = useState(null)
  const [taxProfile, setTaxProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [deductions, setDeductions] = useState({})
  const [priorYtdGross, setPriorYtdGross] = useState(0)
  const [priorYtdTotals, setPriorYtdTotals] = useState({
    employeeTaxes: 0,
    deductions: 0,
    deductionBreakdown: {
      rent: 0,
      electric: 0,
      water: 0,
      clean: 0,
      transport: 0,
    },
    reimbursements: 0,
    netPay: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const periodStart = searchParams.get('periodStart') || defaultPeriod.start
  const periodEnd = searchParams.get('periodEnd') || defaultPeriod.end

  useEffect(() => {
    if (!searchParams.get('periodStart') || !searchParams.get('periodEnd')) {
      setSearchParams(
        { periodStart: defaultPeriod.start, periodEnd: defaultPeriod.end },
        { replace: true }
      )
    }
  }, [defaultPeriod.end, defaultPeriod.start, searchParams, setSearchParams])

  useEffect(() => {
    async function loadPaystub() {
      try {
        setLoading(true)
        setError('')

        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .maybeSingle()

        if (employeeError) throw employeeError
        if (!employeeData) throw new Error('Employee not found')

        const { data: logsData, error: logsError } = await supabase
          .from('employee_work_logs')
          .select('*')
          .eq('employee_id', employeeId)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .gte('work_date', periodStart)
          .lte('work_date', periodEnd)
          .order('work_date', { ascending: true })

        if (logsError) throw logsError

        const { data: deductionData, error: deductionError } = await supabase
          .from('employee_payroll_deductions')
          .select('rent,electric,water,clean,transport')
          .eq('employee_id', employeeId)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .maybeSingle()

        if (deductionError) throw deductionError

        const { data: taxProfileData, error: taxProfileError } = await supabase
          .from('employee_tax_profiles')
          .select('*')
          .eq('employee_id', employeeId)
          .maybeSingle()

        if (taxProfileError) {
          console.warn('employee_tax_profiles load skipped:', taxProfileError)
        }

        const yearStart = `${String(periodStart).slice(0, 4)}-01-01`
        const { data: ytdPaymentsData, error: ytdPaymentsError } = await supabase
          .from('employee_payments')
          .select('employee_id,period_start,period_end,total_labor,employee_tax,rent,electric,water,clean,transport,net_pay,paid_at,created_at')
          .eq('employee_id', employeeId)
          .gte('period_start', yearStart)
          .lt('period_start', periodStart)

        if (ytdPaymentsError) throw ytdPaymentsError
        const ytdPayments = normalizePaymentHistory(ytdPaymentsData)

        const ytdGross = ytdPayments.reduce(
          (sum, row) => sum + Number(row.total_labor || 0),
          0
        )
        const ytdEmployeeTaxes = ytdPayments.reduce(
          (sum, row) => sum + Number(row.employee_tax || 0),
          0
        )
        const ytdDeductions = ytdPayments.reduce(
          (sum, row) =>
            sum +
            Number(row.rent || 0) +
            Number(row.electric || 0) +
            Number(row.water || 0) +
            Number(row.clean || 0) +
            Number(row.transport || 0),
          0
        )
        const ytdDeductionBreakdown = ytdPayments.reduce(
          (acc, row) => ({
            rent: acc.rent + Number(row.rent || 0),
            electric: acc.electric + Number(row.electric || 0),
            water: acc.water + Number(row.water || 0),
            clean: acc.clean + Number(row.clean || 0),
            transport: acc.transport + Number(row.transport || 0),
          }),
          {
            rent: 0,
            electric: 0,
            water: 0,
            clean: 0,
            transport: 0,
          }
        )
        const ytdNetPay = ytdPayments.reduce(
          (sum, row) => sum + Number(row.net_pay || 0),
          0
        )

        setEmployee(employeeData)
        setTaxProfile(taxProfileData || null)
        setLogs(logsData || [])
        setDeductions(deductionData || {})
        setPriorYtdGross(ytdGross)
        setPriorYtdTotals({
          employeeTaxes: ytdEmployeeTaxes,
          deductions: ytdDeductions,
          deductionBreakdown: ytdDeductionBreakdown,
          reimbursements: 0,
          netPay: ytdNetPay,
        })
      } catch (err) {
        console.error('loadPaystub error:', err)
        setError(err.message || 'Failed to load paystub')
      } finally {
        setLoading(false)
      }
    }

    loadPaystub()
  }, [employeeId, periodEnd, periodStart])

  const paystub = useMemo(
    () =>
      calculatePaystubDetails({
        employee,
        taxProfile,
        logs,
        deductions,
        periodStart,
        periodEnd,
        priorYtdGross,
        priorYtdEmployeeTaxes: priorYtdTotals.employeeTaxes,
        priorYtdDeductions: priorYtdTotals.deductions,
        priorYtdDeductionBreakdown: priorYtdTotals.deductionBreakdown,
        priorYtdReimbursements: priorYtdTotals.reimbursements,
        priorYtdNetPay: priorYtdTotals.netPay,
      }),
    [deductions, employee, logs, periodEnd, periodStart, priorYtdGross, priorYtdTotals, taxProfile]
  )

  const employeeName = getEmployeeName(employee)

  function applyPeriod(mode) {
    const range = getPaystubPeriod(mode)
    setSearchParams({ periodStart: range.start, periodEnd: range.end })
  }

  function updatePeriod(field, value) {
    setSearchParams({
      periodStart: field === 'start' ? value : periodStart,
      periodEnd: field === 'end' ? value : periodEnd,
    })
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-950">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-shell { box-shadow: none !important; border-color: #cbd5e1 !important; }
        }
      `}</style>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/employees/${employeeId}`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyPeriod('last')}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Last Week
            </button>
            <button
              type="button"
              onClick={() => applyPeriod('this')}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              This Week
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <CalendarDays size={16} />
              <input
                type="date"
                className={compactInput}
                value={periodStart}
                onChange={(e) => updatePeriod('start', e.target.value)}
              />
              <span>-</span>
              <input
                type="date"
                className={compactInput}
                value={periodEnd}
                onChange={(e) => updatePeriod('end', e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Printer size={16} />
              Print
            </button>
          </div>
        </div>

        {loading ? (
          <div className={`${shell} p-8 text-center text-slate-500`}>Loading paystub...</div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <main className={`${shell} print-shell`}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <ReceiptText size={14} />
                      2026 payroll tax calculation
                    </div>
                    <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
                      Paystub details
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">{employeeName}</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-semibold text-slate-950">Pay period</div>
                    <div className="mt-1">
                      {formatDate(periodStart)} - {formatDate(periodEnd)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_105px_105px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span />
                <span className="text-right">Current</span>
                <span className="text-right">Year to date</span>
              </div>

              <PaystubSection
                title="Gross earnings"
                amount={paystub.grossPay}
                ytdAmount={paystub.ytdGrossPay}
                defaultOpen
              >
                <div className="grid grid-cols-[1fr_90px_80px_105px_105px] gap-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Description</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Hours</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">Year to date</span>
                </div>
                <EarningsRow
                  label="Regular earnings"
                  rate={paystub.regularRate}
                  hours={paystub.mainHours}
                  value={paystub.mainLabor}
                  ytdValue={paystub.ytdGrossPay - paystub.overtimeLabor}
                />
                <EarningsRow
                  label="Overtime earnings"
                  rate={paystub.overtimeRate}
                  hours={paystub.overtimeHours}
                  value={paystub.overtimeLabor}
                  ytdValue={paystub.overtimeLabor}
                />
              </PaystubSection>

              <PaystubSection
                title="Employee taxes"
                amount={paystub.totalEmployeeTaxes}
                ytdAmount={paystub.ytdEmployeeTaxes}
                defaultOpen
                tone="deduction"
              >
                {paystub.employeeTaxes.map((tax) => (
                  <DetailRow
                    key={tax.key}
                    label={
                      tax.taxableWages !== undefined
                        ? `${tax.label} (${money(tax.taxableWages)} taxable)`
                        : tax.label
                    }
                    value={tax.amount}
                  />
                ))}
              </PaystubSection>

              <PaystubSection
                title="Employee deductions"
                amount={paystub.deductions.total}
                ytdAmount={paystub.deductions.ytdTotal}
              >
                <DetailRow label="Rent" value={paystub.deductions.rent} ytdValue={paystub.deductions.ytdRent} />
                <DetailRow label="Electric" value={paystub.deductions.electric} ytdValue={paystub.deductions.ytdElectric} />
                <DetailRow label="Water" value={paystub.deductions.water} ytdValue={paystub.deductions.ytdWater} />
                <DetailRow label="Clean" value={paystub.deductions.clean} ytdValue={paystub.deductions.ytdClean} />
                <DetailRow label="Transport" value={paystub.deductions.transport} ytdValue={paystub.deductions.ytdTransport} />
              </PaystubSection>

              <PaystubSection
                title="Reimbursements"
                amount={paystub.reimbursements}
                ytdAmount={paystub.ytdReimbursements}
              >
                <DetailRow
                  label="Total reimbursements"
                  value={paystub.reimbursements}
                  ytdValue={paystub.ytdReimbursements}
                  muted
                />
              </PaystubSection>

              <PaystubSection
                title="Net pay"
                amount={paystub.netPay}
                ytdAmount={paystub.ytdNetPay}
                defaultOpen
                tone="net"
              >
                <DetailRow label="Gross pay" value={paystub.grossPay} ytdValue={paystub.ytdGrossPay} />
                <DetailRow
                  label="Total employee taxes"
                  value={-paystub.totalEmployeeTaxes}
                  ytdValue={-paystub.ytdEmployeeTaxes}
                />
                <DetailRow
                  label="Deductions"
                  value={-paystub.deductions.total}
                  ytdValue={-paystub.deductions.ytdTotal}
                />
                <DetailRow
                  label="Reimbursements"
                  value={paystub.reimbursements}
                  ytdValue={paystub.ytdReimbursements}
                />
              </PaystubSection>
            </main>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className={shell}>
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <DollarSign size={17} />
                    Summary
                  </div>
                </div>

                <div className="divide-y divide-slate-100 px-5 py-2">
                  <DetailRow label="Gross Pay" value={paystub.grossPay} ytdValue={paystub.ytdGrossPay} />
                  <DetailRow
                    label="Total Employee Taxes"
                    value={paystub.totalEmployeeTaxes}
                    ytdValue={paystub.ytdEmployeeTaxes}
                  />
                  <DetailRow
                    label="Deductions"
                    value={paystub.deductions.total}
                    ytdValue={paystub.deductions.ytdTotal}
                  />
                  <div className="grid grid-cols-[1fr_105px_105px] gap-4 py-4 text-base">
                    <span className="font-semibold text-slate-950">Net Pay</span>
                    <span className="text-right font-bold tabular-nums text-emerald-700">
                      {money(paystub.netPay)}
                    </span>
                    <span className="text-right font-bold tabular-nums text-emerald-700">
                      {money(paystub.ytdNetPay)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`${shell} mt-4 p-5`}>
                <div className="text-sm font-semibold text-slate-950">Tax setup</div>
                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  <div>Tax year: {paystub.taxMeta.year}</div>
                  <div>Pay frequency: {paystub.taxMeta.payPeriod}</div>
                  <div>Federal W-4: {paystub.taxMeta.federalFilingStatus}, no credits or extra withholding unless employee fields exist</div>
                  <div>NJ-W4: Rate {paystub.taxMeta.njRateCode}, {paystub.taxMeta.njAllowances} allowances</div>
                  <div>YTD gross before this check: {money(paystub.taxMeta.ytdGrossBefore)}</div>
                  {paystub.taxMeta.isTaxExempt ? (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                      Employee form is marked 1099/Other, so employee payroll taxes are not withheld.
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
