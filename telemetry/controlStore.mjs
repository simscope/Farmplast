import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
import {readFile} from 'node:fs/promises'
import {ASSETS} from './state.mjs'
import {gatewayFor,controlReport} from './protocol.mjs'

export const OPERATOR_RPCS={
 ch1_firmware_status:{},chiller_firmware_status:{p_device:'text'},
 ch1_command:{p_id:'uuid',p_type:'text',p_value:'jsonb',p_pin:'text'},
 ch1_firmware_unlock:{p_code:'text'},chiller_firmware_unlock:{p_device:'text',p_code:'text'},
 ch1_firmware_publish:{p_version:'text',p_sha256:'text',p_size:'integer',p_storage_path:'text',p_verified_sha256:'text'},
 chiller_firmware_publish:{p_device:'text',p_version:'text',p_sha256:'text',p_size:'integer',p_storage_path:'text',p_verified_sha256:'text'},
 ch1_firmware_queue:{p_grant:'text',p_id:'uuid',p_release:'uuid',p_signed_url:'text',p_signed_url_expires_at:'timestamptz'},
 chiller_ota_queue:{p_device:'text',p_grant:'text',p_id:'uuid',p_release:'uuid',p_signed_url:'text',p_signed_url_expires_at:'timestamptz'},
}
const DEVICE_RPCS={ch1_ota_report:{p_key:'text',p_gateway:'jsonb'},chiller_ota_report:{p_device:'text',p_secret:'text',p_metadata:'jsonb'},nj_msi_exchange:{p_device:'text',p_key:'text',p_gateway:'jsonb',p_reported:'jsonb'}}
const ident=value=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw Error('Invalid identifier');return '"'+value+'"'}
export async function openControlStore({dataDir,seedPath}, suppliedSeed) {
 const db=await PGlite.create({dataDir,extensions:{pgcrypto}})
 const initialized=(await db.query("select to_regclass('public.msi_control_schema') as present")).rows[0].present
 if(!initialized){
  const schema=await readFile(new URL('./control-schema.sql',import.meta.url),'utf8')
  await db.transaction(async tx=>{
   await tx.exec(schema)
   const seed=typeof suppliedSeed==='function'?await suppliedSeed(tx):suppliedSeed||JSON.parse(await readFile(seedPath,'utf8'))
   const rank=table=>table.endsWith('_jobs')?20:table.includes('receipt')?30:table.endsWith('_releases')?10:0
   for(const [table,rows] of Object.entries(seed).sort((a,b)=>rank(a[0])-rank(b[0]))){
    if(!/^(?:public\.(?:devices|ch1_[a-z_]+|chiller_ota_[a-z_]+)|(?:ch1_private|ch23_ota_private|nj_msi_private)\.[a-z0-9_]+)$/.test(table))throw Error('Unexpected seed table')
    const qualified=table.split('.').map(ident).join('.')
    for(const row of rows){
     const fields=Object.keys(row)
     const values=fields.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k])
     await tx.query(`insert into ${qualified} (${fields.map(ident).join(',')}) values (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,values)
    }
   }
   await tx.exec('create table public.msi_control_schema(version integer primary key); insert into public.msi_control_schema values(1);')
  })
 }
 async function invoke(name,args,user,operator=true){
  const definition=(operator?OPERATOR_RPCS:DEVICE_RPCS)[name]
  if(!definition||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(definition,k)))throw Error('Unknown control request')
  return db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user||''])
   const fields=Object.keys(definition)
   const values=fields.map(k=>args[k]===undefined?null:definition[k]==='jsonb'?JSON.stringify(args[k]):args[k])
   const query=`select public.${ident(name)}(${fields.map((k,i)=>`${ident(k)}=>$${i+1}::${definition[k]}`).join(',')}) as value`
   return (await tx.query(query,values)).rows[0].value
  })
 }
 return {db,close:()=>db.close(),rpc:(name,args,user)=>invoke(name,args,user),operator:(user,bucket)=>db.transaction(async tx=>{
  if(!['ch1-firmware','chiller-firmware'].includes(bucket))return false
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user])
  return (await tx.query('select public.'+(bucket==='ch1-firmware'?'ch1_firmware_operator':'chiller_firmware_operator')+'() as ok')).rows[0].ok
 }),registerObject:(bucket,name,size)=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) on conflict(bucket_id,name) do nothing',[bucket,name,JSON.stringify({size})]),report:(producer,args)=>{
  if(producer==='chiller-1')return invoke('ch1_ota_report',args,null,false)
  if(args.p_device!==ASSETS.find(a=>a.producer===producer)?.device_code)throw Error('Wrong device')
  return invoke('chiller_ota_report',args,null,false)
 },exchange:(producer,body,config)=>invoke('nj_msi_exchange',{
  p_device:ASSETS.find(a=>a.producer===producer).device_code,p_key:config.legacyKeys[producer],p_gateway:gatewayFor(producer,body),
  p_reported:producer==='chiller-1'?controlReport(Array.isArray(body)?body:body.p_rows):{},
 },null,false)}
}
