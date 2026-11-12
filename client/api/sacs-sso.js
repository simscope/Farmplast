/* global process */
import { createClient } from '@supabase/supabase-js';
import { createSacsSso } from '../server/sacsSso.mjs';
export default async function handler(req,res) {
  const run=createSacsSso({
    secret:process.env.SACS_FARMPLAST_SSO_SECRET,
    url:process.env.SACS_SSO_ISSUER_URL,
    adminUrl:process.env.VITE_SACS_ADMIN_URL,
    allowedUserIds:process.env.SACS_SSO_ALLOWED_USER_IDS,
    clientForToken:token=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}),
  });
  const result=await run({method:req.method,authorization:req.headers.authorization,body:req.body});
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.status(result.status).json(result.body);
}
