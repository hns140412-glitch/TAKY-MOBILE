const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('D:/Git PWA/Play Camp/node_modules/playwright-core');

const MOBILE='http://127.0.0.1:4350/';
const READY='http://127.0.0.1:4351/';
const HIDE='http://127.0.0.1:4352/';
const SNAP='http://127.0.0.1:4321/';
const PLAY='http://127.0.0.1:4331/';
const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/device-mock-audit-20261011/path-migration-e2e';
fs.mkdirSync(outDir,{recursive:true});
const result={pass:false,scenario:'TAKY MOBILE ㄱ -> READY 3 TASKS -> HIDE -> SNAP -> PLAY CAMP -> READY -> TAKY MOBILE VERIFIED',steps:{},gaps:[],errors:[]};

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-extensions','--disable-background-networking']});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
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
       {id:'mobile-hide',task_id:'mobile-hide',subject:'영어',title:'영어',volume:'apple 1개',status:'PLANNED',selected:true,authority:'PLANNER/MAIN',source:'MOBILE_MULTI'},
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
           const packet=JSON.parse(String(init.body||'{}'));
           return json({ok:true,acknowledgement_kind:'OBSERVATION_INGEST_RECEIPT',packet_id:packet.packet_id,event_id:packet.event?.event_id,storage_confirmed:true});
         }
         if(url.includes('/api/learning/decision'))return json({ok:false,reason:'MOCK_DECISION_NOT_REQUIRED'},503);
         return fetch(input,init);
       }
     };
   }
 });
 const page=await context.newPage();
 await page.route('**/.netlify/functions/canonical',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({ok:true,repository:'TAKY',fetchedAt:new Date().toISOString(),files:[{path:'TAKY.md',sha:'mockcanonical1234567890'}]})
 }));
 page.on('pageerror',e=>result.errors.push('PAGE:'+String(e)));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))result.errors.push('HTTP_'+r.status()+':'+r.url())});

 const mobileUrl=new URL(MOBILE);
 mobileUrl.searchParams.set('ready_target',READY);
 mobileUrl.searchParams.set('hide_target',HIDE);
 mobileUrl.searchParams.set('snap_target',SNAP);
 mobileUrl.searchParams.set('play_camp_target',PLAY);
 await page.goto(mobileUrl.href,{waitUntil:'commit',timeout:20000});
 await page.waitForSelector('#appGrid .app-card',{timeout:12000});

 const readyCard=page.locator('#appGrid .app-card').filter({hasText:'Ready & Set'}).first();
 await readyCard.locator('[data-app-learning="ready-set"]').click();
 await page.waitForSelector('#workList [data-work-execute]',{timeout:8000});
 result.steps.mobile_work_created=true;

 await page.locator('.nav-btn[data-target="taky"]').click();
 await page.fill('#input','ㄱ');
 await page.click('#sendBtn');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});
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

 // Hide
 await page.evaluate(()=>ReadySetRev07.launchSpecialist('hide-seek'));
 await page.waitForURL(url=>url.port==='4352',{timeout:15000});
 await page.waitForFunction(()=>window.HideTermDecoderV1?.state==='BOUND'&&window.HideSeekBridge?.context?.()?.session_id,{timeout:15000});
 await page.waitForFunction(()=>document.documentElement.dataset.hideLearningTermLoader==='BOUND',{timeout:12000});
 await page.evaluate(()=>HideTermDecoderV1.registerCards([{
   id:'mobile-multi-apple',term:'apple',meaning:'사과',subject:'ENGLISH',
   components:[{text:'apple',meaning:'사과'}],conceptLinks:['과일','먹거리']
 }],{replace:true,engineOwned:true,projection:{school_stage:'E5',subject:'ENGLISH',grade_context:{state:'RESOLVED',school_stage:'E5',base_band:'UPPER_ELEMENTARY',effective_band:'UPPER_ELEMENTARY',evidence_step:0}}}));
 await page.evaluate(()=>HideTermDecoderV1.open('TRACE'));
 await page.click('#termTraceReveal');await page.click('[data-trace-result="SELF_KNOWN"]');
 await page.evaluate(()=>HideSeekBridge.returnToBase('COMPLETED',{mobile_multi:true}));
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});
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
 await page.waitForURL(url=>url.port==='4321',{timeout:15000});
 await page.waitForFunction(()=>window.SnapPopBridge?.context?.()?.session_id&&document.querySelectorAll('#landmarks .landmark').length>0,{timeout:15000});
 await page.click('#landmarks .landmark');await page.waitForFunction(()=>!document.getElementById('selection').hidden,{timeout:8000});
 await page.click('#startBtn');
 for(const answer of ['첫 생각','이유를 연결한 생각','내 문장으로 정리']){await page.fill('#answer',answer);await page.click('#nextBtn');await page.waitForTimeout(300)}
 await page.waitForFunction(()=>window.SnapPopBridge?.context?.()?.task_completed===true,{timeout:8000});
 await page.click('#snapBaseCampChip');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});
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
 await page.waitForURL(url=>url.port==='4331',{timeout:15000});
 await page.waitForFunction(()=>window.PlayCampReadyBridge?.linked?.()===true&&document.querySelectorAll('.camp-zone-button').length>0,{timeout:18000});
 await page.locator('.camp-zone-button').filter({hasText:'English'}).first().click();
 await page.waitForSelector('.english-sound-scene',{state:'visible',timeout:10000});
 const stones=page.locator('.phoneme-stone');assert.equal(await stones.count(),3);
 for(let i=0;i<3;i++)await stones.nth(i).click();
 await page.click('.english-blend');
 await page.waitForFunction(()=>window.PlayCampReadyBridge?.context?.()?.task_completed===true&&Number(window.__mockPlayEvidenceCount||0)>=1,{timeout:10000});
 await page.click('#playCampReadyReturn');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});
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

 await page.evaluate(()=>ReadyHomeHomeworkMVPV1.endSession());
 await page.waitForFunction(()=>!!document.getElementById('rev07ConfirmEnd')&&!document.getElementById('rev07ConfirmEnd').disabled,{timeout:8000});
 await page.evaluate(()=>document.getElementById('rev07ConfirmEnd').click());
 await page.waitForSelector('#readyTakyMobileReturn',{state:'visible',timeout:10000});
 const readyRecord=await page.evaluate(()=>{
   const core=JSON.parse(localStorage.getItem('readyset_state')||'{}');
   return (core.records||[])[0]||null;
 });
 assert.equal(readyRecord.label,'오늘 과제 3개');
 assert.equal(readyRecord.tasks.length,3);
 await page.click('#readyTakyMobileReturn');

 await page.waitForURL(url=>url.port==='4350',{timeout:15000});
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
 result.steps.mobile_verified={state:'COMPLETED',receipt:'LEARNING_LOOP_RESULT_RECEIVED',returnParamsCleared:true};
 result.pass=true;
 fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 await context.close();await browser.close();
})().catch(async e=>{
 result.errors.push(String(e?.stack||e));fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));console.error(e);process.exit(1);
});