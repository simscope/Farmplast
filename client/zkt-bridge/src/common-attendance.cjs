'use strict';
const {fail,check,parseTime}=require('./core.cjs');
async function importAttendance(result,{db,cfg,signal,now=()=>Date.now()}) {
 if(result.serialNumber!==cfg.serialNumber || !Array.isArray(result.users))throw fail('Serial and user readback required for common import','IDENTITY');
 const bindings=await db.confirmAssignments(cfg.deviceKey,result.serialNumber,result.users,signal);
 const logs=Array.isArray(result.logs)?result.logs:[];
 const events=logs.filter(r=>typeof r.timestamp==='string' && Date.parse(parseTime(r.timestamp))>=now()-cfg.lookback*86400000)
  .map(r=>({deviceUserId:String(r.deviceUserId || r.userId),timestamp:r.timestamp,raw:r}));
 let inserted=0,skipped=logs.length-events.length;
 for(let i=0;i<events.length;i+=cfg.batch){
  check(signal);const r=await db.importBatch(cfg.deviceKey,result.serialNumber,events.slice(i,i+cfg.batch),signal);
  inserted+=r.inserted;skipped+=r.skipped;
 }
 const processed=await db.processAttendance(signal);
 if(processed?.ok===false)throw fail('Attendance processing failed','DATABASE');
 return {ok:true,message:'All employees imported with verified device and assignment ownership',mode:'official_zkteco_sdk_com_32bit_powershell',total:logs.length,inserted,skipped,bindings,processed};
}
module.exports={importAttendance};
