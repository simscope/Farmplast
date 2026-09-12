import { digest, equalSecret, sign, validQueue } from './protocol.mjs'
import { commandPatch } from './commands.mjs'

// Custom auth is mandatory on EVERY branch: verified user + allowlist, or dedicated device secret.
export function createHandler(createClient, getEnv) {
const env = name => { const value = getEnv(name); if (!value) throw new Error('OTA not configured'); return value }
return async req => {
  const origin = req.headers.get('origin')
  const allowedOrigin = getEnv('CH1_OTA_WEB_ORIGIN')
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' }
  if (origin && origin === allowedOrigin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' })
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (origin && origin !== allowedOrigin) return reply({ error: 'Origin rejected' }, 403)
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405)
  try {
    const reader=req.body?.getReader(); const chunks=[]; let size=0
    if (!reader) return reply({ error: 'Body required' },400)
    for (;;) {
      const {done,value}=await reader.read(); if(done) break
      size+=value.byteLength
      if(size>4096) {await reader.cancel();return reply({error:'Request too large'},413)}
      chunks.push(value)
    }
    const bytes=new Uint8Array(size);let offset=0
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength}
    const raw = new TextDecoder().decode(bytes)
    const body = JSON.parse(raw)
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
    const checked = async (query) => { const r = await query; if (r.error) throw new Error('Database request failed'); return r.data }
    if (body.op === 'sync') {
      const secret = env('CH1_OTA_DEVICE_KEY')
      if (secret.length < 32 || !await equalSecret(req.headers.get('x-ch1-device-key') || '', secret)) return reply({ error: 'Unauthorized' }, 401)
      if (!/^[A-Za-z0-9._-]{1,48}$/.test(body.version || '') || !/^[0-9a-f]{32}$/.test(body.boot || '') || !['idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed'].includes(body.status) || !Number.isInteger(body.progress) || body.progress<0 || body.progress>100) return reply({ error: 'Invalid report' }, 400)
      const result = await checked(db.rpc('ch1_device_sync', { p_version: body.version, p_boot: body.boot, p_job: body.job || null, p_status: body.status, p_progress: body.progress }))
      if (result.o) {
        const job=result.o
        const link=await checked(db.storage.from('ch1-firmware').createSignedUrl(job.path,Math.max(1,job.expires-Math.floor(Date.now()/1000))))
        delete job.path
        result.o={...job,url:link.signedUrl,mac:await sign(job,secret)}
      }
      return reply(result)
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || ''
    const { data: { user }, error } = await db.auth.getUser(token)
    if (error || !user) return reply({ error: 'Sign in required' }, 401)
    if (!env('CH1_OTA_OPERATOR_IDS').split(',').map(s => s.trim()).includes(user.id)) return reply({ error: 'Operator access required' }, 403)
    if (body.op === 'unlock') {
      if (!await checked(db.rpc('ch1_ota_attempt', { p_user: user.id }))) return reply({ error: 'Too many attempts. Wait 15 minutes.' }, 429)
      if (typeof body.code !== 'string' || !await equalSecret(body.code, env('CH1_OTA_OPERATOR_CODE'))) {
        await checked(db.from('ch1_ota_events').insert({operator_id:user.id,event:'code_rejected'}))
        return reply({ error: 'Incorrect code' }, 403)
      }
      await checked(db.from('ch1_ota_events').insert({operator_id:user.id,event:'code_authorized'}))
      const grant = crypto.randomUUID() + crypto.randomUUID()
      await checked(db.from('ch1_ota_grants').insert({ token_hash: await digest(grant), operator_id: user.id }))
      return reply({ grant, expires: Date.now() + 300000 })
    }
    const grantHash = await digest(typeof body.grant === 'string' ? body.grant : '')
    if (body.op === 'command') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.id || '')) return reply({error:'Invalid request id'},400)
      let patch
      try { patch=commandPatch(body.type,body.value) } catch {return reply({error:'Invalid command'},400)}
      if(body.type==='reset_alert') {
        if(!await checked(db.rpc('ch1_ota_attempt',{p_user:user.id}))) return reply({error:'Too many attempts. Wait 15 minutes.'},429)
        if(typeof body.pin!=='string' || !await equalSecret(body.pin,env('CH1_OTA_OPERATOR_CODE'))) return reply({error:'Invalid PIN code'},403)
      }
      const command=await checked(db.rpc('ch1_control_request',{p_user:user.id,p_id:body.id,p_type:body.type,p_patch:patch}))
      return reply({command})
    }
    if (body.op === 'control_status') {
      await checked(db.rpc('ch1_control_reconcile'))
      const desired=await checked(db.from('ch1_desired_state').select('values,revision,updated_at').eq('id','ESP32-CH1').maybeSingle())
      const commands=await checked(db.from('ch1_control_commands').select('id,command_type,requested,revision,status,created_at,expires_at,applied_at').order('created_at',{ascending:false}).limit(5))
      return reply({desired,commands})
    }
    // Queue validates/consumes the grant atomically; same-operator exact retries are idempotent.
    if (body.op === 'queue' && validQueue(body)) {
      const id = await checked(db.rpc('ch1_ota_queue', { p_user: user.id, p_grant: grantHash, p_id: body.id, p_release: body.release || null }))
      return reply({ id })
    }
    if (body.op === 'status') {
      await checked(db.rpc('ch1_control_reconcile'))
      await checked(db.from('ch1_ota_jobs').update({status:'failed',failure:'deadline_exceeded',updated_at:new Date().toISOString()}).not('status','in','(completed,failed)').lte('expires_at',new Date().toISOString()))
      const releases = await checked(db.from('ch1_ota_releases').select('id,version,size,sha256').eq('approved', true).order('created_at', { ascending: false }).limit(20))
      const device = await checked(db.from('ch1_ota_device').select('version,boot_id,last_seen').eq('id','ESP32-CH1').maybeSingle())
      const jobs = await checked(db.from('ch1_ota_jobs').select('id,release_id,status,progress,failure,created_at,updated_at,expires_at,release:ch1_ota_releases(version)').order('created_at', { ascending: false }).limit(5))
      const desired=await checked(db.from('ch1_desired_state').select('values,revision,updated_at').eq('id','ESP32-CH1').maybeSingle())
      const commands=await checked(db.from('ch1_control_commands').select('id,command_type,requested,revision,status,created_at,expires_at,applied_at').order('created_at',{ascending:false}).limit(5))
      const last_successful_update=await checked(db.from('ch1_ota_jobs').select('updated_at').eq('status','completed').order('updated_at',{ascending:false}).limit(1).maybeSingle())
      return reply({ releases, device, jobs, desired, commands, last_successful_update })
    }
    return reply({ error: 'Invalid request' }, 400)
  } catch {
    // Never return database internals, credentials or request contents to clients/logs.
    return reply({ error: 'OTA unavailable or request rejected. Check device/job status before retrying.' }, 503)
  }
}
}
