export function employeeAssignmentForEdit(employee, plant) {
  return {
    plant_location: plant,
    employee_number: employee.employee_number ?? '',
    zkt_user_id: employee.zkt_user_id ?? employee.employee_number ?? '',
  }
}

export async function saveEmployeeEdit(client, form, payload) {
  const { employee_number, plant_location } = form.originalAssignment
  if (form.transferRequest) {
    const { data, error } = await client.rpc('save_employee_plant_transfer', {
      p_employee_id: form.id,
      p_expected_plant: plant_location,
      p_expected_number: Number(employee_number),
      p_updates: payload,
    })
    if (error) throw error
    const employee = Array.isArray(data) ? data[0] : data
    if (!employee) throw Error('No saved employee was returned. Reopen the form to check the assignment.')
    return employee
  }

  const updates = { ...payload }
  delete updates.employee_number
  delete updates.plant_location
  delete updates.zkt_user_id
  const { data, error } = await client.from('employees').update(updates)
    .eq('id', form.id)
    .eq('employee_number', employee_number)
    .eq('plant_location', plant_location)
    .select('*').maybeSingle()
  if (error) throw error
  if (!data) throw Error('Employee assignment changed. Reopen the form.')
  return data
}

export function employeeTransferNotice(employee) {
  const notice = `Employee #${employee.employee_number} saved at ${employee.plant_location}.`
  return employee.zkt_sync_status === 'pending'
    ? `${notice} The new ZKT user ID is awaiting terminal verification.`
    : notice
}
