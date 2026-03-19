import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Gauge,
  Snowflake,
  Thermometer,
  Wind,
  RefreshCw,
  Cpu,
  Waves,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const pageWrap =
  'min-h-screen bg-slate-950 text-slate-100 px-4 md:px-6 py-6'
const card =
  'rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl'
const smallCard =
  'rounded-2xl border border-slate-800 bg-slate-900/70 p-4'
const muted = 'text-slate-400'
const title = 'text-lg font-semibold text-white'
const label = 'text-xs uppercase tracking-wide text-slate-400'
const value = 'text-2xl font-bold text-white'
const subValue = 'text-sm text-slate-400'

function formatValue(value, unit = '') {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    return `${value}${unit ? ` ${unit}` : ''}`
  }
  return `${value}${unit ? ` ${unit}` : ''}`
}

function getStatusTone({ running, alarm }) {
  if (alarm) {
    return {
      badge: 'bg-red-500/15 text-red-300 border-red-500/30',
      dot: 'bg-red-400',
      text: 'ALARM',
    }
  }

  if (running) {
    return {
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      dot: 'bg-emerald-400',
      text: 'RUNNING',
    }
  }

  return {
    badge: 'bg-slate-700/50 text-slate-300 border-slate-600',
    dot: 'bg-slate-400',
    text: 'IDLE',
  }
}

function toPointMap(rows) {
  const map = {}
  for (const row of rows) {
    map[row.point_code] = {
      value_number: row.value_number,
      value_boolean: row.value_boolean,
      value_text: row.value_text,
      quality: row.quality,
      updated_at: row.updated_at,
      source_timestamp: row.source_timestamp,
      point_name: row.point_name,
      point_group: row.point_group,
      point_type: row.point_type,
      unit: row.unit,
    }
  }
  return map
}

function pickNumber(map, code) {
  return map?.[code]?.value_number ?? null
}

function pickBool(map, code) {
  return map?.[code]?.value_boolean ?? false
}

function getChillerData(pointMap, prefix) {
  return {
    setpoint: pickNumber(pointMap, `${prefix}_SETPOINT`),
    chwIn: pickNumber(pointMap, `${prefix}_CHW_IN`),
    chwOut: pickNumber(pointMap, `${prefix}_CHW_OUT`),
    suctionPressureC1: pickNumber(pointMap, `${prefix}_SUCTION_PRESSURE_C1`),
    dischargePressureC1: pickNumber(pointMap, `${prefix}_DISCHARGE_PRESSURE_C1`),
    running: pickBool(pointMap, `${prefix}_RUNNING`) || pickBool(pointMap, `${prefix}_SYSTEM_RUNNING`),
    alarm: pickBool(pointMap, `${prefix}_ALARM`) || pickBool(pointMap, `${prefix}_ALARM_CRITICAL`) || pickBool(pointMap, `${prefix}_ALARM_REFRIG`),
    deltaT: pickNumber(pointMap, `${prefix}_DELTA_T`),
    flowC1: pickNumber(pointMap, `${prefix}_FLOW_C1`),
    flowC2: pickNumber(pointMap, `${prefix}_FLOW_C2`),
    capacityC1: pickNumber(pointMap, `${prefix}_CAPACITY_C1`),
    capacityC2: pickNumber(pointMap, `${prefix}_CAPACITY_C2`),
    systemDemand: pickNumber(pointMap, `${prefix}_SYSTEM_DEMAND`),
    compAEnabled: pickBool(pointMap, `${prefix}_COMP_A_ENABLED`),
    compBEnabled: pickBool(pointMap, `${prefix}_COMP_B_ENABLED`),
    compCEnabled: pickBool(pointMap, `${prefix}_COMP_C_ENABLED`),
    updatedAt:
      pointMap?.[`${prefix}_CHW_IN`]?.updated_at ||
      pointMap?.[`${prefix}_SETPOINT`]?.updated_at ||
      null,
  }
}

function MetricCard({ icon: Icon, labelText, valueText, unitText, hint }) {
  return (
    <div className={smallCard}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={label}>{labelText}</div>
          <div className="mt-2 flex items-end gap-2">
            <div className={value}>{valueText}</div>
            {unitText ? <div className={subValue}>{unitText}</div> : null}
          </div>
          {hint ? <div className="mt-2 text-xs text-slate-400">{hint}</div> : null}
        </div>
        <div className="rounded-xl bg-slate-800 p-2 text-slate-300">
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

function CompressorBadge({ labelText, active }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-slate-700 bg-slate-800/70 text-slate-400'
      }`}
    >
      {labelText}
    </div>
  )
}

function ChillerSection({ titleText, prefix, pointMap }) {
  const data = useMemo(() => getChillerData(pointMap, prefix), [pointMap, prefix])
  const tone = getStatusTone({ running: data.running, alarm: data.alarm })

  return (
    <section className={`${card} p-5 md:p-6`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{titleText}</h2>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${tone.badge}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              {tone.text}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {data.updatedAt ? `Updated: ${new Date(data.updatedAt).toLocaleString()}` : 'No live timestamp yet'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:flex md:gap-3">
          <CompressorBadge labelText="Comp A" active={data.compAEnabled} />
          <CompressorBadge labelText="Comp B" active={data.compBEnabled} />
          <CompressorBadge labelText="Comp C" active={data.compCEnabled} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Snowflake}
          labelText="Setpoint"
          valueText={formatValue(data.setpoint)}
          unitText="°F"
        />
        <MetricCard
          icon={Thermometer}
          labelText="CHW In"
          valueText={formatValue(data.chwIn)}
          unitText="°F"
        />
        <MetricCard
          icon={Thermometer}
          labelText="CHW Out"
          valueText={formatValue(data.chwOut)}
          unitText="°F"
        />
        <MetricCard
          icon={Activity}
          labelText="Delta T"
          valueText={formatValue(data.deltaT)}
          unitText="°F"
          hint="If point not added yet, it will show —"
        />

        <MetricCard
          icon={Gauge}
          labelText="Suction Pressure C1"
          valueText={formatValue(data.suctionPressureC1)}
          unitText="psi"
        />
        <MetricCard
          icon={Gauge}
          labelText="Discharge Pressure C1"
          valueText={formatValue(data.dischargePressureC1)}
          unitText="psi"
        />
        <MetricCard
          icon={Waves}
          labelText="Flow C1"
          valueText={formatValue(data.flowC1)}
          unitText="GPM"
        />
        <MetricCard
          icon={Waves}
          labelText="Flow C2"
          valueText={formatValue(data.flowC2)}
          unitText="GPM"
        />

        <MetricCard
          icon={Cpu}
          labelText="Capacity C1"
          valueText={formatValue(data.capacityC1)}
          unitText="tons"
        />
        <MetricCard
          icon={Cpu}
          labelText="Capacity C2"
          valueText={formatValue(data.capacityC2)}
          unitText="tons"
        />
        <MetricCard
          icon={Wind}
          labelText="System Demand"
          valueText={formatValue(data.systemDemand)}
          unitText="%"
        />
        <MetricCard
          icon={AlertTriangle}
          labelText="Alarm State"
          valueText={data.alarm ? 'ACTIVE' : 'NORMAL'}
          unitText=""
        />
      </div>
    </section>
  )
}

export default function ChillersPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorText, setErrorText] = useState('')

  async function loadTelemetry({ silent = false } = {}) {
    try {
      if (!silent) setRefreshing(true)
      setErrorText('')

      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .or('point_code.like.CH2_%,point_code.like.CH3_%')
        .order('point_code', { ascending: true })

      if (error) throw error
      setRows(data || [])
    } catch (error) {
      console.error('Failed to load chillers telemetry:', error)
      setErrorText(error?.message || 'Failed to load telemetry')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadTelemetry()

    const interval = setInterval(() => {
      loadTelemetry({ silent: true })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const pointMap = useMemo(() => toPointMap(rows), [rows])

  return (
    <div className={pageWrap}>
      <div className="mx-auto max-w-7xl">
        <div className={`${card} mb-6 p-5 md:p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-sky-400">Sim Scope Monitoring</div>
              <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">
                Chillers Dashboard
              </h1>
              <div className="mt-2 text-sm text-slate-400">
                Live telemetry from PLC via ESP32 gateways
              </div>
            </div>

            <button
              onClick={() => loadTelemetry()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {errorText ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorText}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className={`${card} p-8 text-center text-slate-400`}>Loading telemetry...</div>
        ) : (
          <div className="grid gap-6">
            <ChillerSection titleText="Chiller 2" prefix="CH2" pointMap={pointMap} />
            <ChillerSection titleText="Chiller 3" prefix="CH3" pointMap={pointMap} />
          </div>
        )}
      </div>
    </div>
  )
}
