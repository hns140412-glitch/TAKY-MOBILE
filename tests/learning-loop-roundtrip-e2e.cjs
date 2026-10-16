const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('D:/Git PWA/Play Camp/node_modules/playwright-core');

const MOBILE='http://127.0.0.1:4350/';
const READY='http://127.0.0.1:4351/';
const HIDE='http://127.0.0.1:4352/';
const outDir='D:/Git PWA/TAKY-MOBILE/artifacts/learning-loop-roundtrip-20261010';
fs.mkdirSync(outDir,{recursive:true});
const result={pass:false,scenario:'TAKY MOBILE ㄱ -> READY -> HIDE -> READY SESSION END -> TAKY MOBILE VERIFIED',steps:{},errors:[]};
const today=()=>new Date().toLocaleDateString('sv-SE');
const shot=async(page,name)=>page.screenshot({path:outDir+'/'+name+'.png',fullPage:true}).catch(()=>{});

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
   if(location.port!=='4351')return;
   if(localStorage.getItem('mobile-loop-e2e-seeded')==='1')return;
   localStorage.clear();sessionStorage.clear();
   const d=new Date().toLocaleDateString('sv-SE');
   localStorage.setItem('mobile-loop-e2e-seeded','1');
   localStorage.setItem('readyset_active_role_v1','parent');
   localStorage.setItem('readyset_identity_v1',JSON.stringify({
     schemaVersion:5,status:'READY',onboardingStep:'DONE',setupMode:'GUARDIAN_FOR_CHILD',
     operator:{role:'GUARDIAN'},userId:'mobile-loop-child',legalName:'목업 보호자',nickname:'별이',
     familyRole:'CHILD',schoolStage:'E5',birthDate:'2015-05-01',explorerId:'dubi',explorerName:'두비',
     journeyTheme:'TODAYS_ISLAND',characterSetupState:'DEFERRED_NO_COST',characterVisualId:null
   }));
   localStorage.setItem('readyset_planner_v1',JSON.stringify({
     version:1,days:{[d]:{localDate:d,tasks:[{
       id:'mobile-loop-planner-task',task_id:'mobile-loop-planner-task',
       subject:'영어',title:'영어',volume:'apple 1개',status:'PLANNED',selected:true,
       authority:'PLANNER/MAIN',source:'MOBILE_E2E',
       sourceAssignmentId:'mobile-loop-assignment',sourceUnitId:'mobile-loop-unit'
     }]}}
   }));
 });

 const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(String(e)));
 const mobileUrl=new URL(MOBILE);
 mobileUrl.searchParams.set('ready_target',READY);
 mobileUrl.searchParams.set('hide_target',HIDE);
 await page.goto(mobileUrl.href,{waitUntil:'domcontentloaded',timeout:12000});
 await page.waitForSelector('#appGrid .app-card',{timeout:12000});
 const readyCard=page.locator('#appGrid .app-card').filter({hasText:'Ready & Set'}).first();
 await readyCard.locator('[data-app-learning="ready-set"]').click();
 await page.waitForSelector('#workList [data-work-execute]',{timeout:8000});
 const before=await page.locator('#workList').innerText();
 assert.match(before,/오늘 학습 실행/);
 assert.match(before,/PLANNED/);
 result.steps.mobile_work_created=true;
 await shot(page,'01-mobile-work-planned');

 // actual ㄱ from the TAKY chat surface
 await page.locator('.nav-btn[data-target="taky"]').click();
 await page.fill('#input','ㄱ');
 await page.click('#sendBtn');
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});
 const readyInbound=new URL(page.url());
 assert.ok(readyInbound.searchParams.get('taky_mobile_work_id'));
 assert.ok(readyInbound.searchParams.get('taky_mobile_nonce'));
 assert.equal(readyInbound.searchParams.get('from_app'),'taky-mobile');
 assert.equal(readyInbound.searchParams.get('hide_target'),HIDE.replace(/\/$/,''));
 result.steps.mobile_dispatched_to_ready={
   workId:readyInbound.searchParams.get('taky_mobile_work_id'),
   hasNonce:true,
   hideTarget:readyInbound.searchParams.get('hide_target')
 };

 // switch Ready to child, preserving mobile return correlation
 await page.waitForFunction(()=>window.ReadyRoleContextV1?.current?.()==='parent'&&window.ReadyHomeHomeworkMVPV1?.tasks?.().length===1,{timeout:15000});
 await page.evaluate(()=>ReadyRoleContextV1.switchRole('child'));
 await page.waitForFunction(()=>ReadyRoleContextV1?.current?.()==='child'&&window.ReadyHomeHomeworkMVPV1?.tasks?.().length===1,{timeout:12000});

 const started=await page.evaluate(()=>{
   const task=ReadyHomeHomeworkMVPV1.tasks()[0];
   const session=ReadyHomeHomeworkMVPV1.createSession(task);
   ReadyBaseRuntimeV1.nav('focus');
   return {session_id:session.session_id,task_id:session.active_task_id,planner_id:task.planner_id};
 });
 assert.ok(started.session_id);
 const stillCorrelated=new URL(page.url());
 assert.ok(stillCorrelated.searchParams.get('taky_mobile_work_id'));
 assert.ok(stillCorrelated.searchParams.get('taky_mobile_nonce'));
 result.steps.ready_session_started=started;
 await shot(page,'02-ready-focus');

 // Ready -> Hide
 await page.evaluate(()=>ReadySetRev07.launchSpecialist('hide-seek'));
 await page.waitForURL(url=>url.port==='4352',{timeout:15000});
 await page.waitForFunction(()=>window.HideTermDecoderV1?.state==='BOUND'&&window.HideSeekBridge?.context?.()?.session_id,{timeout:15000});
 await page.waitForFunction(()=>document.documentElement.dataset.hideLearningTermLoader==='BOUND',{timeout:12000});
 const hc=await page.evaluate(()=>HideSeekBridge.context());
 assert.equal(hc.session_id,started.session_id);

 await page.evaluate(()=>HideTermDecoderV1.registerCards([{
   id:'mobile-loop-apple',term:'apple',meaning:'사과',subject:'ENGLISH',
   components:[{text:'apple',meaning:'사과'}],conceptLinks:['과일','먹거리']
 }],{replace:true,engineOwned:true,projection:{school_stage:'E5',subject:'ENGLISH',grade_context:{state:'RESOLVED',school_stage:'E5',base_band:'UPPER_ELEMENTARY',effective_band:'UPPER_ELEMENTARY',evidence_step:0}}}));
 await page.evaluate(()=>HideTermDecoderV1.open('TRACE'));
 await page.waitForSelector('#termTraceReveal',{timeout:8000});
 await page.click('#termTraceReveal');
 await page.click('[data-trace-result="SELF_KNOWN"]');
 const ev=await page.evaluate(()=>HideTermDecoderV1.snapshot().evidence.slice(-1)[0]);
 assert.equal(ev.mode,'TRACE');
 assert.equal(ev.term,'apple');
 result.steps.hide_evidence={mode:ev.mode,term:ev.term,result:ev.result};
 await page.evaluate(()=>HideSeekBridge.returnToBase('COMPLETED',{mobile_roundtrip:true}));
 await page.waitForURL(url=>url.port==='4351',{timeout:15000});

 // Ready consumes specialist result; finish full session
 await page.waitForFunction(()=>window.ReadySetRev07?.contract?.()?.tasks?.[0]?.state==='COMPLETED',{timeout:12000});
 const returnCorrelation=new URL(page.url());
 assert.ok(returnCorrelation.searchParams.get('taky_mobile_work_id'));
 assert.ok(returnCorrelation.searchParams.get('taky_mobile_nonce'));
 const readyState=await page.evaluate(()=>{
   const c=ReadySetRev07.contract();
   const p=JSON.parse(localStorage.getItem('readyset_planner_v1')||'{"days":{}}');
   const task=Object.values(p.days||{}).flatMap(x=>x.tasks||[]).find(x=>x.id==='mobile-loop-planner-task');
   return {session:c.session_id,taskState:c.tasks[0].state,plannerStatus:task.status,source:task.learningReports?.at(-1)?.source};
 });
 assert.equal(readyState.taskState,'COMPLETED');
 assert.equal(readyState.plannerStatus,'COMPLETED');
 assert.equal(readyState.source,'hide-seek');

 await page.evaluate(()=>ReadyHomeHomeworkMVPV1.endSession());
 await page.waitForFunction(()=>!!document.getElementById('rev07ConfirmEnd')&&!document.getElementById('rev07ConfirmEnd').disabled,{timeout:8000});
 await page.evaluate(()=>document.getElementById('rev07ConfirmEnd').click());
 await page.waitForSelector('#readyTakyMobileReturn',{state:'visible',timeout:10000});
 const returnHref=await page.evaluate(()=>document.getElementById('readyTakyMobileReturn')?.onclick?true:false);
 assert.equal(returnHref,true);
 await shot(page,'03-ready-completed-mobile-return');

 // explicit return to TAKY Mobile
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
 assert.match(mobileAfter.traceText,/AWAITING_RESULT/);
 assert.match(mobileAfter.traceText,/LEARNING_LOOP_RETURN/);
 const cleanUrl=new URL(mobileAfter.url);
 for(const k of ['taky_mobile_work_id','taky_mobile_nonce','session_id','task_state','from_app','event_id'])assert.equal(cleanUrl.searchParams.has(k),false,k);
 result.steps.mobile_result_received={state:'COMPLETED',receipt:'LEARNING_LOOP_RESULT_RECEIVED',awaitingTracePreserved:true,returnParamsCleared:true};
 await shot(page,'04-mobile-work-completed');

 result.pass=true;
 fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 await context.close();await browser.close();
})().catch(async e=>{
 result.errors.push(String(e?.stack||e));fs.writeFileSync(outDir+'/result.json',JSON.stringify(result,null,2));console.error(e);process.exit(1);
});