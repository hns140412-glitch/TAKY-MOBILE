// Owner operations console model.
// Every check reports only what this client can actually observe.
// VERIFIED = observed now (scope says where) / UNVERIFIED = evidence exists but not confirmed now /
// NOT_CONNECTED = no adapter exists; never shown as live.

export const STATES = Object.freeze(['VERIFIED','UNVERIFIED','NOT_CONNECTED']);
export const STATE_LABEL = Object.freeze({VERIFIED:'검증됨',UNVERIFIED:'미검증',NOT_CONNECTED:'미연결'});
const GLYPH = {VERIFIED:'●',UNVERIFIED:'◐',NOT_CONNECTED:'○'};

// Recorded in README/MVP_CONTRACT (2026-09-08 reconciliation). Historical evidence, not live telemetry.
export const RECORDED_DEPLOY = Object.freeze({
  deployId:'6a9ea85873979b00083c30cf',
  commit:'7ad757e',
  publishedAt:'2026-09-07T12:04:53.141Z',
  site:'taky-mobile.netlify.app',
});

const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const hostOf = url => { try { return new URL(url).host; } catch { return null; } };
const shortTime = iso => { const t=Date.parse(iso||''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0,16).replace('T',' ')+'Z' : null; };
const check = (id,title,state,detail,extra={}) => ({id,title,state,detail,...extra});

function registryLane({apps=[]}) {
  const direct=apps.filter(a=>a.url), via=apps.filter(a=>!a.url&&a.via);
  return {
    id:'registry', code:'A', title:'앱 레지스트리·배포 리비전',
    checks:[
      ...apps.map(a=>check(`app-${a.id}`, a.name,
        'UNVERIFIED',
        a.url ? `${hostOf(a.url)} · 링크 등록됨, 도달·리비전 미확인` : a.via ? 'Ready 경유 실행 · 직접 배포 URL 없음' : '배포 링크 없음',
        {scope:a.url?'로컬 레지스트리':'경유'})),
      check('deploy-revisions','앱별 배포 리비전','NOT_CONNECTED','앱별 Netlify 리비전 미연결 · TAKY Mobile만 B 레인 읽기 전용 조회 · 브라우저에 토큰을 두지 않음'),
    ],
    fact:`직접 ${direct.length} · Ready 경유 ${via.length} · 리비전 미연결`,
  };
}

const short = v => (v ? String(v).slice(0,8) : '?');
const RELEASE_EVIDENCE = {LIVE_VERIFIED:'실시간 확인',HISTORICAL:'과거 결과',AUTH_REQUIRED:'인증 필요',UNAVAILABLE:'조회 불가'};
const recordedText = () => `기록 증거: ${RECORDED_DEPLOY.deployId.slice(0,8)} @ ${RECORDED_DEPLOY.commit} · ${RECORDED_DEPLOY.publishedAt.slice(0,10)} · 실시간 상태 아님`;

// Read-only release gateway result -> GitHub revision + Netlify deploy checks.
// Only LIVE_VERIFIED with a LIVE provider answer may be VERIFIED; anything older is labelled historical.
function releaseChecks(release) {
  const ghTitle='TAKY Mobile 소스 리비전 (GitHub)', nfTitle='TAKY Mobile 운영 배포';
  if(!release) return [
    check('github-revision',ghTitle,'NOT_CONNECTED','릴리스 상태 미조회'),
    check('netlify-deploy',nfTitle,'UNVERIFIED',recordedText(),{scope:'문서 기록'}),
  ];
  const ev=release.state, d=release.data, label=RELEASE_EVIDENCE[ev]||ev;
  const extra={scope:`${label} ${ev}`,evidence:ev};
  if(!d){
    const auth=ev==='AUTH_REQUIRED';
    const why=auth?'게이트웨이 응답: 인증 필요':`릴리스 게이트웨이 조회 불가 (${release.reason||ev})`;
    return [
      check('github-revision',ghTitle,auth?'UNVERIFIED':'NOT_CONNECTED',why,{...extra,action:auth?'auth':'refresh'}),
      check('netlify-deploy',nfTitle,'UNVERIFIED',`${why} · ${recordedText()}`,{...extra,action:auth?'auth':'refresh'}),
    ];
  }
  const live=ev==='LIVE_VERIFIED', at=shortTime(d.checkedAt)||'시각 없음';
  const past=live?'':`과거 조회 ${at}${release.reason?` (${release.reason})`:''} · 현재 상태로 단정하지 않음 · `;
  const action=release.authRequired?'auth':live?null:'refresh';
  const g=d.github, n=d.netlify;
  const gh=g.status==='LIVE'
    ? check('github-revision',ghTitle,live?'VERIFIED':'UNVERIFIED',
        `${past}${g.repository||'?'}@${g.ref||'?'} · ${short(g.sha)}${g.committedAt?` · 커밋 ${shortTime(g.committedAt)}`:''}${live?` · 조회 ${at}`:''}`,{...extra,action})
    : check('github-revision',ghTitle,g.status==='NOT_CONNECTED'?'NOT_CONNECTED':'UNVERIFIED',
        `${past}${g.status==='NOT_CONNECTED'?'GitHub 읽기 자격 미설정':'GitHub 조회 실패'} (${g.error||g.status})`,{...extra,action});
  let nf;
  if(n.status==='LIVE'){
    const match={MATCH:'main 최신과 일치',MISMATCH:'main 최신과 다름'}[d.revisionMatch]||'main 대조 불가';
    nf=check('netlify-deploy',nfTitle,live?'VERIFIED':'UNVERIFIED',
      `${past}게시 배포 ${short(n.deployId)} · ${n.state||'unknown'} · commit ${short(n.commitRef)}${n.publishedAt?` · 게시 ${shortTime(n.publishedAt)}`:''} · ${match}`,
      {...extra,action,attention:live&&(n.state!=='ready'||d.revisionMatch==='MISMATCH')});
  } else nf=check('netlify-deploy',nfTitle,n.status==='NOT_CONNECTED'?'NOT_CONNECTED':'UNVERIFIED',
    `${past}${n.status==='NOT_CONNECTED'?'Netlify 토큰/사이트 ID 미설정':'Netlify 조회 실패'} (${n.error||n.status}) · ${recordedText()}`,{...extra,action});
  return [gh,nf];
}

function releaseLane({canonical,release}) {
  const src=canonical?.source||'UNAVAILABLE', b=canonical?.bundle;
  const root=b?.files?.find?.(f=>f.path==='TAKY.md');
  const at=shortTime(b?.fetchedAt);
  const where=b ? `${b.repository||'TAKY'}@${b.ref||'?'} · TAKY.md ${root?.sha?.slice(0,8)||'?'}` : '';
  let gh;
  if(src==='REMOTE_VERIFIED') gh=check('canonical','GitHub 기준(canonical) 읽기','VERIFIED',`${where} · ${at}`,{scope:'이번 세션 원격'});
  else if(b) gh=check('canonical','GitHub 기준(canonical) 읽기','UNVERIFIED',`${src} · 캐시 ${where} · ${at||'시각 없음'}`,{scope:'기기 캐시',action:'refresh'});
  else if(canonical?.authRequired) gh=check('canonical','GitHub 기준(canonical) 읽기','UNVERIFIED','게이트웨이 응답: 인증 필요',{action:'auth'});
  else gh=check('canonical','GitHub 기준(canonical) 읽기','NOT_CONNECTED',`게이트웨이 미도달 (${src})`,{action:'refresh'});
  return {
    id:'release', code:'B', title:'GitHub·Netlify 릴리스 검증',
    checks:[
      gh,
      ...releaseChecks(release),
      check('runtime-revision','현재 실행 중 소스 리비전','NOT_CONNECTED','빌드 리비전 주입 없음 · 이 화면의 코드와 배포본 대조 불가'),
      check('release-pass','Release PASS','UNVERIFIED','실기기·오프라인·인증 E2E 미통과'),
    ],
  };
}

function assetLane({cacheKeys}) {
  const keys=Array.isArray(cacheKeys)?cacheKeys:null;
  return {
    id:'assets', code:'C', title:'HNS Drive 에셋 마스터·SIEZEALL 배포 해시',
    checks:[
      check('hns-master','HNS Drive 원본 해시','NOT_CONNECTED','Drive 어댑터 미구현'),
      check('siezeall-dist','SIEZEALL 배포본 해시','NOT_CONNECTED','배포 해시 레지스트리 미연결'),
      keys===null
        ? check('device-cache','이 기기 캐시','NOT_CONNECTED','Cache Storage 사용 불가')
        : check('device-cache','이 기기 캐시',keys.length?'UNVERIFIED':'NOT_CONNECTED',
            keys.length?`${keys.join(', ')} · 해시 대조 없음`:'앱 셸 캐시 없음',{scope:'기기 로컬'}),
    ],
  };
}

function learningLane({works=[],storageMode}) {
  const loops=works.filter(w=>String(w.action?.type||'').toUpperCase()==='START_LEARNING_LOOP');
  const received=loops.filter(w=>w.execution?.receipt?.result==='LEARNING_LOOP_RESULT_RECEIVED');
  const awaiting=loops.filter(w=>w.execution?.status==='AWAITING_RESULT');
  const last=received.map(w=>w.execution.receipt.returnedAt).filter(Boolean).sort().pop();
  return {
    id:'learning', code:'D', title:'가족 기록 백업·학습 코어',
    checks:[
      received.length
        ? check('loop-receipts','Ready 학습 결과 영수증','VERIFIED',`${received.length}건 수신 (work-id+nonce 검증) · 최근 ${shortTime(last)||'?'}${awaiting.length?` · 대기 ${awaiting.length}`:''}`,{scope:'이 기기 로컬',action:awaiting.length?'work':null,attention:awaiting.length>0})
        : check('loop-receipts','Ready 학습 결과 영수증','UNVERIFIED',awaiting.length?`결과 대기 ${awaiting.length}건 · 수신 영수증 없음`:'검증된 학습 결과 없음',{scope:'이 기기 로컬',action:'work',attention:awaiting.length>0}),
      storageMode
        ? check('local-store','런타임 저장소',storageMode==='INDEXEDDB'?'VERIFIED':'UNVERIFIED',storageMode==='INDEXEDDB'?'IndexedDB 쓰기 성공':'LocalStorage 대체 저장 중',{scope:'이 기기 로컬'})
        : check('local-store','런타임 저장소','UNVERIFIED','아직 저장 기록 없음'),
      check('family-backup','가족 증거 중앙 백업','NOT_CONNECTED','중앙 기록·암호화 백업·오프라인 재전송 미연결 · 수동 인수인계 .md만 가능',{action:'handoff'}),
    ],
  };
}

function accessLane({canonical}) {
  const src=canonical?.source||'UNAVAILABLE';
  let session;
  if(src==='REMOTE_VERIFIED') session=check('owner-session','소유자 세션','VERIFIED','게이트웨이가 HttpOnly 세션 수락 · 이번 세션 확인',{scope:'이번 세션 원격'});
  else if(canonical?.authRequired) session=check('owner-session','소유자 세션','UNVERIFIED','이 기기 인증 필요 · 접근키는 저장하지 않음',{action:'auth',attention:true});
  else if(src==='CACHE_FRESH') session=check('owner-session','소유자 세션','UNVERIFIED','캐시 사용 중 · 세션 재확인 안 함',{action:'refresh'});
  else session=check('owner-session','소유자 세션','NOT_CONNECTED',`인증 게이트웨이 미도달 (${src})`);
  return {
    id:'access', code:'E', title:'소유자 승인·인증·보안',
    checks:[
      session,
      check('approval-gate','승인 게이트 (APPLY)','UNVERIFIED','APPLY는 APPROVAL_REQUIRED로 정지 · 서버측 승인 기록 미구현'),
      check('write-adapter','canonical 쓰기 어댑터','NOT_CONNECTED','브라우저는 MASTER를 쓰지 않음 · 배포/푸시/유료 API는 사람 승인 필요'),
    ],
  };
}

const cnt = v => Number.isInteger(v) && v >= 0;
// Local-only deep QA summary (sanitized by the localhost fixture host). Historical offline evidence: never VERIFIED.
function qaCheck(qa) {
  const title='로컬 가족 QA 리포트', scope='이 PC 로컬 검증';
  const s=qa?.statuses, at=shortTime(qa?.finishedAt);
  if(!qa||qa.contract!=='TAKY_FAMILY_PERIODIC_QA_V1'||!s||![s.passed,s.failed,s.blocked,s.openGaps].every(cnt)||!at||!Array.isArray(qa.gaps))
    return check('local-qa-report',title,'NOT_CONNECTED','로컬 QA 리포트 없음 · localhost 전용 요약 미연결',{scope,action:'refresh'});
  const bad=s.failed>0||s.blocked>0;
  return check('local-qa-report',title,'UNVERIFIED',
    `통과 ${s.passed} · 실패 ${s.failed} · 차단 ${s.blocked} · 열린 갭 ${s.openGaps} · 마지막 실행 ${at} · 과거 오프라인 증거, 운영 검증 아님`,
    {scope,attention:bad,gaps:qa.gaps.slice(0,20),action:bad?'refresh':null});
}

function incidentLane({works=[],traces=[],qa}) {
  const failed=works.filter(w=>w.execution?.status==='FAILED'||w.state==='FAILED');
  const rejected=traces.filter(t=>t.state==='REJECTED'||t.state==='FAILED');
  const n=failed.length+rejected.length;
  return {
    id:'incidents', code:'F', title:'사고·복구',
    checks:[
      qaCheck(qa),
      check('local-failures','로컬 실행 실패·거부','VERIFIED',
        n?`실패 WORK ${failed.length} · 거부/실패 TRACE ${rejected.length}`:'로컬 TRACE·WORK에 실패 기록 0건',
        {scope:'이 기기 로컬',action:n?'trace':null,attention:n>0}),
      check('remote-incidents','원격 사고 수집','NOT_CONNECTED','오류 텔레메트리 미연결 · 다른 기기 사고는 보이지 않음'),
      check('handoff-recovery','인수인계·재개 복구','UNVERIFIED','로컬 구현 · 복원 리허설 미검증',{action:'resume'}),
      check('forensic','포렌식 복구','NOT_CONNECTED','원대화 검색 어댑터 미연결 · RECOVERY_REQUIRED'),
    ],
  };
}

export function deriveOperations(snapshot={}) {
  const lanes=[registryLane(snapshot),releaseLane(snapshot),assetLane(snapshot),learningLane(snapshot),accessLane(snapshot),incidentLane(snapshot)];
  const totals={VERIFIED:0,UNVERIFIED:0,NOT_CONNECTED:0};
  for(const lane of lanes){
    lane.counts={VERIFIED:0,UNVERIFIED:0,NOT_CONNECTED:0};
    for(const c of lane.checks){ lane.counts[c.state]++; totals[c.state]++; }
    lane.attention=lane.checks.some(c=>c.attention);
  }
  return {lanes,totals,primary:pickPrimaryAction(lanes)};
}

const ACTION_LABEL={auth:'기기 인증',refresh:'기준 새로고침',trace:'TRACE 열기',work:'WORK 열기',handoff:'인수인계 .md',resume:'재개'};
export const actionText = action => ACTION_LABEL[action] || action;

// One primary owner action: the most urgent thing this client can actually do now.
export function pickPrimaryAction(lanes=[]) {
  const all=lanes.flatMap(l=>l.checks.map(c=>({...c,lane:l.id})));
  const order=[
    c=>c.action==='auth'&&c.attention,
    c=>c.action==='trace'&&c.attention,
    c=>c.action==='work'&&c.attention,
    c=>c.id==='canonical'&&c.state!=='VERIFIED'&&c.action,
  ];
  for(const rule of order){
    const hit=all.find(rule);
    if(hit) return {action:hit.action,label:actionText(hit.action),reason:`${hit.title} · ${STATE_LABEL[hit.state]}`,lane:hit.lane};
  }
  return null;
}

const stateTag = state => `<span class="ops-state" data-state="${state}"><span aria-hidden="true">${GLYPH[state]}</span> ${STATE_LABEL[state]}<span class="sr-code"> ${state}</span></span>`;

export function renderOperationsStrip(model) {
  const t=model.totals, p=model.primary;
  return `<div class="ops-strip-row">
      <div class="ops-strip-counts" aria-label="검증 ${t.VERIFIED}, 미검증 ${t.UNVERIFIED}, 미연결 ${t.NOT_CONNECTED}">
        <span data-state="VERIFIED">● ${t.VERIFIED}</span><span data-state="UNVERIFIED">◐ ${t.UNVERIFIED}</span><span data-state="NOT_CONNECTED">○ ${t.NOT_CONNECTED}</span>
      </div>
      <button class="ops-link" type="button" data-ops-open>운영 콘솔</button>
    </div>
    ${p?`<button class="ops-primary" type="button" data-ops-action="${p.action}"><b>${esc(p.label)}</b><span>${esc(p.reason)}</span></button>`
      :'<p class="ops-quiet">지금 이 기기에서 실행할 조치 없음 · 미연결 항목은 승인 후 연결</p>'}`;
}

export function renderOperationsConsole(model) {
  const p=model.primary;
  const head=`<div class="ops-legend" role="note">
      <span data-state="VERIFIED">● 검증됨 = 지금 관측</span>
      <span data-state="UNVERIFIED">◐ 미검증 = 증거만 있음</span>
      <span data-state="NOT_CONNECTED">○ 미연결 = 어댑터 없음</span>
    </div>
    ${p?`<button class="ops-primary" type="button" data-ops-action="${p.action}"><b>${esc(p.label)}</b><span>${esc(p.reason)}</span></button>`:''}`;
  const lanes=model.lanes.map(l=>`
    <details class="ops-lane" data-lane="${l.id}"${l.attention?' open':''}>
      <summary>
        <span class="ops-code" aria-hidden="true">${l.code}</span>
        <span class="ops-lane-title">${esc(l.title)}${l.attention?' <em class="ops-attn">확인 필요</em>':''}</span>
        <span class="ops-lane-counts" aria-label="검증 ${l.counts.VERIFIED}, 미검증 ${l.counts.UNVERIFIED}, 미연결 ${l.counts.NOT_CONNECTED}">
          <span data-state="VERIFIED">${l.counts.VERIFIED}</span><span data-state="UNVERIFIED">${l.counts.UNVERIFIED}</span><span data-state="NOT_CONNECTED">${l.counts.NOT_CONNECTED}</span>
        </span>
      </summary>
      ${l.fact?`<p class="ops-fact">${esc(l.fact)}</p>`:''}
      <ul class="ops-checks">
        ${l.checks.map(c=>`<li class="ops-check" data-check="${c.id}" data-state="${c.state}"${c.evidence?` data-evidence="${c.evidence}"`:''}>
          <div class="ops-check-main"><strong>${esc(c.title)}</strong>${stateTag(c.state)}</div>
          <p>${esc(c.detail)}${c.scope?` <span class="ops-scope">· ${esc(c.scope)}</span>`:''}</p>
          ${c.gaps?.length?`<ul class="ops-gaps" aria-label="열린 갭">${c.gaps.map(g=>`<li data-gap="${esc(g.id)}"><b>${esc(g.priority)}</b> ${esc(g.area)} · ${esc(g.why)}</li>`).join('')}</ul>`:''}
          ${c.action?`<button class="ops-act" type="button" data-ops-action="${c.action}">${esc(actionText(c.action))}</button>`:''}
        </li>`).join('')}
      </ul>
    </details>`).join('');
  return head+lanes;
}
