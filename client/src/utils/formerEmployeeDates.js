function dateOnly(value) {
  if (!value) return null
  const date = (value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : String(value)).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null
}

// Every caller supplies records selected by this permanent Employee UUID.
export function archiveDates(employee, periods, firstWorkDate, lastWorkDate) {
  const ownPeriods = periods.filter(period => period.employee_id === employee.id)
    .sort((a, b) => Number(b.id) - Number(a.id))
  const hire = dateOnly(employee.hire_date) || ownPeriods.map(period => dateOnly(period.hire_date)).find(Boolean)
    || dateOnly(firstWorkDate)
  const lastWork = dateOnly(lastWorkDate)
  const recordedTermination = dateOnly(employee.termination_date) || dateOnly(ownPeriods[0]?.termination_date)
  // A later historical correction needs review before replacing an earlier recorded termination.
  const terminationNeedsReview = Boolean(lastWork && recordedTermination && recordedTermination < lastWork)
  const termination = employee.active === false && lastWork
    ? (terminationNeedsReview ? recordedTermination : lastWork) : null
  return { ...employee, hire_date: hire, termination_date: termination, last_work_date: lastWork,
    termination_needs_review: terminationNeedsReview }
}

export function employmentDuration(employee) {
  const hire = dateOnly(employee.hire_date)
  const termination = dateOnly(employee.termination_date)
  if (!hire || !termination) return 'Not recorded'
  const days = (Date.parse(termination) - Date.parse(hire)) / 86400000
  return days >= 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : 'Not recorded'
}
