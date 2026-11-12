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


/**
 * Retrieve every recorded payroll payment preceding a pay period.
 * PostgREST may cap each response at 1,000 rows regardless of a higher .limit().
 * Explicit stable pagination prevents silent YTD undercounting.
 */
export async function loadYearToDatePayments(supabase, periodStart) {
  const start = String(periodStart || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return []

  const yearStart = `${start.slice(0, 4)}-01-01`
  const pageSize = 500
  const allPayments = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('employee_payments')
      .select('id,employee_id,period_start,period_end,total_labor,employee_tax,rent,electric,water,clean,transport,net_pay,paid_at,created_at')
      .gte('period_start', yearStart)
      .lt('period_start', start)
      .order('period_start', { ascending: true })
      .order('employee_id', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Payroll payment history was not returned')

    allPayments.push(...data)
    if (data.length < pageSize) break
  }

  return normalizePaymentHistory(allPayments)
}

/**
 * Printed check YTD must use the withholding and net pay actually recorded
 * for the current check, not the unrounded tax estimate.
 */
export function calculatePrintedCheckYtd(priorTax, taxWithheld, priorNetPay, netPay) {
  const money = (value) => Number((Number(value) || 0).toFixed(2))

  return {
    ytdEmployeeTaxes: money(Number(priorTax || 0) + Number(taxWithheld || 0)),
    ytdNetPay: money(Number(priorNetPay || 0) + Number(netPay || 0)),
  }
}
