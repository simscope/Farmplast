import test from 'node:test'
import assert from 'node:assert/strict'
import { startMonitoringPolling } from '../src/utils/monitoringPolling.js'

function environment(state = 'visible') {
  const listeners = new Set(), intervals = new Map()
  let id = 0
  return {
    document: { visibilityState: state,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn) },
    timers: { setInterval: (fn, ms) => { intervals.set(++id, { fn, ms }); return id }, clearInterval: id => intervals.delete(id) },
    visibility(state) { this.document.visibilityState = state; for (const fn of listeners) fn() },
    tick() { for (const { fn } of intervals.values()) fn() },
    intervals, listeners,
  }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('initial + 15s polling; manual/visibility/timer share one in-flight guard', async () => {
  const env = environment(); let count = 0, finish, signal
  const session = startMonitoringPolling(s => { signal = s; count++; return new Promise(resolve => { finish = resolve }) }, 15000, env.document, env.timers)
  await flush()
  assert.equal(count, 1)
  assert.equal([...env.intervals.values()][0].ms, 15000)
  env.tick(); void session.refresh(); env.visibility('visible')
  assert.equal(count, 1)
  finish(); await flush(); env.tick()
  assert.equal(count, 2)
  session.stop(); assert.equal(signal.aborted, true)
  finish(); await flush()
  env.tick(); env.visibility('visible'); await session.refresh()
  assert.equal(count, 2)
  assert.equal(env.intervals.size, 0); assert.equal(env.listeners.size, 0)
})

test('hidden tabs pause; return to visible refreshes immediately and resumes once', async () => {
  const env = environment('hidden'); let count = 0
  const session = startMonitoringPolling(async () => { count++ }, 5000, env.document, env.timers)
  await flush(); assert.equal(count, 0); assert.equal(env.intervals.size, 0)
  env.visibility('visible'); await flush(); assert.equal(count, 1)
  env.visibility('hidden'); env.tick(); await session.refresh(); assert.equal(count, 1)
  env.visibility('visible'); await flush(); assert.equal(count, 2)
  assert.equal(env.intervals.size, 1)
  session.stop()
})

test('StrictMode setup/cleanup does not start an abandoned request', async () => {
  const env = environment(); let count = 0
  const load = async () => { count++ }
  const first = startMonitoringPolling(load, 5000, env.document, env.timers)
  first.stop()
  const second = startMonitoringPolling(load, 5000, env.document, env.timers)
  await flush(); assert.equal(count, 1); assert.equal(env.intervals.size, 1)
  second.stop()
})

test('a failed refresh releases the in-flight guard', async () => {
  const env = environment(); let count = 0
  const session = startMonitoringPolling(async () => { count++; if (count === 2) throw new Error('network') }, 5000, env.document, env.timers)
  await flush()
  await assert.rejects(session.refresh(), /network/)
  await session.refresh(); assert.equal(count, 3)
  session.stop()
})
