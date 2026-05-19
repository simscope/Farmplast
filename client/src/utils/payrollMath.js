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

export function calcDayHours(timeIn, timeOut, lunchHours = 0, downtimeHours = 0) {
  const start = timeToMinutes(timeIn)
  let end = timeToMinutes(timeOut)

  if (start === null || end === null) return 0
  if (end < start) end += 24 * 60

  const rawMinutes = end - start
  const roundedMinutes = roundMinutesToNearestQuarter(rawMinutes)
  const cappedMinutes = Math.min(roundedMinutes, 12 * 60)

  const lunchMinutes = roundMinutesToNearestQuarter(Number(lunchHours || 0) * 60)
  const downtimeMinutes = roundMinutesToNearestQuarter(Number(downtimeHours || 0) * 60)

  return round2(Math.max(0, cappedMinutes - lunchMinutes - downtimeMinutes) / 60)
}

export function getShiftLetter(timeIn) {
  const start = timeToMinutes(timeIn)
  if (start === null) return '—'

  const hour = Math.floor(start / 60)
  return hour >= 18 || hour < 6 ? 'N' : 'D'
}

export function getWeekStartMonday(dateStr) {
  if (!dateStr) return 'unknown'

  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'unknown'

  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  d.setDate(d.getDate() + diffToMonday)
  return d.toISOString().slice(0, 10)
}

export function normalizePayrollRow(row, employee) {
  const hourlyRate = Number(employee?.hourly_rate || 0)

  const regHours =
    employee?.pay_type === 'hourly'
      ? calcDayHours(row.time_in, row.time_out, row.lunch_hours, row.downtime_hours)
      : Number(row.reg_hours || 0)

  return {
    ...row,
    shift_letter: getShiftLetter(row.time_in),
    reg_hours: round2(regHours),
    labor_amount:
      employee?.pay_type === 'hourly'
        ? round2(regHours * hourlyRate)
        : Number(row.labor_amount || 0),
  }
}

export function calculatePayrollTotals(rows = [], employee = {}) {
  const hourlyRate = Number(employee?.hourly_rate || 0)
  const normalizedRows = rows.map((row) => normalizePayrollRow(row, employee))

  const totalReg = round2(
    normalizedRows.reduce((sum, row) => sum + Number(row.reg_hours || 0), 0)
  )

  const totalLunch = round2(
    normalizedRows.reduce((sum, row) => sum + Number(row.lunch_hours || 0), 0)
  )

  const totalDowntime = round2(
    normalizedRows.reduce((sum, row) => sum + Number(row.downtime_hours || 0), 0)
  )

  let mainHours = 0
  let overtimeHours = 0
  let mainLabor = 0
  let overtimeLabor = 0
  let totalLabor = 0

  if (employee?.pay_type === 'hourly') {
    const overtimeEnabled = employee?.overtime_enabled === true
    const weeklyHoursMap = {}

    normalizedRows.forEach((row) => {
      const weekKey = getWeekStartMonday(row.work_date)
      weeklyHoursMap[weekKey] =
        (weeklyHoursMap[weekKey] || 0) + Number(row.reg_hours || 0)
    })

    Object.values(weeklyHoursMap).forEach((weekHoursRaw) => {
      const weekHours = Number(weekHoursRaw || 0)

      if (overtimeEnabled) {
        mainHours += Math.min(weekHours, 40)
        overtimeHours += Math.max(0, weekHours - 40)
      } else {
        mainHours += weekHours
      }
    })

    mainHours = round2(mainHours)
    overtimeHours = round2(overtimeHours)

    mainLabor = roundDollar(mainHours * hourlyRate)
    overtimeLabor = overtimeEnabled
      ? roundDollar(overtimeHours * hourlyRate * 1.5)
      : 0

    totalLabor = roundDollar(mainLabor + overtimeLabor)
  }

  if (employee?.pay_type === 'monthly') {
    mainLabor = roundDollar(Number(employee?.monthly_salary || 0) / 4)
    totalLabor = mainLabor
  }

  if (employee?.pay_type === 'one_time') {
    mainLabor = roundDollar(Number(employee?.monthly_salary || 0))
    totalLabor = mainLabor
  }

  const mainTax = roundDollar(mainLabor * 0.153)
  const overtimeTax = roundDollar(overtimeLabor * 0.27)
  const employeeTaxNum = roundDollar(mainTax + overtimeTax)

  return {
    rows: normalizedRows,
    totalReg,
    totalLunch,
    totalDowntime,
    mainHours,
    overtimeHours,
    mainLabor,
    overtimeLabor,
    totalLabor,
    mainTax,
    overtimeTax,
    employeeTaxNum,
  }
}
