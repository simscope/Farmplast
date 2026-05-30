import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Hash,
  Loader2,
  Pencil,
  Printer,
  Trash2,
  User,
} from 'lucide-react'

function SortIcon({ field, employeeSort }) {
  if (employeeSort.field !== field) return <ArrowUpDown size={12} />
  return employeeSort.direction === 'asc'
    ? <ArrowUp size={12} />
    : <ArrowDown size={12} />
}

export default function WorkersList({
  cardClass,
  counts,
  employeeSort,
  error,
  filteredEmployees,
  formatPresenceTime,
  formatReportDate,
  getFullName,
  getOvertimeBadgeClass,
  getOvertimeLabel,
  getPayLabel,
  getPresenceBadgeClass,
  getPresenceDirection,
  getPresenceLabel,
  getPresenceTitle,
  getPunchErrorBadgeClass,
  getPunchErrorLabel,
  getPunchErrorTitle,
  getShiftBadgeClass,
  getShiftLabel,
  handleDelete,
  handleDeleteFromZkt,
  handleEmployeeSort,
  handlePrintSelectedChecks,
  handlePrintSingleCheck,
  handleShiftChange,
  handleSyncEmployeeToZkt,
  handleVerifyEmployeeInZkt,
  loading,
  normalizeShiftType,
  openEditModal,
  reportError,
  reportLoading,
  search,
  selectedCheckIds,
  setSearch,
  toggleAllVisibleChecks,
  toggleSelectedCheck,
  zkLoading,
}) {
  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-3 border-b border-slate-800 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Workers list</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Database employees + live presence from work logs
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Search by number, ZKT ID, name, presence..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full min-w-[320px] rounded-lg border border-slate-700 bg-[#08101c] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
          />
          <button
            onClick={handlePrintSelectedChecks}
            disabled={reportLoading || selectedCheckIds.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            title={selectedCheckIds.length === 0 ? 'Select employees first' : `Print ${selectedCheckIds.length} selected checks`}
          >
            {reportLoading ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            Print selected checks{selectedCheckIds.length ? ` (${selectedCheckIds.length})` : ''}
          </button>
        </div>
      </div>

      <div className="p-3">
        {error ? (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {reportError ? (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Payroll report error: {reportError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-[#08101c] px-4 py-10 text-center text-sm text-slate-400">
            Loading employees...
          </div>
        ) : (
          <div className="hidden overflow-x-auto rounded-xl border border-slate-800 lg:block">
            <div className="min-w-[1900px]">
              <div className="grid grid-cols-[70px_30px_230px_150px_170px_110px_100px_180px_110px_120px_110px_360px_160px] bg-slate-900/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <button
                  type="button"
                  onClick={() => handleEmployeeSort('number')}
                  className="inline-flex items-center gap-1 text-left uppercase tracking-wide text-slate-300 transition hover:text-cyan-300"
                  title="Sort by employee number"
                >
                  No.
                  <SortIcon field="number" employeeSort={employeeSort} />
                </button>
                <div
                  className="flex items-center justify-center"
                  title="Excluded from payroll report"
                  aria-label="Excluded from payroll report"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70" />
                </div>
                <button
                  type="button"
                  onClick={() => handleEmployeeSort('name')}
                  className="inline-flex items-center gap-1 text-left uppercase tracking-wide text-slate-300 transition hover:text-cyan-300"
                  title="Sort by name"
                >
                  Name
                  <SortIcon field="name" employeeSort={employeeSort} />
                </button>
                <div>Presence ({counts.presenceOnline})</div>
                <div>Last punch</div>
                <div>Direction</div>
                <div>Shift</div>
                <div>Punch error</div>
                <div>Payment</div>
                <div>Overtime</div>
                <div>ZKT ID</div>
                <div>Actions</div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filteredEmployees.length > 0 && filteredEmployees.every((employee) => selectedCheckIds.includes(employee.id))}
                    onChange={toggleAllVisibleChecks}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-cyan-500"
                  />
                  <span>Print check</span>
                </div>
              </div>

              {filteredEmployees.length === 0 ? (
                <div className="bg-[#08101c] px-4 py-8 text-center text-sm text-slate-400">
                  No employees found
                </div>
              ) : (
                filteredEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="grid grid-cols-[70px_30px_230px_150px_170px_110px_100px_180px_110px_120px_110px_360px_160px] items-center border-t border-slate-800 bg-[#08101c] px-3 py-2 text-xs text-slate-200"
                  >
                    <div className="font-semibold text-cyan-300">
                      {employee.employee_number ?? 'вЂ”'}
                    </div>

                    <div className="flex items-center justify-center">
                      {employee.exclude_from_payroll_report ? (
                        <span
                          className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.75)]"
                          title="Excluded from payroll report"
                          aria-label="Excluded from payroll report"
                        />
                      ) : (
                        <span className="h-2 w-2" aria-hidden="true" />
                      )}
                    </div>

                    <div className="flex min-w-0 items-center gap-2 font-semibold text-white">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-[#07101d]">
                        {employee.photo_url ? (
                          <img
                            src={employee.photo_url}
                            alt={getFullName(employee)}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 leading-tight">
                        <div className="truncate">{getFullName(employee)}</div>
                        {employee.company_name ? (
                          <div className="truncate text-[11px] font-normal text-slate-400">
                            {employee.company_name}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <span
                        title={getPresenceTitle(employee)}
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPresenceBadgeClass(employee)}`}
                      >
                        {getPresenceLabel(employee)}
                      </span>
                    </div>

                    <div className="truncate whitespace-nowrap font-semibold text-slate-200">
                      {formatPresenceTime(employee.last_punch_time)}
                    </div>

                    <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                      {getPresenceDirection(employee)}
                    </div>

                    <div>
                      <select
                        className={`rounded-lg border px-2 py-1 text-[11px] font-bold uppercase outline-none ${getShiftBadgeClass(employee)} bg-[#08101c]`}
                        value={normalizeShiftType(employee.shift_type)}
                        onChange={(event) => handleShiftChange(employee.id, event.target.value)}
                      >
                        <option value="day">DAY</option>
                        <option value="night">NIGHT</option>
                      </select>
                    </div>

                    <div className="min-w-0">
                      <span
                        title={getPunchErrorTitle(employee)}
                        className={`inline-flex max-w-full rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPunchErrorBadgeClass(employee)}`}
                      >
                        <span className="truncate">{getPunchErrorLabel(employee)}</span>
                      </span>
                    </div>

                    <div className="truncate whitespace-nowrap font-semibold text-cyan-300">
                      {getPayLabel(employee)}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getOvertimeBadgeClass(employee)}`}
                      >
                        {getOvertimeLabel(employee)}
                      </span>
                    </div>

                    <div className="font-semibold text-blue-300">
                      {employee.zkt_user_id ?? employee.employee_number ?? 'вЂ”'}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        to={`/employees/${employee.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-2 py-1.5 text-cyan-300 transition hover:bg-cyan-600/20"
                      >
                        <ExternalLink size={13} />
                        Open
                      </Link>

                      <button
                        onClick={() => openEditModal(employee)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-white transition hover:border-cyan-500"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>

                      <div className="group relative">
                        <button
                          type="button"
                          disabled={zkLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          ZKT Actions
                        </button>

                        <div className="absolute right-0 top-full z-50 mt-1 hidden min-w-[180px] overflow-hidden rounded-xl border border-slate-700 bg-[#08111f] shadow-2xl group-hover:block">
                          <button
                            type="button"
                            onClick={() => handleSyncEmployeeToZkt(employee)}
                            className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-cyan-300 transition hover:bg-slate-900"
                          >
                            Sync ZKT
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFromZkt(employee)}
                            className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-orange-300 transition hover:bg-slate-900"
                          >
                            Delete from ZKT
                          </button>

                          <button
                            type="button"
                            onClick={() => handleVerifyEmployeeInZkt(employee)}
                            className="block w-full px-4 py-3 text-left text-xs font-semibold text-purple-300 transition hover:bg-slate-900"
                          >
                            Verify selected
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(employee.id)}
                        className="rounded-lg border border-red-500/30 bg-red-600/10 px-2 py-1.5 text-red-300 transition hover:bg-red-600/20"
                      >
                        <Trash2 size={13} />
                      </button>

                      <div className="ml-4">
                        <button
                          type="button"
                          onClick={() => handlePrintSingleCheck(employee)}
                          disabled={reportLoading}
                          className="inline-flex items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Print this check"
                        >
                          <Printer size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedCheckIds.includes(employee.id)}
                        onChange={() => toggleSelectedCheck(employee.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-cyan-500"
                      />
                      <div className="min-w-0 leading-tight">
                        <div className="text-[11px] font-semibold text-slate-200">
                          {employee.last_payment_date ? formatReportDate(new Date(`${employee.last_payment_date}T00:00:00`)) : 'Not printed'}
                        </div>
                        {employee.last_check_number ? (
                          <div className="text-[10px] text-slate-500">
                            Check #{employee.last_check_number}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="space-y-3 lg:hidden">
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="rounded-xl border border-slate-800 bg-[#08101c] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-slate-700 bg-[#07101d]">
                    {employee.photo_url ? (
                      <img
                        src={employee.photo_url}
                        alt={getFullName(employee)}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-cyan-300">
                      <Hash size={13} />
                      {employee.employee_number ?? 'вЂ”'} В· ZKT:{' '}
                      {employee.zkt_user_id ?? employee.employee_number ?? 'вЂ”'}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                      <User size={14} />
                      {getFullName(employee)}
                      {employee.exclude_from_payroll_report ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.75)]"
                          title="Excluded from payroll report"
                          aria-label="Excluded from payroll report"
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {employee.position || 'worker'} В· {getShiftLabel(employee)} В· {getPunchErrorLabel(employee)} В· {getPayLabel(employee)} В· {getOvertimeLabel(employee)}
                    </div>
                  </div>
                </div>

                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${getPresenceBadgeClass(employee)}`}
                >
                  {getPresenceLabel(employee)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Presence</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPresenceBadgeClass(employee)}`}
                  >
                    {getPresenceLabel(employee)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Last punch</span>
                  <span className="font-semibold text-white">{formatPresenceTime(employee.last_punch_time)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Direction</span>
                  <span className="font-semibold text-cyan-300">{getPresenceDirection(employee)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Shift</span>
                  <select
                    className={`rounded-lg border px-2 py-1 text-[11px] font-bold uppercase outline-none ${getShiftBadgeClass(employee)} bg-[#08101c]`}
                    value={normalizeShiftType(employee.shift_type)}
                    onChange={(event) => handleShiftChange(employee.id, event.target.value)}
                  >
                    <option value="day">DAY</option>
                    <option value="night">NIGHT</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Punch error</span>
                  <span
                    title={getPunchErrorTitle(employee)}
                    className={`inline-flex max-w-[210px] rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getPunchErrorBadgeClass(employee)}`}
                  >
                    <span className="truncate">{getPunchErrorLabel(employee)}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-slate-400">Print check</span>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedCheckIds.includes(employee.id)}
                      onChange={() => toggleSelectedCheck(employee.id)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-cyan-500"
                    />
                    {employee.last_payment_date ? formatReportDate(new Date(`${employee.last_payment_date}T00:00:00`)) : 'Not printed'}
                  </label>
                </div>
              </div>

              {employee.zkt_sync_error ? (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {employee.zkt_sync_error}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/employees/${employee.id}`}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-600/10 px-3 py-2 text-xs font-semibold text-cyan-300"
                >
                  Open
                </Link>
                <button
                  onClick={() => openEditModal(employee)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                >
                  Edit
                </button>
                <div className="group relative">
                  <button
                    type="button"
                    disabled={zkLoading}
                    className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ZKT Actions
                  </button>

                  <div className="absolute right-0 top-full z-50 mt-1 hidden min-w-[190px] overflow-hidden rounded-xl border border-slate-700 bg-[#08111f] shadow-2xl group-hover:block">
                    <button
                      type="button"
                      onClick={() => handleSyncEmployeeToZkt(employee)}
                      className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-cyan-300 transition hover:bg-slate-900"
                    >
                      Sync ZKT
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteFromZkt(employee)}
                      className="block w-full border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold text-orange-300 transition hover:bg-slate-900"
                    >
                      Delete from ZKT
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVerifyEmployeeInZkt(employee)}
                      className="block w-full px-4 py-3 text-left text-xs font-semibold text-purple-300 transition hover:bg-slate-900"
                    >
                      Verify selected
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(employee.id)}
                  className="rounded-lg border border-red-500/30 bg-red-600/10 px-3 py-2 text-xs font-semibold text-red-300"
                >
                  Delete DB
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
