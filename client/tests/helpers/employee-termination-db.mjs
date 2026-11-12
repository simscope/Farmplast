import {readFile} from 'node:fs/promises'
import {initializeSequentialDb,createEmployee,admin,peter,robert} from './employee-sequential-db.mjs'
export {admin,peter,robert}
export async function initializeTerminationDb(db) {
 await initializeSequentialDb(db)
 await createEmployee(db,'Active one',false,1);await createEmployee(db,'Active two',false,2)
 // Historical closed rows carry approved=false, but there is no approval UI.
 await db.exec('update employee_work_logs set approved=false')
 await db.exec(await readFile(new URL('../../../supabase/restore_employee_termination.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../../supabase/employee_termination_without_settlement.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../../supabase/employee_termination_async_sacs.sql',import.meta.url),'utf8'))
 return db
}
