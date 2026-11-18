// Outbound-only encrypted transport over the EXISTING Farmplast Realtime service.
// No database writes, storage objects, listeners, services or device Tailscale.
import crypto from 'node:crypto';
import {Buffer} from 'node:buffer';
const MAX=4*1024*1024,CHUNK=60000;
export const permittedPath=(method,p,operator=false)=>
  method==='GET'&&p==='/climate/healthz'
  ||method==='POST'&&p==='/climate/v1/exchange'
  ||method==='GET'&&/^\/climate\/v1\/firmware\/[a-f0-9]{64}$/.test(p)
  ||method==='POST'&&['/climate/workstation/enroll','/climate/workstation/devices','/climate/workstation/releases'].includes(p)
  ||method==='GET'&&p==='/climate/workstation/zones'
  ||['GET','POST'].includes(method)&&/^\/climate\/workstation\/replacements\/[a-f0-9-]{36}(?:\/prepare)?$/.test(p)
  ||operator&&['GET','POST'].includes(method)&&/^\/climate\/operator\/(zones(?:\/[A-Za-z0-9_-]{1,64}\/desired)?|releases|ota|installer|replacements(?:\/[a-f0-9-]{36}\/(?:commit|cancel|installer))?)$/.test(p);
export function codec(secret) {
  if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('Transport key missing');
  const key=crypto.createHash('sha256').update('farmplast-v1:'+secret).digest();
  return {
    topic:'realtime:fp-msi-'+crypto.createHmac('sha256',key).update('topic-v1').digest('hex'),
    seal(value,kind,id){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(kind+':'+id));const bytes=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:bytes.toString('base64')});},
    open(text,kind,id){if(text.length>MAX)throw Error('Transport message too large');const v=JSON.parse(text);const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));d.setAAD(Buffer.from(kind+':'+id));d.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(v.data,'base64')),d.final()]).toString('utf8'));},
  };
}
export function connectPeer(config,{onRequest,WebSocketImpl=WebSocket}={}) {
  const crypt=codec(config.secret),endpoint=new URL(config.supabaseUrl);
  if(endpoint.protocol!=='https:')throw Error('Realtime requires HTTPS');
  endpoint.protocol='wss:';endpoint.pathname='/realtime/v1/websocket';endpoint.search=new URLSearchParams({apikey:config.anonKey,vsn:'1.0.0'}).toString();
  const ws=new WebSocketImpl(endpoint),pending=new Map(),pieces=new Map(),seen=new Map();let ref=0,heartbeat,closed=false;
  let joined,rejectJoin;const ready=new Promise((resolve,reject)=>{joined=resolve;rejectJoin=reject;});
  const joinTimer=setTimeout(()=>{rejectJoin(Error('Realtime join timeout'));ws.close();},7000);
  const push=(topic,event,payload)=>ws.send(JSON.stringify({topic,event,payload,ref:String(++ref),join_ref:'1'}));
  const send=(kind,id,value)=>{const text=crypt.seal(value,kind,id);if(text.length>MAX)throw Error('Transport body too large');const total=Math.ceil(text.length/CHUNK);for(let index=0;index<total;index++)push(crypt.topic,'broadcast',{type:'broadcast',event:'rpc',payload:{id,kind,index,total,chunk:text.slice(index*CHUNK,(index+1)*CHUNK)}});};
  const close=()=>{if(closed)return;closed=true;clearTimeout(joinTimer);clearInterval(heartbeat);rejectJoin(Error('Realtime disconnected'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('MSI transport disconnected'));}pending.clear();pieces.clear();};
  ws.addEventListener('open',()=>push(crypt.topic,'phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}}));
  ws.addEventListener('error',()=>{rejectJoin(Error('Realtime connection failed'));});
  ws.addEventListener('close',close);
  ws.addEventListener('message',async event=>{
    try{
      const m=JSON.parse(event.data);
      if(m.event==='phx_reply'&&m.ref==='1'){
        if(m.payload?.status!=='ok'){rejectJoin(Error('Realtime subscription rejected'));ws.close();return;}
        clearTimeout(joinTimer);heartbeat=setInterval(()=>{if(ws.readyState===1)push('phoenix','heartbeat',{});},25000);joined();return;
      }
      if(m.topic!==crypt.topic||m.event!=='broadcast'||m.payload?.event!=='rpc')return;
      const f=m.payload.payload;
      if(!/^[a-f0-9-]{36}$/.test(f?.id)||!['request','response'].includes(f.kind)||!Number.isInteger(f.total)||f.total<1||f.total>72||!Number.isInteger(f.index)||f.index<0||f.index>=f.total||typeof f.chunk!=='string'||f.chunk.length>CHUNK)return;
      if(f.kind==='response'&&!pending.has(f.id)||f.kind==='request'&&!onRequest)return;
      const now=Date.now();for(const [key,v]of pieces)if(now-v.at>20000)pieces.delete(key);for(const [key,at]of seen)if(now-at>45000)seen.delete(key);
      if(seen.has(f.id)&&f.kind==='request')return;
      const key=f.kind+':'+f.id;
      if(!pieces.has(key)){if(pieces.size>=12)return;pieces.set(key,{at:now,total:f.total,parts:new Map()});}
      const packet=pieces.get(key);if(packet.total!==f.total)return;packet.parts.set(f.index,f.chunk);
      if(packet.parts.size!==f.total)return;
      pieces.delete(key);const text=Array.from({length:f.total},(_,i)=>packet.parts.get(i)).join('');const value=crypt.open(text,f.kind,f.id);
      if(!Number.isSafeInteger(value.at)||Math.abs(now-value.at)>30000)return;
      if(f.kind==='response'){
        const waiter=pending.get(f.id);if(waiter){pending.delete(f.id);clearTimeout(waiter.timer);waiter.resolve(value);}return;
      }
      seen.set(f.id,now);
      let result;
      try{result=await onRequest(value);}catch{result={status:503,headers:{'Content-Type':'application/json'},body:Buffer.from('{"error":"MSI request failed"}').toString('base64')};}
      if(ws.readyState===1)send('response',f.id,{...result,at:Date.now()});
    }catch{/* Invalid ciphertext, framing and replay never enter the MSI API. */}
  });
  return {ready,closed:()=>closed,close(){close();ws.close();},async request(value,timeout=12000){await ready;const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('MSI is not responding'));},timeout);pending.set(id,{resolve,reject,timer});try{send('request',id,{...value,at:Date.now()});}catch(e){pending.delete(id);clearTimeout(timer);reject(e);}});}};
}
export async function transportFetch(config,request) {
  const u=new URL(request.url);
  if(!permittedPath(request.method,u.pathname,true))return Response.json({error:'Not found'},{status:404});
  const body=request.body?Buffer.from(await request.arrayBuffer()).toString('base64'):'';
  if(body.length>1900000) return Response.json({error:'Body too large'},{status:413});
  const peer=connectPeer(config);
  try {const result=await peer.request({method:request.method,path:u.pathname+u.search,headers:Object.fromEntries(request.headers),body});return new Response(Buffer.from(result.body||'','base64'),{status:result.status,headers:result.headers});}
  finally{peer.close();}
}
export function startMsiTransport(config,route,{onState=()=>{}}={}) {
  let stopped=false,peer,retry,timer;
  const connect=async()=>{
    if(stopped)return;
    peer=connectPeer(config,{onRequest:async message=>{
      const u=new URL(message.path,'https://farmplast.vercel.app');
      if(!permittedPath(message.method,u.pathname,true))return {status:404,body:''};
      const r=await route(new Request(u,{method:message.method,headers:message.headers,body:message.body?Buffer.from(message.body,'base64'):undefined,duplex:'half'}));
      const bytes=Buffer.from(await r.arrayBuffer());return {status:r.status,headers:Object.fromEntries(r.headers),body:bytes.toString('base64')};
    }});
    try{await peer.ready;onState('connected');retry=0;timer=setInterval(()=>{if(peer.closed()){clearInterval(timer);onState('disconnected');setTimeout(connect,1000);}},1000);}
    catch{peer.close();onState('disconnected');retry=Math.min((retry||0)+1,5);timer=setTimeout(connect,retry*2000);}
  };
  connect();return ()=>{stopped=true;clearInterval(timer);clearTimeout(timer);peer?.close();};
}
