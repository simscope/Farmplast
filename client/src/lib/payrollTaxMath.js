import {
  calculatePayrollTotals,
  getWeeksInSelectedPeriod,
  normalizePayrollRow,
  round2,
} from '../utils/payrollMath'

const PAY_PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

const FEDERAL_2026_PERCENTAGE_TABLES = {
  weekly: {
    single: [
      [0, 310, 0, 0, 0],
      [310, 548, 0, 0.1, 310],
      [548, 1279, 23.8, 0.12, 548],
      [1279, 2342, 111.52, 0.22, 1279],
      [2342, 4190, 345.38, 0.24, 2342],
      [4190, 5237, 788.9, 0.32, 4190],
      [5237, 12629, 1123.94, 0.35, 5237],
      [12629, Infinity, 3711.14, 0.37, 12629],
    ],
    married: [
      [0, 619, 0, 0, 0],
      [619, 1096, 0, 0.1, 619],
      [1096, 2558, 47.7, 0.12, 1096],
      [2558, 4685, 223.14, 0.22, 2558],
      [4685, 8380, 691.08, 0.24, 4685],
      [8380, 10474, 1577.88, 0.32, 8380],
      [10474, 15402, 2247.96, 0.35, 10474],
      [15402, Infinity, 3972.76, 0.37, 15402],
    ],
    headOfHousehold: [
      [0, 464, 0, 0, 0],
      [464, 805, 0, 0.1, 464],
      [805, 1762, 34.1, 0.12, 805],
      [1762, 2497, 148.94, 0.22, 1762],
      [2497, 4344, 310.64, 0.24, 2497],
      [4344, 5391, 753.92, 0.32, 4344],
      [5391, 12784, 1088.96, 0.35, 5391],
      [12784, Infinity, 3676.51, 0.37, 12784],
    ],
  },
  biweekly: {
    single: [
      [0, 619, 0, 0, 0],
      [619, 1096, 0, 0.1, 619],
      [1096, 2558, 47.7, 0.12, 1096],
      [2558, 4685, 223.14, 0.22, 2558],
      [4685, 8380, 691.08, 0.24, 4685],
      [8380, 10474, 1577.88, 0.32, 8380],
      [10474, 25258, 2247.96, 0.35, 10474],
      [25258, Infinity, 7422.36, 0.37, 25258],
    ],
    married: [
      [0, 1238, 0, 0, 0],
      [1238, 2192, 0, 0.1, 1238],
      [2192, 5115, 95.4, 0.12, 2192],
      [5115, 9369, 446.16, 0.22, 5115],
      [9369, 16760, 1382.04, 0.24, 9369],
      [16760, 20948, 3155.88, 0.32, 16760],
      [20948, 30804, 4496.04, 0.35, 20948],
      [30804, Infinity, 7945.64, 0.37, 30804],
    ],
    headOfHousehold: [
      [0, 929, 0, 0, 0],
      [929, 1610, 0, 0.1, 929],
      [1610, 3523, 68.1, 0.12, 1610],
      [3523, 4994, 297.66, 0.22, 3523],
      [4994, 8688, 621.28, 0.24, 4994],
      [8688, 10783, 1507.84, 0.32, 8688],
      [10783, 25567, 2178.24, 0.35, 10783],
      [25567, Infinity, 7352.64, 0.37, 25567],
    ],
  },
  semimonthly: {
    single: [
      [0, 671, 0, 0, 0],
      [671, 1188, 0, 0.1, 671],
      [1188, 2771, 51.7, 0.12, 1188],
      [2771, 5075, 241.66, 0.22, 2771],
      [5075, 9078, 748.54, 0.24, 5075],
      [9078, 11347, 1709.26, 0.32, 9078],
      [11347, 27363, 2435.34, 0.35, 11347],
      [27363, Infinity, 8040.94, 0.37, 27363],
    ],
    married: [
      [0, 1342, 0, 0, 0],
      [1342, 2375, 0, 0.1, 1342],
      [2375, 5542, 103.3, 0.12, 2375],
      [5542, 10150, 483.34, 0.22, 5542],
      [10150, 18156, 1497.1, 0.24, 10150],
      [18156, 22694, 3418.54, 0.32, 18156],
      [22694, 33371, 4870.7, 0.35, 22694],
      [33371, Infinity, 8607.65, 0.37, 33371],
    ],
    headOfHousehold: [
      [0, 1006, 0, 0, 0],
      [1006, 1744, 0, 0.1, 1006],
      [1744, 3817, 73.8, 0.12, 1744],
      [3817, 5410, 322.56, 0.22, 3817],
      [5410, 9413, 673.02, 0.24, 5410],
      [9413, 11681, 1633.74, 0.32, 9413],
      [11681, 27698, 2359.5, 0.35, 11681],
      [27698, Infinity, 7965.45, 0.37, 27698],
    ],
  },
  monthly: {
    single: [
      [0, 1342, 0, 0, 0],
      [1342, 2375, 0, 0.1, 1342],
      [2375, 5542, 103.3, 0.12, 2375],
      [5542, 10150, 483.34, 0.22, 5542],
      [10150, 18156, 1497.1, 0.24, 10150],
      [18156, 22694, 3418.54, 0.32, 18156],
      [22694, 54725, 4870.7, 0.35, 22694],
      [54725, Infinity, 16081.55, 0.37, 54725],
    ],
    married: [
      [0, 2683, 0, 0, 0],
      [2683, 4750, 0, 0.1, 2683],
      [4750, 11083, 206.7, 0.12, 4750],
      [11083, 20300, 966.66, 0.22, 11083],
      [20300, 36313, 2994.4, 0.24, 20300],
      [36313, 45388, 6837.52, 0.32, 36313],
      [45388, 66742, 9741.52, 0.35, 45388],
      [66742, Infinity, 17215.42, 0.37, 66742],
    ],
    headOfHousehold: [
      [0, 2013, 0, 0, 0],
      [2013, 3488, 0, 0.1, 2013],
      [3488, 7633, 147.5, 0.12, 3488],
      [7633, 10821, 644.9, 0.22, 7633],
      [10821, 18825, 1346.26, 0.24, 10821],
      [18825, 23363, 3267.22, 0.32, 18825],
      [23363, 55396, 4719.38, 0.35, 23363],
      [55396, Infinity, 15930.93, 0.37, 55396],
    ],
  },
}

const NJ_ANNUAL_WITHHOLDING_TABLES = {
  A: [
    [0, 20000, 0, 0.015, 0],
    [20000, 35000, 300, 0.02, 20000],
    [35000, 40000, 600, 0.039, 35000],
    [40000, 75000, 795, 0.061, 40000],
    [75000, 500000, 2930, 0.07, 75000],
    [500000, 1000000, 32680, 0.099, 500000],
    [1000000, Infinity, 82180, 0.118, 1000000],
  ],
  B: [
    [0, 20000, 0, 0.015, 0],
    [20000, 50000, 300, 0.02, 20000],
    [50000, 70000, 900, 0.027, 50000],
    [70000, 80000, 1440, 0.039, 70000],
    [80000, 150000, 1830, 0.061, 80000],
    [150000, 500000, 6100, 0.07, 150000],
    [500000, 1000000, 30600, 0.099, 500000],
    [1000000, Infinity, 80100, 0.118, 1000000],
  ],
}

const NJ_ALLOWANCE_BY_PERIOD = {
  weekly: 19.2,
  biweekly: 38.4,
  semimonthly: 41.6,
  monthly: 83.3,
}

const TAX_LIMITS_2026 = {
  socialSecurityWageBase: 184500,
  additionalMedicareThreshold: 200000,
  njUiWorkforceWageBase: 44800,
  njDiFliWageBase: 171100,
}

const TAX_RATES_2026 = {
  socialSecurity: 0.062,
  medicare: 0.0145,
  additionalMedicare: 0.009,
  njUi: 0.003825,
  njWorkforce: 0.000425,
  njDisability: 0.0019,
  njFamilyLeave: 0.0023,
}

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

function getDateDiffDays(startValue, endValue) {
  const start = new Date(`${startValue}T00:00:00`)
  const end = new Date(`${endValue}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 7
  }

  return Math.floor((end - start) / 86400000) + 1
}

function inferPayPeriod(periodStart, periodEnd) {
  const days = getDateDiffDays(periodStart, periodEnd)

  if (days <= 7) return 'weekly'
  if (days <= 14) return 'biweekly'
  if (days <= 16) return 'semimonthly'
  return 'monthly'
}

function getFederalFilingStatus(employee = {}) {
  const raw = String(
    employee.federal_filing_status ||
      employee.w4_filing_status ||
      employee.filing_status ||
      ''
  )
    .trim()
    .toLowerCase()

  if (raw.includes('married') || raw === 'mfj') return 'married'
  if (raw.includes('head') || raw === 'hoh') return 'headOfHousehold'
  return 'single'
}

function getNjRateCode(employee = {}) {
  const raw = String(employee.nj_withholding_rate || employee.nj_rate || '')
    .trim()
    .toUpperCase()

  if (raw === 'B') return 'B'

  const status = String(employee.nj_filing_status || employee.filing_status || '')
    .trim()
    .toLowerCase()

  if (status.includes('married') || status.includes('joint') || status.includes('head')) {
    return 'B'
  }

  return 'A'
}

function applyPercentageTable(amount, rows) {
  const wage = Math.max(0, numberOrZero(amount))
  const row = rows.find(([atLeast, lessThan]) => wage >= atLeast && wage < lessThan)
  if (!row) return 0

  const [, , baseTax, rate, excessOver] = row
  return moneyRound(baseTax + Math.max(0, wage - excessOver) * rate)
}

function calculateFederalIncomeTax({
  grossPay,
  employee,
  payPeriod,
  isTaxExempt,
}) {
  if (isTaxExempt) return 0

  const periodsPerYear = PAY_PERIODS_PER_YEAR[payPeriod] || 52
  const filingStatus = getFederalFilingStatus(employee)
  const rows =
    FEDERAL_2026_PERCENTAGE_TABLES[payPeriod]?.[filingStatus] ||
    FEDERAL_2026_PERCENTAGE_TABLES.weekly.single

  const otherIncome = numberOrZero(employee.federal_w4_step4a)
  const deductions = numberOrZero(employee.federal_w4_step4b)
  const credits = numberOrZero(employee.federal_w4_step3)
  const additional = numberOrZero(employee.federal_w4_step4c)
  const adjustedWage = Math.max(0, grossPay + otherIncome / periodsPerYear - deductions / periodsPerYear)
  const tentative = applyPercentageTable(adjustedWage, rows)
  const afterCredits = Math.max(0, tentative - credits / periodsPerYear)

  return moneyRound(afterCredits + additional)
}

function taxableByWageBase(currentWages, priorYtdWages, wageBase) {
  return moneyRound(
    Math.max(0, Math.min(numberOrZero(currentWages), wageBase - numberOrZero(priorYtdWages)))
  )
}

function calculateNewJerseyIncomeTax({
  grossPay,
  employee,
  payPeriod,
  isTaxExempt,
}) {
  if (isTaxExempt || employee?.nj_exempt === true) return 0

  const periodsPerYear = PAY_PERIODS_PER_YEAR[payPeriod] || 52
  const rateCode = getNjRateCode(employee)
  const allowances = Math.max(0, numberOrZero(employee.nj_allowances))
  const additional = numberOrZero(employee.nj_additional_withholding)
  const allowanceValue = NJ_ALLOWANCE_BY_PERIOD[payPeriod] || NJ_ALLOWANCE_BY_PERIOD.weekly
  const periodTaxableWages = Math.max(0, grossPay - allowances * allowanceValue)
  const annualTaxableWages = periodTaxableWages * periodsPerYear
  const annualWithholding = applyPercentageTable(
    annualTaxableWages,
    NJ_ANNUAL_WITHHOLDING_TABLES[rateCode] || NJ_ANNUAL_WITHHOLDING_TABLES.A
  )

  return moneyRound(annualWithholding / periodsPerYear + additional)
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
  priorYtdGross = 0,
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
  const payPeriod = inferPayPeriod(periodStart, periodEnd)
  const ytdGrossBefore = moneyRound(priorYtdGross)
  const ytdGrossAfter = moneyRound(ytdGrossBefore + grossPay)

  const socialSecurityTaxable = isTaxExempt
    ? 0
    : taxableByWageBase(grossPay, ytdGrossBefore, TAX_LIMITS_2026.socialSecurityWageBase)
  const njUiWorkforceTaxable = isTaxExempt
    ? 0
    : taxableByWageBase(grossPay, ytdGrossBefore, TAX_LIMITS_2026.njUiWorkforceWageBase)
  const njDiFliTaxable = isTaxExempt
    ? 0
    : taxableByWageBase(grossPay, ytdGrossBefore, TAX_LIMITS_2026.njDiFliWageBase)
  const additionalMedicareTaxable = isTaxExempt
    ? 0
    : moneyRound(
        Math.max(0, ytdGrossAfter - TAX_LIMITS_2026.additionalMedicareThreshold) -
          Math.max(0, ytdGrossBefore - TAX_LIMITS_2026.additionalMedicareThreshold)
      )

  const federalIncomeTax = calculateFederalIncomeTax({
    grossPay,
    employee,
    payPeriod,
    isTaxExempt,
  })
  const socialSecurity = moneyRound(socialSecurityTaxable * TAX_RATES_2026.socialSecurity)
  const medicare = isTaxExempt ? 0 : moneyRound(grossPay * TAX_RATES_2026.medicare)
  const additionalMedicare = moneyRound(
    additionalMedicareTaxable * TAX_RATES_2026.additionalMedicare
  )
  const njStateIncomeTax = calculateNewJerseyIncomeTax({
    grossPay,
    employee,
    payPeriod,
    isTaxExempt,
  })
  const njSuiWorkforce = moneyRound(
    njUiWorkforceTaxable * (TAX_RATES_2026.njUi + TAX_RATES_2026.njWorkforce)
  )
  const njDisabilityInsurance = moneyRound(
    njDiFliTaxable * TAX_RATES_2026.njDisability
  )
  const njFamilyLeaveInsurance = moneyRound(
    njDiFliTaxable * TAX_RATES_2026.njFamilyLeave
  )

  const employeeTaxes = [
    {
      key: 'federalIncomeTax',
      label: 'Federal Income Tax',
      amount: federalIncomeTax,
    },
    {
      key: 'socialSecurity',
      label: 'Social Security',
      amount: socialSecurity,
      taxableWages: socialSecurityTaxable,
    },
    {
      key: 'medicare',
      label: additionalMedicare > 0 ? 'Medicare + Additional Medicare' : 'Medicare',
      amount: moneyRound(medicare + additionalMedicare),
      taxableWages: grossPay,
    },
    {
      key: 'njStateIncomeTax',
      label: 'NJ State Income Tax',
      amount: njStateIncomeTax,
    },
    {
      key: 'njSuiWorkforce',
      label: 'NJ SUI / Workforce Development',
      amount: njSuiWorkforce,
      taxableWages: njUiWorkforceTaxable,
    },
    {
      key: 'njDisabilityInsurance',
      label: 'NJ Disability Insurance',
      amount: njDisabilityInsurance,
      taxableWages: njDiFliTaxable,
    },
    {
      key: 'njFamilyLeaveInsurance',
      label: 'NJ Family Leave Insurance',
      amount: njFamilyLeaveInsurance,
      taxableWages: njDiFliTaxable,
    },
  ]

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
    taxMeta: {
      year: 2026,
      payPeriod,
      periodsPerYear: PAY_PERIODS_PER_YEAR[payPeriod] || 52,
      federalFilingStatus: getFederalFilingStatus(employee),
      njRateCode: getNjRateCode(employee),
      njAllowances: Math.max(0, numberOrZero(employee.nj_allowances)),
      ytdGrossBefore,
      ytdGrossAfter,
      isTaxExempt,
    },
  }
}
