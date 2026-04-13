import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Thermometer,
  Gauge,
  Activity,
  AlertTriangle,
  Cpu,
  Clock3,
  Wifi,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const POLL_MS = 3000

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function StatCard({ title, value, unit = '', icon: Icon, accent = 'blue' }) {
  const accentMap = {
    blue: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    purple: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-white/70">{title}</div>
        {Icon ? (
          <div className={`rounded-xl border px-2 py-2 ${accentMap[accent] || accentMap.blue}`}>
            <Icon size={16} />
          </div>
        ) : null}
      </div>

      <div className="flex items-end gap-2">
        <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
        {unit ? <div className="pb-1 text-sm text-white/50">{unit}</div> : null}
      </div>
    </div>
  )
}

function ValueRow({ label, value, unit = '' }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-b-0">
      <div className="text-sm text-white/65">{label}</div>
      <div className="text-sm font-medium text-white">
        {value}
        {unit ? <span className="ml-1 text-white/45">{unit}</span> : null}
      </div>
    </div>
  )
}

function SectionCard({ title, children, right }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-4 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-semibold text-white">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

function BitBadge({ label, active }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs font-medium ${
        active
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-white/10 bg-white/5 text-white/45'
      }`}
    >
      {label}: {active ? 'ON' : 'OFF'}
    </div>
  )
}

export default function Chiller2HMIPage() {
  const navigate = useNavigate()

  const [dashboard, setDashboard] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastError, setLastError] = useState('')

  async function loadData(silent = false) {
    try {
      if (!silent) setLoading(true)
      setLastError('')

      const [{ data: dashboardData, error: dashboardError }, { data: rawData, error: rawError }] =
        await Promise.all([
          supabase.from('v_ch2_dashboard').select('*').single(),
          supabase
            .from('ch2_latest')
            .select('point_code, point_name, value_number, value_boolean, raw_register, raw_value, updated_at')
            .like('point_code', 'CH2_R%')
            .order('raw_register', { ascending: true }),
        ])

      if (dashboardError) throw dashboardError
      if (rawError) throw rawError

      setDashboard(dashboardData || null)
      setRawRows(rawData || [])
    } catch (err) {
      setLastError(err?.message || 'Failed to load chiller data')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const timer = setInterval(() => {
      loadData(true)
    }, POLL_MS)

    const latestChannel = supabase
      .channel('ch2-hmi-latest')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ch2_latest' },
        () => {
          loadData(true)
        }
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(latestChannel)
    }
  }, [])

  const summary = useMemo(() => {
    return {
      assetCode: dashboard?.asset_code || 'CH-NJ-02',
      deviceCode: dashboard?.device_code || 'ESP32-CH2-PLC',

      online: !!dashboard?.is_online,
      heartbeat: !!dashboard?.heartbeat,
      systemRunning: !!dashboard?.system_running,

      comp1A: !!dashboard?.comp_1a_enabled,
      comp1B: !!dashboard?.comp_1b_enabled,
      comp1C: !!dashboard?.comp_1c_enabled,

      comp2A: !!dashboard?.comp_2a_enabled,
      comp2B: !!dashboard?.comp_2b_enabled,
      comp2C: !!dashboard?.comp_2c_enabled,

      enteringFluidF: dashboard?.chiller_entering_f,
      leavingFluidF: dashboard?.chiller_leaving_f,

      flowC1: dashboard?.flow_c1_gpm,
      flowC2: dashboard?.flow_c2_gpm,

      capacityC1: dashboard?.capacity_c1_tons,

      evapOutC1: dashboard?.evap_out_c1_f,
      evapOutC2: dashboard?.evap_out_c2_f,

      deltaT: dashboard?.process_delta_t_f,

      heartbeatUpdatedAt: dashboard?.heartbeat_updated_at,
      latestUpdatedAt: dashboard?.latest_updated_at,
    }
  }, [dashboard])

  const importantBits = [
    { label: 'Online', active: summary.online },
    { label: 'Heartbeat', active: summary.heartbeat },
    { label: 'System Running', active: summary.systemRunning },

    { label: 'C1 Comp A', active: summary.comp1A },
    { label: 'C1 Comp B', active: summary.comp1B },
    { label: 'C1 Comp C', active: summary.comp1C },

    { label: 'C2 Comp A', active: summary.comp2A },
    { label: 'C2 Comp B', active: summary.comp2B },
    { label: 'C2 Comp C', active: summary.comp2C },
  ]

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/monitoring/nj')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <div>
              <div className="text-2xl font-semibold tracking-tight">Chiller 2 HMI</div>
              <div className="mt-1 text-sm text-white/50">
                Asset: {summary.assetCode} • Device: {summary.deviceCode}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                summary.online
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-red-500/40 bg-red-500/15 text-red-300'
              }`}
            >
              Online: {summary.online ? 'YES' : 'NO'}
            </div>

            <div
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                summary.systemRunning
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-white/60'
              }`}
            >
              Running: {summary.systemRunning ? 'ON' : 'OFF'}
            </div>

            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {lastError ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {lastError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-8 text-center text-white/60">
            Loading chiller data...
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <StatCard
                title="Entering Fluid"
                value={formatNumber(summary.enteringFluidF, 1)}
                unit="°F"
                icon={Thermometer}
                accent="green"
              />
              <StatCard
                title="Leaving Fluid"
                value={formatNumber(summary.leavingFluidF, 1)}
                unit="°F"
                icon={Thermometer}
                accent="green"
              />
              <StatCard
                title="Delta T"
                value={formatNumber(summary.deltaT, 1)}
                unit="°F"
                icon={Activity}
                accent="yellow"
              />
              <StatCard
                title="Flow C1"
                value={formatNumber(summary.flowC1, 0)}
                unit="GPM"
                icon={Gauge}
                accent="blue"
              />
              <StatCard
                title="Flow C2"
                value={formatNumber(summary.flowC2, 0)}
                unit="GPM"
                icon={Gauge}
                accent="blue"
              />
              <StatCard
                title="Capacity C1"
                value={formatNumber(summary.capacityC1, 0)}
                unit="TONS"
                icon={Cpu}
                accent="purple"
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
              <SectionCard
                title="General"
                right={
                  <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    <Wifi size={14} />
                    CH2
                  </div>
                }
              >
                <ValueRow label="Asset Code" value={summary.assetCode} />
                <ValueRow label="Device Code" value={summary.deviceCode} />
                <ValueRow label="Heartbeat" value={summary.heartbeat ? 'ON' : 'OFF'} />
                <ValueRow label="System Running" value={summary.systemRunning ? 'ON' : 'OFF'} />
                <ValueRow label="Heartbeat Updated" value={formatDateTime(summary.heartbeatUpdatedAt)} />
                <ValueRow label="Latest Updated" value={formatDateTime(summary.latestUpdatedAt)} />
              </SectionCard>

              <SectionCard
                title="Circuit 1"
                right={
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    C1
                  </div>
                }
              >
                <ValueRow label="Comp 1A Enabled" value={summary.comp1A ? 'ON' : 'OFF'} />
                <ValueRow label="Comp 1B Enabled" value={summary.comp1B ? 'ON' : 'OFF'} />
                <ValueRow label="Comp 1C Enabled" value={summary.comp1C ? 'ON' : 'OFF'} />
                <ValueRow label="Flow C1" value={formatNumber(summary.flowC1, 0)} unit="GPM" />
                <ValueRow label="Capacity C1" value={formatNumber(summary.capacityC1, 0)} unit="TONS" />
                <ValueRow label="Evap Out C1" value={formatNumber(summary.evapOutC1, 1)} unit="°F" />
              </SectionCard>

              <SectionCard
                title="Circuit 2"
                right={
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                    C2
                  </div>
                }
              >
                <ValueRow label="Comp 2A Enabled" value={summary.comp2A ? 'ON' : 'OFF'} />
                <ValueRow label="Comp 2B Enabled" value={summary.comp2B ? 'ON' : 'OFF'} />
                <ValueRow label="Comp 2C Enabled" value={summary.comp2C ? 'ON' : 'OFF'} />
                <ValueRow label="Flow C2" value={formatNumber(summary.flowC2, 0)} unit="GPM" />
                <ValueRow label="Evap Out C2" value={formatNumber(summary.evapOutC2, 1)} unit="°F" />
              </SectionCard>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <AlertTriangle size={18} />
                Status Bits
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
                {importantBits.map((bit) => (
                  <BitBadge key={bit.label} label={bit.label} active={bit.active} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Clock3 size={18} />
                RAW Registers Table
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Point Code
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Point Name
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Raw Register
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Raw Value
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Updated At
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row) => (
                      <tr key={row.point_code} className="transition hover:bg-white/[0.03]">
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-cyan-300">
                          {row.point_code}
                        </td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                          {row.point_name || '—'}
                        </td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                          {row.raw_register ?? '—'}
                        </td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                          {row.raw_value ?? row.value_number ?? '—'}
                        </td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/50">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
