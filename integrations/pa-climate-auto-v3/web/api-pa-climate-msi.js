/* Deploy this complete file as client/api/pa-climate-msi.js in the CURRENT live Farmplast source.
 * Keeps all climate telemetry and firmware on MSI. Vercel acts as an authenticated web proxy only.
 * Required server-only Vercel env: PA_CLIMATE_MSI_BASE_URL,
 * PA_CLIMATE_ALLOWED_USER_IDS. Existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are reused.
 */

const validZone = s => typeof s==='string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s)
const send=(res,status,data)=>res.status(status).json(data)

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store')
  const base=process.env.PA_CLIMATE_MSI_BASE_URL
  const allow=(process.env.PA_CLIMATE_ALLOWED_USER_IDS||process.env.SACS_SSO_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)
  const supaUrl=process.env.VITE_SUPABASE_URL
  const supaKey=process.env.VITE_SUPABASE_ANON_KEY
  if(!base||!supaUrl||!supaKey||!allow.length)return send(res,503,{error:'Climate MSI bridge not configured'})
  let origin
  try{
    origin=new URL(base)
    if(origin.protocol!=='https:'||origin.pathname!=='/climate'||origin.search||origin.hash)throw Error()
  }catch{return send(res,503,{error:'Climate MSI HTTPS URL invalid'})}
  const credential=req.headers.authorization?.match(/^Bearer (\S{20,4096})$/)?.[1]
  if(!credential)return send(res,401,{error:'Login required'})
  let verified
  try {
    const auth=await fetch(supaUrl+'/auth/v1/user',{headers:{apikey:supaKey,Authorization:'Bearer '+credential},redirect:'error',signal:AbortSignal.timeout(7000)})
    verified=auth.ok?await auth.json():null
  }catch{return send(res,503,{error:'Farmplast authentication unavailable'})}
  if(!verified?.id)return send(res,401,{error:'Invalid login'})
  if(!allow.includes(verified.id))return send(res,403,{error:'Climate operator access required'})
  let url,method,payload,extra={}
  if(req.method==='GET'){
    method='GET'
    url=req.query?.view==='jobs'?'/operator/ota':req.query?.view==='releases'?'/operator/releases':'/operator/zones'
  }else if(req.method==='POST'){
    const action=req.body?.action||'set'
    if(action==='set'){
      if(!validZone(req.body?.zone_id)||!Number.isFinite(req.body?.target_f)||req.body.target_f<45||req.body.target_f>90||!['AUTO','MANUAL','OFF'].includes(req.body.mode)||typeof req.body.manual_heat!=='boolean')return send(res,400,{error:'Invalid climate command'})
      method='POST';url=`/operator/zones/${req.body.zone_id}/desired`
      payload=JSON.stringify({target_f:req.body.target_f,mode:req.body.mode,manual_heat:req.body.manual_heat})
      extra={'Content-Type':'application/json'}
    }else if(action==='ota'){
      if(!validZone(req.body?.device_id)||!(/^[a-f0-9]{64}$/.test(req.body?.sha256||'')))return send(res,400,{error:'Invalid OTA request'})
      method='POST';url='/operator/ota'
      payload=JSON.stringify({device_id:req.body.device_id,sha256:req.body.sha256,confirm:'STAGE PA OTA'})
      extra={'Content-Type':'application/json'}
    }else if(action==='upload'){
      const version=req.body?.version, b64=req.body?.firmware_base64
      if(typeof version!=='string'||!(/^[A-Za-z0-9._-]{1,48}$/.test(version))||typeof b64!=='string'||b64.length>1800000||!(/^[A-Za-z0-9+/]+={0,2}$/.test(b64)))return send(res,400,{error:'Invalid firmware upload'})
      payload=Buffer.from(b64,'base64')
      if(payload.length<256||payload.length>1310720)return send(res,400,{error:'Firmware size invalid'})
      method='POST';url='/operator/releases'
      extra={'Content-Type':'application/octet-stream','X-Firmware-Model':'PA-ESP32-WROOM32E-N4-R1','X-Firmware-Version':version}
    }else return send(res,400,{error:'Unsupported action'})
  }else return send(res,405,{error:'Method not allowed'})
  try{
    const out=await fetch(origin.origin+origin.pathname+url,{method,
      headers:{Authorization:'Bearer '+credential,...extra,'Cache-Control':'no-store'},
      body:payload,
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)})
    const body=await out.json()
    return send(res,out.status,body)
  }catch{
    return send(res,503,{error:'MSI climate server unreachable'})
  }
}