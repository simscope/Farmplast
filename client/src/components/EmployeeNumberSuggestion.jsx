import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {applyEmployeeNumberSuggestion} from '../utils/employeeNumber'
export default function EmployeeNumberSuggestion({plant,setForm}){
  const [number,setNumber]=useState(null)
  const [error,setError]=useState('')
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    let cancelled=false
    supabase.rpc('next_available_employee_number',{p_plant:plant}).then(result=>{
      if(cancelled)return
      if(result.error)throw result.error
      if(!Number.isSafeInteger(result.data)||result.data<1)throw Error('No valid employee number was returned')
      setError('')
      setNumber(result.data)
      setForm(previous=>previous.plant_location===plant?applyEmployeeNumberSuggestion(previous,result.data):previous)
    }).catch(err=>{if(!cancelled)setError(err.message)})
    return()=>{cancelled=true}
  },[attempt,plant,setForm])
  return <div className="mt-1 text-xs text-slate-300">
    {error?<p role="alert">Could not load an unused Employee Number: {error}</p>:
      <p role="status">{number===null?'Checking available number…':`Suggested Employee Number: ${number}. Your selected number is checked and reserved when saved.`}</p>}
    {error&&<button type="button" onClick={()=>{setError('');setAttempt(value=>value+1)}} className="mt-1 text-cyan-300 underline">Retry employee number</button>}
  </div>
}
