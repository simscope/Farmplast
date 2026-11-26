import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const baseline = await readFile(new URL('./fixtures/presence-before-night.sql', import.meta.url), 'utf8')
const migrationsDirectory = new URL('../../supabase/migrations/', import.meta.url)
const migrationNames = (await readdir(migrationsDirectory)).filter(name => name.endsWith('_fix_night_presence_shift_day.sql'))
assert.equal(migrationNames.length, 1, 'Use the committed night Presence migration')
const migration = await readFile(new URL(migrationNames[0], migrationsDirectory), 'utf8')
const baselineHash = 'f7b3e06f3818bce58144e249fbf7f02e'
const uuid = number => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('test.role',true),''),'authenticated')
    $$;
    create function employee_archive_admin() returns boolean language sql stable as $$
      select coalesce(nullif(current_setting('test.admin',true),'')::boolean,false)
    $$;
    create table employees (
      id uuid primary key, employee_number integer, active boolean default true,
      shift_type text default 'day', zkt_enabled boolean default true
    );
    create table employee_employment_periods (
      id bigserial primary key, employee_id uuid, employee_number integer,
      hire_date date, work_started_at timestamptz, terminal_user_id integer,
      transferred_from_period_id bigint
    );
    create table zkt_attendance_logs (
      id uuid primary key default gen_random_uuid(), employee_number integer,
      punch_time timestamptz, punch_time_local timestamp, raw jsonb,
      unique(employee_number,punch_time)
    );
    create table zkt_identity_events (
      id uuid primary key default gen_random_uuid(), legacy_raw_id uuid,
      terminal_user_id text, local_timestamp timestamp, event_at timestamptz, device_key text
    );
    create table zkt_event_ownership (event_id uuid, employee_id uuid, mapping_id bigint);
    create table zkt_identifier_history (
      id bigserial primary key, employee_id uuid, period_id bigint,
      processing_verified boolean, device_key text, terminal_user_id text,
      valid_from timestamptz, valid_to timestamptz
    );
    create table zkt_identity_devices (device_key text primary key, verified boolean);
    insert into zkt_identity_devices values ('verified',true),('unverified',false);
    create table employee_feature_flags (flag text primary key, enabled boolean);
    insert into employee_feature_flags values ('employee_rehire',true),('employee_number_reuse',false);
    create table zkt_reserved_terminal_identifiers (terminal_user_id text);
    create table employee_number_reservations (period_id bigint, released_at timestamptz);
    create table employee_work_logs (
      id uuid primary key default gen_random_uuid(), employee_id uuid, work_date date,
      created_at timestamptz default now(), time_in time, time_out time,
      source text, manually_edited boolean, manual_time_in boolean, manual_time_out boolean,
      approved boolean, is_deleted boolean, labor_amount numeric
    );
    create table employee_payments (id uuid primary key default gen_random_uuid(), employee_id uuid, amount numeric);
    create table payroll_checks (
      id uuid primary key default gen_random_uuid(), employee_id uuid,
      pay_period_start date, pay_period_end date, amount numeric, voided_at timestamptz
    );
    create table zkt_bridge_commands (id uuid primary key default gen_random_uuid(), command text, payload jsonb);
    create schema employee_presence_private;
    revoke all on schema employee_presence_private from public,anon;
    grant usage on schema employee_presence_private to authenticated,service_role;
    create table employee_presence_private.snapshot (
      employee_id uuid primary key references employees(id) on delete cascade,
      last_punch_time timestamp, last_punch_type text check(last_punch_type in ('IN','OUT')),
      last_work_date date, checked_at timestamptz not null
    );
    alter table employees enable row level security;
    create policy visible_employees on employees for select to authenticated
      using(active is true or employee_archive_admin());
    alter table employee_presence_private.snapshot enable row level security;
    grant select on employees,employee_presence_private.snapshot to authenticated,service_role;
    create policy read_visible_employee_presence on employee_presence_private.snapshot
      for select to authenticated using (
        exists(select 1 from employees e where e.id=employee_id and (e.active is true or employee_archive_admin()))
      );
    create view v_employee_current_presence with (security_invoker=true) as
      select e.id,e.employee_number,e.active,e.shift_type,s.last_punch_time,s.last_punch_type,s.last_work_date,
        s.last_punch_type='IN' as is_on_site,
        case s.last_punch_type when 'IN' then 'ON_SITE' when 'OUT' then 'OFF_SITE' else 'ABSENT' end as presence_status
      from employees e left join employee_presence_private.snapshot s on s.employee_id=e.id;
    grant select on v_employee_current_presence to authenticated;
    grant usage on schema auth to authenticated,service_role;
  `)
  await db.exec(baseline)
  await db.exec(`
    revoke all on function employee_presence_private.refresh_snapshot() from public,anon,authenticated;
    grant execute on function employee_presence_private.refresh_snapshot() to service_role;
  `)
  assert.equal((await db.query("select md5(pg_get_functiondef('employee_presence_private.refresh_snapshot()'::regprocedure)) hash")).rows[0].hash, baselineHash)
  return db
}

async function employee(db, id, number = id, shift = 'night', active = true) {
  await db.query('insert into employees(id,employee_number,shift_type,active) values($1,$2,$3,$4)', [uuid(id), number, shift, active])
  return uuid(id)
}

async function punch(db, number, localTime) {
  return (await db.query(`insert into zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw)
    values($1,$2::timestamp at time zone 'America/New_York',$2::timestamp,'{"inOutMode":"0"}') returning id`, [number, localTime])).rows[0].id
}

async function punches(db, number, localTimes) {
  const ids = []
  for (const time of localTimes) ids.push(await punch(db, number, time))
  return ids
}

const refresh = db => db.query('select employee_presence_private.refresh_snapshot()')
const definition = async db => (await db.query("select pg_get_functiondef('employee_presence_private.refresh_snapshot()'::regprocedure) definition")).rows[0].definition
const presence = async (db, id) => (await db.query(`select last_punch_time::text,last_punch_type,last_work_date::text
  from employee_presence_private.snapshot where employee_id=$1`, [uuid(id)])).rows[0]
const expectPresence = async (db, id, time, direction, workDate) => assert.deepEqual(await presence(db, id), {
  last_punch_time: time, last_punch_type: direction, last_work_date: workDate,
})

async function persistedData(db) {
  return (await db.query(`select
    (select jsonb_agg(e order by id) from employees e) employees,
    (select jsonb_agg(l order by id) from zkt_attendance_logs l) punches,
    (select jsonb_agg(w order by id) from employee_work_logs w) work,
    (select jsonb_agg(p order by id) from employee_payments p) payments,
    (select jsonb_agg(c order by id) from payroll_checks c) checks,
    (select jsonb_agg(c order by id) from zkt_bridge_commands c) commands,
    (select jsonb_agg(p order by id) from employee_employment_periods p) periods,
    (select jsonb_agg(h order by id) from zkt_identifier_history h) mappings,
    (select jsonb_agg(e order by id) from zkt_identity_events e) identity_events,
    (select jsonb_agg(o order by event_id) from zkt_event_ownership o) ownerships
  `)).rows[0]
}

async function securityState(db) {
  return (await db.query(`select
    (select jsonb_build_object('owner',proowner,'security_definer',prosecdef,'config',proconfig,'acl',proacl::text)
      from pg_proc where oid='employee_presence_private.refresh_snapshot()'::regprocedure) function,
    (select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'owner',c.relowner,
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text) order by c.oid)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.oid in ('employees'::regclass,'employee_presence_private.snapshot'::regclass,'v_employee_current_presence'::regclass)) relations,
    (select jsonb_agg(jsonb_build_object('name',polname,'table',polrelid,'roles',polroles,
      'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by oid)
      from pg_policy where polrelid in ('employees'::regclass,'employee_presence_private.snapshot'::regclass)) policies,
    pg_get_viewdef('v_employee_current_presence'::regclass,true) view
  `)).rows[0]
}

test('night Presence pairs the previous evening with morning OUT and starts the next evening as IN', async () => {
  const db = await setup()
  try {
    await employee(db, 1)
    await employee(db, 2)
    await punches(db, 1, ['2026-11-24 18:52', '2026-11-25 07:08'])
    await punches(db, 2, ['2026-11-24 18:52', '2026-11-25 07:08', '2026-11-25 18:43'])
    await refresh(db)
    await expectPresence(db, 1, '2026-11-25 07:08:00', 'IN', '2026-11-25')
    await expectPresence(db, 2, '2026-11-25 18:43:00', 'OUT', '2026-11-25')
    await db.exec(migration)
    await expectPresence(db, 1, '2026-11-25 07:08:00', 'OUT', '2026-11-24')
    await expectPresence(db, 2, '2026-11-25 18:43:00', 'IN', '2026-11-25')
  } finally { await db.close() }
})

test('work-day grouping handles consecutive nights, noon boundary and event order while preserving day parity', async () => {
  const db = await setup()
  try {
    for (const id of [10, 11, 12, 13]) await employee(db, id)
    await employee(db, 14, 14, 'day')
    await employee(db, 15, 15, null)
    await punches(db, 10, ['2026-11-23 18:52', '2026-11-24 07:08', '2026-11-24 18:43', '2026-11-25 07:03'])
    // Arrival order does not determine the direction; all raw flags deliberately say IN.
    await punches(db, 11, ['2026-11-25 18:43', '2026-11-24 07:08', '2026-11-25 07:03', '2026-11-23 18:52', '2026-11-24 18:43'])
    await punches(db, 12, ['2026-11-24 18:52', '2026-11-25 11:59:59'])
    await punches(db, 13, ['2026-11-24 18:52', '2026-11-25 11:59:59', '2026-11-25 12:00:00'])
    for (const id of [14, 15]) await punches(db, id, ['2026-11-24 18:52', '2026-11-25 07:08', '2026-11-25 18:43'])
    await refresh(db)
    const unchangedDay = [await presence(db, 14), await presence(db, 15)]
    await db.exec(migration)
    await expectPresence(db, 10, '2026-11-25 07:03:00', 'OUT', '2026-11-24')
    await expectPresence(db, 11, '2026-11-25 18:43:00', 'IN', '2026-11-25')
    await expectPresence(db, 12, '2026-11-25 11:59:59', 'OUT', '2026-11-24')
    await expectPresence(db, 13, '2026-11-25 12:00:00', 'IN', '2026-11-25')
    assert.deepEqual([await presence(db, 14), await presence(db, 15)], unchangedDay)
    await expectPresence(db, 14, '2026-11-25 18:43:00', 'OUT', '2026-11-25')
  } finally { await db.close() }
})

async function mappedOwner(db, id, number, { device = 'verified', processingVerified = true, from = '2026-11-24 00:00Z', to = null } = {}) {
  const period = (await db.query(`insert into employee_employment_periods(employee_id,employee_number,hire_date,work_started_at,terminal_user_id)
    values($1,$2,'2026-11-24','2026-11-24 05:00Z',$2) returning id`, [uuid(id), number])).rows[0].id
  const mapping = (await db.query(`insert into zkt_identifier_history(employee_id,period_id,processing_verified,device_key,terminal_user_id,valid_from,valid_to)
    values($1,$2,$3,$4,$5,$6,$7) returning id`, [uuid(id), period, processingVerified, device, String(number), from, to])).rows[0].id
  return mapping
}

async function bindNative(db, rawId, owner, mapping, { device = 'verified', legacy = false, instantOffset = '0 seconds' } = {}) {
  const event = (await db.query(`insert into zkt_identity_events(legacy_raw_id,terminal_user_id,local_timestamp,event_at,device_key)
    select case when $2 then id else null end,employee_number::text,punch_time_local,punch_time+$4::interval,$3
    from zkt_attendance_logs where id=$1 returning id`, [rawId, legacy, device, instantOffset])).rows[0].id
  await db.query('insert into zkt_event_ownership(event_id,employee_id,mapping_id) values($1,$2,$3)', [event, uuid(owner), mapping])
}

test('the migration preserves verified UUID ownership for reused numbers and rejects ambiguous or unverified evidence', async () => {
  const db = await setup()
  try {
    await employee(db, 30, 30, 'night', false)
    await employee(db, 31, 30)
    const oldMapping = await mappedOwner(db, 30, 30, { from: '2026-11-01 00:00Z', to: '2026-11-24 00:00Z' })
    const currentMapping = await mappedOwner(db, 31, 30)
    const oldPunch = await punch(db, 30, '2026-11-23 18:52')
    await bindNative(db, oldPunch, 30, oldMapping, { legacy: true })
    // Even a competing native match cannot override existing permanent legacy ownership.
    await bindNative(db, oldPunch, 31, currentMapping)
    for (const raw of await punches(db, 30, ['2026-11-24 18:52', '2026-11-25 07:08', '2026-11-25 18:43'])) {
      await bindNative(db, raw, 31, currentMapping)
    }

    const rejectionCases = [
      { id: 40, mapping: { device: 'unverified' }, native: { device: 'unverified' } },
      { id: 42, mapping: { processingVerified: false } },
      { id: 44, mapping: { to: '2026-11-25 00:00Z' } },
      { id: 46, native: { instantOffset: '1 second' } },
      { id: 48, ambiguousOnly: true },
    ]
    for (const fixture of rejectionCases) {
      await employee(db, fixture.id, fixture.id, 'night', false)
      await employee(db, fixture.id + 1, fixture.id)
      const mapping = await mappedOwner(db, fixture.id + 1, fixture.id, fixture.mapping)
      const raw = await punch(db, fixture.id, '2026-11-25 18:43')
      if (!fixture.ambiguousOnly) await bindNative(db, raw, fixture.id + 1, mapping, fixture.native)
    }
    await refresh(db)
    const dataBefore = await persistedData(db)
    await db.exec(migration)
    await expectPresence(db, 30, '2026-11-23 18:52:00', 'IN', '2026-11-23')
    await expectPresence(db, 31, '2026-11-25 18:43:00', 'IN', '2026-11-25')
    for (const fixture of rejectionCases) {
      for (const id of [fixture.id, fixture.id + 1]) await expectPresence(db, id, null, null, null)
    }
    assert.deepEqual(await persistedData(db), dataBefore)
  } finally { await db.close() }
})

test('refresh changes only Presence data and retains function ACLs, ownership rules, view and RLS visibility', async () => {
  const db = await setup()
  try {
    await employee(db, 60)
    await employee(db, 61, 61, 'day')
    await employee(db, 62, 62, 'night', false)
    await punches(db, 60, ['2026-11-24 18:52', '2026-11-25 07:08'])
    await punches(db, 61, ['2026-11-25 08:00', '2026-11-25 16:00'])
    await punch(db, 62, '2026-11-25 18:43')
    await db.query(`insert into employee_work_logs(employee_id,work_date,time_in,time_out,source,manually_edited,manual_time_in,manual_time_out,approved,is_deleted,labor_amount)
      values($1,'2026-11-24','18:00','07:30','manual',true,true,true,true,false,270)`, [uuid(60)])
    await db.query('insert into employee_payments(employee_id,amount) values($1,270)', [uuid(60)])
    await db.query("insert into payroll_checks(employee_id,pay_period_start,pay_period_end,amount) values($1,'2026-11-23','2026-11-29',270)", [uuid(60)])
    await db.exec("insert into zkt_bridge_commands(command,payload) values('pull_attendance','{}')")
    await refresh(db)
    const before = await persistedData(db)
    const securityBefore = await securityState(db)
    const functionBefore = await definition(db)
    await db.exec(migration)
    assert.deepEqual(await persistedData(db), before)
    assert.deepEqual(await securityState(db), securityBefore)
    const ownershipBlock = sql => sql.slice(sql.indexOf('WITH owners AS MATERIALIZED'), sql.indexOf('resolved_punches AS MATERIALIZED'))
    assert.equal(ownershipBlock(await definition(db)), ownershipBlock(functionBefore))
    await expectPresence(db, 60, '2026-11-25 07:08:00', 'OUT', '2026-11-24')
    await expectPresence(db, 61, '2026-11-25 16:00:00', 'OUT', '2026-11-25')
    await db.exec('set role authenticated')
    assert.deepEqual((await db.query('select employee_number from v_employee_current_presence order by employee_number')).rows, [{ employee_number: 60 }, { employee_number: 61 }])
    await assert.rejects(refresh(db), error => error.code === '42501')
    await db.exec("set test.admin='true'")
    assert.deepEqual((await db.query('select employee_number from v_employee_current_presence order by employee_number')).rows, [{ employee_number: 60 }, { employee_number: 61 }, { employee_number: 62 }])
    await db.exec('reset role')
  } finally { await db.close() }
})

test('definition drift stops the migration before refreshing or altering any data', async () => {
  const db = await setup()
  try {
    await employee(db, 70)
    await punches(db, 70, ['2026-11-24 18:52', '2026-11-25 07:08'])
    await refresh(db)
    await db.exec(baseline.replace('DECLARE result_count integer;', '-- unrelated definition drift\nDECLARE result_count integer;'))
    const functionBefore = await definition(db)
    const dataBefore = await persistedData(db)
    const snapshotBefore = (await db.query('select * from employee_presence_private.snapshot order by employee_id')).rows
    await assert.rejects(db.exec(migration), /Presence definition changed/)
    await db.exec('rollback')
    assert.equal(await definition(db), functionBefore)
    assert.deepEqual(await persistedData(db), dataBefore)
    assert.deepEqual((await db.query('select * from employee_presence_private.snapshot order by employee_id')).rows, snapshotBefore)
  } finally { await db.close() }
})
