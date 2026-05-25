import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BACKUP_PAGE_SIZE,
  backupTables,
  createEmptyBackupProgress,
  createFarmplastBackup,
  downloadJson,
  getBackupFileName,
  storageBuckets,
} from '../utils/backupExport'

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [progress, setProgress] = useState(createEmptyBackupProgress)

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
    setProgress(createEmptyBackupProgress())

    try {
      const backup = await createFarmplastBackup({
        onProgress: updateProgress,
        onWarning: (warning) => {
          setWarnings((current) => [...current, warning])
        },
      })

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
                This does not modify database data. Large tables are downloaded in pages of {BACKUP_PAGE_SIZE} rows.
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
