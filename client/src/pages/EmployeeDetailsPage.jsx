import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Clock3,
  DollarSign,
  Mail,
  Phone,
  Printer,
  User,
  Wallet,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const cardClass =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const checkRef = useRef(null)

  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })

  const [periodEnd, setPeriodEnd] = useState(() => {
    return new Date().toISOString().slice(0, 10)
  })

  const [manualHours, setManualHours] = useState('80')
  const [overtimeHours, setOvertimeHours] = useState('0')
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadEmployee()
  }, [id])

  async function loadEmployee() {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        setError('Employee not found')
        setEmployee(null)
        return
      }

      setEmployee(data)
    } catch (err) {
      console.error('loadEmployee error:', err)
      setError(err.message || 'Failed to load employee')
    } finally {
      setLoading(false)
    }
  }

  const payroll = useMemo(() => {
    const regularHours = Number(manualHours || 0)
    const overtime = Number(overtimeHours || 0)

    const hourlyRate =
      employee?.pay_type === 'hourly' ? Number(employee?.hourly_rate || 0) : 0

    const monthlySalary =
      employee?.pay_type === 'monthly' ? Number(employee?.monthly_salary || 0) : 0

    const regularPay =
      employee?.pay_type === 'hourly' ? regularHours * hourlyRate : monthlySalary

    const overtimePay =
      employee?.pay_type === 'hourly' ? overtime * hourlyRate * 1.5 : 0

    const totalPay = regularPay + overtimePay

    return {
      regularHours,
      overtime,
      hourlyRate,
      monthlySalary,
      regularPay,
      overtimePay,
      totalPay,
    }
  }, [employee, manualHours, overtimeHours])

  const fullName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'

  function handlePrintCheck() {
    window.print()
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .print-check-area,
          .print-check-area * {
            visibility: visible;
          }

          .print-check-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            background: white;
            color: black;
          }

          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap gap-3 print-hide">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-cyan-500"
          >
            <ArrowLeft size={18} />
            Back to dashboard
          </Link>
        </div>

        {loading ? (
          <div className={`${cardClass} p-10 text-center text-slate-400`}>
            Loading employee...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className={`${cardClass} p-6`}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-white">{fullName}</h1>
                    <p className="mt-2 text-slate-400">Employee details and payroll</p>
                  </div>

                  <div className="rounded-2xl bg-cyan-500/10 px-4 py-3 text-cyan-300">
                    #{employee?.employee_number ?? '—'}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <User size={16} />
                      Name
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{fullName}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Briefcase size={16} />
                      Position
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {employee?.position || 'worker'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone size={16} />
                      Phone
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {employee?.phone || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Mail size={16} />
                      Email
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {employee?.email || '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${cardClass} p-6`}>
                <div className="mb-5">
                  <h2 className="text-2xl font-bold text-white">Payroll summary</h2>
                  <p className="mt-1 text-slate-400">
                    For now manual hours. Next step: import from Icon Time TotalPass P600.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Period start</label>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Period end</label>
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Regular hours</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualHours}
                      onChange={(e) => setManualHours(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Overtime hours</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={overtimeHours}
                      onChange={(e) => setOvertimeHours(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Clock3 size={16} />
                      Regular
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">
                      {payroll.regularHours}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <CalendarDays size={16} />
                      Overtime
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">
                      {payroll.overtime}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSign size={16} />
                      Rate
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">
                      {employee?.pay_type === 'hourly'
                        ? money(payroll.hourlyRate)
                        : money(payroll.monthlySalary)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Wallet size={16} />
                      Total pay
                    </div>
                    <div className="mt-2 text-2xl font-bold text-cyan-300">
                      {money(payroll.totalPay)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div ref={checkRef} className="print-check-area rounded-3xl border border-slate-300 bg-white p-8 text-slate-900 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-300 pb-5">
                  <div>
                    <div className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      Payment Check
                    </div>
                    <h2 className="mt-2 text-3xl font-bold">Employee Payroll Check</h2>
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
                    <div className="mt-2 text-lg font-semibold">{periodStart}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Period end
                    </div>
                    <div className="mt-2 text-lg font-semibold">{periodEnd}</div>
                  </div>
                </div>

                <div className="my-6 border-t border-slate-300" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Payment type</span>
                    <span className="font-semibold capitalize">{employee?.pay_type || '—'}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Regular hours</span>
                    <span className="font-semibold">{payroll.regularHours}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Overtime hours</span>
                    <span className="font-semibold">{payroll.overtime}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Regular pay</span>
                    <span className="font-semibold">{money(payroll.regularPay)}</span>
                  </div>

                  <div className="flex items-center justify-between text-base">
                    <span className="text-slate-600">Overtime pay</span>
                    <span className="font-semibold">{money(payroll.overtimePay)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-300 pt-4 text-xl">
                    <span className="font-bold">Total payment</span>
                    <span className="font-bold">{money(payroll.totalPay)}</span>
                  </div>
                </div>

                <div className="my-6 border-t border-slate-300" />

                <div className="grid gap-4 md:grid-cols-2 print-hide">
                  <div>
                    <label className="mb-2 block text-sm text-slate-600">Paid amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
                      placeholder={String(payroll.totalPay)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-600">Payment method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="zelle">Zelle</option>
                      <option value="card">Card</option>
                      <option value="bank">Bank transfer</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm text-slate-600">Notes</label>
                    <textarea
                      rows="3"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-600"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Paid amount
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {money(paidAmount || payroll.totalPay)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Payment method
                    </div>
                    <div className="mt-2 text-lg font-semibold capitalize">
                      {paymentMethod}
                    </div>
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

                {notes ? (
                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Notes
                    </div>
                    <div className="mt-2 text-base">{notes}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
