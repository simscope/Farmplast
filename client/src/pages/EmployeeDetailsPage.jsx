import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100
}

// 🔥 расчет часов (12h max + обед)
function calculateHours(timeIn, timeOut, lunch = 1) {
  if (!timeIn || !timeOut) return 0

  const start = new Date(`1970-01-01T${timeIn}`)
  const end = new Date(`1970-01-01T${timeOut}`)

  let hours = (end - start) / (1000 * 60 * 60)
  if (hours < 0) hours += 24

  const capped = Math.min(hours, 12)
  let result = capped - lunch

  if (result < 0) result = 0

  return round2(result)
}

// 🔥 без overtime (макс 40)
function applyWeeklyLimit(weekUsed, todayHours) {
  const remain = Math.max(0, 40 - weekUsed)
  return Math.min(todayHours, remain)
}

// 💰 расчет оплаты (только employee tax)
function calculatePay(hours, rate, employeeTaxPercent) {
  const gross = round2(hours * rate)
  const tax = round2((gross * employeeTaxPercent) / 100)
  const net = round2(gross - tax)

  return { gross, tax, net }
}

export default function EmployeeDetailsPage({ employeeId }) {
  const [logs, setLogs] = useState([])
  const [employee, setEmployee] = useState(null)

  const [employeeTax, setEmployeeTax] = useState(10)

  const [rent, setRent] = useState(0)
  const [electric, setElectric] = useState(0)
  const [water, setWater] = useState(0)
  const [clean, setClean] = useState(0)
  const [transport, setTransport] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()

    const { data: logData } = await supabase
      .from('employee_work_logs')
      .select('*')
      .eq('employee_id', employeeId)
      .order('work_date', { ascending: false })

    setEmployee(emp)
    setLogs(logData || [])
  }

  const calculated = useMemo(() => {
    let weekHours = 0

    const rows = logs.map((row) => {
      const h = calculateHours(row.time_in, row.time_out, row.lunch || 1)
      const limited = applyWeeklyLimit(weekHours, h)

      weekHours += limited

      const pay = calculatePay(
        limited,
        employee?.hourly_rate || 0,
        employeeTax
      )

      return {
        ...row,
        hours: limited,
        ...pay,
      }
    })

    const totalHours = rows.reduce((s, r) => s + r.hours, 0)
    const gross = rows.reduce((s, r) => s + r.gross, 0)
    const tax = rows.reduce((s, r) => s + r.tax, 0)

    const other =
      Number(rent) +
      Number(electric) +
      Number(water) +
      Number(clean) +
      Number(transport)

    const net = gross - tax - other

    return {
      rows,
      totalHours: round2(totalHours),
      gross: round2(gross),
      tax: round2(tax),
      net: round2(net),
    }
  }, [logs, employee, employeeTax, rent, electric, water, clean, transport])

  return (
    <div style={{ padding: 20, color: '#fff', background: '#020617', minHeight: '100vh' }}>
      <h2 style={{ marginBottom: 10 }}>
        {employee?.first_name} {employee?.last_name}
      </h2>

      {/* LOG TABLE */}
      <table style={{ width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>In</th>
            <th>Out</th>
            <th>Hours</th>
            <th>Gross</th>
            <th>Tax</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {calculated.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.work_date}</td>
              <td>{r.time_in}</td>
              <td>{r.time_out}</td>
              <td>{r.hours}</td>
              <td>${r.gross}</td>
              <td>${r.tax}</td>
              <td>${r.net}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* DEDUCTIONS */}
      <div style={{ marginTop: 20 }}>
        <h3>Deductions</h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input placeholder="Employee tax %" value={employeeTax} onChange={(e) => setEmployeeTax(e.target.value)} />
          <input placeholder="Rent" value={rent} onChange={(e) => setRent(e.target.value)} />
          <input placeholder="Electric" value={electric} onChange={(e) => setElectric(e.target.value)} />
          <input placeholder="Water" value={water} onChange={(e) => setWater(e.target.value)} />
          <input placeholder="Clean" value={clean} onChange={(e) => setClean(e.target.value)} />
          <input placeholder="Transport" value={transport} onChange={(e) => setTransport(e.target.value)} />
        </div>
      </div>

      {/* TOTAL */}
      <div style={{ marginTop: 20 }}>
        <h3>Summary</h3>
        <p>Total Hours: {calculated.totalHours}</p>
        <p>Gross Pay: ${calculated.gross}</p>
        <p>Employee Tax: ${calculated.tax}</p>
        <p style={{ fontWeight: 'bold', fontSize: 18 }}>
          Net Pay: ${calculated.net}
        </p>
      </div>
    </div>
  )
}
