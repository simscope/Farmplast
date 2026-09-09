import { useCallback, useEffect, useRef } from 'react'
import { startMonitoringPolling } from '../utils/monitoringPolling'

export default function useMonitoringPolling(load, intervalMs) {
  const polling = useRef(null)
  useEffect(() => {
    const session = startMonitoringPolling(load, intervalMs, document)
    polling.current = session
    return () => {
      session.stop()
      polling.current = null
    }
  }, [load, intervalMs])
  return useCallback((silent = true) => polling.current?.refresh(silent), [])
}
