function getPaymentPeriodKey(row) {
  return [row?.employee_id, row?.period_start, row?.period_end].join('|')
}

function getPaymentSortTime(row) {
  const paidTime = row?.paid_at ? new Date(row.paid_at).getTime() : 0
  const createdTime = row?.created_at ? new Date(row.created_at).getTime() : 0

  return Math.max(
    Number.isNaN(paidTime) ? 0 : paidTime,
    Number.isNaN(createdTime) ? 0 : createdTime
  )
}

export function normalizePaymentHistory(rows) {
  const latestByPeriod = new Map()

  ;(rows || []).forEach((row) => {
    const key = getPaymentPeriodKey(row)
    const current = latestByPeriod.get(key)

    if (!current || getPaymentSortTime(row) >= getPaymentSortTime(current)) {
      latestByPeriod.set(key, row)
    }
  })

  return Array.from(latestByPeriod.values()).sort(
    (a, b) => getPaymentSortTime(b) - getPaymentSortTime(a)
  )
}

export async function saveEmployeePayment(supabase, payload) {
  const { data: existingRows, error: lookupError } = await supabase
    .from('employee_payments')
    .select('id,paid_at,created_at')
    .eq('employee_id', payload.employee_id)
    .eq('period_start', payload.period_start)
    .eq('period_end', payload.period_end)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (lookupError) throw lookupError

  const existingId = existingRows?.[0]?.id

  if (existingId) {
    const { error } = await supabase
      .from('employee_payments')
      .update(payload)
      .eq('id', existingId)

    if (error) throw error
    return
  }

  const { error } = await supabase.from('employee_payments').insert(payload)

  if (error) throw error
}
