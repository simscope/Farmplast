import {readFile} from 'node:fs/promises'
import {initializeCreationDb,admin,peter,robert} from './employee-creation-db.mjs'
export {admin,peter,robert}
const source=async name=>readFile(new URL(`../../../supabase/${name}`,import.meta.url),'utf8')
export async function initializeSequentialDb(db) {
  await initializeCreationDb(db)
  // Exercise the currently deployed processor/compatibility definitions, not a
  // number-based substitute. Only the disposable fixture schema is extended.
  await db.exec(`alter table employee_work_logs add column downtime_hours numeric default 0,add column created_at timestamptz default now(),add column auto_closed boolean default false;
    alter table employee_work_logs rename constraint employee_work_logs_employee_id_work_date_key to employee_work_logs_employee_day_unique`)
  const compat=await source('zkt_legacy_attendance_restore.sql')
  await db.exec(compat.match(/CREATE OR REPLACE FUNCTION public.zkt_compat_event_owner\(p_raw_id uuid\)[\s\S]*?\$\$;/i)[0])
  const identity=await source('zkt_identity_attendance_integration.sql')
  for(const name of ['zkt_event_fingerprint','zkt_native_attendance_input']) {
    await db.exec(identity.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'))[0])
  }
  for(const name of ['ingest_zkt_identity_events','process_zkt_attendance_to_work_logs']) {
    await db.exec(identity.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`,'i'))[0])
  }
  await db.exec(await source('employee_sequential_numbers.sql'))
  await db.exec('update employee_number_config set maximum=100')
  return db
}
export async function createEmployee(db,name,zkt=true,selected=null) {
  return (await db.query(`insert into employees(employee_number,active,first_name,last_name,plant_location,shift_type,hire_date,hourly_rate,default_lunch_hours,zkt_enabled)
    values($1,true,$2,'Fixture','NJ','day',(now() at time zone 'America/New_York')::date,20,0,$3) returning *`,[selected,name,zkt])).rows[0]
}
export async function formerThreeFixture(db) {
  await initializeSequentialDb(db)
  await createEmployee(db,'Active one',false,1)
  await createEmployee(db,'Active two',false,2)
  // Authorize the existing lifecycle only while seeding a synthetic former #3.
  await db.exec("update employee_release_config set actions_enabled=true;update employee_feature_flags set enabled=true where flag='employee_terminate'")
  await db.query("select change_employee_employment($1,'terminate','2025-01-02')",[peter])
  await db.exec("update employee_feature_flags set enabled=false where flag='employee_terminate';update employee_release_config set actions_enabled=false")
  return db
}
