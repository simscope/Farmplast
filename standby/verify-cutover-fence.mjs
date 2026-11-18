import fs from 'node:fs/promises'
import path from 'node:path'
import {ROOT,assertCluster,readJson,sql} from './runtime-utils.mjs'
await assertCluster()
const state=await readJson(path.join(ROOT,'runtime/status.json'))
if(state.mode!=='standby'||!state.ready)throw Error('Standby-only transactional acceptance')
const fence=(await fs.readFile(new URL('./fence-source.sql',import.meta.url),'utf8')).replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
await sql(state.generation,[
 'BEGIN;',
 "UPDATE _farmplast_reserve.state SET mode='active' WHERE id;",
 fence,
 "DO $$BEGIN BEGIN UPDATE public.employees SET first_name=first_name WHERE id=(SELECT id FROM public.employees LIMIT 1);RAISE EXCEPTION 'Fence did not block writes';EXCEPTION WHEN read_only_sql_transaction THEN IF SQLERRM <> 'Payroll is frozen for MSI cutover' THEN RAISE;END IF;END;END$$;",
 'UPDATE farmplast_zkt_private.msi_cutover_fence SET frozen=false WHERE id;',
 'UPDATE public.employees SET first_name=first_name WHERE id=(SELECT id FROM public.employees LIMIT 1);',
 'ROLLBACK;'
].join('\n'))
if((await sql(state.generation,"select mode||':'||(to_regclass('farmplast_zkt_private.msi_cutover_fence') is null)::text from _farmplast_reserve.state where id;")).trim()!=='standby:true')throw Error('Acceptance transaction did not roll back')
console.log(JSON.stringify({sourceFenceTestedOnMsiOnly:true,frozenWritesDenied:true,unfreezeTested:true,transactionRolledBack:true,sourceCloudUnchanged:true}))
