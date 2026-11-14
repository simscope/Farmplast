import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import '../components/monitoring/pa/pa.css'
import '../components/monitoring/pa/climateControl.css'
import MsiOta from '../components/monitoring/pa/MsiOta'
import ControllerReplacement from '../components/monitoring/pa/ControllerReplacement'
const sha='7a31edc3c867c86385fb9e3d03c5889d1937685383eaf8d9988dad03851b87eb'
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
export default function ClimateProgramming(){
 const [sample,set]=useState(null),[log,write]=useState(''),[busy,lock]=useState(false),[file,choose]=useState(null),[confirmed,confirm]=useState(false)
 const reading=useRef(null),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;let t;const poll=async()=>{try{const r=await fetch('/api/pa-zone1',{cache:'no-store',signal:AbortSignal.timeout(5000)});const s=r.ok?await r.json():null;if(mounted.current)set(s)}catch{if(mounted.current)set(null)}finally{if(mounted.current)t=setTimeout(poll,5000)}};poll();return()=>{mounted.current=false;clearTimeout(t);reading.current?.cancel().catch(()=>{})}},[])
 function note(s){if(mounted.current)write(prev=>(prev+s+'\n').slice(-6000))}
 async function usb(flash){
   if(busy)return
   lock(true);write('');let port,transport,reader
   try{
    port=await navigator.serial.requestPort()
    if(flash){
      const bytes=new Uint8Array(await file.arrayBuffer())
      if(await digest(bytes)!==sha)throw Error('Select the approved PA Climate 1.2.0 application .bin.')
      const url='/pa-climate/serial-loader.js', {Transport,ESPLoader}=await import(/* @vite-ignore */url)
      transport=new Transport(port);const loader=new ESPLoader({transport,baudrate:115200,terminal:{clean:()=>{},writeLine:note,write:()=>{}}})
      await loader.main('no_reset')
      if(loader.chip.CHIP_NAME!=='ESP32'||await loader.getFlashSize()!==4096)throw Error('Expected an ESP32 board with 4 MB flash.')
      const table=await loader.readFlash(0x8000,3072,()=>{}),view=new DataView(table.buffer,table.byteOffset,table.byteLength)
      let slot=false,dual=false;for(let i=0;i+32<=view.byteLength&&view.getUint16(i,true)===0x50aa;i+=32){if(view.getUint8(i+2)===0&&view.getUint8(i+3)===16&&view.getUint32(i+4,true)===0x10000&&view.getUint32(i+8,true)===0x140000)slot=true;if(view.getUint8(i+2)===0&&view.getUint8(i+3)===17&&view.getUint32(i+4,true)===0x150000)dual=true}
      if(!slot||!dual)throw Error('Expected the PA dual-slot partition layout. Nothing written.')
      const parts=[];for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)))
      await loader.writeFlash({fileArray:[{address:0x10000,data:parts.join('')}],flashSize:'keep',flashMode:'keep',flashFreq:'keep',eraseAll:false,compress:true})
      const back=await loader.readFlash(0x10000,bytes.length,()=>{});if(await digest(back)!==sha)throw Error('Readback verification failed.')
      note('Application verified. Release IO0 and press EN.');confirm(false)
    }else{
      await port.open({baudRate:115200});reader=port.readable.getReader();reading.current=reader;const dec=new TextDecoder();let partial=''
      note('Listening at 115200. Press EN for startup diagnostics.')
      while(mounted.current){const {value,done}=await reader.read();if(done)break;partial+=dec.decode(value,{stream:true});const lines=partial.split('\n');partial=lines.pop().slice(-512)
        for(const line of lines)if(/^(DIAG |START GPIO|FPCLIMATE:|PA-[A-F0-9]{12}|Profile saved)/.test(line))note(line.trim())}
    }
   }catch(e){note(e.message)}finally{reading.current=null;reader?.releaseLock();if(transport)await transport.disconnect().catch(()=>{});else if(port?.readable)await port.close().catch(()=>{});if(mounted.current)lock(false)}
 }
 const live=sample&&Number.isFinite(sample.at)&&Date.now()-sample.at<30000
 return <main className="pa-dashboard"><div className="pa-container"><header className="pa-header"><div><p className="pa-eyebrow">PENNSYLVANIA</p><h1>Programming &amp; diagnostics</h1></div><Link className="pa-home" to="/monitoring/pa/climate">Back to climate</Link></header><section className="cl-control">
 <article><h2>Legacy PA Climate 1.2.0 · {live?'Online':'Offline'}</h2><p>Firmware {live?sample.version??'—':'—'} · Wi-Fi {live?sample.wifi??'—':'—'} dBm · Network {live?sample.network??'—':'—'}</p><p>Last sample: {live?new Date(sample.at).toLocaleString():'—'} · Fault: {live?(sample.fault?'yes':'none reported'):'unknown'}</p></article>
 <article><h2>USB diagnostics</h2><button disabled={busy||!navigator.serial} onClick={()=>usb(false)}>Read USB log</button> <button disabled={!busy||!reading.current} onClick={()=>reading.current?.cancel()}>Stop log</button></article>
 <article><h2>USB firmware · PA Climate 1.2.0</h2><p>For initialized PA WROOM32E 4 MB boards booting from slot 0. This updates the application only and preserves Wi-Fi and zone settings. Disconnect the heating load, use low-voltage bench power, hold IO0 while pressing EN, then release IO0.</p>
 <input type="file" accept=".bin" disabled={busy} onChange={e=>choose(e.target.files[0])}/><label><input type="checkbox" checked={confirmed} onChange={e=>confirm(e.target.checked)}/> Board is unloaded and in download mode</label> <button disabled={busy||!file||!confirmed||!navigator.serial} onClick={()=>usb(true)}>Write and verify</button></article>
 <ControllerReplacement/>
 <MsiOta/>
 {!navigator.serial&&<p>Use desktop Chrome or Edge for USB.</p>}<pre aria-live="polite" style={{color:'white',whiteSpace:'pre-wrap'}}>{log}</pre></section></div></main>
}
