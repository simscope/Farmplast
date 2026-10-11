import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '00000000-0000-0000-0000-000000000001'
const manager = '00000000-0000-0000-0000-000000000002'
const employee = '00000000-0000-0000-0000-000000000003'
const former = '00000000-0000-0000-0000-000000000004'

async function fixture() {
  const db = new PGlite()
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table profiles(id uuid primary key,role text);
    insert into profiles values('${admin}','admin'),('${manager}','manager');
    create table employees(id uuid primary key,employee_number integer not null unique,
      active boolean default true,hire_date date,position text,company_id uuid,plant_location text,
      hourly_rate numeric,zkt_enabled boolean,zkt_sync_status text,first_name text,last_name text);
    create table employee_work_logs(id int primary key,employee_id uuid references employees(id) on delete cascade,
      work_date date,time_in time,time_out time,approved boolean,is_deleted boolean);
    create table employee_payments(id int primary key,employee_id uuid references employees(id) on delete cascade,amount numeric);
    insert into employees values('${employee}',3,true,'2024-01-01','worker',null,'NJ',20,true,'verified','Peter','Smith'),
      ('${former}',5,false,'2023-01-01','worker',null,'PA',22,false,null,'Maria','Smith');
    insert into employee_work_logs values(1,'${employee}','2024-01-02','08:00','16:00',true,false);
    insert into employee_payments values(1,'${employee}',160);
    alter table employees enable row level security;
    grant usage on schema public,auth to authenticated;
    grant select,update,delete,insert on employees to authenticated;
    create policy original_access on employees for all to authenticated using(true) with check(true);
    create view v_employee_current_presence as select * from employees;
    grant select on v_employee_current_presence to authenticated;
    set test.uid='${admin}';`)
  await db.exec(await readFile(new URL('../../supabase/former_employees.sql', import.meta.url), 'utf8'))
  return db
}

test('migration preserves UUIDs, globally reserved numbers, payments and unknown legacy dates', async () => {
  const db = await fixture()
  try {
    assert.equal((await db.query('select count(*)::int n from employees')).rows[0].n, 2)
    assert.deepEqual((await db.query('select * from employee_payments')).rows, [{ id: 1, employee_id: employee, amount: '160' }])
    const legacy = (await db.query('select * from employee_employment_periods where employee_id=$1', [former])).rows[0]
    assert.equal(legacy.termination_date, null)
    assert.equal(legacy.legacy_inactive, true)
    await assert.rejects(db.query('insert into employees(id,employee_number) values($1,5)', [manager]), /unique/)
    await assert.rejects(db.query('delete from employees where id=$1', [employee]), /cannot be deleted/)
    await assert.rejects(db.query('update employees set employee_number=7 where id=$1', [employee]), /cannot be reassigned/)
    await assert.rejects(db.query('update employees set active=false where id=$1', [employee]), /lifecycle/)
  } finally { await db.close() }
})

test('readiness and admin permissions fail closed; existing manager cannot read former profiles', async () => {
  const db = await fixture()
  try {
    await db.exec('set role authenticated')
    assert.equal((await db.query('select employee_lifecycle_blockers() blockers')).rows[0].blockers.length, 4)
    await assert.rejects(db.query("select change_employee_employment($1,'terminate','2025-01-01')", [employee]), /blocked/)
    await assert.rejects(db.query('update employee_lifecycle_readiness set attendance_history_verified=true'), /permission denied/)
    await db.exec(`set test.uid='${manager}'`)
    assert.deepEqual((await db.query('select id from employees')).rows.map(row => row.id), [employee])
    assert.deepEqual((await db.query('select id from v_employee_current_presence')).rows.map(row => row.id), [employee])
    assert.equal((await db.query('select * from employee_employment_periods')).rows.length, 0)
    await assert.rejects(db.query('select employee_lifecycle_blockers()'), /Admin/)
    await assert.rejects(db.query("select change_employee_employment($1,'terminate','2025-01-01')", [employee]), /Admin/)
  } finally { await db.close() }
})

test('verified lifecycle retains history and rehires same UUID into a new period', async () => {
  const db = await fixture()
  try {
    // Simulated verification only. This does not test real terminals or SACS delivery.
    await db.exec(`update employee_lifecycle_readiness set attendance_history_verified=true,
      nj_deactivation_verified=true,pa_deactivation_verified=true,sacs_deactivation_verified=true`)
    const before = (await db.query('select * from employee_work_logs')).rows
    await db.exec('set role authenticated')
    await db.query("select change_employee_employment($1,'terminate','2025-01-01','Resigned','Exit note')", [employee])
    const terminated = (await db.query('select * from employees where id=$1', [employee])).rows[0]
    assert.equal(terminated.active, false)
    assert.equal(terminated.zkt_enabled, false)
    assert.equal(terminated.termination_reason, 'Resigned')
    await assert.rejects(db.query("select change_employee_employment($1,'rehire','2024-12-01')", [employee]), /must follow/)
    await db.query("select change_employee_employment($1,'rehire','2026-01-01',null,'Return')", [employee])
    const rehired = (await db.query('select * from employees where id=$1', [employee])).rows[0]
    assert.equal(rehired.active, true)
    assert.equal(rehired.employee_number, 3)
    assert.equal(rehired.zkt_enabled, false)
    const periods = (await db.query('select hire_date::text,termination_date::text from employee_employment_periods where employee_id=$1 order by id', [employee])).rows
    assert.deepEqual(periods, [{ hire_date: '2024-01-01', termination_date: '2025-01-01' }, { hire_date: '2026-01-01', termination_date: null }])
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from employee_work_logs')).rows, before)
    assert.equal((await db.query('select amount from employee_payments')).rows[0].amount, '160')
  } finally { await db.close() }
})

test('open shifts and outstanding work logs block termination without mutation', async () => {
  const db = await fixture()
  try {
    await db.exec('update employee_work_logs set time_out=null')
    await assert.rejects(db.query("select change_employee_employment($1,'terminate','2025-01-01')", [employee]), /open shifts/)
    await db.exec("update employee_work_logs set time_out='16:00',approved=false")
    await assert.rejects(db.query("select change_employee_employment($1,'terminate','2025-01-01')", [employee]), /outstanding work logs/)
    await assert.rejects(db.query("select change_employee_employment($1,'terminate','2023-01-01')", [employee]), /precedes/)
    await assert.rejects(db.query("select change_employee_employment($1,'rehire','2025-01-01')", [former]), /reconciled/)
    assert.equal((await db.query('select active from employees where id=$1', [employee])).rows[0].active, true)
  } finally { await db.close() }
})
