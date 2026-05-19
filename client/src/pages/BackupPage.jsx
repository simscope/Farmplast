import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function BackupPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const tables = [
    'employees',
    'employee_work_logs',
    'zkt_attendance_logs',
    'profiles',
  ]

  async function loadTable(tableName) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')

    if (error) {
      throw new Error(`${tableName}: ${error.message}`)
    }

    return data || []
  }

  async function createBackup() {
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const backup = {
        app: 'Payroll System',
        type: 'manual_backup',
        created_at: new Date().toISOString(),
        tables: {},
      }

      for (const tableName of tables) {
        backup.tables[tableName] = await loadTable(tableName)
      }

      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })

      const fileName = `backup_${new Date()
        .toISOString()
        .replaceAll(':', '-')
        .replaceAll('.', '-')}.json`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setMessage(`Backup created: ${fileName}`)
    } catch (err) {
      setError(err.message || 'Backup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h1>Database Backup</h1>

      <p style={{ color: '#94a3b8', maxWidth: 700 }}>
        This page creates a safe JSON backup of important payroll tables.
        It does not change or delete anything in the database.
      </p>

      <div
        style={{
          marginTop: 24,
          padding: 20,
          border: '1px solid #334155',
          borderRadius: 12,
          background: '#020617',
          maxWidth: 700,
        }}
      >
        <h2>Manual Backup</h2>

        <p style={{ color: '#94a3b8' }}>
          Included tables: employees, employee_work_logs, zkt_attendance_logs, profiles.
        </p>

        <button
          onClick={createBackup}
          disabled={loading}
          style={{
            marginTop: 16,
            padding: '12px 18px',
            borderRadius: 10,
            border: 'none',
            background: loading ? '#475569' : '#2563eb',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating backup...' : 'Download Backup JSON'}
        </button>

        {message && (
          <div style={{ marginTop: 16, color: '#22c55e' }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, color: '#ef4444' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
