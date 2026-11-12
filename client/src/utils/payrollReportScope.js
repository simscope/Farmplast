export const PAYROLL_REPORT_LOCATIONS = [
  { code: 'NJ', label: 'New Jersey (NJ)' },
  { code: 'PA', label: 'Pennsylvania (PA)' },
]

export function selectPayrollReportEmployees(employees, plantLocation, excludedOnly = false) {
  const safeEmployees = Array.isArray(employees) ? employees : []
  return safeEmployees.filter((employee) => {
    // Match the dashboard's NJ fallback for employees created before plant assignment.
    const location = String(employee?.plant_location || 'NJ').toUpperCase() === 'PA' ? 'PA' : 'NJ'
    return location === plantLocation &&
      (employee?.exclude_from_payroll_report === true) === excludedOnly
  })
}
