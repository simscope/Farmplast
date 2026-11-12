import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { selectPayrollReportEmployees } from '../src/utils/payrollReportScope.js'

const employees = [
  { id: 'nj', first_name: 'JerseyRegular', plant_location: 'NJ', company_id: 'shared' },
  { id: 'pa', first_name: 'PennRegular', plant_location: 'PA', company_id: 'shared' },
  { id: 'nj-ex', first_name: 'JerseyExcluded', plant_location: 'NJ', exclude_from_payroll_report: true },
  { id: 'pa-ex', first_name: 'PennExcluded', plant_location: 'PA', exclude_from_payroll_report: true },
]

test('each state and exclusion mode selects its own employees, even in the same company', () => {
  for (const [location, excludedOnly, id] of [
    ['NJ', false, 'nj'], ['PA', false, 'pa'], ['NJ', true, 'nj-ex'], ['PA', true, 'pa-ex'],
  ]) {
    assert.deepEqual(selectPayrollReportEmployees(employees, location, excludedOnly).map(e => e.id), [id])
  }
  assert.equal(employees.length, 4)
})

test('legacy unassigned employees remain NJ and lowercase PA is recognized', () => {
  const legacy = [{ id: 'old' }, { id: 'lowercase', plant_location: 'pa' }]
  assert.deepEqual(selectPayrollReportEmployees(legacy, 'NJ').map(e => e.id), ['old'])
  assert.deepEqual(selectPayrollReportEmployees(legacy, 'PA').map(e => e.id), ['lowercase'])
  assert.deepEqual(selectPayrollReportEmployees(null, 'NJ'), [])
  assert.deepEqual(selectPayrollReportEmployees(employees, 'unknown'), [])
})

test('four PDF buttons share one week selector and produce state-specific titles, rows and totals', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    plugins: [{
      name: 'expose-report-renderer-for-test', enforce: 'pre',
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/components/PayrollReport.jsx')) {
          return `${code}\nexport { buildPayrollReportHtml };`
        }
      },
    }],
  })
  try {
    const { default: Report, buildPayrollReportHtml } = await server.ssrLoadModule('/src/components/PayrollReport.jsx')
    const controls = renderToStaticMarkup(createElement(Report, { employees }))
    assert.equal((controls.match(/<select\b/g) || []).length, 1)
    assert.match(controls, /aria-label="Payroll week"/)
    assert.equal((controls.match(/<button\b/g) || []).length, 4)
    for (const location of ['NJ', 'PA']) {
      assert.match(controls, new RegExp(`Payroll PDF ${location}`))
      assert.match(controls, new RegExp(`Excluded Payroll PDF ${location}`))
    }

    const week = {
      startText: '2026-11-02', endText: '2026-11-08',
      start: new Date('2026-11-02T00:00:00'), end: new Date('2026-11-08T00:00:00'), days: [],
    }
    for (const plantLocation of ['NJ', 'PA']) {
      for (const excludedOnly of [false, true]) {
        const selected = selectPayrollReportEmployees(employees, plantLocation, excludedOnly)
        const rows = selected.map(employee => ({ employee, rows: [], rowsByDate: {},
          totals: { totalReg: 40, totalLabor: 640, netPay: 540 } }))
        const html = buildPayrollReportHtml(week, rows, { plantLocation, excludedOnly })
        const label = plantLocation === 'NJ' ? 'New Jersey (NJ)' : 'Pennsylvania (PA)'
        assert.ok(html.includes(`<title>${excludedOnly ? 'Excluded ' : ''}Payroll Report — ${label} 2026-11-02 - 2026-11-08</title>`))
        assert.ok(html.includes(selected[0].first_name))
        for (const other of employees.filter(e => e.id !== selected[0].id)) {
          assert.ok(!html.includes(other.first_name), `${other.first_name} leaked into ${plantLocation} report`)
        }
        assert.match(html, /\$640/)
        assert.match(html, /\$540/)
      }
    }
  } finally { await server.close() }
})
