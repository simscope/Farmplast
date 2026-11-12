import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  loadYearToDatePayments,
  calculatePrintedCheckYtd,
} from '../src/utils/paymentHistory.js'

function mockPayments(rows, failPage = -1) {
  const calls = []
  return {
    calls,
    from(table) {
      assert.equal(table, 'employee_payments')
      const query = { fromDate: '', toDate: '' }
      return {
        select() { return this },
        gte(_column, date) { query.fromDate = date; return this },
        lt(_column, date) { query.toDate = date; return this },
        order() { return this },
        async range(start, end) {
          calls.push([start, end, query.fromDate, query.toDate])
          if (calls.length === failPage) {
            return { data: null, error: new Error('Simulated page failure') }
          }
          const matches = rows.filter(
            (row) => row.period_start >= query.fromDate && row.period_start < query.toDate
          )
          return { data: matches.slice(start, end + 1), error: null }
        },
      }
    },
  }
}

test('loads all 1,205 paid periods across multiple API-capped pages', async () => {
  const payments = Array.from({ length: 1205 }, (_, index) => ({
    id: String(index),
    employee_id: `employee-${index}`,
    period_start: '2026-10-05',
    period_end: '2026-10-11',
    paid_at: '2026-10-16T12:00:00Z',
    employee_tax: 100,
    net_pay: 540,
  }))
  const client = mockPayments(payments)
  const result = await loadYearToDatePayments(client, '2026-10-26')
  assert.equal(result.length, 1205)
  assert.equal(result.reduce((sum, row) => sum + row.employee_tax, 0), 120500)
  assert.deepEqual(client.calls.map((call) => call.slice(0, 2)), [
    [0, 499], [500, 999], [1000, 1499],
  ])
  assert.ok(client.calls.every((call) => call[2] === '2026-01-01' && call[3] === '2026-10-26'))
})

test('uses latest payment only when the same period has two records', async () => {
  const entries = [
    { id: '1', employee_id: 'e-9', period_start: '2026-10-05', period_end: '2026-10-11',
      employee_tax: 101, paid_at: '2026-10-16T12:00:00Z' },
    { id: '2', employee_id: 'e-9', period_start: '2026-10-05', period_end: '2026-10-11',
      employee_tax: 100, paid_at: '2026-10-17T12:00:00Z' },
  ]
  const result = await loadYearToDatePayments(mockPayments(entries), '2026-10-26')
  assert.equal(result.length, 1)
  assert.equal(result[0].employee_tax, 100)
})

test('rejects a failed history page instead of printing an incomplete YTD', async () => {
  const entries = Array.from({ length: 520 }, (_, index) => ({
    id: String(index),
    employee_id: `employee-${index}`,
    period_start: '2026-10-05',
    period_end: '2026-10-11',
  }))
  await assert.rejects(
    loadYearToDatePayments(mockPayments(entries, 2), '2026-10-26'),
    /Simulated page failure/
  )
})

test('YTD uses actual recorded withholding, not unrounded tax estimates', () => {
  assert.deepEqual(calculatePrintedCheckYtd(2835.47, 100, 14096, 540), {
    ytdEmployeeTaxes: 2935.47,
    ytdNetPay: 14636,
  })
})

test('dashboard print path uses complete history and prints exact tax cents', async () => {
  const dashboard = await readFile(
    new URL('../src/pages/DashboardPage.jsx', import.meta.url), 'utf8'
  )
  const check = await readFile(
    new URL('../src/components/payroll/PayrollCheck.jsx', import.meta.url), 'utf8'
  )
  assert.match(dashboard, /loadYearToDatePayments\(supabase, week\?\.startText\)/)
  assert.match(dashboard, /ytdEmployeeTaxes: printedYtd\.ytdEmployeeTaxes/)
  assert.match(dashboard, /ytdNetPay: printedYtd\.ytdNetPay/)
  assert.match(check, /row\.label === 'Employee Tax'[\s\S]*?stubMoneyCents\(row\.ytdValue\)/)
})
