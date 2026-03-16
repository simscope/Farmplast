import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

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
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('LOGIN CATCH ERROR:', err)
      setErrorText(err.message || 'Unexpected login error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(circle at top, rgba(20,184,166,0.20), transparent 28%), #020817',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(51, 65, 85, 0.8)',
          borderRadius: 24,
          padding: 28,
          boxShadow: '0 20px 60px rgba(2, 8, 23, 0.55)',
          color: '#e5eefb',
        }}
      >
        <div
          style={{
            marginBottom: 18,
            color: '#22d3ee',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Farmplast / SimScope
        </div>

        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 36,
            fontWeight: 800,
            color: '#f8fafc',
          }}
        >
          Sign in
        </h1>

        <p
          style={{
            margin: '0 0 22px',
            fontSize: 14,
            color: '#94a3b8',
            lineHeight: 1.5,
          }}
        >
          Enter your email and password
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label
              htmlFor="login-email"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 13,
                fontWeight: 700,
                color: '#cbd5e1',
              }}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                borderRadius: 14,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#f8fafc',
                padding: '14px 15px',
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 13,
                fontWeight: 700,
                color: '#cbd5e1',
              }}
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                borderRadius: 14,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#f8fafc',
                padding: '14px 15px',
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>

          {errorText ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(248, 113, 113, 0.10)',
                border: '1px solid rgba(248, 113, 113, 0.30)',
                color: '#fca5a5',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {errorText}
            </div>
          ) : null}

          {successText ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(34, 197, 94, 0.10)',
                border: '1px solid rgba(34, 197, 94, 0.30)',
                color: '#86efac',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {successText}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #2563eb, #14b8a6)',
              color: '#ffffff',
              padding: '14px 16px',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
