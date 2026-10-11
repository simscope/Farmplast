/* global process */
import {createClient} from '@supabase/supabase-js'
import {createEmployeeIntegrationEndpoint} from '../server/employeeIntegrationEndpoint.mjs'
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  const run=createEmployeeIntegrationEndpoint({
    callerForToken:token=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}}),
    serviceClient:process.env.FARMPLAST_SERVICE_ROLE_KEY?()=>createClient(process.env.VITE_SUPABASE_URL,process.env.FARMPLAST_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null,
    secret:process.env.SACS_FARMPLAST_SYNC_SECRET,url:process.env.SACS_EMPLOYEE_SYNC_URL,
  })
  const result=await run({method:req.method,authorization:req.headers.authorization,body:req.body})
  return res.status(result.status).json(result.body)
}