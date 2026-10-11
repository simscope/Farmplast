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
  const active = { ...former, id: '00000000-0000-0000-0000-000000000004', employee_number: 3, first_name: 'Robert', active: true, termination_date: null }
  await context.addInitScript(({ id }) => {
    localStorage.setItem('sb-archive-test-auth-token', JSON.stringify({ access_token: 'synthetic-token', refresh_token: 'synthetic-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
      user: { id, email: 'test@example.invalid', user_metadata: { role: 'admin' } } }))
  }, { id })
  const requests = []
  let actionsEnabled = true
  let archiveEnabled = true
  let advancedSchema = true
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
    else if (url.pathname.endsWith('/rpc/employee_archive_capabilities')) data = {lifecycle:advancedSchema,identity:advancedSchema}
    else if (url.pathname.endsWith('/rpc/employee_feature_flags_status')) data = {former_employees_archive_readonly:archiveEnabled,employee_terminate:actionsEnabled,employee_rehire:actionsEnabled,employee_number_reuse:false}
    else if (url.pathname.endsWith('/rpc/list_former_employees')) data = archiveEnabled ? [former] : []
    else if (url.pathname.endsWith('/rpc/employee_lifecycle_blockers')) data = actionsEnabled ? [] : ['Terminate/Rehire release gate is OFF']
    else if (url.pathname.endsWith('/rpc/next_available_employee_number')) data = 1
    else if (url.pathname.endsWith('/employee_number_reservations')) data = [{period_id:1,employee_number:3,released_at:null}]
    else if (url.pathname.endsWith('/employee_integration_operations')) data = [{id:'operation-nj',period_id:1,action:'disable',target:'NJ',status:'pending'},{id:'operation-pa',period_id:1,action:'disable',target:'PA',status:'failed',error:'Terminal unavailable; number reserved'}]
    else if (url.pathname.endsWith('/zkt_event_ownership')) data = [{event_id:1,zkt_identity_events:{device_key:'nj',local_timestamp:'2024-12-31T08:00:00',raw:{inOutMode:0}},zkt_identifier_history:{period_id:1}}]
    else if (url.pathname.endsWith('/zkt_identity_review')) data = [{event_id:2,reason:'Legacy event requires evidence',zkt_identity_events:{terminal_user_id:'3',local_timestamp:'2024-12-31T08:00:00',zkt_event_ownership:[]}}]
    else if (url.pathname.endsWith('/employee_tax_profiles')) data = null
    else if (url.pathname.endsWith('/auth/v1/user')) data = { id, user_metadata: { role: 'admin' } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await context.route('**/api/employee-safety-history',async route=>{
    assert.equal(route.request().postDataJSON().employee_id,former.id)
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({source_employee_id:former.id,records:[{id:'safety-1',title:'Retained safety check',session_date:'2024-12-01',completed_at:'2024-12-01T12:00:00Z',status:'completed',score:100}],assignments:[{id:'assignment-1',title:'Stored assignment',status:'completed',completed_at:'2024-12-01T12:00:00Z'}],group_assignments:[],next_offset:null})})
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
  await page.getByText('Terminal unavailable; number reserved').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Rehire', exact: true }).isEnabled(), true)
  await page.getByText('Retained safety check',{exact:true}).waitFor()
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Profile tables must stay within the viewport')
    await page.screenshot({path:new URL(viewport.width>400?'profile-desktop.png':'profile-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
  }
  await page.getByRole('button',{name:'Rehire',exact:true}).click()
  await page.getByText(/Suggested Employee Number: 1/).waitFor()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  actionsEnabled = false
  await page.reload()
  await page.getByText('Terminate/Rehire release gate is OFF',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Rehire',exact:true}).isEnabled(),false)
  await page.getByText('Retained safety check',{exact:true}).waitFor()
  assert.ok(requests.some(value => value.includes(`employee_id=eq.${former.id}`)), 'History must be fetched by UUID')
  await page.getByRole('link',{name:'Review unresolved ZKT events'}).click()
  await page.getByRole('heading',{name:'ZKT Attendance Review'}).waitFor()
  await page.getByText('Unassigned',{exact:true}).waitFor()
  await page.goto('http://127.0.0.1:5187/employees')
  await page.getByRole('heading', { name: 'Active Employees', exact: true }).waitFor()
  await page.getByText('Robert Archive Test', { exact: true }).waitFor()
  assert.equal(await page.getByText('Peter Archive Test', { exact: true }).count(), 0)
  advancedSchema = false
  const requestsBeforeArchive=requests.length
  await page.goto(`http://127.0.0.1:5187/employees/${former.id}`)
  await page.getByRole('heading',{name:/Employment history/}).waitFor()
  await page.getByText('Terminate/Rehire release gate is OFF',{exact:true}).waitFor()
  await page.getByText(/Verified device identity history is not enabled/).waitFor()
  assert.equal(await page.getByRole('button',{name:'Rehire',exact:true}).isEnabled(),false)
  assert.equal(requests.slice(requestsBeforeArchive).some(r=>/employee_integration_operations|employee_number_reservations|zkt_event_ownership/.test(r)),false)
  for (const name of ['Add row','Pay & Print','Save All']) {
    const buttons=page.getByRole('button',{name,exact:true})
    assert.ok(await buttons.count()>0)
    for(let i=0;i<await buttons.count();i++) assert.equal(await buttons.nth(i).isEnabled(),false,`${name} must not mutate an archived profile`)
  }
  assert.equal(await page.getByRole('button',{name:'Record confirmed termination date'}).count(),0)
  await page.goto('http://127.0.0.1:5187/employees')
  await page.getByRole('heading',{name:'Active Employees',exact:true}).waitFor()
  await page.getByRole('button',{name:'Add employee',exact:true}).first().click()
  const number=page.locator('input[name="employee_number"]')
  await number.waitFor()
  assert.equal(await number.getAttribute('readonly'),null,'Archive-only migration retains manual globally unique number entry')
  archiveEnabled=false
  const beforeOff=requests.length
  await page.goto('http://127.0.0.1:5187/employees/former')
  await page.getByText('Former Employees archive is disabled.',{exact:true}).waitFor()
  assert.equal(requests.slice(beforeOff).some(r=>/list_former_employees|employee_work_logs/.test(r)),false,'OFF must prevent archive/history requests')
  await page.goto(`http://127.0.0.1:5187/employees/${former.id}`)
  await page.getByText('Former Employees archive is disabled.',{exact:true}).waitFor()
  await page.goto('http://127.0.0.1:5187/employees')
  await page.getByRole('heading',{name:'Active Employees',exact:true}).waitFor()
  await page.getByRole('button',{name:'Add employee',exact:true}).first().click()
  assert.equal(await page.locator('input[name="employee_number"]').getAttribute('readonly'),null)
  assert.equal(await page.getByRole('link',{name:'Former Employees',exact:true}).count(),0)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify({ desktop: 'passed', mobile: 'passed', profileDesktopMobile:'passed', searchAndFilter: 'passed', uuidHistory: 'passed', offlineReservation:'passed', rehireSuggestion:'passed', sacsHistoryMock:'passed', reviewQueue:'passed', activeList: 'passed', archiveOnlySchema:'passed', archiveReadOnly:'passed', legacyEmployeeCreation:'passed', archiveFlagOff:'passed', directArchivedUrlOff:'passed', actionsIndependentOff:'passed', pageErrors: errors }))
} finally { await browser?.close(); await server.close() }
