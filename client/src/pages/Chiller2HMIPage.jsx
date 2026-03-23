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
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const DEVICE_CODE = 'ESP32-CH2-PLC'
const POLL_MS = 3000

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastError, setLastError] = useState('')
  const [lastSync, setLastSync] = useState(null)

  async function loadData(silent = false) {
    try {
      if (!silent) setLoading(true)
      setLastError('')

      const { data, error } = await supabase
        .from('chiller_raw_points')
        .select('point_code, value_number, value_boolean, updated_at')
        .eq('device_code', DEVICE_CODE)
        .order('point_code', { ascending: true })

      if (error) throw error

      setRows(data || [])

      if (data?.length) {
        const latest = [...data]
          .map((row) => row.updated_at)
          .filter(Boolean)
          .sort()
          .at(-1)

        setLastSync(latest || null)
      }
    } catch (err) {
      setLastError(err?.message || 'Failed to load chiller data')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(() => loadData(true), POLL_MS)
    return () => clearInterval(timer)
  }, [])

  const pointMap = useMemo(() => {
    const map = {}
    for (const row of rows) {
      map[row.point_code] = row
    }
    return map
  }, [rows])

  function getNumber(code) {
    const row = pointMap[code]
    if (!row) return null
    return row.value_number ?? null
  }

  function getBool(code) {
    const row = pointMap[code]
    if (!row) return false
    return row.value_boolean === true
  }

  const summary = useMemo(() => {
    return {
      // ===== General by manual =====
      plcVersion: getNumber('CH2_R40021') !== null ? getNumber('CH2_R40021') / 1000 : null,
      localCompressorCount: getNumber('CH2_R40022'),
      setpoint: getNumber('CH2_R40023') !== null ? getNumber('CH2_R40023') / 10 : null,
      chwIn: getNumber('CH2_R40024') !== null ? getNumber('CH2_R40024') / 10 : null,
      chwOut: getNumber('CH2_R40025') !== null ? getNumber('CH2_R40025') / 10 : null,
      compressorsAvailable: getNumber('CH2_R40026'),
      stagedCondenseTemp: getNumber('CH2_R40027'),

      // ===== Process by manual =====
      condOutC1: getNumber('CH2_R40028'),
      condOutC2: getNumber('CH2_R40029'),
      suctionTempC1: getNumber('CH2_R40030'),
      suctionTempC2: getNumber('CH2_R40031'),
      suctionPressureC1: getNumber('CH2_R40032'),
      suctionPressureC2: getNumber('CH2_R40033'),
      liquidTempC1: getNumber('CH2_R40034'),
      liquidTempC2: getNumber('CH2_R40035'),
      dischargePressureC1: getNumber('CH2_R40036'),
      dischargePressureC2: getNumber('CH2_R40037'),
      diffPressure: getNumber('CH2_R40038'),
      pumpPressure: getNumber('CH2_R40039'),
      hgbPositionC1: getNumber('CH2_R40040'),
      hgbPositionC2: getNumber('CH2_R40041'),
      hgbModeC1: getNumber('CH2_R40042'),
      hgbModeC2: getNumber('CH2_R40043'),

      // ===== Hours / flow / capacity =====
      compAHoursC1: getNumber('CH2_R40044'),
      compBHoursC1: getNumber('CH2_R40045'),
      compCHoursC1: getNumber('CH2_R40046'),
      compAHoursC2: getNumber('CH2_R40047'),
      compBHoursC2: getNumber('CH2_R40048'),
      compCHoursC2: getNumber('CH2_R40049'),
      flowC1: getNumber('CH2_R40050'),
      flowC2: getNumber('CH2_R40051'),
      capacityC1: getNumber('CH2_R40052'),
      capacityC2: getNumber('CH2_R40053'),
      hmiMessage: getNumber('CH2_R40054'),
      evapOutC1: getNumber('CH2_R40055'),
      evapOutC2: getNumber('CH2_R40056'),
      compressorsOnC1: getNumber('CH2_R40057'),
      compressorsOnC2: getNumber('CH2_R40058'),
      deltaT: getNumber('CH2_R40059') !== null ? getNumber('CH2_R40059') / 10 : null,
      systemDemand: getNumber('CH2_R40060'),

      // ===== Status bits by manual =====
      heartBeat: getBool('CH2_R40011_B0'),
      condenserTypeWaterAir: getBool('CH2_R40011_B1'),
      antifreezeWarning: getBool('CH2_R40011_B2'),
      masterMode: getBool('CH2_R40011_B4'),
      dualCircuit: getBool('CH2_R40011_B5'),
      alarmProcess: getBool('CH2_R40011_B6'),
      alarmCritical: getBool('CH2_R40011_B7'),
      softStopActive: getBool('CH2_R40011_B9'),
      alarmEStop: getBool('CH2_R40011_B10'),
      systemRunning: getBool('CH2_R40011_B14'),
      systemShuttingDown: getBool('CH2_R40011_B15'),

      c1AlarmRefrigerant: getBool('CH2_R40012_B0'),
      c1Running: getBool('CH2_R40012_B1'),
      c1HgbStartupDone: getBool('CH2_R40012_B2'),
      c1HgbStartupPosition: getBool('CH2_R40012_B3'),
      c1HgbPidEnabled: getBool('CH2_R40012_B4'),
      c1CompAWaiting: getBool('CH2_R40012_B5'),
      c1CompBWaiting: getBool('CH2_R40012_B6'),
      c1CompCWaiting: getBool('CH2_R40012_B7'),
      c1CompAEnabled: getBool('CH2_R40012_B8'),
      c1CompBEnabled: getBool('CH2_R40012_B9'),
      c1CompCEnabled: getBool('CH2_R40012_B10'),
      c1CircuitDisabled: getBool('CH2_R40012_B15'),

      c2AlarmRefrigerant: getBool('CH2_R40013_B0'),
      c2Running: getBool('CH2_R40013_B1'),
      c2HgbStartupDone: getBool('CH2_R40013_B2'),
      c2HgbStartupPosition: getBool('CH2_R40013_B3'),
      c2HgbPidEnabled: getBool('CH2_R40013_B4'),
      c2CompAWaiting: getBool('CH2_R40013_B5'),
      c2CompBWaiting: getBool('CH2_R40013_B6'),
      c2CompCWaiting: getBool('CH2_R40013_B7'),
      c2CompAEnabled: getBool('CH2_R40013_B8'),
      c2CompBEnabled: getBool('CH2_R40013_B9'),
      c2CompCEnabled: getBool('CH2_R40013_B10'),
      c2CircuitDisabled: getBool('CH2_R40013_B15'),

      hgbOptionEnabled: getBool('CH2_R40014_B0'),
      flowSensorEnabled: getBool('CH2_R40014_B1'),
    }
  }, [pointMap])

  const importantBits = [
    { label: 'System Running', active: summary.systemRunning },
    { label: 'System Shutting Down', active: summary.systemShuttingDown },
    { label: 'Alarm Process', active: summary.alarmProcess },
    { label: 'Alarm Critical', active: summary.alarmCritical },
    { label: 'Alarm E-Stop', active: summary.alarmEStop },
    { label: 'Antifreeze Warning', active: summary.antifreezeWarning },

    { label: 'C1 Running', active: summary.c1Running },
    { label: 'C1 Alarm Refrigerant', active: summary.c1AlarmRefrigerant },
    { label: 'C1 HGB PID Enabled', active: summary.c1HgbPidEnabled },
    { label: 'C1 Comp A Enabled', active: summary.c1CompAEnabled },
    { label: 'C1 Comp B Enabled', active: summary.c1CompBEnabled },
    { label: 'C1 Comp C Enabled', active: summary.c1CompCEnabled },
    { label: 'C1 Circuit Disabled', active: summary.c1CircuitDisabled },

    { label: 'C2 Running', active: summary.c2Running },
    { label: 'C2 Alarm Refrigerant', active: summary.c2AlarmRefrigerant },
    { label: 'C2 HGB PID Enabled', active: summary.c2HgbPidEnabled },
    { label: 'C2 Comp A Enabled', active: summary.c2CompAEnabled },
    { label: 'C2 Comp B Enabled', active: summary.c2CompBEnabled },
    { label: 'C2 Comp C Enabled', active: summary.c2CompCEnabled },
    { label: 'C2 Circuit Disabled', active: summary.c2CircuitDisabled },

    { label: 'HGB Option Enabled', active: summary.hgbOptionEnabled },
    { label: 'Flow Sensor Enabled', active: summary.flowSensorEnabled },
  ]

  const rawRows = useMemo(() => {
    return [...rows].sort((a, b) => a.point_code.localeCompare(b.point_code))
  }, [rows])

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
                Device: {DEVICE_CODE}
                {lastSync ? ` • Last update: ${new Date(lastSync).toLocaleString()}` : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                summary.systemRunning
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-white/60'
              }`}
            >
              Running: {summary.systemRunning ? 'ON' : 'OFF'}
            </div>

            <div
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                summary.alarmProcess || summary.alarmCritical || summary.alarmEStop
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border-white/10 bg-white/5 text-white/60'
              }`}
            >
              Alarm: {summary.alarmProcess || summary.alarmCritical || summary.alarmEStop ? 'ACTIVE' : 'NORMAL'}
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
              <StatCard title="Setpoint" value={formatNumber(summary.setpoint, 1)} unit="°F" icon={Thermometer} accent="blue" />
              <StatCard title="Entering Fluid" value={formatNumber(summary.chwIn, 1)} unit="°F" icon={Thermometer} accent="green" />
              <StatCard title="Leaving Fluid" value={formatNumber(summary.chwOut, 1)} unit="°F" icon={Thermometer} accent="green" />
              <StatCard title="Delta T" value={formatNumber(summary.deltaT, 1)} unit="°F" icon={Activity} accent="yellow" />
              <StatCard title="System Demand" value={formatNumber(summary.systemDemand, 0)} unit="%" icon={Gauge} accent="purple" />
              <StatCard title="PLC Version" value={formatNumber(summary.plcVersion, 3)} icon={Cpu} accent="blue" />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
              <SectionCard title="General">
                <ValueRow label="Local compressor count" value={formatNumber(summary.localCompressorCount, 0)} />
                <ValueRow label="Compressors available" value={formatNumber(summary.compressorsAvailable, 0)} />
                <ValueRow label="Staged condense temp" value={formatNumber(summary.stagedCondenseTemp, 0)} />
                <ValueRow label="Differential pressure" value={formatNumber(summary.diffPressure, 0)} />
                <ValueRow label="Process pump pressure" value={formatNumber(summary.pumpPressure, 0)} />
                <ValueRow label="HMI message" value={formatNumber(summary.hmiMessage, 0)} />
              </SectionCard>

              <SectionCard
                title="Circuit 1"
                right={
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    C1
                  </div>
                }
              >
                <ValueRow label="Condenser fluid out C1" value={formatNumber(summary.condOutC1, 0)} />
                <ValueRow label="Suction temp C1" value={formatNumber(summary.suctionTempC1, 0)} />
                <ValueRow label="Suction pressure C1" value={formatNumber(summary.suctionPressureC1, 0)} />
                <ValueRow label="Liquid temp C1" value={formatNumber(summary.liquidTempC1, 0)} />
                <ValueRow label="Discharge pressure C1" value={formatNumber(summary.dischargePressureC1, 0)} />
                <ValueRow label="HGB position C1" value={formatNumber(summary.hgbPositionC1, 0)} />
                <ValueRow label="HGB mode C1" value={formatNumber(summary.hgbModeC1, 0)} />
                <ValueRow label="Comp A hours C1" value={formatNumber(summary.compAHoursC1, 0)} />
                <ValueRow label="Comp B hours C1" value={formatNumber(summary.compBHoursC1, 0)} />
                <ValueRow label="Comp C hours C1" value={formatNumber(summary.compCHoursC1, 0)} />
                <ValueRow label="Flow C1" value={formatNumber(summary.flowC1, 0)} />
                <ValueRow label="Capacity C1" value={formatNumber(summary.capacityC1, 0)} />
                <ValueRow label="Evap out C1" value={formatNumber(summary.evapOutC1, 0)} />
                <ValueRow label="Compressors ON C1" value={formatNumber(summary.compressorsOnC1, 0)} />
              </SectionCard>

              <SectionCard
                title="Circuit 2"
                right={
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                    C2
                  </div>
                }
              >
                <ValueRow label="Condenser fluid out C2" value={formatNumber(summary.condOutC2, 0)} />
                <ValueRow label="Suction temp C2" value={formatNumber(summary.suctionTempC2, 0)} />
                <ValueRow label="Suction pressure C2" value={formatNumber(summary.suctionPressureC2, 0)} />
                <ValueRow label="Liquid temp C2" value={formatNumber(summary.liquidTempC2, 0)} />
                <ValueRow label="Discharge pressure C2" value={formatNumber(summary.dischargePressureC2, 0)} />
                <ValueRow label="HGB position C2" value={formatNumber(summary.hgbPositionC2, 0)} />
                <ValueRow label="HGB mode C2" value={formatNumber(summary.hgbModeC2, 0)} />
                <ValueRow label="Comp A hours C2" value={formatNumber(summary.compAHoursC2, 0)} />
                <ValueRow label="Comp B hours C2" value={formatNumber(summary.compBHoursC2, 0)} />
                <ValueRow label="Comp C hours C2" value={formatNumber(summary.compCHoursC2, 0)} />
                <ValueRow label="Flow C2" value={formatNumber(summary.flowC2, 0)} />
                <ValueRow label="Capacity C2" value={formatNumber(summary.capacityC2, 0)} />
                <ValueRow label="Evap out C2" value={formatNumber(summary.evapOutC2, 0)} />
                <ValueRow label="Compressors ON C2" value={formatNumber(summary.compressorsOnC2, 0)} />
              </SectionCard>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <AlertTriangle size={18} />
                Status / Manual Bits
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                {importantBits.map((bit) => (
                  <BitBadge key={bit.label} label={bit.label} active={bit.active} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Clock3 size={18} />
                RAW Table
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Point Code
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Value Number
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Value Boolean
                      </th>
                      <th className="sticky top-0 border-b border-white/10 bg-[#0b1220] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">
                        Updated At
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row) => (
                      <tr key={row.point_code} className="transition hover:bg-white/[0.03]">
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-cyan-300">{row.point_code}</td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                          {row.value_number === null ? '—' : row.value_number}
                        </td>
                        <td className="border-b border-white/5 px-3 py-2 text-sm text-white/80">
                          {row.value_boolean === null ? '—' : row.value_boolean ? 'true' : 'false'}
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
