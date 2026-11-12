import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initializeTerminationDb, admin, peter } from './helpers/employee-termination-db.mjs'

const patch = await readFile(new URL('../../supabase/employee_plant_transfer.sql', import.meta.url), 'utf8')
const save = (db, number, expectedPlant = 'PA', updates = {}) => db.query(
  'select * from save_employee_plant_transfer($1,$2,3,$3)',
  [peter, expectedPlant, JSON.stringify({ employee_number: number, plant_location: 'PA', ...updates })],
)
const snapshot = async db => {
  const rows = await db.query(`select
    (select jsonb_agg(w order by id) from employee_work_logs w) as work,
    (select jsonb_agg(p order by id) from employee_payments p) as payments,
    (select jsonb_agg(c order by id) from payroll_checks c) as checks,
    (select jsonb_agg(l order by id) from zkt_attendance_logs l) as punches,
    (select jsonb_agg(c order by id) from zkt_bridge_commands c) as commands`)
  return rows.rows[0]
}

test('already transferred profile can select another number without changing identity or history', async () => {
  const db = await initializeTerminationDb(new PGlite())
  try {
    await db.query("update employees set plant_location='PA' where id=$1", [peter])
    await db.exec(patch)
    const before = await snapshot(db)
    await db.exec(`set role authenticated;set test.uid='${admin}'`)
    const preview = (await db.query("select preview_employee_plant_transfer($1,'PA') p", [peter])).rows[0].p
    assert.deepEqual(preview, { employee_number: 100, plant_location: 'PA', previous_plant: 'NJ', previous_number: 3 })
    await assert.rejects(save(db, 99), error => error.code === '23514' && /100 and 199/.test(error.message))
    await assert.rejects(save(db, 105, 'NJ'), error => error.code === '40001')
    await assert.rejects(save(db, 105, 'PA', { id: admin }), error => error.code === '23514')
    const { rows: [employee] } = await save(db, 105)
    assert.equal(employee.id, peter)
    assert.equal(employee.plant_location, 'PA')
    assert.equal(employee.employee_number, 105)
    assert.equal(employee.zkt_user_id, 105)
    assert.equal(employee.zkt_enabled, false)
    assert.equal(employee.zkt_sync_status, 'pending')
    assert.equal(employee.active, true)
    await assert.rejects(db.query("select preview_employee_plant_transfer($1,'PA')", [peter]), /no recorded plant transfer/)
    await assert.rejects(db.query('update employees set employee_number=8 where id=$1', [peter]), /employee_number_reuse|lifecycle/)
    await db.exec('reset role')
    assert.deepEqual(await snapshot(db), before)
    const periods = (await db.query('select * from employee_employment_periods where employee_id=$1 order by id', [peter])).rows
    assert.equal(periods.length, 2)
    assert.equal(periods[0].plant_location, 'NJ')
    assert.equal(periods[0].employee_number, 3)
    assert.equal(periods[1].transferred_from_period_id, periods[0].id)
    assert.equal(periods[1].termination_date, null)
    assert.equal((await db.query('select released_at from employee_number_reservations where period_id=$1', [periods[0].id])).rows[0].released_at, null)
    assert.equal((await db.query('select terminal_user_id from zkt_identity_principals where employee_id=$1', [peter])).rows[0].terminal_user_id, 3)
    assert.equal((await db.query('select enabled from employee_feature_flags where flag=$1', ['employee_number_reuse'])).rows[0].enabled, false)
  } finally { await db.close() }
})

test('cross-plant save quarantines old ZKT punches and preserves access to prior work rows', async () => {
  const db = await initializeTerminationDb(new PGlite())
  try {
    await db.exec(patch)
    await db.query("insert into zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw) values(100,'2025-01-01 12:00Z','2025-01-01 07:00','{}')")
    await db.exec("set role authenticated;set test.uid='00000000-0000-0000-0000-000000000099'")
    await assert.rejects(save(db, 100, 'NJ'), error => error.code === '42501')
    await db.exec(`set test.uid='${admin}'`)
    await assert.rejects(db.query("update employees set plant_location='PA' where id=$1", [peter]), /plant transfer form/)
    await save(db, 100, 'NJ')
    await db.exec('reset role')
    const replay = (await db.query('select zkt_compat_event_owner(id) owner from zkt_attendance_logs where employee_number in (3,100)')).rows
    assert.ok(replay.length >= 2)
    assert.ok(replay.every(row => row.owner === null))
    await db.query("update employee_work_logs set time_out='17:00' where employee_id=$1 and work_date='2025-01-02'", [peter])
    assert.equal((await db.query('select time_out from employee_work_logs where employee_id=$1', [peter])).rows[0].time_out, '17:00:00')

    // Legacy punches may route only after the new terminal registration is enabled.
    const nextPunch = (await db.query(`insert into zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw)
      values(100,clock_timestamp()+interval '1 day',(clock_timestamp() at time zone 'America/New_York')+interval '1 day','{}') returning id`)).rows[0].id
    const owner = async () => (await db.query('select zkt_compat_event_owner($1) owner', [nextPunch])).rows[0].owner
    assert.equal(await owner(), null)
    await db.query('update employees set zkt_enabled=true where id=$1', [peter])
    assert.equal(await owner(), peter)
    assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id<>$1', [peter])).rows[0].n, 0)
  } finally { await db.close() }
})

test('Add Employee and transfer share the first free HR number per plant', async () => {
  const db = await initializeTerminationDb(new PGlite())
  try {
    await db.query("select terminate_employee($1,'2025-01-02')", [peter])
    await db.exec(patch)
    const next = async plant => (await db.query('select next_available_employee_number($1) n', [plant])).rows[0].n
    const create = (plant, number = null) => db.query(`insert into employees(employee_number, first_name, plant_location, active, zkt_enabled)
      values($1, 'New fixture', $2, true, true) returning *`, [number, plant])
    assert.equal(await next('NJ'), 3)
    assert.equal(await next('PA'), 100)
    const formerNumber = (await create('NJ')).rows[0]
    assert.equal(formerNumber.employee_number, 3)
    assert.equal(formerNumber.zkt_user_id, 3)
    assert.equal(formerNumber.zkt_enabled, false)
    assert.equal(formerNumber.zkt_sync_status, 'pending')
    assert.equal((await create('PA')).rows[0].employee_number, 100)
    assert.equal(await next('PA'), 101)
    await assert.rejects(create('PA', 99), error => error.code === '23514')
    await assert.rejects(create('NJ', 100), error => error.code === '23514')
    await assert.rejects(create('PA', 200), error => error.code === '23514')
    await assert.rejects(create('PA', 100), error => error.code === '23505' && /Next free Employee Number: 101/.test(error.message))
    const transfer = number => db.query('select * from save_employee_plant_transfer($1,$2,$3,$4)',
      [formerNumber.id, 'NJ', 3, JSON.stringify({ plant_location: 'PA', employee_number: number })])
    const preview = (await db.query("select preview_employee_plant_transfer($1,'PA') p", [formerNumber.id])).rows[0].p
    assert.equal(preview.employee_number, 101)
    await assert.rejects(transfer(100), error => error.code === '23505')
    assert.equal((await transfer(101)).rows[0].employee_number, 101)
    assert.equal(await next('NJ'), 3)
  } finally { await db.close() }
})
