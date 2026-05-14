import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Plus,
  Printer,
  Trash2,
  Wallet,
  Hash,
  CheckCircle2,
  BadgeDollarSign,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const pageCard =
  'rounded-xl border border-slate-800 bg-[#0f172a] shadow-[0_8px_24px_rgba(0,0,0,0.22)]'

const darkInput =
  'w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

const CHECK_SIZE = {
  width: '215.9mm',
  height: '88.9mm',
}

const CHECK_COORDS = {
  company: { x: 28, y: 7 },
  checkNumber: { right: 16, y: 11 },

  payToLabel: { x: 12, y: 32 },
  payeeText: { x: 34, y: 33 },
  payeeLine: { x: 34, y: 38, w: 120 },

  dateLabel: { x: 151, y: 27 },
  dateText: { x: 164, y: 26 },
  dateLine: { x: 151, y: 30, w: 35 },

  amountNumber: { right: 24, y: 34 },

  amountWordsText: { x: 18, y: 48 },
  amountWordsLine: { x: 18, y: 52, w: 160 },
  dollarsLabel: { x: 158, y: 48 },

  bank: { x: 20, y: 53 },

  forLabel: { x: 14, y: 70 },
  memoText: { x: 28, y: 69 },
  memoLine: { x: 28, y: 73, w: 75 },
  memoLine2: { x: 120, y: 73, w: 80 },

  micr: { x: 34, y: 80 },

  globalOffset: { x: 0, y: 0 },
}

function money(value) {
  const num = Math.round(Number(value || 0))
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function moneyRaw(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2)}`
}

function formatDate(value) {
  if (!value) return '—'

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return value
  }
}

function formatDateInputUS(value) {
  if (!value) return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function parseUSDateInput(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)

  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  let year = Number(match[3])

  if (year < 100) year += 2000

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatTimeInputUS(value) {
  if (!value) return ''

  const text = String(value).trim()
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return text

  let hour = Number(match[1])
  const minute = match[2]

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return text

  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12
  if (hour === 0) hour = 12

  return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`
}

function parseUSTimeInput(value) {
  const text = String(value || '').trim().toUpperCase()
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)

  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const suffix = match[3]

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null

  if (suffix === 'AM' && hour === 12) hour = 0
  if (suffix === 'PM' && hour !== 12) hour += 12

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function roundDollar(value) {
  return Math.round(Number(value || 0))
}

function timeToMinutes(value) {
  if (!value) return null
  const [h, m] = String(value).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function roundMinutesToNearestQuarter(minutes) {
  const value = Number(minutes || 0)
  if (!Number.isFinite(value)) return 0
  return Math.round(value / 15) * 15
}

function roundHoursToNearestQuarter(hours) {
  const value = Number(hours || 0)
  if (!Number.isFinite(value)) return 0
  return round2(roundMinutesToNearestQuarter(value * 60) / 60)
}

function calcDayHours(timeIn, timeOut, lunchHours) {
  const start = timeToMinutes(timeIn)
  let end = timeToMinutes(timeOut)

  if (start === null || end === null) return 0
  if (end < start) end += 24 * 60

  const rawMinutes = end - start
  const roundedMinutes = roundMinutesToNearestQuarter(rawMinutes)
  const cappedMinutes = Math.min(roundedMinutes, 12 * 60)
  const lunchMinutes = roundMinutesToNearestQuarter(Number(lunchHours || 0) * 60)
  const payableMinutes = Math.max(0, cappedMinutes - lunchMinutes)

  return round2(payableMinutes / 60)
}

function getShiftLetter(timeIn) {
  const start = timeToMinutes(timeIn)
  if (start === null) return '—'

  const hour = Math.floor(start / 60)
  if (hour >= 18 || hour < 6) return 'N'
  return 'D'
}

function buildEmptyRow() {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: new Date().toISOString().slice(0, 10),
    time_in: '',
    time_out: '',
    lunch_hours: '1',
    reg_hours: '0',
    labor_amount: '0',
  }
}

function getPayrollWeekRange(type = 'last', baseDate = new Date()) {
  const today = new Date(baseDate)
  today.setHours(0, 0, 0, 0)

  const day = today.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() + diffToMonday)
  thisMonday.setHours(0, 0, 0, 0)

  const start = new Date(thisMonday)

  if (type === 'last') {
    start.setDate(thisMonday.getDate() - 7)
  }

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getWeeksInSelectedPeriod(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return 1

  const start = new Date(`${periodStart}T00:00:00`)
  const end = new Date(`${periodEnd}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  if (end < start) return 1

  const daysInclusive = Math.floor((end - start) / 86400000) + 1
  return Math.max(1, Math.ceil(daysInclusive / 7))
}

function getWeekStartMonday(dateStr) {
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

function numberToWordsUnder1000(n) {
  const ones = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ]

  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ]

  if (n < 20) return ones[n]
  if (n < 100) {
    const ten = Math.floor(n / 10)
    const rest = n % 10
    return rest ? `${tens[ten]}-${ones[rest]}` : tens[ten]
  }

  const hundred = Math.floor(n / 100)
  const rest = n % 100
  return rest
    ? `${ones[hundred]} hundred ${numberToWordsUnder1000(rest)}`
    : `${ones[hundred]} hundred`
}

function numberToWords(n) {
  const num = Math.floor(Number(n || 0))

  if (num === 0) return 'zero'
  if (num < 1000) return numberToWordsUnder1000(num)

  if (num < 1000000) {
    const thousands = Math.floor(num / 1000)
    const rest = num % 1000
    return rest
      ? `${numberToWordsUnder1000(thousands)} thousand ${numberToWordsUnder1000(rest)}`
      : `${numberToWordsUnder1000(thousands)} thousand`
  }

  const millions = Math.floor(num / 1000000)
  const rest = num % 1000000
  return rest
    ? `${numberToWords(millions)} million ${numberToWords(rest)}`
    : `${numberToWords(millions)} million`
}

function amountToWords(amount) {
  const value = Number(amount || 0)
  const dollars = Math.floor(value)
  const cents = Math.round((value - dollars) * 100)
  return `${numberToWords(dollars)} dollars and ${String(cents).padStart(2, '0')}/100`
}

function CheckStockPrint({ employee, fullName, totals }) {
  const payeeName =
    employee?.employer_form === 'Other' && employee?.company_name
      ? employee.company_name
      : fullName

  const dateObj = new Date()
  const dateText = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${String(
    dateObj.getFullYear()
  ).slice(-2)}`

  const amount = Number(totals.netPay || 0)
  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)

  const amountNumberMain = String(dollars)
  const amountNumberCents = String(cents).padStart(2, '0')
  const amountWords = amountToWords(amount)

  const checkNumber = '7049'
  const memoText = `Payroll ${employee?.employee_number || ''}`

  // MICR на настоящих чеках печатается специальным шрифтом MICR E-13B.
  // В браузере такого шрифта обычно нет, поэтому здесь fallback.
  // Если поставишь MICR E13B.ttf в проект и подключишь @font-face, он автоматически будет использован.
  const micrText = '⑆007049⑆ ⑆031101266⑆ 443187254⑆'

  const posStyle = (name, extra = {}) => {
    const pos = CHECK_COORDS[name]
    const gx = Number(CHECK_COORDS?.globalOffset?.x || 0)
    const gy = Number(CHECK_COORDS?.globalOffset?.y || 0)

    const base = {
      position: 'absolute',
      top: `calc(${pos.y}mm + ${gy}mm)`,
      ...extra,
    }

    if (typeof pos.right === 'number') {
      base.right = `calc(${pos.right}mm - ${gx}mm)`
    } else {
      base.left = `calc(${pos.x}mm + ${gx}mm)`
    }

    return base
  }

  const lineStyle = (name, extra = {}) => {
    const pos = CHECK_COORDS[name]
    const gx = Number(CHECK_COORDS?.globalOffset?.x || 0)
    const gy = Number(CHECK_COORDS?.globalOffset?.y || 0)

    return {
      position: 'absolute',
      left: `calc(${pos.x}mm + ${gx}mm)`,
      top: `calc(${pos.y}mm + ${gy}mm)`,
      width: `${pos.w}mm`,
      height: 0,
      borderTop: '0.28mm solid #222',
      ...extra,
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: CHECK_SIZE.width,
        height: CHECK_SIZE.height,
        minWidth: CHECK_SIZE.width,
        minHeight: CHECK_SIZE.height,
        background: 'white',
        color: 'black',
        fontFamily: 'Arial, Helvetica, sans-serif',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={posStyle('company', {
          width: '46mm',
          textAlign: 'center',
          lineHeight: 1.05,
          fontWeight: 800,
          letterSpacing: '0.03mm',
        })}
      >
        <div style={{ fontSize: '3.5mm' }}>FARMPLAST MFG, LLC</div>
        <div style={{ fontSize: '2.5mm', fontWeight: 700 }}>425 EAST HALSEY ROAD</div>
        <div style={{ fontSize: '2.5mm', fontWeight: 700 }}>PARSIPPANY, NJ 07054</div>
      </div>

      <div
        style={posStyle('checkNumber', {
          fontSize: '4.6mm',
          fontWeight: 500,
          lineHeight: 1,
        })}
      >
        {checkNumber}
      </div>

      <div
        style={posStyle('payToLabel', {
          width: '16mm',
          fontSize: '2mm',
          fontWeight: 700,
          lineHeight: 1.0,
        })}
      >
        <div>PAY</div>
        <div>TO THE</div>
        <div>ORDER OF</div>
      </div>

      <div
        style={posStyle('payeeText', {
          fontSize: '5.1mm',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: '150mm',
          overflow: 'hidden',
        })}
      >
        {payeeName}
      </div>
      <div style={lineStyle('payeeLine')} />

      <div
        style={posStyle('dateLabel', {
          fontSize: '3mm',
          fontWeight: 700,
          lineHeight: 1,
        })}
      >
        DATE
      </div>

      <div
        style={posStyle('dateText', {
          width: '27mm',
          textAlign: 'center',
          fontSize: '4.4mm',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        })}
      >
        {dateText}
      </div>
      <div style={lineStyle('dateLine')} />

      <div
        style={posStyle('amountNumber', {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          minWidth: '34mm',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          textAlign: 'right',
        })}
      >
        <span style={{ fontSize: '5.8mm', fontWeight: 500 }}>$</span>
        <span style={{ fontSize: '5.8mm', fontWeight: 500 }}>{amountNumberMain}</span>
        <span
          style={{
            fontSize: '3mm',
            fontWeight: 500,
            marginLeft: '0.25mm',
            transform: 'translateY(-1.1mm)',
          }}
        >
          {amountNumberCents}
        </span>
      </div>

      <div
        style={posStyle('amountWordsText', {
          fontSize: '4.5mm',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: '160mm',
          overflow: 'hidden',
          textTransform: 'capitalize',
        })}
      >
        {amountWords}
      </div>
      <div style={lineStyle('amountWordsLine')} />

      <div
        style={posStyle('dollarsLabel', {
          fontSize: '3mm',
          fontWeight: 700,
          lineHeight: 1,
        })}
      >
        DOLLARS
      </div>

      <div
        style={posStyle('bank', {
          fontSize: '3mm',
          fontWeight: 700,
          lineHeight: 1,
        })}
      >
        TD BANK, N.A.
      </div>

      <div
        style={posStyle('forLabel', {
          fontSize: '3mm',
          fontWeight: 700,
          lineHeight: 1,
        })}
      >
        FOR
      </div>

      <div
        style={posStyle('memoText', {
          fontSize: '4.2mm',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: '90mm',
          overflow: 'hidden',
        })}
      >
        {memoText}
      </div>
      <div style={lineStyle('memoLine')} />

      <div style={lineStyle('memoLine2')} />

      <div
        style={posStyle('micr', {
          fontFamily: '"MICR E13B", "OCR A Extended", Consolas, monospace',
          fontSize: '4.7mm',
          fontWeight: 500,
          letterSpacing: '0.35mm',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        })}
      >
        {micrText}
      </div>
    </div>
  )
}

function PrintPaymentReport({
  employee,
  fullName,
  periodStart,
  periodEnd,
  totals,
  displayLogs,
}) {
  const payeeName =
    employee?.employer_form === 'Other' && employee?.company_name
      ? employee.company_name
      : fullName

  return (
    <div className="bg-white px-8 py-8 text-black">
      <div className="mb-6">
        <div className="text-2xl font-bold">PAYMENT REPORT</div>
        <div className="mt-1 text-sm text-slate-600">
          Breakdown of what was paid and what was deducted
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded border border-slate-300 p-4">
          <div className="mb-3 text-lg font-bold">Recipient</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Pay to</span>
              <span className="font-medium">{payeeName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Employee #</span>
              <span className="font-medium">{employee?.employee_number ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Employer form</span>
              <span className="font-medium">{employee?.employer_form || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Pay type</span>
              <span className="font-medium capitalize">{employee?.pay_type || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Period</span>
              <span className="font-medium">
                {formatDate(periodStart)} - {formatDate(periodEnd)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded border border-slate-300 p-4">
          <div className="mb-3 text-lg font-bold">Payment summary</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Total regular hours</span>
              <span className="font-medium">{totals.totalReg.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Overtime hours</span>
              <span className="font-medium">{totals.overtimeHours.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Total labor paid</span>
              <span className="font-medium">{money(totals.totalLabor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Main labor tax base</span>
              <span className="font-medium">{money(totals.mainLabor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Main tax 15.3%</span>
              <span className="font-medium">{money(totals.mainTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Overtime labor tax base</span>
              <span className="font-medium">{money(totals.overtimeLabor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Overtime tax 27%</span>
              <span className="font-medium">{money(totals.overtimeTax)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Employee tax amount</span>
              <span className="font-medium">{money(totals.employeeTaxNum)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Rent</span>
              <span className="font-medium">{money(totals.rentNum)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Electric</span>
              <span className="font-medium">{money(totals.electricNum)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Water</span>
              <span className="font-medium">{money(totals.waterNum)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Clean</span>
              <span className="font-medium">{money(totals.cleanNum)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">Transport</span>
              <span className="font-medium">{money(totals.transportNum)}</span>
            </div>
            <div className="border-t border-slate-300 pt-2" />
            <div className="flex justify-between gap-4 font-bold">
              <span>Net Pay</span>
              <span>{money(totals.netPay)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 text-lg font-bold">Work log used in calculation (rounded to nearest 15 min)</div>

      <div className="overflow-hidden rounded border border-slate-300">
        <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.5fr_0.7fr_0.7fr_0.9fr] bg-slate-100 px-4 py-3 text-sm font-bold">
          <div>Date</div>
          <div>Time In</div>
          <div>Time Out</div>
          <div>Shift</div>
          <div>Lunch</div>
          <div>Reg</div>
          <div>Labor</div>
        </div>

        {displayLogs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No work log rows in selected period
          </div>
        ) : (
          displayLogs.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.5fr_0.7fr_0.7fr_0.9fr] border-t border-slate-200 px-4 py-3 text-sm"
            >
              <div>{formatDate(row.work_date)}</div>
              <div>{formatTimeInputUS(row.time_in) || '—'}</div>
              <div>{formatTimeInputUS(row.time_out) || '—'}</div>
              <div>{row.shift_letter || getShiftLetter(row.time_in)}</div>
              <div>{Number(row.lunch_hours || 0).toFixed(2)}</div>
              <div>{Number(row.reg_hours || 0).toFixed(2)}</div>
              <div>{money(row.labor_amount)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PrintPreviewModal({
  open,
  onClose,
  onPrintAndSave,
  printing,
  employee,
  fullName,
  totals,
  periodStart,
  periodEnd,
  displayLogs,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4 no-print">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Print preview</h2>
            <p className="mt-1 text-sm text-slate-400">Check + payment report</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onPrintAndSave}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
            >
              <Printer size={16} />
              {printing ? 'Saving...' : 'Save & Print'}
            </button>

            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-red-500"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200 p-5">
          <div
            className="print-modal-sheet mx-auto bg-white shadow-lg"
            style={{
              width: CHECK_SIZE.width,
              height: CHECK_SIZE.height,
              display: 'block',
              overflow: 'hidden',
              flex: '0 0 auto',
            }}
          >
            <CheckStockPrint employee={employee} fullName={fullName} totals={totals} />
          </div>

          <div className="print-report-sheet mx-auto mt-6 max-w-[920px] bg-white shadow-lg">
            <PrintPaymentReport
              employee={employee}
              fullName={fullName}
              periodStart={periodStart}
              periodEnd={periodEnd}
              totals={totals}
              displayLogs={displayLogs}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const defaultPayrollPeriod = getPayrollWeekRange('last')

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [refreshingPayments, setRefreshingPayments] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [periodMode, setPeriodMode] = useState('last')
  const [periodStart, setPeriodStart] = useState(defaultPayrollPeriod.start)
  const [periodEnd, setPeriodEnd] = useState(defaultPayrollPeriod.end)

  const [employeeTax, setEmployeeTax] = useState('0')
  const [rent, setRent] = useState('0')
  const [electric, setElectric] = useState('0')
  const [water, setWater] = useState('0')
  const [clean, setClean] = useState('0')
  const [transport, setTransport] = useState('0')

  useEffect(() => {
    loadPage()
  }, [id])

  async function loadPaymentsOnly() {
    try {
      setRefreshingPayments(true)

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })

      if (paymentsError) throw paymentsError
      setPayments(paymentsData || [])
    } catch (err) {
      console.error('loadPaymentsOnly error:', err)
      setError(err.message || 'Failed to load payment history')
    } finally {
      setRefreshingPayments(false)
    }
  }

  async function loadPage() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (employeeError) throw employeeError

      if (!employeeData) {
        setEmployee(null)
        setLogs([])
        setPayments([])
        setError('Employee not found')
        return
      }

      setEmployee(employeeData)

      const { data: logsData, error: logsError } = await supabase
        .from('employee_work_logs')
        .select('*')
        .eq('employee_id', id)
        .eq('is_deleted', false)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (logsError) {
        console.error('employee_work_logs load error:', logsError)
        setLogs([])
      } else {
        setLogs(logsData || [])
      }

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })

      if (paymentsError) {
        console.error('employee_payments load error:', paymentsError)
        setPayments([])
      } else {
        setPayments(paymentsData || [])
      }
    } catch (err) {
      console.error('loadPage error:', err)
      setError(err.message || 'Failed to load employee page')
    } finally {
      setLoading(false)
    }
  }

 function applyPayrollPeriod(mode) {
  setPeriodMode(mode)

  if (mode === 'custom') return

  const range = getPayrollWeekRange(mode)
  setPeriodStart(range.start)
  setPeriodEnd(range.end)
}

  function addRow() {
    setLogs((prev) => [buildEmptyRow(), ...prev])
  }

  function updateRowValue(rowId, field, value) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [field]: value }

        if (field === 'time_in' || field === 'time_out' || field === 'lunch_hours') {
          const computedHours = calcDayHours(
            nextRow.time_in,
            nextRow.time_out,
            nextRow.lunch_hours
          )

          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            const hourlyRate = Number(employee?.hourly_rate || 0)
            nextRow.labor_amount = String(round2(computedHours * hourlyRate))
          }
        }

        if (field === 'reg_hours' && employee?.pay_type === 'hourly') {
          const hourlyRate = Number(employee?.hourly_rate || 0)
          const reg = roundHoursToNearestQuarter(value)
          nextRow.reg_hours = String(reg)
          nextRow.labor_amount = String(round2(reg * hourlyRate))
        }

        return nextRow
      })
    )
  }

  function updateUsDateInput(rowId, displayValue) {
    const parsedDate = parseUSDateInput(displayValue)

    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          work_date_display: displayValue,
          work_date: parsedDate || row.work_date,
        }
      })
    )
  }

  function finishUsDateInput(rowId) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          work_date_display: undefined,
        }
      })
    )
  }

  function updateUsTimeInput(rowId, field, displayField, displayValue) {
    const parsedTime = parseUSTimeInput(displayValue)

    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = {
          ...row,
          [displayField]: displayValue,
        }

        if (parsedTime) {
          nextRow[field] = parsedTime

          const computedHours = calcDayHours(
            field === 'time_in' ? parsedTime : nextRow.time_in,
            field === 'time_out' ? parsedTime : nextRow.time_out,
            nextRow.lunch_hours
          )

          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            const hourlyRate = Number(employee?.hourly_rate || 0)
            nextRow.labor_amount = String(round2(computedHours * hourlyRate))
          }
        }

        return nextRow
      })
    )
  }

  function finishUsTimeInput(rowId, displayField) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        return {
          ...row,
          [displayField]: undefined,
        }
      })
    )
  }

  async function saveRow(row) {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      if (!row.work_date) {
        setError('Date is required')
        return
      }

      const payload = {
        employee_id: id,
        work_date: row.work_date,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        lunch_hours: Number(row.lunch_hours || 0),
        reg_hours: Number(row.reg_hours || 0),
        labor_amount: Number(row.labor_amount || 0),
        source: 'manual',
        manually_edited: true,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      }

      if (String(row.id).startsWith('new-')) {
        const { error } = await supabase.from('employee_work_logs').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_work_logs')
          .update(payload)
          .eq('id', row.id)

        if (error) throw error
      }

      setSuccess('Row saved')
      await loadPage()
    } catch (err) {
      console.error('saveRow error:', err)
      setError(err.message || 'Failed to save row')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row) {
    try {
      setError('')
      setSuccess('')

      if (String(row.id).startsWith('new-')) {
        setLogs((prev) => prev.filter((item) => item.id !== row.id))
        return
      }

      const ok = window.confirm('Delete this work row?')
      if (!ok) return

      const { error } = await supabase
        .from('employee_work_logs')
        .delete()
        .eq('id', row.id)

      if (error) throw error

      setSuccess('Row deleted')
      await loadPage()
    } catch (err) {
      console.error('deleteRow error:', err)
      setError(err.message || 'Failed to delete row')
    }
  }

  async function rebuildRowFromZkt(row) {
    try {
      setError('')
      setSuccess('')

      if (!row.work_date) {
        setError('Date is required')
        return
      }

      const ok = window.confirm('Delete this row and rebuild it from ZKT punches?')
      if (!ok) return

      const { error } = await supabase.rpc('rebuild_employee_work_log_day_from_zkt', {
        p_employee_id: id,
        p_work_date: row.work_date,
      })

      if (error) throw error

      setSuccess('Row rebuilt from ZKT')
      await loadPage()
    } catch (err) {
      console.error('rebuildRowFromZkt error:', err)
      setError(err.message || 'Failed to rebuild row from ZKT')
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((row) => {
      if (!row.work_date) return true
      if (periodStart && row.work_date < periodStart) return false
      if (periodEnd && row.work_date > periodEnd) return false
      return true
    })
  }, [logs, periodStart, periodEnd])

  const totals = useMemo(() => {
    const sorted = [...filteredLogs].sort((a, b) =>
      String(a.work_date || '').localeCompare(String(b.work_date || ''))
    )

    const hourlyRate = Number(employee?.hourly_rate || 0)

    const recalculated = sorted.map((row) => {
      const fullHours =
        employee?.pay_type === 'hourly'
          ? calcDayHours(row.time_in, row.time_out, row.lunch_hours)
          : Number(row.reg_hours || 0)

      let laborAmount = Number(row.labor_amount || 0)

      if (employee?.pay_type === 'hourly') {
        laborAmount = round2(fullHours * hourlyRate)
      }

      return {
        ...row,
        shift_letter: getShiftLetter(row.time_in),
        reg_hours: round2(fullHours),
        labor_amount: laborAmount,
      }
    })

    const totalReg = round2(
      recalculated.reduce((sum, row) => sum + Number(row.reg_hours || 0), 0)
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
      overtimeLabor = overtimeEnabled
        ? roundDollar(overtimeHours * hourlyRate * 1.5)
        : 0
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

    const employeeDeductions = roundDollar(
      rentNum + electricNum + waterNum + cleanNum + transportNum
    )

    const totalDeductions = roundDollar(employeeTaxAmount + employeeDeductions)
    const netPay = roundDollar(totalLabor - totalDeductions)

    return {
      filteredForView: recalculated.sort((a, b) =>
        String(b.work_date || '').localeCompare(String(a.work_date || ''))
      ),
      weeksCount,
      totalReg,
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
  }, [filteredLogs, employee, rent, electric, water, clean, transport, periodStart, periodEnd])

  useEffect(() => {
    setEmployeeTax(String(totals.employeeTaxNum || 0))
  }, [totals.employeeTaxNum])

  const paymentStats = useMemo(() => {
    const totalPaid = payments.reduce((sum, row) => sum + Number(row.net_pay || 0), 0)
    const totalLaborPaid = payments.reduce(
      (sum, row) => sum + Number(row.total_labor || 0),
      0
    )

    return {
      count: payments.length,
      totalPaid,
      totalLaborPaid,
    }
  }, [payments])

  const fullName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'

  function handleOpenPrintModal() {
    setError('')
    setSuccess('')
    setPrintModalOpen(true)
  }

  async function handleSaveAndPrint() {
    try {
      setPaying(true)
      setError('')
      setSuccess('')

      const netPay = Number(totals.netPay || 0)

      if (netPay <= 0) {
        setError('Net pay must be greater than 0')
        return
      }

      const nowIso = new Date().toISOString()
      const today = nowIso.slice(0, 10)

      const payload = {
        employee_id: id,
        period_start: periodStart,
        period_end: periodEnd,
        total_labor: Number(totals.totalLabor || 0),
        employee_tax: Number(totals.employeeTaxNum || 0),
        rent: Number(totals.rentNum || 0),
        electric: Number(totals.electricNum || 0),
        water: Number(totals.waterNum || 0),
        clean: Number(totals.cleanNum || 0),
        transport: Number(totals.transportNum || 0),
        net_pay: netPay,
        paid_at: nowIso,
      }

      const { error: paymentError } = await supabase
        .from('employee_payments')
        .insert(payload)

      if (paymentError) throw paymentError

      const { error: employeeUpdateError } = await supabase
        .from('employees')
        .update({
          last_payment_date: today,
          last_payment_amount: netPay,
        })
        .eq('id', id)

      if (employeeUpdateError) throw employeeUpdateError

      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              last_payment_date: today,
              last_payment_amount: netPay,
            }
          : prev
      )

      await loadPaymentsOnly()
      setSuccess('Payment saved')

      setTimeout(() => {
        window.print()
      }, 150)
    } catch (err) {
      console.error('handleSaveAndPrint error:', err)
      setError(err.message || 'Failed to save payment')
    } finally {
      setPaying(false)
    }
  }

  const displayLogs = totals.filteredForView || []

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
      input[type="date"]::-webkit-calendar-picker-indicator,
      input[type="time"]::-webkit-calendar-picker-indicator {
       filter: invert(1);
        opacity: 1;
       cursor: pointer;
        }
        @page {
          size: 215.9mm 88.9mm;
          margin: 0;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          .print-modal-sheet,
          .print-modal-sheet * {
            visibility: visible !important;
          }

          .print-report-sheet,
          .print-report-sheet * {
            visibility: visible !important;
          }

          .print-modal-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 215.9mm !important;
            height: 88.9mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            overflow: hidden !important;
          }

          .print-report-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 95mm !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="mb-4 flex flex-wrap gap-2 no-print">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            <Plus size={16} />
            Add row
          </button>

          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
  <button
    type="button"
    onClick={() => applyPayrollPeriod('last')}
    className={`px-3 py-2 text-sm font-semibold transition ${
      periodMode === 'last'
        ? 'bg-cyan-600 text-white'
        : 'text-slate-300 hover:bg-slate-800'
    }`}
  >
    Last Week
  </button>

  <button
    type="button"
    onClick={() => applyPayrollPeriod('this')}
    className={`border-l border-slate-700 px-3 py-2 text-sm font-semibold transition ${
      periodMode === 'this'
        ? 'bg-cyan-600 text-white'
        : 'text-slate-300 hover:bg-slate-800'
    }`}
  >
    This Week
  </button>

  <button
    type="button"
    onClick={() => applyPayrollPeriod('custom')}
    className={`border-l border-slate-700 px-3 py-2 text-sm font-semibold transition ${
      periodMode === 'custom'
        ? 'bg-cyan-600 text-white'
        : 'text-slate-300 hover:bg-slate-800'
    }`}
  >
    Custom
  </button>
</div>

          <button
            onClick={handleOpenPrintModal}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
          >
            <Printer size={16} />
            Pay & Print
          </button>
        </div>

        {loading ? (
          <div className={`${pageCard} p-8 text-center text-slate-400`}>
            Loading employee...
          </div>
        ) : error && !employee ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`${pageCard} p-4 no-print`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                    {employee?.photo_url ? (
                      <img
                        src={employee.photo_url}
                        alt={fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>

                  <div>
                    <h1 className="text-2xl font-bold text-white">{fullName}</h1>
                    <p className="mt-1 text-sm text-slate-400">
                      Payroll card. Default period is last week, Monday → Sunday.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Hash size={14} />
                      Employee #
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {employee?.employee_number ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Wallet size={14} />
                      Pay type
                    </div>
                    <div className="mt-1 text-lg font-bold capitalize text-white">
                      {employee?.pay_type || '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <BadgeDollarSign size={14} />
                      Employer form
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {employee?.employer_form || '—'}
                    </div>
                    {employee?.employer_form === 'Other' && employee?.company_name ? (
                      <div className="mt-1 text-[11px] leading-tight text-slate-500">
                        {employee.company_name}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CalendarDays size={14} />
                      Hire date
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {formatDate(employee?.hire_date)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <DollarSign size={14} />
                      Rate / Salary
                    </div>
                    <div className="mt-1 text-lg font-bold text-cyan-300">
                      {employee?.pay_type === 'monthly' || employee?.pay_type === 'one_time'
                        ? money(employee?.monthly_salary)
                        : money(employee?.hourly_rate)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CheckCircle2 size={14} />
                      Last payment
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {formatDate(employee?.last_payment_date)}
                    </div>
                    <div className="mt-1 text-lg font-bold text-emerald-300">
                      {money(employee?.last_payment_amount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period start</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/DD/YYYY"
                    value={formatDateInputUS(periodStart)}
                    onFocus={() => setPeriodMode('custom')}
                    onChange={(e) => {
                      const parsedDate = parseUSDateInput(e.target.value)
                      if (parsedDate) setPeriodStart(parsedDate)
                    }}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Period end</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/DD/YYYY"
                    value={formatDateInputUS(periodEnd)}
                    onFocus={() => setPeriodMode('custom')}
                    onChange={(e) => {
                      const parsedDate = parseUSDateInput(e.target.value)
                      if (parsedDate) setPeriodEnd(parsedDate)
                    }}
                    className={darkInput}
                  />
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Total reg
                  </div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {totals.totalReg.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 size={14} />
                    Overtime h
                  </div>
                  <div className="mt-1 text-xl font-bold text-yellow-200">
                    {totals.overtimeHours.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <DollarSign size={14} />
                    Total labor
                  </div>
                  <div className="mt-1 text-xl font-bold text-cyan-300">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-300">
                    <Wallet size={14} />
                    Net Pay
                  </div>
                  <div className="mt-1 text-xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 no-print">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 no-print">
                {success}
              </div>
            ) : null}

            <div className={`${pageCard} overflow-hidden no-print`}>
              <button
                type="button"
                onClick={() => setPaymentsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between border-b border-slate-800 px-5 py-4 text-left transition hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                    <History size={18} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Payment history</h2>
                    <p className="text-sm text-slate-400">When and how much was paid</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {paymentsOpen ? 'Hide' : 'Show'}
                  </span>
                  {paymentsOpen ? (
                    <ChevronUp size={18} className="text-slate-300" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-300" />
                  )}
                </div>
              </button>

              {paymentsOpen && (
                <>
                  <div className="flex justify-end border-b border-slate-800 bg-[#0b1220] px-5 py-3">
                    <button
                      onClick={loadPaymentsOnly}
                      disabled={refreshingPayments}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:border-cyan-500 disabled:opacity-60"
                    >
                      <RefreshCw
                        size={14}
                        className={refreshingPayments ? 'animate-spin' : ''}
                      />
                      Refresh
                    </button>
                  </div>

                  <div className="grid gap-3 border-b border-slate-800 bg-[#0b1220] px-5 py-3 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Payments count</div>
                      <div className="mt-1 text-xl font-bold text-white">
                        {paymentStats.count}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Total paid</div>
                      <div className="mt-1 text-xl font-bold text-emerald-300">
                        {money(paymentStats.totalPaid)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#07101d] p-3">
                      <div className="text-xs text-slate-400">Total labor paid</div>
                      <div className="mt-1 text-xl font-bold text-cyan-300">
                        {money(paymentStats.totalLaborPaid)}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[1120px]">
                      <div className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] bg-slate-900/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        <div>Date paid</div>
                        <div>Period</div>
                        <div>Net pay</div>
                        <div>Total labor</div>
                        <div>Employee tax</div>
                        <div>Rent</div>
                        <div>Utilities</div>
                        <div>Transport</div>
                      </div>

                      {payments.length === 0 ? (
                        <div className="bg-[#0b1220] px-4 py-8 text-center text-sm text-slate-400">
                          No payment history yet
                        </div>
                      ) : (
                        payments.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] items-center border-t border-slate-800 bg-[#0b1220] px-4 py-3 text-sm text-slate-200"
                          >
                            <div>{formatDateTime(row.paid_at)}</div>
                            <div>
                              {formatDate(row.period_start)} - {formatDate(row.period_end)}
                            </div>
                            <div className="font-semibold text-emerald-300">
                              {money(row.net_pay)}
                            </div>
                            <div className="font-semibold text-cyan-300">
                              {money(row.total_labor)}
                            </div>
                            <div>{money(row.employee_tax)}</div>
                            <div>{money(row.rent)}</div>
                            <div>
                              {money(
                                Number(row.electric || 0) +
                                  Number(row.water || 0) +
                                  Number(row.clean || 0)
                              )}
                            </div>
                            <div>{money(row.transport)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={`${pageCard} overflow-hidden no-print`}>
              <div className="border-b border-slate-800 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Work log</h2>
                    <p className="text-sm text-slate-400">
                      Max 12h/day, rounded to nearest 15 min, lunch deducted. Employee tax is calculated automatically: main labor 15.3%, overtime labor 27%.
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1160px]">
                  <div className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.35fr_0.55fr_0.55fr_0.7fr_1fr] bg-slate-900/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <div>Date</div>
                    <div>Time In</div>
                    <div>Time Out</div>
                    <div>S</div>
                    <div>Lunch</div>
                    <div>Reg</div>
                    <div>Labor</div>
                    <div>Delete</div>
                  </div>

                  {displayLogs.length === 0 ? (
                    <div className="bg-[#0b1220] px-4 py-8 text-center text-sm text-slate-400">
                      No rows in selected period
                    </div>
                  ) : (
                    displayLogs.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.35fr_0.55fr_0.55fr_0.7fr_1fr] items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-2.5"
                      >
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="MM/DD/YYYY"
                            value={
                              row.work_date_display !== undefined
                                ? row.work_date_display
                                : formatDateInputUS(row.work_date)
                            }
                            onChange={(e) => updateUsDateInput(row.id, e.target.value)}
                            onBlur={() => finishUsDateInput(row.id)}
                            className={`${darkInput} pr-16`}
                          />

                          <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-white">
                            {row.work_date
                              ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
                                  new Date(`${row.work_date}T00:00:00`).getDay()
                                ]
                              : ''}
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="HH:MM AM"
                          value={
                            row.time_in_display !== undefined
                              ? row.time_in_display
                              : formatTimeInputUS(row.time_in)
                          }
                          onChange={(e) =>
                            updateUsTimeInput(
                              row.id,
                              'time_in',
                              'time_in_display',
                              e.target.value
                            )
                          }
                          onBlur={() => finishUsTimeInput(row.id, 'time_in_display')}
                          className={darkInput}
                        />

                        <input
                          type="text"
                          placeholder="HH:MM PM"
                          value={
                            row.time_out_display !== undefined
                              ? row.time_out_display
                              : formatTimeInputUS(row.time_out)
                          }
                          onChange={(e) =>
                            updateUsTimeInput(
                              row.id,
                              'time_out',
                              'time_out_display',
                              e.target.value
                            )
                          }
                          onBlur={() => finishUsTimeInput(row.id, 'time_out_display')}
                          className={darkInput}
                        />

                        <div className="rounded-lg border border-slate-800 bg-[#07101d] px-3 py-2 text-center text-sm font-bold text-cyan-300">
                          {getShiftLetter(row.time_in)}
                        </div>

                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={row.lunch_hours ?? '1'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'lunch_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={row.reg_hours ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'reg_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.labor_amount ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'labor_amount', e.target.value)
                          }
                          className={darkInput}
                        />

                        <div className="flex gap-1">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={saving}
                            className="rounded-lg bg-cyan-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                          >
                            Save
                          </button>

                          <button
                            onClick={() => rebuildRowFromZkt(row)}
                            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                            title="Rebuild this day from ZKT punches"
                          >
                            ZKT
                          </button>

                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-lg border border-red-500/30 bg-red-600/10 px-2 py-2 text-red-300 transition hover:bg-red-600/20"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={`${pageCard} p-4 no-print`}>
              <h2 className="mb-4 text-xl font-bold text-white">Deductions</h2>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Employee tax amount</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={employeeTax}
                    readOnly
                    className={`${darkInput} cursor-not-allowed text-yellow-200`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Rent</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Electric</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={electric}
                    onChange={(e) => setElectric(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Water</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={water}
                    onChange={(e) => setWater(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Clean</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={clean}
                    onChange={(e) => setClean(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Transport</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    className={darkInput}
                  />
                </div>
              </div>

              {employee?.pay_type === 'monthly' ? (
                <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">
                  Monthly pay calculation: {money(employee?.monthly_salary)} / 4 ×{' '}
                  {totals.weeksCount} week(s) ={' '}
                  <span className="font-bold">{money(totals.totalLabor)}</span>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Main labor tax 15.3%</div>
                  <div className="mt-1 text-xl font-bold text-yellow-200">
                    {money(totals.mainTax)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Main labor: {money(totals.mainLabor)}
                    {employee?.pay_type === 'hourly'
                      ? ` / ${totals.mainHours.toFixed(2)} h up to 40 h/week`
                      : ''}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Overtime tax 27%</div>
                  <div className="mt-1 text-xl font-bold text-orange-300">
                    {money(totals.overtimeTax)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Overtime labor: {money(totals.overtimeLabor)}
                    {employee?.pay_type === 'hourly'
                      ? ` / ${totals.overtimeHours.toFixed(2)} h × 1.5 rate`
                      : ''}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <div className="text-xs text-slate-400">Employee deductions</div>
                  <div className="mt-1 text-xl font-bold text-red-300">
                    {money(totals.employeeDeductions)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                  <div className="text-xs text-emerald-300">Net Pay</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-300/80">
                    Total labor {money(totals.totalLabor)} - tax {money(totals.employeeTaxNum)} - deductions {money(totals.employeeDeductions)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <PrintPreviewModal
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          onPrintAndSave={handleSaveAndPrint}
          printing={paying}
          employee={employee}
          fullName={fullName}
          totals={totals}
          periodStart={periodStart}
          periodEnd={periodEnd}
          displayLogs={displayLogs}
        />
      </div>
    </div>
  )
}
