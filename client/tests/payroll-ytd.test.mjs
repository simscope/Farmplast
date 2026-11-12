import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

import {
  getPayrollYtdTotals,
  getPayrollPaymentTimestamp,
  loadPayrollPaymentHistory,
} from '../src/utils/payrollYtd.js'

const employeeId = 'employee-nj-1'
const currentPeriod = { periodStart: '2027-01-11', periodEnd: '2027-01-17' }

function payment(id, overrides = {}) {
  return {
    id,
    employee_id: employeeId,
    period_start: '2027-01-04',
    period_end: '2027-01-10',
    paid_at: '2027-01-08T17:00:00.000Z',
    created_at: '2027-01-08T16:00:00.000Z',
    total_labor: 1000,
    employee_tax: 200,
    rent: 100,
    electric: 10,
    water: 5,
    clean: 4,
    transport: 20,
    net_pay: 661,
    ...overrides,
  }
}

function totals(rows, overrides = {}) {
  return getPayrollYtdTotals(rows, {
    employeeId,
    ...currentPeriod,
    paymentDate: '2027-01-15',
    now: new Date('2027-01-15T18:00:00.000Z'),
    ...overrides,
  })
}

test('first January payment starts prior YTD at zero; the next payment includes it', () => {
  const december = payment('december', {
    period_start: '2026-12-14', period_end: '2026-12-20',
    paid_at: '2026-12-25T17:00:00.000Z', total_labor: 184500,
  })
  const january = payment('first-january', {
    period_start: '2026-12-21', period_end: '2026-12-27',
    paid_at: '2027-01-01T17:00:00.000Z',
  })
  const first = totals([december], {
    periodStart: january.period_start, periodEnd: january.period_end, paymentDate: '2027-01-01',
  })
  assert.equal(first.priorYtdGross, 0)
  assert.equal(first.priorYtdEmployeeTaxes, 0)
  assert.equal(first.priorYtdDeductions, 0)
  assert.equal(first.priorYtdNetPay, 0)

  const next = totals([december, january], { paymentDate: '2027-01-08' })
  assert.equal(next.priorYtdGross, 1000)
  assert.equal(next.priorYtdEmployeeTaxes, 200)
  assert.equal(next.priorYtdDeductions, 139)
  assert.deepEqual(next.priorYtdDeductionBreakdown, {
    rent: 100, electric: 10, water: 5, clean: 4, transport: 20,
  })
  assert.equal(next.priorYtdNetPay, 661)
  assert.equal(next.priorYtdGross + 500, 1500, 'YTD after the next $500 payment includes both new-year payments')
})

test('a December work period paid in January belongs to January payment-year YTD', () => {
  const row = payment('late-december', {
    period_start: '2026-12-21', period_end: '2026-12-27', paid_at: '2027-01-02T17:00:00.000Z',
  })
  assert.equal(totals([row]).priorYtdGross, 1000)
  assert.equal(totals([row], { paymentDate: '2026-12-31' }).priorYtdGross, 0)
})

test('New York midnight determines the year rather than the UTC year', () => {
  const beforeMidnight = payment('before-midnight', {
    period_start: '2026-12-07', period_end: '2026-12-13', paid_at: '2027-01-01T04:59:59.999Z',
    total_labor: 300,
  })
  const afterMidnight = payment('after-midnight', {
    period_start: '2026-12-14', period_end: '2026-12-20', paid_at: '2027-01-01T05:00:00.000Z',
    total_labor: 700,
  })
  assert.equal(totals([beforeMidnight, afterMidnight], { paymentDate: '2027-01-02' }).priorYtdGross, 700)
  assert.equal(totals([beforeMidnight, afterMidnight], { paymentDate: '2026-12-31' }).priorYtdGross, 300)
})

test('a date-only January 1 stays January 1 and is not converted to the previous New York day', () => {
  const row = payment('date-only', {
    period_start: '2026-12-21', period_end: '2026-12-27', paid_at: '2027-01-01',
  })
  const result = totals([row], { paymentDate: '2027-01-01' })
  assert.equal(result.paymentDate, '2027-01-01')
  assert.equal(result.priorYtdGross, 1000)
})

test('payment-date persistence uses New York noon with the correct winter and summer offsets', () => {
  assert.equal(getPayrollPaymentTimestamp('2027-01-01'), '2027-01-01T17:00:00.000Z')
  assert.equal(getPayrollPaymentTimestamp('2027-07-04'), '2027-07-04T16:00:00.000Z')
  assert.equal(getPayrollPaymentTimestamp('2027-03-14'), '2027-03-14T16:00:00.000Z')
  assert.equal(getPayrollPaymentTimestamp('2027-02-29'), '')
})

test('a browser in a different time zone still persists the selected New York pay date', () => {
  const moduleUrl = new URL('../src/utils/payrollYtd.js', import.meta.url).href
  const code = `
    import { getPayrollPaymentTimestamp, getPayrollYtdTotals } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify({
      winter: getPayrollPaymentTimestamp('2027-01-01'),
      summer: getPayrollPaymentTimestamp('2027-07-04'),
      currentDate: getPayrollYtdTotals([], {employeeId:'fixture', now:new Date('2027-01-01T05:15:00Z')}).paymentDate
    }));
  `
  for (const zone of ['Pacific/Kiritimati', 'Pacific/Honolulu']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, TZ: zone },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      winter: '2027-01-01T17:00:00.000Z', summer: '2027-07-04T16:00:00.000Z', currentDate: '2027-01-01',
    })
  }
})

test('a new unpaid preview uses today in New York even when the work period belongs to last year', () => {
  const result = totals([], {
    periodStart: '2026-12-21', periodEnd: '2026-12-27', paymentDate: undefined,
    now: new Date('2027-01-01T05:15:00.000Z'),
  })
  assert.equal(result.paymentDate, '2027-01-01')
  assert.equal(result.priorYtdGross, 0)
})

test('historical paystub uses its recorded payment date and excludes later payments', () => {
  const earlier = payment('earlier', { total_labor: 400 })
  const own = payment('own', {
    period_start: currentPeriod.periodStart, period_end: currentPeriod.periodEnd,
    paid_at: '2027-01-15T17:00:00.000Z', total_labor: 600,
  })
  const later = payment('later', {
    period_start: '2026-12-21', period_end: '2026-12-27',
    paid_at: '2027-01-22T17:00:00.000Z', total_labor: 2000,
  })
  const result = totals([later, earlier, own], {
    paymentDate: undefined, now: new Date('2027-08-01T17:00:00.000Z'),
  })
  assert.equal(result.paymentDate, '2027-01-15')
  assert.equal(result.referencePayment.id, 'own')
  assert.equal(result.priorYtdGross, 400)
  assert.equal(result.priorPayments.some((row) => row.id === 'own'), false)
})

test('an explicit new payment date overrides a saved period for a new-year preview', () => {
  const own = payment('old-own', {
    period_start: currentPeriod.periodStart, period_end: currentPeriod.periodEnd,
    paid_at: '2026-12-31T17:00:00.000Z',
  })
  const result = totals([own, payment('new-year-other')], { paymentDate: '2027-01-15' })
  assert.equal(result.paymentDate, '2027-01-15')
  assert.equal(result.priorYtdGross, 1000)
})

test('same-day actual confirmation timestamps stop at the saved payment and order equal timestamps by creation', () => {
  const sharedTime = '2027-01-15T18:30:00.000Z'
  const earlier = payment('earlier-created', {
    paid_at: sharedTime, created_at: '2027-01-15T18:00:00.000Z', total_labor: 300,
  })
  const own = payment('own', {
    period_start: currentPeriod.periodStart, period_end: currentPeriod.periodEnd,
    paid_at: sharedTime, created_at: '2027-01-15T18:10:00.000Z',
  })
  const laterCreated = payment('later-created', {
    period_start: '2026-12-21', period_end: '2026-12-27',
    paid_at: sharedTime, created_at: '2027-01-15T18:20:00.000Z', total_labor: 500,
  })
  const laterPaid = payment('later-paid', {
    period_start: '2026-12-14', period_end: '2026-12-20',
    paid_at: '2027-01-15T19:00:00.000Z', total_labor: 900,
  })
  assert.equal(totals([earlier, own, laterCreated, laterPaid], { paymentDate: undefined }).priorYtdGross, 300)
})

test('a selected NY-noon date keeps already issued same-day payments consistent between preview and reopening', () => {
  const priorDashboardPayment = payment('prior-dashboard', {
    paid_at: '2027-01-15T20:00:00.000Z',
    created_at: '2027-01-15T19:59:00.000Z', total_labor: 1000,
  })
  const selectedDatePayment = payment('details-selected-date', {
    period_start: currentPeriod.periodStart, period_end: currentPeriod.periodEnd,
    paid_at: '2027-01-15T17:00:00.000Z',
    created_at: '2027-01-15T21:00:00.000Z', total_labor: 600,
  })
  const laterDashboardPayment = payment('later-dashboard', {
    period_start: '2026-12-21', period_end: '2026-12-27',
    paid_at: '2027-01-15T22:01:00.000Z',
    created_at: '2027-01-15T22:00:00.000Z', total_labor: 900,
  })

  const preview = totals([priorDashboardPayment], { paymentDate: '2027-01-15' })
  const reopened = totals([priorDashboardPayment, selectedDatePayment, laterDashboardPayment], {
    paymentDate: undefined,
    now: new Date('2027-08-01T17:00:00.000Z'),
  })
  assert.equal(preview.priorYtdGross, 1000)
  assert.equal(reopened.priorYtdGross, preview.priorYtdGross)
  assert.deepEqual(reopened.priorPayments.map((row) => row.id), ['prior-dashboard'])
})

test('a new payment includes existing payments on its pay date regardless of work-period order', () => {
  const earlierPaymentForLaterWork = payment('later-work', {
    period_start: '2027-02-01', period_end: '2027-02-07', paid_at: '2027-01-15T17:00:00.000Z',
  })
  assert.equal(totals([earlierPaymentForLaterWork]).priorYtdGross, 1000)
})

test('reprints exclude their own exact period and employee totals stay separate', () => {
  const own = payment('own', {
    period_start: currentPeriod.periodStart, period_end: currentPeriod.periodEnd, total_labor: 9000,
  })
  const anotherEmployee = payment('another', { employee_id: 'employee-nj-2', total_labor: 8000 })
  assert.equal(totals([own, anotherEmployee, payment('prior')]).priorYtdGross, 1000)
})

test('a corrected duplicate is normalized before year filtering so the old version cannot leak back', () => {
  const old = payment('old-version', {
    paid_at: '2026-12-31T17:00:00.000Z', created_at: '2026-12-31T17:01:00.000Z', total_labor: 500,
  })
  const corrected = payment('corrected-version', {
    paid_at: '2027-01-01T17:00:00.000Z', created_at: '2027-01-02T17:00:00.000Z', total_labor: 600,
  })
  assert.equal(totals([old, corrected], { paymentDate: '2026-12-31' }).priorYtdGross, 0)
  assert.equal(totals([old, corrected], { paymentDate: '2027-01-15' }).priorYtdGross, 600)
})

test('missing and invalid paid_at never borrow a payment year from created_at or work dates', () => {
  const missing = payment('missing', { paid_at: null, total_labor: 500 })
  const invalid = payment('invalid', {
    period_start: '2026-12-21', period_end: '2026-12-27', paid_at: 'not-a-date', total_labor: 700,
  })
  const result = totals([missing, invalid])
  assert.equal(result.priorYtdGross, 0)
  assert.equal(result.priorPayments.length, 0)
})

test('new-year YTD input resets Social Security and additional Medicare under the existing tax rules', async () => {
  const taxPath = new URL('../src/lib/payrollTaxMath.js', import.meta.url)
  const mathPath = new URL('../src/utils/payrollMath.js', import.meta.url)
  const taxSource = (await readFile(taxPath, 'utf8'))
    .replace("from '../utils/payrollMath'", `from '${mathPath.href}'`)
  const { calculatePaystubDetails } = await import('data:text/javascript;base64,' + Buffer.from(taxSource).toString('base64'))
  const oldYear = payment('old-year', {
    period_start: '2026-12-14', period_end: '2026-12-20',
    paid_at: '2026-12-31T17:00:00.000Z', total_labor: 200000,
  })
  const nextYearInput = totals([oldYear], {
    periodStart: '2026-12-21', periodEnd: '2026-12-27', paymentDate: '2027-01-01',
  })
  const calculated = calculatePaystubDetails({
    employee: { pay_type: 'one_time', monthly_salary: 1000, employer_form: 'W2' },
    periodStart: '2026-12-21', periodEnd: '2026-12-27',
    priorYtdGross: nextYearInput.priorYtdGross,
  })
  assert.equal(calculated.employeeTaxes.find((row) => row.key === 'socialSecurity').amount, 62)
  assert.equal(calculated.employeeTaxes.find((row) => row.key === 'medicare').amount, 14.5)
  assert.equal(calculated.ytdGrossPay, 1000)
})

function historyClient(rows, { errorOnPage = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      assert.equal(table, 'employee_payments')
      let employeeIds
      let first = 0
      let last = Infinity
      const query = {
        select(columns) { assert.match(columns, /paid_at/); return this },
        in(column, ids) { assert.equal(column, 'employee_id'); employeeIds = ids; return this },
        order(column) { assert.equal(column, 'id'); return this },
        range(start, end) { first = start; last = end; return this },
        async execute() {
          calls.push({ first, last, employeeIds })
          if (calls.length === errorOnPage) return { data: null, error: { message: 'history unavailable' } }
          const scoped = rows.filter((row) => !employeeIds || employeeIds.includes(row.employee_id))
          return { data: scoped.slice(first, Math.min(last + 1, first + 1000)), error: null }
        },
        then(resolve, reject) { return this.execute().then(resolve, reject) },
      }
      return query
    },
  }
}

test('history loader paginates beyond the server row cap and preserves all matching payments', async () => {
  const rows = Array.from({ length: 1207 }, (_, index) => payment(String(index).padStart(5, '0'), {
    period_start: `period-${index}`, period_end: `period-${index}`,
  }))
  rows.push(payment('unrelated', { employee_id: 'other-employee' }))
  const client = historyClient(rows)
  const result = await loadPayrollPaymentHistory(client, { employeeIds: [employeeId] })
  assert.equal(result.length, 1207)
  assert.deepEqual(client.calls.map(({ first, last }) => [first, last]), [[0, 499], [500, 999], [1000, 1499]])
  assert.equal(result.some((row) => row.employee_id !== employeeId), false)
})

test('history loader fails rather than silently calculating a partial YTD', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => payment(String(index)))
  const client = historyClient(rows, { errorOnPage: 2 })
  await assert.rejects(loadPayrollPaymentHistory(client, { employeeIds: [employeeId] }),
    (error) => error.message === 'history unavailable')
})
