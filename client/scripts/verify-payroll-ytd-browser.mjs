// Synthetic UI regression only. No production credentials, traffic, or data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'

const require = createRequire('C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const appOrigin = 'http://127.0.0.1:4187'
const apiOrigin = 'http://127.0.0.1:4188'
const outputDir = new URL('../../../reports/nj-payroll-20261109/browser-ytd/', import.meta.url)
await fs.mkdir(outputDir, { recursive: true })
const adminId = '00000000-0000-4000-8000-000000000001'
const employeeId = '00000000-0000-4000-8000-000000000101'
const checkId = '00000000-0000-4000-8000-000000009999'
const user = { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', user_metadata: { role: 'admin' } }
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: adminId, exp: 4102444800 })).toString('base64url'), 'synthetic'].join('.')
const employee = {
  id: employeeId, employee_number: 1, first_name: 'Synthetic', last_name: 'Payroll',
  active: true, hire_date: '2026-01-01', plant_location: 'NJ', position: 'worker',
  pay_type: 'hourly', hourly_rate: 20, monthly_salary: 0, employer_form: 'W2',
  downtime_enabled: false, overtime_enabled: true, default_lunch_hours: 1,
  zkt_enabled: false, shift_type: 'day',
}
const taxProfile = { employee_id: employeeId, federal_filing_status: 'single', nj_withholding_rate: 'A', nj_allowances: 0 }
const flags = { former_employees_archive_readonly: true, employee_terminate: false, employee_rehire: false, employee_number_reuse: false }
const oldPayment = {
  id: '00000000-0000-4000-8000-000000000201', employee_id: employeeId,
  period_start: '2026-12-07', period_end: '2026-12-13', paid_at: '2026-12-18T17:00:00Z',
  created_at: '2026-12-18T17:00:00Z', total_labor: 200000, employee_tax: 30000,
  rent: 0, electric: 0, water: 0, clean: 0, transport: 0, net_pay: 170000,
}
const januaryPayment = {
  ...oldPayment, id: '00000000-0000-4000-8000-000000000202',
  period_start: '2026-12-21', period_end: '2026-12-27', paid_at: '2027-01-01T17:00:00Z',
  created_at: '2027-01-01T17:00:00Z', total_labor: 1000, employee_tax: 200, net_pay: 800,
}
function logsFor(start) {
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return {
      id: `fixture-log-${index}`, employee_id: employeeId, work_date: date.toISOString().slice(0, 10),
      time_in: '08:00:00', time_out: '16:00:00', lunch_hours: 1, downtime_hours: 0,
      source: 'zkt', manually_edited: false, reg_hours: 7, labor_amount: 140,
    }
  })
}

function filtered(rows, url) {
  return rows.filter((row) => {
    for (const [field, raw] of url.searchParams) {
      if (!['id', 'employee_id', 'period_start', 'period_end', 'work_date', 'active', 'status'].includes(field)) continue
      const dot = raw.indexOf('.')
      const operator = raw.slice(0, dot), value = raw.slice(dot + 1)
      const actual = String(row[field])
      if (operator === 'eq' && actual !== value) return false
      if (operator === 'gte' && actual < value) return false
      if (operator === 'lte' && actual > value) return false
      if (operator === 'in' && !value.slice(1, -1).split(',').includes(actual)) return false
    }
    return true
  }).slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit') || 10000))
}

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
const results = []
async function fixture({ clock, logs, payments, failFirstPayment = false, loseFirstConfirmation = false }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York', serviceWorkers: 'block' })
  const state = { payments: structuredClone(payments), logs: structuredClone(logs), drafts: [], updates: [], confirmations: [], checkReads: [], paymentWrites: [], unexpected: [], pageErrors: [], clock }
  const page = await context.newPage()
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await page.clock.setFixedTime(new Date(clock))
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }))
    window.__syntheticPrintCalls = 0
    window.print = () => { window.__syntheticPrintCalls += 1 }
  }, { token, user })
  await context.routeWebSocket('**/*', (socket) => {
    if (socket.url().startsWith('ws://127.0.0.1:4187/')) socket.connectToServer()
    else socket.close({ code: 1008, reason: 'Synthetic test blocks external WebSockets' })
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    if (url.origin === appOrigin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin !== apiOrigin && url.origin !== appOrigin) {
      state.unexpected.push(url.origin)
      return route.abort('blockedbyclient')
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    let data = []
    const resource = url.pathname.split('/').at(-1)
    if (url.pathname.startsWith('/api/')) data = { records: [], assignments: [], group_assignments: [], next_offset: null }
    else if (url.pathname.includes('/auth/')) data = user
    else if (resource === 'profiles') data = [{ id: adminId, role: 'admin', full_name: 'Synthetic Admin' }]
    else if (resource === 'employee_feature_flags_status') data = flags
    else if (resource === 'employee_archive_capabilities') data = { lifecycle: false }
    else if (resource === 'employees') {
      assert.equal(method, 'GET', 'This regression must not update employees')
      data = filtered([employee], url)
    } else if (resource === 'employee_tax_profiles') data = [taxProfile]
    else if (resource === 'employee_work_logs') {
      assert.equal(method, 'GET', 'This regression must not update attendance')
      data = filtered(state.logs, url)
    } else if (resource === 'employee_payroll_deductions') data = []
    else if (resource === 'employee_payments') {
      if (method === 'GET') data = filtered(state.payments, url)
      else if (method === 'POST') {
        const payload = JSON.parse(request.postData())
        state.paymentWrites.push(payload)
        if (failFirstPayment && state.paymentWrites.length === 1) return route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic payment history failure', code: 'FIXTURE_FAILURE' }) })
        state.payments.push({ ...payload, id: '00000000-0000-4000-8000-000000000299', created_at: clock })
        data = []
      } else throw new Error(`Unexpected payment mutation: ${method}`)
    } else if (resource === 'create_payroll_check') {
      const payload = JSON.parse(request.postData())
      state.drafts.push(payload)
      state.draft = { ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key.replace(/^p_/, ''), value])), id: checkId, check_number: 12345, status: 'draft', created_at: clock }
      data = state.draft
    } else if (resource === 'payroll_checks' && method === 'GET') {
      state.checkReads.push(url.search)
      data = filtered(state.draft ? [state.draft] : [], url)
    } else if (resource === 'payroll_checks' && method === 'PATCH') {
      assert.equal(url.searchParams.get('status'), 'eq.draft')
      const payload = JSON.parse(request.postData())
      state.updates.push(payload)
      state.draft = { ...state.draft, ...payload }
      data = [{ id: checkId }]
    } else if (resource === 'mark_payroll_check_printed') {
      state.confirmations.push(JSON.parse(request.postData()))
      state.draft = { ...state.draft, status: 'printed', printed_at: clock, printed_confirmed_at: clock }
      if (loseFirstConfirmation && state.confirmations.length === 1) return route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic lost response after confirmation commit', code: 'FIXTURE_LOST_RESPONSE' }) })
      data = state.draft
    } else if (resource === 'void_payroll_check') throw new Error('Confirmed check must not be voided by retry/print')
    if (request.headers().accept?.includes('vnd.pgrst.object') && Array.isArray(data)) data = data[0] || null
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) })
  })
  return { context, page, state }
}

try {
  {
    const own = { ...januaryPayment, id: '00000000-0000-4000-8000-000000000203', period_start: '2026-12-28', period_end: '2027-01-03', paid_at: '2027-01-08T17:00:00Z', created_at: '2027-01-08T17:00:00Z', total_labor: 700 }
    const { context, page, state } = await fixture({ clock: '2027-01-11T15:00:00Z', logs: logsFor('2026-12-28'), payments: [oldPayment, januaryPayment, own] })
    await page.goto(`${appOrigin}/employees/${employeeId}/paystub?periodStart=2026-12-28&periodEnd=2027-01-03`)
    await page.getByText('YTD gross before this check: $1,000.00', { exact: true }).waitFor()
    assert.match(await page.getByRole('button', { name: /^Gross earnings/ }).innerText(), /\$700\.00\s+\$1,700\.00/)
    await page.screenshot({ path: new URL('paystub-january-desktop.png', outputDir).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.getByText('YTD gross before this check: $1,000.00', { exact: true }).count(), 1)
    await page.screenshot({ path: new URL('paystub-january-mobile.png', outputDir).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })
    assert.deepEqual(state.pageErrors, [])
    assert.deepEqual(state.unexpected, [])
    assert.equal(state.paymentWrites.length, 0)
    results.push({ check: 'paystub: December work paid January included; December payment excluded; own check not duplicated', passed: true, desktop: 1440, mobile: 390, priorYtdGross: 1000, ytdAfterCheck: 1700 })
    await context.close()
  }
  {
    const firstJanuary = { ...januaryPayment, total_labor: 700 }
    const { context, page, state } = await fixture({ clock: '2027-01-04T15:00:00Z', logs: logsFor('2026-12-21'), payments: [oldPayment, firstJanuary] })
    await page.goto(`${appOrigin}/employees/${employeeId}/paystub?periodStart=2026-12-21&periodEnd=2026-12-27`)
    await page.getByText('YTD gross before this check: $0.00', { exact: true }).waitFor()
    assert.match(await page.getByRole('button', { name: /^Gross earnings/ }).innerText(), /\$700\.00\s+\$700\.00/)
    assert.deepEqual(state.pageErrors, [])
    assert.deepEqual(state.unexpected, [])
    results.push({ check: 'paystub: first January payment resets prior YTD and adds current check once', passed: true, priorYtdGross: 0, ytdAfterCheck: 700 })
    await context.close()
  }
  {
    const { context, page, state } = await fixture({ clock: '2026-12-31T15:00:00Z', logs: logsFor('2026-12-21'), payments: [oldPayment], failFirstPayment: true })
    await page.goto(`${appOrigin}/employees/${employeeId}`)
    await page.getByRole('heading', { name: 'Synthetic Payroll', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Pay & Print', exact: true }).click()
    await page.getByRole('heading', { name: 'Print preview', exact: true }).waitFor()
    const modal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Print preview', exact: true }) })
    const date = modal.getByLabel('Date', { exact: true })
    const amount = modal.getByLabel('Amount', { exact: true })
    assert.equal(await amount.inputValue(), '629.00')
    await date.fill('2027-01-04')
    await page.waitForFunction(() => [...document.querySelectorAll('input[type="number"]')].some((input) => input.value === '586.00'))
    assert.equal(await amount.inputValue(), '586.00')
    await modal.getByRole('button', { name: 'Print', exact: true }).click()
    const retry = modal.getByRole('button', { name: 'Retry Save and Print', exact: true })
    await retry.waitFor()
    await page.getByRole('alert').filter({ hasText: 'Check confirmed, but payment history was not saved.' }).waitFor()
    assert.equal(await date.isDisabled(), true)
    assert.equal(await amount.isDisabled(), true)
    assert.equal(await modal.getByRole('button', { name: 'Close', exact: true }).isDisabled(), true)
    assert.equal(state.updates.length, 1)
    assert.equal(state.confirmations.length, 1)
    assert.equal(state.paymentWrites.length, 1)
    assert.equal(state.drafts[0].p_employee_tax, 71.08)
    assert.equal(state.updates[0].employee_tax, 114.09)
    assert.equal(state.updates[0].net_pay, 586)
    assert.equal(state.paymentWrites[0].paid_at, '2027-01-04T17:00:00.000Z')
    await retry.click()
    await page.waitForFunction(() => window.__syntheticPrintCalls === 1)
    assert.equal(state.paymentWrites.length, 2)
    assert.deepEqual(state.paymentWrites[1], state.paymentWrites[0])
    assert.equal(state.confirmations.length, 1)
    assert.equal(state.updates.length, 1)
    const snapshot = JSON.stringify(state.payments)
    await modal.getByRole('button', { name: 'Print', exact: true }).click()
    await page.waitForFunction(() => window.__syntheticPrintCalls === 2)
    assert.equal(state.paymentWrites.length, 2)
    assert.equal(state.confirmations.length, 1)
    assert.equal(state.updates.length, 1)
    assert.equal(JSON.stringify(state.payments), snapshot)
    assert.deepEqual(state.pageErrors, [])
    assert.deepEqual(state.unexpected, [])
    await page.screenshot({ path: new URL('details-cross-year-retry.png', outputDir).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })
    results.push({ check: 'Details: selected pay year refreshes draft tax/net; failed save retries identical payload; repeat Print writes no history', passed: true, taxBefore: 71.08, taxAfter: 114.09, netAfter: 586, confirmations: 1, paymentWriteAttempts: 2 })
    await context.close()
  }
  {
    const { context, page, state } = await fixture({ clock: '2026-12-31T15:00:00Z', logs: logsFor('2026-12-21'), payments: [oldPayment], loseFirstConfirmation: true })
    await page.goto(`${appOrigin}/employees/${employeeId}`)
    await page.getByRole('heading', { name: 'Synthetic Payroll', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Pay & Print', exact: true }).click()
    await page.getByRole('heading', { name: 'Print preview', exact: true }).waitFor()
    const modal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Print preview', exact: true }) })
    await modal.getByLabel('Date', { exact: true }).fill('2027-01-04')
    await page.waitForFunction(() => [...document.querySelectorAll('input[type="number"]')].some((input) => input.value === '586.00'))
    await modal.getByRole('button', { name: 'Print', exact: true }).click()
    const retry = modal.getByRole('button', { name: 'Retry Save and Print', exact: true })
    await retry.waitFor()
    await page.getByRole('alert').filter({ hasText: 'Check confirmation could not be verified.' }).waitFor()
    assert.equal(state.confirmations.length, 1)
    assert.equal(state.paymentWrites.length, 0)
    assert.equal(await modal.getByLabel('Date', { exact: true }).isDisabled(), true)
    await retry.click()
    await page.waitForFunction(() => window.__syntheticPrintCalls === 1)
    assert.equal(state.confirmations.length, 1, 'recovery must read the committed check instead of confirming it twice')
    assert.equal(state.checkReads.length, 1)
    assert.equal(state.updates.length, 1)
    assert.equal(state.paymentWrites.length, 1)
    assert.equal(state.paymentWrites[0].paid_at, '2027-01-04T17:00:00.000Z')
    assert.equal(state.paymentWrites[0].employee_tax, state.updates[0].employee_tax)
    assert.equal(state.paymentWrites[0].net_pay, state.updates[0].net_pay)
    assert.deepEqual(state.pageErrors, [])
    assert.deepEqual(state.unexpected, [])
    results.push({ check: 'Details: lost confirmation response recovers the already-printed check and saves the frozen payment without duplicate confirmation', passed: true, confirmations: 1, statusReads: 1, paymentWrites: 1 })
    await context.close()
  }
  const summary = { passed: true, mode: 'local UI with synthetic API only', checks: results }
  await fs.writeFile(new URL('summary.json', outputDir), JSON.stringify(summary, null, 2) + '\n')
  await fs.rm(new URL('failure.json', outputDir), { force: true })
  console.log(JSON.stringify(summary))
} catch (error) {
  await fs.writeFile(new URL('failure.json', outputDir), JSON.stringify({ passed: false, error: error.message, completed: results }, null, 2) + '\n')
  throw error
} finally {
  await browser.close()
}
