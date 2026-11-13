import React, { useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import PayrollCheck from './PayrollCheck'
import CompanyPayrollCheck from './CompanyPayrollCheck'
import { getPayrollPaymentDate } from '../../utils/payrollYtd'
import {
  createPayrollPrintConfirmation,
  getPrintRowKey,
  mapPayrollRowToCheckTotals,
} from '../../utils/payrollPrint'

export default function PayrollPrintDocument({
  rows: initialRows, week, defaultPayDate, getFullName, printWindow,
  recalculateRow, onConfirm,
}) {
  const [rows, setRows] = useState(initialRows)
  const [edits, setEdits] = useState(() => Object.fromEntries(initialRows.map((item) => [
    getPrintRowKey(item), { payDate: item.paymentDate || defaultPayDate },
  ])))
  const [confirmedRows, setConfirmedRows] = useState(null)
  const [locked, setLocked] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [error, setError] = useState('')
  const [confirm] = useState(() => createPayrollPrintConfirmation(onConfirm))
  const busyRef = useRef(false)
  const displayedRows = confirmedRows || rows
  const dates = displayedRows.map((item) => edits[getPrintRowKey(item)]?.payDate ?? defaultPayDate)
  const commonDate = dates.every((date) => date === dates[0]) ? dates[0] : ''
  const datesValid = dates.every((date) => Boolean(getPayrollPaymentDate(date)))

  function updateDates(value, rowKey) {
    if (locked) return
    const affected = (item) => !rowKey || getPrintRowKey(item) === rowKey
    if (getPayrollPaymentDate(value)) {
      setRows((previous) => previous.map((item) => affected(item) ? recalculateRow(item, value) : item))
    }
    setEdits((previous) => {
      const next = { ...previous }
      rows.filter(affected).forEach((item) => {
        const key = getPrintRowKey(item)
        next[key] = { ...next[key], payDate: value }
      })
      return next
    })
  }

  async function handlePrint() {
    if (busyRef.current || saveFailed || !datesValid) return
    busyRef.current = true
    setPrinting(true)
    setError('')
    const targetWindow = printWindow || window
    try {
      if (!confirmedRows) {
        setLocked(true)
        try {
          const saved = await confirm(rows)
          setConfirmedRows([...saved])
        } catch (err) {
          setSaveFailed(true)
          setError(`${err.message || 'Could not save checks.'} Review payment history before starting a new batch.`)
          return
        }
      }
      if (targetWindow.document.fonts?.ready) await targetWindow.document.fonts.ready
      await new Promise((resolve) => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(resolve)))
      targetWindow.print()
    } catch (err) {
      setError(err.message || 'Could not open the print dialog. Try Print again.')
    } finally {
      setPrinting(false)
      busyRef.current = false
    }
  }

  return (
    <div className="payroll-print-host dashboard-selected-checks-print">
      <div className="no-print sticky top-0 z-10 border-b border-slate-700 bg-[#07111f] px-4 py-3 text-white shadow">
        <div className="mx-auto flex max-w-[215.9mm] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Payroll checks</div>
            <div className="text-xs text-slate-400">
              {displayedRows.length} ready to print · {confirmedRows ? 'Saved' : 'Review dates before saving'}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-300">
              Date for all checks
              <input
                type="date" required aria-label="Date for all checks"
                value={commonDate} disabled={locked}
                onInput={(event) => updateDates(event.currentTarget.value)}
                className="mt-1 block rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none [color-scheme:dark] focus:border-cyan-500 disabled:opacity-60"
              />
            </label>
            <button
              type="button" onClick={handlePrint} disabled={printing || saveFailed || !datesValid}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
            >
              <Printer size={16} />
              {printing ? 'Preparing...' : confirmedRows ? 'Print' : 'Save and Print'}
            </button>
            <button
              type="button" disabled={printing} onClick={() => (printWindow || window).close()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500 disabled:opacity-50"
            ><X size={16} />Close</button>
          </div>
        </div>
        {error ? <p role="alert" className="mx-auto mt-2 max-w-[215.9mm] text-sm text-red-300">{error}</p> : null}
      </div>

      {displayedRows.map((item) => {
        const employee = item.employee
        const checkNumber = item.print_check_number || 'pending'
        const totals = mapPayrollRowToCheckTotals(item)
        const rowKey = getPrintRowKey(item)
        const edit = edits[rowKey] || {}
        const payDate = edit.payDate ?? defaultPayDate
        const checkAmount = edit.amount === undefined || edit.amount === '' ? totals.netPay : Number(edit.amount)
        const fullName = item.fullName || getFullName(employee)
        return (
          <div key={rowKey} className="dashboard-selected-check-page">
            <div className="no-print mx-auto my-4 grid max-w-[215.9mm] gap-3 rounded-lg border border-slate-700 bg-[#07111f] p-3 text-white md:grid-cols-[1fr_160px_160px]">
              <div className="min-w-0 self-center truncate text-sm font-semibold">
                {checkNumber === 'pending' ? 'Check' : `Check #${checkNumber}`} · {fullName}
              </div>
              <label className="block text-xs font-semibold text-slate-300">
                Date
                <input
                  type="date" required aria-label={`Date for ${fullName}`}
                  value={payDate} disabled={locked}
                  onInput={(event) => updateDates(event.currentTarget.value, rowKey)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-cyan-500 disabled:opacity-60"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300">
                Amount
                <input
                  type="number" step="0.01" min="0" disabled={locked}
                  value={edit.amount ?? String(Number(totals.netPay || 0).toFixed(2))}
                  onChange={(event) => {
                    const amount = event.target.value
                    setEdits((previous) => ({ ...previous, [rowKey]: { ...previous[rowKey], amount } }))
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 disabled:opacity-60"
                />
              </label>
            </div>
            {item.grouped_company ? (
              <CompanyPayrollCheck
                companyName={fullName} groupedItems={item.grouped_items || []} totals={totals}
                periodStart={week.startText} periodEnd={week.endText}
                checkNumber={checkNumber} payDate={payDate || item.paymentDate} checkAmount={checkAmount}
              />
            ) : (
              <PayrollCheck
                employee={employee} fullName={fullName} totals={totals}
                periodStart={week.startText} periodEnd={week.endText}
                checkNumber={checkNumber} payDate={payDate || item.paymentDate} checkAmount={checkAmount}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
