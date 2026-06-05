import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import PayrollCheck from './PayrollCheck'
import './PayrollCheck.css'

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRowKey(item) {
  return `${item?.employee?.id || 'employee'}-${item?.saved_check_number || 'check'}`
}

export default function SelectedChecksPrintModal({
  open,
  onClose,
  rows,
  week,
  getFullName,
  autoPrint = false,
  onAutoPrintDone,
}) {
  const [printing, setPrinting] = useState(false)
  const [checkEdits, setCheckEdits] = useState({})
  const lastAutoPrintKeyRef = useRef('')

  const printKey = (rows || [])
    .map((item) => `${item?.employee?.id || ''}-${item?.saved_check_number || ''}`)
    .join('|')

  const defaultPayDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  function updateCheckEdit(rowKey, field, value) {
    setCheckEdits((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [field]: value,
      },
    }))
  }

  const handlePrint = useCallback(async function handlePrint() {
    if (!open || !rows?.length || printing) return

    try {
      setPrinting(true)

      if (document?.fonts?.ready) {
        await document.fonts.ready
      }

      await waitForNextPaint()
      await sleep(350)

      window.print()
    } finally {
      setPrinting(false)
      if (typeof onAutoPrintDone === 'function') {
        onAutoPrintDone()
      }
    }
  }, [onAutoPrintDone, open, printing, rows?.length])

  useEffect(() => {
    if (!open || !autoPrint || !rows?.length) return
    if (!printKey) return
    if (lastAutoPrintKeyRef.current === printKey) return

    lastAutoPrintKeyRef.current = printKey
    handlePrint()
  }, [autoPrint, handlePrint, open, printKey, rows?.length])

  useEffect(() => {
    if (!open || !rows?.length) return

    setCheckEdits((prev) => {
      const next = { ...prev }

      rows.forEach((item) => {
        const rowKey = getRowKey(item)
        if (next[rowKey]) return

        next[rowKey] = {
          payDate: defaultPayDate,
          amount: String(Number(item?.print_totals?.netPay || 0).toFixed(2)),
        }
      })

      return next
    })
  }, [defaultPayDate, open, printKey, rows])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4">
      <div className="selected-checks-modal-frame flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="selected-checks-modal-header no-print flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Selected checks preview</h2>
            <p className="mt-1 text-sm text-slate-400">
              {rows?.length || 0} check{rows?.length === 1 ? '' : 's'} ready for printing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={16} />
              {printing ? 'Preparing...' : 'Print'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-red-500"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200 p-5">
          <div className="payroll-print-host selected-checks-print-root mx-auto space-y-6">
            {(rows || []).map((item) => {
              const employee = item.employee
              const totals = item.print_totals || {}
              const checkNumber = item.saved_check_number
              const rowKey = getRowKey(item)
              const edit = checkEdits[rowKey] || {}
              const payDate = edit.payDate || defaultPayDate
              const checkAmount = edit.amount === '' ? totals.netPay : Number(edit.amount)

              return (
                <div key={rowKey}>
                  <div className="no-print mb-3 grid gap-3 rounded-lg border border-slate-700 bg-[#07111f] p-3 text-white md:grid-cols-[1fr_160px_160px]">
                    <div>
                      <div className="text-sm font-semibold">
                        Check #{checkNumber || '—'} · {getFullName(employee)}
                      </div>
                    </div>

                    <label className="block text-xs font-semibold text-slate-300">
                      Date
                      <input
                        type="date"
                        value={payDate}
                        onChange={(event) =>
                          updateCheckEdit(rowKey, 'payDate', event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-300">
                      Amount
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={edit.amount ?? String(Number(totals.netPay || 0).toFixed(2))}
                        onChange={(event) =>
                          updateCheckEdit(rowKey, 'amount', event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500"
                      />
                    </label>
                  </div>

                  <PayrollCheck
                    employee={employee}
                    fullName={getFullName(employee)}
                    totals={totals}
                    periodStart={week?.startText}
                    periodEnd={week?.endText}
                    checkNumber={checkNumber}
                    payDate={payDate}
                    checkAmount={checkAmount}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
