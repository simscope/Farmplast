import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';
import { createHandler } from './handler.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(createHandler({
  secret:Deno.env.get('SACS_FARMPLAST_SYNC_SECRET'),
  additionalSecrets:[Deno.env.get('SACS_FARMPLAST_MSI_SYNC_SECRET')],
  enabled:async()=>{
    const {data,error}=await admin.from('farmplast_sync_config').select('enabled').eq('singleton',true).single();
    if(error) throw error;
    return data.enabled;
  },
  sync:async(employee:unknown)=>{
    const {data,error}=await admin.rpc('sync_farmplast_employee',{p_employee:employee});
    if(error) throw error;
    return data;
  }
}));
