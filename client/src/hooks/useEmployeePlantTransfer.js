import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function useEmployeePlantTransfer({ open, allowed, form, setForm }) {
  const employeeId = form.id
  const request = form.transferRequest
  const available = Boolean(allowed && employeeId && form.active && form.originalAssignment)

  useEffect(() => {
    if (!open || !available || !request) return
    let cancelled = false

    async function suggestNumber() {
      try {
        const { data, error } = await supabase.rpc('preview_employee_plant_transfer', {
          p_employee_id: employeeId,
          p_plant: request.plant,
        })
        if (error) throw error
        const number = data?.employee_number
        if (!Number.isSafeInteger(number) || number < 1) throw Error('No available number was returned.')
        if (cancelled) return
        setForm((previous) => {
          if (previous.transferRequest !== request) return previous
          return {
            ...previous,
            transferSuggestion: number,
            ...(previous.transferNumberEdited ? {} : {
              employee_number: String(number),
              zkt_user_id: String(number),
            }),
          }
        })
      } catch (error) {
        if (cancelled) return
        setForm((previous) => previous.transferRequest === request
          ? { ...previous, transferError: error.message || 'Could not suggest a number.' }
          : previous)
      }
    }

    suggestNumber()
    return () => { cancelled = true }
  }, [open, available, employeeId, request, setForm])

  function startTransfer(plant) {
    setForm((previous) => ({
      ...previous,
      plant_location: plant,
      employee_number: '',
      zkt_user_id: '',
      transferRequest: { plant },
      transferSuggestion: null,
      transferNumberEdited: false,
      transferError: '',
    }))
  }

  function cancelTransfer() {
    setForm((previous) => ({
      ...previous,
      ...previous.originalAssignment,
      transferRequest: null,
      transferSuggestion: null,
      transferNumberEdited: false,
      transferError: '',
    }))
  }

  return {
    available,
    active: Boolean(request),
    suggestion: form.transferSuggestion,
    error: form.transferError,
    changePlant(plant) {
      if (!employeeId) {
        setForm((previous) => ({
          ...previous,
          plant_location: plant,
          employee_number: '',
          zkt_user_id: '',
          employee_number_edited: false,
        }))
      } else if (available) {
        if (plant === form.originalAssignment.plant_location) cancelTransfer()
        else startTransfer(plant)
      }
    },
    changeNumber(number) {
      setForm((previous) => ({
        ...previous,
        employee_number: number,
        zkt_user_id: number,
        ...(previous.id ? { transferNumberEdited: true } : { employee_number_edited: true }),
      }))
    },
    completePreviousTransfer() {
      if (available) startTransfer(form.originalAssignment.plant_location)
    },
    cancelTransfer,
  }
}
