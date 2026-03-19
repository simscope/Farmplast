import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Calculator,
  DollarSign,
  Receipt,
  Printer,
  Plus,
  Trash2,
  Wallet,
  CreditCard,
  Landmark,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

const cardClass =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-cyan-500'

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

export default function AccountingPage() {
  const [entries, setEntries] = useState([
    {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      type: 'income',
      category: 'service',
      method: 'cash',
      client: 'Walk-in client',
      description: 'Service payment',
      amount: '250',
    },
  ])

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'income',
    category: 'service',
    method: 'cash',
    client: '',
    description: '',
    amount: '',
  })

  const [receipt, setReceipt] = useState({
    company: 'Farmplast',
    receiptNo: `R-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    customer: '',
    description: '',
    amount: '',
    paymentMethod: 'cash',
  })

  function handleAddEntry(e) {
    e.preventDefault()

    if (!form.amount || Number(form.amount) <= 0) return

    setEntries((prev) => [
      {
        id: crypto.randomUUID(),
        date: form.date,
        type: form.type,
        category: form.category,
        method: form.method,
        client: form.client.trim(),
        description: form.description.trim(),
        amount: form.amount,
      },
      ...prev,
    ])

    setForm((prev) => ({
      ...prev,
      client: '',
      description: '',
      amount: '',
    }))
  }

  function handleDeleteEntry(id) {
    setEntries((prev) => prev.filter((item) => item.id !== id))
  }

  function printReceipt() {
    window.print()
  }

  const stats = useMemo(() => {
    const income = entries
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const expense = entries
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const cash = entries
      .filter((item) => item.type === 'income' && item.method === 'cash')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const card = entries
      .filter((item) => item.type === 'income' && item.method === 'card')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const bank = entries
      .filter((item) => item.type === 'income' && item.method === 'bank')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    return {
      income,
      expense,
      balance: income - expense,
      cash,
      card,
      bank,
    }
  }, [entries])

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 print:max-w-full print:px-0 print:py-0">
        <div className="mb-6 print:hidden">
          <div className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-3xl bg-emerald-500/10 p-4 text-emerald-400">
                  <Calculator size={32} />
                </div>

                <div>
                  <h1 className="text-3xl font-bold text-white">Accounting</h1>
                  <p className="mt-2 max-w-2xl text-slate-400">
                    Money tracking, income / expense summary and printable receipts.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-white transition hover:border-cyan-500"
                >
                  <ArrowLeft size={18} />
                  Back to dashboard
                </Link>

                <button
                  onClick={printReceipt}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 font-semibold text-amber-300 transition hover:bg-amber-500/20"
                >
                  <Printer size={18} />
                  Print receipt
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 print:hidden">
          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                <TrendingUp size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                income
              </span>
            </div>
            <div className="text-3xl font-bold text-white">${formatMoney(stats.income)}</div>
            <div className="mt-2 text-sm text-slate-400">Total income</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                <TrendingDown size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                expense
              </span>
            </div>
            <div className="text-3xl font-bold text-white">${formatMoney(stats.expense)}</div>
            <div className="mt-2 text-sm text-slate-400">Total expenses</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                <DollarSign size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                balance
              </span>
            </div>
            <div className="text-3xl font-bold text-white">${formatMoney(stats.balance)}</div>
            <div className="mt-2 text-sm text-slate-400">Current balance</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-400">
                <Wallet size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                cash
              </span>
            </div>
            <div className="text-3xl font-bold text-white">${formatMoney(stats.cash)}</div>
            <div className="mt-2 text-sm text-slate-400">Cash income</div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                <CreditCard size={22} />
              </div>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                card / bank
              </span>
            </div>
            <div className="text-3xl font-bold text-white">
              ${formatMoney(stats.card + stats.bank)}
            </div>
            <div className="mt-2 text-sm text-slate-400">Non-cash income</div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr] print:hidden">
          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                <Plus size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Add money entry</h2>
                <p className="text-slate-400">Add income or expense row manually</p>
              </div>
            </div>

            <form onSubmit={handleAddEntry} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Type</label>
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Category</label>
                <input
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="service / parts / salary / fuel"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Payment method</label>
                <select
                  className={inputClass}
                  value={form.method}
                  onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Client / source</label>
                <input
                  className={inputClass}
                  value={form.client}
                  onChange={(e) => setForm((prev) => ({ ...prev, client: e.target.value }))}
                  placeholder="Client name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Description</label>
                <input
                  className={inputClass}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Description"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500"
                >
                  <Plus size={18} />
                  Add entry
                </button>
              </div>
            </form>
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-400">
                <Receipt size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Receipt builder</h2>
                <p className="text-slate-400">Fill and print a simple payment receipt</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Company</label>
                <input
                  className={inputClass}
                  value={receipt.company}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, company: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Receipt #</label>
                <input
                  className={inputClass}
                  value={receipt.receiptNo}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, receiptNo: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={receipt.date}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Payment method</label>
                <select
                  className={inputClass}
                  value={receipt.paymentMethod}
                  onChange={(e) =>
                    setReceipt((prev) => ({
                      ...prev,
                      paymentMethod: e.target.value,
                    }))
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Customer</label>
                <input
                  className={inputClass}
                  value={receipt.customer}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, customer: e.target.value }))
                  }
                  placeholder="Customer name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Description</label>
                <input
                  className={inputClass}
                  value={receipt.description}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Payment for service / parts"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={receipt.amount}
                  onChange={(e) =>
                    setReceipt((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className={`${cardClass} p-6 print:hidden`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                <Landmark size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Entries</h2>
                <p className="text-slate-400">Income and expense rows</p>
              </div>
            </div>

            <div className="space-y-3">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] px-4 py-10 text-center text-slate-400">
                  No entries yet
                </div>
              ) : (
                entries.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-slate-800 bg-[#0b1220] p-4 lg:grid-cols-[0.9fr_0.8fr_0.8fr_0.9fr_1.2fr_1.3fr_0.8fr_0.4fr]"
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Date</div>
                      <div className="mt-1 text-sm text-white">{item.date}</div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Type</div>
                      <div
                        className={`mt-1 text-sm font-semibold ${
                          item.type === 'income' ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {item.type}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Method
                      </div>
                      <div className="mt-1 text-sm text-white">{item.method}</div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Category
                      </div>
                      <div className="mt-1 text-sm text-white">{item.category}</div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Client
                      </div>
                      <div className="mt-1 text-sm text-white">{item.client || '—'}</div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Description
                      </div>
                      <div className="mt-1 text-sm text-white">
                        {item.description || '—'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Amount
                      </div>
                      <div className="mt-1 text-sm font-semibold text-cyan-300">
                        ${formatMoney(item.amount)}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleDeleteEntry(item.id)}
                        className="rounded-xl border border-red-500/30 bg-red-600/10 p-2 text-red-300 transition hover:bg-red-600/20"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-8 text-slate-900 shadow print:border-0 print:shadow-none">
            <div className="mb-8 flex items-start justify-between gap-4 border-b border-slate-300 pb-6">
              <div>
                <h2 className="text-3xl font-bold">{receipt.company || 'Company'}</h2>
                <p className="mt-2 text-sm text-slate-500">Payment Receipt</p>
              </div>

              <div className="text-right text-sm">
                <div>
                  <span className="font-semibold">Receipt #:</span> {receipt.receiptNo || '—'}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">Date:</span> {receipt.date || '—'}
                </div>
              </div>
            </div>

            <div className="grid gap-6 border-b border-slate-300 pb-6 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Received from
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {receipt.customer || '—'}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Payment method
                </div>
                <div className="mt-2 text-lg font-semibold capitalize">
                  {receipt.paymentMethod || '—'}
                </div>
              </div>
            </div>

            <div className="border-b border-slate-300 py-6">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Description
              </div>
              <div className="mt-2 text-lg">{receipt.description || '—'}</div>
            </div>

            <div className="flex items-end justify-between py-8">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Amount paid
                </div>
                <div className="mt-2 text-4xl font-bold">
                  ${formatMoney(receipt.amount)}
                </div>
              </div>

              <div className="text-right text-sm text-slate-500">
                Authorized accounting page print
              </div>
            </div>

            <div className="border-t border-slate-300 pt-6 text-sm text-slate-500">
              Thank you
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
