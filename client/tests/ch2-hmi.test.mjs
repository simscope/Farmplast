import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Chiller2HMIPage.jsx', import.meta.url), 'utf8')

test('CH2 displays six metric cards and no removed diagnostics', () => {
  assert.deepEqual([...source.matchAll(/<StatCard\s+title="([^"]+)"/g)].map(m => m[1]),
    ['Setpoint','Entering Fluid','Leaving Fluid','Flow C1','Flow C2','Demand'])
  assert.doesNotMatch(source, /RAW Registers Table|Heartbeat|heartbeat|Capacity C[12]|capacityC[12]|Delta T|deltaT|rawDeltaT|REGISTER_MAP|decodeRegister|Clock3|Activity/)
  assert.match(source, /grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-3.*xl:grid-cols-6/)
  assert.deepEqual([...source.matchAll(/<ValueRow\s+label="([^"]+)"/g)].map(m => m[1]), [
    'Asset Code','Device Code','Process Setpoint','System Running','Latest Updated',
    'Comp 1A Enabled','Comp 1B Enabled','Comp 1C Enabled','Flow C1','Evap Out C1',
    'Comp 2A Enabled','Comp 2B Enabled','Comp 2C Enabled','Flow C2','Evap Out C2',
  ])
  const bits = source.slice(source.indexOf('const importantBits'),source.indexOf('  return (',source.indexOf('const importantBits')))
  assert.deepEqual([...bits.matchAll(/label: '([^']+)'/g)].map(m=>m[1]),['Online','System Running','C1 Comp A','C1 Comp B','C1 Comp C','C2 Comp A','C2 Comp B','C2 Comp C'])
})

test('CH2 raw query and value decoding use only the eight displayed registers', () => {
  const expected=[40023,40024,40025,40051,40052,40056,40057,40061]
  const filter=source.match(/\.in\('raw_register', \[([^\]]+)\]\)/)
  assert.ok(filter)
  assert.deepEqual(filter[1].split(',').map(Number),expected)
  assert.deepEqual([...source.matchAll(/getRawRegisterValue\(rawRows, (\d+)\)/g)].map(m=>Number(m[1])),expected)
  assert.doesNotMatch(source,/40053|40054|40060|CH2_R%/)
  assert.match(source,/'value_number, raw_register, raw_value'/)
  assert.doesNotMatch(source,/\.select\(['"]\*/)
  const projection=source.match(/const CH2_DASHBOARD_COLUMNS = '([^']+)'/)[1].split(',')
  assert.ok(projection.includes('latest_updated_at') && projection.includes('system_running'))
  assert.doesNotMatch(projection.join(','),/heartbeat|capacity|delta_t|is_online/)
  assert.deepEqual([...source.matchAll(/\.from\('([^']+)'\)/g)].map(m=>m[1]),['v_ch2_dashboard','ch2_latest'])
  assert.match(source,/online: isCh2Online\(dashboard\?\.latest_updated_at\)/)
  assert.match(source,/const POLL_MS = 5000/)
  assert.doesNotMatch(source,/postgres_changes|\.channel\(/)
})
