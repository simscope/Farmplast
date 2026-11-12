import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveDates, employmentDuration } from '../src/utils/formerEmployeeDates.js'

test('profile and own employment history take precedence over attendance fallback', () => {
  const employee = { id: 'former-uuid', employee_number: 7, hire_date: '2020-03-01' }
  const periods = [{ id: 1, employee_id: employee.id, hire_date: '2020-02-01', termination_date: '2021-03-01' }]
  assert.equal(archiveDates(employee, periods, '2019-01-01', '2021-02-28').hire_date, '2020-03-01')
  assert.equal(archiveDates({ ...employee, hire_date: null }, periods, '2019-01-01').hire_date, '2020-02-01')
  assert.equal(archiveDates({...employee,hire_date:new Date('2020-03-01T04:00:00Z')},periods,'2019-01-01').hire_date,'2020-03-01')
})

test('another UUID sharing a number cannot provide employment dates', () => {
  const employee = { id: 'former-uuid', employee_number: 7, active: false }
  const otherHistory = [{ id: 99, employee_id: 'other-uuid', employee_number: 7, hire_date: '2010-01-01', termination_date: '2025-01-01' }]
  const result = archiveDates(employee, otherHistory, '2020-03-01', '2021-02-28')
  assert.equal(result.hire_date, '2020-03-01')
  assert.equal(result.termination_date, '2021-02-28')
  assert.equal(employmentDuration(result), '364 days')
})

test('inactive termination uses last work date, never unrelated timestamps', () => {
  const result = archiveDates({ id: 'former-uuid', active: false, updated_at: '2026-10-11' }, [
    { id: 1, employee_id: 'former-uuid', recorded_at: '2026-10-11', hire_date: '2020-01-01' },
  ], '2020-01-01', '2025-12-31')
  assert.equal(result.termination_date, '2025-12-31')
  assert.equal(employmentDuration(result), '2191 days')
  assert.equal(archiveDates({id:'former-uuid',active:false,termination_date:'2025-01-01'},[],null,null).termination_date,null)
})

test('active employee does not inherit a previous period termination date', () => {
  const result = archiveDates({ id: 'former-uuid', active: true }, [
    { id: 1, employee_id: 'former-uuid', hire_date: '2020-01-01', termination_date: '2020-06-01' },
    { id: 2, employee_id: 'former-uuid', hire_date: '2021-01-01', termination_date: null },
  ], '2020-01-01')
  assert.equal(result.hire_date, '2021-01-01')
  assert.equal(result.termination_date, null)
})

test('earlier recorded termination is retained pending historical correction review', () => {
  const result=archiveDates({id:'former-uuid',active:false,termination_date:'2025-01-01'},[],'2020-01-01','2025-02-01')
  assert.equal(result.termination_date,'2025-01-01')
  assert.equal(result.termination_needs_review,true)
})

test('duration uses calendar dates across daylight saving and rejects missing or invalid dates', () => {
  assert.equal(employmentDuration({ hire_date: '2026-03-07', termination_date: '2026-03-09' }), '2 days')
  assert.equal(employmentDuration({ hire_date: '2026-02-30', termination_date: '2026-03-09' }), 'Not recorded')
  assert.equal(employmentDuration({ hire_date: '2026-03-10', termination_date: '2026-03-09' }), 'Not recorded')
})
