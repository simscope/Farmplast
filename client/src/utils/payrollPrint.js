import { getPayrollPaymentDate, getPayrollPaymentTimestamp } from './payrollYtd.js'
import { saveEmployeePayment } from './paymentHistory.js'

export function getPrintRowKey(item) {
  return String(item?.employee?.id || item?.fullName || 'employee')
}

export function mapPayrollRowToCheckTotals(item) {
  if (item?.checkTotals) return item.checkTotals
  if (item?.totals) return item.totals
  return {
    mainHours: item.regularHours,
    overtimeHours: item.overtimeHours,
    totalLabor: item.grossPay,
    mainLabor: item.regularLabor,
    overtimeLabor: item.overtimeLabor,
    employeeTaxNum: item.deductions?.tax || 0,
    rentNum: item.deductions?.rent || 0,
    electricNum: item.deductions?.electric || 0,
    waterNum: item.deductions?.water || 0,
    cleanNum: item.deductions?.clean || 0,
    transportNum: item.deductions?.transport || 0,
    netPay: item.netPay,
    rows: item.rows || [],
    filteredForView: item.rows || [],
    rowsByDate: item.rowsByDate || {},
  }
}

// One confirmation per preview, including concurrent clicks and reprints.
// A failed batch may have partially saved: never issue it again blindly.
export function createPayrollPrintConfirmation(saveRows) {
  let confirmation
  return (rows) => {
    if (confirmation) return confirmation
    if (!rows.length || rows.some((row) => {
      const date = getPayrollPaymentDate(row.paymentDate)
      return !date || (row.grouped_company && row.grouped_items.some((item) => item.paymentDate !== date))
    })) {
      return Promise.reject(new Error('Enter a valid date for every check.'))
    }
    confirmation = Promise.resolve().then(() => saveRows(rows))
    return confirmation
  }
}

export async function savePrintedPayrollRows(supabase, week, printRows) {
  const nowIso = new Date().toISOString()

  for (const item of printRows) {
    const employee = item.employee
    const totals = item.checkTotals || item.totals || mapPayrollRowToCheckTotals(item)

    const sourceItems = item.grouped_company ? item.grouped_items : [item]
    const paymentDate = sourceItems[0]?.paymentDate || getPayrollPaymentDate(nowIso)
    const checkEmployeeId = item.grouped_company
      ? sourceItems[0]?.employee?.id
      : employee.id

    if (!checkEmployeeId) {
      throw new Error('Employee not found for payroll check')
    }

    const { data: createdCheck, error: createCheckError } = await supabase.rpc(
      'create_payroll_check',
      {
        p_employee_id: checkEmployeeId,
        p_pay_period_start: week.startText,
        p_pay_period_end: week.endText,
        p_regular_hours: Number(totals.mainHours || totals.taxableHours || 0),
        p_overtime_hours: Number(totals.overtimeHours || 0),
        p_regular_labor: Number(totals.mainLabor || totals.taxableLabor || 0),
        p_overtime_labor: Number(totals.overtimeLabor || 0),
        p_gross_pay: Number(totals.totalLabor || 0),
        p_employee_tax: Number(totals.employeeTaxNum || 0),
        p_rent: Number(totals.rentNum || 0),
        p_electric: Number(totals.electricNum || 0),
        p_water: Number(totals.waterNum || 0),
        p_clean: Number(totals.cleanNum || 0),
        p_transport: Number(totals.transportNum || 0),
        p_net_pay: Number(totals.netPay || 0),
      }
    )

    if (createCheckError) throw createCheckError
    if (!createdCheck?.id) throw new Error('Check record was not created')
    if (!createdCheck?.check_number) throw new Error('Check number was not created')

    const nextCheckNumber = createdCheck.check_number

    const { error: printedError } = await supabase.rpc(
      'mark_payroll_check_printed',
      {
        p_check_id: createdCheck.id,
      }
    )

    if (printedError) throw printedError

    // Use the same chosen pay date for YTD, the stored payment and the check.
    // A batch finishing after midnight must not silently switch tax years.
    const paidAt = getPayrollPaymentTimestamp(paymentDate)

    for (const sourceItem of sourceItems) {
      const sourceEmployee = sourceItem.employee
      const sourceTotals =
        sourceItem.checkTotals ||
        sourceItem.totals ||
        mapPayrollRowToCheckTotals(sourceItem)

      const paymentPayload = {
        employee_id: sourceEmployee.id,
        period_start: week.startText,
        period_end: week.endText,
        total_labor: Number(sourceTotals.totalLabor || 0),
        employee_tax: Number(sourceTotals.employeeTaxNum || 0),
        rent: Number(sourceTotals.rentNum || 0),
        electric: Number(sourceTotals.electricNum || 0),
        water: Number(sourceTotals.waterNum || 0),
        clean: Number(sourceTotals.cleanNum || 0),
        transport: Number(sourceTotals.transportNum || 0),
        net_pay: Number(sourceTotals.netPay || 0),
        paid_at: paidAt,
      }

      await saveEmployeePayment(supabase, paymentPayload)

      const { error: employeeUpdateError } = await supabase
        .from('employees')
        .update({
          last_payment_date: paymentDate,
          last_payment_amount: Number(sourceTotals.netPay || 0),
          last_check_number: nextCheckNumber,
        })
        .eq('id', sourceEmployee.id)

      if (employeeUpdateError) throw employeeUpdateError
    }

    item.print_check_number = nextCheckNumber
    employee.last_payment_date = paymentDate
    employee.last_payment_amount = Number(totals.netPay || 0)
    employee.last_check_number = nextCheckNumber
  }
}
