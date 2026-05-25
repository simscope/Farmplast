import { supabase } from '../lib/supabase'

export const BACKUP_PAGE_SIZE = 1000

export const backupTables = [
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

export const storageBuckets = [
  { name: 'employee-photos', label: 'Employee photos metadata' },
]

export function createEmptyBackupProgress() {
  return backupTables.reduce((acc, table) => {
    acc[table.name] = {
      count: 0,
      status: 'pending',
    }
    return acc
  }, {})
}

export function getBackupFileName() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  return `farmplast-backup-${stamp}.json`
}

export function downloadJson(fileName, payload) {
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

async function loadTableRows(tableName, onPageLoaded = () => {}) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + BACKUP_PAGE_SIZE - 1
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

    if (page.length < BACKUP_PAGE_SIZE) break
    from += BACKUP_PAGE_SIZE
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
        limit: BACKUP_PAGE_SIZE,
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

    if (items.length < BACKUP_PAGE_SIZE) break
    offset += BACKUP_PAGE_SIZE
  }

  return output
}

export async function createFarmplastBackup({
  onProgress = () => {},
  onWarning = () => {},
} = {}) {
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
    onProgress(table.name, { status: 'running', count: 0 })

    try {
      const rows = await loadTableRows(table.name, (count) => {
        onProgress(table.name, { count })
      })

      backup.tables[table.name] = rows
      backup.summary.tables[table.name] = rows.length
      onProgress(table.name, { status: 'done', count: rows.length })
    } catch (tableError) {
      const warning = `${table.name}: ${tableError.message || 'Could not export table'}`

      backup.tables[table.name] = []
      backup.summary.tables[table.name] = 0
      backup.summary.warnings.push(warning)
      onWarning(warning)
      onProgress(table.name, { status: 'warning', count: 0 })
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
      onWarning(warning)
    }
  }

  return backup
}
