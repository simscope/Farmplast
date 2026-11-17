import { PostgrestClient } from '@supabase/postgrest-js'
import { supabase } from './supabase'

// All five NJ assets now use MSI RAM. Supabase remains the login/Payroll API.
export const monitoring = new PostgrestClient(new URL('/api/nj-telemetry', window.location.origin).href, {
  fetch: async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    const headers = new Headers(options.headers)
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
    return fetch(url, { ...options, headers, cache: 'no-store' })
  },
})
