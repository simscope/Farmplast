export const hasActiveOtaJob = data => !!data?.jobs?.some(job => !['completed','failed'].includes(job.status))

// Independent from telemetry: one initial read, then timers only for active jobs.
export function startOtaStatusPolling(load, document, timers=globalThis) {
  let stopped=false, active=false, initial=true, timer=null, controller=null, pending=false
  function clear() {if(timer!==null) timers.clearTimeout(timer);timer=null}
  async function refresh(queued=false) {
    if(queued) active=true
    if(stopped || document.visibilityState!=='visible') return
    if(controller) {pending=true;return}
    clear()
    const request=new AbortController();controller=request
    try {
      const data=await load(request.signal)
      if(!request.signal.aborted) {active=hasActiveOtaJob(data);initial=false}
    } catch { /* Keep polling a known active job after transient status errors. */ }
    finally {
      if(controller===request) controller=null
      if(!stopped && document.visibilityState==='visible') {
        if(pending) {pending=false;void refresh()}
        else if(active) timer=timers.setTimeout(()=>void refresh(),5000)
      }
    }
  }
  function visibility() {
    clear()
    if(document.visibilityState!=='visible') {controller?.abort();return}
    if(initial || active) void refresh()
  }
  document.addEventListener('visibilitychange',visibility)
  Promise.resolve().then(()=>{if(!stopped) visibility()})
  return {refresh,stop() {stopped=true;clear();controller?.abort();document.removeEventListener('visibilitychange',visibility)}}
}
