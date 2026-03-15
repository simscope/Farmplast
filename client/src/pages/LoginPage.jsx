import React, { useState } from 'react'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-cyan-900/40 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
            <Lock className="h-8 w-8 text-cyan-400" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access the monitoring system
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Email
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 px-4">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                required
                className="w-full bg-transparent py-3.5 text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Password
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 px-4">
              <Lock className="h-4 w-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="w-full bg-transparent py-3.5 text-white outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-slate-400 transition hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
