// Workbench project + ChatGPT topic progress; admin cookie required at backend.
const SESSION='/.netlify/functions/admin-session', DATA='/.netlify/functions/admin-progress';
async function getJSON(response){try{return await response.json()}catch{return null}}
export async function adminSession(){try{const r=await fetch(SESSION,{credentials:'same-origin',cache:'no-store'}),p=await getJSON(r);return {authorized:r.ok&&p?.authorized===true}}catch{return {authorized:false}}}
export async function adminLogin(key){try{const r=await fetch(SESSION,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}),p=await getJSON(r);return {authorized:r.ok&&p?.authorized===true,error:p?.error||null}}catch{return {authorized:false,error:'ADMIN_ENDPOINT_UNAVAILABLE'}}}
export async function adminLogout(){try{await fetch(SESSION,{method:'DELETE',credentials:'same-origin',cache:'no-store'})}catch{}}
export async function readAdminProgress(){try{const r=await fetch(DATA,{credentials:'same-origin',cache:'no-store'}),p=await getJSON(r);if(!r.ok||p?.ok!==true)return {ok:false,error:p?.error||'ADMIN_DATA_UNAVAILABLE'};return p?.schema==='TAKY_MOBILE_ADMIN_PROGRESS_SNAPSHOT_V1'?p:{ok:false,error:'ADMIN_SCHEMA_MISMATCH'}}catch{return {ok:false,error:'ADMIN_DATA_UNAVAILABLE'}}}
const label={BLOCKED:'차단',REVIEW:'검토',OPEN:'대기',IN_PROGRESS:'진행'};
const recoveryLabel={
 LOCAL_WIP_OBSERVED_CURRENT_IDLE_REVIEW_REQUIRED:'CURRENT는 대기지만 로컬 변경 관측 · 작업 연결 필요',
 NAMED_CANDIDATE_WITH_LOCAL_WIP_CONSUMER_QA_REQUIRED:'작업 ID 후보 있음 · 실제 소비 검증 필요',
 CONFLICT_HOLD:'Git 충돌로 복구 보류',SOURCE_UNAVAILABLE_HOLD:'원본 저장소 확인 필요',
 LOCAL_WORK_REVIEW_REQUIRED:'로컬 변경 검토 필요',
 NO_LOCAL_GIT_CHANGES_OBSERVED:'로컬 변경 미관측 (완료 근거 아님)',
 NOT_VERIFIED:'작업·상태 근거 미연결'
};
const sourceLabel={SOURCE_DIFFERS_FROM_HEAD_NO_REPLAY_CLAIM:'현재 앱 소스와 Git HEAD 불일치',
 TRACKED_REACHABLE_SOURCES_MATCH_HEAD_NOT_BROWSER_PROVEN:'검사한 참조 소스 일치 · 브라우저 복원 미검증',
 NO_SOURCE_GUARD_OBSERVATION:'정적 소스 검사 대상 아님',NOT_VERIFIED:'정적 소스 근거 미연결'};
// Explicit QA source area tags only; this is a view, never automatic task assignment.
const QA_PROJECT_TAGS={
 'HIDE-SEEK':['HIDE'], 'READY-SET':['READY'], 'SNAP-POP':['SNAP'],
 'PLAY-CAMP':['PLAY','PLAY-CAMP'], 'TAKY-MOBILE':['TAKY-MOBILE'],
 'SAVEY':['SAVEY']
};
function projectQaGaps(projectId,qa){
 const tags=QA_PROJECT_TAGS[projectId];
 if(!tags||!Array.isArray(qa?.gaps))return [];
 return qa.gaps.filter(g=>{
   const scope=String(g?.area||'').split('/');
   return scope.includes('ALL')||tags.some(tag=>scope.includes(tag));
 });
}
function el(p,tag,txt='',cl=''){const e=document.createElement(tag);e.textContent=String(txt??'');if(cl)e.className=cl;p.append(e);return e}
export function renderAdminProgress(host,data){
 host.replaceChildren();
 if(!data?.ok){el(host,'p',data?.error==='ADMIN_PROGRESS_NOT_CONFIGURED'?'관리자 관제 데이터가 아직 서버에 연결되지 않았습니다.':data?.error==='ADMIN_AUTH_REQUIRED'?'관리자 인증이 필요합니다.':'진행상황 조회 불가: '+(data?.error||'UNKNOWN'),'admin-error');return}
 el(host,'p','워크벤치 등록 원자료 · 조회 전용 · 실제 개발 완료와 구분','admin-caption');
 el(host,'small','자료 생성 시각: '+(data.generatedAt||'미기록'));
 const stamp=Date.parse(data.generatedAt||''),age=Date.now()-stamp;
 const freshness=Number.isFinite(stamp)&&age>=0?(age>86400000?'생성 후 24시간 초과 — 최신 실행 상태 미확인':'최근 24시간 내 생성된 스냅샷 — 실시간 실행 상태 아님'):'생성 시각 확인 불가 — 실시간 실행 상태 아님';
 el(host,'p',freshness,'admin-caption');
 const refresh=el(host,'button','관리자 스냅샷 다시 조회','quick');
 refresh.type='button';
 refresh.addEventListener('click',async()=>{
   refresh.disabled=true;
   const previous=data.generatedAt||'';
   const updated=await readAdminProgress();
   renderAdminProgress(host,updated);
   if(updated.ok&&updated.generatedAt===previous){
     const message=el(host,'p','서버 자료 생성 시각이 이전과 동일합니다. 새로고침은 로컬 PC 작업이나 서버 게시를 실행하지 않습니다.','admin-caption');
     message.dataset.snapshotRefresh='unchanged';
   }
 });
 if(data.counts?.sourceHeadGuardStatus){
  const drift=Number.isSafeInteger(data.counts.headModifiedReachableSources)?data.counts.headModifiedReachableSources:'근거 없음';
  el(host,'p','Git HEAD 재현성 검사: '+data.counts.sourceHeadGuardStatus+' · 불일치 참조 소스 '+drift+'개 · 제품 복원 인증 아님','admin-caption');
 }
 const metrics=el(host,'div','','admin-metrics');
 for(const [k,v] of [['프로젝트',data.counts.projects],['AI 작업',data.counts.work],['검토 대기',data.counts.review],['차단 기록',data.counts.blocked],['독립 검증 표시',data.counts.verified],...(data.qa?[['QA P0 공백',data.qa.gaps.filter(g=>g.priority==='P0').length]]:[])]){const c=el(metrics,'div','','admin-metric');el(c,'small',k);el(c,'strong',v)}
 const tabs=el(host,'div','','admin-switch'),projectPick=el(host,'select','','admin-search'),search=el(host,'input','','admin-search'),filter=el(host,'select','','admin-search'),results=el(host,'div','','admin-progress-results'),count=el(host,'p','','admin-caption');
 projectPick.setAttribute('aria-label','오케스트라 프로젝트 선택');
 for(const p of data.projects)el(projectPick,'option',p.id).value=p.id;
 const primary=data.projects.find(p=>data.work.some(w=>w.project===p.id))||data.projects[0];
 if(primary)projectPick.value=primary.id;
 search.type='search';search.placeholder='프로젝트 · 작업명 · WORK_ID';search.setAttribute('aria-label','관리자 진행상황 검색');filter.setAttribute('aria-label','작업 상태');
 for(const [k,v] of [['','모든 상태'],['OPEN','대기'],['REVIEW','검토'],['BLOCKED','차단'],['IN_PROGRESS','진행']])el(filter,'option',v).value=k;
 const buttons=[];let mode='flow';
 for(const [k,v] of [['flow','오케스트라 흐름'],['projects','프로젝트'],['work','AI 작업·진행'],['alerts','중복·충돌'],['qa','가족앱 QA'],['stages','검증 단계'],['source','자료 범위']]){const b=el(tabs,'button',v,'quick');b.type='button';buttons.push([k,b]);b.addEventListener('click',()=>{mode=k;render()})}
 function card(title,lines){const c=el(results,'article','','admin-progress-card');el(c,'h3',title);lines.forEach(x=>el(c,'p',x));return c}
 function flowNode(parent,title,detail,state){
   const node=el(parent,'li','','admin-lineage-node');node.dataset.evidence=state;
   el(node,'strong',title);el(node,'span',detail);return node;
 }
 function render(){results.replaceChildren();buttons.forEach(([k,b])=>b.setAttribute('aria-pressed',String(k===mode)));projectPick.hidden=mode!=='flow';const q=search.value.trim().toLocaleLowerCase(),st=filter.value;let n=0;
 if(mode==='flow'){
   const project=data.projects.find(p=>p.id===projectPick.value);
   if(!project){card('프로젝트 연결 없음',['등록 프로젝트나 스냅샷이 없습니다.']);n++}
   else{
     const linked=data.work.filter(w=>w.project===project.id);
     card(project.id,[`등록 ${project.registered} / WORKBENCH PROJECT_CURRENT 투영 ${project.current} · ${project.signal}`,
       `등록 작업 ${project.workCount}건 · 스냅샷에서 연결된 작업 ${linked.length}건`,
       `프로젝트 상태 파일 SHA 대조: ${project.currentProjectionShaMatched===true?'원본 투영과 일치':'미검증 또는 구형 스냅샷'} (최상위 TAKY CURRENT 승인과 별개)`,
       `코드 기록 ${project.latestCodeAt||'미확인'} (코드 활동은 개발 완료 증명 아님)`,
       `로컬 복구 상태: ${recoveryLabel[project.observedRecoveryState]||'근거 미연결'}`,
       `HEAD 진입파일: ${project.headEntrypointIntegrity||'미검증'} · ${sourceLabel[project.headSourceParity]||'근거 미연결'} · 변경된 참조 소스 ${project.headSourceDriftCount??'미확인'}개`,
       `원본 연결: 작업 ID 등록 ${project.currentWorkIdRegistered?'있음':'없거나 미확인'} · 원자료 참조 ${project.sourceReferenceCount??'미기록'}건 · 산출물 참조 ${project.outputReferenceCount??'미기록'}건 · 보류 조건 ${project.pendingGateCount??'미기록'}건`,
       '위 소스 및 참조 숫자는 작업 완료·독립 QA·승인 증거가 아닙니다.']);n++;
     if(project.currentWorkId&&project.currentWorkRegistration==='CURRENT_DECLARED_UNREGISTERED'){
       card(project.currentWorkSourceVerified===true?'PROJECT CURRENT 작업 · 중앙 AI 등록부 미연결':'과거 CURRENT 투영 · 출처 재확인 필요',[
         `PROJECT CURRENT 기록 작업 ID: ${project.currentWorkId} · 원본 SHA: ${project.currentWorkSourceVerified===true?'일치':'불일치 또는 미확인'}`,
         `미해결 게이트 ${project.currentWorkPendingGates||0}건 · 프로젝트 로컬 코드 변경 관찰 ${project.localTrackedWipObserved?'있음':'미확인'}`,
         '프로젝트 문서에 명시된 작업이며 등록된 AI 실행·검토·완료를 증명하지 않습니다.',
         '후속: 정확한 작업 계약과 증거가 확인된 이후에만 기존 작업 등록부에 연결'
       ]);n++;
     }
     const qaRelated=projectQaGaps(project.id,data.qa);
     if(qaRelated.length){
       const critical=qaRelated.filter(g=>g.priority==='P0').length;
       card('연관 가족앱 검증 공백 · 작업 배정 아님',[
         `원본 QA 영역 태그로 연결된 미해결 ${qaRelated.length}건 (P0 ${critical}건)`,
         qaRelated.map(g=>g.priority+' '+g.id).join(' · '),
         '로컬 QA 관측 기반입니다. 원본 작업 계약·실기기·성취 결과를 검증하지 않았으며 자동 완료하거나 실행하지 않습니다.'
       ]);n++;
     }
     if(data.lineage){
       card('CURRENT · 대화 출처 연결 범위',[
         `10월 인증 내보내기 파일 ${data.lineage.sourceFilesParsed??0}건 · 원본 대화 ${data.lineage.nativeChatCount}건 · 주제 ${data.lineage.topicCount}건`,
         `작업 ID 명시된 원본 주제 연결 ${data.lineage.workItemsWithNativeTopicReference??0}건 · 계정 전체 대화 검수 완료 아님`,
         `프로젝트 PROJECT_CURRENT 투영 파일 SHA 일치 ${data.lineage.projectCurrentProjectionHashMatches}/${data.lineage.projectCount}`,
         `WORK_ID ↔ TAKY2 실행 계약 정확 일치 ${data.lineage.exactWorkKernelLinks}건 (등록 실행 영수증 3자 확인 ${data.lineage.signedWorkKernelLinks??0}건)`,
         'SHA 일치는 파일 출처 대조이며 작업 승인·실행 완료·대화 원본 확보의 증명이 아닙니다.'
       ]);n++;
     }
     if(project.id==='TAKY'&&data.kernel){
       card('TAKY2 전역 실행 영수증 — 개별 프로젝트와 자동 결합하지 않음',[
         `런타임 진위 검사 ${data.kernel.integrity==='HMAC_AND_ROLLBACK_ANCHOR_VERIFIED'?'HMAC 및 롤백 앵커 일치':'인증 근거 미연결 (스냅샷만 표시)'}`,
         `상태 파일 관측시각 ${data.kernel.observedFileModifiedAt||'미확인'} · 런타임 버전 ${data.kernel.runtimeVersion??'미확인'}`,
         `사전 게이트 영수증 ${data.kernel.preflightReceipts}건 · 실행 호출 기록 ${data.kernel.executionCallReceipts}건 · 호출수>0 기록 ${data.kernel.actualInvocationReceipts}건`,
         `결과 반환 ${data.kernel.returnedReceipts}건 · 실패 ${data.kernel.failedReceipts}건 · 결과 미상 ${data.kernel.outcomeUnknownReceipts}건`,
         `신뢰된 경로 재선택 기록 ${data.kernel.registeredRouteRecoveries}건 · WORK_ID 서명 연결 ${data.kernel.signedWorkLinks??0}건 · DONE 게이트 기록 ${data.kernel.doneGateRecords}건`,
         'RETURNED·DONE 기록 개수는 사용자 목표 달성 또는 독립 검증 PASS가 아닙니다.'
       ]);n++;
     }
     if(!linked.length){card('연결된 AI 작업 증거 없음',[
       project.currentWorkRegistration==='CURRENT_DECLARED_UNREGISTERED'
         ?'PROJECT CURRENT 작업은 발견했지만 중앙 AI 작업으로 등록·검증되지 않았습니다.'
         :'코드 변경이나 과거 대화가 존재하더라도 작업 연결이 검증됐다는 뜻이 아닙니다.',
       '다음 검토: WORK_ID, 실행 영수증, CURRENT의 관계를 원본과 대조']);n++}
     for(const x of linked){
       if(st&&x.status!==st)continue;
       if(q&&![x.id,x.title,x.status,x.executor].join(' ').toLocaleLowerCase().includes(q))continue;
       const preview=x.title.length>108?x.title.slice(0,108).trim()+'…':x.title;
       const c=card(preview,[`등록 상태 ${label[x.status]||x.status} · 실행 담당 ${x.executor||'미지정'} · 검토 담당 ${x.reviewer||'미지정'}`]);
       el(c,'code',x.id);
       const detail=el(c,'details','','admin-flow-detail');
       detail.open=x===linked.find(w=>(!st||w.status===st)&&(!q||[w.id,w.title,w.status,w.executor].join(' ').toLocaleLowerCase().includes(q)));
       el(detail,'summary','실행 단계·증거·다음 확인 보기');
       if(preview!==x.title)el(detail,'p','전체 작업명: '+x.title,'admin-caption');
       const path=el(detail,'ol','','admin-lineage');
       flowNode(path,'① 작업 등록','WORK_ID 등록 사실 · 실행/완료의 증거 아님','record');
       flowNode(path,'② 원본 대화 연결',x.chatLinked?`인증된 내보내기 주제 인덱스에서 WORK_ID 명시 연결 ${x.nativeTopicMatches}건 (원문 검증 필요)`:'10월 원본 내보내기 기준 WORK_ID 연결 미입증',x.chatLinked?'record':'missing');
       const execution=x.classificationAvailable
         ?`미실행 준비 ${x.preparedCount}건 · 모델 미호출 활동 ${x.noModelCount}건 · 호출 주장 ${x.callClaimCount}건 · 분류 불가 ${x.unclassifiedReceiptCount}건`
         :'영수증 세부 분류 미연결 (구형 스냅샷)';
       flowNode(path,'③ WORKBENCH 실행 근거',execution,x.callClaimCount>0?'claim':'missing');
       const kernel=x.kernelExact;
       const kernelEvidence=kernel?.relation==='EXACT_REGISTERED_TASK_ID'
          ?`${kernel.proof==='REGISTERED_ROUTED_SIGNED_RECEIPT'?'등록 작업·실행 결과·TAKY2 서명 영수증 일치':'정확한 작업 ID 일치 (직접 연결)'} · 게이트 ${kernel.preflightCount}건 · 실제 호출 기록 ${kernel.invokedCount}건 · 결과 미상 ${kernel.unknownCount}건 · 경로 복구 ${kernel.routeRecoveryCount}건`
          :kernel?.relation==='NO_EXACT_TASK_ID_MATCH'
          ?x.executionGap==='PREPARATION_PREVIEW_ONLY_OBSERVED'
            ?'준비·미실행 미리보기 영수증만 확인 · TAKY2 호출 근거 없음 (실제 실행 없음을 증명하지 않음)'
            :x.executionGap==='FAILURE_RECORDED_BUT_SIGNED_EXECUTION_LINK_MISSING'
            ?'실패 영수증 기록 있음 · TAKY2 서명 호출 영수증 미연결 (실패 원인 확인 필요)'
            :'등록 WORK_ID에 해당하는 TAKY2 작업 ID 일치 기록 없음 (다른 실행 자체가 없다는 뜻 아님)'
          :'TAKY2 실행 계약 연결 미확인 (구형 스냅샷)';
       flowNode(path,'④ TAKY2 실행 계약',kernelEvidence,kernel?.relation==='EXACT_REGISTERED_TASK_ID'?'record':'missing');
       if(x.preparedSourceState==='PREPARED_SOURCE_AND_HEAD_DRIFT_HOLD'||x.preparedSourceState==='PREPARED_SOURCE_SHA_DRIFT_HOLD'||x.preparedSourceState==='PREPARED_HEAD_DRIFT_HOLD'){
         el(detail,'p','준비 당시 소스 SHA 또는 Git HEAD가 변경됨 — 과거 작업 재실행 중지. 최신 소스·승인 조건에 맞게 재준비 필요','admin-next-action');
       }else if(x.preparedSourceState==='SOURCE_PIN_MATCH_NOT_EXECUTION_AUTHORIZATION'){
         el(detail,'p','준비 당시 코드 SHA/HEAD 일치 확인 · 실행 승인 및 최신 사용량 점검은 별개','admin-caption');
       }
       flowNode(path,'⑤ 산출물',x.outputCount>0?`산출물 참조 ${x.outputCount}건 · 실물 확인 별도`:'산출물 참조 미연결',x.outputCount>0?'record':'missing');
       flowNode(path,'⑥ 독립검증',x.verified?'독립 검증 표시 기록 · 해당 버전 확인 필요':'독립 검증 증거 미연결',x.verified?'record':'missing');
       const execNext=x.executionGap==='PREPARATION_PREVIEW_ONLY_OBSERVED'
         ?'새 모델을 호출하기 전에 준비 기록과 승인·실행 필요성 검토'
         :x.executionGap==='FAILURE_RECORDED_BUT_SIGNED_EXECUTION_LINK_MISSING'
         ?'기존 래퍼 실패 기록·입력 패킷 구성 원인을 로컬 재검토 (모델 재호출 아님)'
         :kernel?.relation==='EXACT_REGISTERED_TASK_ID'
         ?(!x.outputCount?'실제 산출물 연결 확인':!x.verified?'원본 요구·산출물·독립검증 비교':'사용자 승인 기준 최종 대조')
         :'원본 영수증에서 실행 ID를 확보하거나 누락 원인을 확인';
       el(detail,'p','실행 후속 확인: '+execNext,'admin-next-action');
       if(!x.chatLinked)el(detail,'p','대화 연결: 인증된 10월 원본 대화에서 명시된 WORK_ID 확보 필요. 과거 공유본·주제 유사도만으로 연결 금지','admin-caption');n++;
     }
   }
 }
 else if(mode==='projects')for(const x of data.projects){const linked=data.work.filter(w=>w.project===x.id);if(st&&!linked.some(w=>w.status===st))continue;if(q&&![x.id,x.signal,x.currentWorkId,...linked.map(y=>y.title)].join(' ').toLocaleLowerCase().includes(q))continue;card(x.id,[`등록 ${x.registered} / CURRENT ${x.current}`,`AI 작업 ${x.workCount} · 보존 대화 주제 후보 ${x.historicalChats} · AI 인계 후보 ${x.relayCandidates}`,`코드 기록 ${x.latestCodeAt||'미확인'} · ${x.signal} (완료 증명 아님)`,...(x.currentWorkRegistration==='CURRENT_DECLARED_UNREGISTERED'&&x.currentWorkId?[`${x.currentWorkSourceVerified===true?'CURRENT SHA 일치':'CURRENT 출처 재확인 필요'} · 작업 ${x.currentWorkId}: 중앙 AI 미등록 (승인·완료 아님)`]:[])]);n++}
 else if(mode==='work'){
  for(const x of data.work){if(st&&x.status!==st)continue;if(q&&![x.id,x.title,x.project,x.executor,x.status].join(' ').toLocaleLowerCase().includes(q))continue;const c=card(x.title,[`${x.project} / ${x.executor} / 검토자 ${x.reviewer}`,`상태 ${label[x.status]||x.status} · 영수증 ${x.receiptCount} · 산출물 ${x.outputCount}`,`최근 기록 ${x.lastReceipt||'없음'} · 독립 검증 ${x.verified?'증거 확인':'미확인'}`]);el(c,'code',x.id);n++}
  if(!st)for(const x of data.projects){if(x.currentWorkRegistration!=='CURRENT_DECLARED_UNREGISTERED'||!x.currentWorkId)continue;
   if(q&&![x.id,x.currentWorkId].join(' ').toLocaleLowerCase().includes(q))continue;
   card(x.currentWorkSourceVerified===true?'PROJECT CURRENT · 중앙 등록부 미연결':'과거 CURRENT 투영 · 출처 재확인 필요',[`${x.id} / 작업 ID ${x.currentWorkId}`,`미해결 게이트 ${x.currentWorkPendingGates||0}건 · 실행/독립검증/승인 아님`]);n++
  }
}
 else if(mode==='alerts')for(const x of data.alerts){if(q&&![x.kind,x.project,x.workId,x.note].join(' ').toLocaleLowerCase().includes(q))continue;card(x.kind,[x.project||x.workId||'관련 원본 검토 필요',x.note||'원문과 작업 증거 비교 필요']);n++}
 else if(mode==='qa'){
   const qa=data.qa;
   if(!qa){card('관리자 QA 근거 미연결',['로컬 QA 영수증이 아직 서버 스냅샷에 연결되지 않았습니다. 검증 완료로 해석하지 않습니다.']);n++}
   else{
     const stamp=Date.parse(qa.finishedAt||''),age=Date.now()-stamp;
     const stale=!Number.isFinite(stamp)||age<0||age>24*3600000;
     card('가족앱 로컬 QA · 운영 품질 검증 아님',[
       `실행 ${qa.mode} · ${qa.finishedAt||'시간 미확인'} · ${stale?'현재 실행 근거가 아닌 과거 영수증':'최근 24시간 내 실행 영수증 (실시간 결과 아님)'}`,
       `로컬 테스트 통과 ${qa.passed} · 실패 ${qa.failed} · 미실행/차단 ${qa.blocked} · 검증 공백 ${qa.openGaps}`,
       '부모·학습자 가상 데이터 테스트입니다. 실제 기기·학습 성취·앱 품질 완료를 인증하지 않습니다.'
     ]);n++;
     for(const g of qa.gaps){
       if(q&&![g.id,g.area,g.priority].join(' ').toLocaleLowerCase().includes(q))continue;
       card(`${g.priority} · ${g.area}`,[
         `미해결 QA 작업: ${g.id}`,
         '기존 QA 원본과 실제 사용자 동작을 대조하여 개선·재검증 필요. PASS 개수로 자동 해소하지 않음.'
       ]);n++;
     }
   }
 }
 else if(mode==='stages'){
  if(!data.pipeline){
   const headings=['1. RAW·원본 확보','2. 원본 적격성','3. 개정·중복 검토','4. 독립 원문 분석','5. 상호검토·통합','6. FORMING·프로젝트 소비'];
   for(const heading of headings){if(q&&!heading.toLocaleLowerCase().includes(q))continue;card(heading,['단계별 증거 미연결 — 0건 또는 완료로 판정하지 않습니다.','조회 가능한 서버 스냅샷에 원본·독립검토·실행 단계별 근거가 없습니다.']);n++}
  }else{
  const p=data.pipeline,stages=[
   ['1. RAW·원본 확보',`노션 본문 ${p.notionTextStaged||0}/${p.notionTotal||0} · 미디어 검증 참조 ${p.mediaVerifiedReferences||0}건`,'원본 바이트 확보는 원문 내용 이해나 품질 검증과 다릅니다.'],
   ['2. 원본 적격성',`개별 참조 ${p.trustReferencesVerified||0}/${p.trustReferencesTotal||0} · 마이닝 요청 HOLD ${p.trustHoldRequests||0}`,`원본 부적격 결과 기록 ${p.trustHistoricalResults||0}건 · 후보 보고서 ${p.trustCandidateOnly?'별도 검토 중':'근거 미확인'}`],
   ['3. 개정·중복 검토',`반복된 노션 URL ${p.logicalDuplicateUrls||0}개 · 동일 증거 후보 ${p.identicalEvidenceDuplicateCandidates||0}개`,`원문 개정 확인 필요 ${p.differentRawDuplicateHolds||0}개 · 자동 병합 금지`],
   ['4. 독립 원문 분석',`GPT ${p.gptFrozen?'증거 있음':'미검증'} · Claude ${p.claudeFrozen?'증거 있음':'미검증'}`,'동일 원자료 전체 검토·결과 동결이 필요합니다.'],
   ['5. 상호검토·통합',`GPT↔Claude ${p.crossFrozen?'증거 있음':'미검증'} · Codex ${p.codexFrozen?'증거 있음':'미검증'}`,'독립 의견과 충돌·반례를 원문에 대조한 이후에만 통합합니다.'],
   ['6. FORMING·프로젝트 소비',`AI 작업 검증 ${data.counts?.verified||0}건 · 프로젝트 ${data.counts?.projects||0}개`,'실제 앱 화면·기능·원자료 회귀 증거가 없으면 완료로 표시하지 않습니다.']
  ];
  for(const [heading,...lines] of stages){if(q&&!heading.toLocaleLowerCase().includes(q))continue;card(heading,lines);n++}
  }
 }
 else{
 const lines=[`9월 보존 대화 ${data.coverage.historicalChats}개 · 10월 이후 원본 대화 ${data.coverage.octoberNativeChats}개`,'계정 전체 대화 확보·검수 완료를 의미하지 않습니다.'];
 if(data.pipeline){
  const p=data.pipeline;
  lines.push(`노션 ${p.notionTotal}건 · 본문 대기열 ${p.notionTextStaged}건 · 본문 미확보 ${p.notionTextHolds}건`);
  lines.push(`미디어 바이트 근거 ${p.mediaVerifiedReferences}참조 · 미확보 ${p.mediaMissingReferences}참조 (시각 의미 분석과 별개)`);
  lines.push(`독립 결과 동결 GPT ${p.gptFrozen?'증거 있음':'미확인'} / Claude ${p.claudeFrozen?'증거 있음':'미확인'}`);
  lines.push(`양방향 검토 ${p.crossFrozen?'증거 있음':'미확인'} · Codex 통합 ${p.codexFrozen?'증거 있음':'미확인'}`);
  lines.push(`원본 출처 적격 참조 ${p.trustReferencesVerified||0}/${p.trustReferencesTotal||0}건 · 부적격 결과 기록 ${p.trustHistoricalResults||0}건`);
  lines.push(`반복 URL ${p.logicalDuplicateUrls||0}건 · 원본 개정 검토 필요 ${p.differentRawDuplicateHolds||0}건 · 자동 병합 없음`);
  if(p.trustCandidateAgeHours!==null&&p.trustCandidateAgeHours!==undefined)lines.push(`출처 적격성은 ${p.trustCandidateAgeHours}시간 전 후보 보고서이며 CURRENT 자동 승격 아님`);
  if(p.userApprovalRequiredForModel)lines.push('모델/API 실행은 별도 승인 필요. 대기열 등록은 의미 분석 결과가 아닙니다.');
 }
 card('원본 자료 범위 · 마이닝 단계',lines);n=1}
 count.textContent=n+'개 항목 표시'
 }
 projectPick.addEventListener('change',render);search.addEventListener('input',render);filter.addEventListener('change',render);render();
}
