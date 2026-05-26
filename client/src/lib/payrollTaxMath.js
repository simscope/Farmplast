import {
  calculatePayrollTotals,
  getWeeksInSelectedPeriod,
  normalizePayrollRow,
  round2,
} from '../utils/payrollMath'

const EMPLOYEE_TAX_RATES = [
  { key: 'federalIncomeTax', label: 'Federal Income Tax', rate: 0.0717 },
  { key: 'socialSecurity', label: 'Social Security', rate: 0.062 },
  { key: 'medicare', label: 'Medicare', rate: 0.0145 },
  { key: 'njStateIncomeTax', label: 'NJ State Income Tax', rate: 0.02456 },
  { key: 'njSuiWorkforce', label: 'NJ SUI / Workforce Development', rate: 0.00425 },
  { key: 'njDisabilityInsurance', label: 'NJ Disability Insurance', rate: 0.0019 },
  { key: 'njFamilyLeaveInsurance', label: 'NJ Family Leave Insurance', rate: 0.0023 },
]

function moneyRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function numberOrZero(value) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function getDeductionTotal(deductions = {}) {
  return moneyRound(
    numberOrZero(deductions.rent) +
      numberOrZero(deductions.electric) +
      numberOrZero(deductions.water) +
      numberOrZero(deductions.clean) +
      numberOrZero(deductions.transport)
  )
}

export function getDefaultPaystubPeriod(baseDate = new Date()) {
  const today = new Date(baseDate)
  today.setHours(0, 0, 0, 0)

  const day = today.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() + diffToMonday)
  thisMonday.setHours(0, 0, 0, 0)

  const start = new Date(thisMonday)
  start.setDate(thisMonday.getDate() - 7)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export function calculatePaystubDetails({
  employee = {},
  logs = [],
  deductions = {},
  reimbursements = 0,
  periodStart,
  periodEnd,
} = {}) {
  const filteredLogs = logs.filter((row) => {
    if (!row.work_date) return true
    if (periodStart && row.work_date < periodStart) return false
    if (periodEnd && row.work_date > periodEnd) return false
    return true
  })

  const normalizedRows = filteredLogs
    .map((row) => normalizePayrollRow(row, employee))
    .sort((a, b) => String(a.work_date || '').localeCompare(String(b.work_date || '')))

  const payrollTotals = calculatePayrollTotals(normalizedRows, employee)
  const weeksCount = getWeeksInSelectedPeriod(periodStart, periodEnd)
  const employerForm = String(employee?.employer_form || '').trim().toUpperCase()
  const isTaxExempt = employerForm === 'OTHER' || employerForm === '1099'

  let grossPay = numberOrZero(payrollTotals.totalLabor)

  if (employee?.pay_type === 'monthly') {
    grossPay = moneyRound((numberOrZero(employee?.monthly_salary) / 4) * weeksCount)
  }

  if (employee?.pay_type === 'one_time') {
    grossPay = moneyRound(employee?.monthly_salary)
  }

  const mainLabor =
    employee?.pay_type === 'hourly' ? moneyRound(payrollTotals.mainLabor) : grossPay
  const overtimeLabor =
    employee?.pay_type === 'hourly' ? moneyRound(payrollTotals.overtimeLabor) : 0

  const taxableGross = isTaxExempt ? 0 : grossPay
  const employeeTaxes = EMPLOYEE_TAX_RATES.map((tax) => ({
    ...tax,
    amount: moneyRound(taxableGross * tax.rate),
  }))

  const totalEmployeeTaxes = moneyRound(
    employeeTaxes.reduce((sum, tax) => sum + tax.amount, 0)
  )
  const totalDeductions = getDeductionTotal(deductions)
  const totalReimbursements = moneyRound(reimbursements)
  const netPay = moneyRound(
    grossPay - totalEmployeeTaxes - totalDeductions + totalReimbursements
  )

  return {
    rows: normalizedRows,
    grossPay,
    mainHours: round2(payrollTotals.mainHours),
    overtimeHours: round2(payrollTotals.overtimeHours),
    mainLabor,
    overtimeLabor,
    employeeTaxes,
    totalEmployeeTaxes,
    deductions: {
      rent: moneyRound(deductions.rent),
      electric: moneyRound(deductions.electric),
      water: moneyRound(deductions.water),
      clean: moneyRound(deductions.clean),
      transport: moneyRound(deductions.transport),
      total: totalDeductions,
    },
    reimbursements: totalReimbursements,
    netPay,
  }
}
