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
  User,
  Hash,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const pageCard =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

const darkInput =
  'w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-cyan-500'

const whiteInput =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500'

function money(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2)}`
}

function calcHours(timeIn, timeOut, lunchHours) {
  if (!timeIn || !timeOut) return 0

  const [inH, inM] = String(timeIn).split(':').map(Number)
  const [outH, outM] = String(timeOut).split(':').map(Number)

  if (
    Number.isNaN(inH) ||
    Number.isNaN(inM) ||
    Number.isNaN(outH) ||
    Number.isNaN(outM)
  ) {
    return 0
  }

  const start = inH * 60 + inM
  const end = outH * 60 + outM

  if (end <= start) return 0

  const lunch = Number(lunchHours || 0)
  const totalHours = (end - start) / 60 - lunch

  return totalHours > 0 ? Number(totalHours.toFixed(2)) : 0
}

function buildEmptyRow() {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: new Date().toISOString().slice(0, 10),
    time_in: '',
    time_out: '',
    lunch_hours: '0',
    reg_hours: '0',
    labor_amount: '0',
    notes: '',
    isNew: true,
  }
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })

  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10))

  const [tax, setTax] = useState('0')
  const [rent, setRent] = useState('0')
  const [electric, setElectric] = useState('0')
  const [water, setWater] = useState('0')
  const [clean, setClean] = useState('0')
  const [transport, setTransport] = useState('0')

  useEffect(() => {
    loadPage()
  }, [id])

  async function loadPage() {
    try {
      setLoading(true)
      setError('')

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (employeeError) throw employeeError

      if (!employeeData) {
        setEmployee(null)
        setLogs([])
        setError('Employee not found')
        return
      }

      setEmployee(employeeData)

      const { data: logsData, error: logsError } = await supabase
        .from('employee_work_logs')
        .select('*')
        .eq('employee_id', id)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (logsError) {
        console.error('employee_work_logs load error:', logsError)
        setLogs([])
      } else {
        setLogs(logsData || [])
      }
    } catch (err) {
      console.error('loadPage error:', err)
      setError(err.message || 'Failed to load employee page')
    } finally {
      setLoading(false)
    }
  }

  function addRow() {
    setLogs((prev) => [buildEmptyRow(), ...prev])
  }

  function updateRowValue(rowId, field, value) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [field]: value }

        const computedHours = calcHours(
          nextRow.time_in,
          nextRow.time_out,
          nextRow.lunch_hours
        )

        const hourlyRate =
          employee?.pay_type === 'hourly' ? Number(employee?.hourly_rate || 0) : 0

        if (field === 'time_in' || field === 'time_out' || field === 'lunch_hours') {
          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            nextRow.labor_amount = String(Number((computedHours * hourlyRate).toFixed(2)))
          }
        }

        if (field === 'reg_hours' && employee?.pay_type === 'hourly') {
          const reg = Number(value || 0)
          nextRow.labor_amount = String(Number((reg * hourlyRate).toFixed(2)))
        }

        return nextRow
      })
    )
  }

  async function saveRow(row) {
    try {
      setSaving(true)
      setError('')

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
        notes: row.notes?.trim() || null,
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

      await loadPage()
    } catch (err) {
      console.error('deleteRow error:', err)
      setError(err.message || 'Failed to delete row')
    }
  }

  function handlePrintCheck() {
    window.print()
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
    const totalReg = filteredLogs.reduce(
      (sum, row) => sum + Number(row.reg_hours || 0),
      0
    )

    const totalLabor = filteredLogs.reduce(
      (sum, row) => sum + Number(row.labor_amount || 0),
      0
    )

    const taxNum = Number(tax || 0)
    const rentNum = Number(rent || 0)
    const electricNum = Number(electric || 0)
    const waterNum = Number(water || 0)
    const cleanNum = Number(clean || 0)
    const transportNum = Number(transport || 0)

    const deductions =
      taxNum + rentNum + electricNum + waterNum + cleanNum + transportNum

    const gTotal = totalLabor - deductions

    return {
      totalReg,
      totalLabor,
      taxNum,
      rentNum,
      electricNum,
      waterNum,
      cleanNum,
      transportNum,
      gTotal,
    }
  }, [filteredLogs, tax, rent, electric, water, clean, transport])

  const fullName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .print-sheet,
          .print-sheet * {
            visibility: visible;
          }

          .print-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
            padding: 24px;
          }

          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap gap-3 print-hide">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-cyan-500"
          >
            <ArrowLeft size={18} />
            Back to dashboard
          </Link>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500"
          >
            <Plus size={18} />
            Add row
          </button>
        </div>

        {loading ? (
          <div className={`${pageCard} p-10 text-center text-slate-400`}>
            Loading employee...
          </div>
        ) : error && !employee ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`${pageCard} p-6 print-hide`}>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white">{fullName}</h1>
                  <p className="mt-2 text-slate-400">
                    Employee payroll card with daily work table
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Hash size={16} />
                      Employee #
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {employee?.employee_number ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <User size={16} />
                      Name
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">{fullName}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Wallet size={16} />
                      Pay type
                    </div>
                    <div className="mt-2 text-xl font-bold capitalize text-white">
                      {employee?.pay_type || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSign size={16} />
                      Rate / Salary
                    </div>
                    <div className="mt-2 text-xl font-bold text-cyan-300">
                      {employee?.pay_type === 'monthly'
                        ? money(employee?.monthly_salary)
                        : money(employee?.hourly_rate)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Period start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Period end</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock3 size={16} />
                    Total reg
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    {totals.totalReg.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <DollarSign size={16} />
                    Total labor
                  </div>
                  <div className="mt-2 text-2xl font-bold text-cyan-300">
                    {money(totals.totalLabor)}
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 print-hide">
                {error}
              </div>
            ) : null}

            <div className={`${pageCard} overflow-hidden print-hide`}>
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Work log</h2>
                    <p className="text-slate-400">
                      Table like the paper sheet: date, time, lunch, reg, labor
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1220px]">
                  <div className="grid grid-cols-[1fr_0.9fr_0.9fr_0.8fr_0.8fr_0.9fr_1.1fr_1fr] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
                    <div>Date</div>
                    <div>Time In</div>
                    <div>Time Out</div>
                    <div>Lunch</div>
                    <div>Reg</div>
                    <div>Labor</div>
                    <div>Notes</div>
                    <div>Actions</div>
                  </div>

                  {logs.length === 0 ? (
                    <div className="bg-[#0b1220] px-4 py-10 text-center text-slate-400">
                      No rows yet. Click "Add row".
                    </div>
                  ) : (
                    logs.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_0.9fr_0.9fr_0.8fr_0.8fr_0.9fr_1.1fr_1fr] items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-3"
                      >
                        <div>
                          <input
                            type="date"
                            value={row.work_date || ''}
                            onChange={(e) =>
                              updateRowValue(row.id, 'work_date', e.target.value)
                            }
                            className={darkInput}
                          />
                        </div>

                        <div>
                          <input
                            type="time"
                            value={row.time_in || ''}
                            onChange={(e) =>
                              updateRowValue(row.id, 'time_in', e.target.value)
                            }
                            className={darkInput}
                          />
                        </div>

                        <div>
                          <input
                            type="time"
                            value={row.time_out || ''}
                            onChange={(e) =>
                              updateRowValue(row.id, 'time_out', e.target.value)
                            }
                            className={darkInput}
                          />
                        </div>

                        <div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.lunch_hours ?? '0'}
                            onChange={(e) =>
                              updateRowValue(row.id, 'lunch_hours', e.target.value)
                            }
                            className={darkInput}
                          />
                        </div>

                        <div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.reg_hours ?? '0'}
                            onChange={(e) =>
                              updateRowValue(row.id, 'reg_hours', e.target.value)
                            }
                            className={darkInput}
                          />
                        </div>

                        <div>
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
                        </div>

                        <div>
                          <input
                            type="text"
                            value={row.notes || ''}
                            onChange={(e) =>
                              updateRowValue(row.id, 'notes', e.target.value)
                            }
                            placeholder="Optional note"
                            className={darkInput}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={saving}
                            className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                          >
                            Save
                          </button>

                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300 transition hover:bg-red-600/20"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className={`${pageCard} p-6 print-hide`}>
                <h2 className="mb-5 text-2xl font-bold text-white">Deductions</h2>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Tax</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Rent</label>
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
                    <label className="mb-2 block text-sm text-slate-300">Electric</label>
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
                    <label className="mb-2 block text-sm text-slate-300">Water</label>
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
                    <label className="mb-2 block text-sm text-slate-300">Clean</label>
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
                    <label className="mb-2 block text-sm text-slate-300">Transport</label>
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
              </div>

              <div className="print-sheet rounded-3xl border border-slate-300 bg-white p-8 text-slate-900 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-300 pb-5">
                  <div>
                    <div className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      Payroll sheet
                    </div>
                    <h2 className="mt-2 text-3xl font-bold">Employee Payment Check</h2>
                  </div>

                  <button
                    onClick={handlePrintCheck}
                    className="print-hide inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-200"
                  >
                    <Printer size={16} />
                    Print Check
                  </button>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Employee
                    </div>
                    <div className="mt-2 text-lg font-semibold">{fullName}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Employee #
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {employee?.employee_number ?? '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Period start
                    </div>
                    <div className="mt-2 text-lg font-semibold">{periodStart || '—'}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Period end
                    </div>
                    <div className="mt-2 text-lg font-semibold">{periodEnd || '—'}</div>
                  </div>
                </div>

                <div className="my-6 border-t border-slate-300" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Total hours</span>
                    <span className="font-semibold">{totals.totalReg.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Total labor</span>
                    <span className="font-semibold">{money(totals.totalLabor)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Tax</span>
                    <span className="font-semibold">{money(totals.taxNum)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Rent</span>
                    <span className="font-semibold">{money(totals.rentNum)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Electric</span>
                    <span className="font-semibold">{money(totals.electricNum)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Water</span>
                    <span className="font-semibold">{money(totals.waterNum)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Clean</span>
                    <span className="font-semibold">{money(totals.cleanNum)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Transport</span>
                    <span className="font-semibold">{money(totals.transportNum)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-300 pt-4 text-xl">
                    <span className="font-bold">G.Total</span>
                    <span className="font-bold">{money(totals.gTotal)}</span>
                  </div>
                </div>

                <div className="mt-8 grid gap-8 md:grid-cols-2">
                  <div>
                    <div className="border-t border-slate-400 pt-2 text-sm text-slate-600">
                      Employee signature
                    </div>
                  </div>

                  <div>
                    <div className="border-t border-slate-400 pt-2 text-sm text-slate-600">
                      Authorized signature
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Dates in period
                  </div>

                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-300">
                    <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr] bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                      <div>Date</div>
                      <div>Time In</div>
                      <div>Time Out</div>
                      <div>Reg</div>
                      <div>Labor</div>
                    </div>

                    {filteredLogs.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">
                        No work rows in selected period
                      </div>
                    ) : (
                      filteredLogs.map((row) => (
                        <div
                          key={`print-${row.id}`}
                          className="grid grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr] border-t border-slate-200 px-4 py-3 text-sm"
                        >
                          <div>{row.work_date || '—'}</div>
                          <div>{row.time_in || '—'}</div>
                          <div>{row.time_out || '—'}</div>
                          <div>{Number(row.reg_hours || 0).toFixed(2)}</div>
                          <div>{money(row.labor_amount)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
