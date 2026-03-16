import React from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  LogOut,
  Shield,
  User,
  Mail,
  LayoutDashboard,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { profile, signOut } = useAuth()

  async function handleLogout() {
    await signOut()
  }

  const displayName = profile?.full_name || 'No name'
  const displayEmail = profile?.email || 'No email'
  const displayRole = profile?.role || 'unknown'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-2xl">
          <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-400/20">
                <LayoutDashboard className="h-7 w-7 text-cyan-400" />
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Dashboard
                </h1>
                <p className="mt-2 text-sm text-slate-400 sm:text-base">
                  Welcome back,{' '}
                  <span className="font-medium text-slate-200">
                    {profile?.full_name || profile?.email || 'User'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  Administrative access panel for monitoring and system control
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 active:scale-[0.99]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-400/20">
                <User className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  User Profile
                </h2>
                <p className="text-sm text-slate-400">Current signed-in user</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Full name
                </div>
                <div className="text-sm font-medium text-slate-200">
                  {displayName}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </div>
                <div className="break-all text-sm font-medium text-slate-300">
                  {displayEmail}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-400/20">
                <Shield className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Access Role
                </h2>
                <p className="text-sm text-slate-400">
                  Permission level in the system
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                Role
              </div>
              <div className="text-lg font-semibold capitalize text-slate-200">
                {displayRole}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm leading-6 text-slate-300">
                This account can access protected admin pages and internal
                system functions.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/20">
                <Activity className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Monitoring
                </h2>
                <p className="text-sm text-slate-400">
                  Open live equipment monitoring
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 text-sm text-slate-300">
                View live system data, device states, alarms and temperatures.
              </div>

              <Link
                to="/monitoring"
                className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Open Monitoring
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white">Quick access</h3>
          <p className="mt-1 text-sm text-slate-400">
            Use the monitoring page for public equipment view. Admin area stays
            protected behind login.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/monitoring"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              <Activity className="h-4 w-4 text-cyan-400" />
              Monitoring
            </Link>

            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              <LayoutDashboard className="h-4 w-4 text-violet-400" />
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
