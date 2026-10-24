import assert from 'node:assert/strict';
import {readLatestLocalAdminFixture} from './local-workbench-admin-snapshot.mjs';
import adminLogin from '../netlify/functions/admin-session.mjs';
import adminProgress from '../netlify/functions/admin-progress.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const PORT=4293,base='http://127.0.0.1:'+PORT+'/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json'};
const CANONICAL_ROOT=fs.realpathSync(ROOT);
const withinRoot=file=>{
 const rel=path.relative(CANONICAL_ROOT,file);
 return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
};
assert.equal(withinRoot(CANONICAL_ROOT),false,'root itself is not a public asset');
assert.equal(withinRoot(path.join(path.dirname(CANONICAL_ROOT),path.basename(CANONICAL_ROOT)+'-sibling','secret.json')),false,
 'a sibling with the same directory name prefix is never inside the static test root');
const server=http.createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,base).pathname.slice(1)||'index.html');
  const candidate=path.resolve(ROOT,rel);
  if(!withinRoot(candidate)||!fs.existsSync(candidate)||!fs.statSync(candidate).isFile())
   throw new Error('outside or missing');
  const file=fs.realpathSync(candidate);
  if(!withinRoot(file))throw new Error('symlink escape');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
 }catch{
  res.writeHead(404);res.end('not found');
 }
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
fixture.backlog=[
 {id:'CLN-001',title:'Source cleanup',priority:'P0',status:'IMPLEMENTING',phase:'AFTER_CLEANUP',category:'POST_CLEANUP',dependencies:[],unresolvedDependencies:[],approvalRequired:false,externalDependencyCount:1,evidenceReferenceCount:3},
 {id:'CLN-002',title:'Join exact work source',priority:'P0',status:'IMPLEMENTING',phase:'AFTER_CLEANUP',category:'POST_CLEANUP',dependencies:['CLN-001'],unresolvedDependencies:['CLN-001'],approvalRequired:false,externalDependencyCount:0,evidenceReferenceCount:2},
 {id:'UPD-001',title:'Publisher gate',priority:'P0',status:'BLOCKED',phase:'GATE',category:'INTEGRATION',dependencies:[],unresolvedDependencies:[],approvalRequired:true,externalDependencyCount:0,evidenceReferenceCount:1}
];
fixture.systemGates={schema:'TAKY_SYSTEM_GATE_DERIVED_V1',
 state:'HOLD_NOT_RELEASE_VERIFIED',completionVerified:false,canAutoPromote:false,
 qaBasisMode:'quick',qaBasisFinishedAt:'2026-10-22T10:00:00Z',
 gates:['CURRENT_AUTHORITY','WORK_ID_OWNERSHIP','AI_INDEPENDENT_REVIEW',
        'HEAD_REPRODUCIBILITY','RAW_TO_FORMING','PRODUCT_RELEASE_QA']
  .map((id,i)=>({id,state:'HOLD',verified:false,observedUnresolved:i===3?null:i+1,
    secondaryUnresolved:i+2,tertiaryUnresolved:i===5?7:null}))};
fixture.counts.sourceHeadGuardStatus='WORKTREE_STATIC_PASS_HEAD_REPLAY_HOLD';
fixture.modelLane={status:'SIGNED_RUNTIME_READ_ONLY',activeEntries:26,pendingNeverClaimed:2,unknownOutcome:4,callingOrClaimed:0,heldReviewScopes:2,independentReviewRouteHeld:true};
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
 const latest=readLatestLocalAdminFixture();
 const source=latest.payload;
 assert.ok(latest.adminHash&&latest.snapshot,'actual local snapshot and pointer must be SHA-verified');
 assert.equal(source.modelLane?.status,'SIGNED_RUNTIME_READ_ONLY','signed model execution holds must be visible in the current source');
 // Test the actual authenticated Netlify allowlist transformation, not a raw
 // desktop-only snapshot disguised as the browser's API response.
 const origin='https://taky-mobile.netlify.app';
 const oldEnv=Object.fromEntries(['TAKY_ADMIN_ACCESS_KEY','TAKY_ADMIN_SESSION_SECRET','TAKY_ADMIN_PROGRESS_JSON'].map(k=>[k,process.env[k]]));
 try{
   process.env.TAKY_ADMIN_ACCESS_KEY='local-admin-browser-fixture';
   process.env.TAKY_ADMIN_SESSION_SECRET='local-admin-browser-signing-fixture';
   process.env.TAKY_ADMIN_PROGRESS_JSON=JSON.stringify(source);
   const loginReply=await adminLogin(new Request(origin+'/.netlify/functions/admin-session',{
     method:'POST',headers:{origin,'Content-Type':'application/json'},
     body:JSON.stringify({key:process.env.TAKY_ADMIN_ACCESS_KEY})}));
   assert.equal(loginReply.status,200,'real admin API authentication must work');
   const cookie=loginReply.headers.get('set-cookie').split(';')[0];
   const sanitizedReply=await adminProgress(new Request(origin+'/.netlify/functions/admin-progress',{
     method:'GET',headers:{cookie}}));
   assert.equal(sanitizedReply.status,200,'SHA-verified fixture must satisfy real API contract');
   fixture=await sanitizedReply.json();
 }finally{
   for(const [key,val] of Object.entries(oldEnv)){if(val===undefined)delete process.env[key];else process.env[key]=val;}
 }
 // Reconcile-generated counters are live data, not a fixed 2026-10-16
 // fixture. The signed source and the authenticated API must agree exactly.
 const collectorFields={candidatePackets:'packets',pendingRaw:'pending_raw',visualReview:'visual_review'};
 for(const [key,sourceKey] of Object.entries(collectorFields)){
   const expected=source.operator?.collector?.candidate_counts?.[sourceKey];
   assert.ok(expected===null||(Number.isSafeInteger(expected)&&expected>=0),
     'signed collector count invalid or omitted: '+key);
   assert.equal(fixture.operator?.collector?.[key],expected,
     'authenticated collector count changed or unknown became a fabricated zero: '+key);
 }
 assert.equal(fixture.operator?.collector?.candidateSourceHashVerified,true);
 assert.equal(fixture.counts.projects,9);
 assert.ok(fixture.qa?.openGaps>0,'actual snapshot must contain unresolved QA evidence');
 // The newest QA may legitimately be QUICK, while the global release
 // decision must still be based on the independent DEEP receipt. Never
 // confuse the latest check with release-qualified evidence.
 assert.equal(fixture.qa?.mode,source.qa?.mode,'display current signed QA mode');
 assert.equal(fixture.qa?.blocked,source.qa?.blocked,'do not invent QA blockers');
 assert.equal(fixture.qa?.productionVerified,false);
 assert.equal(fixture.systemGates?.qaBasisMode,'deep','release gate must source deep receipt');
 assert.equal(fixture.systemGates?.gates?.[5]?.state,'HOLD',
   'latest quick QA must never clear the release gate');
 assert.equal(fixture.systemGates?.gates?.[5]?.secondaryUnresolved,1,
   'latest quick run cannot treat untested deep audio as approved');
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
   try { await page.locator('#appGrid .app-card').first().waitFor({state:'attached',timeout:15000}); }
   catch(error){
     console.error('ADMIN_BOOT_DIAGNOSTIC',JSON.stringify({viewport,errors,url:page.url(),
       appGrid:await page.locator('#appGrid').innerHTML().catch(()=>null),
       readyState:await page.evaluate(()=>document.readyState).catch(()=>null)}));
     throw error;
   }
   assert.equal(await page.locator('.nav-btn[data-target="admin"]').isVisible(),false,'admin tab hidden before authentication');
   assert.equal(await page.locator('.nav-btn[data-target="ops"]').isVisible(),false,'OPS is not public');
   assert.equal(await page.locator('#operationsPanel').isVisible(),false,'operations panel is private');
   assert.equal(await page.locator('#appGrid .app-card').count(),5,'public app launcher remains');
   assert.equal(await page.locator('#appGrid a[href*="app.netlify.com/projects/"]').count(),0,'deploy links hidden');
   const readyGuest=page.locator('#appGrid .app-card').filter({hasText:'Ready & Set'}).first();
   const guestStart=readyGuest.locator('[data-app-learning-link="ready-set"]');
   assert.equal(await readyGuest.locator('[data-app-learning="ready-set"]').count(),0,
     'guest may not create an inaccessible admin WORK item');
   assert.equal(await guestStart.count(),1,'guest learning start must be a real direct link');
   assert.ok((await guestStart.getAttribute('href'))?.startsWith('https://'),
     'guest direct Ready href must be normalized HTTPS in public fixture');
   assert.equal(await guestStart.getAttribute('target'),null,'guest ready start keeps same tab');
   assert.equal(await page.locator('#workList [data-work-execute]').count(),0,
     'guest app render must not create hidden WORK tasks');
   await page.locator('#adminLoginBtn').click();
   await page.locator('#adminLoginKey').fill('local-qa-admin-only');
   await page.locator('#adminLoginSubmitBtn').click();
   await page.locator('.nav-btn[data-target="admin"]').waitFor({state:'visible'});
   const readyAdmin=page.locator('#appGrid .app-card').filter({hasText:'Ready & Set'}).first();
   assert.equal(await readyAdmin.locator('[data-app-learning="ready-set"]').count(),1,
     'signed admin retains governed learning work creation');
   assert.equal(await readyAdmin.locator('[data-app-learning-link="ready-set"]').count(),0,
     'admin card should not present the guest-only workflow');
   await page.locator('#adminProgress .admin-metric').first().waitFor();
   assert.equal(await page.locator('#adminProgress .admin-system-gates').count(),1,
     'system-wide provenance gates must appear only after admin authentication');
   const systemText=await page.locator('#adminProgress .admin-system-gates').innerText();
   assert.match(systemText,/원본 CURRENT/);
   assert.match(systemText,/Git HEAD/);
   assert.match(systemText,/실제 앱 검증/);
   assert.match(systemText,new RegExp('기존 미연결 AI 작업 '+
     (fixture.systemGates.gates[1].secondaryUnresolved??'미해결 수량 근거 없음')+'건'));
   assert.match(systemText,/HEAD 참조 소스 차이/);
   assert.match(systemText,/미등록 실행 자산/);
   assert.equal((systemText.match(/HOLD/g)||[]).length,6,
     'none of the six cross-layer HOLD gates may be promoted to pass');
   if(fixture.systemGates?.gates[3]?.observedUnresolved==null)
     assert.match(systemText,/미해결 수량 근거 없음/);
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
   if(fixture.counts?.aiJobsSignedHandoffState==='EXACT_SIGNED_HANDOFFS_RECONCILED_NOT_COMPLETION'){
     assert.match(flow,new RegExp('AI 작업 서명 영수증: CLI 반환 '+fixture.counts.aiJobsSignedTransportOnly+'건'));
     assert.match(flow,/검증된 독립 완료 0건/);
     assert.match(flow,/모델 반환은 사용자 성과 완료가 아닙니다/);
   }
   if(fixture.pipeline?.siteWatchGateState==='SITE_RAW_AND_CODEX_CANDIDATES_NOT_FORMALLY_APPROVED'){
     assert.match(flow,new RegExp('공개자료 검토: RAW '+fixture.pipeline.siteWatchRawProvenanceSources+'건'));
     assert.match(flow,new RegExp('Codex 후보 '+fixture.pipeline.siteWatchCodexEvidenceCandidates+'건'));
     assert.match(flow,new RegExp('정식 양방향 검토 '+fixture.pipeline.siteWatchFormalBilateralComplete+'건'));
     assert.match(flow,/Index Owner 승인 0건/);
   }
   // Deterministic independent state matrix: the live local snapshot can be
   // absent or incomplete and must not make these assertions disappear.
   const reasonStates=await page.evaluate(async source=>{
     const {renderAdminProgress}=await import('/src/admin-progress.mjs');
     const variants={
       missing:{...source,operator:null},
       unknown:{...source,operator:{reasonExecutor:{state:'HOLD_REASON_EXECUTOR_STATUS_UNVERIFIED'}}},
       noLive:{...source,operator:{reasonExecutor:{state:'HOLD_LIVE_EXECUTOR_SESSIONS_NOT_VISIBLE'}}},
       live:{...source,operator:{reasonExecutor:{state:'LIVE_DUAL_AGENT_SESSIONS_VISIBLE_NOT_OWNERSHIP_VERIFIED'}}},
       missingDate:{...source,operator:{
         reasonExecutor:{state:'HOLD_LIVE_EXECUTOR_SESSIONS_NOT_VISIBLE'},
         localExecution:{status:'REFRESHED_SHA_VERIFIED',stale:false}}},
       unfoundedRecent:{...source,operator:{
         reasonExecutor:{state:'HOLD_LIVE_EXECUTOR_SESSIONS_NOT_VISIBLE'},
         localExecution:{status:'REFRESHED_SHA_VERIFIED',stale:false,
           observedAt:new Date(Date.now()-2*3600000).toISOString()}}},
     };
     return Object.fromEntries(Object.entries(variants).map(([key,value])=>{
       const detached=document.createElement('div');
       renderAdminProgress(detached,value);
       return [key,detached.innerText||detached.textContent||''];
     }));
   },fixture);
   for(const kind of ['missing','unknown']){
     assert.match(reasonStates[kind],/리슨 실행자 상태가 미확인입니다/);
     assert.match(reasonStates[kind],/로컬 근거 검사는 유지하고 실행자 상태를 재확인합니다/);
     assert.doesNotMatch(reasonStates[kind],/최근 1시간 내 로컬 실행 영수증/);
   }
   assert.match(reasonStates.noLive,/기존 로컬 원본·영수증 검사는 계속 진행합니다/);
   assert.match(reasonStates.noLive,/실제 Claude Code\/Codex 세션을 연결하고 WORK_ID로 인계합니다/);
   assert.match(reasonStates.live,/기존 WORK_ID와 입력 SHA를 확인한 뒤 구현 영수증과 독립 검토 영수증을 각각 대조합니다/);
   assert.match(reasonStates.live,/세션 관찰만으로 DONE 처리하지 않습니다/);
   assert.match(reasonStates.missingDate,/로컬 실행 관측 시각·신선도 근거 미확인/);
   assert.doesNotMatch(reasonStates.missingDate,/최근 1시간 내 로컬 실행 영수증/);
   assert.match(reasonStates.unfoundedRecent,/로컬 실행 관측 시각·신선도 근거 미확인/);
   assert.doesNotMatch(reasonStates.unfoundedRecent,/최근 1시간 내 로컬 실행 영수증/);
   if(fixture.operator){
     if(fixture.operator.reasonExecutor?.state==='HOLD_LIVE_EXECUTOR_SESSIONS_NOT_VISIBLE'){
       assert.match(flow,/리슨 통신은 연결됨/,'transport is separate from model execution');
       assert.match(flow,/실제 실행 세션 미확인/,'no false ready claim');
       assert.match(flow,/CLI 대기열은 모델 실행자가 아닙니다/,'CLI impersonation must not be promoted');
       assert.match(flow,/다음 실행: 기존 로컬 원본·영수증 검사는 계속 진행합니다/,'model unavailability must not stall local work');
       assert.match(flow,/실제 Claude Code\/Codex 세션을 연결하고 WORK_ID로 인계합니다/,'resume should describe concrete model handoff');
     }
     if(fixture.operator.reasonExecutor?.state==='LIVE_DUAL_AGENT_SESSIONS_VISIBLE_NOT_OWNERSHIP_VERIFIED'){
       assert.match(flow,/구현 영수증과 독립 검토 영수증을 각각 대조합니다/,'live agents still require evidence');
       assert.match(flow,/세션 관찰만으로 DONE 처리하지 않습니다/);
     }
     if(!fixture.operator.reasonExecutor ||
       !['HOLD_LIVE_EXECUTOR_SESSIONS_NOT_VISIBLE','LIVE_DUAL_AGENT_SESSIONS_VISIBLE_NOT_OWNERSHIP_VERIFIED'].includes(fixture.operator.reasonExecutor.state)){
       assert.match(flow,/리슨 실행자 상태가 미확인입니다/,'unknown route must not claim readiness');
       assert.match(flow,/미확인 상태를 자동 승인이나 호출 성공으로 해석하지 않습니다/);
     }
     if(fixture.operator.reasonGuided?.state==='LAST_REASON_HANDOFF_PROVEN_BY_IMMUTABLE_RECEIPT'){
       assert.match(flow,/리슨 인계 실증:/,'durable Reason message evidence must appear in admin');
       assert.ok(flow.includes(fixture.operator.reasonGuided.taskId));
       assert.match(flow,/사용자 승인·제품 완료 아님/,'Reason evidence must never promote DONE');
     }
     assert.match(flow,/로컬 실행기:/,'existing scheduled execution evidence must be displayed');
     assert.match(flow,/수집\/FORMING 실행:/,'collector stage hold must be visible');
     assert.match(flow,/제품 작업 완료 아님/,'local diagnostics must not become portfolio completion');
     assert.match(flow,/전체 10단계 학습·배포 검증 아님/,'candidate evidence must not be promoted');
     const c=fixture.operator.collector;
     if(c?.candidateSourceHashVerified===true
        &&c.status==='FRESH_CANDIDATE_INCOMPLETE'){
       for(const [label,value] of [
         ['FORMING 참고 패킷',c.candidatePackets],
         ['미추출 RAW',c.pendingRaw],
         ['시각 검토',c.visualReview],
         ['추가 추출 원본',c.recoveredRaw]
       ]){
         const expected=Number.isSafeInteger(value)&&value>=0?value+'개':'미확인';
         assert.ok(flow.includes(label+' '+expected),
           'admin must show each verified count and keep absent source values unknown: '+label);
       }
       assert.match(flow,/학습 승인 및 배포 아님/);
     }
   }
   if(Number.isSafeInteger(fixture.counts.runtimeAssetsUnversioned)){
     assert.match(flow,new RegExp(`Git 미등록 ${fixture.counts.runtimeAssetsUnversioned}개`),
       'actual asset custody count must be visible without claiming completion');
   }
   // Signed runtime receipts change when an unclaimed preflight is released or
   // a governed reviewer returns. Assert exactly what the authenticated source says.
   assert.match(flow,new RegExp('서명 검증 TAKY2 실행 대기 '+fixture.modelLane.pendingNeverClaimed+'건'));
   assert.match(flow,new RegExp('독립 검토 경로 '+(fixture.modelLane.independentReviewRouteHeld?'HOLD':'대기 기록 미확인')));
   assert.match(flow,new RegExp('호출 결과 불명 '+fixture.modelLane.unknownOutcome+'건'));
   assert.match(flow,/모델 호출\/완료 증명 아님/);
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
     const shownDetails=page.locator('#adminProgress details.admin-flow-detail');
     await shownDetails.evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
     const actualExpandedEvidence=await page.locator('#adminProgress').innerText();
     if(linked.some(w=>w.classificationAvailable===true)){
       // The API intentionally withholds precise counts when original Workbench
       // receipt classification is unavailable. Evidence-state text alone is
       // not permission to turn legacy unknowns into zeros.
       assert.match(actualExpandedEvidence,/미실행 준비/);
       assert.match(actualExpandedEvidence,/호출 주장/);
     }else{
       assert.match(actualExpandedEvidence,/영수증 세부 분류 미연결/,'legacy snapshots cannot turn absent evidence into zeros');
     }
     await shownDetails.evaluateAll(nodes=>nodes.forEach((node,i)=>node.open=i===0));
   }else{
     assert.match(flow,/연결된 AI 작업 증거 없음/,'unlinked snapshots must not invent a task graph');
   }
   if(fixture.projects.length>1){
     const declared=fixture.projects.find(p=>p.currentWorkRegistration==='CURRENT_DECLARED_REGISTERED'&&p.currentWorkId);
     if(declared){
       await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(declared.id);
       const text=await page.locator('#adminProgress').innerText();
       assert.match(text,/기존 백로그에 등록됨/);
       assert.ok(text.includes(declared.currentWorkId),'exact pre-existing CURRENT ID should be visible, not a newly invented task');
       assert.match(text,/AI 실행 연결·산출물·독립검증 별도 확인/);
       await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(primary.id);
     }
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
     if(Number.isSafeInteger(fixture.projects.find(p=>p.id==='HIDE-SEEK')?.runtimeAssetsUnversioned)){
       const expected=fixture.projects.find(p=>p.id==='HIDE-SEEK').runtimeAssetsUnversioned;
       assert.match(projectEvidence,new RegExp(`Git 미등록 ${expected}개`));
     }
     assert.ok(projectEvidence.includes('hide-hanja-canonical-learning-link'),
       'HIDE must show source-linked P0 gaps');
     if(fixture.qa?.gaps?.some(g=>g.id==='hide-user-violation-user-0922-link-three-states')){
       assert.ok(projectEvidence.includes('hide-user-violation-user-0922-link-three-states'),
         'direct user LINK mismatch must remain visible in the actual admin screen');
       assert.match(projectEvidence,/사용자 결정 위반 · LINK 3단계/,
         'administrator must see the consequence, not an opaque failure ID alone');
       assert.ok(fixture.qa.failed>0,
         'a proven user-contract violation cannot appear in a green deep-QA status');
     }
     assert.match(projectEvidence,/작업 배정 아님/);
     await page.locator('#adminProgress select[aria-label="오케스트라 프로젝트 선택"]').selectOption(primary.id);
   }
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'전체 작업·선행조건'}).click();
   const backlogUi=await page.locator('#adminProgress').innerText();
   assert.ok(backlogUi.includes('CLN-002'),'existing backlog task ID must be shown');
   assert.match(backlogUi,/선행 작업/);
   assert.match(backlogUi,/진행률 검증 근거 없음/);
   assert.match(backlogUi,/승인 필요/);
   assert.equal(await page.locator('#adminProgress .admin-progress-card').count(),fixture.backlog.length,'all authoritative existing backlog items must be present');
   await page.locator('#adminProgress .admin-switch button').filter({hasText:'오케스트라 흐름'}).click();
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
   assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.adminRefresh),'1',
     'refresh must return keyboard focus to the replacement button');
   assert.equal(await page.locator('#adminProgress [role="status"][data-snapshot-refresh="updated"]').count(),1,
     'changed snapshot refresh must announce its result');
   assert.match(await page.locator('#adminProgress').innerText(),/실시간 실행 상태 아님|최신 실행 상태 미확인/);
   await page.locator('#adminProgress button').filter({hasText:'관리자 스냅샷 다시 조회'}).click();
   await page.locator('[data-snapshot-refresh="unchanged"]').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.adminRefresh),'1');
   assert.equal(await page.locator('#adminProgress [role="status"][data-snapshot-refresh="unchanged"]').count(),1);
   assert.match(await page.locator('#adminProgress').innerText(),/새로고침은 로컬 PC 작업이나 서버 게시를 실행하지 않습니다/);
   fixture={...fixture,generatedAt:savedGeneratedAt};
   await page.locator('#adminProgress button').filter({hasText:'관리자 스냅샷 다시 조회'}).click();
   await page.waitForFunction(v=>document.querySelector('#adminProgress')?.textContent?.includes(v),savedGeneratedAt);
   assert.equal(await page.locator('[data-snapshot-refresh="unchanged"]').count(),0,'new server snapshot must clear stale refresh message');
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
   // Failed refresh preserves an authenticated historical snapshot, while an
   // explicit session expiry must erase it rather than leaking stale admin data.
   const healthyFixture=fixture;
   fixture={ok:false,error:'ADMIN_TEMPORARY_READ_FAILURE'};
   await page.locator('#adminProgress button[data-admin-refresh]').click();
   await page.locator('#adminProgress [role="alert"]').waitFor({state:'visible'});
   assert.match(await page.locator('#adminProgress').innerText(),/이전 스냅샷은 유지되며 다시 조회할 수 있습니다/);
   assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.adminRefresh),'1');
   assert.equal(await page.locator('#adminProgress button[data-admin-refresh]').count(),1);
   fixture={ok:false,error:'ADMIN_AUTH_REQUIRED'};
   await page.locator('#adminProgress button[data-admin-refresh]').click();
   // A transient-failure alert from the previous click is already visible.
   // Wait for the actual 401 readback and private-data revocation, not that
   // stale alert, before asserting that authenticated content was cleared.
   await page.locator('#adminProgress [role="alert"]')
     .filter({hasText:'관리자 인증이 필요합니다.'}).waitFor({state:'visible'});
   assert.match(await page.locator('#adminProgress').innerText(),/관리자 인증이 필요합니다/);
   assert.equal(await page.locator('#adminProgress button[data-admin-refresh]').count(),0);
   assert.equal(await page.locator('#adminProgress .admin-progress-card').count(),0);
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'alert');
   fixture=healthyFixture;
   await page.locator('#adminLogoutBtn').click();
   await page.locator('.nav-btn[data-target="admin"]').waitFor({state:'hidden',timeout:10000});
   assert.equal(await page.locator('.nav-btn[data-target="admin"]').isVisible(),false,'admin hidden after logout');
   assert.equal(await page.locator('#appGrid .app-card').count(),5);
   assert.deepEqual(errors,[],'no browser page errors');
   await context.close();
 }
 assert.equal(preAuthDataCalls,0,'client never requests admin data before admin auth');
 console.log(JSON.stringify({contract:'TAKY_MOBILE_ADMIN_PROGRESS_E2E_V1',mobile:true,desktop:true,publicIsolation:true,login:true,logout:true,progress:true,preAuthDataCalls,realLocalSnapshotUsed:process.env.TAKY_ADMIN_E2E_LOCAL_SNAPSHOT==='1',qaOpenGaps:fixture.qa?.openGaps??null}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
