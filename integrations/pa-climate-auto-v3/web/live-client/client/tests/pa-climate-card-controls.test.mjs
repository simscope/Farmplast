import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {transform} from 'esbuild'

const file = new URL('../src/components/monitoring/pa/ClimateControl.jsx',import.meta.url)
const source = fs.readFileSync(file,'utf8')

test('Updated Zone 2 controls parse as valid production JSX',async()=>{
 const built=await transform(source,{loader:'jsx',jsx:'automatic',target:'es2022',format:'esm'})
 assert.ok(built.code.length>0)
})
test('MSI zone card keeps existing target buttons but takes PIN next to the target',()=>{
 assert.ok(source.includes("id={'cl-zone-pin-'+z.id}"))
 assert.ok(source.includes("onSave={target => save([z.id],target,z.msi?zonePins[z.id]:'')}"))
 assert.ok(source.includes("const enteredPin=localPin||pin"),'Top-level PIN remains supported')
 assert.ok(source.includes("e.target.value.replace(/\\D/g,'')"),'PIN input must strip non-digits')
 assert.ok(source.includes("setZoneFeedback(v=>({...v,[singleMsi]:e.message}))"),'Save failures must appear beside the zone')
})
test('Display desired and reported setpoints separately, including command acknowledgement',()=>{
 assert.ok(source.includes("MSI target:"))
 assert.ok(source.includes("ESP32 target:"))
 assert.ok(source.includes("Awaiting controller ACK"))
 assert.ok(source.includes("z.msi.command_ack?.acknowledged"))
})
test('OFF remains actionable while other commands await device ACK',()=>{
 assert.ok(source.includes("zone.command_ack?.status==='pending'&&mode!=='OFF'"))
 assert.ok(source.includes("disabled={disabledForMode(mode)}"))
})
