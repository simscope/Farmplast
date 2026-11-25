import {createUserVerifier} from './verifiedUser.mjs'
const producers=new Set(['chiller-1','chiller-2','chiller-3'])
const readStatusRpcs=new Set(['ch1_firmware_status','chiller_firmware_status'])
async function requestBody(req,limit){
 if(Number(req.headers['content-length'])>limit)throw Error('Request too large')
 if(req.body!==undefined){const body=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));if(body.length>limit)throw Error('Request too large');return body}
 const parts=[];let size=0
 for await(const part of req){size+=part.length;if(size>limit)throw Error('Request too large');parts.push(Buffer.from(part))}
 return Buffer.concat(parts)
}
export function createNjControlHandler(env,fetcher=fetch){
 const verifyUser=createUserVerifier({fetchImpl:fetcher})
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff')
  const send=(status,message)=>res.status(status).json({message})
  const params=new URL(req.url,'https://farmplast.vercel.app').searchParams
  const kind=req.query?.kind||params.get('kind')
  const device=req.query?.device||params.get('device')
  const upstream=env.NJ_TELEMETRY_UPSTREAM
  if(upstream!=='https://msi.tail4626fb.ts.net:10000')return send(503,'MSI not configured')
  let target,headers={},method,preparedBody
  if(kind==='report'){
   if(!producers.has(device))return send(404,'Unknown controller')
   if(req.method!=='POST')return send(405,'POST required')
   const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
   if(!token)return send(401,'Device authentication required')
   target=new URL(upstream+'/v1/report/'+device);headers.Authorization='Bearer '+token;method='POST'
  }else if(kind==='signed-download'){
   if(req.method!=='GET')return send(405,'GET required')
   const object=req.query?.object||params.get('object')||''
   const slash=object.indexOf('/')
   target=new URL(upstream+'/v1/storage/download')
   target.search=new URLSearchParams({bucket:object.slice(0,slash),path:object.slice(slash+1),token:params.get('token')||''}).toString();method='GET'
  }else{
   if(!['rpc','upload','download','sign'].includes(kind))return send(404,'Unknown operation')
   method=kind==='download'?'GET':'POST'
   if(req.method!==method)return send(405,method+' required')
   const token=req.headers.authorization?.match(/^Bearer (\S{20,4096})$/)?.[1]
   if(!token)return send(401,'Sign in to Farmplast')
   const allow=(env.NJ_TELEMETRY_ALLOWED_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean)
   if(!env.NJ_CONTROL_API_KEY||!allow.length)return send(503,'MSI control not configured')
   let readOnly=false
   if(kind==='rpc'){
    // Vercel disables bodyParser here: classify the same bounded bytes that will
    // be forwarded, including real streamed requests, never browser headers.
    try{preparedBody=await requestBody(req,32768)}catch{return send(413,'Request too large')}
    try{readOnly=readStatusRpcs.has(JSON.parse(preparedBody.toString('utf8')).name)}catch{/* Upstream retains its existing payload validation. */}
   }
   try{
    const user=await verifyUser({authUrl:env.VITE_SUPABASE_URL,authAnonKey:env.VITE_SUPABASE_ANON_KEY},token,{readOnly})
    if(!user)return send(401,'Invalid login')
    if(!allow.includes(user.id))return send(403,'Operator access required')
    headers={Authorization:'Bearer '+env.NJ_CONTROL_API_KEY,'X-Operator-ID':user.id}
   }catch{return send(503,'Authentication unavailable')}
   target=new URL(upstream+(kind==='rpc'?'/v1/control/rpc':'/v1/storage/'+kind))
   if(kind!=='rpc')target.search=new URLSearchParams({bucket:req.query?.bucket||params.get('bucket')||'',path:req.query?.path||params.get('path')||''}).toString()
  }
  try{
   let body
   if(method==='POST'){
    const limit=kind==='upload'?1310720:32768
    try{body=preparedBody??await requestBody(req,limit)}catch{return send(413,'Request too large')}
    headers['Content-Type']=kind==='upload'?'application/octet-stream':'application/json'
   }
   const reply=await fetcher(target,{method,headers,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})
   const limit=['download','signed-download'].includes(kind)?1310720:65536
   const reader=reply.body?.getReader();const parts=[];let size=0
   if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return send(502,'Invalid MSI response')}parts.push(Buffer.from(value))}}finally{reader.releaseLock()}}
   res.setHeader('Content-Type',reply.headers.get('Content-Type')?.startsWith('application/octet-stream')?'application/octet-stream':'application/json')
   return res.status(reply.status).send(Buffer.concat(parts))
  }catch{return send(503,'MSI unavailable')}
 }
}
