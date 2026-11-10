import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../web/api-pa-climate-msi.js';
test('Site proxy verifies JWT/allowlist and forwards only the user JWT to the MSI operator route',async t=>{
  const keys=['PA_CLIMATE_MSI_BASE_URL','PA_CLIMATE_ALLOWED_USER_IDS','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  Object.assign(process.env,{PA_CLIMATE_MSI_BASE_URL:'https://msi.example/climate',PA_CLIMATE_ALLOWED_USER_IDS:'owner',VITE_SUPABASE_URL:'https://auth.example',VITE_SUPABASE_ANON_KEY:'public-test-key'});
  const token='test-user-jwt-'.repeat(4);let user='owner',calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(url.startsWith('https://auth.example')?{id:user}:{zones:[]});};
  const run=async(req)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};await handler(req,res);return res;};
  let r=await run({method:'GET',headers:{}});assert.equal(r.code,401);
  r=await run({method:'GET',headers:{authorization:'Bearer '+token},query:{}});assert.equal(r.code,200);
  assert.equal(calls[1].url,'https://msi.example/climate/operator/zones');
  assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
  assert.equal(calls[1].options.redirect,'error');
  user='other';calls=[];r=await run({method:'GET',headers:{authorization:'Bearer '+token},query:{}});assert.equal(r.code,403);assert.equal(calls.length,1);
  user='owner';r=await run({method:'POST',headers:{authorization:'Bearer '+token},body:{action:'register'}});assert.equal(r.code,400);
});
