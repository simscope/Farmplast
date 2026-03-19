import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function buildFallbackProfile(authUser) {
  if (!authUser?.id) return null

  return {
    id: authUser.id,
    email: authUser.email || null,
    full_name: authUser.user_metadata?.full_name || '',
    role: authUser.user_metadata?.role || 'user',
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(authUser) {
    if (!authUser?.id) {
      setProfile(null)
      return null
    }

    const fallbackProfile = buildFallbackProfile(authUser)

    // Ставим профиль сразу, чтобы UI не ждал таблицу profiles
    setProfile(fallbackProfile)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading profile:', error)
        return fallbackProfile
      }

      if (data) {
        setProfile(data)
        return data
      }

      return fallbackProfile
    } catch (err) {
      console.error('loadProfile crash:', err)
      return fallbackProfile
    }
  }

  function applySession(nextSession) {
    const authUser = nextSession?.user || null

    setSession(nextSession || null)
    setUser(authUser)

    if (!authUser) {
      setProfile(null)
      return
    }

    // Важно: НЕ await
    // Профиль грузим в фоне, а auth не блокируем
    loadProfile(authUser)
  }

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        setLoading(true)

        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('getSession error:', error)
          setSession(null)
          setUser(null)
          setProfile(null)
          return
        }

        applySession(currentSession || null)
      } catch (err) {
        console.error('initAuth error:', err)

        if (mounted) {
          setSession(null)
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      try {
        applySession(nextSession || null)
      } catch (err) {
        console.error('onAuthStateChange error:', err)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setLoading(true)

    try {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (result.error) {
        return result
      }

      applySession(result.data?.session || null)

      return result
    } catch (err) {
      console.error('signIn crash:', err)
      return {
        data: null,
        error: err,
      }
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    setLoading(true)

    try {
      const result = await supabase.auth.signOut()
      setSession(null)
      setUser(null)
      setProfile(null)
      return result
    } catch (err) {
      console.error('signOut crash:', err)
      return { error: err }
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signOut,
      isAuthenticated: !!user,
      role: profile?.role || 'user',
    }),
    [session, user, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
