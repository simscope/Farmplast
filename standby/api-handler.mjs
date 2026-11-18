import {createClient} from '@supabase/supabase-js'
import {createSacsSso} from '../client/server/sacsSso.mjs'
import {createSacsCaller} from '../client/server/sacsSync.mjs'
import {createEmployeeIntegrationEndpoint} from '../client/server/employeeIntegrationEndpoint.mjs'
import {createSafetyHistoryReader} from '../client/server/employeeSafetyHistory.mjs'
export async function handleApi(route,request,env){
 const clientForToken=token=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
 if(route==='/api/sacs-sso')return createSacsSso({secret:env.SACS_FARMPLAST_SSO_SECRET,url:env.SACS_SSO_ISSUER_URL,adminUrl:env.VITE_SACS_ADMIN_URL,allowedUserIds:env.SACS_SSO_ALLOWED_USER_IDS,clientForToken})(request)
 if(route==='/api/sync-sacs')return createSacsCaller({enabled:env.SACS_SYNC_ENABLED==='true',secret:env.SACS_FARMPLAST_SYNC_SECRET,url:env.SACS_EMPLOYEE_SYNC_URL,clientForToken})(request)
 if(route==='/api/employee-integrations')return createEmployeeIntegrationEndpoint({callerForToken:clientForToken,serviceClient:()=>createClient(env.VITE_SUPABASE_URL,env.FARMPLAST_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),secret:env.SACS_FARMPLAST_SYNC_SECRET,url:env.SACS_EMPLOYEE_SYNC_URL})(request)
 if(route==='/api/employee-safety-history')return createSafetyHistoryReader({clientForToken,secret:env.SACS_FARMPLAST_SYNC_SECRET,url:env.SACS_EMPLOYEE_HISTORY_URL})(request)
 return {status:404,body:{error:'unknown_endpoint'}}
}
