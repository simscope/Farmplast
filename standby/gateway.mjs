import http from 'node:http'
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {pipeline} from 'node:stream/promises'

const ROOT='E:/SimScopeData/Farmplast/PayrollStandby'
const READ_RPCS=new Set(['employee_archive_admin','employee_archive_capabilities','employee_feature_flags_status','can_use_sacs_sso','list_former_employees','employee_termination_preview','preview_restore_former_employee','next_available_employee_number'])
const CACHED_RPCS=new Set(['refresh_employee_presence','process_zkt_attendance_to_work_logs'])
const CONTENT_TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.ttf':'font/ttf','.woff2':'font/woff2'}
export function restDecision(method,pathname,mode){
 if(['GET','HEAD'].includes(method))return 'proxy'
 if(mode==='active')return 'proxy'
 const rpc=pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1]
 if(method==='POST'&&CACHED_RPCS.has(rpc))return 'snapshot'
 if(method==='POST'&&READ_RPCS.has(rpc))return 'proxy'
 return 'blocked'
}
function claims(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))}catch{return null}}
function tokenFrom(req){return req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]||req.headers.cookie?.match(/(?:^|;\s*)fp_payroll_reserve=([^;]+)/)?.[1]}
async function readBody(req,max=262144){
 let size=0;const chunks=[]
 for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('body_too_large');chunks.push(chunk)}
 return Buffer.concat(chunks)
}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
export function createGateway({readStatus,readBuild,readPhotos,webRoot,apiHandler,fetcher=fetch,authBase='http://127.0.0.1:18623',restBase='http://127.0.0.1:18621',storageBase='http://127.0.0.1:18624'}){
 async function caller(req){
  const token=tokenFrom(req);if(!token)return null
  if(claims(token)?.role==='service_role'){
   const response=await fetcher(restBase+'/',{method:'HEAD',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)})
   return response.ok?{kind:'service',token}:null
  }
  const response=await fetcher(authBase+'/user',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)})
  if(!response.ok)return null
  const user=await response.json()
  return /^[0-9a-f-]{36}$/i.test(user.id||'')?{kind:'user',token,id:user.id}:null
 }
 async function proxy(req,res,url,{body,photoBase,rewrite=false,auth=false}={}){
  const headers={}
  for(const key of ['authorization','apikey','content-type','prefer','range','range-unit','accept','accept-profile','content-profile','x-upsert'])if(req.headers[key])headers[key]=req.headers[key]
  if(!headers.authorization&&tokenFrom(req))headers.authorization='Bearer '+tokenFrom(req)
  const response=await fetcher(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'error',signal:AbortSignal.timeout(60000)})
  for(const key of ['content-type','content-range','range-unit','preference-applied','location'])if(response.headers.has(key))res.setHeader(key,response.headers.get(key))
  if(auth&&req.method==='POST'&&new URL(url).pathname==='/logout')res.setHeader('Set-Cookie','fp_payroll_reserve=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')
  if((auth||rewrite)&&response.headers.get('content-type')?.includes('json')){
   let text=await response.text()
   if(auth&&response.ok){
    try{const data=JSON.parse(text);if(data.access_token)res.setHeader('Set-Cookie','fp_payroll_reserve='+data.access_token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age='+Math.min(Number(data.expires_in)||3600,86400))}catch{}
   }
   if(rewrite)text=text.replaceAll('https://eeobivvwjzakbweluwtm.supabase.co/storage/v1/object/public/employee-photos/',photoBase+'/supabase/storage/v1/object/public/employee-photos/')
   res.writeHead(response.status);res.end(text);return
  }
  res.writeHead(response.status)
  if(req.method==='HEAD'||!response.body){res.end();return}
  await pipeline(response.body,res)
 }
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('X-Content-Type-Options','nosniff')
  try{
   if(/%2f|%5c|%00|\\/i.test(req.url))return send(res,400,{message:'Invalid path'})
   const build=await readBuild(),origin=req.headers.origin
   const origins=new Set([build.url,'https://farmplast.vercel.app'])
   if(origin&&!origins.has(origin))return send(res,403,{message:'Origin not allowed'})
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true')}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,prefer,range,range-unit,x-upsert,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS');res.writeHead(204);res.end();return}
   const parsed=new URL(req.url,'http://127.0.0.1'),state=await readStatus()
   let pathname=parsed.pathname
   if(pathname.startsWith('/farmplast-payroll/'))pathname=pathname.slice('/farmplast-payroll'.length)
   if(pathname==='/healthz'||pathname==='/api/standby-status')return send(res,200,{mode:state.mode,ready:state.ready,snapshotAt:state.snapshotAt,refreshing:!!state.refreshing,lastRefreshError:state.lastRefreshError||null})
   if(pathname==='/api/reserve/bridge-health'){
    const user=await caller(req);if(user?.kind!=='service')return send(res,401,{message:'Bridge authorization required'})
    return send(res,200,{ready:state.ready,mode:state.mode,commandsEnabled:state.mode==='active',snapshotAt:state.snapshotAt})
   }
   if(pathname.startsWith('/supabase/auth/v1/')){
    const route=pathname.slice('/supabase/auth/v1'.length)
    const allowed=(req.method==='GET'&&['/settings','/health','/user'].includes(route))||
      (req.method==='POST'&&['/token','/logout'].includes(route))||
      (state.mode==='active'&&['/user','/recover','/verify'].includes(route))
    if(!allowed||route.startsWith('/admin'))return send(res,423,{message:'Payroll reserve: account changes are disabled until activation'})
    if(!state.ready)return send(res,503,{message:'Payroll reserve is being updated'})
    const body=['GET','HEAD'].includes(req.method)?undefined:await readBody(req)
    return await proxy(req,res,authBase+route+parsed.search,{body,auth:true})
   }
   if(pathname==='/supabase/rest/v1'||pathname.startsWith('/supabase/rest/v1/')){
    if(!state.ready)return send(res,503,{message:'Payroll reserve is being updated'})
    const user=await caller(req)
    if(!user)return send(res,401,{message:'Sign in to Payroll'})
    if(user.kind==='service'&&state.mode!=='active')return send(res,423,{message:'Standby terminal and integration workers are disabled'})
    const route=pathname.slice('/supabase'.length),decision=restDecision(req.method,route,state.mode)
    if(decision==='blocked'){req.resume();return send(res,423,{message:'Payroll reserve is read-only until activation',code:'STANDBY_READ_ONLY'})}
    if(decision==='snapshot'){req.resume();return send(res,200,{standby:true,snapshot_at:state.snapshotAt,processing_skipped:true})}
    const body=['GET','HEAD'].includes(req.method)?undefined:await readBody(req)
    return await proxy(req,res,restBase+route.slice('/rest/v1'.length)+parsed.search,{body,photoBase:build.url,rewrite:true})
   }
   if(pathname.startsWith('/supabase/storage/v1/')){
    const user=await caller(req)
    if(user?.kind!=='user')return send(res,401,{message:'Sign in to Payroll'})
    if(!state.ready)return send(res,503,{message:'Payroll reserve is being updated'})
    const route=pathname.slice('/supabase/storage/v1'.length)
    if(['GET','HEAD'].includes(req.method)&&route.startsWith('/object/public/employee-photos/')){
     if(state.mode==='active')return await proxy(req,res,storageBase+route+parsed.search)
     const name=decodeURIComponent(route.slice('/object/public/employee-photos/'.length))
     const photos=await readPhotos(state),photo=photos[name]
     if(!photo||!/^[0-9a-f-]{36}\.blob$/i.test(photo.file))return send(res,404,{message:'Photo not found'})
     res.writeHead(200,{'Content-Type':photo.type,'Content-Length':photo.size,'Cache-Control':'private, max-age=300'})
     if(req.method==='HEAD'){res.end();return}
     return await pipeline(createReadStream(path.join(state.release,'photos',photo.file)),res)
    }
    if(state.mode!=='active'){req.resume();return send(res,423,{message:'Payroll reserve is read-only until activation'})}
    const body=['GET','HEAD'].includes(req.method)?undefined:await readBody(req,52428800)
    return await proxy(req,res,storageBase+route+parsed.search,{body})
   }
   if(pathname.startsWith('/api/')){
    const user=await caller(req)
    if(user?.kind!=='user')return send(res,401,{message:'Sign in to Payroll'})
    if(state.mode!=='active'){req.resume();return send(res,423,{message:'Payroll reserve: external actions are disabled until activation'})}
    const body=req.method==='GET'?undefined:JSON.parse((await readBody(req)).toString('utf8')||'{}')
    const result=await apiHandler(pathname,{method:req.method,authorization:'Bearer '+user.token,body})
    return send(res,result.status,result.body)
   }
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{message:'Method not allowed'})
   if(pathname.startsWith('/monitoring')){res.writeHead(302,{Location:'/dashboard'});res.end();return}
   const decoded=decodeURIComponent(pathname),file=path.resolve(webRoot,'.'+decoded)
   if(!file.startsWith(path.resolve(webRoot)+path.sep)&&file!==path.resolve(webRoot))return send(res,400,{message:'Invalid path'})
   let selected=file
   try{if(!(await fs.stat(file)).isFile())selected=path.join(webRoot,'index.html')}catch{selected=path.join(webRoot,'index.html')}
   const stat=await fs.stat(selected)
   res.writeHead(200,{'Content-Type':CONTENT_TYPES[path.extname(selected)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'})
   if(req.method==='HEAD'){res.end();return}
   await pipeline(createReadStream(selected),res)
  }catch(error){
   if(!res.headersSent)send(res,error.message==='body_too_large'?413:503,{message:error.message==='body_too_large'?'File is too large':'Payroll reserve is temporarily unavailable'})
   else res.destroy()
  }
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''))
 const handler=createGateway({
  readStatus:()=>json(path.join(ROOT,'runtime','status.json')),
  readBuild:()=>json(path.join(ROOT,'runtime','public-build.json')),
  readPhotos:state=>json(path.join(state.release,'photos.json')),
  webRoot:path.join(ROOT,'runtime','web'),
  apiHandler:async(route,request)=>{
   const {handleApi}=await import(pathToFileURL(path.join(ROOT,'app','standby','api-handler.mjs')).href)
   return handleApi(route,request,await json(path.join(ROOT,'runtime','server-env.json')))
  }
 })
 http.createServer(handler).listen(18640,'127.0.0.1',()=>console.log(JSON.stringify({event:'payroll_reserve_listening',port:18640})))
}
