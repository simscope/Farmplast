export function createIntegrationRunner({client,secret,url,fetchImpl=fetch}){
  return async employeeId=>{
    if(!secret||!url)throw Error('SACS not configured')
    const pending=await client.from('employee_integration_operations').select('id').eq('employee_id',employeeId).eq('target','SACS').in('status',['pending','failed']).order('period_id').limit(1)
    if(pending.error)throw Error('Operation lookup failed')
    const results=[]
    for(const operation of pending.data||[]){
      const claim=await client.rpc('claim_employee_integration',{p_operation_id:operation.id,p_device_key:null})
      if(claim.error){results.push({id:operation.id,status:'unavailable'});continue}
      const job=claim.data
      let result={ok:false,error:'SACS delivery unavailable'}
      try{
        if(!secret||!url)throw Error('SACS not configured')
        const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-farmplast-sync-secret':secret},
          body:JSON.stringify({employees:[job.payload]}),signal:AbortSignal.timeout(30000)})
        if(!response.ok)throw Error('SACS unavailable')
        const data=await response.json(),ack=data.results?.[0]
        if(data.results?.length!==1||ack.source_employee_id!==job.employee_id||!['created','updated'].includes(ack.status))throw Error('No identity acknowledgement')
        result={ok:true,source_employee_id:job.employee_id,is_active:job.payload.is_active}
      }catch{
        // A timed-out upstream request might still complete. Keep the claim
        // running so rehire cannot race a delayed inactive write in SACS.
        results.push({id:job.id,status:'uncertain'});continue
      }
      const finish=await client.rpc('finish_employee_integration',{p_operation_id:job.id,p_claim_token:job.claim_token,p_result:result})
      if(finish.error)throw Error('Acknowledgement could not be recorded; operation remains uncertain')
      results.push({id:job.id,status:result.ok?'succeeded':'failed'})
    }
    return results
  }
}
