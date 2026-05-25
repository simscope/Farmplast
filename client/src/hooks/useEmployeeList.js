import { useEffect, useMemo, useState } from 'react'

const EMPLOYEE_SORT_STORAGE_KEY = 'dashboardEmployeeSort'

const defaultEmployeeSort = {
  field: 'number',
  direction: 'desc',
}

function loadStoredEmployeeSort() {
  if (typeof window === 'undefined') return defaultEmployeeSort

  try {
    const stored = window.localStorage.getItem(EMPLOYEE_SORT_STORAGE_KEY)
    if (!stored) return defaultEmployeeSort

    const parsed = JSON.parse(stored)
    const field = parsed?.field === 'name' ? 'name' : 'number'
    const direction = parsed?.direction === 'asc' ? 'asc' : 'desc'

    return { field, direction }
  } catch (err) {
    console.warn('Could not load employee sort preference:', err)
    return defaultEmployeeSort
  }
}

export function useEmployeeList(employees, helpers) {
  const {
    getFullName,
    getShiftLabel,
    normalizeShiftType,
  } = helpers

  const [search, setSearch] = useState('')
  const [employeeSort, setEmployeeSort] = useState(loadStoredEmployeeSort)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EMPLOYEE_SORT_STORAGE_KEY,
        JSON.stringify(employeeSort)
      )
    } catch (err) {
      console.warn('Could not save employee sort preference:', err)
    }
  }, [employeeSort])

  function handleEmployeeSort(field) {
    setEmployeeSort((current) => {
      if (current.field === field) {
        return {
          field,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        }
      }

      return {
        field,
        direction: field === 'name' ? 'asc' : 'desc',
      }
    })
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visibleEmployees = !q ? employees : employees.filter((employee) => {
      const fullName = getFullName(employee).toLowerCase()

      return (
        String(employee.employee_number || '').toLowerCase().includes(q) ||
        String(employee.zkt_user_id || '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (employee.phone || '').toLowerCase().includes(q) ||
        (employee.email || '').toLowerCase().includes(q) ||
        (employee.position || '').toLowerCase().includes(q) ||
        normalizeShiftType(employee.shift_type).includes(q) ||
        getShiftLabel(employee).toLowerCase().includes(q) ||
        (employee.zkt_sync_status || '').toLowerCase().includes(q) ||
        (employee.last_punch_type || '').toLowerCase().includes(q) ||
        (employee.is_on_site ? 'on site на работе present' : 'off site не на работе absent').includes(q)
      )
    })

    return [...visibleEmployees].sort((a, b) => {
      const direction = employeeSort.direction === 'asc' ? 1 : -1

      if (employeeSort.field === 'name') {
        const nameA = getFullName(a).toLowerCase()
        const nameB = getFullName(b).toLowerCase()
        return nameA.localeCompare(nameB, undefined, { numeric: true }) * direction
      }

      const numberA = Number(a.employee_number)
      const numberB = Number(b.employee_number)
      const safeNumberA = Number.isFinite(numberA) ? numberA : Number.NEGATIVE_INFINITY
      const safeNumberB = Number.isFinite(numberB) ? numberB : Number.NEGATIVE_INFINITY

      if (safeNumberA !== safeNumberB) {
        return (safeNumberA - safeNumberB) * direction
      }

      return getFullName(a).localeCompare(getFullName(b), undefined, { numeric: true })
    })
  }, [employees, employeeSort, getFullName, getShiftLabel, normalizeShiftType, search])

  return {
    employeeSort,
    filteredEmployees,
    handleEmployeeSort,
    search,
    setSearch,
  }
}
