// Run against a local Vite server with VITE_SUPABASE_URL=http://127.0.0.1:4178
// and a synthetic anon key. All database/API traffic is fulfilled locally.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(process.argv[2] || import.meta.url)
const {chromium}=require('playwright')
const admin='00000000-0000-4000-8000-000000000001'
const roster=Array.from({length:65},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,employee_number:i+1,first_name:i<57?'Active':'Former',last_name:`Fixture${i}`,active:i<57,hire_date:'2024-01-01',termination_date:i<57?null:'2025-01-01',plant_location:'NJ',position:'worker',pay_type:'hourly',hourly_rate:20,zkt_enabled:false,default_lunch_hours:1}))
const user={id:admin,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',user_metadata:{role:'admin'}}
const token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:admin,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.')
const browser=await chromium.launch({headless:true,channel:process.argv[3]||'msedge'})
let checks=0
try{
 for(const width of [1638,390]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const flags={former_employees_archive_readonly:true,employee_terminate:false,employee_rehire:false,employee_number_reuse:false}
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
    else if(resource==='profiles')data=[{id:admin,role:'admin',full_name:'Synthetic Admin'}]
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
  await page.goto('http://127.0.0.1:4177/dashboard')
  await page.getByRole('link',{name:'Former Employees',exact:true}).waitFor()
  await page.getByRole('link',{name:'Former Employees',exact:true}).click()
  await page.getByRole('heading',{name:'Former Employees'}).waitFor()
  await page.getByRole('link',{name:'View',exact:true}).first().waitFor()
  assert.equal(await page.getByRole('link',{name:'View',exact:true}).count(),8)
  assert.equal(await page.getByRole('link',{name:'Rehire',exact:true}).count(),0)
  await page.getByRole('link',{name:'View',exact:true}).first().click()
  await page.getByRole('heading',{name:/Employment history/}).waitFor({timeout:10000}).catch(async error=>{throw Error(`${error.message}\nSynthetic page: ${await page.locator('body').innerText()}\nErrors: ${errors.join('; ')}`)})
  assert.equal(await page.getByRole('button',{name:'Rehire',exact:true}).count(),0)
  await page.goto('http://127.0.0.1:4177/employees')
  await page.getByRole('heading',{name:'Active Employees',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Terminate Employee',exact:true}).count(),0)
  assert.equal(await page.getByText(/Former Fixture/).count(),0)
  await page.goto('http://127.0.0.1:4177/dashboard')
  await page.getByRole('button',{name:'Add employee',exact:true}).click()
  const number=page.locator('input[type="number"]').first()
  assert.equal(await number.getAttribute('readonly'),null)
  await number.fill('66')
  assert.equal(await number.inputValue(),'66')
  assert.equal(await page.getByText('Checking available number…').count(),0)
  assert.deepEqual(errors,[])
  assert.equal(created,undefined,'Archive navigation must not create employees')
  await page.getByPlaceholder('First name',{exact:true}).fill('Synthetic')
  await page.getByPlaceholder('Last name',{exact:true}).fill('Creation')
  const manualSaved=page.waitForResponse(response=>response.url().includes('/rest/v1/employees')&&response.request().method()==='POST')
  await page.getByRole('button',{name:'Add employee',exact:true}).last().click()
  await manualSaved
  assert.equal(created.employee_number,66,'Archive-only save must retain the entered number')
  assert.equal(integrationCalls,0,'OFF actions must not invoke the new integration API')
  flags.employee_number_reuse=true
  flags.employee_rehire=true
  await page.reload()
  await page.getByRole('link',{name:'Former Employees',exact:true}).waitFor()
  await page.getByRole('button',{name:'Add employee',exact:true}).click()
  await page.getByPlaceholder('Allocated automatically').waitFor()
  assert.notEqual(await page.getByPlaceholder('Allocated automatically').getAttribute('readonly'),null)
  await page.getByPlaceholder('First name',{exact:true}).fill('Synthetic')
  await page.getByPlaceholder('Last name',{exact:true}).fill('Allocation')
  const autoSaved=page.waitForResponse(response=>response.url().includes('/rest/v1/employees')&&response.request().method()==='POST')
  await page.getByRole('button',{name:'Add employee',exact:true}).last().click()
  await autoSaved
  await page.getByRole('status').filter({hasText:'SACS identity synchronized. Terminal provisioning is tracked separately.'}).waitFor()
  assert.equal(created.employee_number,null,'Released automatic allocation must be assigned by the database')
  assert.equal(integrationCalls,1)
  assert.deepEqual(errors,[])
  checks+=9
  await context.close()
 }
 console.log(JSON.stringify({passed:true,checks,desktop:1638,mobile:390,mode:'synthetic local API only'}))
}finally{await browser.close()}
