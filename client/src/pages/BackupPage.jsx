import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000

const backupTables = [
  { name: 'profiles', label: 'User profiles', group: 'System' },
  { name: 'employees', label: 'Employees', group: 'Payroll' },
  { name: 'employee_companies', label: 'Employee companies', group: 'Payroll' },
  { name: 'employee_work_logs', label: 'Employee work logs', group: 'Payroll' },
  { name: 'employee_payroll_deductions', label: 'Payroll deductions', group: 'Payroll' },
  { name: 'employee_payments', label: 'Employee payments', group: 'Payroll' },
  { name: 'zkt_attendance_logs', label: 'ZKT attendance logs', group: 'ZKT' },
  { name: 'zkt_bridge_commands', label: 'ZKT bridge commands', group: 'ZKT' },
  { name: 'telemetry_latest', label: 'Chiller 1 latest telemetry', group: 'Monitoring' },
  { name: 'ch2_latest', label: 'Chiller 2 latest telemetry', group: 'Monitoring' },
  { name: 'ch3_latest', label: 'Chiller 3 latest telemetry', group: 'Monitoring' },
]

const storageBuckets = [
  { name: 'employee-photos', label: 'Employee photos metadata' },
]

function createEmptyProgress() {
  return backupTables.reduce((acc, table) => {
    acc[table.name] = {
      count: 0,
      status: 'pending',
    }
    return acc
  }, {})
}

function getBackupFileName() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  return `farmplast-backup-${stamp}.json`
}

function downloadJson(fileName, payload) {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

async function loadTableRows(tableName, onPageLoaded) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, to)

    if (error) {
      throw new Error(`${tableName}: ${error.message}`)
    }

    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    onPageLoaded(rows.length)

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function listStorageFolder(bucketName, path = '') {
  const output = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(path, {
        limit: PAGE_SIZE,
        offset,
      })

    if (error) {
      throw new Error(`${bucketName}: ${error.message}`)
    }

    const items = Array.isArray(data) ? data : []

    for (const item of items) {
      const itemPath = path ? `${path}/${item.name}` : item.name
      const isFolder = item.id === null && item.metadata === null

      if (isFolder) {
        output.push(...await listStorageFolder(bucketName, itemPath))
        continue
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(itemPath)

      output.push({
        ...item,
        path: itemPath,
        publicUrl: publicUrlData?.publicUrl || null,
      })
    }

    if (items.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return output
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [progress, setProgress] = useState(createEmptyProgress)

  const groupedTables = useMemo(() => {
    return backupTables.reduce((acc, table) => {
      if (!acc[table.group]) acc[table.group] = []
      acc[table.group].push(table)
      return acc
    }, {})
  }, [])

  function updateProgress(tableName, patch) {
    setProgress((current) => ({
      ...current,
      [tableName]: {
        ...current[tableName],
        ...patch,
      },
    }))
  }

  async function createBackup() {
    setLoading(true)
    setMessage('')
    setError('')
    setWarnings([])
    setProgress(createEmptyProgress())

    try {
      const backup = {
        app: 'Farmplast',
        type: 'manual_json_backup',
        format_version: 2,
        created_at: new Date().toISOString(),
        source: {
          url: import.meta.env.VITE_SUPABASE_URL || null,
        },
        tables: {},
        storage: {},
        summary: {
          tables: {},
          storage: {},
          warnings: [],
        },
      }

      for (const table of backupTables) {
        updateProgress(table.name, { status: 'running', count: 0 })

        try {
          const rows = await loadTableRows(table.name, (count) => {
            updateProgress(table.name, { count })
          })

          backup.tables[table.name] = rows
          backup.summary.tables[table.name] = rows.length
          updateProgress(table.name, { status: 'done', count: rows.length })
        } catch (tableError) {
          const warning = `${table.name}: ${tableError.message || 'Could not export table'}`

          backup.tables[table.name] = []
          backup.summary.tables[table.name] = 0
          backup.summary.warnings.push(warning)
          setWarnings((current) => [...current, warning])
          updateProgress(table.name, { status: 'warning', count: 0 })
        }
      }

      for (const bucket of storageBuckets) {
        try {
          const files = await listStorageFolder(bucket.name)
          backup.storage[bucket.name] = files
          backup.summary.storage[bucket.name] = files.length
        } catch (storageError) {
          const warning = `${bucket.name}: ${storageError.message || 'Could not list storage bucket'}`
          backup.storage[bucket.name] = []
          backup.summary.storage[bucket.name] = 0
          backup.summary.warnings.push(warning)
          setWarnings((current) => [...current, warning])
        }
      }

      const fileName = getBackupFileName()
      downloadJson(fileName, backup)
      setMessage(
        backup.summary.warnings.length > 0
          ? `Backup created with warnings: ${fileName}`
          : `Backup created: ${fileName}`
      )
    } catch (err) {
      setError(err.message || 'Backup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#020817] px-4 py-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Database Backup</h1>
            <p className="mt-1 text-sm text-slate-400">
              Creates a downloadable JSON backup of payroll, ZKT, monitoring, and profile tables.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-500"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manual Backup</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                This does not modify database data. Large tables are downloaded in pages of {PAGE_SIZE} rows.
                Employee photo files are listed as storage metadata and public URLs when the bucket policy allows it.
              </p>
            </div>

            <button
              type="button"
              onClick={createBackup}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {loading ? 'Creating backup...' : 'Download Backup JSON'}
            </button>
          </div>

          {message ? (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {Object.entries(groupedTables).map(([group, tables]) => (
            <div key={group} className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-cyan-300">
                {group}
              </h3>

              <div className="space-y-2">
                {tables.map((table) => {
                  const item = progress[table.name] || {}

                  return (
                    <div
                      key={table.name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-slate-100">{table.label}</div>
                        <div className="text-xs text-slate-500">{table.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-100">{item.count || 0}</div>
                        <div className="text-xs uppercase text-slate-500">{item.status || 'pending'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-cyan-300">
              Storage
            </h3>
            <div className="space-y-2">
              {storageBuckets.map((bucket) => (
                <div
                  key={bucket.name}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
                >
                  <div className="font-semibold text-slate-100">{bucket.label}</div>
                  <div className="text-xs text-slate-500">{bucket.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
