import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('programming presentation explains initial installation and blocks offline devices', async () => {
 const server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'})
 try {
  const {default:Programming}=await server.ssrLoadModule('/src/components/ChillerProgramming.jsx')
  const render=(n,data,error='')=>renderToStaticMarkup(createElement(Programming,{deviceCode:`ESP32-CH${n}-PLC`,label:`Chiller ${n}`,data,error,onRefresh:()=>{}}))
  for(const n of [2,3]) {
   const html=render(n,{device:null,releases:[],jobs:[]})
   assert.match(html,/>Firmware Programming</)
   assert.match(html,/OTA NOT INITIALIZED/)
   assert.match(html,/Initial physical firmware installation is required before Internet programming can be used\./)
   assert.match(html,/NO APPROVED FIRMWARE AVAILABLE/)
   assert.match(html,/<button[^>]*disabled=""[^>]*>PROGRAM FIRMWARE/)
   if(n===3) assert.match(html,/CH3 hardware is not present/)
  }
  const offline=render(2,{device:{version:'old',last_seen:'2020-01-01T00:00:00Z'},releases:[{id:'r',version:'next'}],jobs:[]})
  assert.match(offline,/DEVICE OFFLINE/)
  assert.match(offline,/<button[^>]*disabled=""[^>]*>PROGRAM FIRMWARE/)
  const active=render(2,{device:{version:'old',last_seen:new Date().toISOString()},releases:[],jobs:[{status:'downloading',progress:50}]})
  assert.match(active,/DOWNLOADING/);assert.match(active,/50%/)
  assert.doesNotMatch(active,/PROGRAMMING SUCCESSFUL/)
 } finally {await server.close()}
})
