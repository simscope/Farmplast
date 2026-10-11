/* global process */
import {createClient} from '@supabase/supabase-js'
import {createSafetyHistoryReader} from '../server/employeeSafetyHistory.mjs'
export default async function handler(req,res){
  const read=createSafetyHistoryReader({secret:process.env.SACS_FARMPLAST_SYNC_SECRET,url:process.env.SACS_EMPLOYEE_HISTORY_URL,
    clientForToken:token=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})})
  const result=await read({method:req.method,authorization:req.headers.authorization,body:req.body})
  res.setHeader('Cache-Control','no-store');return res.status(result.status).json(result.body)
}
