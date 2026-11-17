import {supabase} from './supabase'
export function createChillerBackend(authClient,fetcher=fetch){
 async function request(route,{method='POST',body,signal,binary=false}={}){
  const {data,error}=await authClient.auth.getSession()
  if(error||!data?.session?.access_token)return {error:{message:'Sign in to Farmplast',statusCode:401}}
  try{
   const response=await fetcher('/api/nj-control?'+route,{method,headers:{Authorization:'Bearer '+data.session.access_token,...(body&&!binary?{'Content-Type':'application/json'}:{})},body:body?(binary?body:JSON.stringify(body)):undefined,signal,cache:'no-store',redirect:'error'})
   if(!response.ok)return {error:{message:'Request rejected or unavailable',statusCode:response.status}}
   return {data:binary&&method==='GET'?await response.blob():await response.json(),error:null}
  }catch{return {error:{message:'MSI request unavailable'}}}
 }
 return {rpc:(name,args={})=>{
  let signal
  const task={abortSignal:value=>{signal=value;return task},then:(yes,no)=>request('kind=rpc',{body:{name,args},signal}).then(yes,no)}
  return task
 },storage:{from:bucket=>{
  const query=(kind,path)=>new URLSearchParams({kind,bucket,path}).toString()
  return {upload:(path,file)=>request(query('upload',path),{body:file,binary:true}),download:path=>request(query('download',path),{method:'GET',binary:true}),createSignedUrl:path=>request(query('sign',path))}
 }}}
}
export const chillerBackend=createChillerBackend(supabase)
