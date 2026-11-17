import { PostgrestClient } from '@supabase/postgrest-js'
import { supabase } from './supabase'

// Keep production on its working feed until all five MSI inputs are verified.
// This switch affects telemetry reads only; HR, login and commands keep their API.
export const monitoring = import.meta.env.VITE_NJ_TELEMETRY_SOURCE === 'msi'
  ? new PostgrestClient(new URL('/api/nj-telemetry', window.location.origin).href, {
    fetch: async (url, options = {}) => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = new Headers(options.headers)
      if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
      return fetch(url, { ...options, headers, cache: 'no-store' })
    },
  })
  : supabase
