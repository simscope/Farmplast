// Local browser verification with synthetic records. No production requests.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
const require = createRequire(import.meta.url)
const { chromium } = require('../../../safety-validation/node_modules/playwright-core')
process.env.VITE_SUPABASE_URL = 'https://archive-test.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'synthetic-test-key'
const output = new URL('../../../reports/former-employees/', import.meta.url)
await mkdir(output, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const context = await browser.newContext()
  const id = '00000000-0000-0000-0000-000000000001'
  const former = { id: '00000000-0000-0000-0000-000000000003', employee_number: 3,
    first_name: 'Peter', last_name: 'Archive Test', active: false, plant_location: 'NJ', position: 'Operator',
    hire_date: '2024-01-01', termination_date: '2025-01-01', termination_reason: 'Resigned' }
  const active = { ...former, id: '00000000-0000-0000-0000-000000000004', employee_number: 4, first_name: 'Robert', active: true, termination_date: null }
  await context.addInitScript(({ id }) => {
    localStorage.setItem('sb-archive-test-auth-token', JSON.stringify({ access_token: 'synthetic-token', refresh_token: 'synthetic-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
      user: { id, email: 'test@example.invalid', user_metadata: { role: 'admin' } } }))
  }, { id })
  const requests = []
  await context.route('https://archive-test.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    requests.push(`${route.request().method()} ${url.pathname}${url.search}`)
    let data = []
    if (url.pathname.endsWith('/profiles')) data = { id, role: 'admin' }
    else if (url.pathname.endsWith('/employees')) {
      if (url.searchParams.has('id')) data = former
      else data = url.searchParams.get('active') === 'eq.true' ? [active] : [former]
    } else if (url.pathname.endsWith('/employee_work_logs')) data = [{ id: 1, employee_id: former.id, work_date: '2024-12-31', time_in: '08:00', time_out: '16:00', approved: true, reg_hours: 8, labor_amount: 160 }]
    else if (url.pathname.endsWith('/employee_employment_periods')) data = [{ id: 1, employee_id: former.id, employee_number: 3, hire_date: '2024-01-01', termination_date: '2025-01-01', position: 'Operator', plant_location: 'NJ', hourly_rate: 20 }]
    else if (url.pathname.endsWith('/rpc/employee_lifecycle_blockers')) data = ['NJ/PA terminal acknowledgement pending']
    else if (url.pathname.endsWith('/employee_tax_profiles')) data = null
    else if (url.pathname.endsWith('/auth/v1/user')) data = { id, user_metadata: { role: 'admin' } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('http://127.0.0.1:5187/employees/former')
    await page.getByText('1 Former Employees · 1 shown').waitFor()
    assert.equal(await page.getByRole('row').count(), 2)
    await page.getByRole('textbox', { name: 'Search former employees' }).fill('3')
    assert.equal(await page.getByRole('row').count(), 2)
    await page.getByRole('textbox', { name: 'Search former employees' }).fill('Robert')
    await page.getByText('No former employees match these filters.').waitFor()
    await page.getByRole('textbox', { name: 'Search former employees' }).fill('')
    await page.getByRole('combobox', { name: 'Plant filter' }).selectOption('PA')
    await page.getByText('No former employees match these filters.').waitFor()
    await page.getByRole('combobox', { name: 'Plant filter' }).selectOption('')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false, 'Only the table should scroll horizontally')
    await page.screenshot({ path: new URL(viewport.width > 400 ? 'desktop.png' : 'mobile.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true })
  }
  await page.getByRole('link', { name: 'View', exact: true }).click()
  await page.getByRole('heading', { name: /Employment history/ }).waitFor()
  await page.getByText('NJ/PA terminal acknowledgement pending').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Rehire', exact: true }).isDisabled(), true)
  assert.ok(requests.some(value => value.includes(`employee_id=eq.${former.id}`)), 'History must be fetched by UUID')
  await page.goto('http://127.0.0.1:5187/employees')
  await page.getByRole('heading', { name: 'Active Employees', exact: true }).waitFor()
  await page.getByText('Robert Archive Test', { exact: true }).waitFor()
  assert.equal(await page.getByText('Peter Archive Test', { exact: true }).count(), 0)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify({ desktop: 'passed', mobile: 'passed', searchAndFilter: 'passed', uuidHistory: 'passed', rehireGate: 'passed', activeList: 'passed', pageErrors: errors }))
} finally { await browser?.close(); await server.close() }
