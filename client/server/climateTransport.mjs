// HTTPS directly to the existing MSI gateway. No Supabase Realtime connection.
import {MSI_ORIGIN,MAX_BODY,MAX_REPLY,permittedPath,signRequest,limitedBytes} from './climateWire.mjs'
export {permittedPath} from './climateWire.mjs'
export async function transportFetch(config,request,fetcher=fetch){
  const u=new URL(request.url)
  if(!permittedPath(request.method,u.pathname,true))return Response.json({error:'Not found'},{status:404})
  const body=await limitedBytes(request.body,MAX_BODY)
  const headers=signRequest(config.secret,request,body)
  const out=await fetcher(MSI_ORIGIN+u.pathname+u.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)})
  const result=await limitedBytes(out.body,MAX_REPLY)
  const responseHeaders={'Cache-Control':'no-store','X-Farmplast-Climate-Transport':'msi-https'}
  for(const k of ['content-type','content-disposition'])if(out.headers.has(k))responseHeaders[k]=out.headers.get(k)
  return new Response([204,304].includes(out.status)?null:result,{status:out.status,headers:responseHeaders})
}
