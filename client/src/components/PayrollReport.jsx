import React, { useState } from 'react'
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const REPORT_CARD_CLASS = 'rounded-xl border border-slate-800 bg-[#0b1220] shadow-sm'

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

function formatReportDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function downloadTextFile(fileName, content, type = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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

function getLunchHours(log) {
  return getNumberFromObject(log, [
    'lunch_hours',
    'lunch',
    'lunch_deducted',
    'lunch_deduction',
    'break_hours',
  ], 0)
}

function getDowntimeHours(log) {
  return getNumberFromObject(log, [
    'downtime_hours',
    'downtime',
    'dt_hours',
    'downtime_deducted',
    'downtime_deduction',
  ], 0)
}

function getExplicitRegularHours(log) {
  return getNumberFromObject(log, [
    'regular_hours',
    'reg_hours',
    'reg',
    'paid_hours',
    'net_hours',
    'total_hours',
    'worked_hours',
    'hours',
  ], null)
}

function parseTimeToMinutes(value) {
  if (!value) return null

  const raw = String(value).trim()
  const lower = raw.toLowerCase()

  const ampmMatch = lower.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)/)
  if (ampmMatch) {
    let hours = Number(ampmMatch[1])
    const minutes = Number(ampmMatch[2])
    const ampm = ampmMatch[3]

    if (ampm === 'pm' && hours !== 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0

    return hours * 60 + minutes
  }

  const timeMatch = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (timeMatch) {
    const hours = Number(timeMatch[1])
    const minutes = Number(timeMatch[2])
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes
    }
  }

  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) {
    return date.getHours() * 60 + date.getMinutes()
  }

  return null
}

function formatTimeValue(value) {
  if (!value) return ''

  const raw = String(value).trim()

  const ampmMatch = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)/)
  if (ampmMatch) {
    return `${ampmMatch[1].padStart(2, '0')}:${ampmMatch[2]} ${ampmMatch[3].toUpperCase()}`
  }

  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLogInTime(log) {
  return formatTimeValue(
    log.clock_in ||
      log.check_in ||
      log.in_time ||
      log.start_time ||
      log.first_in ||
      log.time_in
  )
}

function getLogOutTime(log) {
  return formatTimeValue(
    log.clock_out ||
      log.check_out ||
      log.out_time ||
      log.end_time ||
      log.last_out ||
      log.time_out
  )
}

function getRawInTime(log) {
  return (
    log.clock_in ||
    log.check_in ||
    log.in_time ||
    log.start_time ||
    log.first_in ||
    log.time_in
  )
}

function getRawOutTime(log) {
  return (
    log.clock_out ||
    log.check_out ||
    log.out_time ||
    log.end_time ||
    log.last_out ||
    log.time_out
  )
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

function calculateRegularHours(log) {
  const inMinutes = parseTimeToMinutes(getRawInTime(log))
  let outMinutes = parseTimeToMinutes(getRawOutTime(log))
  const lunchHours = getLunchHours(log)
  const downtimeHours = getDowntimeHours(log)

  if (inMinutes !== null && outMinutes !== null) {
    if (outMinutes <= inMinutes) {
      outMinutes += 24 * 60
    }

    const grossHours = Math.max((outMinutes - inMinutes) / 60, 0)
    return Math.min(Math.max(grossHours - lunchHours - downtimeHours, 0), 12)
  }

  const explicit = getExplicitRegularHours(log)
  if (explicit !== null) return Math.min(Math.max(explicit, 0), 12)

  return 0
}

function getEmployeeHourlyRate(employee) {
  const rate = Number(employee?.hourly_rate || 0)
  return Number.isNaN(rate) ? 0 : rate
}

function getFullName(employee) {
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'
}

function getPayLabel(employee) {
  if (employee?.pay_type === 'monthly') {
    return employee.monthly_salary != null ? `$${employee.monthly_salary}/mo` : '—'
  }

  if (employee?.pay_type === 'one_time') {
    return employee.monthly_salary != null ? `$${employee.monthly_salary} one-time` : '—'
  }

  return employee?.hourly_rate != null ? `$${employee.hourly_rate}/hr` : '—'
}

function getOvertimeLabel(employee) {
  return employee?.overtime_enabled ? 'OT 1.5x' : 'No OT'
}

function roundDollars(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.round(number)
}

function formatMoney(value) {
  return `$${roundDollars(value).toLocaleString('en-US')}`
}

function formatCsvMoney(value) {
  return String(roundDollars(value))
}

function formatHours(value) {
  const number = Number(value || 0)
  return number.toFixed(2).replace(/\.00$/, '')
}

function findEmployeeDeductions(employee, deductionsRows) {
  const employeeId = String(employee?.id || '')
  const employeeNumber = String(employee?.employee_number || '')
  const zktUserId = String(employee?.zkt_user_id || '')

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

function buildDayCompactHtml(day) {
  if (!day.rows.length) return '<span class="muted">—</span>'

  return day.rows
    .map((row) => {
      const time = `${escapeHtml(row.inTime || '—')}-${escapeHtml(row.outTime || '—')}`
      const lunch = Number(row.lunchHours || 0) > 0 ? ` L:${formatHours(row.lunchHours)}` : ''
      const downtime = Number(row.downtimeHours || 0) > 0 ? ` DT:${formatHours(row.downtimeHours)}` : ''

      return `<div>${time}<br/><b>${formatHours(row.regularHours)}h</b>${lunch}${downtime}</div>`
    })
    .join('')
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function getEmployeePayroll(employee, week, logsByEmployeeAndDate, deductionsRows) {
  const hourlyRate = getEmployeeHourlyRate(employee)

  const days = week.days.map((day) => {
    const dayText = toLocalDateString(day)
    const dayLogs = logsByEmployeeAndDate.get(`${employee.id}__${dayText}`) || []

    let totalHours = 0
    let totalLunchHours = 0
    let totalDowntimeHours = 0
    let baseLabor = 0

    const rows = dayLogs.map((log) => {
      const hours = calculateRegularHours(log)
      const lunchHours = getLunchHours(log)
      const downtimeHours = getDowntimeHours(log)
      const labor = employee.pay_type === 'hourly' ? hours * hourlyRate : 0

      totalHours += hours
      totalLunchHours += lunchHours
      totalDowntimeHours += downtimeHours
      baseLabor += labor

      return {
        inTime: getLogInTime(log),
        outTime: getLogOutTime(log),
        lunchHours,
        downtimeHours,
        regularHours: hours,
        labor,
        status: log.status || log.note || log.notes || '',
      }
    })

    return {
      date: day,
      dateText: dayText,
      rows,
      totalRegularHours: totalHours,
      totalLunchHours,
      totalDowntimeHours,
      totalLabor: baseLabor,
    }
  })

  const totalHours = days.reduce((sum, day) => sum + day.totalRegularHours, 0)
  const overtimeEnabled = employee?.overtime_enabled === true

  let regularHours = totalHours
  let overtimeHours = 0
  let regularLabor = 0
  let overtimeLabor = 0

  if (employee.pay_type === 'hourly') {
    if (overtimeEnabled) {
      regularHours = Math.min(totalHours, 40)
      overtimeHours = Math.max(totalHours - 40, 0)
      regularLabor = regularHours * hourlyRate
      overtimeLabor = overtimeHours * hourlyRate * 1.5
    } else {
      regularHours = totalHours
      overtimeHours = 0
      regularLabor = regularHours * hourlyRate
      overtimeLabor = 0
    }
  } else if (employee.pay_type === 'monthly') {
    const monthly = Number(employee.monthly_salary || 0)
    regularHours = 0
    overtimeHours = 0
    regularLabor = Number.isNaN(monthly) ? 0 : monthly / 4.333333
    overtimeLabor = 0
  } else if (employee.pay_type === 'one_time') {
    const amount = Number(employee.monthly_salary || 0)
    regularHours = 0
    overtimeHours = 0
    regularLabor = Number.isNaN(amount) ? 0 : amount
    overtimeLabor = 0
  }

  const grossPay = regularLabor + overtimeLabor
  const mainTax = regularLabor * 0.153
  const overtimeTax = overtimeLabor * 0.27
  const employeeTaxAmount = roundDollars(mainTax + overtimeTax)

  const employeeDeductions = findEmployeeDeductions(employee, deductionsRows)
  const deductions = {
    tax: employeeTaxAmount,
    rent: roundDollars(sumDeductions(employeeDeductions, ['rent'])),
    electric: roundDollars(sumDeductions(employeeDeductions, ['electric', 'electricity'])),
    water: roundDollars(sumDeductions(employeeDeductions, ['water'])),
    clean: roundDollars(sumDeductions(employeeDeductions, ['clean', 'cleaning'])),
    transport: roundDollars(sumDeductions(employeeDeductions, ['transport', 'transportation'])),
  }

  const otherDeductions =
    deductions.rent + deductions.electric + deductions.water + deductions.clean + deductions.transport
  const totalDeductions = deductions.tax + otherDeductions
  const netPay = roundDollars(grossPay) - totalDeductions

  return {
    employee,
    days,
    totalRegularHours: totalHours,
    regularHours,
    overtimeHours,
    regularLabor: roundDollars(regularLabor),
    overtimeLabor: roundDollars(overtimeLabor),
    mainTax: roundDollars(mainTax),
    overtimeTax: roundDollars(overtimeTax),
    grossPay: roundDollars(grossPay),
    deductions,
    otherDeductions,
    totalDeductions,
    netPay,
  }
}

function buildPayrollRows(employees, week, logs, deductionsRows) {
  const logsByEmployeeAndDate = new Map()

  logs.forEach((log) => {
    const employeeId = getLogEmployeeId(log)
    const dateText = getLogDate(log)

    if (!employeeId || !dateText) return

    const key = `${employeeId}__${dateText}`
    const current = logsByEmployeeAndDate.get(key) || []
    current.push(log)
    logsByEmployeeAndDate.set(key, current)
  })

  return (employees || []).map((employee) =>
    getEmployeePayroll(employee, week, logsByEmployeeAndDate, deductionsRows)
  )
}

function buildPayrollReportHtml(employees, week, logs, deductionsRows) {
  const payrollRows = buildPayrollRows(employees, week, logs, deductionsRows)

  const grandGross = payrollRows.reduce((sum, item) => sum + item.grossPay, 0)
  const grandRegularLabor = payrollRows.reduce((sum, item) => sum + item.regularLabor, 0)
  const grandOvertimeLabor = payrollRows.reduce((sum, item) => sum + item.overtimeLabor, 0)
  const grandTax = payrollRows.reduce((sum, item) => sum + item.deductions.tax, 0)
  const grandOtherDeductions = payrollRows.reduce((sum, item) => sum + item.otherDeductions, 0)
  const grandNet = payrollRows.reduce((sum, item) => sum + item.netPay, 0)
  const grandHours = payrollRows.reduce((sum, item) => sum + item.totalRegularHours, 0)
  const grandOvertimeHours = payrollRows.reduce((sum, item) => sum + item.overtimeHours, 0)
  const generatedAt = new Date().toLocaleString('en-US')

  const dayHeaders = week.days
    .map((day) => `<th class="day-col">${escapeHtml(formatReportDate(day)).replace(', 202', '<br/>202')}</th>`)
    .join('')

  const summaryRows = payrollRows
    .map((item, index) => {
      const employee = item.employee
      const dayCells = item.days
        .map((day) => `<td class="day-cell">${buildDayCompactHtml(day)}</td>`)
        .join('')

      return `<tr>
        <td class="num tiny">${index + 1}</td>
        <td class="emp-cell">
          <b>${escapeHtml(getFullName(employee))}</b>
          <div class="muted">#${escapeHtml(employee.employee_number ?? '')} · ${escapeHtml(getPayLabel(employee))} · ${escapeHtml(getOvertimeLabel(employee))}</div>
        </td>
        ${dayCells}
        <td class="num">${formatHours(item.totalRegularHours)}</td>
        <td class="num strong">${formatHours(item.overtimeHours)}</td>
        <td class="num">${formatMoney(item.regularLabor)}</td>
        <td class="num">${formatMoney(item.overtimeLabor)}</td>
        <td class="num strong">${formatMoney(item.grossPay)}</td>
        <td class="num">${formatMoney(item.mainTax)}</td>
        <td class="num">${formatMoney(item.overtimeTax)}</td>
        <td class="num strong tax-cell">${formatMoney(item.deductions.tax)}</td>
        <td class="num">${formatMoney(item.otherDeductions)}</td>
        <td class="num strong total-net">${formatMoney(item.netPay)}</td>
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payroll Report ${week.startText} - ${week.endText}</title>
  <style>
    @page { size: Letter landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      color: #0f172a;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
    }
    .invoice-shell { width: 100%; margin: 0 auto; }
    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      margin-bottom: 8px;
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 8px;
    }
    .brand { font-size: 10px; font-weight: 900; color: #0369a1; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 2px 0 4px; font-size: 22px; line-height: 1; color: #0f172a; }
    .period { font-size: 11px; font-weight: 800; }
    .muted { color: #64748b; font-size: 8px; line-height: 1.2; }
    .rules { margin-top: 3px; color: #334155; font-size: 8px; }
    .top-actions { display: flex; align-items: start; gap: 8px; }
    .invoice-box {
      min-width: 250px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .invoice-box-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 7px;
      border-bottom: 1px solid #e2e8f0;
    }
    .invoice-box-row:last-child { border-bottom: 0; }
    .invoice-box-label { color: #64748b; }
    .invoice-box-value { font-weight: 900; text-align: right; }
    .summary {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 5px;
      margin: 7px 0;
    }
    .summary-card {
      border: 1px solid #bae6fd;
      border-radius: 7px;
      padding: 6px;
      background: #f0f9ff;
      min-height: 38px;
    }
    .summary-card span { display: block; color: #0369a1; font-weight: 800; font-size: 7px; text-transform: uppercase; }
    .summary-card b { display: block; font-size: 13px; margin-top: 2px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: top; }
    th { background: #0369a1; color: white; text-align: left; font-size: 7px; text-transform: uppercase; line-height: 1.1; }
    td { font-size: 8px; line-height: 1.15; }
    .tiny { width: 24px; }
    .emp-cell { width: 130px; }
    .day-col { width: 66px; }
    .day-cell { min-height: 34px; color: #0f172a; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 900; }
    .tax-cell { background: #fff7ed; color: #9a3412; }
    .total-net { background: #dcfce7; color: #166534; }
    .footer-note { margin-top: 6px; color: #64748b; font-size: 8px; }
    .no-print {
      border: 0;
      border-radius: 7px;
      background: #0ea5e9;
      color: white;
      padding: 7px 10px;
      font-size: 10px;
      font-weight: 900;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; font-size: 8px; }
      .no-print { display: none !important; }
      .summary-card { padding: 4px; }
      th, td { padding: 2px 3px; }
      h1 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="invoice-shell">
    <div class="top">
      <div>
        <div class="brand">Payroll Report</div>
        <h1>Weekly Payroll</h1>
        <div class="period">Previous week: ${escapeHtml(week.startText)} - ${escapeHtml(week.endText)}</div>
        <div class="rules">REG is calculated from the same daily work-log values: Time Out - Time In - Lunch - DT. Night shift through midnight is supported. Main tax 15.3%, OT tax 27%. All money rounded to whole dollars.</div>
      </div>
      <div class="top-actions">
        <div class="invoice-box">
          <div class="invoice-box-row"><span class="invoice-box-label">Generated</span><span class="invoice-box-value">${escapeHtml(generatedAt)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Workers</span><span class="invoice-box-value">${payrollRows.length}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Total tax</span><span class="invoice-box-value">${formatMoney(grandTax)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Net payroll</span><span class="invoice-box-value">${formatMoney(grandNet)}</span></div>
        </div>
        <button class="no-print" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card"><span>Workers</span><b>${payrollRows.length}</b></div>
      <div class="summary-card"><span>Total hours</span><b>${formatHours(grandHours)}</b></div>
      <div class="summary-card"><span>OT hours</span><b>${formatHours(grandOvertimeHours)}</b></div>
      <div class="summary-card"><span>Main labor</span><b>${formatMoney(grandRegularLabor)}</b></div>
      <div class="summary-card"><span>OT labor</span><b>${formatMoney(grandOvertimeLabor)}</b></div>
      <div class="summary-card"><span>Employee tax</span><b>${formatMoney(grandTax)}</b></div>
      <div class="summary-card"><span>Net payroll</span><b>${formatMoney(grandNet)}</b><div class="muted">Other deductions: ${formatMoney(grandOtherDeductions)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="tiny">#</th>
          <th class="emp-cell">Employee</th>
          ${dayHeaders}
          <th>Total h</th>
          <th>OT h</th>
          <th>Main $</th>
          <th>OT $</th>
          <th>Gross</th>
          <th>15.3%</th>
          <th>OT 27%</th>
          <th>Emp Tax</th>
          <th>Deduct.</th>
          <th>Net Pay</th>
        </tr>
      </thead>
      <tbody>${summaryRows || '<tr><td colspan="21">No employees found</td></tr>'}</tbody>
    </table>

    <div class="footer-note">Report generated from employees and employee_work_logs. Day cell format: time, REG hours, L lunch, DT downtime.</div>
  </div>
</body>
</html>`
}

function buildPayrollCsv(employees, week, logs, deductionsRows) {
  const payrollRows = buildPayrollRows(employees, week, logs, deductionsRows)
  const lines = []

  lines.push([
    'Employee No',
    'Employee Name',
    'Overtime Mode',
    'Total Hours',
    'Main Hours Up To 40',
    'Overtime Hours',
    'Main Labor',
    'Overtime Labor',
    'Gross Pay',
    'Main Tax 15.3%',
    'Overtime Tax 27%',
    'Employee Tax Amount',
    'Other Deductions',
    'Total Deductions',
    'Net Pay',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ].map(csvCell).join(','))

  payrollRows.forEach((item) => {
    const employee = item.employee
    const dayValues = item.days.map((day) => {
      if (!day.rows.length) return ''
      return day.rows
        .map((row) => {
          const lunch = Number(row.lunchHours || 0) > 0 ? ` L:${formatHours(row.lunchHours)}` : ''
          const downtime = Number(row.downtimeHours || 0) > 0 ? ` DT:${formatHours(row.downtimeHours)}` : ''
          return `${row.inTime || '—'}-${row.outTime || '—'} ${formatHours(row.regularHours)}h${lunch}${downtime}`
        })
        .join(' | ')
    })

    lines.push([
      employee.employee_number ?? '',
      getFullName(employee),
      getOvertimeLabel(employee),
      formatHours(item.totalRegularHours),
      formatHours(item.regularHours),
      formatHours(item.overtimeHours),
      formatCsvMoney(item.regularLabor),
      formatCsvMoney(item.overtimeLabor),
      formatCsvMoney(item.grossPay),
      formatCsvMoney(item.mainTax),
      formatCsvMoney(item.overtimeTax),
      formatCsvMoney(item.deductions.tax),
      formatCsvMoney(item.otherDeductions),
      formatCsvMoney(item.totalDeductions),
      formatCsvMoney(item.netPay),
      ...dayValues,
    ].map(csvCell).join(','))
  })

  return `Payroll Report,${week.startText} to ${week.endText}\nREG = Time Out - Time In - Lunch - DT\nAll money rounded to whole dollars\n${lines.join('\n')}`
}

export default function PayrollReport({ employees = [] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadPreviousWeekWorkLogs() {
    const week = getPreviousWeekRange()

    const { data, error: logsError } = await supabase
      .from('employee_work_logs')
      .select('*')
      .gte('work_date', week.startText)
      .lte('work_date', week.endText)
      .eq('is_deleted', false)
      .order('work_date', { ascending: true })

    if (logsError) throw logsError

    return { week, logs: data || [] }
  }

  async function tryLoadPayrollDeductions(week) {
    const possibleTables = [
      'employee_payroll_deductions',
      'payroll_deductions',
      'employee_deductions',
    ]

    for (const tableName of possibleTables) {
      try {
        const { data, error: deductionsError } = await supabase
          .from(tableName)
          .select('*')
          .limit(10000)

        if (deductionsError) continue

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

  async function handlePayrollPdfReport() {
    try {
      setLoading(true)
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const html = buildPayrollReportHtml(employees, week, logs, deductionsRows)

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        throw new Error('Popup blocked. Allow popups for this site and click Payroll PDF again.')
      }

      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()

      setTimeout(() => {
        try {
          printWindow.print()
        } catch (printError) {
          console.warn('Auto print failed:', printError)
        }
      }, 500)
    } catch (err) {
      console.error('handlePayrollPdfReport error:', err)
      setError(err.message || 'Failed to build payroll PDF report')
    } finally {
      setLoading(false)
    }
  }

  async function handlePayrollCsvExport() {
    try {
      setLoading(true)
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const deductionsRows = await tryLoadPayrollDeductions(week)
      const csv = buildPayrollCsv(employees, week, logs, deductionsRows)
      const fileName = `payroll-report-${week.startText}-to-${week.endText}.csv`

      downloadTextFile(fileName, csv, 'text/csv;charset=utf-8')
    } catch (err) {
      console.error('handlePayrollCsvExport error:', err)
      setError(err.message || 'Failed to export payroll CSV')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={REPORT_CARD_CLASS}>
      <div className="flex flex-col gap-3 border-b border-slate-800 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Payroll report</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Previous week report. REG = Time Out - Time In - Lunch - DT.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handlePayrollPdfReport}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Payroll PDF
          </button>

          <button
            onClick={handlePayrollCsvExport}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            Payroll CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Payroll report error: {error}
        </div>
      ) : null}
    </div>
  )
}
