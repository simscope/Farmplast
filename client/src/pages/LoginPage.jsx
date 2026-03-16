//loginpage
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background:
    'radial-gradient(circle at top, rgba(20,184,166,0.20), transparent 28%), #020817',
  fontFamily: 'Arial, sans-serif',
}

const cardStyle = {
  width: '100%',
  maxWidth: '430px',
  background: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(51, 65, 85, 0.8)',
  borderRadius: '24px',
  padding: '28px',
  boxShadow: '0 20px 60px rgba(2, 8, 23, 0.55)',
  color: '#e5eefb',
}

const topLabelStyle = {
  margin: 0,
  color: '#22d3ee',
  fontSize: '13px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const titleStyle = {
  margin: '10px 0 8px',
  fontSize: '38px',
  fontWeight: 800,
  lineHeight: 1.1,
  color: '#f8fafc',
}

const subtitleStyle = {
  margin: 0,
  fontSize: '14px',
  color: '#94a3b8',
  lineHeight: 1.5,
}

const formStyle = {
  marginTop: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const labelStyle = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#cbd5e1',
  letterSpacing: '0.02em',
}

const inputStyle = {
  width: '100%',
  borderRadius: '14px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '14px 15px',
  fontSize: '15px',
  outline: 'none',
}

const buttonStyle = {
  border: 'none',
  borderRadius: '14px',
  background: 'linear-gradient(135deg, #2563eb, #14b8a6)',
  color: '#ffffff',
  padding: '14px 16px',
  fontWeight: 800,
  fontSize: '15px',
  cursor: 'pointer',
  marginTop: '4px',
}

const errorStyle = {
  marginTop: '2px',
  padding: '12px 14px',
  borderRadius: '12px',
  background: 'rgba(248, 113, 113, 0.10)',
  border: '1px solid rgba(248, 113, 113, 0.30)',
  color: '#fca5a5',
  fontSize: '14px',
  fontWeight: 700,
}

const hintStyle = {
  marginTop: '18px',
  fontSize: '12px',
  color: '#64748b',
  lineHeight: 1.5,
}

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!active) return

        if (session) {
          navigate('/dashboard', { replace: true })
          return
        }
      } catch (err) {
        console.error('Session check error:', err)
      } finally {
        if (active) {
          setCheckingSession(false)
        }
      }
    }

    checkSession()

    return () => {
      active = false
    }
  }, [navigate])

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')

      const cleanEmail = email.trim()

      if (!cleanEmail || !password) {
        throw new Error('Enter email and password')
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) throw error

      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={topLabelStyle}>Farmplast / SimScope</p>
          <h1 style={titleStyle}>Loading...</h1>
          <p style={subtitleStyle}>Checking active session.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <p style={topLabelStyle}>Farmplast / SimScope</p>
        <h1 style={titleStyle}>Sign in</h1>
        <p style={subtitleStyle}>
          Enter your work email and password to open dashboard, accounting, employees, and admin pages.
        </p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={fieldStyle}>
            <label htmlFor="login-email" style={labelStyle}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={hintStyle}>
          After login you will be redirected to <strong>/dashboard</strong>.
        </div>
      </div>
    </div>
  )
}
