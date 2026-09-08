import React, { useEffect, useMemo, useState } from 'react'
import { X, Upload, Loader2, Trash2, FileText, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  EMPLOYEE_PHOTO_BUCKET,
  compressEmployeePhoto,
  getEmployeePhotoStoragePath,
} from '../utils/employeePhotos'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

function normalizeShiftType(value) {
  return String(value || 'day').toLowerCase() === 'night' ? 'night' : 'day'
}

function normalizePlantLocation(value) {
  return String(value || 'NJ').toUpperCase() === 'PA' ? 'PA' : 'NJ'
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
}

async function removeEmployeePhotoByUrl(photoUrl) {
  const path = getEmployeePhotoStoragePath(photoUrl)

  if (!path) return

  const { error } = await supabase.storage
    .from(EMPLOYEE_PHOTO_BUCKET)
    .remove([path])

  if (error) throw error
}

async function uploadEmployeePhoto(file, employeeIdOrTemp = 'temp', currentPhotoUrl = '') {
  const compressedPhoto = await compressEmployeePhoto(file)
  const ext = compressedPhoto.extension
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
  const filePath = `employees/${employeeIdOrTemp}/${Date.now()}-${safeName}.${ext}`

  if (employeeIdOrTemp !== 'temp') {
    await removeEmployeePhotoByUrl(currentPhotoUrl)
  }

  const { error: uploadError } = await supabase.storage
    .from(EMPLOYEE_PHOTO_BUCKET)
    .upload(filePath, compressedPhoto.file, {
      cacheControl: '3600',
      upsert: true,
      contentType: compressedPhoto.type,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from(EMPLOYEE_PHOTO_BUCKET)
    .getPublicUrl(filePath)

  if (!data?.publicUrl) {
    throw new Error('Public URL was not created')
  }

  return data.publicUrl
}

export default function EmployeeModal({
  open,
  onClose,
  onSave,
  form,
  setForm,
  saving,
  isEditing,
}) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [w4Open, setW4Open] = useState(false)

  const [companies, setCompanies] = useState([])
  const [companySearch, setCompanySearch] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [companyLoading, setCompanyLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setUploadingPhoto(false)
      setUploadError('')
      setShowCompanyDropdown(false)
      setW4Open(false)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      loadCompanies()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    if (form.employer_form !== 'Other') {
      setCompanySearch('')
      setShowCompanyDropdown(false)
      return
    }

    if (form.company_id && companies.length > 0) {
      const selected = companies.find((c) => c.id === form.company_id)
      if (selected) {
        setCompanySearch(selected.company_name || '')
        return
      }
    }

    if (!form.company_id && form.company_name) {
      setCompanySearch(form.company_name || '')
    }
  }, [open, form.employer_form, form.company_id, form.company_name, companies])

  const filteredCompanies = useMemo(() => {
    const search = String(companySearch || '').trim().toLowerCase()

    if (!search) return companies

    return companies.filter((company) =>
      String(company.company_name || '').toLowerCase().includes(search)
    )
  }, [companies, companySearch])

  const companyExists = useMemo(() => {
    const search = String(companySearch || '').trim().toLowerCase()
    if (!search) return false

    return companies.some(
      (company) =>
        String(company.company_name || '').trim().toLowerCase() === search
    )
  }, [companies, companySearch])

  if (!open) return null

  async function loadCompanies() {
    try {
      setCompanyLoading(true)

      const { data, error } = await supabase
        .from('employee_companies')
        .select('id, company_name, active, created_at')
        .eq('active', true)
        .order('company_name', { ascending: true })

      if (error) throw error

      setCompanies(data || [])
    } catch (err) {
      console.error('loadCompanies error:', err)
    } finally {
      setCompanyLoading(false)
    }
  }

  async function createCompany(name) {
    const cleanName = String(name || '').trim()
    if (!cleanName) return null

    const existing = companies.find(
      (company) =>
        String(company.company_name || '').trim().toLowerCase() ===
        cleanName.toLowerCase()
    )

    if (existing) return existing

    const { data, error } = await supabase
      .from('employee_companies')
      .insert({
        company_name: cleanName,
        active: true,
      })
      .select('id, company_name, active, created_at')
      .single()

    if (error) {
      console.error('createCompany error:', error)
      alert(error.message || 'Failed to create company')
      return null
    }

    setCompanies((prev) =>
      [...prev, data].sort((a, b) =>
        String(a.company_name || '').localeCompare(String(b.company_name || ''))
      )
    )

    return data
  }

  function selectCompany(company) {
    setForm((prev) => ({
      ...prev,
      company_id: company.id,
      company_name: '',
    }))

    setCompanySearch(company.company_name || '')
    setShowCompanyDropdown(false)
  }

  async function handlePhotoUpload(e) {
    try {
      const file = e.target.files?.[0]
      e.target.value = ''

      if (!file) return

      if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('Please select image file')
      }

      setUploadingPhoto(true)
      setUploadError('')

      const photoUrl = await uploadEmployeePhoto(file, form.id || 'temp', form.photo_url)

      if (form.id) {
        const { error } = await supabase
          .from('employees')
          .update({ photo_url: photoUrl })
          .eq('id', form.id)

        if (error) throw error
      }

      setForm((prev) => ({
        ...prev,
        photo_url: photoUrl,
      }))
    } catch (err) {
      console.error('handlePhotoUpload error:', err)
      setUploadError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleDeletePhoto() {
    try {
      setUploadingPhoto(true)
      setUploadError('')

      if (form.id) {
        await removeEmployeePhotoByUrl(form.photo_url)

        const { error } = await supabase
          .from('employees')
          .update({ photo_url: null })
          .eq('id', form.id)

        if (error) throw error
      }

      setForm((prev) => ({
        ...prev,
        photo_url: '',
      }))
    } catch (err) {
      console.error('handleDeletePhoto error:', err)
      setUploadError(err.message || 'Failed to delete photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  function printEmployeeInfo() {
    const employeeName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Employee'
    const companyName = form.company_name || companySearch || ''
    const rows = [
      ['Employee number', form.employee_number],
      ['First name', form.first_name],
      ['Last name', form.last_name],
      ['Phone', form.phone],
      ['Email', form.email],
      ['Position', form.position],
      ['Location', normalizePlantLocation(form.plant_location) === 'PA' ? 'Pennsylvania' : 'New Jersey'],
      ['Hire date', form.hire_date],
      ['Form Employer', form.employer_form],
      ['Company', companyName],
      ['Payment type', form.pay_type],
      ['Hourly rate', form.hourly_rate],
      ['Monthly / one-time amount', form.monthly_salary],
      ['Overtime', form.overtime_enabled ? 'With overtime' : 'No overtime'],
      ['Downtime', form.downtime_enabled === false ? 'No downtime / always 0' : 'Downtime enabled'],
      ['Default lunch', `${form.default_lunch_hours ?? '1'} hour(s)`],
      ['Shift', normalizeShiftType(form.shift_type).toUpperCase()],
      ['Status', form.active ? 'Active' : 'Inactive'],
      ['Excluded from payroll report', form.exclude_from_payroll_report ? 'Yes' : 'No'],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '')

    const w4Rows = [
      ['Federal filing status', form.federal_filing_status || 'single'],
      ['W-4 Step 3 credits', form.federal_w4_step3 ?? '0'],
      ['W-4 Step 4(a) other income', form.federal_w4_step4a ?? '0'],
      ['W-4 Step 4(b) deductions', form.federal_w4_step4b ?? '0'],
      ['W-4 Step 4(c) extra withholding', form.federal_w4_step4c ?? '0'],
      ['NJ-W4 rate', form.nj_withholding_rate || 'A'],
      ['NJ allowances', form.nj_allowances ?? '0'],
      ['NJ additional withholding', form.nj_additional_withholding ?? '0'],
      ['NJ exempt', form.nj_exempt ? 'Yes' : 'No'],
    ]

    const zktRows = [
      ['ZKT enabled', form.zkt_enabled ? 'Yes' : 'No'],
      ['ZKT user ID', form.zkt_user_id],
      ['ZKT name', form.zkt_name],
      ['ZKT password', form.zkt_password],
      ['ZKT card number', form.zkt_card_number],
      ['ZKT privilege', form.zkt_privilege],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '')

    const escapeHtml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')

    const renderRows = (items) =>
      items
        .map(
          ([label, value]) => `
            <tr>
              <th>${escapeHtml(label)}</th>
              <td>${escapeHtml(value)}</td>
            </tr>
          `
        )
        .join('')

    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      alert('Popup blocked. Allow popups for this site and click Print again.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(employeeName)} employee info</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: white; }
    .sheet { max-width: 900px; margin: 0 auto; }
    .header { display: flex; gap: 18px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
    .photo { width: 96px; height: 96px; border: 1px solid #cbd5e1; border-radius: 10px; object-fit: cover; background: #f8fafc; }
    h1 { margin: 0; font-size: 26px; }
    .meta { margin-top: 6px; color: #475569; font-size: 13px; }
    h2 { margin: 18px 0 8px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; vertical-align: top; }
    th { width: 260px; background: #f1f5f9; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media print {
      body { padding: 12px; }
      .sheet { max-width: none; }
      @page { margin: 0.35in; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      ${form.photo_url ? `<img class="photo" src="${escapeHtml(form.photo_url)}" alt="">` : '<div class="photo"></div>'}
      <div>
        <h1>${escapeHtml(employeeName)}</h1>
        <div class="meta">Employee #${escapeHtml(form.employee_number || '-')} · ${escapeHtml(form.position || 'worker')}</div>
        <div class="meta">Printed ${escapeHtml(new Date().toLocaleString('en-US'))}</div>
      </div>
    </div>

    <h2>Worker information</h2>
    <table>${renderRows(rows)}</table>

    <div class="grid">
      <div>
        <h2>W-4 / NJ-W4</h2>
        <table>${renderRows(w4Rows)}</table>
      </div>

      <div>
        <h2>ZKT settings</h2>
        <table>${renderRows(zktRows)}</table>
      </div>
    </div>
  </div>
  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`)
    printWindow.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm">
      <div className="max-h-[98vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditing ? 'Edit employee' : 'Add employee'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Worker information + ZKT device settings
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                onClick={printEmployeeInfo}
                type="button"
                disabled={saving || uploadingPhoto}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer size={16} />
                Print
              </button>
            ) : null}

            <button
              onClick={() => setW4Open((prev) => !prev)}
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                w4Open
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-500 hover:text-white'
              }`}
            >
              <FileText size={16} />
              W4
            </button>

            <button
              onClick={onClose}
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-4 px-4 py-4 pb-10">
          <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
            <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
              <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl border border-slate-700 bg-[#07101d]">
                {form.photo_url ? (
                  <img
                    key={form.photo_url}
                    src={form.photo_url}
                    alt="Employee"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                    No photo
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20">
                  {uploadingPhoto ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadingPhoto ? 'Uploading...' : 'Upload photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploadingPhoto || saving}
                  />
                </label>

                {form.photo_url ? (
                  <button
                    type="button"
                    onClick={handleDeletePhoto}
                    disabled={uploadingPhoto || saving}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete photo
                  </button>
                ) : null}

                {uploadError ? (
                  <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {uploadError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">Employee number</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.employee_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, employee_number: e.target.value }))
                  }
                  placeholder="Employee number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">First name</label>
                <input
                  className={inputClass}
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, first_name: e.target.value }))
                  }
                  placeholder="First name"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Last name</label>
                <input
                  className={inputClass}
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                  placeholder="Last name"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Phone</label>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="Email"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Position</label>
                <input
                  className={inputClass}
                  value={form.position}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, position: e.target.value }))
                  }
                  placeholder="worker"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Location</label>
                <select
                  className={inputClass}
                  value={normalizePlantLocation(form.plant_location)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, plant_location: e.target.value }))
                  }
                >
                  <option value="NJ">New Jersey</option>
                  <option value="PA">Pennsylvania</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Hire date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.hire_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, hire_date: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Form Employer</label>
                <select
                  className={inputClass}
                  value={form.employer_form}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      employer_form: e.target.value,
                      company_id: e.target.value === 'Other' ? prev.company_id || null : null,
                      company_name: '',
                    }))
                  }
                >
                  <option value="W2">W2</option>
                  <option value="1099">1099</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {form.employer_form === 'Other' ? (
                <div className="relative md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-300">Company</label>

                  <input
                    className={inputClass}
                    value={companySearch}
                    onFocus={() => setShowCompanyDropdown(true)}
                    onChange={(e) => {
                      setCompanySearch(e.target.value)
                      setShowCompanyDropdown(true)
                      setForm((prev) => ({ ...prev, company_id: null, company_name: '' }))
                    }}
                    placeholder="Select or create company"
                  />

                  {showCompanyDropdown ? (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1220] shadow-2xl">
                      {companyLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-400">Loading companies...</div>
                      ) : null}

                      {!companyLoading && filteredCompanies.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">No companies found</div>
                      ) : null}

                      {filteredCompanies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => selectCompany(company)}
                          className="block w-full border-b border-slate-800 px-3 py-2 text-left text-sm text-white hover:bg-cyan-500/10"
                        >
                          {company.company_name}
                        </button>
                      ))}

                      {companySearch.trim() && !companyExists ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const created = await createCompany(companySearch)
                            if (!created) return
                            selectCompany(created)
                          }}
                          className="block w-full px-3 py-2 text-left text-sm font-semibold text-cyan-300 hover:bg-cyan-500/10"
                        >
                          + Create &quot;{companySearch.trim()}&quot;
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <p className="mt-1 text-[11px] text-slate-500">
                    Select existing company or create new one. Employee will be linked by company_id.
                  </p>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs text-slate-300">Payment type</label>
                <select
                  className={inputClass}
                  value={form.pay_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, pay_type: e.target.value }))}
                >
                  <option value="hourly">Hourly</option>
                  <option value="monthly">Monthly fixed</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>

              {form.pay_type === 'hourly' ? (
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Hourly rate</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={form.hourly_rate}
                    onChange={(e) => setForm((prev) => ({ ...prev, hourly_rate: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-slate-300">
                    {form.pay_type === 'monthly' ? 'Monthly salary' : 'One-time amount'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClass}
                    value={form.monthly_salary}
                    onChange={(e) => setForm((prev) => ({ ...prev, monthly_salary: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-300">Overtime</label>
                <select
                  className={inputClass}
                  value={form.overtime_enabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, overtime_enabled: e.target.value === 'true' }))
                  }
                >
                  <option value="false">No overtime</option>
                  <option value="true">With overtime</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Default is No overtime. Select With overtime only for workers paid 1.5x after 40h/week.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Downtime</label>
                <select
                  className={inputClass}
                  value={form.downtime_enabled === false ? 'false' : 'true'}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, downtime_enabled: e.target.value === 'true' }))
                  }
                >
                  <option value="true">Downtime enabled</option>
                  <option value="false">No downtime / always 0</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Default is enabled. If disabled, employee work log downtime is saved as 0.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Default lunch</label>
                <select
                  className={inputClass}
                  value={form.default_lunch_hours ?? '1'}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, default_lunch_hours: e.target.value }))
                  }
                >
                  <option value="1">1 hour</option>
                  <option value="0.5">0.5 hour</option>
                  <option value="0">0 hour</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  New work log rows use this lunch value by default.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Shift</label>
                <select
                  className={inputClass}
                  value={normalizeShiftType(form.shift_type)}
                  onChange={(e) => setForm((prev) => ({ ...prev, shift_type: e.target.value }))}
                >
                  <option value="day">DAY 7 AM → 7 PM</option>
                  <option value="night">NIGHT 7 PM → 7 AM</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  If shift stays open over 13 hours, it will show MISSED OUT. No automatic close.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Status</label>
                <select
                  className={inputClass}
                  value={form.active ? 'true' : 'false'}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === 'true' }))}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.exclude_from_payroll_report === true}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, exclude_from_payroll_report: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-[#08101c]"
                  />
                  Exclude from weekly payroll report
                </label>

                <p className="mt-0.5 pl-6 text-[11px] text-slate-500">
                  Employee will not appear in Payroll PDF / CSV.
                </p>
              </div>

              {w4Open ? (
                <div className="md:col-span-2">
                  <div className="mt-2 border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-emerald-300">W-4 / NJ-W4 tax setup</h3>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Defaults are Single, no credits, no extra withholding, NJ Rate A, 0 allowances.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-slate-300">Federal filing status</label>
                        <select
                          className={inputClass}
                          value={form.federal_filing_status || 'single'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, federal_filing_status: e.target.value }))
                          }
                        >
                          <option value="single">Single / Married filing separately</option>
                          <option value="married">Married filing jointly</option>
                          <option value="headOfHousehold">Head of household</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">W-4 Step 3 credits</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={form.federal_w4_step3 ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, federal_w4_step3: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">W-4 Step 4(a) other income</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={form.federal_w4_step4a ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, federal_w4_step4a: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">W-4 Step 4(b) deductions</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={form.federal_w4_step4b ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, federal_w4_step4b: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">W-4 Step 4(c) extra withholding</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={form.federal_w4_step4c ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, federal_w4_step4c: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">NJ-W4 rate</label>
                        <select
                          className={inputClass}
                          value={form.nj_withholding_rate || 'A'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, nj_withholding_rate: e.target.value }))
                          }
                        >
                          <option value="A">Rate A</option>
                          <option value="B">Rate B</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">NJ allowances</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          className={inputClass}
                          value={form.nj_allowances ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, nj_allowances: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-slate-300">NJ additional withholding</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={form.nj_additional_withholding ?? '0'}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, nj_additional_withholding: e.target.value }))
                          }
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                        <input
                          type="checkbox"
                          checked={form.nj_exempt === true}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, nj_exempt: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-slate-600 bg-[#08101c]"
                        />
                        NJ exempt from state income tax withholding
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 border-t border-slate-800 pt-3 md:col-span-2">
                <h3 className="text-sm font-bold text-cyan-300">ZKT settings</h3>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT enabled</label>
                <select
                  className={inputClass}
                  value={form.zkt_enabled ? 'true' : 'false'}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_enabled: e.target.value === 'true' }))}
                >
                  <option value="true">Yes - send to ZKT</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT user ID</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.zkt_user_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_user_id: e.target.value }))}
                  placeholder="Usually same as employee number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT name</label>
                <input
                  className={inputClass}
                  value={form.zkt_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_name: e.target.value }))}
                  placeholder="Max 24 chars"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT password</label>
                <input
                  className={inputClass}
                  value={form.zkt_password}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_password: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT card number</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.zkt_card_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_card_number: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT privilege</label>
                <select
                  className={inputClass}
                  value={form.zkt_privilege}
                  onChange={(e) => setForm((prev) => ({ ...prev, zkt_privilege: e.target.value }))}
                >
                  <option value="0">0 - User</option>
                  <option value="14">14 - Admin</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
