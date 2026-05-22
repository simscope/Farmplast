import React from 'react'
import './PayrollCheck.css'

function money(value) {
  const num = Math.round(Number(value || 0))
  return `$${num.toLocaleString('en-US')}`
}

function hours(value) {
  const num = Number(value || 0)
  return num.toFixed(2).replace(/\.00$/, '')
}

function formatDate(value) {
  if (!value) return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${month}/${day}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function getFullName(employee) {
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'
}

function getEmployeeTotalHours(item) {
  const totals = item?.checkTotals || item?.totals || {}
  return Number(
    totals.totalReg ||
      totals.mainHours ||
      totals.taxableHours ||
      item?.totalRegularHours ||
      0
  ) + Number(totals.overtimeHours || item?.overtimeHours || 0)
}

function getEmployeeAmount(item) {
  const totals = item?.checkTotals || item?.totals || {}
  return Number(totals.netPay || item?.netPay || 0)
}

export default function CompanyPayrollCheck({
  companyName,
  groupedItems = [],
  totals = {},
  periodStart,
  periodEnd,
  checkNumber,
  payDate,
}) {
  const totalHours = groupedItems.reduce(
    (sum, item) => sum + getEmployeeTotalHours(item),
    0
  )

  const totalAmount = Number(totals.netPay || 0)

  return (
    <div
      className="payroll-check-page"
      style={{
        width: '215.9mm',
        minHeight: '279.4mm',
        background: '#ffffff',
        color: '#000000',
        padding: '13mm 14mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: '#475569' }}>
            COMPANY PAYROLL CHECK
          </div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>
            {companyName || 'Company'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
            Period: {formatDate(periodStart)} - {formatDate(periodEnd)}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#475569' }}>Check #</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{checkNumber}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>Pay date</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{formatDate(payDate)}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          border: '1px solid #cbd5e1',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
          PAY TO THE ORDER OF
        </div>
        <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
          {companyName || 'Company'}
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            borderTop: '1px solid #e2e8f0',
            paddingTop: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            Total company payment
          </div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>
            {money(totalAmount)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>
          Employee summary
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ background: '#0f172a', color: '#ffffff' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Employee</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Hours</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.map((item) => (
              <tr key={item.employee?.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                  {getFullName(item.employee)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  {hours(getEmployeeTotalHours(item))}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                  {money(getEmployeeAmount(item))}
                </td>
              </tr>
            ))}

            <tr style={{ background: '#f8fafc' }}>
              <td style={{ padding: '10px', fontWeight: 900 }}>TOTAL</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900 }}>
                {hours(totalHours)}
              </td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900 }}>
                {money(totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          fontSize: 12,
        }}
      >
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
          <div style={{ color: '#64748b' }}>Gross</div>
          <div style={{ fontWeight: 800 }}>{money(totals.totalLabor)}</div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
          <div style={{ color: '#64748b' }}>Employee tax</div>
          <div style={{ fontWeight: 800 }}>{money(totals.employeeTaxNum)}</div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
          <div style={{ color: '#64748b' }}>Deductions</div>
          <div style={{ fontWeight: 800 }}>{money(totals.employeeDeductions)}</div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
          <div style={{ color: '#64748b' }}>Net pay</div>
          <div style={{ fontWeight: 800 }}>{money(totals.netPay)}</div>
        </div>
      </div>
    </div>
  )
}
