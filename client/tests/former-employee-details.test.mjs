import assert from 'node:assert/strict'
import test from 'node:test'
import { formerPeriods, periodPayments, withinRange } from '../src/utils/formerEmployeeDetails.js'
const employee = { id: 'former', active: false, employee_number: 5, hire_date: '2023-01-01' }
const log = (work_date, extra = {}) => ({ employee_id: 'former', work_date, reg_hours: 8, ...extra })
test('saved hire, actual last work, deleted and reused number isolation', () => {
  const [period] = formerPeriods(employee, [], [log('2023-01-04'), log('2023-01-06'), log('2023-01-09', { is_deleted: true }), log('2025-01-01', { employee_id: 'new-owner' })])
  assert.equal(period.hire_date, '2023-01-01'); assert.equal(period.termination_date, '2023-01-06')
  assert.equal(period.logs.length, 2)
  assert.equal(withinRange('2022-12-31', '2023-01-06', period.rangeStart, period.rangeEnd), false)
  assert.equal(withinRange('2023-01-01', '2023-01-07', period.rangeStart, period.rangeEnd), false)
  assert.equal(withinRange('2023-01-06', '2023-01-01', period.rangeStart, period.rangeEnd), false)
})
test('missing dates use actual work only; empty and invalid dates stay unknown', () => {
  assert.equal(formerPeriods({ ...employee, hire_date: null }, [], [log('2023-01-04')])[0].hire_date, '2023-01-04')
  const [period] = formerPeriods({ ...employee, hire_date: '2023-02-30' }, [], [])
  assert.equal(period.hire_date, null); assert.equal(period.termination_date, null)
  assert.equal(periodPayments([{ employee_id: employee.id, period_start: '2023-01-01', period_end: '2023-01-08', net_pay: 123 }], employee.id, period, '', '').length, 1)
})
test('rehire engagements and payroll are separate, saved amounts preserved', () => {
  const periods = formerPeriods(employee, [{ id: 1, employee_id: employee.id, employee_number: 5, hire_date: '2023-01-01', termination_date: '2023-01-31' }, { id: 2, employee_id: employee.id, employee_number: 9, hire_date: '2024-01-01', termination_date: '2024-01-31' }], [log('2023-01-30'), log('2024-01-30')])
  assert.deepEqual(periods.map(p => p.logs.length), [1, 1])
  assert.deepEqual(periods.map(p => p.employee_number), [5, 9])
  const rows = [{ employee_id: employee.id, period_start: '2023-01-01', period_end: '2023-01-08', net_pay: 123 }, { employee_id: 'new-owner', period_start: '2023-01-01', period_end: '2023-01-08', net_pay: 999 }]
  assert.equal(periodPayments(rows, employee.id, periods[0], periods[0].rangeStart, periods[0].rangeEnd)[0].net_pay, 123)
  assert.equal(periodPayments(rows, employee.id, periods[1], periods[1].rangeStart, periods[1].rangeEnd).length, 0)
})

test('plant transfers retain one engagement and payroll across the assignment cutover', () => {
  const original = { id: 1, employee_id: employee.id, employee_number: 31, plant_location: 'PA',
    hire_date: null, recorded_at: '2025-01-01', termination_date: '2023-01-10' }
  const transferred = { id: 2, employee_id: employee.id, employee_number: 4, plant_location: 'NJ',
    hire_date: '2023-01-10', termination_date: '2023-01-31', transferred_from_period_id: 1 }
  const rehire = { id: 3, employee_id: employee.id, employee_number: 9, plant_location: 'PA',
    hire_date: '2024-01-01', termination_date: '2024-01-31' }
  const [first, second] = formerPeriods({ ...employee, hire_date: rehire.hire_date }, [rehire, transferred, original], [
    log('2023-01-03', { id: 'pre-transfer-untagged' }),
    log('2023-01-09', { id: 'pre-transfer', employment_period_id: '1' }),
    log('2023-01-19', { id: 'post-transfer', employment_period_id: 2 }),
    log('2024-01-30', { id: 'rehire', employment_period_id: 3 }),
  ])
  assert.equal(first.hire_date, '2023-01-03')
  assert.equal(first.termination_date, '2023-01-19')
  assert.equal(first.recordedEnd, '2023-01-31')
  assert.equal(first.employee_number, 4)
  assert.equal(first.plant_location, 'NJ')
  assert.deepEqual(first.logs.map(row => row.id), ['pre-transfer-untagged', 'pre-transfer', 'post-transfer'])
  assert.deepEqual(second.logs.map(row => row.id), ['rehire'])
  const payments = [
    { id: 'crossing-transfer', employee_id: employee.id, employment_period_id: '1', period_start: '2023-01-08', period_end: '2023-01-14', net_pay: 123 },
    { id: 'destination', employee_id: employee.id, employment_period_id: 2, period_start: '2023-01-15', period_end: '2023-01-19', net_pay: 456 },
    { id: 'rehire', employee_id: employee.id, employment_period_id: 3, period_start: '2024-01-01', period_end: '2024-01-07', net_pay: 789 },
  ]
  assert.deepEqual(periodPayments(payments, employee.id, first, '', '').map(row => [row.id, row.net_pay]),
    [['crossing-transfer', 123], ['destination', 456]])
  assert.deepEqual(periodPayments(payments, employee.id, second, '', '').map(row => row.id), ['rehire'])
})
