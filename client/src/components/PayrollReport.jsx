import React, { useState } from 'react'
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculatePayrollTotals,
  normalizePayrollRow,
} from '../utils/payrollMath'

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

function money(value) {
  const num = Math.round(Number(value || 0))
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function formatCsvMoney(value) {
  return String(Math.round(Number(value || 0)))
}

function formatHours(value) {
  const number = Number(value || 0)
  return number.toFixed(2).replace(/\.00$/, '')
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

function formatTimeValue(value) {
  if (!value) return ''

  const text = String(value).trim()
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function getEmployeeLogsForWeek(logs, employeeId, week) {
  return (logs || []).filter((row) => {
    if (row.employee_id !== employeeId) return false
    if (!row.work_date) return false
    return row.work_date >= week.startText && row.work_date <= week.endText
  })
}

function buildDayRows(employee, employeeLogs, dayText) {
  return employeeLogs
    .filter((row) => row.work_date === dayText)
    .map((row) => normalizePayrollRow(row, employee))
}

function buildDayCompactHtml(employee, employeeLogs, dayText) {
  const rows = buildDayRows(employee, employeeLogs, dayText)
  if (!rows.length) return '<span class="muted">—</span>'

  return rows
    .map((row) => {
      const time = `${escapeHtml(formatTimeValue(row.time_in) || '—')}-${escapeHtml(formatTimeValue(row.time_out) || '—')}`
      const lunch = Number(row.lunch_hours || 0) > 0 ? ` L:${formatHours(row.lunch_hours)}` : ''
      const downtime = Number(row.downtime_hours || 0) > 0 ? ` DT:${formatHours(row.downtime_hours)}` : ''
      return `<div>${time}<br/><b>${formatHours(row.reg_hours)}h</b>${lunch}${downtime}</div>`
    })
    .join('')
}

function buildPayrollRows(employees, week, logs) {
  return (employees || []).map((employee) => {
    const employeeLogs = getEmployeeLogsForWeek(logs, employee.id, week)
    const totals = calculatePayrollTotals({
      employee,
      logs: employeeLogs,
      periodStart: week.startText,
      periodEnd: week.endText,
    })

    return {
      employee,
      employeeLogs,
      totals,
    }
  })
}

function buildPayrollReportHtml(employees, week, logs) {
  const payrollRows = buildPayrollRows(employees, week, logs)

  const grandRegularLabor = payrollRows.reduce((sum, item) => sum + item.totals.mainLabor, 0)
  const grandOvertimeLabor = payrollRows.reduce((sum, item) => sum + item.totals.overtimeLabor, 0)
  const grandGross = payrollRows.reduce((sum, item) => sum + item.totals.totalLabor, 0)
  const grandTax = payrollRows.reduce((sum, item) => sum + item.totals.employeeTaxNum, 0)
  const grandOtherDeductions = payrollRows.reduce((sum, item) => sum + item.totals.employeeDeductions, 0)
  const grandDeductions = payrollRows.reduce((sum, item) => sum + item.totals.totalDeductions, 0)
  const grandNet = payrollRows.reduce((sum, item) => sum + item.totals.netPay, 0)
  const grandHours = payrollRows.reduce((sum, item) => sum + item.totals.totalReg, 0)
  const grandOvertimeHours = payrollRows.reduce((sum, item) => sum + item.totals.overtimeHours, 0)
  const generatedAt = new Date().toLocaleString('en-US')

  const dayHeaders = week.days
    .map((day) => `<th class="day-col">${escapeHtml(formatReportDate(day)).replace(', 202', '<br/>202')}</th>`)
    .join('')

  const summaryRows = payrollRows
    .map((item, index) => {
      const employee = item.employee
      const totals = item.totals
      const dayCells = week.days
        .map((day) => {
          const dayText = toLocalDateString(day)
          return `<td class="day-cell">${buildDayCompactHtml(employee, item.employeeLogs, dayText)}</td>`
        })
        .join('')

      return `<tr>
        <td class="num tiny">${index + 1}</td>
        <td class="emp-cell">
          <b>${escapeHtml(getFullName(employee))}</b>
          <div class="muted">#${escapeHtml(employee.employee_number ?? '')} · ${escapeHtml(getPayLabel(employee))} · ${escapeHtml(getOvertimeLabel(employee))}</div>
        </td>
        ${dayCells}
        <td class="num">${formatHours(totals.totalReg)}</td>
        <td class="num strong">${formatHours(totals.overtimeHours)}</td>
        <td class="num">${money(totals.mainLabor)}</td>
        <td class="num">${money(totals.overtimeLabor)}</td>
        <td class="num strong">${money(totals.totalLabor)}</td>
        <td class="num">${money(totals.mainTax)}</td>
        <td class="num">${money(totals.overtimeTax)}</td>
        <td class="num strong tax-cell">${money(totals.employeeTaxNum)}</td>
        <td class="num">${money(totals.employeeDeductions)}</td>
        <td class="num strong total-net">${money(totals.netPay)}</td>
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
    body { margin: 0; padding: 8px; color: #0f172a; background: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    .invoice-shell { width: 100%; margin: 0 auto; }
    .top { display: grid; grid-template-columns: 1fr auto; gap: 12px; margin-bottom: 8px; border-bottom: 3px solid #0ea5e9; padding-bottom: 8px; }
    .brand { font-size: 10px; font-weight: 900; color: #0369a1; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 2px 0 4px; font-size: 22px; line-height: 1; color: #0f172a; }
    .period { font-size: 11px; font-weight: 800; }
    .muted { color: #64748b; font-size: 8px; line-height: 1.2; }
    .rules { margin-top: 3px; color: #334155; font-size: 8px; }
    .top-actions { display: flex; align-items: start; gap: 8px; }
    .invoice-box { min-width: 250px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
    .invoice-box-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 7px; border-bottom: 1px solid #e2e8f0; }
    .invoice-box-row:last-child { border-bottom: 0; }
    .invoice-box-label { color: #64748b; }
    .invoice-box-value { font-weight: 900; text-align: right; }
    .summary { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin: 7px 0; }
    .summary-card { border: 1px solid #bae6fd; border-radius: 7px; padding: 6px; background: #f0f9ff; min-height: 38px; }
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
    .no-print { border: 0; border-radius: 7px; background: #0ea5e9; color: white; padding: 7px 10px; font-size: 10px; font-weight: 900; cursor: pointer; }
    @media print { body { padding: 0; font-size: 8px; } .no-print { display: none !important; } .summary-card { padding: 4px; } th, td { padding: 2px 3px; } h1 { font-size: 18px; } }
  </style>
</head>
<body>
  <div class="invoice-shell">
    <div class="top">
      <div>
        <div class="brand">Payroll Report</div>
        <h1>Weekly Payroll</h1>
        <div class="period">Previous week: ${escapeHtml(week.startText)} - ${escapeHtml(week.endText)}</div>
        <div class="rules">Uses the same calculation as employee payroll card: REG = Time Out - Time In - Lunch - DT. Rounded to nearest 15 minutes. Max 12h/day.</div>
      </div>
      <div class="top-actions">
        <div class="invoice-box">
          <div class="invoice-box-row"><span class="invoice-box-label">Generated</span><span class="invoice-box-value">${escapeHtml(generatedAt)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Workers</span><span class="invoice-box-value">${payrollRows.length}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Total tax</span><span class="invoice-box-value">${money(grandTax)}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Net payroll</span><span class="invoice-box-value">${money(grandNet)}</span></div>
        </div>
        <button class="no-print" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card"><span>Workers</span><b>${payrollRows.length}</b></div>
      <div class="summary-card"><span>Total hours</span><b>${formatHours(grandHours)}</b></div>
      <div class="summary-card"><span>OT hours</span><b>${formatHours(grandOvertimeHours)}</b></div>
      <div class="summary-card"><span>Main labor</span><b>${money(grandRegularLabor)}</b></div>
      <div class="summary-card"><span>OT labor</span><b>${money(grandOvertimeLabor)}</b></div>
      <div class="summary-card"><span>Employee tax</span><b>${money(grandTax)}</b></div>
      <div class="summary-card"><span>Net payroll</span><b>${money(grandNet)}</b><div class="muted">Deductions: ${money(grandDeductions)}</div></div>
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

    <div class="footer-note">Report generated from employees and employee_work_logs. Calculation is imported from shared payrollMath used by EmployeeDetailsPage.</div>
  </div>
</body>
</html>`
}

function buildPayrollCsv(employees, week, logs) {
  const payrollRows = buildPayrollRows(employees, week, logs)
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
    const totals = item.totals

    const dayValues = week.days.map((day) => {
      const dayText = toLocalDateString(day)
      const rows = buildDayRows(employee, item.employeeLogs, dayText)
      if (!rows.length) return ''

      return rows
        .map((row) => {
          const lunch = Number(row.lunch_hours || 0) > 0 ? ` L:${formatHours(row.lunch_hours)}` : ''
          const downtime = Number(row.downtime_hours || 0) > 0 ? ` DT:${formatHours(row.downtime_hours)}` : ''
          return `${formatTimeValue(row.time_in) || '—'}-${formatTimeValue(row.time_out) || '—'} ${formatHours(row.reg_hours)}h${lunch}${downtime}`
        })
        .join(' | ')
    })

    lines.push([
      employee.employee_number ?? '',
      getFullName(employee),
      getOvertimeLabel(employee),
      formatHours(totals.totalReg),
      formatHours(totals.mainHours),
      formatHours(totals.overtimeHours),
      formatCsvMoney(totals.mainLabor),
      formatCsvMoney(totals.overtimeLabor),
      formatCsvMoney(totals.totalLabor),
      formatCsvMoney(totals.mainTax),
      formatCsvMoney(totals.overtimeTax),
      formatCsvMoney(totals.employeeTaxNum),
      formatCsvMoney(totals.employeeDeductions),
      formatCsvMoney(totals.totalDeductions),
      formatCsvMoney(totals.netPay),
      ...dayValues,
    ].map(csvCell).join(','))
  })

  return `Payroll Report,${week.startText} to ${week.endText}\nUses shared card calculation: REG = Time Out - Time In - Lunch - DT\n${lines.join('\n')}`
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
      .limit(10000)

    if (logsError) throw logsError

    return { week, logs: data || [] }
  }

  async function handlePayrollPdfReport() {
    try {
      setLoading(true)
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const html = buildPayrollReportHtml(employees, week, logs)

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

  async function handlePayrollCsvReport() {
    try {
      setLoading(true)
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const csv = buildPayrollCsv(employees, week, logs)
      downloadTextFile(`payroll-${week.startText}-${week.endText}.csv`, csv, 'text/csv;charset=utf-8')
    } catch (err) {
      console.error('handlePayrollCsvReport error:', err)
      setError(err.message || 'Failed to build payroll CSV report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${REPORT_CARD_CLASS} p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Payroll report</h2>
          <p className="mt-1 text-xs text-slate-400">
            Uses the same shared calculation as employee payroll card. Includes Lunch and DT.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePayrollPdfReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Payroll PDF
          </button>

          <button
            type="button"
            onClick={handlePayrollCsvReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            Payroll CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  )
}
