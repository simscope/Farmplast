/* global process */
import {createHash,timingSafeEqual} from 'node:crypto'
import {transportFetch} from '../server/climateTransport.mjs'
const deviceHashes=['12d75152a7b6e12bca9df5cf5b9c8dacc510418dd423caf70bcec89592e735a9','f4e9079181e46369b99662ce71cee542c4cd50188e5d9ed5e7ef7bdc6f7f65da']
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store')
  const send=(status,body)=>res.status(status).json(body)
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'})
  if(!process.env.PA_CLIMATE_TRANSPORT_KEY)return send(503,{error:'MSI climate unavailable'})
  try{
    const auth=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]||'',headers={}
    if(auth)headers.Authorization='Bearer '+auth
    if(req.headers['x-device'])headers['X-Device']=req.headers['x-device']
    let body
    if(req.method==='POST'){
      body={...req.body}
      const hash=createHash('sha256').update(auth).digest('hex')
      if(!deviceHashes.includes(hash)){
        if(!auth)return send(401,{error:'Sign in to Farmplast'})
        const r=await fetch(process.env.VITE_SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+auth},redirect:'error',signal:AbortSignal.timeout(7000)})
        const user=r.ok?await r.json():null
        if(!user?.id)return send(401,{error:'Invalid Farmplast login'})
        const allowed=(process.env.PA_CLIMATE_ALLOWED_USER_IDS||process.env.SACS_SSO_ALLOWED_USER_IDS||'').split(',').map(s=>s.trim())
        if(!allowed.includes(user.id))return send(403,{error:'Climate operator access required'})
        headers['X-FP-Operator-ID']=user.id
        if(['CHECK_PIN','TARGET'].includes(body.action)){
          const hashPin=s=>createHash('sha256').update(s).digest()
          const expected=process.env.PA_CLIMATE_TARGET_PIN
          headers['X-FP-Pin-Valid']=String(!!expected&&typeof body.pin==='string'&&/^\d{4}$/.test(body.pin)&&timingSafeEqual(hashPin(body.pin),hashPin(expected)))
          delete body.pin
        }
      }
      headers['Content-Type']='application/json'
    }
    const out=await transportFetch({secret:process.env.PA_CLIMATE_TRANSPORT_KEY},new Request('https://farmplast.vercel.app/climate/v1/legacy-zone1',{method:req.method,headers,body:body?JSON.stringify(body):undefined}))
    res.setHeader('X-Farmplast-Climate-Transport','msi-https')
    return send(out.status,await out.json())
  }catch{return send(503,{error:'MSI climate unavailable'})}
}
