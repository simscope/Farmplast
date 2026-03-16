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
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">

        {/* HEADER */}
        <div className="mb-10 flex items-center justify-between rounded-2xl bg-[#0f172a] p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <LayoutDashboard size={34} className="text-cyan-400" />
            <div>
              <h1 className="text-3xl font-bold text-white">
                Dashboard
              </h1>
              <p className="text-slate-300">
                Administrative control panel
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>

        {/* CARDS */}
        <div className="grid gap-6 md:grid-cols-3">

          {/* USER */}
          <div className="rounded-xl bg-[#0f172a] p-6 shadow-md">
            <div className="mb-4 flex items-center gap-3 text-cyan-400">
              <User />
              <span className="text-lg font-semibold text-white">
                User Profile
              </span>
            </div>

            <div className="space-y-2 text-slate-200">
              <p>
                <span className="text-slate-400">Name:</span> {displayName}
              </p>

              <p className="flex items-center gap-2">
                <Mail size={16} />
                {displayEmail}
              </p>
            </div>
          </div>

          {/* ROLE */}
          <div className="rounded-xl bg-[#0f172a] p-6 shadow-md">
            <div className="mb-4 flex items-center gap-3 text-emerald-400">
              <Shield />
              <span className="text-lg font-semibold text-white">
                Access Role
              </span>
            </div>

            <p className="text-xl font-bold capitalize text-white">
              {displayRole}
            </p>

            <p className="mt-3 text-sm text-slate-400">
              This account has administrative permissions.
            </p>
          </div>

          {/* MONITORING */}
          <div className="rounded-xl bg-[#0f172a] p-6 shadow-md">
            <div className="mb-4 flex items-center gap-3 text-amber-400">
              <Activity />
              <span className="text-lg font-semibold text-white">
                Monitoring
              </span>
            </div>

            <p className="mb-4 text-slate-300">
              Open real-time equipment monitoring.
            </p>

            <Link
              to="/monitoring"
              className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
            >
              Open Monitoring
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* QUICK LINKS */}
        <div className="mt-10 rounded-xl bg-[#0f172a] p-6 shadow-md">
          <h3 className="mb-3 text-xl font-semibold text-white">
            Quick access
          </h3>

          <div className="flex gap-4">

            <Link
              to="/monitoring"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-500"
            >
              Monitoring
            </Link>

            <Link
              to="/"
              className="rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
            >
              Home
            </Link>

          </div>
        </div>

      </div>
    </div>
  )
}
