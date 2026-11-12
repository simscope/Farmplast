/* global process, Buffer */
import {transportFetch} from '../server/climateTransport.mjs'
import legacyHandler from './pa-zone1.js'
export const config={api:{bodyParser:{sizeLimit:'2mb'}}}
export const maxDuration=30
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s)
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store')
 const send=(code,body)=>res.status(code).json(body)
 const token=req.headers.authorization?.match(/^Bearer (\S{20,4096})$/)?.[1]
 if(!token)return send(401,{error:'Sign in to Farmplast.'})
 const allow=(process.env.PA_CLIMATE_ALLOWED_USER_IDS||process.env.SACS_SSO_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)
 if(!allow.length||!process.env.PA_CLIMATE_TRANSPORT_KEY)return send(503,{error:'MSI bridge not configured'})
 try {
  const auth=await fetch(process.env.VITE_SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(7000)})
  const user=auth.ok?await auth.json():null
  if(!user?.id)return send(401,{error:'Invalid Farmplast login'})
  if(!allow.includes(user.id))return send(403,{error:'Climate operator access required'})
  let suffix,body,extra={}
  if(req.method==='GET')suffix=req.query.view==='releases'?'/releases':req.query.view==='jobs'?'/ota':'/zones'
  else if(req.method==='POST'){
   const b=req.body||{}
   if(b.action==='installer')suffix='/installer'
   else if(['set','mode','heat'].includes(b.action)){
    if(!validId(b.zone_id))return send(400,{error:'Invalid zone'})
    suffix='/zones/'+b.zone_id+'/desired'
    if(b.action==='set'){
     if(!Number.isFinite(b.target_f)||b.target_f<40||b.target_f>90)return send(400,{error:'Invalid target'})
     let pinStatus=503,pinBody={error:'PIN check unavailable'}
     await legacyHandler({method:'POST',headers:req.headers,body:{action:'CHECK_PIN',pin:b.pin}}, {setHeader(){},status(code){pinStatus=code;return this},json(value){pinBody=value}})
     if(pinStatus!==200)return send(pinStatus,pinBody)
     body=JSON.stringify({target_f:b.target_f})
    }else if(b.action==='mode'){
     if(!['AUTO','MANUAL','OFF'].includes(b.mode))return send(400,{error:'Invalid mode'})
     body=JSON.stringify({mode:b.mode})
    }else{
     if(typeof b.manual_heat!=='boolean')return send(400,{error:'Invalid heat command'})
     body=JSON.stringify({mode:'MANUAL',manual_heat:b.manual_heat})
    }
    extra={'Content-Type':'application/json'}
   }else if(b.action==='ota'){
    if(!validId(b.device_id)||!/^[a-f0-9]{64}$/.test(b.sha256||''))return send(400,{error:'Invalid OTA request'})
    suffix='/ota';body=JSON.stringify({device_id:b.device_id,sha256:b.sha256,confirm:'STAGE PA OTA'});extra={'Content-Type':'application/json'}
   }else if(b.action==='upload'){
    if(typeof b.version!=='string'||!/^[A-Za-z0-9._-]{1,48}$/.test(b.version)||typeof b.firmware_base64!=='string'||b.firmware_base64.length>1800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.firmware_base64))return send(400,{error:'Invalid firmware upload'})
    body=Buffer.from(b.firmware_base64,'base64');suffix='/releases';extra={'Content-Type':'application/octet-stream','X-Firmware-Model':'PA-ESP32-WROOM32E-N4-R1','X-Firmware-Version':b.version}
   }else return send(400,{error:'Unsupported action'})
  }else return send(405,{error:'Method not allowed'})
  const request=new Request('https://farmplast.vercel.app/climate/operator'+suffix,{method:req.method,headers:{Authorization:'Bearer '+token,...extra},body,duplex:'half'})
  const out=await transportFetch({supabaseUrl:process.env.VITE_SUPABASE_URL,anonKey:process.env.VITE_SUPABASE_ANON_KEY,secret:process.env.PA_CLIMATE_TRANSPORT_KEY},request)
  for(const name of ['content-type','content-disposition'])if(out.headers.has(name))res.setHeader(name,out.headers.get(name))
  return res.status(out.status).end(Buffer.from(await out.arrayBuffer()))
 }catch{return send(503,{error:'MSI climate unavailable'})}
}
