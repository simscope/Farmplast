import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

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

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading profile:', error)
        setProfile(null)
        return null
      }

      const safeProfile =
        data || {
          id: authUser.id,
          email: authUser.email || null,
          full_name: authUser.user_metadata?.full_name || '',
          role: authUser.user_metadata?.role || 'user',
        }

      setProfile(safeProfile)
      return safeProfile
    } catch (err) {
      console.error('loadProfile crash:', err)

      const fallbackProfile = {
        id: authUser.id,
        email: authUser.email || null,
        full_name: authUser.user_metadata?.full_name || '',
        role: authUser.user_metadata?.role || 'user',
      }

      setProfile(fallbackProfile)
      return fallbackProfile
    }
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

        const authUser = currentSession?.user || null

        setSession(currentSession || null)
        setUser(authUser)

        if (authUser) {
          await loadProfile(authUser)
        } else {
          setProfile(null)
        }
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
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const authUser = nextSession?.user || null

      setSession(nextSession || null)
      setUser(authUser)

      if (authUser) {
        await loadProfile(authUser)
      } else {
        setProfile(null)
      }

      setLoading(false)
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

      const freshSession = result.data?.session || null
      const authUser = freshSession?.user || null

      setSession(freshSession)
      setUser(authUser)

      if (authUser) {
        await loadProfile(authUser)
      } else {
        setProfile(null)
      }

      return result
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
