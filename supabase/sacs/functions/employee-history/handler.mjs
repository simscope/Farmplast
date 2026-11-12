const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function equalSecret(a,b){
  const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
  const [x,y]=await Promise.all([hash(a),hash(b)]);let difference=0
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i]
  return difference===0
}
export function createHistoryHandler({secret,read}){
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  return async request=>{
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405)
    if(!secret||secret.length<32||!await equalSecret(request.headers.get('x-farmplast-sync-secret')||'',secret))return reply({error:'unauthorized'},401)
    try{
      const text=await request.text();if(text.length>2000)return reply({error:'payload_too_large'},413)
      const body=JSON.parse(text)
      if(!body||Object.keys(body).some(key=>!['source_employee_id','offset'].includes(key))||!uuid.test(body.source_employee_id)||
        !Number.isInteger(body.offset??0)||(body.offset??0)<0||(body.offset??0)>100000)return reply({error:'invalid_selection'},400)
      return reply(await read(body.source_employee_id,body.offset??0))
    }catch{return reply({error:'history_unavailable'},503)}
  }
}
