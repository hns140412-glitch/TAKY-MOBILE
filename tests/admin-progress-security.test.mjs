import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {readLatestLocalAdminFixture} from './local-workbench-admin-snapshot.mjs';
import login from '../netlify/functions/admin-session.mjs';
import progress from '../netlify/functions/admin-progress.mjs';
const base='https://taky-mobile.netlify.app/.netlify/functions/';
const origin='https://taky-mobile.netlify.app';
const request=(name,method='GET',{cookie='',o='',body=null}={})=>new Request(base+name,{method,headers:{...(cookie?{cookie}:{}),...(o?{origin:o}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('admin remains unavailable when not configured',async()=>{
 delete process.env.TAKY_ADMIN_ACCESS_KEY;delete process.env.TAKY_ADMIN_SESSION_SECRET;delete process.env.TAKY_ADMIN_PROGRESS_JSON;
 assert.equal((await (await login(request('admin-session'))).json()).authorized,false);
 assert.equal((await progress(request('admin-progress'))).status,401);
 assert.equal((await login(request('admin-session','POST',{o:origin,body:{key:'any'}}))).status,503);
});
test('device cookie never authorizes admin',async()=>{
 process.env.TAKY_ADMIN_ACCESS_KEY='safe-local-fixture-admin-secret';
 process.env.TAKY_ADMIN_SESSION_SECRET='safe-local-fixture-admin-signing-secret';
 assert.equal((await progress(request('admin-progress','GET',{cookie:'taky_session=existing-user-key'}))).status,401);
 assert.equal((await login(request('admin-session','POST',{o:'https://attacker.example',body:{key:process.env.TAKY_ADMIN_ACCESS_KEY}}))).status,403);
});
test('admin cookie gates progress and whitelists fields',async()=>{
 const fixture={schema:'TAKY_MOBILE_ADMIN_PROGRESS_SNAPSHOT_V1',generatedAt:'2026-10-18T14:00Z',counts:{projects:9,work:7,blocked:2,review:3,open:2,verified:0},coverage:{historicalChats:25,octoberNativeChats:0},projects:[{id:'TAKY',registered:'IDLE',current:'IDLE',signal:'BLOCKED_TASK_RECORDED',workCount:7,historicalChats:36,relayCandidates:19,latestCodeAt:'2026-10-17T07:00Z',privatePath:'D:\\secret'}],work:[{id:'TAKY-CHAT-'+'a'.repeat(32),title:'검토',project:'TAKY',status:'REVIEW',executor:'Claude',reviewer:'UNASSIGNED',receiptCount:1,outputCount:1,lastReceipt:'PASS',verified:false,preparedCount:1,callClaimCount:1,unclassifiedReceiptCount:0,chatLinked:false,lastObserved:'2026-10-18T14:00Z',evidenceState:'DERIVED_RECORD_NOT_INDEPENDENT_EXECUTION_PROOF',rawMessage:'private raw'}],alerts:[{kind:'REVIEW',project:'TAKY',note:'근거 부족',password:'private'}],pipeline:{notionTotal:220,notionTextStaged:158,notionTextHolds:62,mediaVerifiedReferences:804,mediaMissingReferences:173,gptFrozen:false,claudeFrozen:false,crossFrozen:false,codexFrozen:false,userApprovalRequiredForModel:true,privateRawFile:'secret'}};
 fixture.lineage={authority:'DERIVED_VIEW_ONLY_NOT_GLOBAL_CURRENT',nativeChatCount:0,topicCount:0,
   projectCurrentProjectionHashMatches:1,projectCount:9,exactWorkKernelLinks:0,secretPath:'D:/hidden-project'};
 fixture.kernel={source:'TAKY2_RUNTIME_READ_ONLY_NON_CANONICAL',integrity:'HMAC_AND_ROLLBACK_ANCHOR_VERIFIED',observedFileModifiedAt:'2026-10-19T00:00:00Z',
   runtimeVersion:164,preflightReceipts:8,executionCallReceipts:5,actualInvocationReceipts:3,
   returnedReceipts:2,failedReceipts:1,outcomeUnknownReceipts:2,registeredRouteRecoveries:1,
   doneGateRecords:1,exactWorkLinks:0,rawModelOutput:'NEVER_LEAK_RAW_MODEL_OUTPUT'};
 fixture.backlog=[{id:'CLN-002',title:'Private D:/internal/PRIVATE_BACKLOG_TITLE',category:'POST_CLEANUP',priority:'P0',status:'IMPLEMENTING',phase:'AFTER_CLEANUP',
  dependencies:['CLN-001','../../escape'],unresolvedDependencies:['CLN-001'],externalDependencyCount:2,
  evidenceReferenceCount:8,approvalRequired:false,outcomeVerifiedByIndependentReview:true,progressPercentVerified:100}];
 fixture.work[0].kernelExact={relation:'NO_EXACT_TASK_ID_MATCH',secret:'NEVER_LEAK_WORK_SECRET'};
 fixture.work[0].preparedSourceState='PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD';
 fixture.work[0].preparedTaskPrivatePath='F:/PRIVATE_TASK_LOCATION_DO_NOT_LEAK';
 fixture.projects[0].currentProjectionShaMatched=true;
 fixture.projects[0].currentWorkId='MCP-REA-20261016';
 fixture.projects[0].currentWorkRegistration='CURRENT_DECLARED_UNREGISTERED';
 fixture.projects[0].currentWorkPendingGates=7;
 fixture.projects[0].currentWorkVerified=true; // must NOT become true in server
 fixture.projects[0].localTrackedWipObserved=true;
 fixture.projects[0].workRegistrationGap=true;
 fixture.counts.sourceHeadGuardStatus='WORKTREE_STATIC_PASS_HEAD_REPLAY_HOLD';
 fixture.modelLane={status:'SIGNED_RUNTIME_READ_ONLY',activeEntries:26,pendingNeverClaimed:2,unknownOutcome:4,callingOrClaimed:0,heldReviewScopes:2,independentReviewRouteHeld:true,
  secret:'MODEL_RUNTIME_HMAC_SHOULD_NOT_LEAK',releaseAutomatically:true,newCallsAuthorized:true};
 fixture.counts.headModifiedReachableSources=62;
 fixture.projects[0].observedRecoveryState='LOCAL_WIP_OBSERVED_CURRENT_IDLE_REVIEW_REQUIRED';
 fixture.projects[0].recoveryNextAction='BIND_EXACT_WORK_ID_AND_REPRODUCIBLE_CONSUMER_QA_BEFORE_CURRENT_CHANGE';
 fixture.projects[0].headEntrypointIntegrity='HTML_ENTRYPOINT_DIFFERS_FROM_HEAD';
 fixture.projects[0].headSourceParity='SOURCE_DIFFERS_FROM_HEAD_NO_REPLAY_CLAIM';
 fixture.projects[0].headSourceDriftCount=10;
 fixture.projects[0].headSourceMissingCount=0;
 fixture.projects[0].headSourceUnversionedCount=0;
 fixture.projects[0].headSourceBrowserE2EVerified=true; // untrusted input must not certify
 fixture.projects[0].currentWorkIdRegistered=true;
 fixture.projects[0].sourceReferenceCount=4;
 fixture.projects[0].outputReferenceCount=3;
 fixture.projects[0].pendingGateCount=7;
 fixture.projects[0].secretProjectPath='D:/private/source/never-send';
 fixture.work[0].title='Private D:/internal/PRIVATE_TITLE_PATH';
 fixture.alerts[0].note='F:\\work\\PRIVATE_ALERT_PATH';
 fixture.work[0].title='Please inspect D:/private/work/credentials.json';
 fixture.alerts[0].note='See F:/private/family/secret.docx';
 fixture.qa={source:'LOCAL_SYNTHETIC_QA_RECEIPT_NOT_PRODUCTION',mode:'quick',
   finishedAt:'2026-10-19T11:41:10Z',verdict:'TESTS_PASS_WITH_CRITICAL_GAPS',
   sourceSha256:'a'.repeat(64),passed:17,failed:0,blocked:0,openGaps:1,
   productionVerified:true,privateSource:'D:/private/qa/secret',
   gaps:[{id:'administrator-qa-consumption',area:'TAKY-MOBILE',priority:'P0',
           why:'PRIVATE_QA_REASON_DO_NOT_SEND'}]};
 process.env.TAKY_ADMIN_PROGRESS_JSON=JSON.stringify(fixture);
 const signin=await login(request('admin-session','POST',{o:origin,body:{key:process.env.TAKY_ADMIN_ACCESS_KEY}}));
 assert.equal(signin.status,200);
 const cookie=signin.headers.get('set-cookie').split(';')[0];
 assert.match(signin.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Secure/);
 assert.equal((await (await login(request('admin-session','GET',{cookie}))).json()).authorized,true);
 const result=await progress(request('admin-progress','GET',{cookie}));
 assert.equal(result.status,200);
 const txt=await result.text(),data=JSON.parse(txt);
 assert.equal(data.counts.projects,9);assert.equal(data.work[0].verified,false);
 assert.equal(data.work[0].preparedCount,1);assert.equal(data.work[0].callClaimCount,1);
 assert.equal(data.work[0].classificationAvailable,true);assert.equal(data.work[0].chatLinked,false);
 assert.equal(data.work[0].kernelExact.relation,'NO_EXACT_TASK_ID_MATCH');
 assert.equal(data.work[0].preparedSourceState,'PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD');
 assert.equal(txt.includes('PRIVATE_TASK_LOCATION_DO_NOT_LEAK'),false);
 assert.equal(data.backlog[0].title,'PRIVATE_TEXT_REDACTED');
 assert.deepEqual(data.backlog[0].dependencies,['CLN-001']);
 assert.equal(data.backlog[0].outcomeVerifiedByIndependentReview,false);
 assert.equal(data.backlog[0].progressPercentVerified,null);
 assert.equal(txt.includes('PRIVATE_BACKLOG_TITLE'),false);
 assert.equal(data.kernel.integrity,'HMAC_AND_ROLLBACK_ANCHOR_VERIFIED');
 assert.equal(data.kernel.actualInvocationReceipts,3);
 assert.equal(data.kernel.returnedReceipts,2);assert.equal(data.kernel.doneGateRecords,1);
 assert.equal(data.lineage.nativeChatCount,0);
 assert.equal(data.projects[0].currentProjectionShaMatched,true);
 assert.equal(data.projects[0].currentWorkId,'MCP-REA-20261016');
 assert.equal(data.projects[0].currentWorkRegistration,'CURRENT_DECLARED_UNREGISTERED');
 assert.equal(data.projects[0].currentWorkPendingGates,7);
 assert.equal(data.projects[0].currentWorkVerified,false);
 assert.equal(data.projects[0].localTrackedWipObserved,true);
 assert.equal(data.projects[0].workRegistrationGap,true);
 assert.equal(data.counts.sourceHeadGuardStatus,'WORKTREE_STATIC_PASS_HEAD_REPLAY_HOLD');
 assert.equal(data.modelLane.pendingNeverClaimed,2);
 assert.equal(data.modelLane.unknownOutcome,4);
 assert.equal(data.modelLane.independentReviewRouteHeld,true);
 assert.equal(data.modelLane.releaseAutomatically,false);
 assert.equal(data.modelLane.newCallsAuthorized,false);
 assert.equal(txt.includes('MODEL_RUNTIME_HMAC_SHOULD_NOT_LEAK'),false);
 assert.equal(data.counts.headModifiedReachableSources,62);
 assert.equal(data.projects[0].observedRecoveryState,'LOCAL_WIP_OBSERVED_CURRENT_IDLE_REVIEW_REQUIRED');
 assert.equal(data.projects[0].headEntrypointIntegrity,'HTML_ENTRYPOINT_DIFFERS_FROM_HEAD');
 assert.equal(data.projects[0].headSourceParity,'SOURCE_DIFFERS_FROM_HEAD_NO_REPLAY_CLAIM');
 assert.equal(data.projects[0].headSourceDriftCount,10);
 assert.equal(data.projects[0].sourceReferenceCount,4);
 assert.equal(data.projects[0].outputReferenceCount,3);
 assert.equal(data.projects[0].pendingGateCount,7);
 assert.equal(data.projects[0].headSourceBrowserE2EVerified,false);
 assert.equal(txt.includes('never-send'),false);
 assert.equal(data.work[0].title,'PRIVATE_TEXT_REDACTED');
 assert.equal(data.alerts[0].note,'PRIVATE_TEXT_REDACTED');
 assert.equal(txt.includes('PRIVATE_TITLE_PATH'),false);
 assert.equal(txt.includes('PRIVATE_ALERT_PATH'),false);
 assert.equal(txt.includes('D:/private/work'),false);
 assert.equal(txt.includes('F:/private/family'),false);
 assert.equal(data.work[0].title,'PRIVATE_TEXT_REDACTED');
 assert.equal(data.qa.source,'LOCAL_SYNTHETIC_QA_RECEIPT_NOT_PRODUCTION');
 assert.equal(data.qa.passed,17);
 assert.equal(data.qa.openGaps,1);
 assert.equal(data.qa.gaps[0].id,'administrator-qa-consumption');
 assert.equal(data.qa.productionVerified,false);
 assert.equal(data.qa.independentUserOutcomeVerified,false);
 assert.equal(txt.includes('PRIVATE_QA_REASON_DO_NOT_SEND'),false);
 assert.equal(txt.includes('D:/private/qa/secret'),false);
 for(const secret of ['NEVER_LEAK_RAW_MODEL_OUTPUT','NEVER_LEAK_WORK_SECRET','D:/hidden-project'])
   assert.equal(txt.includes(secret),false,'kernel source secrets must not escape');
 assert.equal(data.pipeline.notionTotal,220);assert.equal(data.pipeline.mediaVerifiedReferences,804);
 assert.equal(data.pipeline.gptFrozen,false);assert.equal(txt.includes('privateRawFile'),false);
 for(const key of ['privatePath','rawMessage','password','D:\\secret'])assert.equal(txt.includes(key),false);
 // Contradictory QA totals must be omitted, never disguised as 0 verified gaps.
 const trustedSnapshot=process.env.TAKY_ADMIN_PROGRESS_JSON;
 process.env.TAKY_ADMIN_PROGRESS_JSON=JSON.stringify({
   ...fixture,qa:{...fixture.qa,openGaps:999}});
 const inconsistent=await (await progress(request('admin-progress','GET',{cookie}))).json();
 assert.equal(inconsistent.qa,null);
 process.env.TAKY_ADMIN_PROGRESS_JSON=trustedSnapshot;
 const logout=await login(request('admin-session','DELETE',{o:origin,cookie}));
 assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});

test('actual local Workbench snapshot stays sanitized through the admin endpoint',
 {skip:process.env.TAKY_ADMIN_E2E_LOCAL_SNAPSHOT!=='1'},async()=>{
 const latest=readLatestLocalAdminFixture();
 const source=latest.payload;
 const raw=JSON.stringify(source);
 assert.ok(latest.adminHash,'latest local snapshot must be SHA-verified');
 assert.equal(source.projects.length,9);
 assert.ok(source.qa&&source.qa.openGaps>0);
 process.env.TAKY_ADMIN_ACCESS_KEY='local-fixture-admin';
 process.env.TAKY_ADMIN_SESSION_SECRET='local-fixture-sign';
 process.env.TAKY_ADMIN_PROGRESS_JSON=raw;
 const signed=await login(request('admin-session','POST',{o:origin,body:{key:process.env.TAKY_ADMIN_ACCESS_KEY}}));
 assert.equal(signed.status,200);
 const cookie=signed.headers.get('set-cookie').split(';')[0];
 const reply=await progress(request('admin-progress','GET',{cookie}));
 assert.equal(reply.status,200);
 const body=await reply.text(),data=JSON.parse(body);
 assert.equal(data.qa.openGaps,source.qa.openGaps);
 assert.equal(data.qa.passed,source.qa.passed);
 assert.equal(data.qa.productionVerified,false);
 const archi=data.projects.find(p=>p.id==='TAKY_ARCHI-GROW');
 assert.equal(archi.currentWorkId,'MCP-REA-20261016');
 assert.equal(archi.currentWorkRegistration,'CURRENT_DECLARED_REGISTERED');
 assert.equal(archi.currentWorkPendingGates,7);
 assert.equal(archi.currentWorkVerified,false);
 assert.equal(data.backlog.length,source.backlog.length);
 assert.equal(data.backlog.find(x=>x.id==='CLN-002').status,'IMPLEMENTING');
 assert.equal(data.backlog.find(x=>x.id==='CLN-002').outcomeVerifiedByIndependentReview,false);
 assert.equal(body.includes('why'),false);
});
