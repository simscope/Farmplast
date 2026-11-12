/* global process */
import { createClient } from '@supabase/supabase-js';
import { createSacsCaller } from '../server/sacsSync.mjs';
export default async function handler(req,res){
 const run=createSacsCaller({
  enabled:process.env.SACS_SYNC_ENABLED==='true',
  secret:process.env.SACS_FARMPLAST_SYNC_SECRET,
  url:process.env.SACS_EMPLOYEE_SYNC_URL,
  clientForToken:token=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
 });
 const result=await run({method:req.method,authorization:req.headers.authorization,body:req.body});
 res.setHeader('Cache-Control','no-store');
 return res.status(result.status).json(result.body);
}
