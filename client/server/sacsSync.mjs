export const employeeFields = 'id,employee_number,first_name,last_name,phone,email,position,active,plant_location,zkt_enabled,zkt_user_id,zkt_name';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validSelection(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  const keys=Object.keys(body);
  return keys.length===1 && ((keys[0]==='employee_id'&&uuid.test(body.employee_id)) || (keys[0]==='plant_location'&&['NJ','PA'].includes(body.plant_location)));
}
export function eligibleForBulk(employee,plant){
  const id=employee.zkt_user_id!==null&&employee.zkt_user_id!==undefined&&String(employee.zkt_user_id).trim()!==''?employee.zkt_user_id:employee.employee_number;
  const name=String(employee.zkt_name||`${employee.first_name||''} ${employee.last_name||''}`.trim()).trim();
  return employee.active===true&&employee.zkt_enabled===true&&employee.plant_location===plant&&id!==null&&id!==undefined&&String(id)!==''&&Boolean(name);
}
export function toSacsEmployee(e){
 return {source_employee_id:e.id,employee_number:String(e.employee_number),full_name:[e.first_name,e.last_name].filter(Boolean).join(' ').trim(),phone:e.phone??null,email:e.email??null,position:e.position??null,is_active:e.active===true};
}
export function createSacsCaller({enabled,secret,url,clientForToken,fetchImpl=fetch}){
 return async ({method,authorization,body})=>{
  if(method!=='POST')return {status:405,body:{error:'method_not_allowed'}};
  const token=typeof authorization==='string'?authorization.match(/^Bearer\s+(\S+)$/i)?.[1]:null;
  if(!token)return {status:401,body:{error:'unauthorized'}};
  if(!validSelection(body))return {status:400,body:{error:'invalid_selection'}};
  if(!enabled||!secret||!url)return {status:503,body:{error:'sacs_sync_not_enabled'}};
  try{
   const client=clientForToken(token);
   const {data:auth,error:authError}=await client.auth.getUser(token);
   if(authError||!auth?.user)return {status:401,body:{error:'unauthorized'}};
   // Use the caller's existing Farmplast RLS permissions, never a browser-supplied roster.
   let query=client.from('employees').select(employeeFields);
   query=body.employee_id?query.eq('id',body.employee_id):query.eq('plant_location',body.plant_location).eq('active',true).eq('zkt_enabled',true);
   const {data,error}=await query.order('employee_number').limit(251);
   if(error) return {status:502,body:{error:'employee_lookup_failed'}};
   if(data.length>250)return {status:413,body:{error:'roster_batch_too_large'}};
   const rows=body.employee_id?data:data.filter(e=>eligibleForBulk(e,body.plant_location));
   if(body.employee_id&&!rows.length)return {status:404,body:{error:'employee_not_found'}};
   if(!rows.length)return {status:200,body:{synced:0,failed:0,results:[]}};
   const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-farmplast-sync-secret':secret},body:JSON.stringify({employees:rows.map(toSacsEmployee)}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)return {status:502,body:{error:'sacs_unavailable'}};
   const result=await response.json();
   if(!Array.isArray(result.results)||result.results.length!==rows.length)throw Error('Invalid response');
   return {status:200,body:{synced:result.synced,failed:result.failed,results:result.results.map(r=>({source_employee_id:r.source_employee_id,employee_number:rows.find(e=>e.id===r.source_employee_id)?.employee_number,status:r.status,...(r.status==='failed'?{error:['phone_conflict','identity_conflict','unlinked_employee_requires_reconciliation','invalid_payload','invalid_identity'].includes(r.error)?r.error:'sync_failed'}:{})}))}};
  }catch{return {status:502,body:{error:'sacs_unavailable'}};}
 };
}
