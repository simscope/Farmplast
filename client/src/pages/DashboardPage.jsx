import React from 'react'
import { Link } from 'react-router-dom'
import { Activity, LogOut, Shield, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { profile, signOut } = useAuth()

  async function handleLogout() {
    await signOut()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-slate-400">
              Welcome, {profile?.full_name || profile?.email || 'User'}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center gap-2 text-cyan-400">
              <User className="h-5 w-5" />
              <span className="font-medium">User</span>
            </div>
            <p className="text-sm text-slate-300">
              {profile?.full_name || 'No name'}
            </p>
            <p className="mt-1 text-sm text-slate-500">{profile?.email}</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center gap-2 text-emerald-400">
              <Shield className="h-5 w-5" />
              <span className="font-medium">Role</span>
            </div>
            <p className="text-sm capitalize text-slate-300">
              {profile?.role || 'unknown'}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center gap-2 text-amber-400">
              <Activity className="h-5 w-5" />
              <span className="font-medium">Access</span>
            </div>
            <Link
              to="/monitoring"
              className="text-sm text-cyan-400 hover:text-cyan-300"
            >
              Open Monitoring
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
