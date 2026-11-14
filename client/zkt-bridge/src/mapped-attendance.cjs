'use strict';
const {fail,check,powershell}=require('./core.cjs');

function scope(env) {
  const ids=String(env.ZKT_MAPPED_TERMINAL_USER_IDS || '').split(',').filter(Boolean);
  const from=String(env.ZKT_MAPPED_LOCAL_FROM || '');
  if (!ids.length || ids.some(id=>!/^\d+$/.test(id)) || !/^\d{4}-\d{2}-\d{2} 00:00:00$/.test(from) || !Number.isFinite(Date.parse(from.replace(' ','T')))) {
    throw fail('Explicit mapped terminal IDs and local start date required','CONFIG');
  }
  return {ids:new Set(ids),from};
}

async function collect({client,cfg,env,signal,sdk=powershell,probe=false}) {
  const selection=scope(env);
  if (!cfg.deviceKey || !cfg.serialNumber) throw fail('Verified device identity required','CONFIG');
  const {data:device,error}=await client.from('zkt_identity_devices')
    .select('device_key,serial_number,plant_location,verified').eq('device_key',cfg.deviceKey).single().abortSignal(signal);
  if (error || !device?.verified || device.serial_number!==cfg.serialNumber || device.plant_location!==cfg.plant) {
    throw fail('Device registry does not match configured identity','IDENTITY');
  }
  // Never take commands from the historical worker or overlap its active job.
  const pending=await client.from('zkt_bridge_commands').select('id').eq('status','running').limit(1).abortSignal(signal);
  if (pending.error) throw fail('Cannot verify historical worker is idle','DATABASE');
  if (pending.data?.length) throw fail('Historical bridge is busy; retry later','BUSY');
  const result=await sdk({operation:probe?'test':'pull_attendance',ip:cfg.ip,port:cfg.port,machine:cfg.machine,
    expectedSerialNumber:cfg.serialNumber,readOnly:true},{signal,timeoutMs:cfg.childMs});
  check(signal);
  if (!result.ok || result.serialNumber!==cfg.serialNumber) throw fail('SDK serial read-back failed','IDENTITY');
  if (probe) return {ok:true,device_key:cfg.deviceKey,serialNumber:result.serialNumber,readOnly:true};
  const events=(Array.isArray(result.logs)?result.logs:[]).filter(r=>selection.ids.has(String(r.deviceUserId || r.userId))
    && typeof r.timestamp==='string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.timestamp) && r.timestamp>=selection.from);
  let owned=0,review=0;
  for(let start=0;start<events.length;start+=cfg.batch) {
    check(signal);
    const imported=await client.rpc('ingest_zkt_identity_events',{p_device_key:cfg.deviceKey,p_serial_number:result.serialNumber,
      p_events:events.slice(start,start+cfg.batch)}).abortSignal(signal);
    if(imported.error) throw fail('Identity evidence import failed','DATABASE');
    owned+=imported.data.owned;review+=imported.data.review;
  }
  // Existing processor keeps manual hours, closed days and issued checks protected.
  let processed=null;
  if(events.length) {
    const answer=await client.rpc('process_zkt_attendance_to_work_logs').abortSignal(signal);
    if(answer.error || answer.data?.ok===false) throw fail('Attendance processing failed','DATABASE');
    processed=answer.data;
  }
  return {ok:true,device_key:cfg.deviceKey,serialNumber:result.serialNumber,matched:events.length,owned,review,processed};
}
module.exports={scope,collect};
