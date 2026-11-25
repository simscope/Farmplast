import crypto from 'node:crypto'
export const MSI_ORIGIN='https://msi.tail4626fb.ts.net:10000'
export const MAX_BODY=2*1024*1024,MAX_REPLY=4*1024*1024
export const permittedPath=(method,p,operator=false)=>
  method==='GET'&&p==='/climate/healthz'
  ||method==='POST'&&p==='/climate/v1/exchange'
  ||method==='GET'&&/^\/climate\/v1\/firmware\/[a-f0-9]{64}$/.test(p)
  ||method==='POST'&&['/climate/workstation/enroll','/climate/workstation/devices','/climate/workstation/releases'].includes(p)
  ||method==='GET'&&p==='/climate/workstation/zones'
  ||['GET','POST'].includes(method)&&/^\/climate\/workstation\/replacements\/[a-f0-9-]{36}(?:\/prepare)?$/.test(p)
  ||operator&&['GET','POST'].includes(method)&&p==='/climate/v1/legacy-zone1'
  ||operator&&['GET','POST'].includes(method)&&/^\/climate\/operator\/(zones(?:\/[A-Za-z0-9_-]{1,64}\/desired)?|releases|ota|installer|replacements(?:\/[a-f0-9-]{36}\/(?:commit|cancel|installer))?)$/.test(p)
const headerNames=['authorization','content-type','x-device','x-firmware-model','x-firmware-version','x-fp-operator-id','x-fp-pin-valid']
export function forwardHeaders(headers){return Object.fromEntries(headerNames.filter(k=>headers.get(k)!==null).map(k=>[k,headers.get(k)]))}
export function signature(secret,method,path,at,nonce,headers,body){
  if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('Climate transport key missing')
  const digest=crypto.createHash('sha256').update(body).digest('hex')
  return crypto.createHmac('sha256',secret).update(JSON.stringify([method,path,String(at),nonce,headerNames.map(k=>[k,headers[k]??'']),digest])).digest('hex')
}
export function signRequest(secret,request,body,at=Date.now(),nonce=crypto.randomUUID()){
  const u=new URL(request.url),headers=forwardHeaders(request.headers),p=u.pathname+u.search
  return {...headers,'x-fp-at':String(at),'x-fp-nonce':nonce,'x-fp-signature':signature(secret,request.method,p,at,nonce,headers,body)}
}
export function verifyRequest(secret,method,path,headers,body,seen,now=Date.now()){
  const at=headers.get('x-fp-at'),nonce=headers.get('x-fp-nonce'),provided=headers.get('x-fp-signature')
  if(!/^\d{13}$/.test(at||'')||Math.abs(now-Number(at))>30000||!/^[a-f0-9-]{36}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(provided||''))return false
  for(const [n,t]of seen)if(now-t>60000)seen.delete(n)
  if(seen.has(nonce)||seen.size>=4096)return false
  const expected=signature(secret,method,path,at,nonce,forwardHeaders(headers),body)
  if(!crypto.timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(expected,'hex')))return false
  seen.set(nonce,now);return true
}
export async function limitedBytes(stream,max){
  if(!stream)return Buffer.alloc(0)
  const chunks=[];let n=0
  for await(const value of stream){n+=value.length;if(n>max)throw Error('Climate body too large');chunks.push(Buffer.from(value))}
  return Buffer.concat(chunks)
}
