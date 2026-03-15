import React, { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, isAuthenticated, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const redirectTo = location.state?.from?.pathname || '/dashboard'

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await signIn(email.trim(), password)

    if (error) {
      setError(error.message || 'Login failed')
      setSubmitting(false)
      return
    }

    navigate(redirectTo, { replace: true })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, #0a3158 0%, #04172d 45%, #02101f 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          color: '#67e8f9',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px',
        }}
      >
        ← Back
      </Link>

      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(5, 18, 36, 0.86)',
          border: '1px solid rgba(67, 110, 150, 0.30)',
          borderRadius: '24px',
          padding: '30px',
          boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            width: '62px',
            height: '62px',
            borderRadius: '18px',
            background: 'rgba(34, 211, 238, 0.12)',
            border: '1px solid rgba(34, 211, 238, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          <Lock size={28} color="#67e8f9" />
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: '48px',
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          Login
        </h1>

        <p
          style={{
            margin: '10px 0 24px 0',
            color: 'rgba(226, 232, 240, 0.82)',
            fontSize: '16px',
            lineHeight: 1.5,
          }}
        >
          Sign in to access internal sections of the system
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#dbeafe',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Email
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              borderRadius: '14px',
              padding: '0 14px',
              marginBottom: '18px',
              height: '52px',
            }}
          >
            <Mail size={18} color="#9fb3c8" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '16px',
              }}
            />
          </div>

          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#dbeafe',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Password
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              borderRadius: '14px',
              padding: '0 14px',
              marginBottom: '18px',
              height: '52px',
            }}
          >
            <Lock size={18} color="#9fb3c8" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '16px',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error ? (
            <div
              style={{
                marginBottom: '16px',
                borderRadius: '14px',
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.24)',
                color: '#fecaca',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              height: '52px',
              borderRadius: '14px',
              border: 'none',
              background: '#22d3ee',
              color: '#062238',
              fontWeight: 800,
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
