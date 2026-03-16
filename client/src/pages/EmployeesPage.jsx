import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(20,184,166,0.18), transparent 28%), #020817',
  color: '#e5eefb',
  padding: '32px 20px 48px',
  fontFamily: 'Arial, sans-serif',
}

const wrapperStyle = {
  maxWidth: '1400px',
  margin: '0 auto',
}

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '16px',
  flexWrap: 'wrap',
  marginBottom: '24px',
}

const titleStyle = {
  margin: 0,
  fontSize: '42px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: '#f8fafc',
}

const subtitleStyle = {
  marginTop: '8px',
  marginBottom: 0,
  color: '#94a3b8',
  fontSize: '15px',
}

const cardStyle = {
  background: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(51, 65, 85, 0.7)',
  borderRadius: '22px',
  boxShadow: '0 12px 40px rgba(2, 8, 23, 0.45)',
}

const formCardStyle = {
  ...cardStyle,
  padding: '22px',
  marginBottom: '22px',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
  marginBottom: '16px',
}

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const labelStyle = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#cbd5e1',
  letterSpacing: '0.02em',
}

const inputStyle = {
  width: '100%',
  borderRadius: '12px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '12px 14px',
  fontSize: '14px',
  outline: 'none',
}

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

const checkboxRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  paddingTop: '8px',
}

const actionsRowStyle = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  marginTop: '8px',
}

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, #2563eb, #14b8a6)',
  color: '#ffffff',
  padding: '12px 18px',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  border: '1px solid #334155',
  borderRadius: '12px',
  background: '#0f172a',
  color: '#e2e8f0',
  padding: '12px 18px',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
}

const statGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '14px',
  marginBottom: '22px',
}

const statCardStyle = {
  ...cardStyle,
  padding: '18px',
}

const statLabelStyle = {
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#64748b',
  fontWeight: 800,
  letterSpacing: '0.08em',
  marginBottom: '10px',
}

const statValueStyle = {
  fontSize: '34px',
  fontWeight: 800,
  color: '#f8fafc',
  lineHeight: 1,
}

const listCardStyle = {
  ...cardStyle,
  overflow: 'hidden',
}

const tableWrapStyle = {
  overflowX: 'auto',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '980px',
}

const thStyle = {
  textAlign: 'left',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: '#94a3b8',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(51, 65, 85, 0.8)',
  background: 'rgba(15, 23, 42, 0.98)',
}

const tdStyle = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(30, 41, 59, 0.9)',
  fontSize: '14px',
  color: '#e2e8f0',
  verticalAlign: 'top',
}

const badgeBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '88px',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.03em',
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

const infoTextStyle = {
  marginTop: '10px',
  fontSize: '14px',
  color: '#94a3b8',
}

const errorTextStyle = {
  marginTop: '10px',
  fontSize: '14px',
  color: '#f87171',
  fontWeight: 700,
}

const successTextStyle = {
  marginTop: '10px',
  fontSize: '14px',
  color: '#4ade80',
  fontWeight: 700,
}

const emptyStateStyle = {
  padding: '26px 18px',
  color: '#94a3b8',
  fontSize: '15px',
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

function formatMoney(value) {
  const number = Number(value || 0)
  return `$${number.toFixed(2)}`
}

export default function EmployeesPage() {
  const [form, setForm] = useState(initialForm)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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

  function resetForm() {
    setForm(initialForm)
    setMessage('')
    setError('')
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

      const payload = {
        employee_number: Number(form.employee_number),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        position: form.position.trim() || null,
        hourly_rate:
          form.hourly_rate === '' ? null : Number(parseFloat(form.hourly_rate).toFixed(2)),
        active: !!form.active,
      }

      const { error } = await supabase.from('employees').insert([payload])

      if (error) throw error

      setMessage('Employee added successfully')
      setForm(initialForm)
      await loadEmployees()
    } catch (err) {
      console.error('handleSubmit error:', err)
      setError(err.message || 'Failed to add employee')
    } finally {
      setSaving(false)
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
    const avgRate =
      total > 0
        ? employees.reduce((sum, row) => sum + Number(row.hourly_rate || 0), 0) / total
        : 0

    return {
      total,
      activeCount,
      inactiveCount,
      avgRate,
    }
  }, [employees])

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <div style={headerRowStyle}>
          <div>
            <p
              style={{
                margin: 0,
                color: '#22d3ee',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Payroll / Accounting
            </p>
            <h1 style={titleStyle}>Employees</h1>
            <p style={subtitleStyle}>
              Add workers, assign employee numbers, and prepare the base for time tracking and payroll.
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
            <div style={statLabelStyle}>Inactive</div>
            <div style={{ ...statValueStyle, color: '#f87171' }}>{stats.inactiveCount}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>Avg hourly rate</div>
            <div style={statValueStyle}>{formatMoney(stats.avgRate)}</div>
          </div>
        </div>

        <div style={formCardStyle}>
          <h2
            style={{
              marginTop: 0,
              marginBottom: '18px',
              fontSize: '22px',
              color: '#f8fafc',
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
                  <label htmlFor="employee-active" style={{ color: '#cbd5e1', fontSize: '14px' }}>
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
              padding: '18px 20px',
              borderBottom: '1px solid rgba(51, 65, 85, 0.85)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '22px',
                color: '#f8fafc',
              }}
            >
              Employees list
            </h2>
            <div style={infoTextStyle}>
              All workers with employee numbers. This list will be used later for time tracking and payroll.
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
                    <th style={thStyle}>Employee #</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Position</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Hourly rate</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td style={tdStyle}>{employee.employee_number}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                          {employee.first_name} {employee.last_name}
                        </div>
                      </td>
                      <td style={tdStyle}>{employee.position || '-'}</td>
                      <td style={tdStyle}>{employee.phone || '-'}</td>
                      <td style={tdStyle}>{employee.email || '-'}</td>
                      <td style={tdStyle}>
                        {employee.hourly_rate == null ? '-' : formatMoney(employee.hourly_rate)}
                      </td>
                      <td style={tdStyle}>
                        <span style={getStatusBadgeStyle(employee.active)}>
                          {employee.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => handleToggleActive(employee)}
                        >
                          {employee.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
