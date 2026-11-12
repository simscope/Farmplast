import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';
import { createHistoryHandler } from './handler.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(createHistoryHandler({secret:Deno.env.get('SACS_FARMPLAST_SYNC_SECRET'),read:async(id:string,offset:number)=>{
  const {data,error}=await admin.rpc('farmplast_employee_safety_history',{p_source_employee_id:id,p_offset:offset});
  if(error)throw error;return data;
}}));
