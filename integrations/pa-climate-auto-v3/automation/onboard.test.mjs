import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseArgs,parseMac,nextZone,provisioningPayload,localApiBase,remoteApiBase,privateCredentials,esptool,spawn,FLASH_BACKUP_TIMEOUT_MS} from './onboard.mjs';

test('MAC -> stable per-device ID, no serial port index used as identity',()=>{
 assert.equal(parseMac('Connecting...\nMAC: 1a:2b:3c:4d:5e:6f\n'),'PA-CLIM-1A2B3C4D5E6F');
 assert.equal(parseMac('Base MAC: AA:BB:CC:DD:EE:FF'),'PA-CLIM-AABBCCDDEEFF');
 assert.throws(()=>parseMac('chip=ESP32; MAC absent'));
});
test('First free zone is selected automatically',()=>{
 assert.equal(nextZone([{id:'pa-zone-1'},{id:'pa-zone-3'}]),'pa-zone-2');
 assert.equal(nextZone([]),'pa-zone-1');
});
test('URLs never send admin secrets outside local existing MSI HTTP gateway',()=>{
 assert.equal(localApiBase({CLIMATE_LOCAL_BASE_URL:'http://127.0.0.1:18765/climate'}),'http://127.0.0.1:18765/climate');
 for(const s of ['https://example.com/climate','http://192.168.1.2/climate','http://evil.test',''])assert.throws(()=>localApiBase({CLIMATE_LOCAL_BASE_URL:s}));
});
test('Real per-device provisioning rejects empty/cloud-unsafe values',()=>{
 const c={device_id:'PA-CLIM-AABBCCDDEEFF',zone_id:'pa-zone-1',device_token:'x'.repeat(48),ota_hmac_key:'a'.repeat(64)};
 const ca='-----BEGIN CERTIFICATE-----\nVALID_TEST_ONLY\n-----END CERTIFICATE-----';
 const payload=provisioningPayload(c,{ssid:'Farmplast-PA',password:'some-secure-password'},'https://valid.example/climate/v1/exchange',ca);
 assert.equal(payload.ssid,'Farmplast-PA');
 assert.equal(payload.device_id,c.device_id);
 assert.equal(payload.ota_hmac_key,c.ota_hmac_key);
 assert.equal(Object.hasOwn(payload,'relay_enabled'),false);
 assert.throws(()=>provisioningPayload(c,{ssid:'Farmplast-PA',password:'12345678'},'http://insecure.test/v1/exchange',ca));
 assert.throws(()=>provisioningPayload(c,{ssid:'Farmplast-PA',password:'12345678'},'https://valid.example/v1/exchange',''));
});
test('Argument parser rejects unsupported overrides',()=>{
 assert.deepEqual(parseArgs(['--config','file.env','--preflight']),{config:'file.env',preflight:true});
 assert.throws(()=>parseArgs(['--unsafe-bypass']));
});

test('Factory workstation requires HTTPS and identical exchange origin without MSI master key',()=>{
  const c={CLIMATE_HTTPS_BASE_URL:'https://factory.example/climate',PUBLIC_ORIGIN:'https://factory.example/climate'};
  assert.equal(remoteApiBase(c),'https://factory.example/climate');
  for(const base of ['http://factory.example/climate','https://factory.example/climate-local','https://user:pass@factory.example/climate','https://factory.example:8443/climate','https://factory.example/climate?x=1'])assert.throws(()=>remoteApiBase({...c,CLIMATE_HTTPS_BASE_URL:base}));
  assert.throws(()=>remoteApiBase({...c,PUBLIC_ORIGIN:'https://other.example/climate'}));
});

test('Factory device credentials persist with real Windows DPAPI, without plaintext tokens',{skip:process.platform!=='win32'},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-dpapi-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'device.dpapi'),value={device_token:'SYNTHETIC-token-for-DPAPI-test',zone_id:'test-zone'};
  try {privateCredentials(file,value);}catch(e){if(e.code==='DPAPI_UNAVAILABLE'){t.skip('Windows DPAPI denied access in this execution context; factory user verification required');return;}throw e;}
  assert.equal(fs.readFileSync(file,'utf8').includes(value.device_token),false);
  assert.deepEqual(privateCredentials(file),value);
});

test('esptool v5 uses read-mac / read-flash and never retries a failed COM port with deprecated read_mac', () => {
 const calls=[];
 const runner=(cmd,args,options)=>{calls.push({cmd,args,options});return 'MAC: 1a:2b:3c:4d:5e:6f'};
 const mac=parseMac(esptool('esptool.exe','COM4','read_mac',[],90000,runner));
 assert.equal(mac,'PA-CLIM-1A2B3C4D5E6F');
 assert.deepEqual(calls[0].args,['--chip','esp32','--port','COM4','--baud','115200','--before','no-reset','--after','no-reset','read-mac']);
 esptool('esptool.exe','COM4','read_flash',['0x0','0x400000','backup.bin'],240000,runner);
 assert.deepEqual(calls[1].args,['--chip','esp32','--port','COM4','--baud','115200','--before','no-reset','--after','no-reset','read-flash','0x0','0x400000','backup.bin']);
 let failed=0;
 const deadPort=()=>{failed++;throw Error('Failed to connect to ESP32: No serial data received at COM4')};
 assert.throws(()=>esptool('esptool.exe','COM4','read_mac',[],90000,deadPort),/No serial data received/);
 assert.equal(failed,1,'Do not fall back to deprecated read_mac after real serial failure');
});

test('esptool launcher preserves actual stdout error when stderr contains only a warning',()=>{
 const code="process.stdout.write('Failed to connect to ESP32: No serial data received on COM4\\n');process.stderr.write('Warning about another option\\n');process.exit(2)";
 assert.throws(()=>spawn(process.execPath,['-e',code]),e=>{
   assert.match(e.message,/Failed to connect to ESP32/);
   assert.match(e.message,/Warning about another option/);
   assert.match(e.message,/exit 2/);
   return true;
 });
});

test('full 4-MiB backup at 115200 has sufficient timeout; never silently truncates at 4 minutes',()=>{
 assert.ok(FLASH_BACKUP_TIMEOUT_MS>=15*60*1000,'4 MiB serial backup must be allowed at least 15 minutes');
 assert.ok(FLASH_BACKUP_TIMEOUT_MS>240000,'Previous 4 minute watchdog was too short');
});
