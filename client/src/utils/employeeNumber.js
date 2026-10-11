export function employeeNumberForSave(form, automaticAllocation) {
  if (!form.id && automaticAllocation) return null
  const number = Number(form.employee_number)
  if (!Number.isSafeInteger(number) || number < 1) throw Error('A positive employee number is required')
  return number
}
