import React from 'react'

const CHECK_SIZE = {
  width: '215.9mm',
  height: '88.9mm',
}

const CHECK_COORDS = {
  company: { x: 28, y: 7 },
  checkNumber: { right: 16, y: 11 },

  payToLabel: { x: 16, y: 32 },
  payeeText: { x: 34, y: 33 },
  payeeLine: { x: 28, y: 38, w: 120 },

  dateLabel: { x: 151, y: 27 },
  dateText: { x: 164, y: 26 },
  dateLine: { x: 151, y: 30, w: 35 },

  amountNumber: { right: 24, y: 34 },

  amountWordsText: { x: 18, y: 48 },
  amountWordsLine: { x: 14, y: 52, w: 160 },
  dollarsLabel: { x: 158, y: 48 },

  bank: { x: 20, y: 53 },

  forLabel: { x: 14, y: 70 },
  memoText: { x: 28, y: 69 },
  memoLine: { x: 22, y: 73, w: 75 },
  memoLine2: { x: 120, y: 73, w: 80 },

  micr: { x: 34, y: 80 },

  globalOffset: { x: 0, y: 0 },
}

const stubTableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '10.5px',
}

const th = {
  border: '1px solid #222',
  padding: '4px',
  background: '#efefef',
  textAlign: 'left',
  fontWeight: 700,
}

const td = {
  border: '1px solid #222',
  padding: '4px',
}

const tdBold = {
  border: '1px solid #222',
  padding: '4px',
  fontWeight: 700,
}

function capitalizeFirst(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
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

function formatTime(value) {
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

  return `${hour}:${minute} ${suffix}`
}

function getDayShort(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function buildWeeklyRows(totals, periodStart) {
  const rowsFromTotals = Array.isArray(totals?.filteredForView)
    ? totals.filteredForView
    : Array.isArray(totals?.weeklyRows)
      ? totals.weeklyRows
      : Array.isArray(totals?.rows)
        ? totals.rows
        : []

  const byDate = {}

  rowsFromTotals.forEach((row) => {
    if (row?.work_date) byDate[row.work_date] = row
  })

  if (!periodStart) {
    return rowsFromTotals
      .filter((row) => row?.work_date)
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))
  }

  const result = []

  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDays(periodStart, i)
    const sourceRow = byDate[dateStr] || {}

    result.push({
      work_date: dateStr,
      time_in: sourceRow.time_in || '',
      time_out: sourceRow.time_out || '',
      lunch_hours: Number(sourceRow.lunch_hours || 0),
      downtime_hours: Number(sourceRow.downtime_hours || 0),
      reg_hours: Number(sourceRow.reg_hours || 0),
    })
  }

  return result
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

  return capitalizeFirst(
    `${numberToWords(dollars)} dollars and ${String(cents).padStart(2, '0')}/100`
  )
}

function stubMoney(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString('en-US')}`
}

function getPayeeName(employee, fullName) {
  if (employee?.employer_form === 'Other' && employee?.company_name) {
    return employee.company_name
  }

  return fullName || [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'
}

function CheckStockPrint({
  employee,
  fullName,
  totals,
  periodStart,
  periodEnd,
  checkNumber,
  payDate,
  companyName = 'FARMPLAST LLC',
  companyAddress1 = '125 EAST HALSEY ROAD',
  companyAddress2 = 'PARSIPPANY, NJ 07054',
}) {
  const payeeName = getPayeeName(employee, fullName)

  const dateObj = payDate ? new Date(`${payDate}T00:00:00`) : new Date()

  const dateText = Number.isNaN(dateObj.getTime())
    ? formatDate(payDate)
    : `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${String(
        dateObj.getFullYear()
      ).slice(-2)}`

  const amount = Number(totals?.netPay || 0)
  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)

  const amountNumberMain = String(dollars)
  const amountNumberCents = String(cents).padStart(2, '0')
  const amountWords = amountToWords(amount)

  const rawCheckNumber = Number(checkNumber || employee?.last_check_number || 0)
  const checkNumberTop = String(rawCheckNumber)
  const checkNumberMicr = String(rawCheckNumber).padStart(6, '0')

  const memoText =
    periodStart && periodEnd ? `${formatDate(periodStart)} - ${formatDate(periodEnd)}` : ''

  const micrText = `C${checkNumberMicr}C A031201360A 443187254C`

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
      className="payroll-check-stock"
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
        <div style={{ fontSize: '3.5mm' }}>{companyName}</div>
        <div style={{ fontSize: '2.5mm', fontWeight: 700 }}>{companyAddress1}</div>
        <div style={{ fontSize: '2.5mm', fontWeight: 700 }}>{companyAddress2}</div>
      </div>

      <div
        style={posStyle('checkNumber', {
          fontSize: '4.6mm',
          fontWeight: 500,
          lineHeight: 1,
        })}
      >
        {checkNumberTop}
      </div>

      <div
        style={posStyle('payToLabel', {
          width: '16mm',
          fontSize: '2.2mm',
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
        className="payroll-micr"
        style={posStyle('micr', {
          fontSize: '4.7mm',
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        })}
      >
        {micrText}
      </div>
    </div>
  )
}

function WeeklyTimeReport({ totals, periodStart }) {
  const weeklyRows = buildWeeklyRows(totals, periodStart)
  const showLunch = weeklyRows.some((row) => Number(row.lunch_hours || 0) > 0)
  const showDowntime = weeklyRows.some((row) => Number(row.downtime_hours || 0) > 0)
  const totalReg = weeklyRows.reduce((sum, row) => sum + Number(row.reg_hours || 0), 0)

  if (!weeklyRows.length) return null

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ marginBottom: '5px', fontSize: '11px', fontWeight: 800 }}>
        WEEKLY TIME REPORT
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr>
            <th style={th}>DATE</th>
            <th style={th}>DAY</th>
            <th style={th}>TIME IN</th>
            <th style={th}>TIME OUT</th>
            {showLunch ? <th style={th}>LUNCH</th> : null}
            {showDowntime ? <th style={th}>DOWNTIME</th> : null}
            <th style={th}>REG</th>
          </tr>
        </thead>

        <tbody>
          {weeklyRows.map((row) => (
            <tr key={row.work_date}>
              <td style={td}>{formatDate(row.work_date)}</td>
              <td style={td}>{getDayShort(row.work_date)}</td>
              <td style={td}>{formatTime(row.time_in)}</td>
              <td style={td}>{formatTime(row.time_out)}</td>

              {showLunch ? (
                <td style={td}>
                  {Number(row.lunch_hours || 0) > 0
                    ? Number(row.lunch_hours || 0).toFixed(2)
                    : ''}
                </td>
              ) : null}

              {showDowntime ? (
                <td style={td}>
                  {Number(row.downtime_hours || 0) > 0
                    ? Number(row.downtime_hours || 0).toFixed(2)
                    : ''}
                </td>
              ) : null}

              <td style={td}>
                {Number(row.reg_hours || 0) > 0 ? Number(row.reg_hours || 0).toFixed(2) : ''}
              </td>
            </tr>
          ))}

          <tr>
            <td style={tdBold}>TOTAL</td>
            <td style={tdBold}></td>
            <td style={tdBold}></td>
            <td style={tdBold}></td>
            {showLunch ? <td style={tdBold}></td> : null}
            {showDowntime ? <td style={tdBold}></td> : null}
            <td style={tdBold}>{totalReg.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PayrollStubCopy({
  title,
  employee,
  fullName,
  periodStart,
  periodEnd,
  totals,
  checkNumber,
  payDate,
}) {
  const payeeName = getPayeeName(employee, fullName)

  const payDateText = payDate ? formatDate(payDate) : new Date().toLocaleDateString('en-US')
  const rawCheckNumber = Number(checkNumber || employee?.last_check_number || 0)
  const checkNumberTop = String(rawCheckNumber)

  const deductionRows = [
    { label: 'Employee Tax', value: totals?.employeeTaxNum },
    { label: 'Rent', value: totals?.rentNum },
    { label: 'Electric', value: totals?.electricNum },
    { label: 'Water', value: totals?.waterNum },
    { label: 'Clean', value: totals?.cleanNum },
    { label: 'Transport', value: totals?.transportNum },
  ].filter((row) => Number(row.value || 0) !== 0)

  return (
    <div
      className="payroll-stub-copy"
      style={{
        border: '1px solid #222',
        padding: '8px 12px',
        marginBottom: '8px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11px',
        color: 'black',
        background: 'white',
        boxSizing: 'border-box',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #444',
          paddingBottom: '6px',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '0.4px' }}>
          {title}
        </div>

        <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: 1.35 }}>
          <div>
            <strong>Check #:</strong> {checkNumberTop}
          </div>
          <div>
            <strong>Pay Date:</strong> {payDateText}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 20px',
          marginBottom: '10px',
          fontSize: '11px',
        }}
      >
        <div>
          <strong>Employee:</strong> {payeeName}
        </div>

        <div>
          <strong>Employee #:</strong> {employee?.employee_number || '—'}
        </div>

        <div>
          <strong>Period:</strong> {formatDate(periodStart)} - {formatDate(periodEnd)}
        </div>

        <div>
          <strong>Pay Type:</strong> {employee?.pay_type || '—'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <table style={stubTableStyle}>
          <thead>
            <tr>
              <th style={th}>EARNINGS</th>
              <th style={th}>HOURS</th>
              <th style={th}>AMOUNT</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={td}>Regular Pay</td>
              <td style={td}>{Number(totals?.mainHours || 0).toFixed(2)}</td>
              <td style={td}>{stubMoney(totals?.mainLabor)}</td>
            </tr>

            {Number(totals?.overtimeHours || 0) > 0 || Number(totals?.overtimeLabor || 0) > 0 ? (
              <tr>
                <td style={td}>Overtime Pay</td>
                <td style={td}>{Number(totals?.overtimeHours || 0).toFixed(2)}</td>
                <td style={td}>{stubMoney(totals?.overtimeLabor)}</td>
              </tr>
            ) : null}

            <tr>
              <td style={tdBold}>Gross Pay</td>
              <td style={tdBold}></td>
              <td style={tdBold}>{stubMoney(totals?.totalLabor)}</td>
            </tr>
          </tbody>
        </table>

        <table style={stubTableStyle}>
          <thead>
            <tr>
              <th style={th}>DEDUCTIONS</th>
              <th style={th}>AMOUNT</th>
            </tr>
          </thead>

          <tbody>
            {deductionRows.map((row) => (
              <tr key={row.label}>
                <td style={td}>{row.label}</td>
                <td style={td}>{stubMoney(row.value)}</td>
              </tr>
            ))}

            <tr>
              <td style={tdBold}>Net Pay</td>
              <td style={tdBold}>{stubMoney(totals?.netPay)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <WeeklyTimeReport totals={totals} periodStart={periodStart} />
    </div>
  )
}

export default function PayrollCheck({
  employee,
  fullName,
  totals,
  periodStart,
  periodEnd,
  checkNumber,
  payDate,
  companyName = 'FARMPLAST LLC',
  companyAddress1 = '125 EAST HALSEY ROAD',
  companyAddress2 = 'PARSIPPANY, NJ 07054',
  showEmployeeCopy = true,
  showEmployerCopy = true,
}) {
  return (
    <div className="print-payroll-sheet payroll-check-page bg-white">
      <style>{`
        .print-payroll-sheet {
          width: 215.9mm;
          min-height: 279.4mm;
          background: white;
          color: black;
          box-sizing: border-box;
        }

        .print-modal-sheet {
          width: 215.9mm;
          height: 88.9mm;
          display: block;
          overflow: hidden;
          flex: 0 0 auto;
          background: white;
        }

        .print-report-sheet {
          background: white;
          padding: 4mm;
          box-sizing: border-box;
        }

        .print-tear-line {
          width: 100%;
          border-top: 2px dashed #555;
          margin: 0 0 8px 0;
        }

        @page {
          size: 215.9mm 279.4mm;
          margin: 0;
        }

        @media print {
          html,
          body,
          #root {
            width: 215.9mm !important;
            min-width: 215.9mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }

          .print-payroll-sheet {
            width: 215.9mm !important;
            min-height: 279.4mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-modal-sheet {
            width: 215.9mm !important;
            height: 88.9mm !important;
            min-width: 215.9mm !important;
            min-height: 88.9mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            overflow: hidden !important;
          }

          .print-report-sheet {
            width: 215.9mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: white !important;
            box-shadow: none !important;
          }

          .print-tear-line {
            display: block !important;
            width: 100% !important;
            border-top: 2px dashed #555 !important;
            margin: 0 0 6mm 0 !important;
          }

          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      <div className="print-modal-sheet">
        <CheckStockPrint
          employee={employee}
          fullName={fullName}
          totals={totals}
          periodStart={periodStart}
          periodEnd={periodEnd}
          checkNumber={checkNumber}
          payDate={payDate}
          companyName={companyName}
          companyAddress1={companyAddress1}
          companyAddress2={companyAddress2}
        />
      </div>

      <div className="print-report-sheet">
        {showEmployeeCopy ? (
          <>
            <div className="print-tear-line" />
            <PayrollStubCopy
              title="EMPLOYEE COPY"
              employee={employee}
              fullName={fullName}
              periodStart={periodStart}
              periodEnd={periodEnd}
              totals={totals}
              checkNumber={checkNumber}
              payDate={payDate}
            />
          </>
        ) : null}

        {showEmployerCopy ? (
          <>
            <div className="print-tear-line" />
            <PayrollStubCopy
              title="EMPLOYER COPY"
              employee={employee}
              fullName={fullName}
              periodStart={periodStart}
              periodEnd={periodEnd}
              totals={totals}
              checkNumber={checkNumber}
              payDate={payDate}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
