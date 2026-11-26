'use strict';
// Clock-only job: no attendance reads, option changes, or database access.
const fs=require('node:fs'), path=require('node:path'), dgram=require('node:dgram');
const {performance}=require('node:perf_hooks');
const {execFileSync}=require('node:child_process');
const ZONE='America/New_York', MAX_TRANSITION_AGE_MS=5*60000, MAX_ATTEMPTS=4;
const C={OPTIONS:11,GET_TIME:201,SET_TIME:202,ACK:2000};

function transitions(year) {
  const sunday=(month,nth)=>1+(7-new Date(Date.UTC(year,month-1,1)).getUTCDay())%7+7*(nth-1);
  return [
    {id:`spring-${year}`,kind:'spring',at:Date.UTC(year,2,sunday(3,2),7),staleOffsetMs:-3600000},
    {id:`autumn-${year}`,kind:'autumn',at:Date.UTC(year,10,sunday(11,1),6),staleOffsetMs:3600000},
  ];
}
function transitionDue(ms) {
  return transitions(new Date(ms).getUTCFullYear()).find(t=>ms>=t.at&&ms-t.at<MAX_TRANSITION_AGE_MS)||null;
}
function wallParts(date) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(date).map(p=>[p.type,p.value]));
  return Object.fromEntries(['year','month','day','hour','minute','second'].map(k=>[k,Number(p[k])]));
}
function wallMilliseconds(w){return Date.UTC(w.year,w.month-1,w.day,w.hour,w.minute,w.second);}
function encodeZktTime(w) {
  const ranges={year:[2000,2099],month:[1,12],day:[1,31],hour:[0,23],minute:[0,59],second:[0,59]};
  if(Object.entries(ranges).some(([k,[min,max]])=>!Number.isInteger(w[k])||w[k]<min||w[k]>max)
    ||new Date(wallMilliseconds(w)).getUTCDate()!==w.day)throw Error('Invalid ZKT encoded clock value');
  const b=Buffer.alloc(4);
  b.writeUInt32LE((((w.year-2000)*12+w.month-1)*31+w.day-1)*86400+w.hour*3600+w.minute*60+w.second);
  return b;
}
function decodeZktTime(b) {
  if(!Buffer.isBuffer(b)||b.length!==4)throw Error('Invalid packed ZKT clock');
  let n=b.readUInt32LE();
  const second=n%60;n=Math.floor(n/60);const minute=n%60;n=Math.floor(n/60);
  const hour=n%24;n=Math.floor(n/24);const day=n%31+1;n=Math.floor(n/31);
  const w={year:Math.floor(n/12)+2000,month:n%12+1,day,hour,minute,second};
  encodeZktTime(w);return w; // No Date normalization of the nonexistent spring hour.
}
function replyPayload(b,length) {
  // 1.3.0 removes the TCP prefix but retains the eight-byte ZK header.
  if(!Buffer.isBuffer(b)||b.length<8||b.readUInt16LE(0)!==C.ACK
    ||(length!==undefined&&b.length!==8+length))throw Error('Invalid ZKT acknowledgement or payload length');
  return b.subarray(8);
}
async function readOption(zk,key) {
  const text=replyPayload(await zk.executeCmd(C.OPTIONS,Buffer.from(key+'\0','ascii'))).toString('ascii').replace(/\0+$/,'');
  if(!text.startsWith(key+'=')||text.includes('\0'))throw Error('Unexpected ZKT option response');
  return text.slice(key.length+1);
}
function cleanSerial(b) {
  const text=replyPayload(b).toString('ascii').replace(/\0+$/,'');
  if(!/^~SerialNumber=[A-Za-z0-9._-]{4,70}$/.test(text))throw Error('Cannot verify unique ZKT serial response');
  return text.slice('~SerialNumber='.length);
}
async function readDeviceClock(zk){return decodeZktTime(replyPayload(await zk.executeCmd(C.GET_TIME,''),4));}

function parseNtpReply(packet,request,t0,t1,elapsed) {
  if(packet.length!==48||packet[0]>>6===3||(packet[0]&7)!==4||![3,4].includes((packet[0]>>3)&7)
    ||packet[1]<1||packet[1]>15||!packet.subarray(24,32).equals(request.subarray(40,48))
    ||packet.readUInt32BE(8)/65536>2||elapsed>1500||elapsed<0||Math.abs(t1-t0-elapsed)>500)throw Error('Untrusted or stale NTP response');
  const sec=packet.readUInt32BE(40);
  const utc=((sec<2208988800?sec+4294967296:sec)-2208988800+packet.readUInt32BE(44)/4294967296)*1000;
  const offsetMs=utc-(t0+t1)/2;
  if(!Number.isFinite(offsetMs)||Math.abs(offsetMs)>2000)throw Error('Host clock differs from NTP by more than two seconds');
  return offsetMs;
}
async function queryNtp(host) {
  const socket=dgram.createSocket('udp4'),request=Buffer.alloc(48);request[0]=0x23;
  require('node:crypto').randomBytes(8).copy(request,40);
  try {
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('NTP deadline exceeded')),4000);
      socket.once('error',e=>{clearTimeout(timer);reject(e);});
      socket.connect(123,host,()=>{
        const t0=Date.now(),mono=performance.now();
        socket.once('message',p=>{clearTimeout(timer);try{resolve(parseNtpReply(p,request,t0,Date.now(),performance.now()-mono));}catch(e){reject(e);}});
        socket.send(request,e=>{if(e){clearTimeout(timer);reject(e);}});
      });
    });
  } finally {socket.close();}
}
async function checkHostClock() {
  if(execFileSync('/usr/bin/timedatectl',['show','-p','NTPSynchronized','--value'],{encoding:'utf8',timeout:5000}).trim()!=='yes')throw Error('Linux time service is not synchronized');
  const offsets=await Promise.all(['time.cloudflare.com','time.google.com'].map(queryNtp));
  if(Math.abs(offsets[0]-offsets[1])>1000)throw Error('Independent NTP sources disagree');
  return {synchronized:true,offsetsMs:offsets.map(Math.round),checkedAt:Date.now(),monotonic:performance.now()};
}
function createStore(dir) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const stateFile=path.join(dir,'pa-state.json');
  function durable(file,value,exclusive=false) {
    const temp=exclusive?file:file+`.${process.pid}.tmp`,fd=fs.openSync(temp,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(!exclusive)fs.renameSync(temp,file);
    if(process.platform!=='win32'){const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
  }
  return {
    read(){try{return JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}},
    write(v){durable(stateFile,v);},
    attempted(id){return fs.existsSync(path.join(dir,`pa-${id}-write.json`));},
    reserve(id,v){durable(path.join(dir,`pa-${id}-write.json`),v,true);},
    log(event,detail={}){const row={at:new Date().toISOString(),plant:'PA',event,...detail};fs.appendFileSync(path.join(dir,'pa-events.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});console.log(JSON.stringify(row));},
  };
}
async function runGuard({zk,expectedSerial,store,now=Date.now,hostCheck=checkHostClock}) {
  const due=transitionDue(now());if(!due)return 'outside_window';
  const old=store.read(),attempts=old.event===due.id?old.attempts||0:0;
  if((old.event===due.id&&old.status==='complete')||store.attempted(due.id)||attempts>=MAX_ATTEMPTS)return 'blocked';
  const state={event:due.id,attempts:attempts+1,status:'checking'};store.write(state);
  let connected=false;
  try {
    const host=await hostCheck();if(!host?.synchronized)throw Error('Host time check failed');
    await zk.createSocket();connected=true;
    if(cleanSerial(await zk.executeCmd(C.OPTIONS,Buffer.from('~SerialNumber\0')))!==expectedSerial)throw Error('PA terminal serial mismatch');
    const builtin=await readOption(zk,'DaylightSavingTime');
    if(!['0','1'].includes(builtin))throw Error('Unknown built-in DST setting');
    const before=await readDeviceClock(zk),skew=wallMilliseconds(before)-wallMilliseconds(wallParts(new Date(now())));
    if(Math.abs(skew)<=90000){store.write({...state,status:'complete'});store.log('already_correct',{transition:due.id,skewSeconds:Math.round(skew/1000),host});return 'already_correct';}
    if(builtin!=='0')throw Error('Built-in DST enabled; refusing competing clock correction');
    if(Math.abs(skew-due.staleOffsetMs)>300000)throw Error('Unexpected device skew; refusing clock correction');
    if(transitionDue(now())?.id!==due.id)throw Error('Transition window expired');
    if(Number.isFinite(host.checkedAt)&&Math.abs(now()-host.checkedAt-(performance.now()-host.monotonic))>500)throw Error('Host clock jumped after NTP check');
    if(await readOption(zk,'~SerialNumber')!==expectedSerial)throw Error('Terminal identity changed');
    if(transitionDue(now())?.id!==due.id)throw Error('Transition window expired');
    if(Number.isFinite(host.checkedAt)&&Math.abs(now()-host.checkedAt-(performance.now()-host.monotonic))>500)throw Error('Host clock jumped after NTP check');
    const target=wallParts(new Date(now()));
    // Intent is exclusive and flushed before any write. Lost ACK/crash/reboot cannot replay it.
    store.reserve(due.id,{event:due.id,at:new Date(now()).toISOString(),target});
    replyPayload(await zk.executeCmd(C.SET_TIME,encodeZktTime(target)),0);
    const after=await readDeviceClock(zk),skewAfter=wallMilliseconds(after)-wallMilliseconds(wallParts(new Date(now())));
    if(Math.abs(skewAfter)>15000)throw Error('Clock readback verification failed; write will not be repeated');
    store.write({...state,status:'complete'});store.log('corrected_verified',{transition:due.id,oldClock:before,newClock:after,skewBeforeSeconds:Math.round(skew/1000),skewAfterSeconds:Math.round(skewAfter/1000),host});return 'corrected_verified';
  } catch(e){store.write({...state,status:store.attempted(due.id)?'write_uncertain':'error'});store.log('error',{transition:due.id,message:e.message});throw e;}
  finally{if(connected)await zk.disconnect().catch(()=>{});}
}
function scheduleTest() {
  const dates={2026:['03-08','11-01'],2027:['03-14','11-07'],2028:['03-12','11-05'],2029:['03-11','11-04'],2030:['03-10','11-03']};
  for(const [year,days]of Object.entries(dates)){const ts=transitions(Number(year));if(new Date(ts[0].at).toISOString()!==`${year}-${days[0]}T07:00:00.000Z`||new Date(ts[1].at).toISOString()!==`${year}-${days[1]}T06:00:00.000Z`)throw Error('DST calendar failed');}
  console.log(JSON.stringify({ok:true,plant:'PA',years:'2026-2030',transitions2027:transitions(2027)}));
}
async function main() {
  const mode=process.argv[2]||'--status';if(mode==='--test-schedule'){scheduleTest();return;}
  if(!['--run','--status'].includes(mode))throw Error('Expected --run / --status / --test-schedule');
  if(mode==='--run'&&!transitionDue(Date.now()))return;
  require('dotenv').config({path:path.join(__dirname,'.env')});
  if(process.env.ZKT_PLANT_LOCATION!=='PA'||process.env.TZ!==ZONE)throw Error('Requires verified PA configuration and TZ=America/New_York');
  const ip=process.env.ZKT_IP,serial=process.env.ZKT_SERIAL_NUMBER;
  if(!require('node:net').isIPv4(ip)||!serial)throw Error('Verified IP and serial required');
  if(require('node-zklib/package.json').version!=='1.3.0')throw Error('Unsupported node-zklib version');
  const c=require('node-zklib/constants').COMMANDS;
  if(c.CMD_GET_TIME!==201||c.CMD_SET_TIME!==202||c.CMD_OPTIONS_RRQ!==11||c.CMD_ACK_OK!==2000)throw Error('Unsupported ZK protocol constants');
  const ZK=require('node-zklib'),zk=new ZK(ip,Number(process.env.ZKT_PORT||4370),5000,4000);
  const store=createStore(process.env.FARMPLAST_ZKT_DST_STATE_DIR||'/var/lib/farmplast-zkt-dst');
  if(mode==='--run'){await runGuard({zk,expectedSerial:serial,store});return;}
  const host=await checkHostClock();
  try {
    await zk.createSocket();const actual=await readOption(zk,'~SerialNumber');if(actual!==serial)throw Error('PA terminal serial mismatch');
    const builtin=await readOption(zk,'DaylightSavingTime'),before=await readDeviceClock(zk);
    const skew=Math.round((wallMilliseconds(before)-wallMilliseconds(wallParts(new Date())))/1000);
    const result={ok:Math.abs(skew)<=90,plant:'PA',ip,serial:actual,serialVerified:true,terminalClock:before,easternClock:wallParts(new Date()),skewSeconds:skew,builtinDst:builtin,host};
    store.log('status',result);if(!result.ok||builtin!=='0')throw Error('Preflight not eligible for automatic external DST');
  }finally{await zk.disconnect().catch(()=>{});}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={transitions,transitionDue,wallParts,wallMilliseconds,encodeZktTime,decodeZktTime,replyPayload,readOption,readDeviceClock,cleanSerial,parseNtpReply,queryNtp,createStore,runGuard,scheduleTest,MAX_TRANSITION_AGE_MS};
