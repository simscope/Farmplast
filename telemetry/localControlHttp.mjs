import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {OPERATOR_RPCS} from './controlStore.mjs'
const devices={'ch1-firmware':['ESP32-CH1'],'chiller-firmware':['ESP32-CH2-PLC','ESP32-CH3-PLC']}
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
const digest=data=>createHash('sha256').update(data).digest('hex')
const b64=data=>Buffer.from(typeof data==='string'?data:JSON.stringify(data)).toString('base64url')
export function firmwareLocation(root,bucket,name){
 const match=/^(ESP32-CH1|ESP32-CH[23]-PLC)\/([A-Za-z0-9._-]{1,48})\/([a-f0-9]{64})\.bin$/.exec(name||'')
 if(!devices[bucket]?.includes(match?.[1])||['.','..'].includes(match?.[2]))throw Error('Invalid private object')
 return {file:path.join(root,bucket,...name.split('/')),device:match[1],version:match[2],hash:match[3]}
}
export function validateStoredImage(bytes,object){
 const limit=object.device==='ESP32-CH1'?1245184:1310720
 if(bytes.length<256||bytes.length>limit||bytes[0]!==0xe9||bytes.readUInt16LE(12)!==(object.device==='ESP32-CH1'?9:0)||bytes.readUInt32LE(32)!==0xabcd5432||digest(bytes)!==object.hash)throw Error('Invalid firmware identity')
 const prefix=object.device==='ESP32-CH1'?'CH1OTA':'CH23OTA'
 for(const [name,value] of [['DEVICE',object.device],['VERSION',object.version]]){
  const matches=[...new Set([...bytes.toString('latin1').matchAll(new RegExp(prefix+'_'+name+'=([^\\x00]+)\\x00','g'))].map(m=>m[1]))]
  if(matches.length!==1||matches[0]!==value)throw Error('Firmware marker mismatch')
 }
 if(bytes.includes(Buffer.from('.supabase.co')))throw Error('Firmware still depends on Cloud')
 let at=24,sum=0xef
 if(bytes[1]<1||bytes[1]>16)throw Error('Invalid image segments')
 for(let n=0;n<bytes[1];n++){
  if(at+8>bytes.length)throw Error('Truncated image')
  const size=bytes.readUInt32LE(at+4);at+=8
  if(at+size>bytes.length)throw Error('Truncated image')
  for(const v of bytes.subarray(at,at+size))sum^=v
  at+=size
 }
 const checksumAt=Math.ceil((at+1)/16)*16-1
 if(bytes[checksumAt]!==sum||bytes[23]!==1||checksumAt+33!==bytes.length||digest(bytes.subarray(0,checksumAt+1))!==bytes.subarray(checksumAt+1).toString('hex'))throw Error('Firmware checksum mismatch')
}
export function createDownloadTokens(key,now=Date.now){
 if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('Provision private download signing key')
 const sign=text=>createHmac('sha256',key).update(text).digest('base64url')
 return {issue:(url,seconds=1800)=>{
  const body=b64({alg:'HS256',typ:'JWT'})+'.'+b64({url,exp:Math.floor(now()/1000)+seconds})
  return body+'.'+sign(body)
 },verify:(token,url)=>{
  if(typeof token!=='string'||token.length>2048)throw Error('Invalid download token')
  const parts=token.split('.')
  if(parts.length!==3||!equal(sign(parts[0]+'.'+parts[1]),parts[2]))throw Error('Invalid download signature')
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))
  if(claims.url!==url||!Number.isSafeInteger(claims.exp)||claims.exp<=Math.floor(now()/1000)||claims.exp>Math.floor(now()/1000)+1860)throw Error('Invalid download scope or expiry')
  return claims
 }}
}
export async function boundedBody(req,max=32768){
 if(Number(req.headers['content-length'])>max)throw Error('Request too large')
 const chunks=[];let size=0
 for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Request too large');chunks.push(chunk)}
 return Buffer.concat(chunks)
}
export function createLocalControlHttp(config,store,reporter){
 const tokens=createDownloadTokens(config.control.downloadKey)
 return async function handle(req,res,url){
  if(!url.pathname.startsWith('/v1/control/')&&!url.pathname.startsWith('/v1/storage/')&&!url.pathname.startsWith('/v1/report/'))return false
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));return true}
  const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,256})$/)?.[1]
  try {
   if(url.pathname.startsWith('/v1/report/')){
    const producer=url.pathname.slice('/v1/report/'.length)
    if(!['chiller-1','chiller-2','chiller-3'].includes(producer))return send(404,{error:'Unknown device'})
    if(req.method!=='POST')return send(405,{error:'POST required'})
    if(!equal(token,config.devices[producer]))return send(401,{error:'Authentication required'})
    const args=JSON.parse((await boundedBody(req)).toString('utf8'))
    return send(200,await reporter(producer,args))
   }
   const bucket=url.searchParams.get('bucket'),name=url.searchParams.get('path')
   const object=url.pathname.startsWith('/v1/storage/')?firmwareLocation(config.control.firmwareRoot,bucket,name):null
   const signed=url.pathname==='/v1/storage/download'&&url.searchParams.has('token')
   if(signed){if(req.method!=='GET')return send(405,{error:'GET required'});tokens.verify(url.searchParams.get('token'),bucket+'/'+name)}
   else {
    if(!equal(token,config.control.apiKey))return send(401,{error:'Authentication required'})
    const user=req.headers['x-operator-id']
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(user||''))return send(403,{error:'Operator required'})
    if(url.pathname==='/v1/control/rpc'){
     if(req.method!=='POST')return send(405,{error:'POST required'})
     const {name:rpc,args={}}=JSON.parse((await boundedBody(req)).toString('utf8'))
     if(!Object.hasOwn(OPERATOR_RPCS,rpc))return send(404,{error:'Unknown operation'})
     if(rpc.endsWith('_publish')){
      const scope=rpc==='ch1_firmware_publish'?'ch1-firmware':'chiller-firmware'
      const published=firmwareLocation(config.control.firmwareRoot,scope,args.p_storage_path)
      validateStoredImage(await readFile(published.file),published)
     }
     if(rpc==='ch1_firmware_queue'||rpc==='chiller_ota_queue'){
      if(rpc==='chiller_ota_queue'&&args.p_device==='ESP32-CH3-PLC'){
       const current=await store.rpc('chiller_firmware_status',{p_device:args.p_device},user)
       if(current?.device?.version==='ch3-msi-1')return send(409,{error:'usb_migration_required'})
      }
      const download=new URL(args.p_signed_url)
      if(download.origin!=='https://farmplast.vercel.app')throw Error('Unexpected download origin')
      const prefix='/storage/v1/object/sign/'
      if(!download.pathname.startsWith(prefix))throw Error('Invalid download URL')
      tokens.verify(download.searchParams.get('token'),download.pathname.slice(prefix.length))
     }
     const value=await store.rpc(rpc,args,user)
     return send(200,value)
    }
    if(!await store.operator(user,bucket))return send(403,{error:'Operator access required'})
   }
   if(url.pathname==='/v1/storage/download'){
    if(req.method!=='GET')return send(405,{error:'GET required'})
    const data=await readFile(object.file)
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':data.length});res.end(data);return true
   }
   if(url.pathname==='/v1/storage/sign'){
    if(req.method!=='POST')return send(405,{error:'POST required'})
    validateStoredImage(await readFile(object.file),object)
    return send(200,{signedUrl:'https://farmplast.vercel.app/storage/v1/object/sign/'+bucket+'/'+name+'?token='+tokens.issue(bucket+'/'+name)})
   }
   if(url.pathname==='/v1/storage/upload'){
    if(req.method!=='POST')return send(405,{error:'POST required'})
    const bytes=await boundedBody(req,1310720);validateStoredImage(bytes,object)
    await mkdir(path.dirname(object.file),{recursive:true})
    let existing=false
    try{await writeFile(object.file,bytes,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;validateStoredImage(await readFile(object.file),object);existing=true}
    await store.registerObject(bucket,name,bytes.length)
    if(existing)return send(409,{error:'Object already exists'})
    return send(201,{path:name})
   }
   return send(404,{error:'Unknown operation'})
  }catch{return send(400,{error:'Request rejected; no automatic retry'})}
 }
}
