import {createIntegrationRunner} from './employeeIntegration.mjs'
export function createEmployeeIntegrationEndpoint({callerForToken,serviceClient,secret,url}){
  return async ({method,authorization,body})=>{
    const response=(status,error)=>({status,body:{error}})
    if(method!=='POST')return response(405,'method_not_allowed')
    const token=authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if(!token)return response(401,'unauthorized')
    if(!body||Object.keys(body).some(key=>key!=='employee_id')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.employee_id))return response(400,'invalid_selection')
    try{
      const caller=callerForToken(token),auth=await caller.auth.getUser(token)
      if(auth.error||!auth.data?.user)return response(401,'unauthorized')
      const admin=await caller.rpc('employee_archive_admin')
      if(admin.error||admin.data!==true)return response(403,'admin_required')
      const flags=await caller.rpc('employee_feature_flags_status')
      if(flags.error||(flags.data?.employee_terminate!==true&&flags.data?.employee_rehire!==true))return response(403,'employee_actions_disabled')
      if(!serviceClient)return response(503,'integration_worker_not_configured')
      const run=createIntegrationRunner({client:serviceClient(),secret,url})
      return {status:200,body:{results:await run(body.employee_id)}}
    }catch{return response(502,'integration_worker_unavailable')}
  }
}
