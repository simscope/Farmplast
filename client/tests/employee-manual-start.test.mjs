import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initializeTerminationDb, admin, peter } from './helpers/employee-termination-db.mjs'

const patch = await readFile(new URL('../../supabase/employee_plant_transfer.sql', import.meta.url), 'utf8')
const floor = '2026-11-12T19:19:57Z'

async function fixture() {
  const db = await initializeTerminationDb(new PGlite())
  try {
    await db.query("select terminate_employee($1,'2026-11-09')", [peter])
    await db.exec(patch)
    const { rows: [employee] } = await db.query(`insert into employees
      (employee_number,first_name,active,hire_date,plant_location,shift_type,zkt_enabled)
      values(3,'Backdated manual fixture',true,'2026-11-09','NJ','day',false) returning id`)
    await db.query('update employee_employment_periods set work_started_at=$1 where employee_id=$2', [floor, employee.id])
    await db.exec('grant insert,update on employee_work_logs to authenticated')
    return { db, employeeId: employee.id }
  } catch (error) { await db.close(); throw error }
}

const session = (db, uid = admin, role = 'authenticated') => db.exec(
  `set role authenticated;set test.uid='${uid}';set test.role='${role}'`,
)
const insert = (db, employeeId, date = '2026-11-09', source = 'manual', timeIn = '08:30', timeOut = '17:00') => db.query(
  `insert into employee_work_logs(employee_id,work_date,time_in,time_out,source,manual_time_in,manual_time_out,is_deleted)
   values($1,$2,$3,$4,$5,true,true,false) returning id,time_in,time_out`,
  [employeeId, date, timeIn, timeOut, source],
)
const oldHistory = async db => (await db.query(`select
  (select jsonb_agg(w order by id) from employee_work_logs w where employee_id=$1) work,
  (select jsonb_agg(p order by id) from employee_payments p) payments,
  (select jsonb_agg(c order by id) from payroll_checks c) checks,
  (select jsonb_agg(l order by id) from zkt_attendance_logs l) raw`, [peter])).rows[0]

test('admin can insert and edit manual hours from hire date before a reused-number profile was created', async () => {
  const { db, employeeId } = await fixture()
  try {
    const before = await oldHistory(db)
    await session(db)
    const { rows: [monday] } = await insert(db, employeeId)
    await db.query("update employee_work_logs set time_in='08:15',time_out='17:45',source='manual' where id=$1", [monday.id])
    await insert(db, employeeId, '2026-11-10', 'manual', null, '17:00')
    await insert(db, employeeId, '2026-11-11', 'manual_downtime')
    const { rows } = await db.query('select employee_id,work_date,time_in,time_out from employee_work_logs where employee_id=$1 order by work_date', [employeeId])
    assert.equal(rows.length, 3)
    assert.ok(rows.every(row => row.employee_id === employeeId))
    assert.equal(rows[0].time_in, '08:15:00')
    assert.equal(rows[0].time_out, '17:45:00')
    await db.exec('reset role')
    assert.deepEqual(await oldHistory(db), before)
    const period = (await db.query('select work_started_at from employee_employment_periods where employee_id=$1', [employeeId])).rows[0]
    assert.equal(new Date(period.work_started_at).toISOString(), new Date(floor).toISOString())
    assert.equal((await db.query('select zkt_compat_event_owner(id) owner from zkt_attendance_logs where employee_number=3')).rows[0].owner, null)
  } finally { await db.close() }
})

test('hire-date, actor, ZKT and UUID boundaries still reject invalid backdated work', async () => {
  const { db, employeeId } = await fixture()
  try {
    const before = await oldHistory(db)
    for (const [uid, role, source] of [
      [admin, 'authenticated', 'zkt'],
      [admin, 'authenticated', 'unknown'],
      ['00000000-0000-0000-0000-000000000099', 'authenticated', 'manual'],
      [admin, 'service_role', 'manual'],
      [admin, 'anon', 'manual_downtime'],
    ]) {
      await session(db, uid, role)
      await assert.rejects(insert(db, employeeId, '2026-11-09', source), /assignment start/)
    }
    await session(db)
    await assert.rejects(insert(db, employeeId, '2026-11-08'), /employment period|assignment start/)
    // A manual correction cannot move the former person's row onto the new UUID.
    await assert.rejects(db.query(`update employee_work_logs set employee_id=$1,work_date='2026-11-09',source='manual'
      where employee_id=$2`, [employeeId, peter]), /assignment start/)
    await db.exec('reset role')
    assert.deepEqual(await oldHistory(db), before)
    assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id=$1', [employeeId])).rows[0].n, 0)
    await session(db, admin, 'service_role')
    await insert(db, employeeId, '2026-11-13', 'zkt')
  } finally { await db.close() }
})

test('manual source cannot bypass an exact plant-transfer or rehire cutover', async () => {
  const { db, employeeId } = await fixture()
  try {
    await session(db)
    await db.query('select * from save_employee_plant_transfer($1,$2,3,$3)',
      [employeeId, 'NJ', JSON.stringify({ plant_location: 'PA', employee_number: 100 })])
    await db.exec('reset role')
    await db.query("update employee_employment_periods set hire_date='2026-11-12',work_started_at=$1 where employee_id=$2 and termination_date is null", [floor, employeeId])
    await session(db)
    await assert.rejects(insert(db, employeeId, '2026-11-12'), /assignment start/)
    await db.exec('reset role')
    // A later engagement with no transfer link must retain its own exact boundary too.
    await db.query('update employee_employment_periods set transferred_from_period_id=null where employee_id=$1 and termination_date is null', [employeeId])
    await session(db)
    await assert.rejects(insert(db, employeeId, '2026-11-12'), /assignment start/)
  } finally { await db.close() }
})
