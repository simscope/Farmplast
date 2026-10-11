/* global process */
import {createClient} from '@supabase/supabase-js'
import {createIntegrationRunner} from '../server/employeeIntegration.mjs'
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
  const token=req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if(!token)return res.status(401).json({error:'unauthorized'})
  if(!req.body||Object.keys(req.body).some(key=>key!=='employee_id')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.employee_id))return res.status(400).json({error:'invalid_selection'})
  try{
    const caller=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}})
    const auth=await caller.auth.getUser(token),admin=await caller.rpc('employee_archive_admin')
    if(auth.error||!auth.data?.user)return res.status(401).json({error:'unauthorized'})
    if(admin.error||admin.data!==true)return res.status(403).json({error:'admin_required'})
    if(!process.env.FARMPLAST_SERVICE_ROLE_KEY)return res.status(503).json({error:'integration_worker_not_configured'})
    const client=createClient(process.env.VITE_SUPABASE_URL,process.env.FARMPLAST_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
    const run=createIntegrationRunner({client,secret:process.env.SACS_FARMPLAST_SYNC_SECRET,url:process.env.SACS_EMPLOYEE_SYNC_URL})
    return res.status(200).json({results:await run(req.body.employee_id)})
  }catch{return res.status(502).json({error:'integration_worker_unavailable'})}
}
