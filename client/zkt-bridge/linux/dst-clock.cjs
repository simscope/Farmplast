'use strict';

// Farmplast PA ZKTeco automatic US Eastern DST adjustment.
// Standalone systemd service invoked by a minute timer; does not modify the bridge,
// attendance, or payroll. Fails closed unless an actual DST transition occurred.
const fs = require('node:fs');
const path = require('node:path');

const ZONE = 'America/New_York';
const STATE_DIR = process.env.FARMPLAST_ZKT_DST_STATE_DIR || '/var/lib/farmplast-zkt-dst';
const STATE_FILE = path.join(STATE_DIR, 'pa-state.json');
const MAX_TRANSITION_AGE_MS = 60 * 60 * 1000; // no same-day/mid-shift catch-up
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const APPROVED_DRIFT_MS = 90 * 1000;

function sunday(year, month, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + 7 * (nth - 1);
}

function transitions(year) {
  return [
    { id: 'spring-' + year, kind: 'spring', at: Date.UTC(year, 2, sunday(year, 3, 2), 7), staleOffsetMs: -3600000 },
    { id: 'autumn-' + year, kind: 'autumn', at: Date.UTC(year, 10, sunday(year, 11, 1), 6), staleOffsetMs: 3600000 },
  ];
}

function transitionDue(utcMs) {
  const year = new Date(utcMs).getUTCFullYear();
  return [...transitions(year - 1), ...transitions(year)].find(
    (item) => utcMs >= item.at && utcMs - item.at <= MAX_TRANSITION_AGE_MS
  ) || null;
}

function wallParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: +values.year, month: +values.month, day: +values.day,
    hour: +values.hour, minute: +values.minute, second: +values.second,
  };
}

function fromDeviceDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Invalid getTime() result from ZKT device');
  }
  // node-zklib Date is a local wall-clock Date. Unit must run with TZ=America/New_York.
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
}

function wallMilliseconds(wall) {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

function encodeZktTime(wall) {
  if (!Number.isInteger(wall.year) || wall.year < 2000 || wall.year > 2099 ||
      !Number.isInteger(wall.month) || wall.month < 1 || wall.month > 12 ||
      !Number.isInteger(wall.day) || wall.day < 1 || wall.day > 31 ||
      !Number.isInteger(wall.hour) || wall.hour < 0 || wall.hour > 23 ||
      !Number.isInteger(wall.minute) || wall.minute < 0 || wall.minute > 59 ||
      !Number.isInteger(wall.second) || wall.second < 0 || wall.second > 59 ||
      new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDate() !== wall.day) {
    throw new Error('Invalid ZKT encoded clock value');
  }
  // Official ZK standalone protocol: CMD_SET_TIME, 4-byte little-endian encoded wall time.
  const year = wall.year % 100;
  const encoded = ((year * 12 * 31 + (wall.month - 1) * 31 + wall.day - 1) * 24 * 60 * 60) +
    (wall.hour * 60 + wall.minute) * 60 + wall.second;
  if (!Number.isSafeInteger(encoded) || encoded < 0 || encoded > 0xffffffff) {
    throw new Error('Invalid ZKT encoded clock value');
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(encoded, 0);
  return bytes;
}

function cleanSerial(response) {
  // Old node-zklib executeCmd() may return a complete reply with its binary header.
  // Search the payload for the exact parameter marker and reject ambiguous responses.
  if (!Buffer.isBuffer(response)) throw new Error('ZKT serial reply is not a Buffer');
  const text = response.toString('latin1');
  const matches = [...text.matchAll(/~SerialNumber=([A-Za-z0-9._-]{4,70})/g)];
  if (matches.length !== 1) throw new Error('Cannot verify unique ZKT serial response');
  return matches[0][1];
}

function logEvent(event, detail = {}) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const row = { at: new Date().toISOString(), plant: 'PA', event, ...detail };
  const text = JSON.stringify(row);
  fs.appendFileSync(path.join(STATE_DIR, 'pa-events.jsonl'), text + '\n', { mode: 0o600 });
  console.log(text);
}

function completedEvent() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).event; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function markCompleted(event) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const temporary = STATE_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ event, verifiedUtc: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, STATE_FILE);
}

function scheduleTest() {
  const y2026 = transitions(2026), y2027 = transitions(2027);
  const cases = [
    [y2026[0].at, '2026-03-08T07:00:00.000Z'],
    [y2026[1].at, '2026-11-01T06:00:00.000Z'],
    [y2027[0].at, '2027-03-14T07:00:00.000Z'],
    [y2027[1].at, '2027-11-07T06:00:00.000Z'],
  ];
  for (const [ms, iso] of cases) {
    if (new Date(ms).toISOString() !== iso) throw new Error('DST UTC calendar test failed');
  }
  if (transitionDue(y2027[0].at - 1000) !== null ||
    transitionDue(y2027[0].at + MAX_TRANSITION_AGE_MS + 1000) !== null ||
    transitionDue(y2027[0].at)?.kind !== 'spring') throw new Error('DST guard window test failed');
  const spring = wallParts(new Date(y2027[0].at));
  const autumn = wallParts(new Date(y2027[1].at));
  if (spring.hour !== 3 || autumn.hour !== 1) throw new Error('Eastern wall clock test failed');
  const value = encodeZktTime({ year: 2027, month: 3, day: 14, hour: 3, minute: 0, second: 0 });
  if (value.length !== 4) throw new Error('Invalid protocol payload');
  console.log(JSON.stringify({ ok: true, plant: 'PA', spring: y2027[0], autumn: y2027[1], protocolPayloadHex: value.toString('hex') }));
}

async function main() {
  const mode = process.argv[2] || '--status';
  if (mode === '--test-schedule') { scheduleTest(); return; }
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  if (!['--run', '--status'].includes(mode)) throw new Error('Expected --run / --status / --test-schedule');
  if (process.env.TZ !== ZONE) throw new Error('TZ must explicitly be America/New_York');
  const due = transitionDue(Date.now());
  if (mode === '--run' && (!due || completedEvent() === due.id)) return; // no device contact outside transition
  if (process.env.ZKT_PLANT_LOCATION !== 'PA') throw new Error('PA guard rejects non-PA bridge configuration');
  const expectedSerial = String(process.env.ZKT_SERIAL_NUMBER || '').trim();
  const ip = String(process.env.ZKT_IP || '').trim();
  if (!expectedSerial || !ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    throw new Error('PA verified serial and IPv4 are required in the existing private bridge .env');
  }

  const ZKLib = require('node-zklib');
  const { COMMANDS } = require('node-zklib/constants');
  if (COMMANDS.CMD_SET_TIME !== 202 || COMMANDS.CMD_OPTIONS_RRQ !== 11 || COMMANDS.CMD_REFRESHDATA !== 1013) {
    throw new Error('Unsupported node-zklib protocol version');
  }
  const zk = new ZKLib(ip, Number(process.env.ZKT_PORT || 4370), 10000, 4000);
  let connected = false;
  try {
    await zk.createSocket();
    connected = true;
    const rawSerial = await zk.executeCmd(COMMANDS.CMD_OPTIONS_RRQ, Buffer.from('~SerialNumber\0', 'ascii'));
    const serial = cleanSerial(rawSerial);
    if (serial !== expectedSerial) throw new Error('PA ZKT serial mismatch; no change permitted');
    const before = fromDeviceDate(await zk.getTime());
    const expected = wallParts(new Date());
    const skew = wallMilliseconds(before) - wallMilliseconds(expected);
    if (mode === '--status') {
      console.log(JSON.stringify({ ok: true, plant: 'PA', serialVerified: true, terminalClock: before, easternClock: expected, skewSeconds: skew / 1000, due: due?.id || null }));
      return;
    }
    if (Math.abs(skew) <= APPROVED_DRIFT_MS) {
      markCompleted(due.id);
      logEvent('already_correct', { transition: due.id, skewSeconds: Math.round(skew / 1000) });
      return;
    }
    if (Math.abs(skew - due.staleOffsetMs) > MAX_CLOCK_SKEW_MS) {
      throw new Error('Unexpected PA terminal drift (' + Math.round(skew / 1000) + 's); refusing DST write');
    }
    const target = wallParts(new Date());
    await zk.executeCmd(COMMANDS.CMD_SET_TIME, encodeZktTime(target));
    await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, Buffer.alloc(0));
    const after = fromDeviceDate(await zk.getTime());
    const finalSkew = wallMilliseconds(after) - wallMilliseconds(wallParts(new Date()));
    if (Math.abs(finalSkew) > 15000) throw new Error('PA ZKT clock post-write verification failed');
    markCompleted(due.id);
    logEvent('corrected_verified', { transition: due.id, oldClock: before, newClock: after,
      skewBeforeSeconds: Math.round(skew / 1000), skewAfterSeconds: Math.round(finalSkew / 1000) });
  } catch (err) {
    logEvent('error', { transition: due?.id || null, message: err.message });
    process.exitCode = 1;
  } finally {
    if (connected) await zk.disconnect().catch(() => {});
  }
}
if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { transitions, transitionDue, wallParts, encodeZktTime, cleanSerial, scheduleTest, fromDeviceDate };
