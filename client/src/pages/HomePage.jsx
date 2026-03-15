import React from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Shield, Factory, Activity, ChevronRight } from 'lucide-react'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen w-full bg-[#07111f] text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* LEFT SIDE */}
        <div className="relative flex items-center justify-center overflow-hidden px-4 py-8 sm:px-6 md:px-10 lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,191,165,0.25),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(0,80,255,0.22),transparent_35%),linear-gradient(180deg,#07111f_0%,#030814_100%)]" />
          <div className="relative z-10 w-full max-w-3xl">
            <div className="mb-6 sm:mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">
                <Factory size={14} />
                Sim Scope / Farmplast
              </div>

              <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Choose production location
              </h1>

              <p className="mt-4 max-w-xl text-sm text-slate-300 sm:text-base">
                Open plant overview with live industrial telemetry, equipment status,
                barrel level and monitoring access.
              </p>

              <div className="mt-5">
                <button
                  onClick={() => navigate('/admin')}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/50 hover:bg-white/10"
                >
                  <Shield size={16} />
                  Admin Login
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => navigate('/monitoring/pa')}
                className="group relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-white/5 p-5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-slate-700/20 via-transparent to-cyan-500/10 opacity-80" />

                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                      <MapPin size={24} className="text-cyan-300" />
                    </div>

                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                      Available
                    </div>
                  </div>

                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                    PA
                  </div>

                  <h2 className="text-3xl font-extrabold leading-none sm:text-4xl">
                    Pennsylvania
                  </h2>

                  <p className="mt-4 text-sm text-slate-300">
                    Production monitoring
                  </p>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Open plant overview and equipment status.
                  </p>

                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">
                    Open monitoring
                    <ChevronRight
                      size={16}
                      className="transition group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/monitoring/nj')}
                className="group relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-white/5 p-5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-white/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/10 opacity-90" />

                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                      <MapPin size={24} className="text-emerald-300" />
                    </div>

                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                      Available
                    </div>
                  </div>

                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                    NJ
                  </div>

                  <h2 className="text-3xl font-extrabold leading-none sm:text-4xl">
                    New Jersey
                  </h2>

                  <p className="mt-4 text-sm text-slate-300">
                    Farmplast production
                  </p>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Chillers, barrel level and live telemetry.
                  </p>

                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                    Open monitoring
                    <ChevronRight
                      size={16}
                      className="transition group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - only desktop */}
        <div className="hidden lg:flex items-center justify-center border-l border-white/5 bg-[#111827] p-8">
          <div className="w-full max-w-2xl">
            <div className="rounded-[28px] border border-cyan-400/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                    Live overview
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    Production telemetry preview
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                  <Activity size={16} />
                  Online
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
                  <div className="text-sm text-slate-400">Chillers</div>
                  <div className="mt-2 text-3xl font-extrabold">3</div>
                  <div className="mt-2 text-xs text-emerald-300">
                    Connected assets
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
                  <div className="text-sm text-slate-400">Compressors</div>
                  <div className="mt-2 text-3xl font-extrabold">14</div>
                  <div className="mt-2 text-xs text-cyan-300">
                    Across all locations
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
                  <div className="text-sm text-slate-400">Barrel level</div>
                  <div className="mt-2 text-3xl font-extrabold">82%</div>
                  <div className="mt-2 text-xs text-amber-300">
                    Material available
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
                  <div className="text-sm text-slate-400">System state</div>
                  <div className="mt-2 text-3xl font-extrabold">Stable</div>
                  <div className="mt-2 text-xs text-emerald-300">
                    No active alerts
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/5 bg-slate-950/70 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-300">
                  Quick access
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    onClick={() => navigate('/monitoring/nj')}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
                  >
                    Open NJ
                  </button>

                  <button
                    onClick={() => navigate('/monitoring/pa')}
                    className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
                  >
                    Open PA
                  </button>

                  <button
                    onClick={() => navigate('/admin')}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Admin
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
