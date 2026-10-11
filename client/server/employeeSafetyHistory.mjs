const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function createSafetyHistoryReader({clientForToken,secret,url,fetchImpl=fetch}){
  return async({method,authorization,body})=>{
    if(method!=='POST')return {status:405,body:{error:'method_not_allowed'}}
    const token=authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if(!token)return {status:401,body:{error:'unauthorized'}}
    if(!body||Object.keys(body).some(key=>!['employee_id','offset'].includes(key))||!uuid.test(body.employee_id)||
      !Number.isInteger(body.offset??0)||(body.offset??0)<0||(body.offset??0)>100000)return {status:400,body:{error:'invalid_selection'}}
    try{
      const client=clientForToken(token)
      const auth=await client.auth.getUser(token)
      if(auth.error||!auth.data?.user)return {status:401,body:{error:'unauthorized'}}
      const admin=await client.rpc('employee_archive_admin')
      if(admin.error||admin.data!==true)return {status:403,body:{error:'admin_required'}}
      const employee=await client.from('employees').select('id').eq('id',body.employee_id).maybeSingle()
      if(employee.error)return {status:502,body:{error:'employee_lookup_failed'}}
      if(!employee.data)return {status:404,body:{error:'employee_not_found'}}
      if(!secret||!url)return {status:503,body:{error:'sacs_history_not_configured'}}
      const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-farmplast-sync-secret':secret},
        body:JSON.stringify({source_employee_id:employee.data.id,offset:body.offset??0}),signal:AbortSignal.timeout(30000)})
      if(!response.ok)return {status:502,body:{error:'sacs_history_unavailable'}}
      const data=await response.json()
      if(data.source_employee_id!==employee.data.id||!Array.isArray(data.records)||!Array.isArray(data.assignments)||!Array.isArray(data.group_assignments))throw Error('Invalid history identity')
      return {status:200,body:data}
    }catch{return {status:502,body:{error:'sacs_history_unavailable'}}}
  }
}
