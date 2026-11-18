import {useEffect,useState} from 'react'
import {Navigate,useLocation} from 'react-router-dom'

const reserveBuild=import.meta.env.VITE_PAYROLL_STANDBY==='1'
export default function PayrollReserveBoundary({children}){
 const location=useLocation()
 const [status,setStatus]=useState(null)
 useEffect(()=>{
  if(!reserveBuild)return
  let stopped=false
  const controller=new AbortController()
  const update=()=>fetch('/api/standby-status',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(value=>{if(!stopped)setStatus(value)}).catch(()=>{})
  update();const timer=setInterval(update,60000)
  return()=>{stopped=true;controller.abort();clearInterval(timer)}
 },[])
 if(!reserveBuild)return children
 if(location.pathname==='/'||location.pathname.startsWith('/monitoring'))return <Navigate to="/dashboard" replace/>
 return <>
  <aside role="status" className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-950 px-4 py-2 text-center text-sm text-amber-100 print:hidden">
   {status?.mode==='active'?'Payroll on MSI':'Payroll reserve · Read only'}
   {status?.snapshotAt&&<> · Copy: {new Date(status.snapshotAt).toLocaleString()}</>}
   {status?.refreshing&&' · Updating reserve…'}
  </aside>
  {children}
 </>
}
