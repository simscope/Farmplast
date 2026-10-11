import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/useAuth'

const off = { former_employees_archive_readonly: false, employee_terminate: false, employee_rehire: false, employee_number_reuse: false }
export default function useEmployeeFeatureFlags() {
  const { user, profile } = useAuth()
  const identity = `${user?.id || ''}:${profile?.role || ''}`
  const [state, setState] = useState({ flags: off, loading: true, identity: null })
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (profile?.role !== 'admin') return
      try {
        const result = await supabase.rpc('employee_feature_flags_status')
        if (!cancelled) setState({ flags: result.error ? off : Object.fromEntries(Object.keys(off).map(key => [key, result.data?.[key] === true])), loading: false, identity })
      } catch { if (!cancelled) setState({ flags: off, loading: false, identity }) }
    }
    load()
    const timer = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', load) }
  }, [identity, profile?.role])
  if (profile?.role !== 'admin') return { flags: off, loading: false }
  return state.identity === identity ? state : { flags: off, loading: true }
}
