const fields = new Set(['source_employee_id', 'full_name', 'employee_number', 'phone', 'email', 'position', 'is_active']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateBatch(body) {
  if (!body || Object.keys(body).some(k => k !== 'employees') || !Array.isArray(body.employees) || !body.employees.length || body.employees.length > 250) return false;
  const ids = new Set(), numbers = new Set();
  return body.employees.every(e => {
    if (!e || typeof e !== 'object' || Object.keys(e).some(k => !fields.has(k)) || !uuid.test(e.source_employee_id) ||
      typeof e.full_name !== 'string' || !e.full_name.trim() || e.full_name.length > 200 ||
      typeof e.employee_number !== 'string' || !e.employee_number.trim() || e.employee_number.length > 64 ||
      typeof e.is_active !== 'boolean' || ['phone','email','position'].some(k => e[k] !== null && (typeof e[k] !== 'string' || e[k].length > 254)) ||
      ids.has(e.source_employee_id) || numbers.has(e.employee_number.trim())) return false;
    ids.add(e.source_employee_id); numbers.add(e.employee_number.trim()); return true;
  });
}
async function equalSecret(a, b) {
  const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [x,y] = await Promise.all([hash(a),hash(b)]); let diff=0;
  for(let i=0;i<x.length;i++) diff |= x[i]^y[i];
  return diff===0;
}
export function createHandler({ secret, additionalSecrets = [], enabled, sync }) {
  const secrets = [secret, ...additionalSecrets].filter(value => typeof value === 'string' && value.length >= 32);
  const response = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return async req => {
    if(req.method!=='POST') return response({error:'method_not_allowed'},405);
    const matches=await Promise.all(secrets.map(value=>equalSecret(req.headers.get('x-farmplast-sync-secret')||'',value)));
    if(!matches.some(Boolean)) return response({error:'unauthorized'},401);
    try {
      if(Number(req.headers.get('content-length')||0)>256000) return response({error:'payload_too_large'},413);
      const text=await req.text(); if(text.length>256000) return response({error:'payload_too_large'},413);
      let body; try {body=JSON.parse(text);} catch{return response({error:'invalid_payload'},400);}
      if(!validateBatch(body)) return response({error:'invalid_payload'},400);
      if(!await enabled()) return response({error:'reconciliation_not_enabled'},503);
      const results=[];
      for(const employee of body.employees) results.push(await sync(employee));
      return response({results,synced:results.filter(r=>r.status!=='failed').length,failed:results.filter(r=>r.status==='failed').length});
    } catch { return response({error:'sacs_unavailable'},503); }
  };
}
