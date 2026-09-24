import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import Ch1FirmwareUpload from '../src/components/Ch1FirmwareUpload'
import '../src/index.css'
const objects=new Map(),calls=[]
const client={rpc:async name=>{calls.push(name);document.getElementById('calls').textContent=JSON.stringify(calls);return {data:name==='ch1_firmware_status'?{releases:[]}:true}},storage:{from:()=>({upload:async(path,file,options)=>{calls.push('upload:'+options.upsert);if(objects.has(path))return {error:{statusCode:'409'}};objects.set(path,file);return {}},download:async path=>{calls.push('download');return {data:objects.get(path)}}})}}
export default function Fixture(){const [open,setOpen]=useState(true);return <><p>ISOLATED UPLOAD TEST — all RPC and Storage mocked</p><pre id="calls">[]</pre><button onClick={()=>setOpen(true)}>REOPEN</button>{open&&<Ch1FirmwareUpload device="ESP32-CH1" client={client} onClose={()=>setOpen(false)} onApproved={()=>{}}/>}</>}
createRoot(document.getElementById('root')).render(<Fixture/> )
