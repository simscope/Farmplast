import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ReceiptText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculatePaystubDetails,
  getDefaultPaystubPeriod,
} from '../lib/payrollTaxMath'

const shell =
  'rounded-lg border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]'

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

function PaystubSection({
  title,
  amount,
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
        <span className="text-sm font-bold tabular-nums">{money(amount)}</span>
      </button>

      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  )
}

function DetailRow({ label, value, muted = false }) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] gap-4 border-t border-slate-100 py-2.5 text-sm ${
        muted ? 'text-slate-500' : 'text-slate-800'
      }`}
    >
      <span>{label}</span>
      <span className="font-medium tabular-nums text-slate-950">{money(value)}</span>
    </div>
  )
}

export default function EmployeePayStubPage() {
  const { employeeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultPeriod = getDefaultPaystubPeriod()

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [deductions, setDeductions] = useState({})
  const [priorYtdGross, setPriorYtdGross] = useState(0)
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

        const yearStart = `${String(periodStart).slice(0, 4)}-01-01`
        const { data: ytdPaymentsData, error: ytdPaymentsError } = await supabase
          .from('employee_payments')
          .select('total_labor,paid_at,period_start')
          .eq('employee_id', employeeId)
          .gte('period_start', yearStart)
          .lt('period_start', periodStart)

        if (ytdPaymentsError) throw ytdPaymentsError

        const ytdGross = (ytdPaymentsData || []).reduce(
          (sum, row) => sum + Number(row.total_labor || 0),
          0
        )

        setEmployee(employeeData)
        setLogs(logsData || [])
        setDeductions(deductionData || {})
        setPriorYtdGross(ytdGross)
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
        logs,
        deductions,
        periodStart,
        periodEnd,
        priorYtdGross,
      }),
    [deductions, employee, logs, periodEnd, periodStart, priorYtdGross]
  )

  const employeeName = getEmployeeName(employee)

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/employees/${employeeId}`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <CalendarDays size={16} />
            <span>{formatDate(periodStart)}</span>
            <span>-</span>
            <span>{formatDate(periodEnd)}</span>
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
            <main className={shell}>
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

              <PaystubSection title="Gross earnings" amount={paystub.grossPay} defaultOpen>
                <DetailRow label="Regular earnings" value={paystub.mainLabor} />
                <DetailRow label="Overtime earnings" value={paystub.overtimeLabor} />
                <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                  <div>Regular hours: {paystub.mainHours.toFixed(2)}</div>
                  <div>Overtime hours: {paystub.overtimeHours.toFixed(2)}</div>
                </div>
              </PaystubSection>

              <PaystubSection
                title="Employee taxes"
                amount={paystub.totalEmployeeTaxes}
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

              <PaystubSection title="Employee deductions" amount={paystub.deductions.total}>
                <DetailRow label="Rent" value={paystub.deductions.rent} />
                <DetailRow label="Electric" value={paystub.deductions.electric} />
                <DetailRow label="Water" value={paystub.deductions.water} />
                <DetailRow label="Clean" value={paystub.deductions.clean} />
                <DetailRow label="Transport" value={paystub.deductions.transport} />
              </PaystubSection>

              <PaystubSection title="Reimbursements" amount={paystub.reimbursements}>
                <DetailRow label="Total reimbursements" value={paystub.reimbursements} muted />
              </PaystubSection>

              <PaystubSection title="Net pay" amount={paystub.netPay} defaultOpen tone="net">
                <DetailRow label="Gross pay" value={paystub.grossPay} />
                <DetailRow label="Total employee taxes" value={-paystub.totalEmployeeTaxes} />
                <DetailRow label="Deductions" value={-paystub.deductions.total} />
                <DetailRow label="Reimbursements" value={paystub.reimbursements} />
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
                  <DetailRow label="Gross Pay" value={paystub.grossPay} />
                  <DetailRow
                    label="Total Employee Taxes"
                    value={paystub.totalEmployeeTaxes}
                  />
                  <DetailRow label="Deductions" value={paystub.deductions.total} />
                  <div className="grid grid-cols-[1fr_auto] gap-4 py-4 text-base">
                    <span className="font-semibold text-slate-950">Net Pay</span>
                    <span className="font-bold tabular-nums text-emerald-700">
                      {money(paystub.netPay)}
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
