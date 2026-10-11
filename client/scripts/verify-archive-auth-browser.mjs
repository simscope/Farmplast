// Run against a local Vite server with VITE_SUPABASE_URL=http://127.0.0.1:4178
// and a synthetic anon key. All database/API traffic is fulfilled locally.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(process.argv[2] || import.meta.url)
const {chromium}=require('playwright')
const admin='00000000-0000-4000-8000-000000000001'
const roster=Array.from({length:65},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,employee_number:i+1,first_name:i<57?'Active':'Former',last_name:`Fixture${i}`,active:i<57,hire_date:'2024-01-01',termination_date:i<57?null:'2025-01-01',plant_location:'NJ',position:'worker',pay_type:'hourly',hourly_rate:20,zkt_enabled:false,default_lunch_hours:1}))
const user={id:admin,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',user_metadata:{}}
const token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:admin,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.')
const browser=await chromium.launch({headless:true,channel:process.argv[3]||'msedge'})
let checks=0
try{
 for(const scenario of [{role:'admin',on:true},{role:'admin',on:false},{role:'user',on:true}]) for(const width of [1638,390]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const flags={former_employees_archive_readonly:scenario.on,employee_terminate:false,employee_rehire:false,employee_number_reuse:false}
  let created
  let integrationCalls=0
  await context.addInitScript(({token,user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user})
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.origin==='http://127.0.0.1:4177'&&!url.pathname.startsWith('/api/'))return route.continue()
   let data=[]
   if(url.pathname==='/api/employee-safety-history')data={records:[],assignments:[],group_assignments:[],next_offset:null}
   if(url.pathname==='/api/employee-integrations'){integrationCalls++;data={results:[{status:'succeeded'}]}}
   if(url.pathname.endsWith('/employee_work_logs')&&request.method()!=='GET')throw Error('Profile creation must not rewrite historical Attendance')
   if(url.pathname.endsWith('/rpc/process_zkt_attendance_to_work_logs'))throw Error('Profile creation must not rebuild historical Attendance')
   if(url.origin==='http://127.0.0.1:4178'){
    const resource=url.pathname.split('/').at(-1)
    if(url.pathname.includes('/auth/'))data=user
    else if(resource==='profiles'){await new Promise(r=>setTimeout(r,750));data=[{id:admin,role:scenario.role,full_name:'Synthetic Profile'}]}
    else if(resource==='employee_feature_flags_status')data=flags
    else if(resource==='employee_archive_capabilities')data={lifecycle:false}
    else if(resource==='next_available_employee_number')data=66
    else if(resource==='employee_lifecycle_blockers')data=['Terminate/Rehire release gate is OFF']
    else if(resource==='list_former_employees')data=roster.filter(e=>!e.active)
    else if(resource==='employees'){
     if(request.method()==='POST'){
      created=JSON.parse(request.postData());data={...(Array.isArray(created)?created[0]:created),id:'00000000-0000-4000-8000-000000000999'}
     }else{
      data=roster.filter(e=>(!url.searchParams.has('id')||url.searchParams.get('id')===`eq.${e.id}`)&&(!url.searchParams.has('active')||e.active))
      if(request.headers().accept?.includes('vnd.pgrst.object'))data=data[0]
     }
    }
   }else if(url.origin!=='http://127.0.0.1:4177')throw Error(`Unexpected external request: ${url.origin}`)
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}})
  })
  await page.goto('http://127.0.0.1:4177/employees/former');
  await page.waitForTimeout(2000);
  const body=await page.locator('body').innerText();
  const expected=scenario.role==='admin'?'http://127.0.0.1:4177/employees/former':'http://127.0.0.1:4177/dashboard';
  assert.equal(page.url(),expected);
  if(scenario.role==='admin'&&scenario.on){assert.equal(await page.getByRole('link',{name:'View',exact:true}).count(),8);}
  if(scenario.role==='admin'&&!scenario.on)assert.match(body,/archive is disabled/);
  if(scenario.role==='user')assert.equal(await page.getByRole('heading',{name:'Former Employees',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Rehire',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Terminate Employee',exact:true}).count(),0);
  assert.equal(integrationCalls,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,scenario,url:page.url(),result:'PASS'}));
  await context.close();
 }
}finally{await browser.close()}
