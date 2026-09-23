// Local visual fixture only; not a production entry point. No network mutations.
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import FirmwareUpload from '../../src/components/FirmwareUpload'
import '../../src/index.css'
let stored
const localClient={storage:{from:()=>({upload:async(_path,file)=>{stored=file;return {}},download:async()=>({data:stored})})},rpc:async name=>({data:name==='chiller_firmware_status'?{releases:[]}:'local-release'})}
function Fixture() {
 const [open,setOpen]=useState(false),[approved,setApproved]=useState(false)
 return <main className="min-h-screen bg-slate-950 p-8 text-white">
  <p className="mb-8 text-amber-300">LOCAL TEST FIXTURE · CH2 · NO BACKEND CONNECTION</p>
  <h1 className="mb-4 text-2xl font-bold">Firmware Programming</h1>
  <div className="flex gap-4"><button className="rounded-xl border border-slate-500 px-4 py-3 font-bold" onClick={()=>setOpen(true)}>UPLOAD FIRMWARE</button><button disabled className="rounded-xl border border-slate-500 px-4 py-3 opacity-40">PROGRAM FIRMWARE</button></div>
  {approved&&<p role="status" className="mt-4 text-emerald-300">Stored bytes verified. Local test release approved. No controller programmed.</p>}
  {open&&<FirmwareUpload device="ESP32-CH2-PLC" client={localClient} onClose={()=>setOpen(false)} onApproved={()=>setApproved(true)}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<Fixture/>);
