'use strict';
const localFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function localTimestamp(instant){
 const date=new Date(instant);if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(localFormatter.formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
async function confirmAssignments(client,identity){
 if(!identity)throw Error('Verified device and SDK user inventory required');
 const {data,error}=await client.rpc('confirm_zkt_assignment_readback',{p_device_key:identity.deviceKey,p_serial_number:identity.serialNumber,p_users:identity.users});
 if(error)throw error;return data;
}
async function validateAssignment(client,identity,employeeId){
 const {error}=await client.rpc('validate_zkt_assignment_sync',{p_employee_id:employeeId,p_device_key:identity.deviceKey,p_serial_number:identity.serialNumber});
 if(error)throw error;
}
async function importAttendance(client,logs,identity,parseTime,userId){
 const bindings=await confirmAssignments(client,identity);
 const events=logs.map(r=>({deviceUserId:userId(r),timestamp:localTimestamp(parseTime(r.recordTime || r.timestamp || r.attTime)),raw:r}));
 let inserted=0,skipped=0;
 for(let start=0;start<events.length;start+=50){
  const {data,error}=await client.rpc('ingest_zkt_attendance_batch',{p_device_key:identity.deviceKey,p_serial_number:identity.serialNumber,p_events:events.slice(start,start+50)});
  if(error)throw error;inserted+=data.inserted;skipped+=data.skipped;
 }
 const {data:processed,error}=await client.rpc('process_zkt_attendance_to_work_logs');
 if(error || processed?.ok===false)throw error || Error('Attendance processing failed');
 return {inserted,skipped,identity:bindings,processed};
}
module.exports={localTimestamp,confirmAssignments,validateAssignment,importAttendance};
