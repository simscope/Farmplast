import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initializeTerminationDb, admin, peter } from './helpers/employee-termination-db.mjs'

const transfer = await readFile(new URL('../../supabase/employee_plant_transfer.sql', import.meta.url), 'utf8')
const fix = await readFile(new URL('../../supabase/migrations/20261125005856_employee_hire_date_correction.sql', import.meta.url), 'utf8')
const floor = '2026-11-25T00:39:25Z'
async function fixture(plant = 'PA') {
  const db = await initializeTerminationDb(new PGlite())
  await db.exec(transfer)
  const { rows: [e] } = await db.query(`insert into employees(employee_number,first_name,active,hire_date,plant_location,shift_type,zkt_enabled)
    values($1,'Missing hire date',true,null,$2,'day',false) returning id`, [plant === 'PA' ? 107 : 20, plant])
  await db.query('update employee_employment_periods set work_started_at=$1 where employee_id=$2', [floor, e.id])
  await db.exec('grant insert,update on employee_work_logs to authenticated')
  return { db, id: e.id }
}
const login = (db, uid = admin, role = 'authenticated') => db.exec(`set role authenticated;set test.uid='${uid}';set test.role='${role}'`)
const hire = (db, id, date) => db.query('update employees set hire_date=$1 where id=$2', [date, id])
const work = (db, id, date = '2026-11-23', source = 'manual') => db.query(`insert into employee_work_logs(employee_id,work_date,time_in,time_out,source,manual_time_in,manual_time_out,is_deleted)
  values($1,$2,'08:30','17:00',$3,true,true,false) returning id`, [id, date, source])
const history = async db => (await db.query(`select
  (select jsonb_agg(w order by id) from employee_work_logs w where employee_id=$1) old_work,
  (select jsonb_agg(p order by id) from employee_payments p) payments,
  (select jsonb_agg(c order by id) from payroll_checks c) checks,
  (select jsonb_agg(l order by id) from zkt_attendance_logs l) raw,
  (select jsonb_agg(p order by id) from employee_employment_periods p where employee_id=$1) old_periods`, [peter])).rows[0]

test('reproduces missing hire date; correction enables yesterday manual insert/edit in NJ and PA without moving ZKT floor', async () => {
  for (const plant of ['NJ', 'PA']) {
    const { db, id } = await fixture(plant)
    try {
      const before = await history(db)
      await login(db)
      await assert.rejects(work(db, id), /assignment start/)
      await assert.rejects(hire(db, id, '2026-11-23'), /employment lifecycle/)
      await db.exec('reset role'); await db.exec(fix); await login(db)
      await hire(db, id, '2026-11-23')
      const row = (await work(db, id)).rows[0]
      await db.query("update employee_work_logs set time_in='08:15',time_out='17:15',source='manual' where id=$1", [row.id])
      await assert.rejects(work(db, id, '2026-11-22'), /employment period|assignment start/)
      await assert.rejects(work(db, id, '2026-11-23', 'zkt'), /assignment start/)
      await db.exec('reset role')
      const period = (await db.query('select hire_date,work_started_at from employee_employment_periods where employee_id=$1', [id])).rows[0]
      assert.equal(new Date(period.hire_date).toISOString().slice(0, 10), '2026-11-23')
      assert.equal(new Date(period.work_started_at).toISOString(), new Date(floor).toISOString())
      assert.deepEqual(await history(db), before)
    } finally { await db.close() }
  }
})
test('date editing is admin-only, atomic, and cannot clear dates, exclude saved hours, or bypass identity guards', async () => {
  const { db, id } = await fixture()
  try {
    await db.exec(fix); await login(db, '00000000-0000-0000-0000-000000000099')
    await assert.rejects(hire(db, id, '2026-11-23'), /Admin access/)
    await db.exec(`reset role;grant update on employees to service_role;set role service_role;set test.uid='${admin}';set test.role='service_role'`)
    assert.equal((await db.query("update employees set position='worker' where id=$1", [id])).affectedRows, 1)
    await assert.rejects(hire(db, id, '2026-11-23'), /Admin access/)
    await login(db); await hire(db, id, '2026-11-23'); await work(db, id)
    await assert.rejects(hire(db, id, null), /required/)
    await assert.rejects(hire(db, id, '2026-11-24'), /exclude recorded work/)
    await assert.rejects(hire(db, id, '2026-11-26'), /verified assignment start/)
    await assert.rejects(db.query("update employees set employee_number=108,hire_date='2026-11-22' where id=$1", [id]), /feature|lifecycle/)
    await db.exec('reset role')
    const state = (await db.query(`select e.hire_date::text employee_date,p.hire_date::text period_date from employees e join employee_employment_periods p on p.employee_id=e.id where e.id=$1`, [id])).rows[0]
    assert.deepEqual(state, { employee_date: '2026-11-23', period_date: '2026-11-23' })
  } finally { await db.close() }
})
test('a transferred employee correction updates the root hire date while retaining exact transfer cutover and prior engagements', async () => {
  const { db, id } = await fixture('NJ')
  try {
    await db.exec(fix); await login(db); await hire(db, id, '2026-11-23')
    await db.query('select * from save_employee_plant_transfer($1,$2,20,$3)', [id, 'NJ', JSON.stringify({plant_location:'PA',employee_number:107})])
    await db.exec('reset role')
    const before = (await db.query('select * from employee_employment_periods where employee_id=$1 order by id', [id])).rows
    const previous = await history(db)
    await login(db); await hire(db, id, '2026-11-22'); await db.exec('reset role')
    const after = (await db.query('select * from employee_employment_periods where employee_id=$1 order by id', [id])).rows
    assert.equal(new Date(after[0].hire_date).toISOString().slice(0, 10), '2026-11-22')
    assert.deepEqual(after[1], before[1])
    assert.equal(new Date(after[0].work_started_at).toISOString(), new Date(before[0].work_started_at).toISOString())
    assert.deepEqual(await history(db), previous)
  } finally { await db.close() }
})

test('rehire dates cannot overlap the former engagement and correcting the current date preserves its history', async () => {
  const { db, id } = await fixture()
  try {
    await db.query("update employee_employment_periods set hire_date='2026-01-01',termination_date='2026-11-22' where employee_id=$1", [id])
    await db.query(`insert into employee_employment_periods(employee_id,employee_number,hire_date,plant_location,terminal_user_id,work_started_at,legacy_inactive)
      values($1,107,null,'PA',107,$2,false)`, [id, floor])
    const oldPeriod = (await db.query('select * from employee_employment_periods where employee_id=$1 and termination_date is not null', [id])).rows[0]
    await db.exec(fix); await login(db)
    await assert.rejects(hire(db, id, '2026-11-21'), /overlaps/)
    await hire(db, id, '2026-11-23')
    await assert.rejects(work(db, id), /assignment start/)
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from employee_employment_periods where id=$1', [oldPeriod.id])).rows[0], oldPeriod)
  } finally { await db.close() }
})
