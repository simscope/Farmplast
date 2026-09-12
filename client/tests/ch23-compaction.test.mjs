import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { isCh3Online } from '../src/utils/ch3Status.js'

const read = name => readFile(new URL('../../supabase/' + name, import.meta.url), 'utf8')
const baseline = 'baselines/2026-09-12-ch23/'
const schema = JSON.parse(await read(baseline + 'schema.json'))
const points = JSON.parse(await read(baseline + 'points.json'))
const dependencies = JSON.parse(await read(baseline + 'dependencies.json'))
const migration = await read('compact_ch2_ch3_latest.sql')
const raw = [40023,40024,40025,40051,40052,40056,40057,40061]
const statuses = ['SYSTEM_RUNNING','COMP_1A_ENABLED','COMP_1B_ENABLED','COMP_1C_ENABLED','COMP_2A_ENABLED','COMP_2B_ENABLED','COMP_2C_ENABLED']
const numbers = ['CHILLER_ENTERING_F','CHILLER_LEAVING_F','FLOW_C1_GPM','FLOW_C2_GPM','EVAP_OUT_C1_F','EVAP_OUT_C2_F']
const retained = [...raw.map(r=>'CH2_R'+r), ...statuses.concat(numbers).map(p=>'CH2_'+p)].sort()
const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role;
  create table devices(device_code text, device_secret text, is_active boolean);
  create table v_asset_points_latest(asset_code text, point_code text, point_name text, point_group text,
    data_type text, value_boolean boolean, value_number numeric, value_text text, updated_at timestamptz);`)
for (const n of [2,3]) {
  // Column types/nullability/defaults and indexes come from the production catalog snapshot.
  for (const name of [`ch${n}_latest`,`ch${n}_point_map`]) {
    const columns = schema.columns.filter(c=>c.table_name===name).map(c=>
      `${c.column_name} ${c.column_default?.startsWith('nextval') ? 'bigserial' : c.data_type}
      ${c.column_default && !c.column_default.startsWith('nextval') ? 'default '+c.column_default : ''}
      ${c.is_nullable==='NO'?'not null':''}`)
    await db.exec(`create table ${name} (${columns.join(',')});`)
    for (const index of schema.indexes.filter(i=>i.tablename===name)) await db.exec(index.indexdef)
  }
  await db.exec(`alter table ch${n}_latest enable row level security;
    grant select on ch${n}_latest to anon;
    insert into devices values ('ESP32-CH${n}-PLC','test-only-${n}',true);`)
  for (const m of dependencies.mapping.filter(m=>m.source===`ch${n}`)) {
    await db.query(`insert into ch${n}_point_map(asset_code,device_code,point_code,point_name,source_kind,reg_num,bit_index,scale,unit,is_enabled)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [`CH-NJ-0${n}`,`ESP32-CH${n}-PLC`,m.point_code,m.point_name,m.source_kind,m.reg_num,m.bit_index,m.scale,m.unit,m.is_enabled])
  }
  await db.exec(await read(baseline+`ingest_ch${n}.sql`))
  await db.exec(await read(baseline+`v_ch${n}_dashboard.sql`))
}
await db.exec(await read(baseline+'v_nj_monitoring_overview.sql'))
function oldPayload(n) {
  return {device_code:`ESP32-CH${n}-PLC`,device_secret:`test-only-${n}`,readings:points.filter(p=>p.source===`ch${n}_latest`).map(p=>({
    point_code:p.point_code,
    ...(p.raw_register || numbers.some(s=>p.point_code==='CH2_'+s) || /CAPACITY|DELTA/.test(p.point_code)
      ? {value_number:p.raw_register===40023?450:123}
      : {value_boolean:p.point_code!=='CH2_HEARTBEAT'}),
  }))}
}
const ingest = (n,payload) => db.query(`select ingest_ch${n}($1::jsonb) as result`,[JSON.stringify(payload)])
const codes = async n => (await db.query(`select point_code from ch${n}_latest order by point_code`)).rows.map(r=>r.point_code)

test('production-derived migration removes obsolete rows twice and keeps old payloads compatible', async () => {
  for (const n of [2,3]) { await ingest(n,oldPayload(n)); assert.equal((await codes(n)).length,68) }
  const before = (await db.query(`select asset_code,system_running,comp_1a_enabled,chiller_entering_f,flow_c1_gpm,evap_out_c2_f from v_ch2_dashboard
    union all select asset_code,system_running,comp_1a_enabled,chiller_entering_f,flow_c1_gpm,evap_out_c2_f from v_ch3_dashboard order by asset_code`)).rows
  await db.exec(migration)
  await db.exec(migration)
  for (const n of [2,3]) {
    assert.deepEqual(await codes(n),retained)
    const payload=oldPayload(n)
    // Obsolete malformed values must also be ignored before casting.
    payload.readings.push({point_code:'CH2_R40053',value_number:'not-a-number'}, {point_code:'CH2_HEARTBEAT',value_boolean:'invalid'})
    assert.equal((await ingest(n,payload)).rows[0].result.ok,true)
    assert.deepEqual(await codes(n),retained)
    const rows=(await db.query(`select raw_register from ch${n}_latest where raw_register is not null order by raw_register`)).rows
    assert.deepEqual(rows.map(r=>r.raw_register),raw)
    const d=(await db.query(`select is_online,heartbeat,heartbeat_updated_at,capacity_c1_tons,process_delta_t_f from v_ch${n}_dashboard`)).rows[0]
    assert.deepEqual(d,{is_online:true,heartbeat:null,heartbeat_updated_at:null,capacity_c1_tons:null,process_delta_t_f:null})
  }
  const after=(await db.query(`select asset_code,system_running,comp_1a_enabled,chiller_entering_f,flow_c1_gpm,evap_out_c2_f from v_ch2_dashboard
    union all select asset_code,system_running,comp_1a_enabled,chiller_entering_f,flow_c1_gpm,evap_out_c2_f from v_ch3_dashboard order by asset_code`)).rows
  assert.deepEqual(after,before)
})

test('device authentication, atomic failure and invoker/RLS behavior remain intact',async()=>{
  for(const n of [2,3]) {
    const before=await codes(n)
    await assert.rejects(ingest(n,{...oldPayload(n),device_secret:'wrong'}),/invalid device credentials/)
    assert.deepEqual(await codes(n),before)
    const value=(await db.query(`select value_number from ch${n}_latest where point_code='CH2_R40023'`)).rows[0].value_number
    await assert.rejects(ingest(n,{...oldPayload(n),readings:[{point_code:'CH2_R40023',value_number:999},{point_code:'CH2_R40024',value_number:'bad'}]}),/invalid input syntax/)
    assert.equal((await db.query(`select value_number from ch${n}_latest where point_code='CH2_R40023'`)).rows[0].value_number,value)
    const security=(await db.query(`select reloptions from pg_class where oid='v_ch${n}_dashboard'::regclass`)).rows[0]
    assert.ok(security.reloptions.includes('security_invoker=true'))
  }
  await db.exec('set role anon')
  assert.equal((await db.query('select point_code from ch2_latest')).rows.length,0)
  await db.exec('reset role')
})

test('both dashboard and overview expire at exactly 45 seconds with the five-slot contract',async()=>{
  await db.exec('begin')
  try {
    const now=new Date((await db.query('select now() as time')).rows[0].time).getTime()
    for(const [age,expected] of [[0,true],[44.999,true],[45,false],[60,false]]) {
      for(const n of [2,3]) await db.query(`update ch${n}_latest set updated_at=now()-($1*interval '1 second')`,[age])
      const rows=(await db.query('select * from v_nj_monitoring_overview order by asset_code')).rows
      assert.equal(rows.length,5); assert.equal(Object.keys(rows[0]).length,13)
      for(const n of [2,3]) {
        const row=rows.find(r=>r.asset_code===`CH-NJ-0${n}`)
        assert.equal(row.is_online,expected)
        assert.equal((await db.query(`select is_online from v_ch${n}_dashboard`)).rows[0].is_online,expected)
        assert.equal(isCh3Online(row.updated_at.toISOString(),now),expected)
      }
    }
  } finally { await db.exec('rollback') }
})
test.after(()=>db.close())
