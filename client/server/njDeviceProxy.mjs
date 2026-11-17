export function createNjDeviceHandler(env,fetcher=fetch){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  const send=(code,error)=>res.status(code).json({error})
  if(req.method!=='POST')return send(405,'POST required')
  const producer=req.query?.device
  if(!['chiller-1','chiller-2','chiller-3','barrels'].includes(producer))return send(404,'Unknown device')
  const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if(!token)return send(401,'Device authentication required')
  if(env.NJ_TELEMETRY_UPSTREAM!=='https://msi.tail4626fb.ts.net:10000')return send(503,'MSI unavailable')
  if(!req.body || typeof req.body!=='object')return send(400,'JSON required')
  const body=JSON.stringify(req.body)
  if(Buffer.byteLength(body)>32768)return send(413,'Batch too large')
  try{
   const reply=await fetcher(env.NJ_TELEMETRY_UPSTREAM+'/v1/ingest/'+producer,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6500)})
   const content=await reply.text()
   if(Buffer.byteLength(content)>4096)return send(502,'Invalid MSI response')
   return res.status(reply.status).json(JSON.parse(content))
  }catch{return send(503,'MSI unavailable')}
 }
}
