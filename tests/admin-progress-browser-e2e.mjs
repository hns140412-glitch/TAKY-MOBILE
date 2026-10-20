import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const PORT=4293,base='http://127.0.0.1:'+PORT+'/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,base).pathname.slice(1)||'index.html',f=path.resolve(ROOT,decodeURIComponent(rel));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end('not found')}
 res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
let admin=false,preAuthDataCalls=0;
let fixture={ok:true,schema:'TAKY_MOBILE_ADMIN_PROGRESS_SNAPSHOT_V1',generatedAt:'2026-10-18T14:00:00Z',
 counts:{projects:9,work:7,blocked:2,review:3,open:2,verified:0},
 coverage:{historicalChats:25,octoberNativeChats:0},
 projects:[{id:'TAKY',signal:'BLOCKED_TASK_RECORDED',registered:'IDLE',current:'IDLE',workCount:7,historicalChats:36,relayCandidates:19,latestCodeAt:'2026-10-17T06:00:00Z'}],
 work:[{id:'TAKY-CHAT-'+'a'.repeat(32),project:'TAKY',title:'원문 마이닝 교차검증',status:'BLOCKED',executor:'Claude',reviewer:'UNASSIGNED',receiptCount:2,outputCount:1,lastReceipt:'PASS',verified:false}],
 alerts:[{kind:'PROJECT_STATUS_DRIFT_CANDIDATE',project:'TAKY',note:'IDLE 기록과 작업 진행 기록 대조 필요'}]};
fixture.work[0].kernelExact={relation:'EXACT_REGISTERED_TASK_ID',preflightCount:1,invokedCount:1,unknownCount:0,routeRecoveryCount:1};
fixture.work[0].preparedSourceState='PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD';
fixture.projects[0].currentProjectionShaMatched=true;
fixture.counts.sourceHeadGuardStatus='WORKTREE_STATIC_PASS_HEAD_REPLAY_HOLD';
fixture.counts.headModifiedReachableSources=2;
fixture.projects[0].observedRecoveryState='LOCAL_WIP_OBSERVED_CURRENT_IDLE_REVIEW_REQUIRED';
fixture.projects[0].headEntrypointIntegrity='HTML_ENTRYPOINT_DIFFERS_FROM_HEAD';
fixture.projects[0].headSourceParity='SOURCE_DIFFERS_FROM_HEAD_NO_REPLAY_CLAIM';
fixture.projects[0].headSourceDriftCount=2;
fixture.projects[0].currentWorkIdRegistered=false;
fixture.projects[0].sourceReferenceCount=0;
fixture.projects[0].outputReferenceCount=0;
fixture.projects[0].pendingGateCount=0;
fixture.lineage={authority:'DERIVED_VIEW_ONLY_NOT_GLOBAL_CURRENT',nativeChatCount:0,topicCount:0,projectCurrentProjectionHashMatches:1,projectCount:1,exactWorkKernelLinks:1};
fixture.kernel={source:'TAKY2_RUNTIME_READ_ONLY_NON_CANONICAL',observedFileModifiedAt:'2026-10-18T01:00:00Z',runtimeVersion:1,preflightReceipts:1,executionCallReceipts:1,actualInvocationReceipts:1,returnedReceipts:1,outcomeUnknownReceipts:0,failedReceipts:0,registeredRouteRecoveries:1,doneGateRecords:1,exactWorkLinks:1};
if(process.env.TAKY_ADMIN_E2E_LOCAL_SNAPSHOT==='1'){
 const f=process.env.TAKY_ADMIN_E2E_SNAPSHOT_FILE||path.join(ROOT,'artifacts','admin-progress-local-only.json');
 assert.ok(fs.existsSync(f),'actual local snapshot missing');
 const source=JSON.parse(fs.readFileSync(f,'utf8'));
 fixture={ok:true,...source,work:source.work.map(w=>({
   ...w,classificationAvailable:w.evidenceState==='DERIVED_RECORD_NOT_INDEPENDENT_EXECUTION_PROOF'
 }))};
 assert.equal(fixture.counts.projects,9);
}
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
   admin=false;const context=await browser.newContext({viewport,serviceWorkers:'block'});
   await context.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.origin!==base.slice(0,-1))return route.abort();
     if(u.pathname==='/.netlify/functions/admin-session'){
       if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,authorized:admin})});
       if(route.request().method()==='POST'){const key=route.request().postDataJSON()?.key;admin=key==='local-qa-admin-only';return route.fulfill({status:admin?200:401,contentType:'application/json',body:JSON.stringify({ok:admin,authorized:admin})})}
       if(route.request().method()==='DELETE'){admin=false;return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'})}
     }
     if(u.pathname==='/.netlify/functions/admin-progress'){if(!admin)preAuthDataCalls++;return route.fulfill({status:admin?200:401,contentType:'application/json',body:JSON.stringify(admin?fixture:{ok:false,error:'ADMIN_AUTH_REQUIRED'})})}
     return route.continue();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base,{waitUntil:'load'});
   await page.waitForTimeout(300);
   assert.equal(await page.locator('.nav-btn[data-target="admin"]').isVisible(),false,'admin tab hidden before authentication');
   assert.equal(await page.locator('.nav-btn[data-target="ops"]').isVisible(),false,'OPS is not public');
   assert.equal(await page.locator('#operationsPanel').isVisible(),false,'operations panel is private');
   assert.equal(await page.locator('#appGrid .app-card').count(),5,'public app launcher remains');
   assert.equal(await page.locator('#appGrid a[href*="app.netlify.com/projects/"]').count(),0,'deploy links hidden');
   await page.locator('#adminLoginBtn').click();
   await page.locator('#adminLoginKey').fill('local-qa-admin-only');
   await page.locator('#adminLoginSubmitBtn').click();
   await page.locator('.nav-btn[data-target="admin"]').waitFor({state:'visible'});
   await page.locator('#adminProgress .admin-metric').first().waitFor();
   assert.match(await page.locator('#adminProgress').innerText(),/프로젝트/);
   assert.match(await page.locator('#adminProgress').innerText(),/TAKY/);
   assert.ok((await page.locator('#adminProgress').innerText()).includes(fixture.projects[0].signal));
   assert.equal(await page.locator('#adminProgress .admin-switch button').filter({hasText:'오케스트라 흐름'}).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').isVisible(),true);
   const primary=fixture.projects.find(p=>fixture.work.some(w=>w.project===p.id))||fixture.projects[0];
   const linked=fixture.work.filter(w=>w.project===primary?.id);
   assert.equal(await page.locator('#adminProgress .admin-lineage-node').count(),6*linked.length,'six evidence stages per explicitly linked work');
   const flow=await page.locator('#adminProgress').innerText();
   assert.match(flow,/HEAD 재현성 검사/,'admin must display worktree-vs-HEAD hold');
   if(primary.headSourceParity==='SOURCE_DIFFERS_FROM_HEAD_NO_REPLAY_CLAIM'){
     assert.match(flow,/현재 앱 소스와 Git HEAD 불일치/);
     assert.match(flow,/코드 활동은 개발 완료 증명 아님/);
     assert.match(flow,/작업 완료·독립 QA·승인 증거가 아닙니다/);
   }
   if(fixture.lineage){
     assert.match(flow,/CURRENT · 대화 출처 연결 범위/);
     assert.match(flow,/WORK_ID ↔ TAKY2 실행 계약 정확 일치/);
   }
   if(fixture.kernel&&primary.id==='TAKY'){
     assert.match(flow,/TAKY2 전역 실행 영수증/);
     assert.match(flow,/결과 반환/);
     assert.match(flow,/독립 검증 PASS가 아닙니다/);
   }
   if(linked.length){
     assert.match(flow,/원본 내보내기 기준 WORK_ID 연결 미입증|인증된 내보내기 주제 인덱스/);
     if(linked.some(w=>w.kernelExact?.relation==='EXACT_REGISTERED_TASK_ID') ||
        linked.some(w=>w.kernelExact?.relation==='NO_EXACT_TASK_ID_MATCH')){
       const items=page.locator('#adminProgress details.admin-flow-detail');
       await items.evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
       const expanded=await page.locator('#adminProgress').innerText();
       if(linked.some(w=>w.kernelExact?.relation==='EXACT_REGISTERED_TASK_ID')){
         assert.match(expanded,/서명 영수증 일치|정확한 작업 ID 일치/,'verified work link must appear in expanded details');
         assert.match(expanded,/독립 검증 증거 미연결/,'exact link must not imply independent QA');
       }
       if(linked.some(w=>w.kernelExact?.relation==='NO_EXACT_TASK_ID_MATCH')){
         assert.match(expanded,/TAKY2 작업 ID 일치 기록 없음|준비·미실행 미리보기 영수증만 확인|실패 영수증 기록 있음/,'unlinked work must have evidence-specific status');
       }
       if(linked.some(w=>w.executionGap==='PREPARATION_PREVIEW_ONLY_OBSERVED'))assert.match(expanded,/실행 필요성 검토/);
       if(linked.some(w=>w.executionGap==='FAILURE_RECORDED_BUT_SIGNED_EXECUTION_LINK_MISSING'))assert.match(expanded,/입력 패킷 구성 원인/);
       if(linked.some(w=>['PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD','PREPARED_SOURCE_SHA_DRIFT_HOLD','PREPARED_HEAD_DRIFT_HOLD'].includes(w.preparedSourceState)))
         assert.match(expanded,/과거 작업 재실행 중지/,'stale source pin must remain visible, never auto rerun');
       await items.evaluateAll(nodes=>nodes.forEach((node,i)=>node.open=i===0));
     }
     if(linked.some(w=>w.evidenceState==='DERIVED_RECORD_NOT_INDEPENDENT_EXECUTION_PROOF')){
       assert.match(flow,/미실행 준비/);
       assert.match(flow,/호출 주장/);
     }else{
       assert.match(flow,/영수증 세부 분류 미연결/,'legacy snapshots cannot turn absent evidence into zeros');
     }
   }else{
     assert.match(flow,/연결된 AI 작업 증거 없음/,'unlinked snapshots must not invent a task graph');
   }
   if(fixture.projects.length>1){
     const target=fixture.projects.find(p=>!fixture.work.some(w=>w.project===p.id));
     if(target){
       await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(target.id);
       assert.match(await page.locator('#adminProgress').innerText(),/연결된 AI 작업 증거 없음/);
       if(target.currentWorkRegistration==='CURRENT_DECLARED_UNREGISTERED'){
         const evidence=await page.locator('#adminProgress').innerText();
         assert.ok(evidence.includes(target.currentWorkId),'exact PROJECT_CURRENT work ID must be visible');
         assert.match(evidence,/중앙 AI 등록부 미연결/);
         assert.match(evidence,/승인·완료 아님|실행·검토·완료를 증명하지 않습니다/);
       }
       await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(primary.id);
     }
   }
   if(fixture.qa?.gaps?.length&&fixture.projects.some(p=>p.id==='HIDE-SEEK')){
     await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption('HIDE-SEEK');
     const projectEvidence=await page.locator('#adminProgress').innerText();
     assert.match(projectEvidence,/연관 가족앱 검증 공백/);
     assert.ok(projectEvidence.includes('hide-hanja-canonical-learning-link'),
       'HIDE must show source-linked P0 gaps');
     assert.match(projectEvidence,/작업 배정 아님/);
     await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(primary.id);
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=0,'admin lineage causes horizontal overflow: '+overflow);
   const undersized=await page.locator('#adminProgress .admin-switch button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<44).length);
   assert.equal(undersized,0,'admin stage controls must be touch sized');
   if(process.env.TAKY_ADMIN_E2E_SCREENSHOT_DIR){
     fs.mkdirSync(process.env.TAKY_ADMIN_E2E_SCREENSHOT_DIR,{recursive:true});
     await page.screenshot({path:path.join(process.env.TAKY_ADMIN_E2E_SCREENSHOT_DIR,'orchestra-'+viewport.width+'.png'),fullPage:true});
   }
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'AI 작업·진행'}).click();
   assert.ok((await page.locator('#adminProgress').innerText()).includes(fixture.work[0].title));
   const unregistered=fixture.projects.filter(p=>p.currentWorkRegistration==='CURRENT_DECLARED_UNREGISTERED');
   for(const x of unregistered){
     assert.ok((await page.locator('#adminProgress').innerText()).includes(x.currentWorkId),
       'explicit current work candidate must appear separately from registered AI tasks');
   }
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'중복·충돌'}).click();
   assert.ok((await page.locator('#adminProgress').innerText()).includes(fixture.alerts[0].kind));
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'가족앱 QA'}).click();
   const qaText=await page.locator('#adminProgress').innerText();
   if(fixture.qa){
     assert.ok(qaText.includes(String(fixture.qa.passed)));
     assert.ok(qaText.includes(String(fixture.qa.openGaps)));
     for(const g of fixture.qa.gaps)assert.ok(qaText.includes(g.id),'P0/P1 source QA ID must be visible');
     assert.match(qaText,/운영 품질 검증 아님/);
   }else assert.match(qaText,/관리자 QA 근거 미연결/);
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'검증 단계'}).click();
   assert.equal(await page.locator('#adminProgress .admin-progress-card').count(),6,
     'Source->review->application stage flow must render all six phases');
   const stagesText=await page.locator('#adminProgress').innerText();
   assert.ok(stagesText.includes('원본 적격성'));
   assert.ok(stagesText.includes('FORMING'));
   if(!fixture.pipeline)assert.ok(stagesText.includes('단계별 증거 미연결'),
     'missing pipeline must not masquerade as real zero counts');
   const savedGeneratedAt=fixture.generatedAt;
   fixture={...fixture,generatedAt:'2020-01-01T00:00:00Z'};
   await page.locator('#adminProgress button').filter({hasText:'관리자 스냅샷 다시 조회'}).click();
   await page.waitForFunction(()=>document.querySelector('#adminProgress')?.textContent?.includes('생성 후 24시간 초과'));
   assert.match(await page.locator('#adminProgress').innerText(),/실시간 실행 상태 아님|최신 실행 상태 미확인/);
   fixture={...fixture,generatedAt:savedGeneratedAt};
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'검증 단계'}).click();
   if(process.env.TAKY_ADMIN_E2E_LOCAL_SNAPSHOT==='1'&&fixture.pipeline){
     assert.ok(stagesText.includes(`개별 참조 ${fixture.pipeline.trustReferencesVerified||0}/${fixture.pipeline.trustReferencesTotal||0}`));
     assert.ok(stagesText.includes(`반복된 노션 URL ${fixture.pipeline.logicalDuplicateUrls||0}개`));
   }
   if(process.env.TAKY_ADMIN_E2E_LOCAL_SNAPSHOT==='1'){
     await page.locator('#adminProgress .admin-switch button').filter({hasText:'자료 범위'}).click();
     const t=await page.locator('#adminProgress').innerText();
     if(fixture.pipeline)assert.ok(t.includes(`본문 대기열 ${fixture.pipeline.notionTextStaged}건`));
     assert.ok(t.includes('계정 전체 대화 확보·검수 완료를 의미하지 않습니다.'));
   }
   await page.locator('#adminLogoutBtn').click();
   await page.locator('.nav-btn[data-target="admin"]').waitFor({state:'hidden',timeout:10000});
   assert.equal(await page.locator('.nav-btn[data-target="admin"]').isVisible(),false,'admin hidden after logout');
   assert.equal(await page.locator('#appGrid .app-card').count(),5);
   assert.deepEqual(errors,[],'no browser page errors');
   await context.close();
 }
 assert.equal(preAuthDataCalls,0,'client never requests admin data before admin auth');
 console.log(JSON.stringify({contract:'TAKY_MOBILE_ADMIN_PROGRESS_E2E_V1',mobile:true,desktop:true,publicIsolation:true,login:true,logout:true,progress:true,preAuthDataCalls}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
