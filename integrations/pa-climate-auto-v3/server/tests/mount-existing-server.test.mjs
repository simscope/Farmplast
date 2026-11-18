import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {createClimateRoute} from '../app.mjs';

test('Existing MSI HTTP gateway mounts /climate with no second listener',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'climate-mount-'));
 const {route}=createClimateRoute({dir,adminKey:'b'.repeat(64),publicOrigin:'https://public.example/climate'});
 const server=http.createServer((req,res)=>{route(req,res,()=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('EXISTING');}).catch(e=>{res.statusCode=500;res.end('error')})});
 try {
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base=`http://127.0.0.1:${server.address().port}`;
  const health=await fetch(base+'/climate/healthz');
  assert.equal(health.status,200);
  assert.equal((await health.json()).service,'farmplast-pa-climate');
  const unrelated=await fetch(base+'/overview');
  assert.equal(await unrelated.text(),'EXISTING');
  const unprefixed=await fetch(base+'/v1/admin/zones');
  assert.equal(await unprefixed.text(),'EXISTING');
  const secured=await fetch(base+'/climate/v1/admin/zones');
  assert.equal(secured.status,401);
  const authorized=await fetch(base+'/climate/v1/admin/zones',{headers:{Authorization:'Bearer '+'b'.repeat(64)}});
  assert.equal(authorized.status,200);
 } finally {
  if(server.listening)await new Promise(ok=>server.close(ok));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});