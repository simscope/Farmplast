const date = value => {
  const day = typeof value === 'string' ? value.slice(0, 10) : ''
  const parsed = new Date(`${day}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null
}
const hasWork = row => Boolean(row.time_in || row.time_out || Number(row.reg_hours) > 0 || Number(row.labor_amount) > 0)

function employmentEngagements(periods) {
  const byId = new Map(periods.map(period => [String(period.id), period]))
  const groups = new Map()
  for (const period of periods) {
    let original = period
    const visited = new Set()
    // Follow links rather than sorting by hire date. A legacy first assignment
    // may have no hire date, even when all of its later assignments do.
    while (!visited.has(original)) {
      visited.add(original)
      const previous = byId.get(String(original.transferred_from_period_id))
      if (!previous) break
      original = previous
    }
    if (!groups.has(original)) groups.set(original, [])
    groups.get(original).push(period)
  }
  return [...groups].map(([original, assignments]) => {
    const predecessors = new Set(assignments.map(period => String(period.transferred_from_period_id)))
    const latest = assignments.find(period => !predecessors.has(String(period.id))) || original
    return {
      ...latest,
      hire_date: original.hire_date,
      recorded_at: original.recorded_at,
      assignmentIds: new Set(assignments.map(period => String(period.id))),
    }
  }).sort((a, b) => {
    const startA = a.hire_date || (a.assignmentIds.size > 1 && a.termination_date) || a.recorded_at || ''
    const startB = b.hire_date || (b.assignmentIds.size > 1 && b.termination_date) || b.recorded_at || ''
    return startA.localeCompare(startB) || Number(a.id) - Number(b.id)
  })
}

// Records are already selected by permanent UUID. Period boundaries additionally
// prevent a later engagement of the same person from joining an earlier one.
export function formerPeriods(employee, periods, logs) {
  logs = logs.map(row => ({ ...row, work_date: date(row.work_date) })).filter(row => row.work_date)
  const own = employmentEngagements(periods.filter(row => row.employee_id === employee.id))
  return (own.length ? own : [{ id: 'legacy', employee_id: employee.id, assignmentIds: new Set(['legacy']) }]).map((period, index) => {
    const start = date(period.hire_date) || (index === own.length - 1 || !own.length ? date(employee.hire_date) : null)
    const previousEnd = date(own[index - 1]?.termination_date)
    const nextStart = date(own[index + 1]?.hire_date)
    const recordedEnd = date(period.termination_date)
    // Missing boundaries with multiple engagements cannot safely own untagged rows.
    const transferHasStartBoundary = period.assignmentIds.size > 1 && (index === 0 || Boolean(previousEnd))
    const safeUntagged = own.length <= 1 || Boolean(
      (start || transferHasStartBoundary) && (recordedEnd || nextStart || index === own.length - 1),
    )
    const belongs = row => row.employee_id === employee.id && (row.employment_period_id != null
      ? period.assignmentIds.has(String(row.employment_period_id))
      : safeUntagged &&
        (!start || row.work_date >= start) && (!previousEnd || row.work_date > previousEnd) &&
        (!recordedEnd || row.work_date <= recordedEnd) && (!nextStart || row.work_date < nextStart))
    const work = logs.filter(belongs).filter(row => row.is_deleted !== true).sort((a, b) => a.work_date.localeCompare(b.work_date))
    const actual = work.filter(hasWork)
    const hire = start || date(actual[0]?.work_date)
    const termination = date(actual.at(-1)?.work_date)
    return { ...period, employee_number: period.employee_number ?? employee.employee_number,
      hire_date: hire, termination_date: termination, logs: work,
      recordedEnd, previousEnd, nextStart, safeUntagged,
      rangeStart: hire || date(work[0]?.work_date), rangeEnd: termination || date(work.at(-1)?.work_date) }
  })
}

export function withinRange(start, end, rangeStart, rangeEnd) {
  return Boolean(start && end && (!rangeStart || start >= rangeStart) && (!rangeEnd || end <= rangeEnd) && start <= end)
}
export function periodPayments(payments, employeeId, period, start, end) {
  return payments.map(row => ({ ...row, period_start: date(row.period_start), period_end: date(row.period_end) }))
    .filter(row => row.employee_id === employeeId &&
      (row.employment_period_id == null
        ? period.safeUntagged && (!period.previousEnd || row.period_start > period.previousEnd)
        : period.assignmentIds.has(String(row.employment_period_id))) &&
      (!period.recordedEnd || row.period_end <= period.recordedEnd) &&
      (!period.nextStart || row.period_end < period.nextStart) &&
      withinRange(row.period_start, row.period_end, start || period.rangeStart, end || period.rangeEnd))
}
