export function employeeNumberForSave(form) {
  const number = Number(form.employee_number)
  if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw Error('A positive employee number within the supported range is required')
  if (!form.id || form.transferRequest) {
    const [minimum, maximum] = form.plant_location === 'PA' ? [100, 199] : [1, 99]
    if (number < minimum || number > maximum) {
      throw Error(`Employee Number for ${form.plant_location || 'NJ'} must be between ${minimum} and ${maximum}.`)
    }
  }
  return number
}

export function applyEmployeeNumberSuggestion(form, number) {
  // A slow initial request or retry must never overwrite manual input.
  if (form.id || form.employee_number_edited) return form
  return { ...form, employee_number: String(number), zkt_user_id: String(number) }
}
