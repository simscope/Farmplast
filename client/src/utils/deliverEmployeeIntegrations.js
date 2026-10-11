export async function deliverEmployeeIntegrations(employeeId,{getSession,fetchImpl=fetch}) {
  const session=await getSession()
  const response=await fetchImpl('/api/employee-integrations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data?.session?.access_token}`},body:JSON.stringify({employee_id:employeeId})})
  if(!response.ok)throw Error('Profile saved. SACS delivery is pending; the employee number remains protected.')
  const result=await response.json()
  if(!Array.isArray(result.results)||result.results.length===0||result.results.some(row=>row.status!=='succeeded'))throw Error('Profile saved. SACS acknowledgement is pending or uncertain; review integration status before retrying.')
}
