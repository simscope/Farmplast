require('cross-fetch/polyfill')
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const ZKLib = require('node-zklib')
const { COMMANDS } = require('node-zklib/constants')
const commonImport = require('./common-import.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
const ZKT_IP = process.env.ZKT_IP || '192.168.1.201'
const ZKT_PORT = Number(process.env.ZKT_PORT || 4370)
const ZKT_TIMEOUT_MS = Number(process.env.ZKT_TIMEOUT_MS || 10000)
const ZKT_INPORT_MS = Number(process.env.ZKT_INPORT_MS || 4000)
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 300000)
const COMMAND_TIMEOUT_MS = Number(process.env.ZKT_COMMAND_TIMEOUT || 300000)
const PLANT_LOCATION = normalizePlantLocation(process.env.ZKT_PLANT_LOCATION || 'PA')
const ACTIVE_START_HOUR = Number(process.env.BRIDGE_ACTIVE_START_HOUR || 8)
const ACTIVE_END_HOUR = Number(process.env.BRIDGE_ACTIVE_END_HOUR || 21)
const AUTO_PULL_HOURS = parseHourList(process.env.AUTO_PULL_HOURS || '8,20')
const VERIFIED_DEVICE_KEY = String(process.env.ZKT_DEVICE_KEY || '').trim()
const VERIFIED_SERIAL_NUMBER = String(process.env.ZKT_SERIAL_NUMBER || '').trim()

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function nowIso() {
  return new Date().toISOString()
}

function logStep(message) {
  console.log(`[${nowIso()}] ${message}`)
}

function parseHourList(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
}

function isBridgeActive(date = new Date()) {
  const hour = date.getHours()

  if (ACTIVE_START_HOUR <= ACTIVE_END_HOUR) {
    return hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR
  }

  return hour >= ACTIVE_START_HOUR || hour < ACTIVE_END_HOUR
}

function autoPullSlotKey(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${hh}`
}

function normalizePlantLocation(value) {
  return String(value || 'NJ').trim().toUpperCase() === 'PA' ? 'PA' : 'NJ'
}

function commandPlantLocation(command) {
  return normalizePlantLocation(command?.payload?.plant_location || 'NJ')
}

function isCommandForThisBridge(command) {
  return commandPlantLocation(command) === PLANT_LOCATION
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return { value: String(value) }
  }
}

function errorText(err) {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err.message) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

async function withTimeout(promise, ms, message, onTimeout) {
  const operation = Promise.resolve(promise)
  const timeoutError = new Error(message)
  let timer

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), ms)
      }),
    ])
  } catch (err) {
    if (err === timeoutError) {
      // A deadline does not cancel node-zklib or an in-flight database request.
      // Keep the shared worker occupied until that operation has finished.
      logStep(`${message}; waiting for in-flight operation to settle`)
      if (onTimeout) {
        try {
          await onTimeout(timeoutError)
        } catch (statusError) {
          logStep(`Timeout status update failed: ${errorText(statusError)}`)
        }
      }
      await operation.catch(() => {})
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function withZkt(callback) {
  const zk = new ZKLib(ZKT_IP, ZKT_PORT, ZKT_TIMEOUT_MS, ZKT_INPORT_MS)
  await zk.createSocket()
  try {
    return await callback(zk)
  } finally {
    try {
      await zk.disconnect()
    } catch {}
  }
}

async function withDisabledZkt(callback) {
  return await withZkt(async (zk) => {
    let disabled = false

    try {
      await zk.disableDevice()
      disabled = true
    } catch (err) {
      logStep(`Disable device warning: ${errorText(err)}`)
    }

    try {
      return await callback(zk)
    } finally {
      if (disabled) {
        try {
          await zk.enableDevice()
        } catch (err) {
          logStep(`Enable device warning: ${errorText(err)}`)
        }
      }
    }
  })
}

function normalizeZktUsers(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.data)) return result.data
  return []
}

function normalizeZktLogs(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.data)) return result.data
  return []
}

function toPositiveInt(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback
}

function writeAsciiField(buffer, value, offset, length) {
  const text = String(value || '').slice(0, length)
  buffer.fill(0, offset, offset + length)
  buffer.write(text, offset, length, 'ascii')
}

function employeeZktUserId(employee) {
  return toPositiveInt(employee?.zkt_user_id, toPositiveInt(employee?.employee_number))
}

function deviceUserId(user) {
  const raw = user?.userId ?? user?.deviceUserId ?? user?.uid ?? user?.userSn
  const number = toPositiveInt(raw)
  return number ? String(number) : String(raw || '').trim()
}

function buildEmployeeZktPayload(employee) {
  const userId = employeeZktUserId(employee)
  if (!userId) throw new Error(`Employee ${employee?.id || ''} has no valid zkt_user_id or employee_number`)

  const fullName = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim()
  const name = String(employee.zkt_name || fullName || userId).trim().slice(0, 24)
  if (!name) throw new Error(`Employee ${employee?.id || ''} has no valid ZKT name`)

  return {
    userId,
    uid: userId,
    name,
    password: employee.zkt_password ? String(employee.zkt_password).slice(0, 8) : '',
    cardNo: toPositiveInt(employee.zkt_card_number, 0),
    role: toPositiveInt(employee.zkt_privilege, 0),
  }
}

function buildZktUserRecord(employee) {
  const payload = buildEmployeeZktPayload(employee)
  const record = Buffer.alloc(72, 0)

  record.writeUInt16LE(payload.uid, 0)
  record.writeUInt8(payload.role, 2)
  writeAsciiField(record, payload.password, 3, 8)
  writeAsciiField(record, payload.name, 11, 24)
  record.writeUInt32LE(payload.cardNo, 35)
  writeAsciiField(record, String(payload.userId), 48, 9)

  return { ...payload, record }
}

async function updateEmployeeZktStatus(employeeId, patch) {
  const { error } = await supabase
    .from('employees')
    .update(patch)
    .eq('id', employeeId)

  if (error) throw error
}

function selectEmployeeFields() {
  return `
    id,
    employee_number,
    plant_location,
    first_name,
    last_name,
    active,
    zkt_user_id,
    zkt_name,
    zkt_password,
    zkt_card_number,
    zkt_privilege,
    zkt_enabled,
    zkt_sync_status,
    zkt_sync_error,
    zkt_synced_at
  `
}

function normalizeEmployeeRows(rows) {
  return (rows || []).filter((employee) => {
    if (!isEmployeeForThisBridge(employee)) return false
    if (employee.zkt_enabled === false && employee.zkt_sync_status !== 'pending') return false
    if (employee.active === false) return false
    return employeeZktUserId(employee) > 0
  })
}

function isEmployeeForThisBridge(employee) {
  return normalizePlantLocation(employee?.plant_location || 'NJ') === PLANT_LOCATION
}

async function loadEmployeesForZkt(payload = {}) {
  let query = supabase
    .from('employees')
    .select(selectEmployeeFields())
    .eq('plant_location', PLANT_LOCATION)
    .eq('active', true)
    .order('zkt_user_id', { ascending: true })

  const employeeId = payload.employee_id || payload.id
  if (employeeId) query = query.eq('id', employeeId)

  const { data, error } = await query
  if (error) throw error
  return normalizeEmployeeRows(data)
}

async function loadOneEmployeeForZkt(payload = {}) {
  const employeeId = payload.employee_id || payload.id
  if (!employeeId) throw new Error('Command requires payload.employee_id')

  const { data, error } = await supabase
    .from('employees')
    .select(selectEmployeeFields())
    .eq('id', employeeId)
    .single()

  if (error) throw error
  if (!data) throw new Error('Employee not found')
  if (!isEmployeeForThisBridge(data)) {
    throw new Error(`Employee belongs to ${normalizePlantLocation(data.plant_location)} but this bridge is ${PLANT_LOCATION}`)
  }
  if (!data.active) throw new Error('Employee is inactive')
  if (data.zkt_enabled === false && data.zkt_sync_status !== 'pending') throw new Error('Employee ZKT sync is disabled')

  return data
}

function parseZktTime(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null
}

async function runZktTest() {
  return await withZkt(async (zk) => {
    let info = null
    try {
      info = await zk.getInfo()
    } catch (err) {
      info = { warning: errorText(err) }
    }

    return {
      ok: true,
      message: 'Linux ZKT bridge connection OK',
      mode: 'node-zklib-linux',
      plant_location: PLANT_LOCATION,
      device: {
        ip: ZKT_IP,
        port: ZKT_PORT,
      },
      info: safeJson(info),
    }
  })
}

async function runVerifyEmployees(payload = {}) {
  const employees = await loadEmployeesForZkt(payload)
  const users = await withDisabledZkt(async (zk) => normalizeZktUsers(await zk.getUsers()))
  const deviceIds = new Set(users.map(deviceUserId).filter(Boolean))
  let onDevice = 0
  let missing = 0
  let skipped = 0
  const skippedReasons = []

  for (const employee of employees) {
    let zktPayload = null

    try {
      zktPayload = buildEmployeeZktPayload(employee)
    } catch (err) {
      skipped += 1
      const reason = errorText(err)
      skippedReasons.push({
        employee_id: employee.id,
        employee_number: employee.employee_number,
        reason,
      })
      await updateEmployeeZktStatus(employee.id, {
        zkt_sync_status: 'skipped',
        zkt_sync_error: reason,
        zkt_synced_at: null,
      })
      continue
    }

    if (deviceIds.has(String(zktPayload.userId))) {
      onDevice += 1
      await updateEmployeeZktStatus(employee.id, {
        zkt_sync_status: 'verified_sdk',
        zkt_sync_error: null,
        zkt_synced_at: nowIso(),
      })
    } else {
      missing += 1
      await updateEmployeeZktStatus(employee.id, {
        zkt_sync_status: 'missing_on_zkt',
        zkt_sync_error: 'Employee exists in database but was not found on ZKT by Linux bridge',
        zkt_synced_at: null,
      })
    }
  }

  return {
    ok: true,
    message: 'Linux bridge verify finished',
    mode: 'node-zklib-linux',
    plant_location: PLANT_LOCATION,
    total: employees.length,
    sdk_user_count: users.length,
    on_device: onDevice,
    verified: onDevice,
    missing_on_zkt: missing,
    skipped,
    skipped_reasons: skippedReasons,
    users: users.map((user) => safeJson(user)),
  }
}

async function runSyncEmployees(payload = {}) {
  const employees = await loadEmployeesForZkt(payload)
  const results = []

  await withDisabledZkt(async (zk) => {
    const target=await verifyAttendanceDevice(zk)
    for (const employee of employees) {
      try {
        await commonImport.validateAssignment(supabase,target,employee.id)
        const zktPayload = buildZktUserRecord(employee)
        await zk.executeCmd(COMMANDS.CMD_USER_WRQ, zktPayload.record)
        results.push({
          employee_id: employee.id,
          employee_number: employee.employee_number,
          zkt_user_id: zktPayload.userId,
          name: zktPayload.name,
          status: 'sent',
        })
      } catch (err) {
        const message = errorText(err)
        await updateEmployeeZktStatus(employee.id, {
          zkt_sync_status: 'error',
          zkt_sync_error: message,
          zkt_synced_at: null,
        })
        results.push({
          employee_id: employee.id,
          employee_number: employee.employee_number,
          status: 'error',
          error: message,
        })
      }
      await sleep(150)
    }
    const identity=await verifyAttendanceDevice(zk)
    await commonImport.confirmAssignments(supabase,identity)
    for(const row of results.filter(r=>r.status==='sent')){
      if(!identity.users.some(u=>u.id===String(row.zkt_user_id) && u.name.toLowerCase()===row.name.toLowerCase())){
        row.status='error';row.error='Terminal identity readback did not match the employee';
        await updateEmployeeZktStatus(row.employee_id,{zkt_sync_status:'pending',zkt_sync_error:row.error})
      }
    }
  })

  for(const row of results.filter(r=>r.status==='sent')){
    await updateEmployeeZktStatus(row.employee_id,{zkt_sync_status:'verified_sdk',zkt_sync_error:null,zkt_synced_at:nowIso()})
  }

  const synced = results.filter((row) => row.status === 'sent').length
  const failed = results.filter((row) => row.status === 'error').length

  return {
    ok: failed === 0,
    message: failed === 0 ? 'Employees sent to PA ZKT by Linux bridge' : 'PA ZKT sync finished with errors',
    mode: 'node-zklib-linux',
    plant_location: PLANT_LOCATION,
    total: employees.length,
    sent: synced,
    synced,
    failed,
    results,
  }
}

async function runSyncOneEmployee(payload = {}) {
  const employee = await loadOneEmployeeForZkt(payload)
  const result = await runSyncEmployees({ employee_id: employee.id })

  return {
    ...result,
    message: 'Single employee sent to PA ZKT by Linux bridge',
    employee_id: employee.id,
    employee_number: employee.employee_number,
  }
}

async function runVerifyOneEmployee(payload = {}) {
  const employee = await loadOneEmployeeForZkt(payload)
  const result = await runVerifyEmployees({ employee_id: employee.id })
  const found = result.on_device > 0

  return {
    ...result,
    message: found ? 'Single employee verified on PA ZKT by Linux bridge' : 'Single employee was not found on PA ZKT',
    employee_id: employee.id,
    employee_number: employee.employee_number,
    found,
  }
}

async function runDeleteEmployeeFromZkt(payload = {}) {
  const employee = await loadOneEmployeeForZkt(payload)
  const zktPayload = buildEmployeeZktPayload(employee)
  const deletePayload = Buffer.alloc(2)
  deletePayload.writeUInt16LE(zktPayload.userId, 0)

  await withDisabledZkt(async (zk) => {
    await zk.executeCmd(COMMANDS.CMD_DELETE_USER, deletePayload)
  })

  await updateEmployeeZktStatus(employee.id, {
    zkt_sync_status: 'deleted_from_zkt_sdk',
    zkt_sync_error: null,
    zkt_synced_at: null,
  })

  return {
    ok: true,
    message: 'Employee delete command sent to PA ZKT by Linux bridge',
    mode: 'node-zklib-linux',
    plant_location: PLANT_LOCATION,
    employee_id: employee.id,
    employee_number: employee.employee_number,
    zkt_user_id: zktPayload.userId,
    name: zktPayload.name,
  }
}

async function upsertAttendanceBatch(rows) {
  const { error } = await supabase.from('zkt_attendance_logs').upsert(rows, {
    onConflict: 'employee_number,punch_time',
    ignoreDuplicates: true,
  })

  if (!error) return
  const statementTimeout = error.code === '57014' || /statement timeout/i.test(errorText(error))
  if (!statementTimeout || rows.length === 1) throw error

  // Each new punch invokes the existing work-log processor. A failed statement
  // rolls back its entire batch; retry smaller batches under the same unique key.
  const middle = Math.ceil(rows.length / 2)
  logStep(`Attendance statement timed out for ${rows.length} rows; retrying smaller batches`)
  await upsertAttendanceBatch(rows.slice(0, middle))
  await upsertAttendanceBatch(rows.slice(middle))
}

async function verifyAttendanceDevice(zk) {
  if (!VERIFIED_DEVICE_KEY && !VERIFIED_SERIAL_NUMBER) return null
  if (!VERIFIED_DEVICE_KEY || !VERIFIED_SERIAL_NUMBER) throw new Error('Incomplete ZKT device identity configuration')
  const response = await zk.executeCmd(COMMANDS.CMD_OPTIONS_RRQ, Buffer.from('~SerialNumber\0'))
  const match = Buffer.from(response).toString('ascii').match(/~SerialNumber=([^\x00\r\n]+)/)
  if (!match || match[1].trim() !== VERIFIED_SERIAL_NUMBER) throw new Error('ZKT physical serial number mismatch')
  const { data: device, error } = await supabase.from('zkt_identity_devices')
    .select('device_key,serial_number,plant_location,verified,inventory_verified')
    .eq('device_key', VERIFIED_DEVICE_KEY).single()
  if (error) throw error
  if (!device || !device.verified || !device.inventory_verified || device.serial_number !== VERIFIED_SERIAL_NUMBER || device.plant_location !== PLANT_LOCATION) {
    throw new Error('Configured ZKT device is not verified for this plant')
  }
  const users = normalizeZktUsers(await zk.getUsers()).map((user) => ({ id: deviceUserId(user), name: String(user.name || '').trim() }))
  return { deviceKey: device.device_key, serialNumber: device.serial_number, users }
}

function attendanceFingerprint(row) {
  return `${String(row.deviceUserId || row.userId || row.uid || row.userSn)}|${parseZktTime(row.recordTime || row.timestamp || row.attTime)}|${String(row.userSn ?? '')}`
}

async function assignVerifiedAttendance(logs, identity) {
  if (!identity) return { enabled: false, assigned: 0 }
  const { data: mappings, error } = await supabase.from('zkt_identifier_history')
    .select('id,device_key,terminal_user_id,employee_id,period_id,valid_from,valid_to')
    .eq('device_key', identity.deviceKey).eq('processing_verified', true)
  if (error) throw error
  let assigned = 0
  let checked = 0
  for (const mapping of mappings || []) {
    const candidates = logs.filter((row) => {
      const time = Date.parse(parseZktTime(row.recordTime || row.timestamp || row.attTime))
      return deviceUserId(row) === String(mapping.terminal_user_id) && Number.isFinite(time)
        && time >= Date.parse(mapping.valid_from) && (!mapping.valid_to || time < Date.parse(mapping.valid_to))
    })
    if (!candidates.length) continue
    const employeeResult = await supabase.from('employees')
      .select('id,employee_number,plant_location,active,zkt_user_id,zkt_name,first_name,last_name')
      .eq('id', mapping.employee_id).single()
    if (employeeResult.error) throw employeeResult.error
    const employee = employeeResult.data
    const periodResult = await supabase.from('employee_employment_periods')
      .select('id,employee_id,terminal_user_id,termination_date,legacy_inactive')
      .eq('id', mapping.period_id).single()
    if (periodResult.error) throw periodResult.error
    const period = periodResult.data
    if (!employee?.active || employee.plant_location !== PLANT_LOCATION || !period || period.employee_id !== employee.id
      || period.termination_date || period.legacy_inactive || String(period.terminal_user_id) !== String(mapping.terminal_user_id)
      || String(employeeZktUserId(employee)) !== String(mapping.terminal_user_id)) continue
    const currentUser = identity.users.find((user) => user.id === String(mapping.terminal_user_id))
    if (!currentUser || currentUser.name.toLowerCase() !== buildEmployeeZktPayload(employee).name.toLowerCase()) {
      throw new Error(`ZKT user ${mapping.terminal_user_id} does not match the mapped employee`)
    }
    const fingerprints = new Set(candidates.map(attendanceFingerprint))
    const times = [...new Set(candidates.map((row) => parseZktTime(row.recordTime || row.timestamp || row.attTime)))]
    for (let offset = 0; offset < times.length; offset += 100) {
      const eventsResult = await supabase.from('zkt_identity_events')
        .select('id,legacy_raw_id,terminal_user_id,event_at,raw')
        .eq('terminal_user_id', String(mapping.terminal_user_id)).in('event_at', times.slice(offset, offset + 100))
      if (eventsResult.error) throw eventsResult.error
      const events = (eventsResult.data || []).filter((event) => event.legacy_raw_id && event.raw?.plant_location === PLANT_LOCATION
        && event.raw?.source === 'hp-pen-linux-bridge' && event.raw?.ip === ZKT_IP && fingerprints.has(attendanceFingerprint(event.raw)))
      if (!events.length) continue
      checked += events.length
      const ownersResult = await supabase.from('zkt_event_ownership').select('event_id,employee_id,mapping_id').in('event_id', events.map((event) => event.id))
      if (ownersResult.error) throw ownersResult.error
      const owners = new Map((ownersResult.data || []).map((owner) => [owner.event_id, owner]))
      const pending = []
      for (const event of events) {
        const owner = owners.get(event.id)
        if (owner && (owner.employee_id !== mapping.employee_id || owner.mapping_id !== mapping.id)) {
          throw new Error(`Existing ZKT event ownership conflicts for event ${event.id}`)
        }
        if (!owner) pending.push({ event_id: event.id, employee_id: mapping.employee_id, mapping_id: mapping.id })
      }
      if (pending.length) {
        const saved = await supabase.from('zkt_event_ownership').upsert(pending, { onConflict: 'event_id', ignoreDuplicates: true })
        if (saved.error) throw saved.error
        assigned += pending.length
      }
    }
  }
  return { enabled: true, checked, assigned }
}

async function insertAttendanceLogs(logs, identity = null) {
  if (!logs.length) return { inserted: 0, skipped: 0 }

  const rows = logs.map((log) => {
    const employeeNumber = log.deviceUserId || log.userId || log.uid || log.userSn
    const punchTime = parseZktTime(log.recordTime || log.timestamp || log.attTime)
    return {
      employee_number: employeeNumber ? Number(employeeNumber) : null,
      punch_time: punchTime,
      raw: {
        ...safeJson(log),
        plant_location: PLANT_LOCATION,
        source: 'hp-pen-linux-bridge',
        ...(identity ? { device_key: identity.deviceKey, serial_number: identity.serialNumber } : {}),
      },
    }
  })

  const validRows = rows.filter((row) => row.employee_number !== null && row.punch_time !== null)
  if (!validRows.length) return { inserted: 0, skipped: rows.length }

  for (let offset = 0; offset < validRows.length; offset += 10) {
    await upsertAttendanceBatch(validRows.slice(offset, offset + 10))
  }
  return { inserted: validRows.length, skipped: rows.length - validRows.length }
}

async function runPullAttendance() {
  const { logs, identity } = await withZkt(async (zk) => ({
    identity: await verifyAttendanceDevice(zk),
    logs: normalizeZktLogs(await zk.getAttendances()),
  }))
  const saved=await commonImport.importAttendance(supabase,logs,identity,parseZktTime,deviceUserId)
  const identityResult=saved.identity
  const processed=saved.processed

  return {
    ok: true,
    message: 'Linux ZKT attendance pull finished',
    mode: 'node-zklib-linux',
    plant_location: PLANT_LOCATION,
    total: logs.length,
    inserted: saved.inserted,
    identity: identityResult,
    skipped: saved.skipped,
    processed,
  }
}

async function getPendingCommands() {
  const commands = []
  const pageSize = 10

  // Filter with the existing normalization rules. Page past foreign/malformed
  // payloads so they cannot hide PA work behind the first ten queue rows.
  for (let offset = 0; commands.length < 5; offset += pageSize) {
    const { data, error } = await supabase
      .from('zkt_bridge_commands')
      .select('*')
      .eq('status', PLANT_LOCATION === 'PA' ? 'pending_pa' : 'pending')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const rows = data || []
    commands.push(...rows.filter(isCommandForThisBridge))
    if (rows.length < pageSize) break
  }

  return commands.slice(0, 5)
}

async function markCommandRunning(commandId) {
  const { error } = await supabase
    .from('zkt_bridge_commands')
    .update({ status: 'running', picked_at: new Date().toISOString(), error: null })
    .eq('id', commandId)
  if (error) throw error
}

async function markCommandDone(commandId, result) {
  const { error } = await supabase
    .from('zkt_bridge_commands')
    .update({
      status: 'done',
      result: safeJson(result),
      error: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', commandId)
  if (error) throw error
}

async function markCommandError(commandId, err) {
  const message = errorText(err)
  const { error } = await supabase
    .from('zkt_bridge_commands')
    .update({
      status: 'error',
      error: message,
      result: { ok: false, error: message },
      finished_at: new Date().toISOString(),
    })
    .eq('id', commandId)
  if (error) throw error
}

async function executeCommand(command) {
  const payload = command.payload || {}

  if (command.command === 'test') return await runZktTest()
  if (command.command === 'pull_attendance') return await runPullAttendance()
  if (command.command === 'sync_employees') return await runSyncEmployees(payload)
  if (command.command === 'sync_one_employee') return await runSyncOneEmployee(payload)
  if (command.command === 'verify_employees') return await runVerifyEmployees(payload)
  if (command.command === 'verify_one_employee') return await runVerifyOneEmployee(payload)
  if (command.command === 'verify_selected_employee') return await runVerifyOneEmployee(payload)
  if (command.command === 'delete_employee_from_zkt') return await runDeleteEmployeeFromZkt(payload)

  throw new Error(`Unknown command: ${command.command}`)
}

async function processCommands(commission = false) {
  const commands = await getPendingCommands()
  let processed = 0

  for (const command of commands) {
    if (!commission && !isBridgeActive()) break

    logStep(`Processing ${command.command} ${command.id} plant=${commandPlantLocation(command)}`)
    try {
      await markCommandRunning(command.id)
      const result = await withTimeout(
        executeCommand(command),
        COMMAND_TIMEOUT_MS,
        `Command timeout: ${command.command}`,
        (err) => markCommandError(command.id, err)
      )
      await markCommandDone(command.id, result)
      logStep(`Done ${command.command}`)
    } catch (err) {
      logStep(`Error ${command.command}: ${errorText(err)}`)
      await markCommandError(command.id, err)
    }
    processed += 1
    await sleep(700)
  }
  return processed
}

let bridgeCyclePromise = null
let cycleRequested = false

async function processBridgeIfActive(reason) {
  if (!isBridgeActive()) {
    logStep(`Command wake ignored (${reason}): outside active window`)
    return
  }

  cycleRequested = true
  if (bridgeCyclePromise) {
    logStep(`Bridge wake coalesced (${reason}): worker is busy`)
    return await bridgeCyclePromise
  }

  logStep(`Bridge wake received: ${reason}`)
  bridgeCyclePromise = Promise.resolve().then(async () => {
    try {
      do {
        cycleRequested = false
        let processed
        do {
          if (!isBridgeActive()) break
          await runAutoPullIfDue()
          if (!isBridgeActive()) break
          processed = await processCommands()
        } while (processed > 0)
      } while (cycleRequested && isBridgeActive())
    } finally {
      bridgeCyclePromise = null
    }
  })

  return await bridgeCyclePromise
}

function requestBridgeCycle(reason) {
  void processBridgeIfActive(reason).catch((err) => {
    logStep(`Bridge cycle error (${reason}): ${errorText(err)}`)
  })
}

function startWakeSubscription() {
  const channel = supabase.channel('zkt-bridge-command-wake')

  channel
    .on('broadcast', { event: 'wake' }, ({ payload }) => {
      logStep(`Wake broadcast received: ${safeJson(payload)?.command || 'unknown command'}`)
      requestBridgeCycle('broadcast')
    })
    .subscribe((status) => {
      logStep(`Wake channel status: ${status}`)
      if (status === 'SUBSCRIBED') requestBridgeCycle('realtime subscribed')
    })

  return channel
}

const completedAutoPullSlots = new Set()

async function runAutoPullIfDue(now = new Date()) {
  if (!AUTO_PULL_HOURS.includes(now.getHours())) return

  const slotKey = autoPullSlotKey(now)
  if (completedAutoPullSlots.has(slotKey)) return

  completedAutoPullSlots.add(slotKey)
  logStep(`Auto pull attendance started for ${slotKey}`)

  try {
    const result = await withTimeout(
      runPullAttendance(),
      COMMAND_TIMEOUT_MS,
      'Auto pull timeout: pull_attendance'
    )
    logStep(`Auto pull attendance done: ${JSON.stringify(safeJson(result))}`)
  } catch (err) {
    logStep(`Auto pull attendance error: ${errorText(err)}`)
  }

  if (completedAutoPullSlots.size > AUTO_PULL_HOURS.length * 7) {
    const keep = new Set(Array.from(completedAutoPullSlots).slice(-AUTO_PULL_HOURS.length * 7))
    completedAutoPullSlots.clear()
    keep.forEach((slot) => completedAutoPullSlots.add(slot))
  }
}

async function main() {
  logStep('Farmplast Linux ZKT bridge started')
  logStep(`Plant location: ${PLANT_LOCATION}`)
  logStep(`ZKT device: ${ZKT_IP}:${ZKT_PORT}`)
  logStep(`Active window: ${ACTIVE_START_HOUR}:00-${ACTIVE_END_HOUR}:00`)
  logStep(`Auto pull hours: ${AUTO_PULL_HOURS.join(', ')}`)
  logStep(`Queue fallback and schedule tick every ${POLL_INTERVAL_MS}ms`)
  logStep(`Command timeout: ${COMMAND_TIMEOUT_MS}ms`)

  startWakeSubscription()
  requestBridgeCycle('startup')

  let lastActiveState = null

  while (true) {
    try {
      const now = new Date()
      const active = isBridgeActive(now)

      if (active !== lastActiveState) {
        logStep(active ? 'Bridge is active' : 'Bridge is sleeping outside active window')
        lastActiveState = active
      }

      if (active) {
        requestBridgeCycle('fallback poll')
      }
    } catch (err) {
      logStep(`Main loop error: ${errorText(err)}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

if(require.main===module)(async()=>{
  if(process.argv.includes('--probe-common'))return withZkt(async zk=>{const identity=await verifyAttendanceDevice(zk);console.log(JSON.stringify({ok:true,device_key:identity.deviceKey,serialNumber:identity.serialNumber,users:identity.users.length,readOnly:true}))})
  if(process.argv.includes('--pull-once')){console.log(JSON.stringify(await runPullAttendance()));return}
  if(process.argv.includes('--drain-once')){console.log(JSON.stringify({ok:true,processed:await processCommands(true)}));return}
  return main()
})().catch((err) => {
  logStep(`Fatal: ${errorText(err)}`)
  process.exit(1)
})
