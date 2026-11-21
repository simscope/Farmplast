'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  transitions, transitionDue, wallParts, encodeZktTime, cleanSerial, scheduleTest,
} = require('../dst-clock.cjs');

test('US Eastern DST calendar is UTC-accurate for 2026 and 2027', () => {
  assert.doesNotThrow(scheduleTest);
  assert.deepEqual(transitions(2026).map(x => new Date(x.at).toISOString()), [
    '2026-03-08T07:00:00.000Z', '2026-11-01T06:00:00.000Z',
  ]);
  assert.deepEqual(transitions(2027).map(x => new Date(x.at).toISOString()), [
    '2027-03-14T07:00:00.000Z', '2027-11-07T06:00:00.000Z',
  ]);
});

test('never eligible before transition or after overnight window', () => {
  for (const t of transitions(2027)) {
    assert.equal(transitionDue(t.at - 1), null);
    assert.equal(transitionDue(t.at).id, t.id);
    assert.equal(transitionDue(t.at + 59 * 60000).id, t.id);
    assert.equal(transitionDue(t.at + 3600001), null);
  }
});

test('wall clock jumps forward and back at exact transition', () => {
  const [spring, autumn] = transitions(2027);
  assert.equal(wallParts(new Date(spring.at - 1000)).hour, 1);
  assert.equal(wallParts(new Date(spring.at)).hour, 3);
  assert.equal(wallParts(new Date(autumn.at - 1000)).hour, 1);
  assert.equal(wallParts(new Date(autumn.at)).hour, 1);
});

test('ZK protocol 32-bit little-endian time payloads match reference formula', () => {
  assert.equal(encodeZktTime({ year: 2027, month: 3, day: 14, hour: 3, minute: 0, second: 0 }).toString('hex'), 'b0a41c34');
  assert.equal(encodeZktTime({ year: 2027, month: 11, day: 7, hour: 1, minute: 0, second: 0 }).toString('hex'), '10425a35');
  assert.throws(() => encodeZktTime({ year: 2227, month: 11, day: 7, hour: 1, minute: 0, second: 0 }), /Invalid/);
});

test('serial validation reads only the exactly matching protocol response', () => {
  assert.equal(cleanSerial(Buffer.from('\0~SerialNumber=ABCD123456\0', 'latin1')), 'ABCD123456');
  assert.throws(() => cleanSerial(Buffer.from('~DeviceName=M300Plus\0')), /verify/);
  assert.throws(() => cleanSerial(Buffer.from('~SerialNumber=AAAA\0~SerialNumber=BBBB\0')), /unique/);
});
