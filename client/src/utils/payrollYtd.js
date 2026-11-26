import { normalizePaymentHistory } from './paymentHistory.js'

const PAYROLL_TIME_ZONE = 'America/New_York'
const paymentDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PAYROLL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const paymentClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PAYROLL_TIME_ZONE,
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function getPayrollPaymentDate(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`)
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
      ? ''
      : value
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(paymentDateFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getPayrollPaymentTimestamp(value) {
  const date = getPayrollPaymentDate(value)
  if (!date) return ''
  const utcNoon = new Date(`${date}T12:00:00Z`)
  const nyHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: PAYROLL_TIME_ZONE, hour: '2-digit', hourCycle: 'h23',
  }).format(utcNoon))
  return new Date(utcNoon.getTime() + (12 - nyHour) * 3600000).toISOString()
}

function numeric(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function time(value) {
  const timestamp = value ? new Date(value).getTime() : NaN
  return Number.isFinite(timestamp) ? timestamp : null
}

function hasSelectedDateTimestamp(value) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getUTCMilliseconds() === 0 &&
    paymentClockFormatter.format(date) === '12:00:00'
}

export function getPayrollYtdTotals(payments = [], {
  employeeId,
  periodStart,
  periodEnd,
  paymentDate,
  now = new Date(),
} = {}) {
  const employeePayments = normalizePaymentHistory(payments).filter(
    (row) => employeeId !== undefined && String(row.employee_id) === String(employeeId)
  )
  const isCurrentPeriod = (row) => row.period_start === periodStart && row.period_end === periodEnd
  const referencePayment = employeePayments.find((row) => isCurrentPeriod(row) && getPayrollPaymentDate(row.paid_at)) || null
  const explicitDate = getPayrollPaymentDate(paymentDate)
  const effectiveDate = explicitDate || getPayrollPaymentDate(referencePayment?.paid_at) || getPayrollPaymentDate(now)
  const yearStart = effectiveDate ? `${effectiveDate.slice(0, 4)}-01-01` : ''
  const referenceTime = !explicitDate && referencePayment && !/^\d{4}-\d{2}-\d{2}$/.test(referencePayment.paid_at)
    ? time(referencePayment.paid_at) : null
  const referenceCreatedTime = referenceTime !== null ? time(referencePayment.created_at) : null

  const priorPayments = employeePayments.filter((row) => {
    if (isCurrentPeriod(row)) return false
    // Creation/work dates are not substitutes for an actual payment date.
    const paidDate = getPayrollPaymentDate(row.paid_at)
    if (!paidDate || !yearStart || paidDate < yearStart || paidDate > effectiveDate) return false
    if (referenceTime !== null && paidDate === effectiveDate) {
      const paidTime = time(row.paid_at)
      const createdTime = time(row.created_at)
      // Existing Details checks encode a selected date at NY noon; Dashboard
      // checks retain the confirmation instant. For mixed representations on
      // one pay day, use issuance order instead of treating noon as a real time.
      const selectedDate = hasSelectedDateTimestamp(row.paid_at) || hasSelectedDateTimestamp(referencePayment.paid_at)
      if ((selectedDate || paidTime === referenceTime) && referenceCreatedTime !== null && createdTime !== null) {
        if (createdTime > referenceCreatedTime) return false
      } else if (paidTime > referenceTime) return false
    }
    return true
  })

  const priorYtdDeductionBreakdown = { rent: 0, electric: 0, water: 0, clean: 0, transport: 0 }
  let priorYtdGross = 0
  let priorYtdEmployeeTaxes = 0
  let priorYtdNetPay = 0
  for (const row of priorPayments) {
    priorYtdGross += numeric(row.total_labor)
    priorYtdEmployeeTaxes += numeric(row.employee_tax)
    priorYtdNetPay += numeric(row.net_pay)
    for (const key of Object.keys(priorYtdDeductionBreakdown)) {
      priorYtdDeductionBreakdown[key] += numeric(row[key])
    }
  }

  return {
    paymentDate: effectiveDate,
    referencePayment,
    priorPayments,
    priorYtdGross,
    priorYtdEmployeeTaxes,
    priorYtdDeductions: Object.values(priorYtdDeductionBreakdown).reduce((sum, amount) => sum + amount, 0),
    priorYtdDeductionBreakdown,
    priorYtdNetPay,
  }
}

export async function loadPayrollPaymentHistory(supabase, { employeeIds } = {}) {
  const ids = employeeIds ? [...new Set(employeeIds.filter(Boolean))] : null
  if (ids && ids.length === 0) return []
  const payments = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('employee_payments')
      .select('id,employee_id,period_start,period_end,total_labor,employee_tax,rent,electric,water,clean,transport,net_pay,paid_at,created_at')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (ids) query = query.in('employee_id', ids)
    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    payments.push(...rows)
    if (rows.length < pageSize) break
  }
  return normalizePaymentHistory(payments)
}

const FINAL_CHECK_STATUSES = ['printed', 'paid']
const DEDUCTION_FIELDS = ['rent', 'electric', 'water', 'clean', 'transport']

function cents(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : null
}

function paymentPeriodKey(employeeId, start, end) {
  return JSON.stringify([String(employeeId), start, end])
}

export async function loadPayrollEarningsChecks(supabase, employeeId, payments) {
  const periodStarts = [...new Set(payments.map((payment) => payment.period_start).filter(Boolean))].sort()
  if (!employeeId || !periodStarts.length) return []

  const checks = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('payroll_checks')
      .select('id,employee_id,pay_period_start,pay_period_end,status,voided_at,regular_labor,overtime_labor,gross_pay,net_pay,employee_tax,rent,electric,water,clean,transport')
      .eq('employee_id', employeeId)
      .in('status', FINAL_CHECK_STATUSES)
      .is('voided_at', null)
      .gte('pay_period_start', periodStarts[0])
      .lte('pay_period_start', periodStarts.at(-1))
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const rows = data || []
    checks.push(...rows)
    if (rows.length < pageSize) return checks
  }
}

// Payments define what's included in YTD. Use checks only for a verifiable split:
// older payments and grouped company checks may have no matching individual snapshot.
export function getPaystubYtdEarnings({ priorPayments, referencePayment, priorYtdGross }, checks, preview) {
  const checksByPeriod = new Map()
  for (const check of checks) {
    if (check.voided_at || !FINAL_CHECK_STATUSES.includes(check.status)) continue
    const key = paymentPeriodKey(check.employee_id, check.pay_period_start, check.pay_period_end)
    if (!checksByPeriod.has(key)) checksByPeriod.set(key, [])
    checksByPeriod.get(key).push(check)
  }

  const paidPayments = referencePayment ? [...priorPayments, referencePayment] : priorPayments
  const gross = cents(priorYtdGross) + (cents(referencePayment?.total_labor) ?? cents(preview.grossPay))
  let regular = referencePayment ? 0 : cents(preview.mainLabor)
  let overtime = referencePayment ? 0 : cents(preview.overtimeLabor)
  let missingPayments = 0

  for (const payment of paidPayments) {
    const key = paymentPeriodKey(payment.employee_id, payment.period_start, payment.period_end)
    const paidGross = cents(payment.total_labor)
    const matches = (checksByPeriod.get(key) || []).filter((check) =>
      paidGross !== null && cents(check.gross_pay) === paidGross &&
      ['net_pay', 'employee_tax'].every((field) =>
        cents(payment[field]) !== null && cents(check[field]) === cents(payment[field])
      ) &&
      DEDUCTION_FIELDS.every((field) => (cents(check[field]) ?? 0) === (cents(payment[field]) ?? 0))
    )
    const checkRegular = cents(matches[0]?.regular_labor)
    const checkOvertime = cents(matches[0]?.overtime_labor)
    // Reprints with the same split do not make it ambiguous. Conflicting snapshots do.
    if (checkRegular === null || checkOvertime === null || checkRegular + checkOvertime !== paidGross ||
        matches.some((check) => cents(check.regular_labor) !== checkRegular || cents(check.overtime_labor) !== checkOvertime)) {
      missingPayments += 1
      continue
    }
    regular += checkRegular
    overtime += checkOvertime
  }

  const complete = missingPayments === 0 && regular + overtime === gross
  return {
    gross: gross / 100,
    regular: complete ? regular / 100 : undefined,
    overtime: complete ? overtime / 100 : undefined,
    missingPayments,
  }
}
