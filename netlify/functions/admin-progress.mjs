import {configured,authorized,adminEnv,respond} from './_admin-session.mjs';
export default async request=>{
 if(request.method!=='GET')return respond({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
 if(!configured()||!authorized(request))return respond({ok:false,error:'ADMIN_AUTH_REQUIRED'},401);
 const source=adminEnv('TAKY_ADMIN_PROGRESS_JSON');
 if(!source)return respond({ok:false,error:'ADMIN_PROGRESS_NOT_CONFIGURED'},503);
 if(source.length>180000)return respond({ok:false,error:'ADMIN_PROGRESS_TOO_LARGE'},503);
 try{
 const d=JSON.parse(source);
 if(d?.schema!=='TAKY_MOBILE_ADMIN_PROGRESS_SNAPSHOT_V1'||!Array.isArray(d.projects)||!Array.isArray(d.work)||!Array.isArray(d.alerts)||!d.coverage||d.projects.length>50||d.work.length>200||d.alerts.length>300)throw Error('BAD_SNAPSHOT');
 const s=(x,n=200)=>{
   if(typeof x!=='string')return '';
   const value=x.slice(0,n);
   return /(?:[A-Za-z]:[\\/]|\\\\[A-Za-z0-9_.-]+[\\/]|\/home\/|\/Users\/|Bearer\s+|(?:api[_-]?key|secret|password)\s*[:=])/i.test(value)
      ?'PRIVATE_TEXT_REDACTED':value;
 },num=x=>Number.isSafeInteger(x)&&x>=0?x:0;
 return respond({ok:true,schema:d.schema,generatedAt:s(d.generatedAt,45),
 counts:{projects:num(d.counts?.projects),work:num(d.counts?.work),open:num(d.counts?.open),review:num(d.counts?.review),blocked:num(d.counts?.blocked),verified:num(d.counts?.verified)},
 coverage:{historicalChats:num(d.coverage?.historicalChats),octoberNativeChats:num(d.coverage?.octoberNativeChats),claim:'ACCOUNT_HISTORY_NOT_COMPLETE'},
 pipeline:d.pipeline&&typeof d.pipeline==='object'?{
   notionTotal:num(d.pipeline.notionTotal),notionTextStaged:num(d.pipeline.notionTextStaged),
   notionTextHolds:num(d.pipeline.notionTextHolds),
   mediaVerifiedReferences:num(d.pipeline.mediaVerifiedReferences),
   mediaMissingReferences:num(d.pipeline.mediaMissingReferences),
   gptFrozen:d.pipeline.gptFrozen===true,claudeFrozen:d.pipeline.claudeFrozen===true,
   crossFrozen:d.pipeline.crossFrozen===true,codexFrozen:d.pipeline.codexFrozen===true,
   userApprovalRequiredForModel:d.pipeline.userApprovalRequiredForModel===true,
   trustReferencesVerified:num(d.pipeline.trustReferencesVerified),
   trustReferencesTotal:num(d.pipeline.trustReferencesTotal),
   trustHoldRequests:num(d.pipeline.trustHoldRequests),
   trustHistoricalResults:num(d.pipeline.trustHistoricalResults),
   trustCandidateOnly:d.pipeline.trustCandidateOnly===true,
   trustCandidateAgeHours:Number.isFinite(d.pipeline.trustCandidateAgeHours)&&d.pipeline.trustCandidateAgeHours>=0?d.pipeline.trustCandidateAgeHours:null,
   logicalDuplicateUrls:num(d.pipeline.logicalDuplicateUrls),
   identicalEvidenceDuplicateCandidates:num(d.pipeline.identicalEvidenceDuplicateCandidates),
   differentRawDuplicateHolds:num(d.pipeline.differentRawDuplicateHolds),
   duplicateCandidateAgeHours:Number.isFinite(d.pipeline.duplicateCandidateAgeHours)&&d.pipeline.duplicateCandidateAgeHours>=0?d.pipeline.duplicateCandidateAgeHours:null
 }:null,
 qa:d.qa?.source==='LOCAL_SYNTHETIC_QA_RECEIPT_NOT_PRODUCTION'&&
   Array.isArray(d.qa.gaps)&&d.qa.gaps.length<=100&&
   d.qa.gaps.length===d.qa.openGaps&&
   /^[0-9a-f]{64}$/.test(d.qa.sourceSha256||'')&&
   ['passed','failed','blocked','openGaps'].every(k=>Number.isSafeInteger(d.qa[k])&&d.qa[k]>=0&&d.qa[k]<=10000)&&
   d.qa.gaps.every(g=>g&&typeof g.id==='string'&&
     /^[a-z0-9-]{3,95}$/.test(g.id)&&['P0','P1','P2'].includes(g.priority)&&
     typeof g.area==='string'&&/^[A-Z0-9/-]{1,35}$/.test(g.area))?{
     source:'LOCAL_SYNTHETIC_QA_RECEIPT_NOT_PRODUCTION',
     mode:['quick','deep'].includes(d.qa.mode)?d.qa.mode:'unknown',
     verdict:s(d.qa.verdict,70),finishedAt:s(d.qa.finishedAt,45),
     sourceSha256:/^[0-9a-f]{64}$/.test(d.qa.sourceSha256||'')?d.qa.sourceSha256:'',
     passed:num(d.qa.passed),failed:num(d.qa.failed),blocked:num(d.qa.blocked),
     openGaps:num(d.qa.openGaps),
     gaps:d.qa.gaps.filter(g=>g&&typeof g.id==='string'&&
         /^[a-z0-9-]{3,95}$/.test(g.id)&&['P0','P1','P2'].includes(g.priority)&&
         typeof g.area==='string'&&/^[A-Z0-9/-]{1,35}$/.test(g.area))
         .map(g=>({id:s(g.id,95),priority:g.priority,area:s(g.area,35)})),
     productionVerified:false,independentUserOutcomeVerified:false
   }:null,
 lineage:d.lineage?.authority==='DERIVED_VIEW_ONLY_NOT_GLOBAL_CURRENT'?{
   nativeChatCount:num(d.lineage.nativeChatCount),topicCount:num(d.lineage.topicCount),
   projectCurrentProjectionHashMatches:num(d.lineage.projectCurrentProjectionHashMatches),
   projectCount:num(d.lineage.projectCount),exactWorkKernelLinks:num(d.lineage.exactWorkKernelLinks),signedWorkKernelLinks:num(d.lineage.signedWorkKernelLinks),
   sourceFilesParsed:num(d.lineage.sourceFilesParsed),workItemsWithNativeTopicReference:num(d.lineage.workItemsWithNativeTopicReference),
   authority:'DERIVED_VIEW_ONLY_NOT_GLOBAL_CURRENT'
 }:null,
 kernel:d.kernel?.source==='TAKY2_RUNTIME_READ_ONLY_NON_CANONICAL'?{
   source:'TAKY2_RUNTIME_READ_ONLY_NON_CANONICAL',
   integrity:d.kernel.integrity==='HMAC_AND_ROLLBACK_ANCHOR_VERIFIED'?'HMAC_AND_ROLLBACK_ANCHOR_VERIFIED':'UNVERIFIED',
   observedFileModifiedAt:s(d.kernel.observedFileModifiedAt,45),
   runtimeVersion:num(d.kernel.runtimeVersion),preflightReceipts:num(d.kernel.preflightReceipts),
   executionCallReceipts:num(d.kernel.executionCallReceipts),
   actualInvocationReceipts:num(d.kernel.actualInvocationReceipts),
   returnedReceipts:num(d.kernel.returnedReceipts),
   outcomeUnknownReceipts:num(d.kernel.outcomeUnknownReceipts),
   failedReceipts:num(d.kernel.failedReceipts),
   registeredRouteRecoveries:num(d.kernel.registeredRouteRecoveries),signedWorkLinks:num(d.kernel.signedWorkLinks),
   doneGateRecords:num(d.kernel.doneGateRecords),exactWorkLinks:num(d.kernel.exactWorkLinks)
 }:null,
 projects:d.projects.map(x=>({id:s(x.id,50),signal:s(x.signal,75),registered:s(x.registered,40),current:s(x.current,40),workCount:num(x.workCount),historicalChats:num(x.historicalChats),relayCandidates:num(x.relayCandidates),latestCodeAt:s(x.latestCodeAt,45),currentProjectionShaMatched:x.currentProjectionShaMatched===true,
   currentWorkId:/^[A-Za-z0-9_-]{3,90}$/.test(x.currentWorkId||'')?s(x.currentWorkId,90):'',
   currentWorkRegistration:['CURRENT_DECLARED_UNREGISTERED','CURRENT_DECLARED_REGISTERED','NO_CURRENT_WORK_ID'].includes(x.currentWorkRegistration)?x.currentWorkRegistration:'NO_CURRENT_WORK_ID',
   currentWorkPendingGates:Math.min(100,num(x.currentWorkPendingGates)),
   currentWorkVerified:false,currentWorkSourceVerified:x.currentWorkSourceVerified===true,
   localTrackedWipObserved:x.localTrackedWipObserved===true,
   workRegistrationGap:x.workRegistrationGap===true
 })),
 work:d.work.map(x=>({id:s(x.id,90),project:s(x.project,50),title:s(x.title,300),status:s(x.status,40),executor:s(x.executor,60),reviewer:s(x.reviewer,60),receiptCount:num(x.receiptCount),outputCount:num(x.outputCount),lastReceipt:s(x.lastReceipt,70),verified:x.verified===true,
   preparedCount:num(x.preparedCount),noModelCount:num(x.noModelCount),callClaimCount:num(x.callClaimCount),unclassifiedReceiptCount:num(x.unclassifiedReceiptCount),
   chatLinked:x.chatLinked===true,nativeTopicMatches:num(x.nativeTopicMatches),lastObserved:s(x.lastObserved,45),
   executionGap:['SIGNED_EXECUTION_LINK_OBSERVED','PREPARATION_PREVIEW_ONLY_OBSERVED','FAILURE_RECORDED_BUT_SIGNED_EXECUTION_LINK_MISSING','WORK_ID_NOT_IN_SOURCE_PROJECTION','SOURCE_RECEIPT_COLLECTION_UNTRUSTED','NO_SIGNED_EXECUTION_LINK_RECONCILE_SOURCE'].includes(x.executionGap)?x.executionGap:'UNCLASSIFIED_GAP',
   preparedSourceState:['PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD','PREPARED_SOURCE_SHA_DRIFT_HOLD','PREPARED_HEAD_DRIFT_HOLD','SOURCE_PIN_MATCH_NOT_EXECUTION_AUTHORIZATION','NOT_IMPLEMENTATION_PREPARATION','OTHER_REPO_NOT_SCANNED','PREPARED_TASK_NOT_IN_REGISTERED_INPUTS','PREPARED_TASK_UNAVAILABLE_HOLD','PREPARED_TASK_UNREADABLE_HOLD','SOURCE_PIN_SCOPE_INVALID','SOURCE_PIN_UNAVAILABLE_HOLD','GIT_HEAD_NOT_CHECKED','NOT_CHECKED'].includes(x.preparedSourceState)?x.preparedSourceState:'NOT_CHECKED',
   classificationAvailable:x.evidenceState==='DERIVED_RECORD_NOT_INDEPENDENT_EXECUTION_PROOF',
   kernelExact:x.kernelExact?.relation==='EXACT_REGISTERED_TASK_ID'?{
     relation:'EXACT_REGISTERED_TASK_ID',proof:x.kernelExact.proof==='REGISTERED_ROUTED_SIGNED_RECEIPT'?'REGISTERED_ROUTED_SIGNED_RECEIPT':'DIRECT_TASK_ID_ONLY',preflightCount:num(x.kernelExact.preflightCount),
     invokedCount:num(x.kernelExact.invokedCount),unknownCount:num(x.kernelExact.unknownCount),
     routeRecoveryCount:num(x.kernelExact.routeRecoveryCount)
   }:x.kernelExact?.relation==='NO_EXACT_TASK_ID_MATCH'?{
     relation:'NO_EXACT_TASK_ID_MATCH'
   }:null,
   evidenceState:'DERIVED_RECORD_NOT_INDEPENDENT_EXECUTION_PROOF'})),
 alerts:d.alerts.map(x=>({kind:s(x.kind,100),project:s(x.project,50),workId:s(x.workId,90),note:s(x.note,200)}))});
 }catch{return respond({ok:false,error:'ADMIN_PROGRESS_INVALID'},503)}
};
