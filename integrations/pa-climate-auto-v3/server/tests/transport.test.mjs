import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {codec,permittedPath} from '../../integration/realtime-https-transport.mjs';
test('Transport authenticates ciphertext, direction and request identity; supports OTA-sized messages',()=>{
 const secret=crypto.randomBytes(32).toString('hex'),c=codec(secret),id=crypto.randomUUID();
 const value={at:Date.now(),body:crypto.randomBytes(1100000).toString('base64')};
 const encrypted=c.seal(value,'response',id);
 assert.deepEqual(c.open(encrypted,'response',id),value);
 assert.throws(()=>c.open(encrypted,'request',id));assert.throws(()=>c.open(encrypted,'response',crypto.randomUUID()));
 assert.throws(()=>codec(crypto.randomBytes(32).toString('hex')).open(encrypted,'response',id));
 const altered=JSON.parse(encrypted);altered.data=altered.data.slice(0,50)+'A'+altered.data.slice(51);assert.throws(()=>c.open(JSON.stringify(altered),'response',id));
});
test('HTTPS transport has no route to MSI raw admin or other applications',()=>{
 for(const path of ['/climate-local/v1/admin/zones','/climate/v1/admin/zones','/rest/v1/','/auth/v1/health','/climate/../climate-local/v1/admin/devices'])assert.equal(permittedPath('GET',path,true),false);
 assert.equal(permittedPath('GET','/climate/healthz'),true);
 assert.equal(permittedPath('POST','/climate/v1/exchange'),true);
 assert.equal(permittedPath('GET','/climate/operator/zones'),false);
 assert.equal(permittedPath('GET','/climate/operator/zones',true),true);
});
