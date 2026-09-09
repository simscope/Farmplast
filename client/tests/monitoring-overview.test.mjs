import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { OVERVIEW_COLUMNS } from '../src/utils/monitoringColumns.js'
import { getAssetStatus } from '../src/utils/monitoringHelpers.js'

const db = new PGlite()
const compressors = ['1a','1b','1c','2a','2b','2c']
await db.exec(`
  create role anon; create role authenticated;
  create table public.v_asset_points_latest (
    asset_code text, point_code text, point_name text, point_group text,
    data_type text, value_boolean boolean, value_number numeric, value_text text, updated_at timestamptz
  );
  create table public.v_ch2_dashboard (latest_updated_at timestamptz, is_online boolean,
    ${compressors.map(c => 'comp_' + c + '_enabled boolean').join(',')});
  create table public.v_ch3_dashboard (like public.v_ch2_dashboard);
`)
await db.exec(await fs.readFile(new URL('../../supabase/add_nj_monitoring_overview.sql', import.meta.url), 'utf8'))
const overview = async () => (await db.query('select ' + OVERVIEW_COLUMNS + ' from public.v_nj_monitoring_overview order by asset_code')).rows
const clear = () => db.exec('truncate v_asset_points_latest, v_ch2_dashboard, v_ch3_dashboard')
async function point(asset, code, type, value, age = 0, group = '') {
  await db.query(`insert into v_asset_points_latest values ($1,$2,$2,$3,$4,$5,$6,null,now() - ($7 * interval '1 second'))`,
    [asset,code,group,type,type === 'boolean' ? value : null,type === 'number' ? value : null,age])
}

test('exact five slots and exact 13 columns even with no telemetry', async () => {
  const rows = await overview()
  assert.equal(rows.length, 5)
  assert.deepEqual(rows.map(r => r.asset_code), ['BARREL-NJ-01','BARREL-NJ-02','CH-NJ-01','CH-NJ-02','CH-NJ-03'])
  assert.deepEqual(Object.keys(rows[0]), OVERVIEW_COLUMNS.split(','))
  assert.ok(rows.every(r => r.is_online === false && r.updated_at === null))
})

test('barrel swap, zero level, nullable error and stale true online flag', async () => {
  await clear()
  await point('BARREL-NJ-02','BARREL2_LEVEL_PERCENT','number',0)
  await point('BARREL-NJ-02','BARREL2_HAS_ERROR','boolean',true)
  await point('BARREL-NJ-02','BARREL2_ONLINE','boolean',true)
  await point('BARREL-NJ-01','BARREL1_LEVEL_PERCENT','number',81,60)
  await point('BARREL-NJ-01','BARREL1_ONLINE','boolean',true,60)
  const rows = await overview()
  assert.equal(Number(rows[0].level_percent), 0)
  assert.equal(rows[0].has_error, true); assert.equal(rows[0].is_online, true)
  assert.equal(Number(rows[1].level_percent), 81)
  assert.equal(rows[1].has_error, null); assert.equal(rows[1].is_online, false)
  assert.ok(compressors.every(c => rows[0]['comp_' + c + '_enabled'] === null))
})

test('CH1 two compressor mapping; unsupported positions remain null', async () => {
  await clear()
  await point('CH-NJ-01','CH1_COMP1','boolean',true)
  await point('CH-NJ-01','CH1_COMP2','boolean',false)
  const row = (await overview()).find(r => r.asset_code === 'CH-NJ-01')
  assert.equal(row.comp_1a_enabled, true); assert.equal(row.comp_1b_enabled, false)
  assert.equal(row.comp_1c_enabled, null); assert.equal(row.comp_2a_enabled, null)
  assert.equal(row.is_online, true)
})

test('CH1 SQL freshness and meaningful-data behavior matches existing JS helper', async () => {
  for (const [code,type,value,age,group] of [
    ['CH1_COMP1','boolean',false,0,'compressors'],
    ['CH1_COMP1','boolean',true,0,'compressors'],
    ['CH1_CHW_IN','number',0,0,'temperatures'],
    ['CH1_CHW_IN','number',65,15.2,'temperatures'],
    ['CH1_CHW_IN','number',65,16.2,'temperatures'],
    ['CH1_SETPOINT','number',-2,0,'temperatures'],
  ]) {
    await clear(); await point('CH-NJ-01',code,type,value,age,group)
    const p = (await db.query('select point_code,point_group,data_type,value_number,value_boolean,updated_at from v_asset_points_latest')).rows[0]
    const js = getAssetStatus({ asset_type: 'chiller', points: [p] }).online
    assert.equal((await overview()).find(r => r.asset_code === 'CH-NJ-01').is_online, js)
  }
})

test('CH2/CH3 reuse dashboard online status and cannot multiply overview rows', async () => {
  await clear()
  await db.exec(`insert into v_ch2_dashboard (is_online,comp_1a_enabled,latest_updated_at) values (false,true,now());
    insert into v_ch3_dashboard (is_online,comp_2c_enabled,latest_updated_at) values (true,true,now()),(true,true,now());`)
  const rows = await overview()
  assert.equal(rows.length, 5)
  assert.equal(rows[3].is_online, false); assert.equal(rows[3].comp_1a_enabled, true)
  assert.equal(rows[4].is_online, true); assert.equal(rows[4].comp_2c_enabled, true)
})

test('invoker security does not grant underlying access; RLS remains effective', async () => {
  await point('BARREL-NJ-02','BARREL2_LEVEL_PERCENT','number',45)
  assert.equal(Number((await overview())[0].level_percent), 45)
  await db.exec('set role anon')
  await assert.rejects(overview(), /permission denied/)
  await db.exec('reset role; grant select on v_asset_points_latest,v_ch2_dashboard,v_ch3_dashboard to anon; alter table v_asset_points_latest enable row level security;')
  await db.exec('set role anon')
  const rows = await overview()
  assert.equal(rows.length, 5); assert.equal(rows[0].level_percent, null)
  await db.exec('reset role')
})

test.after(async () => { await db.close() })
