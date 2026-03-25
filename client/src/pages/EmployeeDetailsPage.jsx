import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  DollarSign,
  Plus,
  Printer,
  Trash2,
  Wallet,
  User,
  Hash,
  CheckCircle2,
  Upload,
  Loader2,
  Save,
  BadgeDollarSign,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const pageCard =
  'rounded-2xl border border-slate-800 bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.25)]'

const darkInput =
  'w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-cyan-500'

function money(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2)}`
}

function formatDate(value) {
  if (!value) return '—'
  return value
}

function calcHours(timeIn, timeOut, lunchHours) {
  if (!timeIn || !timeOut) return 0

  const [inH, inM] = String(timeIn).split(':').map(Number)
  const [outH, outM] = String(timeOut).split(':').map(Number)

  if (
    Number.isNaN(inH) ||
    Number.isNaN(inM) ||
    Number.isNaN(outH) ||
    Number.isNaN(outM)
  ) {
    return 0
  }

  const start = inH * 60 + inM
  const end = outH * 60 + outM

  if (end <= start) return 0

  const lunch = Number(lunchHours || 0)
  const totalHours = (end - start) / 60 - lunch

  return totalHours > 0 ? Number(totalHours.toFixed(2)) : 0
}

function buildEmptyRow() {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: new Date().toISOString().slice(0, 10),
    time_in: '',
    time_out: '',
    lunch_hours: '0',
    reg_hours: '0',
    labor_amount: '0',
  }
}

function getSaturdayToFridayRange(baseDate = new Date()) {
  const d = new Date(baseDate)
  const day = d.getDay()

  const distanceToSaturday = day === 6 ? 0 : day + 1
  const saturday = new Date(d)
  saturday.setHours(0, 0, 0, 0)
  saturday.setDate(d.getDate() - distanceToSaturday)

  const friday = new Date(saturday)
  friday.setDate(saturday.getDate() + 6)

  return {
    start: saturday.toISOString().slice(0, 10),
    end: friday.toISOString().slice(0, 10),
  }
}

function numberToWordsUnder1000(n) {
  const ones = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ]

  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ]

  if (n < 20) return ones[n]
  if (n < 100) {
    const ten = Math.floor(n / 10)
    const rest = n % 10
    return rest ? `${tens[ten]}-${ones[rest]}` : tens[ten]
  }

  const hundred = Math.floor(n / 100)
  const rest = n % 100
  return rest
    ? `${ones[hundred]} hundred ${numberToWordsUnder1000(rest)}`
    : `${ones[hundred]} hundred`
}

function numberToWords(n) {
  const num = Math.floor(Number(n || 0))

  if (num === 0) return 'zero'
  if (num < 1000) return numberToWordsUnder1000(num)

  if (num < 1000000) {
    const thousands = Math.floor(num / 1000)
    const rest = num % 1000
    return rest
      ? `${numberToWordsUnder1000(thousands)} thousand ${numberToWordsUnder1000(rest)}`
      : `${numberToWordsUnder1000(thousands)} thousand`
  }

  const millions = Math.floor(num / 1000000)
  const rest = num % 1000000
  if (rest === 0) return `${numberToWords(millions)} million`
  return `${numberToWords(millions)} million ${numberToWords(rest)}`
}

function amountToWords(amount) {
  const value = Number(amount || 0)
  const dollars = Math.floor(value)
  const cents = Math.round((value - dollars) * 100)
  return `${numberToWords(dollars)} dollars and ${String(cents).padStart(2, '0')}/100`
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const currentWeek = getSaturdayToFridayRange()

  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [periodStart, setPeriodStart] = useState(currentWeek.start)
  const [periodEnd, setPeriodEnd] = useState(currentWeek.end)

  const [tax, setTax] = useState('0')
  const [rent, setRent] = useState('0')
  const [electric, setElectric] = useState('0')
  const [water, setWater] = useState('0')
  const [clean, setClean] = useState('0')
  const [transport, setTransport] = useState('0')

  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    employee_number: '',
    phone: '',
    email: '',
    position: '',
    status: 'active',
    pay_type: 'hourly',
    hourly_rate: '',
    monthly_salary: '',
    hire_date: '',
    employer_form: 'W2',
    photo_url: '',
  })

  useEffect(() => {
    loadPage()
  }, [id])

  async function loadPage() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (employeeError) throw employeeError

      if (!employeeData) {
        setEmployee(null)
        setLogs([])
        setError('Employee not found')
        return
      }

      setEmployee(employeeData)
      setProfileForm({
        first_name: employeeData.first_name ?? '',
        last_name: employeeData.last_name ?? '',
        employee_number: employeeData.employee_number ?? '',
        phone: employeeData.phone ?? '',
        email: employeeData.email ?? '',
        position: employeeData.position ?? 'worker',
        status: employeeData.status ?? 'active',
        pay_type: employeeData.pay_type ?? 'hourly',
        hourly_rate:
          employeeData.hourly_rate !== null && employeeData.hourly_rate !== undefined
            ? String(employeeData.hourly_rate)
            : '',
        monthly_salary:
          employeeData.monthly_salary !== null &&
          employeeData.monthly_salary !== undefined
            ? String(employeeData.monthly_salary)
            : '',
        hire_date: employeeData.hire_date ?? '',
        employer_form: employeeData.employer_form ?? 'W2',
        photo_url: employeeData.photo_url ?? '',
      })

      const { data: logsData, error: logsError } = await supabase
        .from('employee_work_logs')
        .select('*')
        .eq('employee_id', id)
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (logsError) {
        console.error('employee_work_logs load error:', logsError)
        setLogs([])
      } else {
        setLogs(logsData || [])
      }
    } catch (err) {
      console.error('loadPage error:', err)
      setError(err.message || 'Failed to load employee page')
    } finally {
      setLoading(false)
    }
  }

  function setCurrentWeek() {
    const range = getSaturdayToFridayRange()
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
  }

  function addRow() {
    setLogs((prev) => [buildEmptyRow(), ...prev])
  }

  function updateRowValue(rowId, field, value) {
    setLogs((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [field]: value }

        const computedHours = calcHours(
          nextRow.time_in,
          nextRow.time_out,
          nextRow.lunch_hours
        )

        const hourlyRate =
          employee?.pay_type === 'hourly' ? Number(employee?.hourly_rate || 0) : 0

        if (field === 'time_in' || field === 'time_out' || field === 'lunch_hours') {
          nextRow.reg_hours = String(computedHours)

          if (employee?.pay_type === 'hourly') {
            nextRow.labor_amount = String(Number((computedHours * hourlyRate).toFixed(2)))
          }
        }

        if (field === 'reg_hours' && employee?.pay_type === 'hourly') {
          const reg = Number(value || 0)
          nextRow.labor_amount = String(Number((reg * hourlyRate).toFixed(2)))
        }

        return nextRow
      })
    )
  }

  async function saveRow(row) {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      if (!row.work_date) {
        setError('Date is required')
        return
      }

      const payload = {
        employee_id: id,
        work_date: row.work_date,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        lunch_hours: Number(row.lunch_hours || 0),
        reg_hours: Number(row.reg_hours || 0),
        labor_amount: Number(row.labor_amount || 0),
      }

      if (String(row.id).startsWith('new-')) {
        const { error } = await supabase.from('employee_work_logs').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_work_logs')
          .update(payload)
          .eq('id', row.id)

        if (error) throw error
      }

      setSuccess('Row saved')
      await loadPage()
    } catch (err) {
      console.error('saveRow error:', err)
      setError(err.message || 'Failed to save row')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row) {
    try {
      setError('')
      setSuccess('')

      if (String(row.id).startsWith('new-')) {
        setLogs((prev) => prev.filter((item) => item.id !== row.id))
        return
      }

      const ok = window.confirm('Delete this work row?')
      if (!ok) return

      const { error } = await supabase
        .from('employee_work_logs')
        .delete()
        .eq('id', row.id)

      if (error) throw error

      setSuccess('Row deleted')
      await loadPage()
    } catch (err) {
      console.error('deleteRow error:', err)
      setError(err.message || 'Failed to delete row')
    }
  }

  async function handlePhotoUpload(e) {
    try {
      const file = e.target.files?.[0]
      if (!file) return

      setUploadingPhoto(true)
      setError('')
      setSuccess('')

      const ext = file.name.split('.').pop() || 'jpg'
      const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
      const filePath = `employees/${id}/${Date.now()}-${safeName}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage
        .from('employee-photos')
        .getPublicUrl(filePath)

      setProfileForm((prev) => ({
        ...prev,
        photo_url: publicData?.publicUrl || '',
      }))

      setSuccess('Photo uploaded. Click "Save profile" to save employee card.')
    } catch (err) {
      console.error('handlePhotoUpload error:', err)
      setError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function saveProfile() {
    try {
      setProfileSaving(true)
      setError('')
      setSuccess('')

      if (!profileForm.first_name.trim()) {
        setError('First name is required')
        return
      }

      if (!profileForm.last_name.trim()) {
        setError('Last name is required')
        return
      }

      if (!String(profileForm.employee_number).trim()) {
        setError('Employee number is required')
        return
      }

      if (profileForm.pay_type === 'hourly' && !String(profileForm.hourly_rate).trim()) {
        setError('Hourly rate is required')
        return
      }

      if (
        profileForm.pay_type === 'monthly' &&
        !String(profileForm.monthly_salary).trim()
      ) {
        setError('Monthly salary is required')
        return
      }

      const payload = {
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        employee_number: String(profileForm.employee_number).trim(),
        phone: profileForm.phone.trim() || null,
        email: profileForm.email.trim() || null,
        position: profileForm.position.trim() || 'worker',
        status: profileForm.status || 'active',
        pay_type: profileForm.pay_type || 'hourly',
        hourly_rate:
          profileForm.pay_type === 'hourly'
            ? Number(profileForm.hourly_rate || 0)
            : null,
        monthly_salary:
          profileForm.pay_type === 'monthly'
            ? Number(profileForm.monthly_salary || 0)
            : null,
        hire_date: profileForm.hire_date || null,
        employer_form: profileForm.employer_form || null,
        photo_url: profileForm.photo_url || null,
      }

      const { error: updateError } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id)

      if (updateError) throw updateError

      setSuccess('Employee profile saved')
      await loadPage()
    } catch (err) {
      console.error('saveProfile error:', err)
      setError(err.message || 'Failed to save employee profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((row) => {
      if (!row.work_date) return true
      if (periodStart && row.work_date < periodStart) return false
      if (periodEnd && row.work_date > periodEnd) return false
      return true
    })
  }, [logs, periodStart, periodEnd])

  const totals = useMemo(() => {
    const totalReg = filteredLogs.reduce(
      (sum, row) => sum + Number(row.reg_hours || 0),
      0
    )

    const totalLabor = filteredLogs.reduce(
      (sum, row) => sum + Number(row.labor_amount || 0),
      0
    )

    const taxNum = Number(tax || 0)
    const rentNum = Number(rent || 0)
    const electricNum = Number(electric || 0)
    const waterNum = Number(water || 0)
    const cleanNum = Number(clean || 0)
    const transportNum = Number(transport || 0)

    const deductions =
      taxNum + rentNum + electricNum + waterNum + cleanNum + transportNum

    const netPay = totalLabor - deductions

    return {
      totalReg,
      totalLabor,
      taxNum,
      rentNum,
      electricNum,
      waterNum,
      cleanNum,
      transportNum,
      netPay,
    }
  }, [filteredLogs, tax, rent, electric, water, clean, transport])

  const fullName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || '—'

  const checkWords = amountToWords(totals.netPay)

  async function handlePayAndPrint() {
    try {
      setPaying(true)
      setError('')
      setSuccess('')

      const netPay = Number(totals.netPay || 0)

      if (netPay <= 0) {
        setError('Net pay must be greater than 0')
        return
      }

      const today = new Date().toISOString().slice(0, 10)

      const { error: paymentError } = await supabase.from('employee_payments').insert({
        employee_id: id,
        period_start: periodStart,
        period_end: periodEnd,
        total_labor: Number(totals.totalLabor || 0),
        tax: Number(totals.taxNum || 0),
        rent: Number(totals.rentNum || 0),
        electric: Number(totals.electricNum || 0),
        water: Number(totals.waterNum || 0),
        clean: Number(totals.cleanNum || 0),
        transport: Number(totals.transportNum || 0),
        net_pay: netPay,
      })

      if (paymentError) throw paymentError

      const { error: employeeUpdateError } = await supabase
        .from('employees')
        .update({
          last_payment_date: today,
          last_payment_amount: netPay,
        })
        .eq('id', id)

      if (employeeUpdateError) throw employeeUpdateError

      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              last_payment_date: today,
              last_payment_amount: netPay,
            }
          : prev
      )

      setSuccess('Payment saved')
      setTimeout(() => {
        window.print()
      }, 200)
    } catch (err) {
      console.error('handlePayAndPrint error:', err)
      setError(err.message || 'Failed to save payment')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white print:bg-white print:text-black">
      <style>{`
        @page {
          size: auto;
          margin: 0;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .real-check-print,
          .real-check-print * {
            visibility: visible;
          }

          .real-check-print {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            min-height: 100vh;
            background: white;
            color: black;
            z-index: 9999;
          }

          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap gap-3 print-hide">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-cyan-500"
          >
            <ArrowLeft size={18} />
            Back to dashboard
          </Link>

          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500"
          >
            <Plus size={18} />
            Add row
          </button>

          <button
            onClick={setCurrentWeek}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600/10 px-4 py-3 font-semibold text-emerald-300 transition hover:bg-emerald-600/20"
          >
            <CalendarDays size={18} />
            Set Current Week
          </button>

          <button
            onClick={handlePayAndPrint}
            disabled={paying}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
          >
            <Printer size={18} />
            {paying ? 'Paying...' : 'Pay & Print Check'}
          </button>
        </div>

        {loading ? (
          <div className={`${pageCard} p-10 text-center text-slate-400`}>
            Loading employee...
          </div>
        ) : error && !employee ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`${pageCard} p-6 print-hide`}>
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Employee profile</h2>
                  <p className="text-slate-400">
                    Photo, hire date, employer form and payment settings
                  </p>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
                  <div className="mx-auto h-48 w-48 overflow-hidden rounded-3xl border border-slate-700 bg-[#07101d]">
                    {profileForm.photo_url ? (
                      <img
                        src={profileForm.photo_url}
                        alt={fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                        No photo
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-500/20">
                      {uploadingPhoto ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Upload size={18} />
                      )}
                      {uploadingPhoto ? 'Uploading...' : 'Upload photo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                        disabled={uploadingPhoto}
                      />
                    </label>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      SPEEDFace V5L photo or manual upload
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Employee #</label>
                    <input
                      type="text"
                      value={profileForm.employee_number}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          employee_number: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Status</label>
                    <select
                      value={profileForm.status}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }))
                      }
                      className={darkInput}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">First name</label>
                    <input
                      type="text"
                      value={profileForm.first_name}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Last name</label>
                    <input
                      type="text"
                      value={profileForm.last_name}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Phone</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Email</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Position</label>
                    <input
                      type="text"
                      value={profileForm.position}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          position: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Hire date</label>
                    <input
                      type="date"
                      value={profileForm.hire_date}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          hire_date: e.target.value,
                        }))
                      }
                      className={darkInput}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Form Employer</label>
                    <select
                      value={profileForm.employer_form}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          employer_form: e.target.value,
                        }))
                      }
                      className={darkInput}
                    >
                      <option value="W2">W2</option>
                      <option value="1099">1099</option>
                      <option value="Cash">Cash</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Payment type</label>
                    <select
                      value={profileForm.pay_type}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          pay_type: e.target.value,
                        }))
                      }
                      className={darkInput}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  {profileForm.pay_type === 'hourly' ? (
                    <div>
                      <label className="mb-2 block text-sm text-slate-300">Hourly rate</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={profileForm.hourly_rate}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            hourly_rate: e.target.value,
                          }))
                        }
                        className={darkInput}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-2 block text-sm text-slate-300">Monthly salary</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={profileForm.monthly_salary}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            monthly_salary: e.target.value,
                          }))
                        }
                        className={darkInput}
                      />
                    </div>
                  )}

                  <div className="md:col-span-2 flex justify-end pt-2">
                    <button
                      onClick={saveProfile}
                      disabled={profileSaving || uploadingPhoto}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                    >
                      <Save size={18} />
                      {profileSaving ? 'Saving...' : 'Save profile'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${pageCard} p-6 print-hide`}>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white">{fullName}</h1>
                  <p className="mt-2 text-slate-400">
                    Weekly payroll card. Default week is Saturday → Friday.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Hash size={16} />
                      Employee #
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {employee?.employee_number ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <User size={16} />
                      Name
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">{fullName}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Wallet size={16} />
                      Pay type
                    </div>
                    <div className="mt-2 text-xl font-bold capitalize text-white">
                      {employee?.pay_type || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <BadgeDollarSign size={16} />
                      Employer form
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {employee?.employer_form || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <CalendarDays size={16} />
                      Hire date
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {formatDate(employee?.hire_date)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSign size={16} />
                      Rate / Salary
                    </div>
                    <div className="mt-2 text-xl font-bold text-cyan-300">
                      {employee?.pay_type === 'monthly'
                        ? money(employee?.monthly_salary)
                        : money(employee?.hourly_rate)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <CheckCircle2 size={16} />
                      Last payment date
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {formatDate(employee?.last_payment_date)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                    <div className="flex items-center gap-2 text-slate-400">
                      <DollarSign size={16} />
                      Last payment amount
                    </div>
                    <div className="mt-2 text-xl font-bold text-emerald-300">
                      {money(employee?.last_payment_amount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Period start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Period end</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock3 size={16} />
                    Total reg
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    {totals.totalReg.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <DollarSign size={16} />
                    Total labor
                  </div>
                  <div className="mt-2 text-2xl font-bold text-cyan-300">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-600/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Wallet size={16} />
                    Net Pay
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 print-hide">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300 print-hide">
                {success}
              </div>
            ) : null}

            <div className={`${pageCard} overflow-hidden print-hide`}>
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Work log</h2>
                    <p className="text-slate-400">Date, time, lunch, reg, labor</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[1fr_0.95fr_0.95fr_0.8fr_0.8fr_0.95fr_0.8fr] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
                    <div>Date</div>
                    <div>Time In</div>
                    <div>Time Out</div>
                    <div>Lunch</div>
                    <div>Reg</div>
                    <div>Labor</div>
                    <div>Delete</div>
                  </div>

                  {logs.length === 0 ? (
                    <div className="bg-[#0b1220] px-4 py-10 text-center text-slate-400">
                      No rows yet. Click "Add row".
                    </div>
                  ) : (
                    logs.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_0.95fr_0.95fr_0.8fr_0.8fr_0.95fr_0.8fr] items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-3"
                      >
                        <input
                          type="date"
                          value={row.work_date || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'work_date', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="time"
                          value={row.time_in || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'time_in', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="time"
                          value={row.time_out || ''}
                          onChange={(e) =>
                            updateRowValue(row.id, 'time_out', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.lunch_hours ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'lunch_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.reg_hours ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'reg_hours', e.target.value)
                          }
                          className={darkInput}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.labor_amount ?? '0'}
                          onChange={(e) =>
                            updateRowValue(row.id, 'labor_amount', e.target.value)
                          }
                          className={darkInput}
                        />

                        <div className="flex gap-2">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={saving}
                            className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                          >
                            Save
                          </button>

                          <button
                            onClick={() => deleteRow(row)}
                            className="rounded-xl border border-red-500/30 bg-red-600/10 px-3 py-2 text-red-300 transition hover:bg-red-600/20"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={`${pageCard} p-6 print-hide`}>
              <h2 className="mb-5 text-2xl font-bold text-white">Deductions</h2>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Tax</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Rent</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Electric</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={electric}
                    onChange={(e) => setElectric(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Water</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={water}
                    onChange={(e) => setWater(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Clean</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={clean}
                    onChange={(e) => setClean(e.target.value)}
                    className={darkInput}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Transport</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    className={darkInput}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="text-sm text-slate-400">Total labor</div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    {money(totals.totalLabor)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
                  <div className="text-sm text-slate-400">Total deductions</div>
                  <div className="mt-2 text-2xl font-bold text-red-300">
                    {money(
                      totals.taxNum +
                        totals.rentNum +
                        totals.electricNum +
                        totals.waterNum +
                        totals.cleanNum +
                        totals.transportNum
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-600/10 p-4 xl:col-span-2">
                  <div className="text-sm text-emerald-300">Net Pay</div>
                  <div className="mt-2 text-3xl font-bold text-emerald-200">
                    {money(totals.netPay)}
                  </div>
                </div>
              </div>
            </div>

            <div className="real-check-print">
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: '100vh',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '0.45in',
                    right: '0.7in',
                    fontSize: '16pt',
                    fontWeight: 600,
                    color: '#000',
                  }}
                >
                  {new Date().toISOString().slice(0, 10)}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    top: '1.18in',
                    left: '0.9in',
                    fontSize: '18pt',
                    fontWeight: 600,
                    color: '#000',
                  }}
                >
                  {fullName}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    top: '1.18in',
                    right: '0.7in',
                    fontSize: '18pt',
                    fontWeight: 700,
                    color: '#000',
                  }}
                >
                  {money(totals.netPay)}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    top: '1.68in',
                    left: '0.9in',
                    width: '7.1in',
                    fontSize: '14pt',
                    fontWeight: 500,
                    color: '#000',
                    textTransform: 'capitalize',
                  }}
                >
                  {checkWords}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    top: '2.28in',
                    left: '1.05in',
                    fontSize: '12pt',
                    color: '#000',
                  }}
                >
                  Payroll {periodStart} - {periodEnd}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
