import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
export default function EmployeeNumberSuggestion(){
  const [number,setNumber]=useState(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    supabase.rpc('next_available_employee_number').then(result=>{
      if(cancelled)return
      if(result.error)setError(result.error.message);else setNumber(result.data)
    }).catch(err=>{if(!cancelled)setError(err.message)})
    return()=>{cancelled=true}
  },[])
  return <p className="mt-1 text-xs text-slate-300">{error|| (number===null?'Checking available number…':`Suggested Employee Number: ${number}. Final number is reserved when saved.`)}</p>
}
