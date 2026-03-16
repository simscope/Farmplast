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

    setProfile(data || null)
    return data || null
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
        }

        setSession(currentSession || null)
        setUser(currentSession?.user || null)

        if (currentSession?.user) {
          await loadProfile(currentSession.user)
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
      setLoading(true)

      setSession(nextSession || null)
      setUser(nextSession?.user || null)

      if (nextSession?.user) {
        await loadProfile(nextSession.user)
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
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (result.error) {
      return result
    }

    const {
      data: { session: freshSession },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('getSession after signIn error:', sessionError)
    }

    setSession(freshSession || null)
    setUser(freshSession?.user || null)

    if (freshSession?.user) {
      await loadProfile(freshSession.user)
    }

    return result
  }

  async function signOut() {
    const result = await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    return result
  }

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signOut,
      isAuthenticated: !!session,
      role: profile?.role || null,
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
