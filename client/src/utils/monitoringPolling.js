// One scheduler owns initial, timer, manual, and visibility refreshes.
export function startMonitoringPolling(load, intervalMs, document, timers = globalThis) {
  let stopped = false
  let inFlight = false
  let timer = null
  let initial = true
  const controller = new AbortController()
  async function refresh(silent = true) {
    if (stopped || inFlight || document.visibilityState !== 'visible') return
    inFlight = true
    try {
      await load(controller.signal, initial ? false : silent)
      initial = false
    } finally {
      inFlight = false
    }
  }
  function visibilityChanged() {
    if (timer !== null) timers.clearInterval(timer)
    timer = null
    if (!stopped && document.visibilityState === 'visible') {
      void refresh()
      timer = timers.setInterval(() => void refresh(), intervalMs)
    }
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  // The deferred start avoids duplicate requests during React StrictMode setup/cleanup.
  Promise.resolve().then(() => { if (!stopped) visibilityChanged() })
  return {
    refresh,
    stop() {
      stopped = true
      controller.abort()
      if (timer !== null) timers.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    },
  }
}
