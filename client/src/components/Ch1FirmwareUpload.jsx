import {useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {inspectFirmware,uploadAndApprove} from '../utils/ch1Firmware'

export default function Ch1FirmwareUpload({device,onClose,onApproved,client=supabase}) {
  const [file,setFile]=useState(null),[image,setImage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const selection=useRef(0),submitting=useRef(false)
  async function select(event) {
    const chosen=event.target.files?.[0],generation=++selection.current
    setFile(chosen);setImage(null);setError('')
    if(!chosen) return
    setBusy(true)
    try {const result=await inspectFirmware(chosen,device);if(selection.current===generation) setImage(result)}
    catch {if(selection.current===generation) setError('Invalid firmware. Check the target, markers, ESP32-S3 image and OTA slot size.')}
    finally {if(selection.current===generation) setBusy(false)}
  }
  async function upload() {
    if(!image || busy || submitting.current) return
    submitting.current=true;setBusy(true);setError('')
    try {await uploadAndApprove(client,file,device,image);onApproved();onClose()}
    catch(e) {setError(e.message)}
    finally {submitting.current=false;setBusy(false)}
  }
  return <div role="dialog" aria-modal="true" aria-labelledby="firmware-upload-title" className="fixed inset-0 z-[2100] grid place-items-center bg-slate-950/90 p-4">
    <section className="max-h-[calc(100dvh-32px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-500 bg-slate-900 p-6 text-white">
      <h2 id="firmware-upload-title" className="mb-4 text-xl font-bold">Firmware Upload</h2>
      <label className="block">Application .bin <input className="mt-2 block w-full rounded border border-slate-500 p-3" type="file" accept=".bin" disabled={busy} onChange={select}/></label>
      {image&&<>
        <dl className="my-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[['File',file.name],['Device',image.device],['Version',image.version],['Size',`${image.size.toLocaleString()} bytes`],['SHA-256',image.sha256],['OTA slot free after install',`${image.headroom.toLocaleString()} bytes`]].map(([k,v])=><div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="break-all font-mono">{v}</dd></div>)}
        </dl>
        <ul className="mb-4 grid grid-cols-2 gap-2 text-emerald-300">{['Device marker','Version marker','Image size','Target','ESP32-S3'].map(v=><li key={v}>✓ {v}</li>)}</ul>
      </>}
      <p className="my-3 text-sm text-slate-300">The image stays private. Approval follows download and SHA-256 verification of the stored bytes. Uploading does not program the controller.</p>
      <p role="alert" className="my-3 text-amber-300">{error}</p>
      <div className="flex flex-wrap gap-3"><button type="button" className="rounded-lg border border-slate-500 px-4 py-3" disabled={busy} onClick={onClose}>CANCEL</button><button type="button" className="rounded-lg bg-blue-600 px-4 py-3 font-bold disabled:opacity-40" disabled={!image||busy} onClick={upload}>{busy?'VERIFYING…':'UPLOAD & APPROVE'}</button></div>
    </section>
  </div>
}
