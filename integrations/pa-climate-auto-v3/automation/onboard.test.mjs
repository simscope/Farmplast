import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,parseMac,nextZone,provisioningPayload,localApiBase} from './onboard.mjs';

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