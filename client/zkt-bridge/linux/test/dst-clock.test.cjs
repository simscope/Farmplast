'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const clock=require('../dst-clock.cjs');
const {transitions,transitionDue,wallParts,wallMilliseconds,encodeZktTime,decodeZktTime,replyPayload,cleanSerial,parseNtpReply,createStore,runGuard}=clock;
function reply(payload=Buffer.alloc(0),cmd=2000){const h=Buffer.alloc(8);h.writeUInt16LE(cmd);h.writeUInt16LE(1,4);return Buffer.concat([h,payload]);}
function fixture(kind='spring',options={}) {
  const due=transitions(2027).find(t=>t.kind===kind),now=due.at+60000;
  const expected=wallParts(new Date(now)),before=decodeZktTime(encodeZktTime({...expected,hour:expected.hour+(kind==='spring'?-1:1)}));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'farmplast-dst-'));
  const store=createStore(dir);store.log=()=>{};
  const calls=[];let writes=0,connected=0;
  const zk={
    async createSocket(){connected++;},async disconnect(){},
    async executeCmd(cmd,data){
      calls.push(cmd);
      if(cmd===11){const key=data.toString().replace(/\0$/,'');return reply(Buffer.from(key+'='+(key==='~SerialNumber'?(options.serial||'SERIAL-PA'):(options.builtin||'0'))));}
      if(cmd===201){if(writes&&options.failReadback)throw Error('readback unavailable');return reply(encodeZktTime(writes&&!options.badReadback?expected:before));}
      if(cmd===202){assert.equal(fs.existsSync(path.join(dir,`pa-${due.id}-write.json`)),true);assert.deepEqual(decodeZktTime(data),expected);writes++;if(options.lostAck)throw Error('lost ACK');return reply(Buffer.alloc(0),options.nack?2001:2000);}
      throw Error('Forbidden non-clock command');
    },
  };
  return {due,now,dir,store,zk,calls,get writes(){return writes;},get connected(){return connected;},args:{zk,expectedSerial:'SERIAL-PA',store,now:()=>now,hostCheck:async()=>({synchronized:true})}};
}
test('2026-2030 exact UTC/Eastern transitions, both five-minute boundaries and no later catch-up',()=>{
  const dates={2026:['03-08','11-01'],2027:['03-14','11-07'],2028:['03-12','11-05'],2029:['03-11','11-04'],2030:['03-10','11-03']};
  for(const [year,d]of Object.entries(dates)){
    const ts=transitions(+year);assert.equal(new Date(ts[0].at).toISOString(),`${year}-${d[0]}T07:00:00.000Z`);assert.equal(new Date(ts[1].at).toISOString(),`${year}-${d[1]}T06:00:00.000Z`);
    for(const t of ts){assert.equal(transitionDue(t.at-1),null);assert.equal(transitionDue(t.at).id,t.id);assert.equal(transitionDue(t.at+299999).id,t.id);assert.equal(transitionDue(t.at+300000),null);}
    assert.equal(wallParts(new Date(ts[0].at)).hour,3);assert.equal(wallParts(new Date(ts[1].at)).hour,1);
  }
});
test('packed clocks preserve nonexistent/repeated wall hours and match independent golden wire values',()=>{
  assert.equal(encodeZktTime({year:2027,month:3,day:14,hour:3,minute:0,second:0}).toString('hex'),'b0a41c34');
  assert.equal(encodeZktTime({year:2027,month:11,day:7,hour:1,minute:0,second:0}).toString('hex'),'10425a35');
  const gap={year:2027,month:3,day:14,hour:2,minute:30,second:0};assert.deepEqual(decodeZktTime(encodeZktTime(gap)),gap);
  assert.throws(()=>encodeZktTime({...gap,month:2,day:30}),/Invalid/);assert.throws(()=>decodeZktTime(Buffer.alloc(2)),/Invalid/);
});
test('acknowledgements, lengths and exact serial payloads fail closed',()=>{
  assert.equal(cleanSerial(reply(Buffer.from('~SerialNumber=ABCD123456\0'))),'ABCD123456');
  for(const b of [Buffer.alloc(1),reply(Buffer.from('~SerialNumber=AAAA'),2001),reply(Buffer.from('~SerialNumber=AAAA\0~SerialNumber=BBBB'))])assert.throws(()=>cleanSerial(b));
  assert.throws(()=>replyPayload(reply(Buffer.alloc(3)),4));assert.throws(()=>replyPayload(reply(Buffer.alloc(4)),0));
});
for(const kind of ['spring','autumn'])test(`${kind}: one verified write; persisted state and intent survive new guard instances`,async()=>{
  const f=fixture(kind);assert.equal(await runGuard(f.args),'corrected_verified');assert.equal(f.writes,1);assert.equal(f.store.read().status,'complete');
  assert.equal(await runGuard({...f.args,store:createStore(f.dir)}),'blocked');assert.equal(f.writes,1);
  assert.deepEqual(new Set(f.calls),new Set([11,201,202]));
});
test('already-correct terminal, disabled host sync, wrong serial, built-in DST, unrelated drift never write',async()=>{
  const correct=fixture();correct.zk.executeCmd=async(cmd,data)=>cmd===201?reply(encodeZktTime(wallParts(new Date(correct.now)))):reply(Buffer.from(data.toString().replace(/\0$/,'')+'='+(data.toString().startsWith('~Serial')?'SERIAL-PA':'0')));
  assert.equal(await runGuard(correct.args),'already_correct');assert.equal(correct.writes,0);
  for(const opts of [{serial:'WRONG'},{builtin:'1'}]){const f=fixture('spring',opts);await assert.rejects(runGuard(f.args));assert.equal(f.writes,0);}
  const badHost=fixture();await assert.rejects(runGuard({...badHost.args,hostCheck:async()=>{throw Error('clock wrong');}}));assert.equal(badHost.connected,0);
  const drift=fixture();const orig=drift.zk.executeCmd;drift.zk.executeCmd=async(cmd,data)=>cmd===201?reply(encodeZktTime({...wallParts(new Date(drift.now)),hour:0})):orig(cmd,data);
  await assert.rejects(runGuard(drift.args),/Unexpected/);assert.equal(drift.writes,0);
});
test('lost ACK, negative ACK and failed/wrong readback persist intent and forbid automatic replay',async()=>{
  for(const opts of [{lostAck:true},{nack:true},{failReadback:true},{badReadback:true}]){const f=fixture('autumn',opts);await assert.rejects(runGuard(f.args));assert.equal(f.writes,1);assert.equal(f.store.read().status,'write_uncertain');assert.equal(await runGuard({...f.args,store:createStore(f.dir)}),'blocked');assert.equal(f.writes,1);}
});
test('at most four failed checks; no contact before/after boundary or when final network read crosses deadline',async()=>{
  const f=fixture('spring',{serial:'WRONG'});for(let i=0;i<4;i++)await assert.rejects(runGuard(f.args));assert.equal(await runGuard(f.args),'blocked');assert.equal(f.connected,4);
  const outside=fixture();assert.equal(await runGuard({...outside.args,now:()=>outside.due.at+300000}),'outside_window');assert.equal(outside.connected,0);
  const late=fixture();let reads=0;await assert.rejects(runGuard({...late.args,now:()=>++reads<3?late.now:late.due.at+300000}),/expired/);assert.equal(late.writes,0);
});
test('exclusive durable intent cannot be overwritten even with a lost state file',async()=>{
  const f=fixture();await runGuard(f.args);fs.unlinkSync(path.join(f.dir,'pa-state.json'));assert.equal(await runGuard(f.args),'blocked');assert.throws(()=>f.store.reserve(f.due.id,{}),/EEXIST/);assert.equal(f.writes,1);
});
test('NTP rejects wrong host time, leap alarm, wrong origin, high uncertainty, slow replies and host jumps',()=>{
  const request=Buffer.alloc(48);request.writeBigUInt64BE(0x12345678n,40);
  const time=Date.UTC(2027,2,14,7),p=Buffer.alloc(48);p[0]=0x24;p[1]=2;request.copy(p,24,40,48);p.writeUInt32BE(time/1000+2208988800,40);
  assert.equal(parseNtpReply(p,request,time-10,time+10,20),0);
  assert.throws(()=>parseNtpReply(p,request,time+3600000,time+3600020,20),/Host clock/);
  for(const mutate of [b=>b[0]=0xe4,b=>b[1]=0,b=>b[24]^=1,b=>b.writeUInt32BE(3*65536,8)]){const b=Buffer.from(p);mutate(b);assert.throws(()=>parseNtpReply(b,request,time-10,time+10,20));}
  assert.throws(()=>parseNtpReply(p,request,time-10,time+2000,2010));assert.throws(()=>parseNtpReply(p,request,time-10,time+1010,20));
});
test('installed node-zklib 1.3.0 talks GET/SET_TIME to a safe TCP terminal emulator',async()=>{
  const ZK=require('node-zklib');assert.equal(require('node-zklib/package.json').version,'1.3.0');
  let packed=Buffer.from('b0a41c34','hex');const commands=[];
  const server=net.createServer(socket=>{let input=Buffer.alloc(0);socket.on('data',chunk=>{input=Buffer.concat([input,chunk]);while(input.length>=8&&input.length>=8+input.readUInt32LE(4)){
    const size=input.readUInt32LE(4),packet=input.subarray(8,8+size);input=input.subarray(8+size);const cmd=packet.readUInt16LE(0);commands.push(cmd);
    if(cmd===202){assert.equal(size,12);packed=Buffer.from(packet.subarray(8));}
    let body=cmd===201?packed:Buffer.alloc(0);if(cmd===11)body=Buffer.from('~SerialNumber=EMULATOR');
    const header=reply(body);header.writeUInt16LE(packet.readUInt16LE(6),6);const prefix=Buffer.from([0x50,0x50,0x82,0x7d,0,0,0,0]);prefix.writeUInt32LE(header.length,4);socket.write(Buffer.concat([prefix,header]));
  }})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const zk=new ZK('127.0.0.1',server.address().port,1000,4000);
  try{await zk.createSocket();assert.equal(typeof zk.getTime,'undefined');assert.equal((await clock.readDeviceClock(zk)).hour,3);replyPayload(await zk.executeCmd(202,Buffer.from('10425a35','hex')),0);assert.deepEqual(await clock.readDeviceClock(zk),{year:2027,month:11,day:7,hour:1,minute:0,second:0});}
  finally{await zk.disconnect();await new Promise(resolve=>server.close(resolve));}
  assert.deepEqual(commands,[1000,201,202,201,1001]);
});
