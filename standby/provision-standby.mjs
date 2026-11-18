import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
const ROOT='E:/SimScopeData/Farmplast/PayrollStandby'
if(process.platform!=='win32')throw Error('MSI Windows provisioning only')
const privateRoot=path.join(ROOT,'private')
const settingsFile=path.join(privateRoot,'credentials.json')
try{await fs.access(settingsFile);throw Error('Standby is already provisioned; refuse implicit credential rotation')}catch(error){if(error.code!=='ENOENT')throw error}
const password=()=>crypto.randomBytes(36).toString('base64url')
const jwtSecret=password()
const token=role=>{
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const message=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10*365*86400})
 return message+'.'+crypto.createHmac('sha256',jwtSecret).update(message).digest('base64url')
}
const credentials={dbPassword:password(),authPassword:password(),restPassword:password(),jwtSecret,anonKey:token('anon'),serviceKey:token('service_role'),createdAt:new Date().toISOString()}
await fs.writeFile(settingsFile,JSON.stringify(credentials,null,2),{flag:'wx'})
const images={
 db:'supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b',
 auth:'supabase/gotrue@sha256:839f529492d116b4e8b7777c953a27c381d34c15a744b1bcefde5eefaa1f9f9f',
 rest:'postgrest/postgrest@sha256:c847127074bd26e1b8d3f7c0e6e01e5346f4b85dd34f5d699fd230af960827c0',
 storage:'supabase/storage-api@sha256:92c5fe87ba5291915d0c21ca530ece9a58e13cc76a36a6c84fc69121a8dde799'
}
const config={project:'eeobivvwjzakbweluwtm',root:ROOT,url:'https://msi.tail4626fb.ts.net:9444',mode:'standby',gatewayPort:18640,dbPort:18622,authPort:18623,restPort:18621,clusterName:'farmplast-payroll-standby',composeProject:'farmplast-payroll-standby',dockerHost:'npipe:////./pipe/dockerDesktopLinuxEngine',images}
await fs.mkdir(path.join(ROOT,'runtime','empty-init'),{recursive:true})
await fs.writeFile(path.join(ROOT,'config.json'),JSON.stringify(config,null,2),{flag:'wx'})
const compose={
 name:config.composeProject,
 services:{
  db:{image:images.db,pull_policy:'never',container_name:'farmplast-payroll-db',restart:'unless-stopped',
   environment:{POSTGRES_PASSWORD:credentials.dbPassword,POSTGRES_USER:'postgres',POSTGRES_DB:'payroll_base',PGDATA:'/var/lib/postgresql/data',POSTGRES_INITDB_ARGS:'--encoding=UTF8 --locale=C'},
   command:['postgres','-D','/var/lib/postgresql/data','-c','cluster_name='+config.clusterName,'-c','listen_addresses=*','-c','max_connections=60','-c','log_statement=none','-c','log_min_error_statement=panic','-c','timezone=UTC'],
   ports:['127.0.0.1:18622:5432'],
   volumes:['payroll-db:/var/lib/postgresql/data',path.join(ROOT,'runtime','empty-init').replaceAll('\\','/')+':/docker-entrypoint-initdb.d:ro'],
   healthcheck:{test:['CMD-SHELL','pg_isready -U postgres -d payroll_base'],interval:'5s',timeout:'5s',retries:30}
  },
  auth:{image:images.auth,pull_policy:'never',container_name:'farmplast-payroll-auth',restart:'unless-stopped',profiles:['api'],ports:['127.0.0.1:18623:9999'],
   environment:{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:config.url+'/supabase',GOTRUE_SITE_URL:config.url,
    GOTRUE_URI_ALLOW_LIST:config.url+'/**',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgresql://supabase_auth_admin:'+credentials.authPassword+'@db:5432/payroll_uninitialized',
    GOTRUE_DB_MAX_POOL_SIZE:'5',GOTRUE_JWT_SECRET:credentials.jwtSecret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_DISABLE_SIGNUP:'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_LOG_LEVEL:'error'}
  },
  rest:{image:images.rest,pull_policy:'never',container_name:'farmplast-payroll-rest',restart:'unless-stopped',profiles:['api'],ports:['127.0.0.1:18621:3000'],
   environment:{PGRST_DB_URI:'postgresql://authenticator:'+credentials.restPassword+'@db:5432/payroll_uninitialized',PGRST_DB_SCHEMAS:'public',
    PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:credentials.jwtSecret,
    PGRST_SERVER_PORT:'3000',PGRST_DB_POOL:'8',PGRST_LOG_LEVEL:'crit',PGRST_DB_MAX_ROWS:'1000'}
  }
 },
 volumes:{'payroll-db':{name:'farmplast-payroll-standby-data'}},
 networks:{default:{name:'farmplast-payroll-standby'}}
}
await fs.writeFile(path.join(privateRoot,'compose.json'),JSON.stringify(compose,null,2),{flag:'wx'})
await fs.writeFile(path.join(ROOT,'runtime','status.json'),JSON.stringify({mode:'standby',ready:false,reason:'initializing',sourceRemains:'Supabase'},null,2))
await fs.writeFile(path.join(ROOT,'runtime','public-build.json'),JSON.stringify({url:config.url,anonKey:credentials.anonKey},null,2))
console.log(JSON.stringify({provisioned:true,project:config.project,url:config.url}))
