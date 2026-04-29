import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(20,184,166,0.12), transparent 24%), #020817',
  color: '#e5eefb',
  padding: '16px 12px 24px',
  fontFamily: 'Arial, sans-serif',
}

const wrapperStyle = { maxWidth: '1820px', margin: '0 auto' }

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '10px',
  flexWrap: 'wrap',
  marginBottom: '12px',
}

const titleStyle = {
  margin: 0,
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: '#f8fafc',
  lineHeight: 1.1,
}

const subtitleStyle = {
  marginTop: '4px',
  marginBottom: 0,
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: 1.35,
}

const cardStyle = {
  background: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(51, 65, 85, 0.7)',
  borderRadius: '14px',
  boxShadow: '0 8px 28px rgba(2, 8, 23, 0.35)',
}

const formCardStyle = {
  ...cardStyle,
  padding: '14px',
  marginBottom: '12px',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: '10px',
  marginBottom: '10px',
}

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
}

const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#cbd5e1',
  letterSpacing: '0.02em',
  lineHeight: 1.2,
}

const inputStyle = {
  width: '100%',
  borderRadius: '9px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '8px 10px',
  fontSize: '12px',
  outline: 'none',
  lineHeight: 1.2,
  boxSizing: 'border-box',
}

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

const checkboxRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  paddingTop: '4px',
  minHeight: '32px',
}

const actionsRowStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '4px',
}

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '9px',
  background: 'linear-gradient(135deg, #2563eb, #14b8a6)',
  color: '#ffffff',
  padding: '9px 12px',
  fontWeight: 700,
  fontSize: '12px',
  cursor: 'pointer',
  lineHeight: 1.2,
}

const secondaryButtonStyle = {
  border: '1px solid #334155',
  borderRadius: '9px',
  background: '#0f172a',
  color: '#e2e8f0',
  padding: '8px 12px',
  fontWeight: 700,
  fontSize: '12px',
  cursor: 'pointer',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
}

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  color: '#fca5a5',
  border: '1px solid rgba(248,113,113,0.45)',
  background: 'rgba(127,29,29,0.18)',
}

const zktButtonStyle = {
  ...secondaryButtonStyle,
  color: '#67e8f9',
  border: '1px solid rgba(34,211,238,0.4)',
  background: 'rgba(8,145,178,0.12)',
}

const statGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '10px',
  marginBottom: '12px',
}

const statCardStyle = {
  ...cardStyle,
  padding: '12px',
}

const statLabelStyle = {
  fontSize: '10px',
  textTransform: 'uppercase',
  color: '#64748b',
  fontWeight: 800,
  letterSpacing: '0.07em',
  marginBottom: '6px',
  lineHeight: 1.2,
}

const statValueStyle = {
  fontSize: '24px',
  fontWeight: 800,
  color: '#f8fafc',
  lineHeight: 1,
}

const listCardStyle = {
  ...cardStyle,
  overflow: 'hidden',
}

const tableWrapStyle = { overflowX: 'auto' }

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1280px',
}

const thStyle = {
  textAlign: 'left',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#94a3b8',
  padding: '8px 10px',
  borderBottom: '1px solid rgba(51, 65, 85, 0.8)',
  background: 'rgba(15, 23, 42, 0.98)',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const tdStyle = {
  padding: '7px 10px',
  borderBottom: '1px solid rgba(30, 41, 59, 0.9)',
  fontSize: '12px',
  color: '#e2e8f0',
  verticalAlign: 'middle',
  lineHeight: 1.25,
}

const badgeBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '70px',
  padding: '4px 8px',
  borderRadius: '999px',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.03em',
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
  border: '1px solid transparent',
}

const infoTextStyle = {
  marginTop: '4px',
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.35,
}

const errorTextStyle = {
  marginTop: '8px',
  fontSize: '12px',
  color: '#f87171',
  fontWeight: 700,
}

const successTextStyle = {
  marginTop: '8px',
  fontSize: '12px',
  color: '#4ade80',
  fontWeight: 700,
}

const emptyStateStyle = {
  padding: '18px 14px',
  color: '#94a3b8',
  fontSize: '13px',
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '14px',
}

const modalStyle = {
  width: '100%',
  maxWidth: '820px',
  maxHeight: '92vh',
  overflow: 'auto',
  background: '#020817',
  border: '1px solid rgba(51,65,85,0.95)',
  borderRadius: '16px',
  boxShadow: '0 20px 80px rgba(0,0,0,0.55)',
}

const modalHeaderStyle = {
  padding: '14px',
  borderBottom: '1px solid rgba(51,65,85,0.85)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
}

const modalBodyStyle = {
  padding: '14px',
}

const previewStyle = {
  background: '#020617',
  border: '1px solid rgba(51,65,85,0.8)',
  borderRadius: '12px',
  padding: '12px',
  color: '#cbd5e1',
  fontSize: '12px',
  lineHeight: 1.5,
  overflowX: 'auto',
}

const initialForm = {
  employee_number: '',
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  position: 'technician',
  hourly_rate: '',
  active: true,
}

const initialZktForm = {
  id: '',
  employee_number: '',
  first_name: '',
  last_name: '',
  zkt_enabled: true,
  zkt_user_id: '',
  zkt_name: '',
  zkt_password: '',
  zkt_card_number: '',
  zkt_privilege: 0,
  zkt_sync_status: '',
  zkt_sync_error: '',
  zkt_synced_at: '',
}

function formatMoney(value) {
  const number = Number(value || 0)
  return `$${number.toFixed(2)}`
}

function getStatusBadgeStyle(active) {
  return active
    ? {
        ...badgeBaseStyle,
        background: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80',
        border: '1px solid rgba(34, 197, 94, 0.35)',
      }
    : {
        ...badgeBaseStyle,
        background: 'rgba(248, 113, 113, 0.12)',
        color: '#f87171',
        border: '1px solid rgba(248, 113, 113, 0.3)',
      }
}

function getZktBadgeStyle(status) {
  if (status === 'synced' || status === 'verified' || status === 'already_exists') {
    return {
      ...badgeBaseStyle,
      background: 'rgba(34,197,94,0.14)',
      color: '#4ade80',
      border: '1px solid rgba(34,197,94,0.35)',
    }
  }

  if (status === 'error' || status === 'missing_on_zkt') {
    return {
      ...badgeBaseStyle,
      background: 'rgba(248,113,113,0.12)',
      color: '#f87171',
      border: '1px solid rgba(248,113,113,0.3)',
    }
  }

  if (status === 'deleted_from_zkt' || status === 'skipped') {
    return {
      ...badgeBaseStyle,
      background: 'rgba(148,163,184,0.12)',
      color: '#cbd5e1',
      border: '1px solid rgba(148,163,184,0.28)',
    }
  }

  return {
    ...badgeBaseStyle,
    background: 'rgba(59,130,246,0.12)',
    color: '#93c5fd',
    border: '1px solid rgba(59,130,246,0.3)',
  }
}

function getZktStatusText(status) {
  if (!status) return 'not synced'

  const map = {
    synced: 'synced',
    verified: 'verified',
    already_exists: 'exists',
    error: 'error',
    missing_on_zkt: 'missing',
    deleted_from_zkt: 'deleted',
    skipped: 'skipped',
  }

  return map[status] || status
}

function buildZktPreview(form) {
  const fullName = `${form.first_name || ''} ${form.last_name || ''}`.trim().slice(0, 24)
  const employeeNumber =
    form.employee_number !== null &&
    form.employee_number !== undefined &&
    String(form.employee_number).trim() !== ''
      ? Number(form.employee_number)
      : ''

  return {
    uid: employeeNumber || '',
    userId: employeeNumber ? String(employeeNumber) : '',
    name: fullName,
    password: form.zkt_password ? String(form.zkt_password) : '',
    privilege:
      form.zkt_privilege !== null &&
      form.zkt_privilege !== undefined &&
      String(form.zkt_privilege).trim() !== ''
        ? Number(form.zkt_privilege)
        : 0,
    cardNo:
      form.zkt_card_number !== null &&
      form.zkt_card_number !== undefined &&
      String(form.zkt_card_number).trim() !== ''
        ? Number(form.zkt_card_number)
        : 0,
  }
}

export default function EmployeesPage() {
  const [form, setForm] = useState(initialForm)
  const [zktForm, setZktForm] = useState(initialZktForm)
  const [zktModalOpen, setZktModalOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingZkt, setSavingZkt] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadEmployees() {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('employee_number', { ascending: true })

      if (error) throw error

      setEmployees(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('loadEmployees error:', err)
      setError(err.message || 'Failed to load employees')
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleZktChange(event) {
    const { name, value, type, checked } = event.target
    setZktForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function resetForm() {
    setForm(initialForm)
    setMessage('')
    setError('')
  }

  function openZktModal(employee) {
    const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()

    setZktForm({
      id: employee.id,
      employee_number: employee.employee_number ?? '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      zkt_enabled: employee.zkt_enabled ?? true,
      zkt_user_id: employee.employee_number ?? '',
      zkt_name: fullName.slice(0, 24),
      zkt_password: employee.zkt_password || '',
      zkt_card_number: employee.zkt_card_number ?? '',
      zkt_privilege: employee.zkt_privilege ?? 0,
      zkt_sync_status: employee.zkt_sync_status || '',
      zkt_sync_error: employee.zkt_sync_error || '',
      zkt_synced_at: employee.zkt_synced_at || '',
    })

    setMessage('')
    setError('')
    setZktModalOpen(true)
  }

  function closeZktModal() {
    setZktModalOpen(false)
    setZktForm(initialZktForm)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setMessage('')
      setError('')

      if (!form.employee_number || !form.first_name || !form.last_name) {
        throw new Error('Employee number, first name and last name are required')
      }

      const employeeNumber = Number(form.employee_number)
      const fullName = `${form.first_name || ''} ${form.last_name || ''}`.trim()

      const payload = {
        employee_number: employeeNumber,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        position: form.position.trim() || null,
        hourly_rate:
          form.hourly_rate === ''
            ? null
            : Number(parseFloat(form.hourly_rate).toFixed(2)),
        active: !!form.active,

        zkt_enabled: true,
        zkt_user_id: employeeNumber,
        zkt_name: fullName.slice(0, 24),
        zkt_password: null,
        zkt_card_number: null,
        zkt_privilege: 0,
        zkt_sync_status: 'pending',
        zkt_sync_error: null,
        zkt_synced_at: null,
      }

      const { error } = await supabase.from('employees').insert([payload])

      if (error) throw error

      setMessage('Employee added successfully. ZKT settings created.')
      setForm(initialForm)
      await loadEmployees()
    } catch (err) {
      console.error('handleSubmit error:', err)
      setError(err.message || 'Failed to add employee')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveZkt(event) {
    event.preventDefault()

    try {
      setSavingZkt(true)
      setMessage('')
      setError('')

      if (!zktForm.id) throw new Error('Employee ID is missing')

      const preview = buildZktPreview(zktForm)

      if (zktForm.zkt_enabled && !preview.uid) {
        throw new Error('Employee number is required because ZKT user ID is created automatically from employee number')
      }

      if (zktForm.zkt_enabled && !preview.name) {
        throw new Error('First name and last name are required because ZKT name is created automatically')
      }

      if (zktForm.zkt_card_number !== '' && Number.isNaN(Number(zktForm.zkt_card_number))) {
        throw new Error('ZKT card number must be numeric')
      }

      const payload = {
        zkt_enabled: !!zktForm.zkt_enabled,
        zkt_user_id: preview.uid ? Number(preview.uid) : null,
        zkt_name: preview.name || null,
        zkt_password: zktForm.zkt_password ? String(zktForm.zkt_password) : null,
        zkt_card_number:
          zktForm.zkt_card_number !== '' &&
          zktForm.zkt_card_number !== null &&
          zktForm.zkt_card_number !== undefined
            ? String(zktForm.zkt_card_number)
            : null,
        zkt_privilege: Number(zktForm.zkt_privilege || 0),
        zkt_sync_status: 'pending',
        zkt_sync_error: null,
        zkt_synced_at: null,
      }

      const { error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', zktForm.id)

      if (error) throw error

      setMessage('ZKT settings saved. Run Sync → ZKT from Dashboard/Bridge page.')
      closeZktModal()
      await loadEmployees()
    } catch (err) {
      console.error('handleSaveZkt error:', err)
      setError(err.message || 'Failed to save ZKT settings')
    } finally {
      setSavingZkt(false)
    }
  }

  async function handleToggleActive(employee) {
    try {
      setError('')
      setMessage('')

      const { error } = await supabase
        .from('employees')
        .update({ active: !employee.active })
        .eq('id', employee.id)

      if (error) throw error

      setMessage(`Employee ${employee.employee_number} status updated`)
      await loadEmployees()
    } catch (err) {
      console.error('handleToggleActive error:', err)
      setError(err.message || 'Failed to update employee status')
    }
  }

  const stats = useMemo(() => {
    const total = employees.length
    const activeCount = employees.filter((row) => row.active).length
    const inactiveCount = total - activeCount
    const zktEnabledCount = employees.filter((row) => row.zkt_enabled).length
    const zktOkCount = employees.filter((row) =>
      ['synced', 'verified', 'already_exists'].includes(row.zkt_sync_status)
    ).length

    return {
      total,
      activeCount,
      inactiveCount,
      zktEnabledCount,
      zktOkCount,
    }
  }, [employees])

  const zktPreview = buildZktPreview(zktForm)

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <div style={headerRowStyle}>
          <div>
            <p
              style={{
                margin: 0,
                color: '#22d3ee',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                lineHeight: 1.2,
              }}
            >
              Payroll / Accounting
            </p>
            <h1 style={titleStyle}>Employees</h1>
            <p style={subtitleStyle}>
              Add workers, assign employee numbers, and configure ZKT user data.
            </p>
          </div>
        </div>

        <div style={statGridStyle}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Total employees</div>
            <div style={statValueStyle}>{stats.total}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>Active</div>
            <div style={{ ...statValueStyle, color: '#4ade80' }}>{stats.activeCount}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>ZKT enabled</div>
            <div style={{ ...statValueStyle, color: '#22d3ee' }}>{stats.zktEnabledCount}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>ZKT ok</div>
            <div style={{ ...statValueStyle, color: '#4ade80' }}>{stats.zktOkCount}</div>
          </div>
        </div>

        <div style={formCardStyle}>
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '16px',
              color: '#f8fafc',
              lineHeight: 1.2,
            }}
          >
            Add employee
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={gridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Employee number *</label>
                <input
                  style={inputStyle}
                  type="number"
                  name="employee_number"
                  value={form.employee_number}
                  onChange={handleChange}
                  placeholder="101"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>First name *</label>
                <input
                  style={inputStyle}
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  placeholder="John"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Last name *</label>
                <input
                  style={inputStyle}
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  placeholder="Smith"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(201) 555-0123"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="worker@simscope.com"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Position</label>
                <select
                  style={selectStyle}
                  name="position"
                  value={form.position}
                  onChange={handleChange}
                >
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="helper">Helper</option>
                  <option value="office">Office</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Hourly rate</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  name="hourly_rate"
                  value={form.hourly_rate}
                  onChange={handleChange}
                  placeholder="32.00"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Status</label>
                <div style={checkboxRowStyle}>
                  <input
                    id="employee-active"
                    type="checkbox"
                    name="active"
                    checked={form.active}
                    onChange={handleChange}
                  />
                  <label htmlFor="employee-active" style={{ color: '#cbd5e1', fontSize: '12px' }}>
                    Active employee
                  </label>
                </div>
              </div>
            </div>

            <div style={actionsRowStyle}>
              <button type="submit" style={primaryButtonStyle} disabled={saving}>
                {saving ? 'Saving...' : 'Add employee'}
              </button>

              <button type="button" style={secondaryButtonStyle} onClick={resetForm}>
                Clear form
              </button>
            </div>

            {error ? <div style={errorTextStyle}>{error}</div> : null}
            {!error && message ? <div style={successTextStyle}>{message}</div> : null}
          </form>
        </div>

        <div style={listCardStyle}>
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(51, 65, 85, 0.85)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '16px',
                color: '#f8fafc',
                lineHeight: 1.2,
              }}
            >
              Employees list
            </h2>
            <div style={infoTextStyle}>
              Use ZKT button to configure exactly what will be sent to the time clock.
            </div>
          </div>

          <div style={tableWrapStyle}>
            {loading ? (
              <div style={emptyStateStyle}>Loading employees...</div>
            ) : employees.length === 0 ? (
              <div style={emptyStateStyle}>No employees yet.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '90px' }}>Employee #</th>
                    <th style={{ ...thStyle, width: '190px' }}>Name</th>
                    <th style={{ ...thStyle, width: '120px' }}>Position</th>
                    <th style={{ ...thStyle, width: '140px' }}>Phone</th>
                    <th style={{ ...thStyle, width: '220px' }}>Email</th>
                    <th style={{ ...thStyle, width: '100px' }}>Hourly rate</th>
                    <th style={{ ...thStyle, width: '90px' }}>Status</th>
                    <th style={{ ...thStyle, width: '110px' }}>ZKT ID</th>
                    <th style={{ ...thStyle, width: '120px' }}>ZKT Status</th>
                    <th style={{ ...thStyle, width: '210px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {employee.employee_number}
                      </td>

                      <td style={tdStyle}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {employee.first_name} {employee.last_name}
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {employee.position || '-'}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {employee.phone || '-'}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {employee.email || '-'}
                      </td>

                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {formatMoney(employee.hourly_rate)}
                      </td>

                      <td style={tdStyle}>
                        <span style={getStatusBadgeStyle(employee.active)}>
                          {employee.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#67e8f9', fontWeight: 800 }}>
                        {employee.zkt_user_id || employee.employee_number || '-'}
                      </td>

                      <td style={tdStyle}>
                        <span style={getZktBadgeStyle(employee.zkt_sync_status)}>
                          {getZktStatusText(employee.zkt_sync_status)}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={zktButtonStyle}
                            onClick={() => openZktModal(employee)}
                          >
                            ZKT card
                          </button>

                          <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() => handleToggleActive(employee)}
                          >
                            {employee.active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {zktModalOpen ? (
          <div style={modalOverlayStyle}>
            <div style={modalStyle}>
              <div style={modalHeaderStyle}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      color: '#f8fafc',
                      lineHeight: 1.2,
                    }}
                  >
                    ZKT employee card
                  </h2>
                  <div style={infoTextStyle}>
                    {zktForm.first_name} {zktForm.last_name} · Employee #{zktForm.employee_number}
                  </div>
                </div>

                <button type="button" style={dangerButtonStyle} onClick={closeZktModal}>
                  Close
                </button>
              </div>

              <div style={modalBodyStyle}>
                <form onSubmit={handleSaveZkt}>
                  <div style={gridStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Send this employee to ZKT</label>
                      <div style={checkboxRowStyle}>
                        <input
                          id="zkt-enabled"
                          type="checkbox"
                          name="zkt_enabled"
                          checked={!!zktForm.zkt_enabled}
                          onChange={handleZktChange}
                        />
                        <label htmlFor="zkt-enabled" style={{ color: '#cbd5e1', fontSize: '12px' }}>
                          Enabled
                        </label>
                      </div>
                    </div>

                    <div style={fieldStyle}>
                      <label style={labelStyle}>ZKT User ID / UID *</label>
                      <input
                        style={{ ...inputStyle, opacity: 0.75, cursor: 'not-allowed' }}
                        type="number"
                        name="zkt_user_id"
                        value={zktPreview.userId}
                        readOnly
                        placeholder="Auto from employee number"
                      />
                    </div>

                    <div style={fieldStyle}>
                      <label style={labelStyle}>Name sent to ZKT</label>
                      <input
                        style={{ ...inputStyle, opacity: 0.75, cursor: 'not-allowed' }}
                        type="text"
                        name="zkt_name"
                        value={zktPreview.name}
                        readOnly
                        placeholder="Auto from first name + last name"
                      />
                    </div>

                    <div style={fieldStyle}>
                      <label style={labelStyle}>ZKT password</label>
                      <input
                        style={inputStyle}
                        type="text"
                        name="zkt_password"
                        value={zktForm.zkt_password}
                        onChange={handleZktChange}
                        placeholder="Optional password/PIN"
                      />
                    </div>

                    <div style={fieldStyle}>
                      <label style={labelStyle}>Card number</label>
                      <input
                        style={inputStyle}
                        type="number"
                        name="zkt_card_number"
                        value={zktForm.zkt_card_number}
                        onChange={handleZktChange}
                        placeholder="RFID card number"
                      />
                    </div>

                    <div style={fieldStyle}>
                      <label style={labelStyle}>Privilege</label>
                      <select
                        style={selectStyle}
                        name="zkt_privilege"
                        value={zktForm.zkt_privilege}
                        onChange={handleZktChange}
                      >
                        <option value="0">0 - User</option>
                        <option value="14">14 - Admin</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                    <div style={labelStyle}>Preview: this is what bridge sends to ZKT</div>
                    <pre style={previewStyle}>
{`zk.setUser(
  ${zktPreview.uid || 'EMPTY_UID'},
  "${zktPreview.userId}",
  "${zktPreview.name}",
  "${zktPreview.password}",
  ${zktPreview.privilege},
  ${zktPreview.cardNo}
)`}
                    </pre>
                  </div>

                  <div style={{ ...previewStyle, marginBottom: '12px' }}>
                    <div>
                      <strong>Status:</strong> {getZktStatusText(zktForm.zkt_sync_status)}
                    </div>
                    <div>
                      <strong>Last synced:</strong> {zktForm.zkt_synced_at || '-'}
                    </div>
                    <div>
                      <strong>Error:</strong> {zktForm.zkt_sync_error || '-'}
                    </div>
                  </div>

                  <div style={actionsRowStyle}>
                    <button type="submit" style={primaryButtonStyle} disabled={savingZkt}>
                      {savingZkt ? 'Saving...' : 'Save ZKT settings'}
                    </button>

                    <button type="button" style={secondaryButtonStyle} onClick={closeZktModal}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
