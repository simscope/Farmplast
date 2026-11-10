import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/pa-climate-msi.js'
import {codec} from '../server/climateTransport.mjs'

test('Live site API preserves the existing PIN check, verifies the operator and sends only scoped MSI operations',async t=>{
 const originalFetch=globalThis.fetch,originalWS=globalThis.WebSocket,originalEnv={...process.env}
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.WebSocket=originalWS;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv)})
 const id='00000000-0000-4000-8000-000000000001',token='synthetic-user-jwt-'.repeat(3),secret='1'.repeat(64),crypt=codec(secret),messages=[]
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://auth.example',VITE_SUPABASE_ANON_KEY:'public-test-key',FARMPLAST_SERVICE_ROLE_KEY:'private-test-key',PA_CLIMATE_TARGET_PIN:'1234',PA_CLIMATE_ALLOWED_USER_IDS:id,PA_CLIMATE_TRANSPORT_KEY:secret})
 let caller=id
 globalThis.fetch=async url=>{
  if(String(url).includes('/auth/v1/user'))return Response.json({id:caller})
  if(String(url).includes('/rest/v1/profiles'))return Response.json({role:'admin'})
  if(String(url).includes('/storage/v1/object/authenticated/'))return Response.json({statusCode:404},{status:404})
  return Response.json({})
 }
 class Socket extends EventTarget{
  constructor(){super();this.readyState=1;this.pieces=new Map();queueMicrotask(()=>this.dispatchEvent(new Event('open')))}
  emit(value){queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)})))}
  send(text){
   const m=JSON.parse(text)
   if(m.event==='phx_join'){this.emit({event:'phx_reply',ref:m.ref,payload:{status:'ok'}});return}
   if(m.event!=='broadcast')return
   const f=m.payload.payload
   if(!this.pieces.has(f.id))this.pieces.set(f.id,[])
   const parts=this.pieces.get(f.id);parts[f.index]=f.chunk
   if(parts.filter(Boolean).length!==f.total)return
   const request=crypt.open(parts.join(''),'request',f.id);messages.push(request)
   const response={at:Date.now(),status:200,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify(request.method==='GET'?{zones:[]}:{desired:{revision:2}})).toString('base64')}
   this.emit({topic:crypt.topic,event:'broadcast',payload:{event:'rpc',payload:{id:f.id,kind:'response',index:0,total:1,chunk:crypt.seal(response,'response',f.id)}}})
  }
  close(){this.readyState=3;this.dispatchEvent(new Event('close'))}
 }
 globalThis.WebSocket=Socket
 async function run(body,authorization='Bearer '+token){const res={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this},end(value){this.value=JSON.parse(value.toString());return this}};await handler({method:body?'POST':'GET',headers:authorization?{authorization}:{},query:{},body},res);return res}
 assert.equal((await run(undefined,'')).code,401)
 assert.equal((await run()).code,200)
 assert.equal(messages[0].path,'/climate/operator/zones')
 assert.equal(messages[0].headers.authorization,'Bearer '+token)
 const before=messages.length
 assert.equal((await run({action:'set',zone_id:'pa-zone-2',target_f:72,pin:'wrong'})).code,403)
 assert.equal(messages.length,before)
 const good=await run({action:'set',zone_id:'pa-zone-2',target_f:72,pin:'1234'});assert.equal(good.code,200)
 assert.deepEqual(JSON.parse(Buffer.from(messages.at(-1).body,'base64')),{target_f:72})
 assert.equal((await run({action:'register'})).code,400)
 caller='other';assert.equal((await run()).code,403)
})
