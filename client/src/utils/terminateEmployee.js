export async function terminateEmployee({ client, employeeId, date, reason, deliver }) {
  const result = await client.rpc('terminate_employee', {
    p_employee_id: employeeId, p_date: date, p_reason: reason?.trim() || null, p_notes: null,
  })
  if (result.error) throw Error(result.error.message)
  let sacsConfirmed = false
  try { await deliver(employeeId); sacsConfirmed = true } catch { /* Archived already; never invite another termination. */ }
  return { employeeId: result.data, sacsConfirmed }
}

export function terminationBlockers(preview) {
  const blockers = []
  if (!preview.active) blockers.push('This employee is already inactive. Refresh the employee list.')
  if (preview.open_periods !== 1) blockers.push('The employment period needs reconciliation before termination.')
  return blockers
}
