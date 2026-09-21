import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAutomaticDowntimeHours,
  normalizePayrollRow,
} from '../src/utils/payrollMath.js'

test('automatic downtime is 0 below 9 hours and 1 at 9 hours or more', () => {
  assert.equal(getAutomaticDowntimeHours('07:00', '15:59', true), 0)
  assert.equal(getAutomaticDowntimeHours('07:00', '16:00', true), 1)
  assert.equal(getAutomaticDowntimeHours('07:00', '19:00', true), 1)
})

test('automatic downtime handles overnight shifts', () => {
  assert.equal(getAutomaticDowntimeHours('19:00', '03:59', true), 0)
  assert.equal(getAutomaticDowntimeHours('19:00', '04:00', true), 1)
  assert.equal(getAutomaticDowntimeHours('19:00', '07:00', true), 1)
})

test('automatic downtime is always 0 when disabled', () => {
  assert.equal(getAutomaticDowntimeHours('07:00', '19:00', false), 0)
})

test('payroll normalization replaces stale stored downtime with the automatic rule', () => {
  const employee = {
    pay_type: 'hourly',
    hourly_rate: 20,
    downtime_enabled: true,
    default_lunch_hours: 1,
  }

  const shortShift = normalizePayrollRow(
    {
      source: 'zkt',
      time_in: '07:00',
      time_out: '15:00',
      downtime_hours: 1,
      lunch_hours: 1,
    },
    employee
  )

  assert.equal(shortShift.downtime_hours, 0)
  assert.equal(shortShift.reg_hours, 7)

  const longShift = normalizePayrollRow(
    {
      source: 'zkt',
      time_in: '07:00',
      time_out: '16:00',
      downtime_hours: 0,
      lunch_hours: 1,
    },
    employee
  )

  assert.equal(longShift.downtime_hours, 1)
  assert.equal(longShift.reg_hours, 7)
})


test('manual downtime override is preserved', () => {
  const employee = {
    pay_type: 'hourly',
    hourly_rate: 20,
    downtime_enabled: true,
    default_lunch_hours: 1,
  }

  const overridden = normalizePayrollRow(
    {
      source: 'manual_downtime',
      time_in: '07:00',
      time_out: '15:00',
      downtime_hours: 0.5,
      lunch_hours: 1,
    },
    employee
  )

  assert.equal(overridden.downtime_hours, 0.5)
  assert.equal(overridden.reg_hours, 6.5)
})

test('legacy manual rows still use the automatic rule unless explicitly overridden', () => {
  const employee = {
    pay_type: 'hourly',
    hourly_rate: 20,
    downtime_enabled: true,
    default_lunch_hours: 1,
  }

  const legacyManual = normalizePayrollRow(
    {
      source: 'manual',
      time_in: '07:00',
      time_out: '15:00',
      downtime_hours: 1,
      lunch_hours: 1,
    },
    employee
  )

  assert.equal(legacyManual.downtime_hours, 0)
  assert.equal(legacyManual.reg_hours, 7)
})
