import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPayrollPrintConfirmation,
  savePrintedPayrollRows,
} from '../src/utils/payrollPrint.js'
import { getPayrollPaymentDate } from '../src/utils/payrollYtd.js'

function mockDatabase() {
  const calls = []
  let number = 12520
  return {
    calls,
    async rpc(name, payload) {
      calls.push({ name, payload })
      return { data: name === 'create_payroll_check' ? { id: `check-${++number}`, check_number: number } : {}, error: null }
    },
    from(table) {
      return {
        select() { return this }, eq() { return this }, order() { return this },
        async limit() { return { data: [], error: null } },
        async insert(payload) { calls.push({ table, payload }); return { error: null } },
        update(payload) {
          return { async eq(column, value) { calls.push({ table, payload, column, value }); return { error: null } } }
        },
      }
    },
  }
}

const week = { startText: '2026-12-21', endText: '2026-12-27' }
const row = (id, paymentDate, netPay = 500) => ({
  employee: { id }, paymentDate,
  checkTotals: { mainHours: 40, mainLabor: 600, totalLabor: 600, employeeTaxNum: 100, netPay },
})

test('preview does not write; confirmation stores each selected date, with one issuance for concurrent clicks and reprints', async () => {
  const database = mockDatabase()
  const rows = [row('nj', '2026-12-31'), row('pa', '2027-01-02')]
  const confirm = createPayrollPrintConfirmation(async (chosen) => {
    await savePrintedPayrollRows(database, week, chosen)
    return chosen
  })
  assert.equal(database.calls.length, 0)
  const first = confirm(rows)
  assert.equal(confirm(rows), first)
  assert.equal(await first, rows)
  assert.equal(confirm(rows), first)
  await confirm(rows)
  assert.equal(database.calls.filter((call) => call.name === 'create_payroll_check').length, 2)
  assert.deepEqual(database.calls.filter((call) => call.table === 'employee_payments').map((call) => [
    call.payload.employee_id, getPayrollPaymentDate(call.payload.paid_at), call.payload.net_pay,
  ]), [['nj', '2026-12-31', 500], ['pa', '2027-01-02', 500]])
  assert.deepEqual(rows.map((item) => item.employee.last_payment_date), ['2026-12-31', '2027-01-02'])
  assert.deepEqual(rows.map((item) => item.print_check_number), [12521, 12522])
})

test('company check preserves combined totals and assigns its chosen date to every employee payment', async () => {
  const database = mockDatabase()
  const sources = [row('a', '2026-11-12', 500), row('b', '2026-11-12', 500)]
  const company = {
    employee: { id: 'company-test' }, grouped_company: true, grouped_items: sources,
    paymentDate: '2026-11-12', checkTotals: { totalLabor: 1200, employeeTaxNum: 200, netPay: 1000 },
  }
  await createPayrollPrintConfirmation(async (rows) => savePrintedPayrollRows(database, week, rows))([company])
  const created = database.calls.filter((call) => call.name === 'create_payroll_check')
  assert.equal(created.length, 1)
  assert.equal(created[0].payload.p_net_pay, 1000)
  assert.deepEqual(database.calls.filter((call) => call.table === 'employee_payments').map((call) => [
    call.payload.employee_id, getPayrollPaymentDate(call.payload.paid_at), call.payload.net_pay,
  ]), [['a', '2026-11-12', 500], ['b', '2026-11-12', 500]])
})

test('missing, invalid, or inconsistent company dates reject the entire batch before writes', async () => {
  let writes = 0
  const confirm = createPayrollPrintConfirmation(() => { writes += 1 })
  for (const invalid of ['', '2026-02-30']) {
    await assert.rejects(confirm([row('a', '2026-11-12'), row('b', invalid)]), /valid date/)
  }
  await assert.rejects(confirm([{
    ...row('company', '2026-11-12'), grouped_company: true, grouped_items: [row('a', '2026-11-13')],
  }]), /valid date/)
  assert.equal(writes, 0)
})

test('a failed confirmation never automatically issues a second batch', async () => {
  let writes = 0
  const confirm = createPayrollPrintConfirmation(() => {
    writes += 1
    throw new Error('Simulated connection loss after issuing a check')
  })
  const rows = [row('a', '2026-11-12')]
  await assert.rejects(confirm(rows), /connection loss/)
  await assert.rejects(confirm(rows), /connection loss/)
  assert.equal(writes, 1)
})
