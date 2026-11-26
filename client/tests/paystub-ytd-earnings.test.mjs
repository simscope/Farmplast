import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPayrollYtdTotals,
  getPaystubYtdEarnings,
  loadPayrollEarningsChecks,
} from '../src/utils/payrollYtd.js'

const employeeId = 'employee-1'
const periodStart = '2027-01-11'
const periodEnd = '2027-01-17'
const options = { employeeId, periodStart, periodEnd, now: new Date('2027-01-15T18:00:00Z') }
const preview = { grossPay: 950, mainLabor: 800, overtimeLabor: 150 }

const prior = {
  employee_id: employeeId,
  period_start: '2026-12-28',
  period_end: '2027-01-03',
  paid_at: '2027-01-08T17:00:00Z',
  total_labor: '1100.40',
  employee_tax: '100.00',
  net_pay: '990.40',
  rent: 10,
}

const current = {
  ...prior,
  period_start: periodStart,
  period_end: periodEnd,
  paid_at: '2027-01-15T17:00:00Z',
  total_labor: 920,
  net_pay: 810,
}

function check(payment, regular, overtime, overrides = {}) {
  return {
    employee_id: payment.employee_id,
    pay_period_start: payment.period_start,
    pay_period_end: payment.period_end,
    status: 'printed',
    voided_at: null,
    regular_labor: regular,
    overtime_labor: overtime,
    gross_pay: payment.total_labor,
    employee_tax: payment.employee_tax,
    net_pay: payment.net_pay,
    rent: payment.rent,
    ...overrides,
  }
}

function earnings(payments, checks) {
  return getPaystubYtdEarnings(getPayrollYtdTotals(payments, options), checks, preview)
}

test('paystub accumulates verified overtime and regular earnings across paid weeks plus the preview', () => {
  const oldYear = { ...prior, period_start: '2026-12-21', period_end: '2026-12-27', paid_at: '2027-01-01T04:59:59Z' }
  const future = { ...prior, period_start: '2027-01-04', period_end: '2027-01-10', paid_at: '2027-01-22T17:00:00Z' }
  assert.deepEqual(earnings([oldYear, prior, future], [check(prior, '800.10', '300.30')]), {
    gross: 2050.40, regular: 1600.10, overtime: 450.30, missingPayments: 0,
  })
})

test('paid paystub uses saved earnings for YTD rather than changed rates, flags or work logs', () => {
  assert.deepEqual(earnings([prior, current], [
    check(prior, 800.10, 300.30, { status: 'paid' }),
    check(current, 800, 120),
  ]), { gross: 2020.40, regular: 1600.10, overtime: 420.30, missingPayments: 0 })
})

test('first payroll preview can distinguish no overtime from unknown historical overtime', () => {
  const totals = getPayrollYtdTotals([], options)
  assert.deepEqual(getPaystubYtdEarnings(totals, [], { grossPay: 800, mainLabor: 800, overtimeLabor: 0 }), {
    gross: 800, regular: 800, overtime: 0, missingPayments: 0,
  })
  assert.deepEqual(earnings([prior], []), {
    gross: 2050.40, regular: undefined, overtime: undefined, missingPayments: 1,
  })
})

test('rejects unverified splits from voids, drafts, grouped checks, missing values or different payments', () => {
  const valid = check(prior, 800.10, 300.30)
  for (const override of [
    { status: 'draft' },
    { status: 'voided' },
    { voided_at: '2027-01-09T18:00:00Z' },
    { gross_pay: 2100.40, net_pay: 1990.40, regular_labor: 1800.10 },
    { overtime_labor: null },
    { overtime_labor: 0 },
    { employee_id: 'another-employee' },
    { pay_period_end: '2027-01-04' },
    { employee_tax: 105 },
    { rent: 5 },
  ]) {
    assert.deepEqual(earnings([prior], [{ ...valid, ...override }]), {
      gross: 2050.40, regular: undefined, overtime: undefined, missingPayments: 1,
    })
  }
  assert.equal(earnings([prior], [valid, { ...valid, status: 'paid' }]).overtime, 450.30)
  assert.equal(earnings([prior], [valid, { ...valid, regular_labor: 900.10, overtime_labor: 200.30 }]).regular, undefined)
  assert.equal(earnings([prior], [valid, { ...valid, status: 'draft' }]).overtime, 450.30)
})

test('an unverifiable current paid check keeps the recorded gross and never borrows preview overtime', () => {
  assert.deepEqual(earnings([prior, current], [check(prior, 800.10, 300.30)]), {
    gross: 2020.40, regular: undefined, overtime: undefined, missingPayments: 1,
  })
})

test('check lookup is read-only, employee-scoped and paginated; no payments means no lookup', async () => {
  const calls = []
  const first = Array.from({ length: 500 }, (_, id) => ({ id }))
  const supabase = {
    from(table) {
      calls.push(['from', table])
      const query = {}
      for (const method of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'order']) {
        query[method] = (...args) => { calls.push([method, ...args]); return query }
      }
      query.range = (start, end) => {
        calls.push(['range', start, end])
        return Promise.resolve({ data: start === 0 ? first : [{ id: 500 }] })
      }
      return query
    },
  }
  assert.deepEqual(await loadPayrollEarningsChecks(supabase, employeeId, []), [])
  assert.deepEqual(calls, [])
  assert.equal((await loadPayrollEarningsChecks(supabase, employeeId, [current, prior])).length, 501)
  for (const expected of [
    ['from', 'payroll_checks'],
    ['eq', 'employee_id', employeeId],
    ['in', 'status', ['printed', 'paid']],
    ['is', 'voided_at', null],
    ['gte', 'pay_period_start', prior.period_start],
    ['lte', 'pay_period_start', current.period_start],
    ['order', 'id', { ascending: true }],
  ]) {
    assert.equal(calls.filter((call) => JSON.stringify(call) === JSON.stringify(expected)).length, 2)
  }
  assert.deepEqual(calls.filter(([method]) => method === 'range'), [['range', 0, 499], ['range', 500, 999]])
})
