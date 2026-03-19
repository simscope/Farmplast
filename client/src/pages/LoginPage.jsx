import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      try {
        setCheckingSession(true)

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('GET SESSION ERROR:', error)
          setErrorText('')
          return
        }

        if (session) {
          navigate('/dashboard', { replace: true })
        }
      } catch (err) {
        console.error('CHECK SESSION EXCEPTION:', err)
      } finally {
        if (mounted) {
          setCheckingSession(false)
        }
      }
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      setLoading(true)
      setErrorText('')
      setSuccessText('')

      const cleanEmail = email.trim()

      if (!cleanEmail || !password) {
        setErrorText('Enter email and password')
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      console.log('LOGIN RESULT:', { data, error })

      if (error) {
        setErrorText(error.message || 'Login failed')
        return
      }

      setSuccessText('Login successful')

      // Небольшая пауза, чтобы Supabase успел записать session
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 150)
    } catch (err) {
      console.error('LOGIN EXCEPTION:', err)
      setErrorText(err.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#06152b',
          color: '#fff',
          fontSize: '18px',
        }}
      >
        Checking session...
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #06152b 0%, #0b1f3a 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(10, 20, 40, 0.95)',
          border: '1px solid rgba(120, 170, 255, 0.18)',
          borderRadius: '18px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          color: '#fff',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: '28px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          Farmplast
        </h1>

        <p
          style={{
            margin: '0 0 24px',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
          }}
        >
          Sign in to dashboard
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="Enter your email"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                outline: 'none',
                fontSize: '15px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                outline: 'none',
                fontSize: '15px',
              }}
            />
          </div>

          {errorText ? (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(255, 80, 80, 0.12)',
                border: '1px solid rgba(255, 80, 80, 0.28)',
                color: '#ff9b9b',
                fontSize: '14px',
              }}
            >
              {errorText}
            </div>
          ) : null}

          {successText ? (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(70, 200, 120, 0.12)',
                border: '1px solid rgba(70, 200, 120, 0.28)',
                color: '#91f0b0',
                fontSize: '14px',
              }}
            >
              {successText}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '12px',
              border: 'none',
              background: loading
                ? 'rgba(90, 130, 190, 0.7)'
                : 'linear-gradient(135deg, #2e7cf6 0%, #39a0ff 100%)',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: '0.2s ease',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
