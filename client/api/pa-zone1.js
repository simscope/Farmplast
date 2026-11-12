/* global process, Buffer */
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const bucket='pa-climate-zone1-private',bridgeHash='12d75152a7b6e12bca9df5cf5b9c8dacc510418dd423caf70bcec89592e735a9'
const actions=['AUTO','MANUAL','OFF','HEAT_ON','HEAT_OFF','TARGET']
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store')
 const send=(code,body)=>res.status(code).json(body)
 const base=process.env.VITE_SUPABASE_URL,key=process.env.FARMPLAST_SERVICE_ROLE_KEY
 if(!base||!key)return send(503,{error:'unavailable'})
 const auth=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]||''
 const bridge=auth.length>0&&timingSafeEqual(createHash('sha256').update(auth).digest(),Buffer.from(bridgeHash,'hex'))
 const direct=auth.length>0 && timingSafeEqual(createHash('sha256').update(auth).digest(),Buffer.from('f4e9079181e46369b99662ce71cee542c4cd50188e5d9ed5e7ef7bdc6f7f65da','hex'))
 const headers={apikey:key,Authorization:'Bearer '+key}
 async function read(name){
  const r=await fetch(base+'/storage/v1/object/authenticated/'+bucket+'/'+name+'?read='+randomUUID(),{headers,cache:'no-store'})
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===404||String(e.statusCode)==='404')return null;throw Error('read')}
  return r.json()
 }
 async function save(name,value){const r=await fetch(base+'/storage/v1/object/'+bucket+'/'+name,{method:'POST',headers:{...headers,'Content-Type':'application/json','x-upsert':'true','Cache-Control':'0'},body:JSON.stringify(value)});if(!r.ok)throw Error('save')}
 try{
  const now=Date.now();let b=req.body
  if(req.method==='POST'&&(bridge||direct)){
   if(direct){
    if(req.headers['x-device']!=='PA-70D38CA99B20'||b?.id!=='PA-70D38CA99B20'||b.zone!=='pa-zone-1'||b.model!=='PA-WROOM32E-4M-R1')return send(403,{error:'device mismatch'})
    b={...b,at:now,fault:!!(b.pinFault||b.sensorFault||!b.relayConfigured)}
   }
   if(!b||!Number.isSafeInteger(b.at)||b.at>now+5000||now-b.at>30000||!Number.isFinite(b.temperature)||![0,1,2].includes(b.mode)||typeof b.output!=='boolean'||typeof b.fault!=='boolean'||!Number.isSafeInteger(b.revision))return send(400,{error:'invalid sample'})
   const s={at:Math.min(b.at,now),temperature:b.temperature,wifi:Number.isFinite(b.wifi)?b.wifi:null,target:Number.isFinite(b.target)?b.target:null,band:Number.isFinite(b.band)?b.band:null,mode:b.mode,output:b.output,fault:b.fault,revision:b.revision,version:direct?String(b.version).slice(0,32):null,network:direct?(b.network==='backup'?'backup':'primary'):null}
   try{await save('sample.json',s)}catch{
    const storage=createClient(base,key,{auth:{persistSession:false}}).storage
    const info=await storage.getBucket(bucket)
    if(info.data?.public)throw Error('bucket must be private')
    if(!info.data){const result=await storage.createBucket(bucket,{public:false,fileSizeLimit:8192,allowedMimeTypes:['application/json']});if(result.error)throw Error('create')}
    await save('sample.json',s)
   }
   const c=await read('command.json');if(direct){
    const eligible=c?.expires>now&&c.revision===s.revision&&(!c.action.startsWith('HEAT_')||s.mode===1)&&!(c.action==='HEAT_ON'&&s.fault)
    const settings=eligible?{revision:s.revision+1,target:c.action==='TARGET'?c.target:s.target,band:s.band,dwell:b.dwell,mode:({AUTO:0,MANUAL:1,OFF:2,HEAT_ON:1,HEAT_OFF:1})[c.action]??s.mode,manual:c.action==='TARGET'?b.manual===true:c.action==='HEAT_ON'}:null
    return send(200,{ack:true,settings})
   }
   return send(200,{command:c?.expires>now?c:null})
  }
  if(req.method==='GET'){const s=await read('sample.json');return send(200,s&&now-s.at<30000?s:{offline:true})}
  if(req.method!=='POST')return send(405,{error:'method'})
  if(!auth)return send(401,{error:'sign in'})
  const caller=createClient(base,process.env.VITE_SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+auth}},auth:{persistSession:false}})
  const {data,error}=await caller.auth.getUser(auth);if(error||!data.user)return send(401,{error:'sign in'})
  const profile=await caller.from('profiles').select('role').eq('id',data.user.id).single()
  if(profile.error||profile.data?.role!=='admin')return send(403,{error:'admin required'})
  if(b?.action==='TARGET'||b?.action==='CHECK_PIN'){
    const file='pin-'+data.user.id+'.json',t=await read(file),active=t?.until>now
    if(active&&t.count>=5)return send(429,{error:'Wait five minutes before retrying.'})
    const hash=v=>createHash('sha256').update(v).digest(),expected=process.env.PA_CLIMATE_TARGET_PIN
    if(!expected||typeof b.pin!=='string'||!/^\d{4}$/.test(b.pin)||!timingSafeEqual(hash(b.pin),hash(expected))){
      await save(file,{count:active?t.count+1:1,until:active?t.until:now+300000});return send(403,{error:'Incorrect temperature PIN.'})
    }
    if(t?.count)await save(file,{count:0,until:0})
    if(b.action==='CHECK_PIN')return send(200,{ok:true})
  }
  if((b?.action==='TARGET'&&(!Number.isFinite(b.target)||b.target<40||b.target>90))||!actions.includes(b?.action)||!Number.isSafeInteger(b.revision))return send(400,{error:'invalid command'})
  const s=await read('sample.json');if(!s||now-s.at>=25000||s.revision!==b.revision||(b.action.startsWith('HEAT_')&&s.mode!==1)||(b.action==='HEAT_ON'&&s.fault))return send(409,{error:'refresh state'})
  await save('command.json',{id:randomUUID(),action:b.action,...(b.action==='TARGET'?{target:b.target}:{}),revision:s.revision,expires:now+20000});return send(202,{queued:true})
 }catch{return send(503,{error:'unavailable'})}
}
