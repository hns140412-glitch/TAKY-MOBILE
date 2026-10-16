import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base='D:/Git PWA/';
const apps=[
  {port:4350,path:base+'TAKY-MOBILE'},
  {port:4351,path:base+'Ready & Set'},
  {port:4352,path:base+'Hide & Seek'},
  {port:4321,path:base+'Snap & Pop'},
];
const procs=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(port){
 for(let n=0;n<45;n++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(650)});
    if([200,304].includes(r.status))return true;}catch{}
  await sleep(250);
 }throw new Error('LOCAL_PORT_NOT_READY '+port);
}
function spawnServer(name,exe,args,cwd){
 const p=spawn(exe,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
 p.stdout.on('data',b=>{if(process.env.TAKY_QA_VERBOSE==='1')process.stdout.write('['+name+'] '+b)});
 p.stderr.on('data',b=>{if(process.env.TAKY_QA_VERBOSE==='1')process.stderr.write('['+name+'] '+b)});
 procs.push(p);return p;
}
async function verifyOfflineBoundary(name,file,cwd,required){
 const output=await new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,[file],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
  let data='';let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;proc.kill()},120000);
  const collect=b=>{data+=(String(b));if(data.length>250000){proc.kill()}};
  proc.stdout.on('data',collect);proc.stderr.on('data',collect);
  proc.on('error',reject);
  proc.on('close',code=>{clearTimeout(timer);resolve({code,data,timedOut})});
 });
 if(output.code!==0||output.timedOut||!required.test(output.data)){
  throw new Error('FAMILY_INTEGRATION_'+name+'_HOLD '+JSON.stringify({exit:output.code,timeout:output.timedOut,tail:output.data.slice(-850)}));
 }
 const count=output.data.match(/\btests\s+(\d+)/);
 return {status:'PASS',exit:output.code,...(count?{tests:Number(count[1])}:{})};
}
async function verifyFamilyAndSavey(){
 const dir=base+'TAKY-MOBILE/artifacts/learning-loop-multi-specialist-roundtrip-20261010';
 const filename=path.join(dir,'result.json');
 const report=JSON.parse(await readFile(filename,'utf8'));
 if(report.pass!==true||report.steps?.mobile_verified?.receipt!=='LEARNING_LOOP_RESULT_RECEIVED'){
  throw new Error('FIVE_APP_RESULT_NOT_VERIFIED');
 }
 const central=report.steps?.central_durable_backend;
 if(central?.observed_browser_receipts<1||central?.observation_count_after_restart<1||
    central?.sibling_denied!==403||central?.other_family_denied!==403||
    central?.invalid_token_denied!==401||central?.replay_idempotent!==true||
    central?.live_google_auth_verified!==false){
   throw new Error('LOCAL_CENTRAL_AUTH_AND_DURABILITY_NOT_VERIFIED');
 }
 const proof={state:'IN_PROGRESS',scope:'FIVE_REAL_LOCAL_APP_BROWSERS_PLUS_MOCK_FAMILY_AND_SAVEY_AUTH',
  external_api_calls:0,model_calls:0,live_family_or_finance_credentials_used:false,checks:{}};
 report.local_family_acceptance=proof;
 const save=async()=>writeFile(filename,JSON.stringify(report,null,2));
 await save();
 const cases=[
  ['central-family-write',base+'TAKY-MOBILE/tests/two-family-evidence-mock.cjs',base+'TAKY-MOBILE',/"pass":\s*true/],
  ['central-family-learning',base+'TAKY-MOBILE/tests/two-family-learning-consumption-mock.cjs',base+'TAKY-MOBILE',/"pass":true/],
  ['mobile-admin-browser',base+'TAKY-MOBILE/tests/admin-console-browser-e2e.mjs',base+'TAKY-MOBILE',/"pass":true/],
  ['mobile-family-session-browser',base+'TAKY-MOBILE/tests/family-hub-browser-e2e.mjs',base+'TAKY-MOBILE',/FAMILY_HUB_BROWSER_PASS child-only/],
  ['mobile-google-login-browser',base+'TAKY-MOBILE/tests/family-google-login-browser-e2e.mjs',base+'TAKY-MOBILE',/CENTRAL_FAMILY_LOGIN_BROWSER_PASS missing-membership/],
  ['mobile-login-bootstrap',base+'TAKY-MOBILE/tests/family-auth-config.test.mjs',base+'TAKY-MOBILE',/\btests\s+6[\s\S]*\bpass\s+6[\s\S]*\bfail\s+0/],
  ['savey-finance-roles',base+'SAVEY/tests/run.mjs',base+'SAVEY',/\btests\s+(\d+)[\s\S]*\bpass\s+\1[\s\S]*\bfail\s+0/],
 ];
 try{
  for(const [name,file,cwd,marker] of cases){
   proof.checks[name]=await verifyOfflineBoundary(name,file,cwd,marker);
   await save();
   console.log('LOCAL_FAMILY_BOUNDARY_PASS',name,proof.checks[name].tests??'');
  }
  proof.state='PASS';await save();
  console.log('LOCAL_FAMILY_SIX_SURFACE_ACCEPTANCE_PASS',JSON.stringify(proof));
 }catch(error){proof.state='HOLD';proof.reason=String(error);await save();throw error;}
}
async function cleanup(){
 await Promise.all(procs.map(async p=>{try{if(p.pid&&process.platform==='win32'){
  await new Promise(resolve=>{
   const k=spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
   k.on('close',resolve);k.on('error',resolve);
  });}else p.kill();}catch{}}));
}
try {
 for(const a of apps){
   if(a.port===4350){
     const qaHost=base+'TAKY/ENFORCEMENT/family_qa_local_static_host.cjs';
     if(!existsSync(qaHost))throw new Error('EXISTING_TAKY_LOCAL_QA_HOST_REQUIRED');
     spawnServer('TAKY-MOBILE',process.execPath,[qaHost,a.path,String(a.port)],a.path);
   }else spawnServer(String(a.port),'python',['-m','http.server',String(a.port),'--bind','127.0.0.1','--directory',a.path],a.path);
 }
 const play=base+'Play Camp';
 const built=play+'/dist';
 if(!existsSync(built+'/index.html'))throw new Error('PLAY_CAMP_BUILD_REQUIRED');
 // Serve the same production-built assets without keeping Vite in memory.
 // This avoids a fifth build tool process during family use and Chrome QA.
 spawnServer('4331','python',['-m','http.server','4331','--bind','127.0.0.1','--directory',built],play);
 await Promise.all([...apps.map(x=>x.port),4331].map(ready));
 console.log('LOCAL_FIVE_APP_SERVERS_READY');
 if(process.argv.includes('--preview')){
   const u=new URL('http://127.0.0.1:4350/');
   for(const [k,value] of [['ready_target','http://127.0.0.1:4351/'],['hide_target','http://127.0.0.1:4352/'],['snap_target','http://127.0.0.1:4321/'],['play_camp_target','http://127.0.0.1:4331/']])u.searchParams.set(k,value);
   if(process.argv.includes('--no-browser')){
     console.log('LOCAL_PREVIEW_READINESS_PASS',u.origin);
   }else{
     const gallery=new URL('../artifacts/learning-loop-multi-specialist-roundtrip-20261010/index.html',import.meta.url).href;
     const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
     if(!existsSync(chrome))throw new Error('LOCAL_CHROME_MISSING');
     const profile=await mkdtemp(path.join(tmpdir(),'taky-family-preview-'));
     try{
       console.log('TAKY_FAMILY_PREVIEW_OPENED: local screenshot journey and interactive five-app view');
       console.log('TO_FINISH: close the dedicated Chrome preview window');
       const child=spawn(chrome,['--user-data-dir='+profile,'--no-first-run','--disable-extensions','--disable-background-mode','--new-window',gallery,u.href],{stdio:'ignore',windowsHide:false});
       const timer=setTimeout(()=>{console.log('PREVIEW_MAX_60_MINUTES_REACHED');child.kill()},3600000);
       timer.unref();
       await new Promise(resolve=>{child.on('close',resolve);child.on('error',resolve)});
       clearTimeout(timer);
     }finally{
       await sleep(600);
       await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
     }
   }
 }else{
   const proc=spawn(process.execPath,[base+'TAKY-MOBILE/tests/learning-loop-multi-specialist-roundtrip-e2e.cjs'],{
     cwd:base+'TAKY-MOBILE',windowsHide:true,stdio:'inherit',
     env:{...process.env,TAKY_QA_REAL_CENTRAL:process.argv.includes('--family-six')?'1':'0'}
   });
   const exitCode=await new Promise(resolve=>{proc.on('close',c=>resolve(c??1));proc.on('error',()=>resolve(1))});
   console.log('LOCAL_FAMILY_JOURNEY_E2E_RESULT',exitCode===0?'PASS':'FAIL',exitCode);
   if(exitCode!==0){process.exitCode=exitCode;}
   else if(process.argv.includes('--family-six')){
     await verifyFamilyAndSavey();
   }
 }
}finally{await cleanup();console.log('LOCAL_TEST_SERVERS_CLOSED');}
