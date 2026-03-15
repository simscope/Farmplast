import React from 'react'
import { Link } from 'react-router-dom'
import { Activity, Building2, Lock } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-4xl rounded-3xl border border-cyan-900/30 bg-slate-900/70 p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-500/20 bg-cyan-500/10">
              <Building2 className="h-10 w-10 text-cyan-400" />
            </div>

            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Farmplast Monitoring System
            </h1>

            <p className="mt-4 text-sm text-slate-400 md:text-base">
              Public monitoring access for chillers and internal login for accounting and administration
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              to="/monitoring/nj"
              className="group rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-6 transition hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-cyan-500/15"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15">
                <Activity className="h-7 w-7 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold">Monitoring NJ</h2>
              <p className="mt-2 text-sm text-slate-400">
                Open New Jersey chiller monitoring page
              </p>
            </Link>

            <Link
              to="/monitoring/pa"
              className="group rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-6 transition hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-cyan-500/15"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15">
                <Activity className="h-7 w-7 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold">Monitoring PA</h2>
              <p className="mt-2 text-sm text-slate-400">
                Open Pennsylvania chiller monitoring page
              </p>
            </Link>

            <Link
              to="/login"
              className="group rounded-3xl border border-slate-700 bg-slate-800/80 p-6 transition hover:-translate-y-1 hover:border-slate-500 hover:bg-slate-800"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-700/70">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-semibold">Login</h2>
              <p className="mt-2 text-sm text-slate-400">
                Access accounting and internal admin pages
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
