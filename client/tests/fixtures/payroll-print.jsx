// Synthetic data and a fake print target: no Supabase imports, requests or issued checks.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PayrollPrintDocument from '../../src/components/payroll/PayrollPrintDocument'
import { getPayrollYtdTotals } from '../../src/utils/payrollYtd'
import '../../src/index.css'
import '../../src/components/payroll/PayrollCheck.css'

const week = { startText: '2026-12-21', endText: '2026-12-27' }
const histories = [{ employee_id: 'test-a', period_start: '2026-12-07', period_end: '2026-12-13', paid_at: '2026-12-18T17:00:00Z', employee_tax: 150, net_pay: 900 }]
const baseTotals = { mainHours: 40, mainLabor: 600, totalLabor: 600, employeeTaxNum: 100, netPay: 500, rows: [] }
const person = { employee: { id: 'test-a', employee_number: 9001, first_name: 'Test', last_name: 'Employee', employer_form: 'W2' }, fullName: 'Test Employee', paymentDate: '2026-12-31', checkTotals: { ...baseTotals, ytdEmployeeTaxes: 250, ytdNetPay: 1400 } }
const company = { employee: { id: 'company-test', employer_form: 'Other', company_name: 'Test Company' }, fullName: 'Test Company', paymentDate: '2026-12-31', checkTotals: { ...baseTotals }, grouped_company: true, grouped_items: [{ ...person, employee: { ...person.employee, id: 'test-b' } }] }

function recalculateRow(item, paymentDate) {
  const ytd = getPayrollYtdTotals(histories, { employeeId: item.employee.id, ...{ periodStart: week.startText, periodEnd: week.endText }, paymentDate })
  return {
    ...item, paymentDate,
    checkTotals: { ...item.checkTotals, ytdEmployeeTaxes: ytd.priorYtdEmployeeTaxes + 100, ytdNetPay: ytd.priorYtdNetPay + 500 },
    ...(item.grouped_company ? { grouped_items: item.grouped_items.map((source) => recalculateRow(source, paymentDate)) } : {}),
  }
}

export default function Fixture({ targetWindow = window }) {
  const [record, setRecord] = useState({ saves: 0, prints: 0, rows: [] })
  const fail = new URLSearchParams(location.search).has('fail')
  const printTarget = {
    document: targetWindow.document,
    requestAnimationFrame: targetWindow.requestAnimationFrame.bind(targetWindow),
    print() { setRecord((previous) => ({ ...previous, prints: previous.prints + 1 })) },
    close() {},
  }
  async function onConfirm(rows) {
    setRecord((previous) => ({ ...previous, saves: previous.saves + 1, rows: rows.map((item) => ({
      employee: item.employee.id, date: item.paymentDate, childDates: item.grouped_items?.map((source) => source.paymentDate), ytd: item.checkTotals.ytdEmployeeTaxes,
    })) }))
    if (fail) throw new Error('Simulated save failure')
    await new Promise((resolve) => setTimeout(resolve, 200))
    return rows.map((item, index) => ({ ...item, print_check_number: 99001 + index }))
  }
  return <>
    <div className="no-print bg-amber-100 p-2 text-black">ISOLATED TEST — no database or printer calls. <output data-testid="record">{JSON.stringify(record)}</output></div>
    <PayrollPrintDocument rows={[person, company]} week={week} defaultPayDate="2026-12-31" getFullName={(employee) => employee.first_name} printWindow={printTarget} recalculateRow={recalculateRow} onConfirm={onConfirm} />
  </>
}

function openPopup() {
  const popup = window.open('', '_blank')
  popup.document.write('<!doctype html><html><head><title>Isolated payroll popup</title></head><body><div id="root"></div></body></html>')
  popup.document.close()
  document.querySelectorAll('style,link[rel="stylesheet"]').forEach((style) => popup.document.head.appendChild(style.cloneNode(true)))
  createRoot(popup.document.getElementById('root')).render(<Fixture targetWindow={popup} />)
}

createRoot(document.getElementById('root')).render(<><button onClick={openPopup}>Open popup fixture</button><Fixture /></>)
