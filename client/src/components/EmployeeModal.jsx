import React from 'react'

import {
  X,
  Upload,
  Loader2,
  Trash2,
} from 'lucide-react'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#020817] px-3 py-2 text-white outline-none transition focus:border-cyan-500'

const labelClass =
  'mb-1 block text-sm font-medium text-slate-200'

export default function EmployeeModal({
  show,
  editEmployee,
  setEditEmployee,
  setShowEmployeeModal,
  savingEmployee,
  uploadingPhoto,
  handleEmployeePhotoUpload,
  removeEmployeePhoto,
  saveEmployee,
}) {
  if (!show || !editEmployee) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#071224] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-800 bg-[#071224] px-6 py-5">
          <div>
            <h2 className="text-3xl font-bold text-white">
              Edit employee
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Worker information + ZKT device settings
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowEmployeeModal(false)}
            className="rounded-xl border border-slate-700 p-3 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[180px_1fr]">
          {/* PHOTO */}
          <div className="flex flex-col items-center">
            <div className="flex h-[160px] w-[160px] items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-[#020817]">
              {editEmployee.photo_url ? (
                <img
                  src={editEmployee.photo_url}
                  alt="Employee"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-sm text-slate-500">
                  No photo
                </div>
              )}
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-500/20">
              {uploadingPhoto ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <Upload size={18} />
              )}

              Upload photo

              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleEmployeePhotoUpload}
              />
            </label>

            {editEmployee.photo_url ? (
              <button
                type="button"
                onClick={removeEmployeePhoto}
                className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                <Trash2 size={16} />
                Remove photo
              </button>
            ) : null}
          </div>

          {/* FORM */}
          <div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Employee number
                </label>

                <input
                  className={inputClass}
                  value={
                    editEmployee.employee_number || ''
                  }
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      employee_number:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>
                  First name
                </label>

                <input
                  className={inputClass}
                  value={
                    editEmployee.first_name || ''
                  }
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      first_name:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>
                  Last name
                </label>

                <input
                  className={inputClass}
                  value={
                    editEmployee.last_name || ''
                  }
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      last_name:
                        e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>
                  Phone
                </label>

                <input
                  className={inputClass}
                  placeholder="Phone number"
                  value={editEmployee.phone || ''}
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      phone: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>
                  Email
                </label>

                <input
                  className={inputClass}
                  placeholder="Email"
                  value={editEmployee.email || ''}
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      email: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>
                  Position
                </label>

                <input
                  className={inputClass}
                  value={
                    editEmployee.position || ''
                  }
                  onChange={(e) =>
                    setEditEmployee({
                      ...editEmployee,
                      position:
                        e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t border-slate-800 pt-5">
              <button
                type="button"
                onClick={() =>
                  setShowEmployeeModal(false)
                }
                className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveEmployee}
                disabled={savingEmployee}
                className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
              >
                {savingEmployee
                  ? 'Saving...'
                  : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
