import React, { createContext, useContext, useEffect, useState } from 'react'
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
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (error) {
      console.error('Error loading profile:', error)
      setProfile(null)
      return
    }

    setProfile(data || null)
  }

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      setLoading(true)

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        console.error('getSession error:', error)
      }

      setSession(session || null)
      setUser(session?.user || null)

      if (session?.user) {
        await loadProfile(session.user)
      } else {
        setProfile(null)
      }

      if (mounted) {
        setLoading(false)
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
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
    return await supabase.auth.signInWithPassword({
      email,
      password,
    })
  }

  async function signOut() {
    return await supabase.auth.signOut()
  }

  const value = {
    session,
    user,
    profile,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user,
    role: profile?.role || null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
