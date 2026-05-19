import React, { useEffect, useState } from 'react'
import { Loader2, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500'

function sanitizeFileName(name) {
  return String(name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
}

function normalizeShiftType(value) {
  return String(value || 'day').toLowerCase() === 'night' ? 'night' : 'day'
}

async function removeEmployeePhotos(employeeId) {
  if (!employeeId) return

  const folder = `employees/${employeeId}`

  const { data, error } = await supabase.storage
    .from('employee-photos')
    .list(folder)

  if (error) throw error

  const files = (data || []).map((file) => `${folder}/${file.name}`)

  if (files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from('employee-photos')
      .remove(files)

    if (removeError) throw removeError
  }
}

async function uploadEmployeePhoto(file, employeeIdOrTemp = 'temp') {
  const ext = file.name.split('.').pop() || 'jpg'
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
  const filePath = `employees/${employeeIdOrTemp}/${Date.now()}-${safeName}.${ext}`

  if (employeeIdOrTemp !== 'temp') {
    await removeEmployeePhotos(employeeIdOrTemp)
  }

  const { error: uploadError } = await supabase.storage
    .from('employee-photos')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('employee-photos')
    .getPublicUrl(filePath)

  if (!data?.publicUrl) {
    throw new Error('Public URL was not created')
  }

  return data.publicUrl
}

export default function EmployeeModal({ open, onClose, onSave, form, setForm, saving, isEditing }) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!open) {
      setUploadingPhoto(false)
      setUploadError('')
    }
  }, [open])

  if (!open) return null

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

      const photoUrl = await uploadEmployeePhoto(file, form.id || 'temp')

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
        await removeEmployeePhotos(form.id)

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

          <button
            onClick={onClose}
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500 hover:text-white"
          >
            <X size={18} />
          </button>
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
                onLoad={() => {
                console.log('PHOTO LOADED:', form.photo_url)
                }}
                onError={() => {
                console.error('PHOTO FAILED:', form.photo_url)
              }}
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
                      company_name:
                        e.target.value === 'Other' ? prev.company_name || '' : '',
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
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-300">Company name</label>
                  <input
                    className={inputClass}
                    value={form.company_name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, company_name: e.target.value }))
                    }
                    placeholder="Enter company name"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs text-slate-300">Payment type</label>
                <select
                  className={inputClass}
                  value={form.pay_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pay_type: e.target.value }))
                  }
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
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, hourly_rate: e.target.value }))
                    }
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
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, monthly_salary: e.target.value }))
                    }
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
                    setForm((prev) => ({
                      ...prev,
                      overtime_enabled: e.target.value === 'true',
                    }))
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
                <label className="mb-1 block text-xs text-slate-300">Shift</label>
                <select
                  className={inputClass}
                  value={normalizeShiftType(form.shift_type)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, shift_type: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, active: e.target.value === 'true' }))
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="md:col-span-2 mt-2 border-t border-slate-800 pt-3">
                <h3 className="text-sm font-bold text-cyan-300">ZKT settings</h3>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT enabled</label>
                <select
                  className={inputClass}
                  value={form.zkt_enabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      zkt_enabled: e.target.value === 'true',
                    }))
                  }
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
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_user_id: e.target.value }))
                  }
                  placeholder="Usually same as employee number"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT name</label>
                <input
                  className={inputClass}
                  value={form.zkt_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_name: e.target.value }))
                  }
                  placeholder="Max 24 chars"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT password</label>
                <input
                  className={inputClass}
                  value={form.zkt_password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_password: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT card number</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.zkt_card_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_card_number: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">ZKT privilege</label>
                <select
                  className={inputClass}
                  value={form.zkt_privilege}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, zkt_privilege: e.target.value }))
                  }
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
