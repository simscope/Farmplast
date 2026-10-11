import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
export const admin='00000000-0000-0000-0000-000000000001'
export const peter='00000000-0000-0000-0000-000000000003'
export const robert='00000000-0000-0000-0000-000000000004'
export async function identityDb() {
  return initializeIdentityDb(new PGlite())
}
export async function initializeIdentityDb(db) {
  await db.exec(`do $$ declare r text; begin foreach r in array array['authenticated','anon','service_role'] loop
    if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if;end loop;end $$;
    alter role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role',true),''),'authenticated') $$;
    create table profiles(id uuid primary key,role text);insert into profiles values('${admin}','admin');
    create table employees(id uuid primary key default gen_random_uuid(),employee_number integer not null unique,
      active boolean,hire_date date,position text,company_id uuid,plant_location text,hourly_rate numeric,
      zkt_enabled boolean,zkt_sync_status text,zkt_synced_at timestamptz,zkt_user_id integer,shift_type text,default_lunch_hours numeric,
      first_name text,last_name text,phone text,email text);
    insert into employees(id,employee_number,active,hire_date,plant_location,hourly_rate,zkt_enabled,zkt_user_id,first_name,last_name,shift_type,default_lunch_hours)
      values('${peter}',3,true,'2024-01-01','NJ',20,true,3,'Peter','Test','day',1);
    create table employee_work_logs(id uuid primary key default gen_random_uuid(),employee_id uuid,work_date date,time_in time,time_out time,
      approved boolean,manually_edited boolean,manual_time_in boolean,manual_time_out boolean,is_deleted boolean,
      lunch_hours numeric,reg_hours numeric,labor_amount numeric,source text,missed_punch boolean,auto_closed_reason text,updated_at timestamptz,unique(employee_id,work_date));
    create table payroll_checks(id uuid primary key default gen_random_uuid(),employee_id uuid,pay_period_start date,pay_period_end date,status text,voided_at timestamptz);
    create table employee_payments(id uuid primary key default gen_random_uuid(),employee_id uuid,amount numeric);
    create table zkt_attendance_logs(id uuid primary key default gen_random_uuid(),employee_number integer,punch_time timestamptz,punch_time_local timestamp,raw jsonb);
    insert into zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw) values(3,'2024-01-02 13:00Z','2024-01-02 08:00','{"timestamp":"2024-01-02 08:00:00","deviceUserId":"3"}');
    create table zkt_bridge_commands(id uuid primary key default gen_random_uuid(),command text constraint zkt_bridge_commands_command_check check(command in ('test','sync_employees','verify_employees','pull_attendance','delete_employee_from_zkt','sync_one_employee','verify_one_employee')),payload jsonb,status text);
    create view v_employee_current_presence as select * from employees;
    create function process_zkt_attendance_to_work_logs() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function rebuild_zkt_work_logs() returns jsonb language sql as $$ select '{}'::jsonb $$;
    set test.uid='${admin}';`)
  for (const name of ['former_employees.sql','zkt_event_identity.sql','employee_lifecycle.sql']) {
    await db.exec(await readFile(new URL(`../../../supabase/${name}`,import.meta.url),'utf8'))
  }
  await db.exec('create trigger trg_employee_work_logs_manual_edit before update on employee_work_logs for each row execute function mark_employee_work_log_manual_edit()')
  await db.exec(`insert into zkt_identity_devices(device_key,plant_location,serial_number,verified,inventory_verified) values('nj','NJ','NJ-SERIAL',true,true),('pa','PA','PA-SERIAL',true,true);
    update employee_number_config set maximum=100;
    -- Explicitly authorize synthetic core lifecycle fixtures only.
    update employee_release_config set actions_enabled=true;
    grant usage on schema auth,public to service_role;
    grant select on employee_integration_operations,zkt_identity_devices,employees to service_role;`)
  return db
}
export async function mapping(db,device,employee,from,to=null) {
  const pid=(await db.query('select id from employee_employment_periods where employee_id=$1 order by id desc limit 1',[employee])).rows[0].id
  const mid=(await db.query('select record_verified_zkt_mapping($1,\'3\',$2,$3,$4,$5,\'Synthetic fixture evidence\') id',[device,employee,pid,from,to])).rows[0].id
  // Only synthetic payroll context is known in this fixture. Production
  // historical ownership evidence alone never enables automatic payroll.
  await db.query('update zkt_identifier_history set processing_verified=true where id=$1',[mid])
  return mid
}
export async function ingest(db,device,events) {
  await db.exec("set test.role='service_role'")
  return (await db.query('select ingest_zkt_identity_events($1,$2,$3) result',[device,`${device.toUpperCase()}-SERIAL`,JSON.stringify(events)])).rows[0].result
}
