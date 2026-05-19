export function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function roundDollar(value) {
  return Math.round(Number(value || 0))
}

export function timeToMinutes(value) {
  if (!value) return null
  const [h, m] = String(value).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function roundMinutesToNearestQuarter(minutes) {
  const value = Number(minutes || 0)
  if (!Number.isFinite(value)) return 0
  return Math.round(value / 15) * 15
}

export function roundHoursToNearestQuarter(hours) {
  const value = Number(hours || 0)
  if (!Number.isFinite(value)) return 0
  return round2(roundMinutesToNearestQuarter(value * 60) / 60)
}

// ONE SOURCE OF TRUTH: same formula as EmployeeDetailsPage card.
// REG = rounded/capped(Time Out - Time In) - Lunch - Downtime.
// Night shift is supported: if Time Out is earlier than Time In, it crosses midnight.
export function calcDayHours(timeIn, timeOut, lunchHours, downtimeHours = 0) {
  const start = timeToMinutes(timeIn)
  let end = timeToMinutes(timeOut)

  if (start === null || end === null) return 0
  if (end < start) end += 24 * 60

  const rawMinutes = end - start
  const roundedMinutes = roundMinutesToNearestQuarter(rawMinutes)
  const cappedMinutes = Math.min(roundedMinutes, 12 * 60)
  const lunchMinutes = roundMinutesToNearestQuarter(Number(lunchHours || 0) * 60)
  const downtimeMinutes = roundMinutesToNearestQuarter(Number(downtimeHours || 0) * 60)
  const payableMinutes = Math.max(0, cappedMinutes - lunchMinutes - downtimeMinutes)

  return round2(payableMinutes / 60)
}

export function getShiftLetter(timeIn) {
  const start = timeToMinutes(timeIn)
  if (start === null) return '—'

  const hour = Math.floor(start / 60)
  if (hour >= 18 || hour < 6) return 'N'
  return 'D'
}

export function getWeekStartMonday(dateStr) {
  if (!dateStr) return 'unknown'

  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'unknown'

  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const monday = new Date(d)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(d.getDate() + diffToMonday)

  return monday.toISOString().slice(0, 10)
}

export function getWeeksInSelectedPeriod(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return 1

  const start = new Date(`${periodStart}T00:00:00`)
  const end = new Date(`${periodEnd}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  if (end < start) return 1

  const daysInclusive = Math.floor((end - start) / 86400000) + 1
  return Math.max(1, Math.ceil(daysInclusive / 7))
}

export function normalizePayrollRow(row, employee) {
  const hourlyRate = Number(employee?.hourly_rate || 0)
  const downtimeHours = employee?.downtime_enabled === false ? 0 : Number(row.downtime_hours || 0)

  const fullHours =
    employee?.pay_type === 'hourly'
      ? calcDayHours(row.time_in, row.time_out, row.lunch_hours, downtimeHours)
      : Number(row.reg_hours || 0)

  let laborAmount = Number(row.labor_amount || 0)

  if (employee?.pay_type === 'hourly') {
    laborAmount = round2(fullHours * hourlyRate)
  }

  return {
    ...row,
    downtime_hours: downtimeHours,
    shift_letter: getShiftLetter(row.time_in),
    reg_hours: round2(fullHours),
    labor_amount: laborAmount,
  }
}

// This is the totals block from EmployeeDetailsPage moved into a reusable function.
export function calculatePayrollTotals({
  employee,
  logs,
  periodStart,
  periodEnd,
  rent = 0,
  electric = 0,
  water = 0,
  clean = 0,
  transport = 0,
}) {
  const filteredLogs = (logs || []).filter((row) => {
    if (!row.work_date) return true
    if (periodStart && row.work_date < periodStart) return false
    if (periodEnd && row.work_date > periodEnd) return false
    return true
  })

  const sorted = [...filteredLogs].sort((a, b) =>
    String(a.work_date || '').localeCompare(String(b.work_date || ''))
  )

  const hourlyRate = Number(employee?.hourly_rate || 0)
  const recalculated = sorted.map((row) => normalizePayrollRow(row, employee))

  const totalReg = round2(
    recalculated.reduce((sum, row) => sum + Number(row.reg_hours || 0), 0)
  )

  const totalLunch = round2(
    recalculated.reduce((sum, row) => sum + Number(row.lunch_hours || 0), 0)
  )

  const totalDowntime = round2(
    recalculated.reduce((sum, row) => sum + Number(row.downtime_hours || 0), 0)
  )

  const weeksCount = getWeeksInSelectedPeriod(periodStart, periodEnd)

  let mainHours = 0
  let overtimeHours = 0
  let mainLabor = 0
  let overtimeLabor = 0
  let totalLabor = 0

  if (employee?.pay_type === 'hourly') {
    const overtimeEnabled = employee?.overtime_enabled === true
    const weeklyHoursMap = {}

    recalculated.forEach((row) => {
      const weekKey = getWeekStartMonday(row.work_date)
      weeklyHoursMap[weekKey] = (weeklyHoursMap[weekKey] || 0) + Number(row.reg_hours || 0)
    })

    Object.values(weeklyHoursMap).forEach((weekHoursRaw) => {
      const weekHours = Number(weekHoursRaw || 0)

      if (overtimeEnabled) {
        const weekMainHours = Math.min(weekHours, 40)
        const weekOvertimeHours = Math.max(0, weekHours - 40)

        mainHours += weekMainHours
        overtimeHours += weekOvertimeHours
      } else {
        mainHours += weekHours
        overtimeHours += 0
      }
    })

    mainHours = round2(mainHours)
    overtimeHours = round2(overtimeHours)
    mainLabor = roundDollar(mainHours * hourlyRate)
    overtimeLabor = overtimeEnabled ? roundDollar(overtimeHours * hourlyRate * 1.5) : 0
    totalLabor = roundDollar(mainLabor + overtimeLabor)
  }

  if (employee?.pay_type === 'monthly') {
    mainHours = 0
    overtimeHours = 0
    mainLabor = roundDollar((Number(employee?.monthly_salary || 0) / 4) * weeksCount)
    overtimeLabor = 0
    totalLabor = mainLabor
  }

  if (employee?.pay_type === 'one_time') {
    mainHours = 0
    overtimeHours = 0
    mainLabor = roundDollar(Number(employee?.monthly_salary || 0))
    overtimeLabor = 0
    totalLabor = mainLabor
  }

  const mainTax = roundDollar(mainLabor * 0.153)
  const overtimeTax = roundDollar(overtimeLabor * 0.27)
  const employeeTaxAmount = roundDollar(mainTax + overtimeTax)

  const rentNum = roundDollar(rent)
  const electricNum = roundDollar(electric)
  const waterNum = roundDollar(water)
  const cleanNum = roundDollar(clean)
  const transportNum = roundDollar(transport)

  const employeeDeductions = roundDollar(rentNum + electricNum + waterNum + cleanNum + transportNum)
  const totalDeductions = roundDollar(employeeTaxAmount + employeeDeductions)
  const netPay = roundDollar(totalLabor - totalDeductions)

  return {
    filteredForView: recalculated.sort((a, b) =>
      String(b.work_date || '').localeCompare(String(a.work_date || ''))
    ),
    weeksCount,
    totalReg,
    totalLunch,
    totalDowntime,
    mainHours,
    overtimeHours,
    totalLabor,
    mainLabor,
    overtimeLabor,
    taxableHours: mainHours,
    taxableLabor: mainLabor,
    mainTax,
    overtimeTax,
    employeeTaxNum: employeeTaxAmount,
    rentNum,
    electricNum,
    waterNum,
    cleanNum,
    transportNum,
    employeeDeductions,
    totalDeductions,
    netPay,
  }
}
