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
  Target,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const POLL_MS = 3000

const REGISTER_MAP = {
  40001: { name: 'Target Setpoint', unit: '°F', scale: 0.1 },
  40002: { name: 'Chiller Start', unit: '', scale: 1 },
  40003: { name: 'Chiller Stop', unit: '', scale: 1 },

  40021: { name: 'PLC Version', unit: '', scale: 0.001 },
  40022: { name: 'Local Compressor Count', unit: '', scale: 1 },
  40023: { name: 'Process Setpoint', unit: '°F', scale: 0.1 },
  40024: { name: 'Chiller Entering Fluid Temp', unit: '°F', scale: 0.1 },
  40025: { name: 'Chiller Leaving Fluid Temp', unit: '°F', scale: 0.1 },

  40026: { name: 'Compressors Available', unit: '', scale: 1 },
  40027: { name: 'Compressors Staged', unit: '', scale: 1 },
  40028: { name: 'Condenser Fluid In Temp', unit: '°F', scale: 1 },
  40029: { name: 'Condenser Fluid Out Temp Circuit 1', unit: '°F', scale: 1 },
  40030: { name: 'Condenser Fluid Out Temp Circuit 2', unit: '°F', scale: 1 },

  40031: { name: 'Refrigerant Suction Temp Circuit 1', unit: '°F', scale: 1 },
  40032: { name: 'Refrigerant Suction Temp Circuit 2', unit: '°F', scale: 1 },
  40033: { name: 'Refrigerant Suction Pressure Circuit 1', unit: 'PSIG', scale: 1 },
  40034: { name: 'Refrigerant Suction Pressure Circuit 2', unit: 'PSIG', scale: 1 },
  40035: { name: 'Refrigerant Liquid Temp Circuit 1', unit: '°F', scale: 1 },
  40036: { name: 'Refrigerant Liquid Temp Circuit 2', unit: '°F', scale: 1 },
  40037: { name: 'Refrigerant Discharge Pressure Circuit 1', unit: 'PSIG', scale: 1 },
  40038: { name: 'Refrigerant Discharge Pressure Circuit 2', unit: 'PSIG', scale: 1 },
  40039: { name: 'Differential Pressure', unit: 'PSIG', scale: 1 },
  40040: { name: 'Process Pump Pressure', unit: 'PSIG', scale: 1 },
  40041: { name: 'HGB Position Circuit 1', unit: '%', scale: 1 },
  40042: { name: 'HGB Position Circuit 2', unit: '%', scale: 1 },
  40043: { name: 'HGB Mode Circuit 1', unit: '', scale: 1 },
  40044: { name: 'HGB Mode Circuit 2', unit: '', scale: 1 },

  40045: { name: 'Circuit 1 Compressor A Hours', unit: 'h', scale: 1 },
  40046: { name: 'Circuit 1 Compressor B Hours', unit: 'h', scale: 1 },
  40047: { name: 'Circuit 1 Compressor C Hours', unit: 'h', scale: 1 },
  40048: { name: 'Circuit 2 Compressor A Hours', unit: 'h', scale: 1 },
  40049: { name: 'Circuit 2 Compressor B Hours', unit: 'h', scale: 1 },
  40050: { name: 'Circuit 2 Compressor C Hours', unit: 'h', scale: 1 },

  40051: { name: 'Circuit 1 Flow', unit: 'GPM', scale: 1 },
  40052: { name: 'Circuit 2 Flow', unit: 'GPM', scale: 1 },
  40053: { name: 'Circuit 1 Capacity', unit: 'TONS', scale: 1 },
  40054: { name: 'Circuit 2 Capacity', unit: 'TONS', scale: 1 },
  40055: { name: 'HMI Message Display', unit: '', scale: 1 },
  40056: { name: 'Evap Fluid Out Temp Circuit 1', unit: '°F', scale: 1 },
  40057: { name: 'Evap Fluid Out Temp Circuit 2', unit: '°F', scale: 1 },
  40058: { name: 'Circuit 1 Compressors On Count', unit: '', scale: 1 },
  40059: { name: 'Circuit 2 Compressors On Count', unit: '', scale: 1 },
  40060: { name: 'Process Fluid Delta T', unit: '°F', scale: 0.1 },
  40061: { name: 'System Demand Percent', unit: '%', scale: 1 },
}

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

function decodeRegister(row) {
  const reg = Number(row.raw_register)
  const meta = REGISTER_MAP[reg]

  if (!meta) {
    return {
      register: row.raw_register ?? '—',
      name: row.point_name || 'Unknown register',
      scaledValue: row.raw_value ?? row.value_number ?? row.value_boolean ?? '—',
      unit: '',
    }
  }

  const raw = row.raw_value ?? row.value_number
  const num = raw === null || raw === undefined || raw === '' ? null : Number(raw)

  if (num === null || Number.isNaN(num)) {
    return {
      register: reg,
      name: meta.name,
      scaledValue: '—',
      unit: meta.unit || '',
    }
  }

  const scaled = num * meta.scale
  const valueText =
    meta.scale === 1
      ? Number.isInteger(scaled)
        ? String(scaled)
        : scaled.toFixed(1)
      : scaled.toFixed(1)

  return {
    register: reg,
    name: meta.name,
    scaledValue: valueText,
    unit: meta.unit || '',
  }
}

function getSetpointFromDashboard(dashboard) {
  const raw =
    dashboard?.ch2_r40023 ??
    dashboard?.CH2_R40023 ??
    dashboard?.process_setpoint_raw ??
    dashboard?.setpoint_raw

  if (raw !== null && raw !== undefined && raw !== '') {
    const num = Number(raw)
    if (!Number.isNaN(num)) return num / 10
  }

  return null
}

function getRawRegisterValue(rows, register) {
  const found = rows.find((row) => Number(row.raw_register) === Number(register))
  if (!found) return null

  const raw = found.raw_value ?? found.value_number
  if (raw === null || raw === undefined || raw === '') return null

  const num = Number(raw)
  return Number.isNaN(num) ? null : num
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
    const rawSetpoint = getRawRegisterValue(rawRows, 40023)
    const rawEntering = getRawRegisterValue(rawRows, 40024)
    const rawLeaving = getRawRegisterValue(rawRows, 40025)
    const rawDeltaT = getRawRegisterValue(rawRows, 40060)

    const rawFlowC1 = getRawRegisterValue(rawRows, 40051)
    const rawFlowC2 = getRawRegisterValue(rawRows, 40052)

    const rawCapacityC1 = getRawRegisterValue(rawRows, 40053)
    const rawCapacityC2 = getRawRegisterValue(rawRows, 40054)

    const rawEvapOutC1 = getRawRegisterValue(rawRows, 40056)
    const rawEvapOutC2 = getRawRegisterValue(rawRows, 40057)
    const rawDemand = getRawRegisterValue(rawRows, 40061)

    const setpoint =
      getSetpointFromDashboard(dashboard) ?? (rawSetpoint != null ? rawSetpoint / 10 : null)

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

      setpointF: setpoint,
      enteringFluidF:
        dashboard?.chiller_entering_f ?? (rawEntering != null ? rawEntering / 10 : null),
      leavingFluidF:
        dashboard?.chiller_leaving_f ?? (rawLeaving != null ? rawLeaving / 10 : null),

      flowC1: dashboard?.flow_c1_gpm ?? rawFlowC1,
      flowC2: dashboard?.flow_c2_gpm ?? rawFlowC2,

      capacityC1: dashboard?.capacity_c1_tons ?? rawCapacityC1,
      capacityC2: dashboard?.capacity_c2_tons ?? rawCapacityC2,

      evapOutC1: dashboard?.evap_out_c1_f ?? rawEvapOutC1,
      evapOutC2: dashboard?.evap_out_c2_f ?? rawEvapOutC2,

      deltaT: dashboard?.process_delta_t_f ?? (rawDeltaT != null ? rawDeltaT / 10 : null),
      demandPercent: dashboard?.system_demand_percent ?? rawDemand,

      heartbeatUpdatedAt: dashboard?.heartbeat_updated_at,
      latestUpdatedAt: dashboard?.latest_updated_at,
    }
  }, [dashboard, rawRows])

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
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
              <StatCard
                title="Setpoint"
                value={formatNumber(summary.setpointF, 1)}
                unit="°F"
                icon={Target}
                accent="yellow"
              />
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
                title="Demand"
                value={formatNumber(summary.demandPercent, 0)}
                unit="%"
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
                <ValueRow
                  label="Process Setpoint"
                  value={formatNumber(summary.setpointF, 1)}
                  unit="°F"
                />
                <ValueRow label="Heartbeat" value={summary.heartbeat ? 'ON' : 'OFF'} />
                <ValueRow label="System Running" value={summary.systemRunning ? 'ON' : 'OFF'} />
                <ValueRow
                  label="Heartbeat Updated"
                  value={formatDateTime(summary.heartbeatUpdatedAt)}
                />
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
                <ValueRow
                  label="Capacity C1"
                  value={formatNumber(summary.capacityC1, 0)}
                  unit="TONS"
                />
                <ValueRow
                  label="Evap Out C1"
                  value={formatNumber(summary.evapOutC1, 1)}
                  unit="°F"
                />
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
                <ValueRow
                  label="Capacity C2"
                  value={formatNumber(summary.capacityC2, 0)}
                  unit="TONS"
                />
                <ValueRow
                  label="Evap Out C2"
                  value={formatNumber(summary.evapOutC2, 1)}
                  unit="°F"
                />
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
                        Register
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Point Code
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Decode
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Scaled Value
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
                    {rawRows.map((row) => {
                      const decoded = decodeRegister(row)

                      return (
                        <tr key={row.point_code} className="transition hover:bg-white/[0.03]">
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-cyan-300">
                            {decoded.register}
                          </td>
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                            {row.point_code}
                          </td>
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-white">
                            {decoded.name}
                          </td>
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-emerald-300">
                            {decoded.scaledValue}
                            {decoded.unit ? (
                              <span className="ml-1 text-emerald-200/70">{decoded.unit}</span>
                            ) : null}
                          </td>
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                            {row.raw_value ?? row.value_number ?? row.value_boolean ?? '—'}
                          </td>
                          <td className="border-b border-white/5 px-3 py-2 text-sm text-white/50">
                            {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                          </td>
                        </tr>
                      )
                    })}
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
