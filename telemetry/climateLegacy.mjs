// Compatibility for the old Zone 1 firmware and PIN-attempt counters, on MSI only.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const hashes={bridge:'12d75152a7b6e12bca9df5cf5b9c8dacc510418dd423caf70bcec89592e735a9',direct:'f4e9079181e46369b99662ce71cee542c4cd50188e5d9ed5e7ef7bdc6f7f65da'}
export function createClimateLegacy(file,allowedUserIds){
  let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{sample:null,command:null,pins:{}}
  const save=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,file)}
  return function legacy(method,headers,bytes,now=Date.now()){
    const send=(status,body)=>({status,body:Buffer.from(JSON.stringify(body))})
    if(method==='GET')return send(200,state.sample&&now-state.sample.at<30000?state.sample:{offline:true})
    let b;try{b=JSON.parse(bytes.toString())}catch{return send(400,{error:'Invalid request'})}
    const auth=headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]||'',hash=crypto.createHash('sha256').update(auth).digest('hex')
    const direct=hash===hashes.direct,bridge=hash===hashes.bridge
    if(direct||bridge){
      if(direct){if(headers.get('x-device')!=='PA-70D38CA99B20'||b?.id!=='PA-70D38CA99B20'||b.zone!=='pa-zone-1'||b.model!=='PA-WROOM32E-4M-R1')return send(403,{error:'Device mismatch'});b={...b,at:now,fault:!!(b.pinFault||b.sensorFault||!b.relayConfigured)}}
      if(!b||!Number.isSafeInteger(b.at)||b.at>now+5000||now-b.at>30000||!Number.isFinite(b.temperature)||![0,1,2].includes(b.mode)||typeof b.output!=='boolean'||typeof b.fault!=='boolean'||!Number.isSafeInteger(b.revision))return send(400,{error:'Invalid sample'})
      const s={at:Math.min(b.at,now),temperature:b.temperature,wifi:Number.isFinite(b.wifi)?b.wifi:null,target:Number.isFinite(b.target)?b.target:null,band:Number.isFinite(b.band)?b.band:null,mode:b.mode,output:b.output,fault:b.fault,revision:b.revision,version:direct?String(b.version).slice(0,32):null,network:direct?(b.network==='backup'?'backup':'primary'):null}
      state.sample=s;save();const c=state.command
      if(!direct)return send(200,{command:c?.expires>now?c:null})
      const eligible=c?.expires>now&&c.revision===s.revision&&(!c.action.startsWith('HEAT_')||s.mode===1)&&!(c.action==='HEAT_ON'&&s.fault)
      const settings=eligible?{revision:s.revision+1,target:c.action==='TARGET'?c.target:s.target,band:s.band,dwell:b.dwell,mode:({AUTO:0,MANUAL:1,OFF:2,HEAT_ON:1,HEAT_OFF:1})[c.action]??s.mode,manual:c.action==='TARGET'?b.manual===true:c.action==='HEAT_ON'}:null
      return send(200,{ack:true,settings})
    }
    const user=headers.get('x-fp-operator-id')
    if(!allowedUserIds.includes(user))return send(403,{error:'Climate operator access required'})
    if(b?.action==='CHECK_PIN'||b?.action==='TARGET'){
      const p=state.pins[user],active=p?.until>now
      if(active&&p.count>=5)return send(429,{error:'Wait five minutes before retrying.'})
      if(headers.get('x-fp-pin-valid')!=='true'){state.pins[user]={count:active?p.count+1:1,until:active?p.until:now+300000};save();return send(403,{error:'Incorrect temperature PIN.'})}
      if(p?.count){state.pins[user]={count:0,until:0};save()}
      if(b.action==='CHECK_PIN')return send(200,{ok:true})
    }
    if(!['AUTO','MANUAL','OFF','HEAT_ON','HEAT_OFF','TARGET'].includes(b?.action)||!Number.isSafeInteger(b.revision)||(b.action==='TARGET'&&(!Number.isFinite(b.target)||b.target<40||b.target>90)))return send(400,{error:'Invalid command'})
    const s=state.sample
    if(!s||now-s.at>=25000||s.revision!==b.revision||(b.action.startsWith('HEAT_')&&s.mode!==1)||(b.action==='HEAT_ON'&&s.fault))return send(409,{error:'Refresh state'})
    state.command={id:crypto.randomUUID(),action:b.action,...(b.action==='TARGET'?{target:b.target}:{}),revision:s.revision,expires:now+20000};save();return send(202,{queued:true})
  }
}
