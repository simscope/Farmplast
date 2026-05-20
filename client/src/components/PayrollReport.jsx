import React, { useState } from 'react'
import { FileText, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  calculatePayrollTotals,
  normalizePayrollRow,
} from '../utils/payrollMath'

const cardClass =
  'rounded-xl border border-slate-800 bg-[#0b1220] shadow-sm'

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toLocalDateString(date) {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())

  return `${year}-${month}-${day}`
}

function getPreviousWeekRange() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const currentDay = today.getDay() || 7

  const start = new Date(today)
  start.setDate(today.getDate() - currentDay - 6)
  start.setHours(0, 0, 0, 0)

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

function formatHours(value) {
  const number = Number(value || 0)
  return number.toFixed(2).replace(/\.00$/, '')
}

function roundDollars(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.round(number)
}

function formatMoney(value) {
  return `$${roundDollars(value).toLocaleString('en-US')}`
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function getFullName(employee) {
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'
}

function getPayLabel(employee) {
  if (employee?.pay_type === 'monthly') return 'Monthly'
  if (employee?.pay_type === 'one_time') return 'One-time'
  return 'Hourly'
}

function getOvertimeLabel(employee) {
  return employee?.overtime_enabled === true ? 'With OT' : 'No OT'
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

function buildDayCell(row) {
  if (!row) return '<span class="muted">—</span>'

  const inTime = row.time_in ? String(row.time_in).slice(0, 5) : '—'
  const outTime = row.time_out ? String(row.time_out).slice(0, 5) : '—'

  const lunch =
    Number(row.lunch_hours || 0) > 0
      ? ` L:${formatHours(row.lunch_hours)}`
      : ''

  const downtime =
    Number(row.downtime_hours || 0) > 0
      ? ` DT:${formatHours(row.downtime_hours)}`
      : ''

  return `<div>${escapeHtml(inTime)}-${escapeHtml(outTime)}<br/><b>${formatHours(
    row.reg_hours
  )}h</b>${lunch}${downtime}</div>`
}

function getNetPay(totals) {
  return roundDollars(
    Number(totals.totalLabor || 0) -
      Number(totals.employeeTaxNum || 0)
  )
}

function buildPayrollReportHtml(week, payrollRows) {
  const grandHours = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.totalReg || 0),
    0
  )

  const grandOvertimeHours = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.overtimeHours || 0),
    0
  )

  const grandRegularLabor = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.mainLabor || 0),
    0
  )

  const grandOvertimeLabor = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.overtimeLabor || 0),
    0
  )

  const grandGross = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.totalLabor || 0),
    0
  )

  const grandTax = payrollRows.reduce(
    (sum, item) => sum + Number(item.totals.employeeTaxNum || 0),
    0
  )

  const grandNetPay = payrollRows.reduce(
    (sum, item) => sum + getNetPay(item.totals),
    0
  )

  const workedThisWeek = payrollRows.filter((item) => {
    const totals = item.totals || {}
    const rows = Array.isArray(item.rows) ? item.rows : []

    return (
      Number(totals.totalReg || 0) > 0 ||
      Number(totals.totalLabor || 0) > 0 ||
      rows.some(
        (row) =>
          row?.time_in ||
          row?.time_out ||
          Number(row?.reg_hours || 0) > 0 ||
          Number(row?.labor_amount || 0) > 0
      )
    )
  }).length

  const generatedAt = new Date().toLocaleString('en-US')

  const dayHeaders = week.days
    .map(
      (day) =>
        `<th class="day-col">${escapeHtml(formatReportDate(day)).replace(
          ', 202',
          '<br/>202'
        )}</th>`
    )
    .join('')

  const bodyRows = payrollRows
    .map((item, index) => {
      const employee = item.employee
      const reportNumber = index + 1
      const netPay = getNetPay(item.totals)

      const dayCells = week.days
        .map((day) => {
          const dateText = toLocalDateString(day)
          const row = item.rowsByDate[dateText]
          return `<td class="day-cell">${buildDayCell(row)}</td>`
        })
        .join('')

      return `<tr>
        <td class="num tiny">${reportNumber}</td>
        <td class="emp-cell">
          <b>${escapeHtml(getFullName(employee))}</b>
          <div class="muted">Employee #${escapeHtml(
            employee.employee_number ?? ''
          )} · ${escapeHtml(getPayLabel(employee))} · ${escapeHtml(
            getOvertimeLabel(employee)
          )}</div>
        </td>
        ${dayCells}
        <td class="num">${formatHours(item.totals.totalReg)}</td>
        <td class="num strong">${formatHours(item.totals.overtimeHours)}</td>
        <td class="num">${formatMoney(item.totals.mainLabor)}</td>
        <td class="num">${formatMoney(item.totals.overtimeLabor)}</td>
        <td class="num strong">${formatMoney(item.totals.totalLabor)}</td>
        <td class="num">${formatMoney(item.totals.mainTax)}</td>
        <td class="num">${formatMoney(item.totals.overtimeTax)}</td>
        <td class="num strong tax-cell">${formatMoney(
          item.totals.employeeTaxNum
        )}</td>
        <td class="num strong net-cell">${formatMoney(netPay)}</td>
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
    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      margin-bottom: 8px;
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 8px;
    }
    .brand {
      font-size: 10px;
      font-weight: 900;
      color: #0369a1;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 2px 0 4px;
      font-size: 22px;
      line-height: 1;
      color: #0f172a;
    }
    .period {
      font-size: 11px;
      font-weight: 800;
    }
    .muted {
      color: #64748b;
      font-size: 8px;
      line-height: 1.2;
    }
    .rules {
      margin-top: 3px;
      color: #334155;
      font-size: 8px;
    }
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
    .invoice-box-row:last-child {
      border-bottom: 0;
    }
    .invoice-box-label {
      color: #64748b;
    }
    .invoice-box-value {
      font-weight: 900;
      text-align: right;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
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
    .summary-card span {
      display: block;
      color: #0369a1;
      font-weight: 800;
      font-size: 7px;
      text-transform: uppercase;
    }
    .summary-card b {
      display: block;
      font-size: 13px;
      margin-top: 2px;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 3px 4px;
      vertical-align: top;
    }
    th {
      background: #0369a1;
      color: white;
      text-align: left;
      font-size: 7px;
      text-transform: uppercase;
      line-height: 1.1;
    }
    td {
      font-size: 8px;
      line-height: 1.15;
    }
    .tiny { width: 34px; }
    .emp-cell { width: 130px; }
    .day-col { width: 66px; }
    .day-cell { min-height: 34px; color: #0f172a; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 900; }
    .tax-cell { background: #fff7ed; color: #9a3412; }
    .net-cell { background: #dcfce7; color: #166534; }
    .footer-note {
      margin-top: 6px;
      color: #64748b;
      font-size: 8px;
    }
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
  <div>
    <div class="top">
      <div>
        <div class="brand">Payroll Report</div>
        <h1>Weekly Payroll</h1>
        <div class="period">Previous week: ${escapeHtml(
          week.startText
        )} - ${escapeHtml(week.endText)}</div>
        <div class="rules">Uses the same shared payroll calculation as employee payroll card. REG = Time Out - Time In - Lunch - DT. Net Pay = Gross - Employee Tax.</div>
      </div>
      <div>
        <div class="invoice-box">
          <div class="invoice-box-row"><span class="invoice-box-label">Generated</span><span class="invoice-box-value">${escapeHtml(
            generatedAt
          )}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Workers total</span><span class="invoice-box-value">${
            payrollRows.length
          }</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Worked this week</span><span class="invoice-box-value">${workedThisWeek}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Gross</span><span class="invoice-box-value">${formatMoney(
            grandGross
          )}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Tax</span><span class="invoice-box-value">${formatMoney(
            grandTax
          )}</span></div>
          <div class="invoice-box-row"><span class="invoice-box-label">Net Pay</span><span class="invoice-box-value">${formatMoney(
            grandNetPay
          )}</span></div>
        </div>
        <button class="no-print" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card"><span>Workers total</span><b>${
        payrollRows.length
      }</b></div>
      <div class="summary-card"><span>Worked this week</span><b>${workedThisWeek}</b></div>
      <div class="summary-card"><span>Total hours</span><b>${formatHours(
        grandHours
      )}</b></div>
      <div class="summary-card"><span>OT hours</span><b>${formatHours(
        grandOvertimeHours
      )}</b></div>
      <div class="summary-card"><span>Main labor</span><b>${formatMoney(
        grandRegularLabor
      )}</b></div>
      <div class="summary-card"><span>OT labor</span><b>${formatMoney(
        grandOvertimeLabor
      )}</b></div>
      <div class="summary-card"><span>Employee tax</span><b>${formatMoney(
        grandTax
      )}</b></div>
      <div class="summary-card"><span>Net Pay</span><b>${formatMoney(
        grandNetPay
      )}</b></div>
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
          <th>Net Pay</th>
        </tr>
      </thead>
      <tbody>${bodyRows || '<tr><td colspan="19">No employees found</td></tr>'}</tbody>
    </table>

    <div class="footer-note">Report generated from employee_work_logs.</div>
  </div>
</body>
</html>`
}

function buildPayrollCsv(week, payrollRows) {
  const lines = []

  lines.push(
    [
      'Report No',
      'Employee No',
      'Employee Name',
      'Overtime Mode',
      'Total Hours',
      'Main Hours',
      'Overtime Hours',
      'Main Labor',
      'Overtime Labor',
      'Gross Pay',
      'Main Tax 15.3%',
      'Overtime Tax 27%',
      'Employee Tax Amount',
      'Net Pay',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]
      .map(csvCell)
      .join(',')
  )

  payrollRows.forEach((item, index) => {
    const employee = item.employee
    const reportNumber = index + 1
    const netPay = getNetPay(item.totals)

    const dayValues = week.days.map((day) => {
      const dateText = toLocalDateString(day)
      const row = item.rowsByDate[dateText]

      if (!row) return ''

      return `${row.time_in || '—'}-${row.time_out || '—'} ${formatHours(
        row.reg_hours
      )}h L:${formatHours(row.lunch_hours)} DT:${formatHours(
        row.downtime_hours
      )}`
    })

    lines.push(
      [
        reportNumber,
        employee.employee_number ?? '',
        getFullName(employee),
        getOvertimeLabel(employee),
        formatHours(item.totals.totalReg),
        formatHours(item.totals.mainHours),
        formatHours(item.totals.overtimeHours),
        roundDollars(item.totals.mainLabor),
        roundDollars(item.totals.overtimeLabor),
        roundDollars(item.totals.totalLabor),
        roundDollars(item.totals.mainTax),
        roundDollars(item.totals.overtimeTax),
        roundDollars(item.totals.employeeTaxNum),
        roundDollars(netPay),
        ...dayValues,
      ]
        .map(csvCell)
        .join(',')
    )
  })

  return `Payroll Report,${week.startText} to ${week.endText}\n${lines.join('\n')}`
}

export default function PayrollReport({ employees = [] }) {
  const safeEmployees = Array.isArray(employees) ? employees : []
  const reportEmployees = safeEmployees.filter(
    (employee) => employee?.exclude_from_payroll_report !== true
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadPreviousWeekWorkLogs() {
    const week = getPreviousWeekRange()

    const { data, error: logsError } = await supabase
      .from('employee_work_logs')
      .select('*')
      .gte('work_date', week.startText)
      .lte('work_date', week.endText)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('work_date', { ascending: true })

    if (logsError) throw logsError

    return {
      week,
      logs: Array.isArray(data) ? data : [],
    }
  }

  function buildRows(week, logs) {
    const safeLogs = Array.isArray(logs) ? logs : []

    return reportEmployees.map((employee) => {
      const employeeLogs = safeLogs.filter(
        (log) => String(log.employee_id) === String(employee.id)
      )

      const normalizedRows = employeeLogs.map((log) =>
        normalizePayrollRow(log, employee)
      )

      const totals = calculatePayrollTotals(normalizedRows, employee)

      const rowsByDate = {}

      ;(totals.rows || normalizedRows).forEach((row) => {
        if (row.work_date) {
          rowsByDate[row.work_date] = row
        }
      })

      return {
        employee,
        rows: totals.rows || normalizedRows,
        rowsByDate,
        totals,
      }
    })
  }

  async function handlePayrollPdfReport() {
    try {
      setLoading(true)
      setError('')

      const { week, logs } = await loadPreviousWeekWorkLogs()
      const payrollRows = buildRows(week, logs)
      const html = buildPayrollReportHtml(week, payrollRows)

      const printWindow = window.open('', '_blank')

      if (!printWindow) {
        throw new Error('Popup blocked. Allow popups and click Payroll PDF again.')
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
      const payrollRows = buildRows(week, logs)
      const csv = buildPayrollCsv(week, payrollRows)

      downloadTextFile(
        `payroll-report-${week.startText}-${week.endText}.csv`,
        csv,
        'text/csv;charset=utf-8'
      )
    } catch (err) {
      console.error('handlePayrollCsvReport error:', err)
      setError(err.message || 'Failed to build payroll CSV report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Payroll report</h2>
          <p className="mt-1 text-xs text-cyan-200">
            Uses the same shared calculation as employee payroll card. Excludes workers marked in employee card.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePayrollPdfReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-60"
          >
            <FileText size={16} />
            Payroll PDF
          </button>

          <button
            type="button"
            onClick={handlePayrollCsvReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            <FileSpreadsheet size={16} />
            Payroll CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  )
}
