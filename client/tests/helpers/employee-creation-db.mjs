import { readFile } from 'node:fs/promises'
import { initializeIdentityDb, admin, peter, robert } from './employee-identity-db.mjs'
export { admin, peter, robert }

export async function initializeCreationDb(db, { applyFix = true } = {}) {
  try {
  await initializeIdentityDb(db, { archiveFirst: true })
  await db.exec(`
    create table employee_companies(id uuid primary key default gen_random_uuid(),company_name text,active boolean default true,created_at timestamptz default now());
    alter table employees add column pay_type text default 'hourly',add column monthly_salary numeric,
      add column overtime_enabled boolean default false,add column downtime_enabled boolean default true,
      add column exclude_from_payroll_report boolean default false,add column employer_form text,
      add column company_name text,add column photo_url text,add column created_at timestamptz default now(),
      add column zkt_name text,add column zkt_password text,add column zkt_card_number numeric,
      add column zkt_privilege integer default 0,add column zkt_sync_error text,
      add column last_payment_date date,add column last_payment_amount numeric,add column last_check_number integer,
      add constraint employees_plant_location_check check(plant_location in ('NJ','PA')),
      add constraint employees_shift_type_check check(shift_type in ('day','night')),
      add constraint employees_default_lunch_hours_check check(default_lunch_hours in (0,0.5,1));
    create unique index employees_zkt_user_id_key on employees(zkt_user_id);
    alter table employee_work_logs add column punch_error text;
    create table employee_payroll_deductions(id uuid primary key default gen_random_uuid(),employee_id uuid,period_start date,period_end date,rent numeric,electric numeric,water numeric,clean numeric,transport numeric);
    create table employee_tax_profiles(employee_id uuid primary key,payload jsonb);
    insert into employees(id,employee_number,active,hire_date,first_name,last_name,plant_location,shift_type,default_lunch_hours)
      values('${robert}',1,false,'2023-01-01','Former','Fixture','NJ','day',1);
    insert into employee_employment_periods(employee_id,employee_number,hire_date,termination_date,legacy_inactive,terminal_user_id)
      values('${robert}',2,'2022-01-01','2022-12-31',true,7);
    insert into employee_number_reservations(period_id,employee_id,employee_number,released_at)
      select id,employee_id,employee_number,now() from employee_employment_periods where employee_number=2;
    insert into zkt_attendance_logs(employee_number,punch_time,punch_time_local,raw) values(4,'2025-01-01 12:00Z','2025-01-01 07:00','{"deviceUserId":"4","timestamp":"2025-01-01 07:00:00"}');
    insert into zkt_reserved_terminal_identifiers values('6','Synthetic retained account');
    insert into employee_work_logs(employee_id,work_date,time_in,time_out,approved,is_deleted,reg_hours,labor_amount)
      values('${peter}','2025-01-02','08:00','16:00',true,false,7,140);
    insert into employee_payments(employee_id,amount) values('${peter}',140);
    insert into payroll_checks(employee_id,pay_period_start,pay_period_end,status) values('${peter}','2025-01-01','2025-01-07','paid');
    update employee_number_config set maximum=null,reuse_enabled=false;
    delete from zkt_identity_devices;
    update employee_release_config set actions_enabled=false;
    update employee_feature_flags set enabled=(flag='former_employees_archive_readonly');
    alter table employees enable row level security;
    create policy fixture_employee_read on employees for select to authenticated using(true);
    create policy fixture_employee_write on employees for all to authenticated using(auth.role()='authenticated') with check(auth.role()='authenticated');
    grant usage on schema public,auth to authenticated,anon;
    grant select,insert,update on employees to authenticated;
    grant select on employee_work_logs,employee_payments,employee_payroll_deductions,employee_tax_profiles,employee_companies,v_employee_current_presence to authenticated;
    grant insert,update on employee_tax_profiles to authenticated;
    grant select on profiles to authenticated;
  `)
  if (applyFix) await db.exec(await readFile(new URL('../../../supabase/employee_creation_fix.sql', import.meta.url), 'utf8'))
  return db
  } catch (error) {
    if (typeof db.close === 'function') await db.close()
    throw error
  }
}
