import {permittedPath,MAX_BODY,MAX_REPLY,verifyRequest,forwardHeaders,limitedBytes} from '../client/server/climateWire.mjs'
import {createClimateLegacy} from './climateLegacy.mjs'
export function createClimateGateway(config,fetcher=fetch){
  if(config.target!=='http://127.0.0.1:18000'||!/^[a-f0-9]{64}$/.test(config.secret)||!Array.isArray(config.allowedUserIds)||!config.legacyFile)throw Error('Invalid MSI climate gateway configuration')
  const seen=new Map(),legacy=createClimateLegacy(config.legacyFile,config.allowedUserIds)
  return async function climate(req,res,url){
    if(!url.pathname.startsWith('/climate'))return false
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Farmplast-Climate-Transport':'msi-https'});res.end(body)}
    if(!permittedPath(req.method,url.pathname,true)){send(404,'{"error":"Not found"}');return true}
    try{
      const bytes=await limitedBytes(req,MAX_BODY),headers=new Headers(req.headers)
      if(!verifyRequest(config.secret,req.method,url.pathname+url.search,headers,bytes,seen)){send(401,'{"error":"MSI transport authentication required"}');return true}
      if(url.pathname==='/climate/v1/legacy-zone1'){const r=legacy(req.method,headers,bytes);send(r.status,r.body);return true}
      const upstream=await fetcher(config.target+url.pathname+url.search,{method:req.method,headers:forwardHeaders(headers),body:req.method==='GET'?undefined:bytes,redirect:'error',signal:AbortSignal.timeout(16000)})
      const body=await limitedBytes(upstream.body,MAX_REPLY),out={'Cache-Control':'no-store','X-Farmplast-Climate-Transport':'msi-https'}
      for(const k of ['content-type','content-disposition'])if(upstream.headers.has(k))out[k]=upstream.headers.get(k)
      res.writeHead(upstream.status,out);res.end(body);return true
    }catch{if(!res.headersSent)send(503,'{"error":"MSI climate unavailable"}');return true}
  }
}
