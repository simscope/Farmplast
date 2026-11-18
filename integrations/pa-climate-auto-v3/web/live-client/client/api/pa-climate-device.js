/* global process, Buffer */
import {transportFetch,permittedPath} from '../server/climateTransport.mjs';
export const config={api:{bodyParser:false}};
export const maxDuration=30;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const route=req.query.route;
  if(typeof route!=='string'||!permittedPath(req.method,'/climate/'+route))return res.status(404).json({error:'Not found'});
  const query=new URLSearchParams();
  for(const [key,value]of Object.entries(req.query))if(key!=='route'&&typeof value==='string')query.set(key,value);
  const url='https://farmplast.vercel.app/climate/'+route+(query.size?'?'+query:'');
  const headers={};for(const name of ['authorization','content-type','x-firmware-model','x-firmware-version'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
  try{
    let body;
    if(req.method!=='GET'){const chunks=[];let size=0;const max=route==='workstation/releases'?1310720:8192;for await(const chunk of req){size+=chunk.length;if(size>max)return res.status(413).json({error:'Body too large'});chunks.push(chunk);}body=Buffer.concat(chunks);}
    const request=new Request(url,{method:req.method,headers,body,duplex:'half'});
    const out=await transportFetch({supabaseUrl:process.env.VITE_SUPABASE_URL,anonKey:process.env.VITE_SUPABASE_ANON_KEY,secret:process.env.PA_CLIMATE_TRANSPORT_KEY},request);
    for(const name of ['content-type','content-disposition'])if(out.headers.has(name))res.setHeader(name,out.headers.get(name));
    return res.status(out.status).end(Buffer.from(await out.arrayBuffer()));
  }catch{return res.status(503).json({error:'MSI climate unavailable'});}
}
