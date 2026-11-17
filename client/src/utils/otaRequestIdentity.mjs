// Keep an uncertain request idempotent. A confirmed terminal result permits retry.
export function nextOtaRequest(previous,release,observed,makeId=()=>crypto.randomUUID()){
 if(!previous||previous.release!==release||(observed?.id===previous.id&&['failed','completed'].includes(observed.status)))return {id:makeId(),release}
 return previous
}
