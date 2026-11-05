const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const Host=require('../../TAKY/LEARNING/transport/central-learning-production-host.js');
const {LocalJsonStrongStore}=require('../../TAKY/LEARNING/transport/local-json-strong-store.js');
const REAL_CENTRAL_QA=process.env.TAKY_QA_REAL_CENTRAL==='1';
const APPROVAL_HOLD_QA=process.argv.includes('--approval-hold');
const pronunciationAuthority=fs.readFileSync(path.resolve(__dirname,'../../Play Camp/src/data/playCampPronunciationAssets.ts'),'utf8');
const pronunciationStatus=/PLAY_CAMP_PRONUNCIATION_SET_STATUS\s*=\s*'([^']+)'/.exec(pronunciationAuthority)?.[1]||'UNKNOWN';
if(APPROVAL_HOLD_QA)assert.equal(pronunciationStatus,'DEV_PLACEHOLDER',
  'the negative-guard scenario may run only with the actual unapproved pronunciation set');
const {chromium}=require('D:/Git PWA/Play Camp/node_modules/playwright-core');

const MOBILE='http://127.0.0.1:4350/';
const READY='http://127.0.0.1:4351/';
const HIDE='http://127.0.0.1:4352/';
const SNAP='http://127.0.0.1:4321/';
const PLAY='http://127.0.0.1:4331/';
const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/learning-loop-multi-specialist-roundtrip-20261010';
fs.mkdirSync(outDir,{recursive:true});
const result={pass:false,scenario:'TAKY MOBILE ㄱ -> READY 3 TASKS -> HIDE -> SNAP -> PLAY CAMP -> READY -> TAKY MOBILE VERIFIED',steps:{},gaps:[],errors:[]};

// Local-only production host with test OAuth signature-verifier and server-owned
// memberships. Real endpoint/storage logic; NEVER a live Google login.
async function openCentralFixture(directory){
 const store=await new LocalJsonStrongStore(directory).init();
 const clientId='TAKY_E2E_LOCAL_AUDIENCE';
 const token='mock-token-abcdefghijklmnop';
 const otherToken='test-other-family-token-abcdefghi';
 const oauth2Client={verifyIdToken:async({idToken,audience})=>{
   assert.deepEqual(audience,[clientId]);
   const sub=idToken===token?'QA_PARENT':idToken===otherToken?'OTHER_PARENT':null;
   if(!sub)throw Error('TEST_OAUTH_SIGNATURE_DENIED');
   const now=Math.floor(Date.now()/1000);
   return {getPayload:()=>({iss:'https://accounts.google.com',aud:clientId,sub,iat:now-30,exp:now+3600})};
 }};
 const lookupMemberships=async({provider,subject})=>{
   assert.equal(provider,'GOOGLE_OIDC');
   if(subject==='QA_PARENT')return [{status:'ACTIVE',family_id:'FAMILY_MOBILE_MULTI',
     self_member_id:'QA_PARENT',role:'PARENT',learning_evidence_submit_member_ids:['mobile-multi-child'],permissions:[]}];
   if(subject==='OTHER_PARENT')return [{status:'ACTIVE',family_id:'OTHER_FAMILY',
     self_member_id:'OTHER_PARENT',role:'PARENT',learning_evidence_submit_member_ids:['OTHER_CHILD'],permissions:[]}];
   return [];
 };
 const host=Host.create({clientIds:[clientId],oauth2Client,lookupMemberships,store,
   verifySpecialistEvidence:async()=>({ok:false}),
   resolveIndexedEvidence:async()=>null,independentIndexOwnerVerifier:()=>null,
   allowedOrigins:['https://play-camp.qa.test']});
 const server=http.createServer(host.handler);
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 return {store,server,base:'http://127.0.0.1:'+server.address().port,token,otherToken};
}
async function closeCentral(server){if(server.listening)await new Promise(resolve=>server.close(resolve));}

(async()=>{
 const centralDir=REAL_CENTRAL_QA?await fs.promises.mkdtemp(path.join(os.tmpdir(),'taky-family-local-e2e-')):null;
 let central=centralDir?await openCentralFixture(centralDir):null;
 let realPacket=null;
 let realEvidenceReceipts=0;
 let realDecisionRequests=0;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.addInitScript((useCentral)=>{
   window.__qaUseCentral=useCentral;
   const d=new Date().toLocaleDateString('sv-SE');
   if(location.port==='4351'&&localStorage.getItem('mobile-multi-seeded')!=='1'){
     localStorage.clear();sessionStorage.clear();
     localStorage.setItem('mobile-multi-seeded','1');
     localStorage.setItem('readyset_active_role_v1','child');
     localStorage.setItem('readyset_identity_v1',JSON.stringify({
       schemaVersion:5,status:'READY',onboardingStep:'DONE',setupMode:'GUARDIAN_FOR_CHILD',
       operator:{role:'CHILD'},userId:'mobile-multi-child',legalName:'목업 아이',nickname:'별이',
       familyRole:'CHILD',schoolStage:'E5',birthDate:'2015-05-01',explorerId:'dubi',explorerName:'두비',
       journeyTheme:'TODAYS_ISLAND',characterSetupState:'DEFERRED_NO_COST',characterVisualId:null
     }));
     localStorage.setItem('readyset_planner_v1',JSON.stringify({version:1,days:{[d]:{localDate:d,tasks:[
       {id:'mobile-hide',task_id:'mobile-hide',subject:'영어',title:'영어',volume:'단어 apple 1개',status:'PLANNED',selected:true,authority:'PLANNER/MAIN',source:'MOBILE_MULTI'},
       {id:'mobile-snap',task_id:'mobile-snap',subject:'영어',title:'영어',volume:'문장 표현 1개',status:'PLANNED',selected:false,authority:'PLANNER/MAIN',source:'MOBILE_MULTI'},
       {id:'mobile-play',task_id:'mobile-play',subject:'영어',title:'영어',volume:'CVC 소리 1개',status:'PLANNED',selected:false,authority:'PLANNER/MAIN',source:'MOBILE_MULTI'}
     ]}}}));
   }
   if(location.port==='4331'){
     const child='mobile-multi-child';
     const profile={
       familyMemberId:child,displayName:'별이',presentationBand:'EARLY_EXPLORER',interests:[],
       boundary:{explorerId:'explorer-mock',islandId:'island-mock',basecampId:'basecamp-mock',activeCrewIds:['dubi']},
       intro:{stage:'MAIN_ISLAND_READY',selectedCrewIds:['dubi'],visualId:null,visualIdentity:null,packedItemIds:[],departureMode:'SAIL',islandName:'목업섬',basecampName:'목업캠프'},
       recentExperiences:[],creations:[]
     };
     localStorage.setItem('taky-play-camp-explorer-profile-v1:'+encodeURIComponent(child),JSON.stringify(profile));
     sessionStorage.setItem('play_camp_family_scope_session_v1','FAMILY_MOBILE_MULTI');
     window.__mockPlayEvidenceCount=0;
     window.TAKY_FAMILY_RUNTIME={
       apiBaseUrl:location.origin+'/',getToken:()=> 'mock-token-abcdefghijklmnop',getFamilyId:()=> 'FAMILY_MOBILE_MULTI',
       fetchImpl:async(input,init={})=>{
         const url=String(input),json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
         if(url.includes('/api/learning/evidence')){
           window.__mockPlayEvidenceCount=(window.__mockPlayEvidenceCount||0)+1;
           if(window.__qaUseCentral)return fetch(input,init);
           const packet=JSON.parse(String(init.body||'{}'));
           return json({ok:true,acknowledgement_kind:'OBSERVATION_INGEST_RECEIPT',packet_id:packet.packet_id,event_id:packet.event?.event_id,storage_confirmed:true});
         }
         if(url.includes('/api/learning/decision'))return window.__qaUseCentral?fetch(input,init):json({ok:false,reason:'MOCK_DECISION_NOT_REQUIRED'},503);
         return fetch(input,init);
       }
     };
   }
 },REAL_CENTRAL_QA);
 const page=await context.newPage();
 if(central){
   await page.route(/\/api\/learning\/(?:evidence|decision)$/,async route=>{
     const request=route.request();const destination=new URL(request.url());
     if(!['4331','4350'].includes(destination.port))return route.continue();
     const body=request.postData()||'';
     if(destination.pathname==='/api/learning/evidence')realPacket=JSON.parse(body);
     const upstream=await fetch(central.base+destination.pathname,{
       method:'POST',headers:{'content-type':'application/json',
         authorization:request.headers().authorization||'',origin:'https://play-camp.qa.test'},body
     });
     const output=await upstream.text();
     if(destination.pathname==='/api/learning/evidence'&&upstream.ok){
       const ack=JSON.parse(output);
       if(ack.storage_confirmed===true&&ack.receipt_scope?.member_id==='mobile-multi-child')realEvidenceReceipts++;
     }
     if(destination.pathname==='/api/learning/decision')realDecisionRequests++;
     await route.fulfill({status:upstream.status,contentType:'application/json',body:output});
   });
 }
 await page.route('**/.netlify/functions/canonical',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({ok:true,repository:'TAKY',fetchedAt:new Date().toISOString(),files:[{path:'TAKY.md',sha:'mockcanonical1234567890'}]})
 }));
 await page.route('**/.netlify/functions/release-status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,status:'UNAVAILABLE',reason:'LOCAL_STATIC_NO_RELEASE_GATEWAY'})}));
 // Synthetic admin session fixture: fixed fake key, no real credential, no backend. Denied until the UI submits it.
 const SYNTHETIC_ADMIN_KEY='TAKY_E2E_SYNTHETIC_ADMIN_KEY_NOT_REAL';
 let adminSessionOn=false;
 const adminProgressRequests=[];
 const json=(route,status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/.netlify/functions/admin-session',async route=>{
   const method=route.request().method();
   if(method==='POST'){
     let key='';try{key=JSON.parse(route.request().postData()||'{}').key}catch{}
     if(key===SYNTHETIC_ADMIN_KEY){adminSessionOn=true;return json(route,200,{authorized:true})}
     return json(route,200,{authorized:false,error:'ADMIN_KEY_DENIED'});
   }
   if(method==='DELETE'){adminSessionOn=false;return json(route,200,{authorized:false})}
   return json(route,200,{authorized:adminSessionOn});
 });
 await page.route('**/.netlify/functions/admin-progress',route=>{
   adminProgressRequests.push({authorized:adminSessionOn});
   return json(route,200,adminSessionOn?{ok:false,error:'ADMIN_PROGRESS_NOT_CONFIGURED'}:{ok:false,error:'ADMIN_AUTH_REQUIRED'});
 });
 page.on('pageerror',e=>result.errors.push('PAGE:'+String(e)));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))result.errors.push('HTTP_'+r.status()+':'+r.url())});

 const mobileUrl=new URL(MOBILE);
 mobileUrl.searchParams.set('ready_target',READY);
 mobileUrl.searchParams.set('hide_target',HIDE);
 mobileUrl.searchParams.set('snap_target',SNAP);
 mobileUrl.searchParams.set('play_camp_target',PLAY);
 await page.goto(mobileUrl.href,{waitUntil:'domcontentloaded',timeout:12000});
 await page.waitForSelector('#appGrid .app-card',{timeout:12000});

 const readyCardOf=()=>page.locator('#appGrid .app-card').filter({hasText:'Ready & Set'}).first();

 // GUEST: admin surfaces stay hidden, no protected data fetched, Ready card is a plain same-tab link.
 await page.waitForFunction(()=>document.getElementById('adminLoginBtn')?.textContent.includes('로그인'),{timeout:8000});
 assert.equal(await page.locator('.nav-btn[data-target="work"]').isVisible(),false,'guest cannot see administrator WORK navigation');
 assert.equal(await page.locator('[data-screen="admin"]').isVisible(),false,'admin screen hidden for guest');
 assert.equal(await page.locator('#input').isVisible(),false,'TAKY composer hidden for guest');
 assert.equal(adminProgressRequests.length,0,'no protected admin data fetched before auth');
 assert.equal(await readyCardOf().locator('[data-app-learning]').count(),0,'guest has no hidden-WORK learning button');
 const guestLink=readyCardOf().locator('[data-app-learning-link="ready-set"]');
 assert.equal(await guestLink.count(),1);
 assert.equal(await guestLink.evaluate(a=>a.tagName),'A');
 assert.equal(await guestLink.getAttribute('href'),READY.replace(/\/$/,''));
 assert.equal(await guestLink.getAttribute('target'),null,'same tab');
 assert.equal(await page.locator('#workList [data-work-execute]').count(),0,'no WORK queue entry before click');
 await guestLink.click();
 await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
 const guestReady=new URL(page.url());
 for(const k of ['taky_mobile_work_id','taky_mobile_nonce','taky_mobile_return_target'])assert.equal(guestReady.searchParams.has(k),false,'guest Ready URL must not carry '+k);
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()}); // re-seed Ready for the admin run
 await page.goBack({waitUntil:'domcontentloaded'});
 await page.waitForURL(url=>url.port==='4350',{timeout:15000});
 await page.waitForSelector('#appGrid .app-card',{timeout:12000});
 assert.equal(await page.locator('#workList [data-work-execute]').count(),0,'guest click created no hidden WORK entry');
 assert.equal(adminProgressRequests.length,0,'still no protected admin data fetched as guest');
 result.steps.guest_ready_link={href:READY.replace(/\/$/,''),workCreated:false,adminDataFetched:false};

 // ADMIN (synthetic session fixture): original learning WORK is created and visibly executable.
 await page.click('#adminLoginBtn');
 await page.fill('#adminLoginKey',SYNTHETIC_ADMIN_KEY);
 await page.click('#adminLoginSubmitBtn');
 await page.waitForFunction(()=>document.querySelector('.screen[data-screen="admin"]')?.hidden===false,{timeout:8000});
 assert.ok(adminProgressRequests.length>=1&&adminProgressRequests.every(r=>r.authorized),'admin data fetched only after auth');
 assert.equal(await page.locator('.nav-btn[data-target="work"]').isVisible(),true,'admin sees WORK navigation');
 await page.locator('.nav-btn[data-target="taky"]').click();
 await readyCardOf().locator('[data-app-learning="ready-set"]').click();
 await page.locator('#workList [data-work-execute]').first().waitFor({state:'visible',timeout:8000});
 assert.equal(await page.locator('.screen.active').getAttribute('data-screen'),'work','admin lands on visible WORK');
 assert.equal(await page.locator('#workList [data-work-execute]').count(),1);
 result.steps.mobile_work_created=true;
 await page.screenshot({path:outDir+'/01-mobile-task.png',animations:'disabled'});

 await page.locator('.nav-btn[data-target="taky"]').click();
 await page.waitForSelector('#input',{state:'visible',timeout:8000});
 await page.fill('#input','ㄱ');
 await page.click('#sendBtn');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
 let readyInbound=new URL(page.url());
 const workId=readyInbound.searchParams.get('taky_mobile_work_id');
 const nonce=readyInbound.searchParams.get('taky_mobile_nonce');
 assert.ok(workId);assert.ok(nonce);
 assert.equal(readyInbound.searchParams.get('hide_target'),HIDE.replace(/\/$/,''));
 assert.equal(readyInbound.searchParams.get('snap_target'),SNAP.replace(/\/$/,''));
 assert.equal(readyInbound.searchParams.get('play_camp_target'),PLAY.replace(/\/$/,''));
 result.steps.mobile_dispatched={workId,targets:3};

 await page.waitForFunction(()=>window.ReadyRoleContextV1?.current?.()==='child'&&window.ReadyHomeHomeworkMVPV1?.tasks?.().length===3,{timeout:15000});
 const started=await page.evaluate(()=>{
   const tasks=ReadyHomeHomeworkMVPV1.tasks();
   const c=ReadyHomeHomeworkMVPV1.createSession(tasks[0]);
   ReadyBaseRuntimeV1.nav('focus');
   return {session_id:c.session_id,tasks:c.tasks.map(t=>({id:t.task_id,label:t.label,suggested_app:t.suggested_app}))};
 });
 assert.deepEqual(started.tasks.map(t=>t.suggested_app),['hide-seek','snap-pop','play-camp']);
 result.steps.ready_session=started;
 await page.screenshot({path:outDir+'/02-ready-session.png',animations:'disabled'});

 // Hide
 await page.evaluate(()=>ReadySetRev07.launchSpecialist('hide-seek'));
 await page.waitForURL(url=>url.port==='4352',{timeout:15000,waitUntil:'domcontentloaded'});
 try {await page.waitForFunction(()=>window.HideTermDecoderV1?.state==='BOUND'&&window.HideSeekBridge?.context?.()?.session_id,{timeout:7000});}
 catch(error){
   const diag=await page.evaluate(()=>({url:location.href,readyState:document.readyState,title:document.title,
     decoder:window.HideTermDecoderV1?.state||null,bridge:window.HideSeekBridge?.context?.()||null,
     loader:document.documentElement.dataset.hideLearningTermLoader||null,
     scripts:[...document.scripts].filter(x=>x.src).map(x=>({src:x.src,loaded:x.readyState||null})).slice(-12),
     body:document.body.innerText.slice(0,600)}));
   console.log('HIDE_BOOT_DIAGNOSTIC',JSON.stringify(diag));
   await page.screenshot({path:outDir+'/hide-boot-diagnostic.png'});
   throw error;
 }
 await page.waitForFunction(()=>document.documentElement.dataset.hideLearningTermLoader==='BOUND',{timeout:12000});
 await page.evaluate(()=>HideTermDecoderV1.registerCards([{
   id:'mobile-multi-apple',term:'apple',meaning:'사과',subject:'ENGLISH',
   components:[{text:'apple',meaning:'사과'}],conceptLinks:['과일','먹거리']
 }],{replace:true,engineOwned:true,projection:{school_stage:'E5',subject:'ENGLISH',grade_context:{state:'RESOLVED',school_stage:'E5',base_band:'UPPER_ELEMENTARY',effective_band:'UPPER_ELEMENTARY',evidence_step:0}}}));
 await page.evaluate(()=>HideTermDecoderV1.open('TRACE'));
 await page.screenshot({path:outDir+'/03-hide-trace.png',animations:'disabled'});
 await page.click('#termTraceReveal');await page.click('[data-trace-result="SELF_KNOWN"]');
 await page.evaluate(()=>HideSeekBridge.returnToBase('COMPLETED',{mobile_multi:true}));
 await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ReadySetRev07?.contract?.()?.tasks?.[0]?.state==='COMPLETED',{timeout:12000});
 readyInbound=new URL(page.url());
 assert.equal(readyInbound.searchParams.get('taky_mobile_work_id'),workId);
 assert.equal(readyInbound.searchParams.get('taky_mobile_nonce'),nonce);
 result.steps.hide_done=true;

 // Snap
 const snapStart=await page.evaluate(()=>{
   const c=ReadySetRev07.contract();ReadySetRev07.switchTask(c.tasks[1].task_id);
   const p=JSON.parse(localStorage.getItem('readyset_planner_v1')||'{}');
   const status=Object.values(p.days||{}).flatMap(d=>d.tasks||[]).find(t=>t.id==='mobile-snap')?.status;
   ReadySetRev07.launchSpecialist('snap-pop');return status;
 });
 assert.equal(snapStart,'IN_PROGRESS');
 await page.waitForURL(url=>url.port==='4321',{timeout:15000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SnapPopBridge?.context?.()?.session_id&&document.querySelectorAll('#landmarks .landmark').length>0,{timeout:15000});
 await page.click('#landmarks .landmark');await page.waitForFunction(()=>!document.getElementById('selection').hidden,{timeout:8000});
 await page.click('#startBtn');
 await page.screenshot({path:outDir+'/04-snap-expression.png',animations:'disabled'});
 for(const answer of ['첫 생각','이유를 연결한 생각','내 문장으로 정리']){await page.fill('#answer',answer);await page.click('#nextBtn');await page.waitForTimeout(300)}
 await page.waitForFunction(()=>window.SnapPopBridge?.context?.()?.task_completed===true,{timeout:8000});
 await page.click('#snapBaseCampChip');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ReadySetRev07?.contract?.()?.tasks?.[1]?.state==='COMPLETED',{timeout:12000});
 readyInbound=new URL(page.url());
 assert.equal(readyInbound.searchParams.get('taky_mobile_work_id'),workId);
 assert.equal(readyInbound.searchParams.get('taky_mobile_nonce'),nonce);
 result.steps.snap_done=true;

 // Play Camp
 const playStart=await page.evaluate(()=>{
   const c=ReadySetRev07.contract();ReadySetRev07.switchTask(c.tasks[2].task_id);
   const p=JSON.parse(localStorage.getItem('readyset_planner_v1')||'{}');
   const status=Object.values(p.days||{}).flatMap(d=>d.tasks||[]).find(t=>t.id==='mobile-play')?.status;
   ReadySetRev07.launchSpecialist('play-camp');return status;
 });
 assert.equal(playStart,'IN_PROGRESS');
 // Cold Vite module transforms can delay DOMContentLoaded although Chrome has
 // already navigated. Observe navigation commit, then require the actual bridge
 // and rendered learner choices; do not treat navigation alone as success.
 await page.waitForURL(url=>url.port==='4331',{timeout:20000,waitUntil:'commit'});
 await page.waitForFunction(()=>window.PlayCampReadyBridge?.linked?.()===true&&document.querySelectorAll('.camp-zone-button').length>0,{timeout:45000});
 await page.locator('.camp-zone-button').filter({hasText:'English'}).first().click();
 await page.waitForSelector('.english-sound-scene',{state:'visible',timeout:10000});
 await page.screenshot({path:outDir+'/05-play-camp.png',animations:'disabled'});
 const stones=page.locator('.phoneme-stone');assert.equal(await stones.count(),3);
 for(let i=0;i<3;i++)await stones.nth(i).click();
 await page.click('.english-blend');
 if(APPROVAL_HOLD_QA){
   // A visual-only blend with unapproved phonics audio is NOT sound-learning
   // completion. Verify the real child UI and Ready bridge fail closed.
   await page.waitForSelector('.english-reveal.is-visible',{timeout:12000});
   const guard=await page.evaluate(()=>({
     linked:window.PlayCampReadyBridge?.linked?.(),
     completed:window.PlayCampReadyBridge?.context?.()?.task_completed,
     submittedEvidence:Number(window.__mockPlayEvidenceCount||0),
     returnState:document.getElementById('playCampReadyReturn')?.dataset.taskState,
     screenMessage:document.querySelector('.english-audio-status')?.textContent||''
   }));
   assert.equal(guard.linked,true);
   assert.notEqual(guard.completed,true,'unapproved sound never completes the CVC task');
   assert.equal(guard.submittedEvidence,0,'no sound-learning packet on visually blended letters');
   assert.equal(guard.returnState,'PARTIAL');
   await page.locator('#playCampReadyReturn').click();
   await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.ReadySetRev07?.contract?.()?.tasks?.length===3,{timeout:12000});
   const readyHold=await page.evaluate(()=>({
     tasks:window.ReadySetRev07.contract().tasks.map(t=>t.state),
     origin:new URL(location.href).searchParams.get('from_app'),
     taskState:new URL(location.href).searchParams.get('task_state')
   }));
   assert.deepEqual(readyHold.tasks.slice(0,2),['COMPLETED','COMPLETED']);
   assert.notEqual(readyHold.tasks[2],'COMPLETED');
   // Ready consumes and sanitizes specialist receipt query parameters after
   // applying them; the visible address must not retain those one-time hints.
   assert.equal(readyHold.taskState,null,'handled task state is cleared from URL');
   assert.equal(readyHold.origin,null,'specialist origin is cleared from URL');
   result.steps.play_unapproved_guard={...guard,readyHold,sourceStatus:pronunciationStatus};
   // The original negative test returned here and never inspected the final
   // parent-facing handoff. A partially completed day must not silently turn
   // into a three-task completion receipt when the session is closed.
   await page.locator('#completeBtn').click();
   await page.waitForFunction(()=>!!document.getElementById('rev07ConfirmEnd')&&!document.getElementById('rev07ConfirmEnd').disabled,{timeout:8000});
   await page.evaluate(()=>document.getElementById('rev07ConfirmEnd').click());
   await page.waitForSelector('#readyTakyMobileReturn',{state:'visible',timeout:10000});
   const partialResult=await page.evaluate(()=>({
     headline:document.getElementById('resultHeadline')?.innerText||'',
     taskRows:[...document.querySelectorAll('#resultTasks [data-result-task]')].map(x=>({
       state:x.getAttribute('data-result-state'),text:x.innerText
     }))
   }));
   assert.equal(partialResult.taskRows.length,3);
   assert.deepEqual(partialResult.taskRows.map(x=>x.state),['COMPLETED','COMPLETED','PARTIAL'],
     'the result sheet must not claim sound learning was completed');
   assert.doesNotMatch(partialResult.headline,/3개 완료/);
   result.steps.ready_partial_receipt=partialResult;
   await page.screenshot({path:outDir+'/06-ready-approval-hold-result.png',animations:'disabled'});
   await page.locator('#readyTakyMobileReturn').click();
   await page.waitForURL(url=>url.port==='4350',{timeout:15000,waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.getElementById('workList')?.innerText.includes('LEARNING_LOOP_RESULT_RECEIVED'),{timeout:12000});
   const mobilePartial=await page.evaluate(()=>({
     workText:document.getElementById('workList')?.innerText||'',
     traceText:document.getElementById('traceList')?.innerText||'',
     url:location.href
   }));
   assert.match(mobilePartial.workText,/LEARNING_LOOP_RESULT_RECEIVED/);
   assert.match(mobilePartial.traceText,/LEARNING_LOOP_RETURN/);
   result.steps.mobile_partial_return={
     work_state_label:(mobilePartial.workText.match(/COMPLETED|PARTIAL|FAILED/) || [null])[0],
     work_receipt_received:true,
     has_unsafe_url_params:['taky_mobile_work_id','taky_mobile_nonce','task_state','event_id']
       .some(k=>new URL(mobilePartial.url).searchParams.has(k))
   };
   assert.equal(result.steps.mobile_partial_return.work_state_label,'PARTIAL',
     'parent-facing mobile work must remain partial after an unapproved sound activity');
   assert.equal(result.steps.mobile_partial_return.has_unsafe_url_params,false);
   await page.screenshot({path:outDir+'/07-mobile-approval-hold-return.png',animations:'disabled'});
   result.pass=true;
   result.verdict='NEGATIVE_APPROVAL_GUARD_PASS_NOT_FULL_THREE_APP_COMPLETION';
   result.gaps.push('FULL_THREE_APP_COMPLETION_NEEDS_APPROVED_AUDIO_AND_REAL_DEVICE');
   if(central){
     // Read the actual durable learning store rather than trusting the UI's
     // local mock counter. Unapproved phoneme audio must NEVER be promoted as
     // cross-device learning knowledge, even after a local backend restart.
     const key='families/FAMILY_MOBILE_MULTI/members/mobile-multi-child/learning-engine/state-v1';
     const before=await central.store.getWithMetadata(key);
     const observations=before?.data?.observation_only?.length||0;
     const verified=before?.data?.verified_evidence?.length||0;
     assert.equal(realEvidenceReceipts,0,'UNAPPROVED_SOUND_SENT_CENTRAL_LEARNING_PACKET');
     assert.equal(observations,0,'UNAPPROVED_SOUND_PERSISTED_OBSERVATION');
     assert.equal(verified,0,'UNAPPROVED_SOUND_PERSISTED_VERIFIED_LEARNING');
     await closeCentral(central.server);
     central=await openCentralFixture(centralDir);
     const after=await central.store.getWithMetadata(key);
     assert.equal(after?.data?.observation_only?.length||0,0,
       'CENTRAL_RESTART_RESTORED_UNAPPROVED_AUDIO_LEARNING');
     assert.equal(after?.data?.verified_evidence?.length||0,0,
       'CENTRAL_RESTART_RESTORED_UNAPPROVED_VERIFIED_EVIDENCE');
     result.steps.central_unapproved_sound_guard={
       backend:'REAL_TAKY_CENTRAL_HOST_LOCAL_FIXTURE',
       observed:0,verified:0,packets:0,after_restart_observations:0,
       real_google_auth_verified:false,external_provider_writes:false};
   }
   fs.writeFileSync(outDir+'/approval-hold-result.json',JSON.stringify(result,null,2));
   console.log(JSON.stringify({contract:'TAKY_MOBILE_PLAY_AUDIO_APPROVAL_HOLD_V1',pass:true,
     state:result.verdict,source:pronunciationStatus,completed:readyHold.tasks,
     evidence:guard.submittedEvidence}));
   await context.close();await browser.close();
   if(central)await closeCentral(central.server);
   if(centralDir)await fs.promises.rm(centralDir,{recursive:true,force:true});
   return;
 }
 await page.waitForFunction(()=>window.PlayCampReadyBridge?.context?.()?.task_completed===true&&Number(window.__mockPlayEvidenceCount||0)>=1,{timeout:10000});
 await page.click('#playCampReadyReturn');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ReadySetRev07?.contract?.()?.tasks?.[2]?.state==='COMPLETED',{timeout:12000});
 readyInbound=new URL(page.url());
 assert.equal(readyInbound.searchParams.get('taky_mobile_work_id'),workId);
 assert.equal(readyInbound.searchParams.get('taky_mobile_nonce'),nonce);
 result.steps.play_done=true;

 const beforeEnd=await page.evaluate(()=>{
   const c=ReadySetRev07.contract();
   const p=JSON.parse(localStorage.getItem('readyset_planner_v1')||'{}');
   return {
     states:c.tasks.map(t=>t.state),
     planner:Object.values(p.days||{}).flatMap(d=>d.tasks||[]).map(t=>({id:t.id,status:t.status,source:t.learningReports?.at(-1)?.source||null}))
   };
 });
 assert.ok(beforeEnd.states.every(s=>s==='COMPLETED'));
 assert.deepEqual(beforeEnd.planner.map(t=>t.source),['hide-seek','snap-pop','play-camp']);
 result.steps.ready_all_completed=beforeEnd;

 await page.locator('#completeBtn').click();
 await page.waitForFunction(()=>!!document.getElementById('rev07ConfirmEnd')&&!document.getElementById('rev07ConfirmEnd').disabled,{timeout:8000});
 await page.evaluate(()=>document.getElementById('rev07ConfirmEnd').click());
 await page.waitForSelector('#readyTakyMobileReturn',{state:'visible',timeout:10000});
 await page.waitForSelector('#resultTasks [data-result-task]',{timeout:10000});
 assert.equal(await page.locator('#resultTasks [data-result-task]').count(),3);
 assert.match(await page.locator('#resultHeadline').innerText(),/3개 탐험 · 3개 완료/);
 for(const [i,app] of ['Hide & Seek','Snap & Pop','Play Camp'].entries()){
   const row=page.locator('#resultTasks [data-result-task]').nth(i);
   assert.match(await row.innerText(),new RegExp(app));
   assert.equal(await row.getAttribute('data-result-state'),'COMPLETED');
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Ready result must have no horizontal overflow');
 assert.equal(await page.locator('#takyCrewSelectionLauncher').isVisible(),false,'companion launcher must not cover the final receipt');
 await page.screenshot({path:outDir+'/06-ready-result.png',animations:'disabled'});
 await page.evaluate(()=>ReadyBaseRuntimeV1.nav('history'));
 const history=await page.locator('#historyList').innerText();
 for(const app of ['Hide & Seek','Snap & Pop','Play Camp'])assert.match(history,new RegExp(app),'history retains '+app);
 await page.evaluate(()=>ReadyBaseRuntimeV1.nav('result'));
 await page.evaluate(()=>{
   window.__readyShareDrawnTexts=[];
   const previous=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,...args){
     window.__readyShareDrawnTexts.push(String(text));
     return previous.call(this,text,...args);
   };
 });
 const downloadPromise=page.waitForEvent('download',{timeout:10000});
 await page.locator('#shareResultBtn').click();
 const shareDownload=await downloadPromise;
 assert.match(shareDownload.suggestedFilename(),/Ready_Set_result_.*\.png$/);
 await shareDownload.saveAs(outDir+'/08-ready-share-card.png');
 assert.ok(fs.statSync(outDir+'/08-ready-share-card.png').size>10000);
 const drawn=(await page.evaluate(()=>window.__readyShareDrawnTexts)).join('');
 assert.ok(!drawn.includes('[object Object]'),'share card must not stringify record objects');
 for(const term of ['apple','CVC'])assert.ok(drawn.includes(term),'share card missing '+term);
 const readyRecord=await page.evaluate(()=>{
   const core=JSON.parse(localStorage.getItem('readyset_state')||'{}');
   return (core.records||[])[0]||null;
 });
 assert.equal(readyRecord.label,'오늘 과제 3개');
 assert.equal(readyRecord.tasks.length,3);
 await page.click('#readyTakyMobileReturn');

 await page.waitForURL(url=>url.port==='4350',{timeout:15000,waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('workList')?.innerText.includes('LEARNING_LOOP_RESULT_RECEIVED'),{timeout:12000});
 const mobileAfter=await page.evaluate(()=>({
   workText:document.getElementById('workList')?.innerText||'',
   traceText:document.getElementById('traceList')?.innerText||'',
   url:location.href
 }));
 assert.match(mobileAfter.workText,/오늘 학습 실행/);
 assert.match(mobileAfter.workText,/COMPLETED/);
 assert.match(mobileAfter.workText,/LEARNING_LOOP_RESULT_RECEIVED/);
 assert.match(mobileAfter.traceText,/LEARNING_LOOP_RETURN/);
 assert.deepEqual(result.errors,[]);
 const clean=new URL(mobileAfter.url);
 for(const k of ['taky_mobile_work_id','taky_mobile_nonce','session_id','task_state','from_app','event_id'])assert.equal(clean.searchParams.has(k),false,k);
 for(const [key,target] of [['ready_target',READY],['hide_target',HIDE],['snap_target',SNAP],['play_camp_target',PLAY]]) assert.equal(clean.searchParams.get(key),target.replace(/\/$/,''),key+' must survive for next session');
 result.steps.mobile_verified={state:'COMPLETED',receipt:'LEARNING_LOOP_RESULT_RECEIVED',returnParamsCleared:true};
 await page.screenshot({path:outDir+'/07-mobile-verified.png',animations:'disabled'});
 if(central){
   assert.ok(realPacket&&realEvidenceReceipts>=1,'BROWSER_EVIDENCE_NOT_ACCEPTED_BY_REAL_SERVER');
   const key='families/FAMILY_MOBILE_MULTI/members/mobile-multi-child/learning-engine/state-v1';
   const before=await central.store.getWithMetadata(key);
   assert.ok(before?.data?.observation_only?.length>=1,'CENTRAL_DURABLE_OBSERVATION_NOT_STORED');
   const savedCount=before.data.observation_only.length;
   await closeCentral(central.server);
   central=await openCentralFixture(centralDir);
   const persisted=await central.store.getWithMetadata(key);
   assert.equal(persisted?.data?.observation_only?.length,savedCount,'DURABLE_STORAGE_LOST_ON_RESTART');
   const post=async(route,data,token=central.token)=>{
     const resp=await fetch(central.base+route,{method:'POST',
       headers:{'content-type':'application/json',authorization:'Bearer '+token,origin:'https://play-camp.qa.test'},
       body:JSON.stringify(data)});
     return {status:resp.status,body:await resp.json()};
   };
   const session=await post('/api/family/session',{});
   assert.equal(session.status,200);
   assert.equal(session.body.session.families[0].family_id,'FAMILY_MOBILE_MULTI');
   assert.ok(session.body.session.families[0].authorized_member_ids.includes('mobile-multi-child'));
   const scope={family_id:'FAMILY_MOBILE_MULTI',member_id:'mobile-multi-child',
     subject:realPacket.context.subject,concept_skill_target:realPacket.context.concept_skill_target};
   const after=await post('/api/learning/decision',scope);
   assert.equal(after.status,200,JSON.stringify(after.body));
   assert.equal(after.body.runtime_result.trace.verified_evidence_count,0);
   assert.equal(after.body.runtime_result.trace.observation_review_evidence_count,1,
     'SCOPED_OBSERVATION_MUST_BE_READABLE_AFTER_RESTART');
   const wrongSibling=await post('/api/learning/decision',{...scope,member_id:'OTHER_CHILD'});
   const otherFamily=await post('/api/learning/decision',scope,central.otherToken);
   const badToken=await post('/api/learning/decision',scope,'not-authorized-token-000000');
   assert.equal(wrongSibling.status,403);
   assert.equal(otherFamily.status,403);
   assert.equal(badToken.status,401);
   const replay=await post('/api/learning/evidence',realPacket);
   assert.equal(replay.status,200,JSON.stringify(replay.body));
   assert.equal((await central.store.getWithMetadata(key)).data.observation_only.length,savedCount);
   const member=await post('/api/family/member-profile',{
     action:'PUBLISH',family_id:'FAMILY_MOBILE_MULTI',member_id:'mobile-multi-child',
     projection:{member_id:'mobile-multi-child',profile_version:1,display_name:'별이',
       legal_name:'시험 학습자',nickname:'별이',family_role:'CHILD',birth_date:'2015-05-01',
       school_stage:'E5',share_name_mode:'NAME_NICKNAME',status:'CONFIRMED',
       updated_at:'2026-10-16T00:00:00.000Z'}
   });
   assert.equal(member.status,200,JSON.stringify(member.body));
   await page.route('**/api/family/**',async route=>{
     const req=route.request(),dest=new URL(req.url());
     if(dest.port!=='4350')return route.continue();
     const upstream=await fetch(central.base+dest.pathname,{method:'POST',
       headers:{'content-type':'application/json',
         authorization:req.headers().authorization||'',origin:'https://play-camp.qa.test'},
       body:req.postData()||'{}'});
     await route.fulfill({status:upstream.status,contentType:'application/json',body:await upstream.text()});
   });
   await page.evaluate(()=>{
     const readSession=async()=>{
       const reply=await fetch('/api/family/session',{method:'POST',
         headers:{'content-type':'application/json',authorization:'Bearer mock-token-abcdefghijklmnop'},body:'{}'});
       if(!reply.ok)throw Error('CENTRAL_SESSION_REQUIRED');
       return (await reply.json()).session.families[0];
     };
     globalThis.TAKY_FAMILY_RUNTIME={
       apiBaseUrl:location.origin+'/',
       getToken:async()=> 'mock-token-abcdefghijklmnop',
       getFamilyId:async()=>(await readSession()).family_id,
       currentSession:readSession
     };
     dispatchEvent(new Event('taky-central-auth-ready'));
   });
   await page.waitForFunction(()=>document.querySelectorAll('#familyHub [data-family-members] .family-member-choice').length===2,{timeout:12000});
   await page.locator('#familyHub [data-family-members] .family-member-choice').last().click();
   await page.waitForFunction(()=>document.querySelector('[data-family-learning-status]')?.textContent?.includes('관찰 1건'),{timeout:12000});
   const visibleLearning=await page.locator('[data-family-learning-status]').innerText();
   assert.match(visibleLearning,/관찰 1건/);
   assert.match(visibleLearning,/검증된 성과 0건/);
   assert.match(await page.locator('[data-family-detail]').innerText(),/별이/);
   await page.locator('[data-family-learning]').evaluate(e=>e.scrollIntoView({block:'start'}));
   const visibility=await page.evaluate(()=>{
     const panel=document.querySelector('[data-family-learning]');
     const rect=panel.getBoundingClientRect();
     const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
     return {y,readable:y>80&&y<innerHeight-120&&panel.contains(document.elementFromPoint(x,y))};
   });
   assert.equal(visibility.readable,true,'FAMILY_LEARNING_COVERED_BY_STICKY_COMPOSER');
   await page.screenshot({path:outDir+'/08-mobile-central-learning-restored.png',animations:'disabled'});
   result.steps.mobile_central_learning_read={status:'CENTRAL_LEARNING_READ',observed:1,verified:0,browser_visible:true};
   await page.evaluate(()=>{delete globalThis.TAKY_FAMILY_RUNTIME;dispatchEvent(new Event('taky-central-auth-cleared'))});
   await page.waitForFunction(()=>document.querySelector('#familyHub')?.dataset.learningState==='UNBOUND');
   assert.equal(await page.locator('#familyHub [data-family-private]').isVisible(),false);
   result.steps.mobile_central_learning_read.signout_hides_records=true;
   result.steps.central_durable_backend={
     backend:'REAL_TAKY_CENTRAL_PRODUCTION_HOST_WITH_LOCAL_OAUTH_FIXTURE',
     observed_browser_receipts:realEvidenceReceipts,real_decision_requests:realDecisionRequests,
     observation_count_after_restart:savedCount,session_membership:'SERVER_OWNED',
     sibling_denied:403,other_family_denied:403,invalid_token_denied:401,
     replay_idempotent:true,verified_learning_evidence:0,
     live_google_auth_verified:false,live_provider_writes:false};
   await closeCentral(central.server);
   await fs.promises.rm(centralDir,{recursive:true,force:true});
 }
 result.pass=true;
 fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 await context.close();await browser.close();
})().catch(async e=>{
 result.errors.push(String(e?.stack||e));fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));console.error(e);process.exit(1);
});