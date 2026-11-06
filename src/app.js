import { deriveOperations, renderOperationsStrip, renderOperationsConsole } from './admin-status.mjs';
import { adminSession, adminLogin, adminLogout, readAdminProgress, renderAdminProgress } from './admin-progress.mjs';
import { loadAppState, saveAppState } from './db.js';
import { mountFamilyHub } from './family-hub.mjs';
import { mountCharacterRequests } from './character-requests.mjs';
import { createFamilySignin } from './family-signin.mjs';
import { routeIntent, commandToIntent } from './intent.js';
import { loadCanonical, canonicalSummary } from './canonical.js';
import { loadReleaseStatus } from './release-status.mjs';
import { authenticateWithKey } from './auth.js';
import { downloadHandoff, parseResumeFile } from './handoff.js';
import { actionLabel, selectNextExecutableWork, executeWorkAction, applyExecutionResult, applyLearningLoopReturn } from './execution.mjs';

const DEFAULT_READY_URL='https://profound-ganache-902032.netlify.app';
function normalizeReadyTarget(raw){
  if(!raw)return DEFAULT_READY_URL;
  try{
    const url=new URL(raw),host=url.hostname.toLowerCase();
    const local=host==='localhost'||host==='127.0.0.1';
    const tunnel=host.endsWith('.trycloudflare.com');
    if(!(local?['http:','https:'].includes(url.protocol):url.protocol==='https:'&&tunnel))return DEFAULT_READY_URL;
    url.username='';url.password='';url.search='';url.hash='';
    return url.href.replace(/\/$/,'');
  }catch{return DEFAULT_READY_URL}
}
const BOOT_PARAMS=new URLSearchParams(location.search);
const READY_URL=normalizeReadyTarget(BOOT_PARAMS.get('ready_target'));
function optionalLocalTarget(key){
  const raw=BOOT_PARAMS.get(key);if(!raw)return null;
  try{const u=new URL(raw),host=u.hostname.toLowerCase(),local=host==='localhost'||host==='127.0.0.1',tunnel=host.endsWith('.trycloudflare.com');if(!(local?['http:','https:'].includes(u.protocol):u.protocol==='https:'&&tunnel))return null;u.username='';u.password='';u.search='';u.hash='';return u.href.replace(/\/$/,'')}catch{return null}
}
const LOCAL_SPECIALIST_TARGETS={
  hide:optionalLocalTarget('hide_target'),
  snap:optionalLocalTarget('snap_target'),
  playCamp:optionalLocalTarget('play_camp_target'),
};

const APPS = [
  {
    id:'ready-set',
    name:'Ready & Set',
    short:'R&S',
    aliases:['레디앤셋','레디 앤 셋','레디셋','ready & set','ready set'],
    url:READY_URL,
    netlifySite:'profound-ganache-902032',
    status:'LINKED',
    note:'그냥! 지금 하면 돼!',
  },
  {
    id:'snap-pop',
    name:'Snap & Pop',
    short:'S&P',
    aliases:['스냅팝','스냅 앤 팝','snap & pop','snap pop'],
    url:'https://cheerful-pothos-d1c3ee.netlify.app',
    netlifySite:'cheerful-pothos-d1c3ee',
    status:'LINKED',
    note:'아이디어를 Snap! 이야기로 Pop!',
  },
  {
    id:'hide-seek',
    name:'Hide & Seek',
    short:'H&S',
    aliases:['하이드앤씩','하이드앤시크','하이드 앤 시크','hide & seek','hide seek'],
    url:'https://dainty-froyo-a6e427.netlify.app',
    netlifySite:'dainty-froyo-a6e427',
    status:'LINKED',
    note:'머릿속에 숨어버린 단어 찾기',
  },
  {
    id:'play-camp',
    name:'Play Camp',
    short:'PC',
    aliases:['플레이캠프','플레이 캠프','play camp'],
    url:'https://play-camp-taky.netlify.app',
    netlifySite:'play-camp-taky',
    status:'ACCESS_RESTRICTED',
    note:'태블릿 수련 캠프 · Netlify 운영자 인증 필요',
  },
  {
    id:'savey',
    name:'SAVEY',
    short:'SV',
    aliases:['세이비','savey'],
    url:'https://savey-taky.netlify.app',
    netlifySite:'savey-taky',
    status:'ACCESS_RESTRICTED',
    note:'가족 전용 가계부 · Netlify 로그인 필요 · 가족 금융 인증 연결 검증 중',
  },
];

const seed = {
  works: [
    { id:'work-1', title:'TAKY Mobile MVP', project:'TAKY Mobile', state:'IMPLEMENTATION', next:'프로젝트 허브 → 실제 운영 연결' },
    { id:'work-2', title:'MASTER 승계 감사', project:'TAKY', state:'PASS_WITH_SOURCE_GAPS', next:'비차단 HOLD 유지' },
  ],
  ideas: [
    { id:'idea-1', title:'Shared Engine first', status:'CANDIDATE', note:'공통 엔진 우선 설계' },
    { id:'idea-2', title:'Artifact Output Contract', status:'HOLD', note:'정확한 계약은 구현 단계 재평가' },
  ],
  traces: [
    { source:'이전 대화/MASTER', decision:'TAKY Mobile 별도 Project/Runtime', owner:'TAKY Mobile', implementation:'Runtime MVP', state:'IN_PROGRESS' },
  ],
};

let state = structuredClone(seed);
let canonicalResult = { source:'UNAVAILABLE', bundle:null };
let releaseResult = null;
let qaResult = null;
let storageMode = null;
let cacheKeys = null;
let adminAuthorized=false;
const ADMIN_TARGETS=new Set(["work","lab","trace","ops","admin"]);

const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc = value => String(value).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function persist() {
  const mode = await saveAppState(state);
  storageMode = mode;
  document.getElementById('statusBtn').title = `Storage: ${mode}`;
  renderOps();
  return mode;
}

function renderApps() {
  const grid = document.getElementById('appGrid');
  if (!grid) return;
  grid.innerHTML = APPS.map(app => {
    const linked = Boolean(app.url);
    const restricted = app.status === 'ACCESS_RESTRICTED';
    const viaReady = app.via === 'ready-set';
    const action = linked
      ? `<a class="app-open" href="${app.url}" target="_blank" rel="noopener" data-app-open="${app.id}">${restricted ? "인증 후 열기" : "열기"}</a>`
      : viaReady
        ? `<button class="app-open" type="button" data-app-learning="ready-set">Ready에서 시작</button>`
        : `<button class="app-open disabled" type="button" data-app-pending="${app.id}">연결 대기</button>`;
    // Orchestrated learning WORK is admin-only (WORK/composer are hidden for guests), so non-admins get a plain same-tab Ready link.
    const learningAction = app.id === 'ready-set'
      ? adminAuthorized
        ? `<button class="app-manage" type="button" data-app-learning="ready-set">학습 시작</button>`
        : `<a class="app-manage" href="${esc(READY_URL)}" rel="noopener" data-app-learning-link="ready-set">학습 시작</a>`
      : '';
    return `
      <article class="app-card ${linked || viaReady ? 'linked' : 'pending'}">
        <div class="app-card-top">
          <div class="app-mark">${esc(app.short)}</div>
          <span class="app-state">${restricted ? 'Netlify 인증 필요' : linked ? 'URL 등록' : viaReady ? 'Ready 경유' : '연결 대기'}</span>
        </div>
        <h3>${esc(app.name)}</h3>
        <p>${esc(app.note)}</p>
        <div class="app-actions">
          ${action}
          ${learningAction}
          ${adminAuthorized && linked ? `<button class="app-manage" type="button" data-app-work="${app.id}">작업</button>` : ''}
          ${adminAuthorized && app.netlifySite ? `<a class="app-manage" href="https://app.netlify.com/projects/${esc(app.netlifySite)}/deploys" target="_blank" rel="noopener noreferrer">배포 관리</a>` : ''}
        </div>
      </article>`;
  }).join('');

  const linkedCount = APPS.filter(app => app.url).length;
  const viaCount = APPS.filter(app => !app.url && app.via === 'ready-set').length;
  document.getElementById('appSummary').textContent = `${linkedCount}개 URL 등록 · ${viaCount}개 Ready 경유 · ${APPS.length - linkedCount - viaCount}개 배포 대기`;
}

function renderWork() {
  document.getElementById('workList').innerHTML = state.works.map(w => `
    <article class="card">
      <div class="eyebrow">${esc(w.project)}</div>
      <h3>${esc(w.title)}</h3>
      <div class="meta">Next · ${esc(w.next)}</div>
      <div class="status">${esc(w.state)}</div>
      ${w.action && !w.execution?.completed && w.execution?.status!=='AWAITING_RESULT' ? `<button class="small-btn" type="button" data-work-execute="${esc(w.id)}">실행 · ${esc(actionLabel(w.action))}</button>` : ''}
      ${w.execution?.status==='AWAITING_RESULT' ? '<div class="meta">Ready 학습 결과 기다리는 중</div>' : ''}
      ${w.execution?.receipt ? `<div class="meta">Receipt · ${esc(w.execution.receipt.result || w.execution.status)}</div>` : ''}
    </article>`).join('');
}

function renderWorkSummary() {
  const el = document.getElementById('workSummary');
  if (!el) return;
  const active = state.works.length;
  const attention = state.works.filter(w => /HOLD|CONFLICT|REVIEW|SOURCE_GAPS|REQUIRED/i.test(w.state || '')).length;
  el.textContent = attention ? `진행 ${active} · 확인 필요 ${attention}` : `진행 작업 ${active}개`;
}

function renderLab() {
  document.getElementById('labList').innerHTML = state.ideas.map(i => `
    <article class="card">
      <div class="eyebrow">${esc(i.status)}</div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${esc(i.note || '')}</div>
    </article>`).join('');
}

function renderTrace() {
  document.getElementById('traceList').innerHTML = state.traces.map(t => `
    <div class="trace-flow">
      <div class="trace-node"><strong>SOURCE</strong><span>${esc(t.source)}</span></div>
      <div class="arrow">↓</div>
      <div class="trace-node"><strong>DECISION</strong><span>${esc(t.decision)}</span></div>
      <div class="arrow">↓</div>
      <div class="trace-node"><strong>OWNER</strong><span>${esc(t.owner)}</span></div>
      <div class="arrow">↓</div>
      <div class="trace-node"><strong>IMPLEMENTATION</strong><span>${esc(t.implementation)} · ${esc(t.state)}</span></div>
    </div>`).join('');
}

async function readCacheKeys() {
  try { cacheKeys = 'caches' in window ? await caches.keys() : null; }
  catch { cacheKeys = null; }
}

function renderOps() {
  const model = deriveOperations({ apps:APPS, canonical:canonicalResult, release:releaseResult, qa:qaResult, works:state.works, traces:state.traces, storageMode, cacheKeys });
  const strip = document.getElementById('operationsList');
  const panel = document.getElementById('opsConsole');
  if (strip) strip.innerHTML = renderOperationsStrip(model);
  if (panel) {
    const open = new Set([...panel.querySelectorAll('details[open]')].map(d => d.dataset.lane));
    panel.innerHTML = renderOperationsConsole(model);
    open.forEach(id => panel.querySelector(`details[data-lane="${id}"]`)?.setAttribute('open', ''));
  }
  return model;
}

function renderAll() {
  renderOps();
  renderApps();
  renderWork();
  renderWorkSummary();
  renderLab();
  renderTrace();
}

function addMessage(text, who='assistant') {
  const chat = document.getElementById('chat');
  const row = document.createElement('div');
  row.className = `msg ${who}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = text;
  row.appendChild(bubble);
  chat.appendChild(row);
  row.scrollIntoView({ behavior:'smooth', block:'end' });
}

async function addTrace(intent, source='User input', implementation='Runtime MVP', traceState='VERIFIED_LOCAL') {
  state.traces.unshift({
    source,
    decision:`Intent ${intent}`,
    owner:'Command / Interaction OS',
    implementation,
    state:traceState,
  });
  state.traces = state.traces.slice(0, 100);
  await persist();
  renderTrace();
}

function activateScreen(target) {
  if(ADMIN_TARGETS.has(target)&&!adminAuthorized)return false;
  const exists=[...document.querySelectorAll('.screen')].some(screen => screen.dataset.screen === target);
  if(!exists) return false;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === target);
    if (btn.dataset.target === target) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === target));
  renderAll();
  return true;
}

function findApp(text='') {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return APPS.find(app => app.aliases.some(alias => normalized.includes(alias.toLowerCase())));
}

function isOpenRequest(text='') {
  return /열어|실행|접속|켜줘|바로가기|open|launch/i.test(text);
}

function appById(appId='') {
  return APPS.find(app => app.id === appId) || null;
}

async function upsertAppWork(app) {
  if (!app) return null;
  const id=`app-work-${app.id}`;
  const existing=state.works.find(w => w.id === id);
  const work={
    id,
    title:`${app.name} 실행`,
    project:app.name,
    state:'PLANNED',
    next:`${app.name} 열기`,
    action:{type:'OPEN_APP',appId:app.id},
    execution:null,
  };
  if(existing) Object.assign(existing,work);
  else state.works.unshift(work);
  await persist();
  renderWork();
  renderWorkSummary();
  return work;
}

async function createLearningLoopWork() {
  const id=`learning-loop-${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
  const work={
    id,
    title:'오늘 학습 실행',
    project:'Ready & Set',
    state:'PLANNED',
    next:'Ready → 학습앱 → 결과 → TAKY Mobile',
    action:{type:'START_LEARNING_LOOP',appId:'ready-set',returnNonce:uuid()},
    execution:null,
  };
  state.works.unshift(work);
  await persist();
  renderWork();
  renderWorkSummary();
  return work;
}

function mobileReturnTarget() {
  const url=new URL(`${location.origin}${location.pathname}`);
  if(READY_URL!==DEFAULT_READY_URL)url.searchParams.set('ready_target',READY_URL);
  for(const [key,target] of [
    ['hide_target',LOCAL_SPECIALIST_TARGETS.hide],
    ['snap_target',LOCAL_SPECIALIST_TARGETS.snap],
    ['play_camp_target',LOCAL_SPECIALIST_TARGETS.playCamp],
  ])if(target)url.searchParams.set(key,target);
  return url.href;
}

async function consumeLearningLoopReturn() {
  const p=new URLSearchParams(location.search);
  const workId=p.get('taky_mobile_work_id');
  if(!workId)return null;
  const index=state.works.findIndex(w=>w.id===workId);
  const payload={
    workId,
    returnNonce:p.get('taky_mobile_nonce'),
    fromApp:p.get('from_app'),
    sessionId:p.get('session_id'),
    taskState:p.get('task_state'),
    eventId:p.get('event_id'),
  };
  const result=index>=0
    ? applyLearningLoopReturn(state.works[index],payload)
    : {ok:false,reason:'WORK_NOT_FOUND'};
  if(result.ok)state.works[index]=result.work;
  state.traces.unshift({
    source:'LEARNING_LOOP_RETURN',
    decision:result.ok ? `Ready session ${payload.sessionId} result accepted` : `Return rejected: ${result.reason}`,
    owner:'TAKY Mobile',
    implementation:result.ok ? `WORK ${workId} → ${result.work.state}` : workId,
    state:result.ok ? 'VERIFIED' : 'REJECTED',
  });
  state.traces=state.traces.slice(0,100);
  ['taky_mobile_work_id','taky_mobile_nonce','session_id','task_state','from_app','event_id']
    .forEach(k=>p.delete(k));
  history.replaceState(null,'',`${location.pathname}${p.toString()?`?${p}`:''}${location.hash}`);
  await persist();
  return {...result,payload};
}

async function executeOneWork(work) {
  if(!work) return {ok:false,status:'NOT_EXECUTABLE',reason:'NO_EXECUTABLE_WORK'};
  const result=await executeWorkAction(work,{
    openApp:async appId=>{
      const app=appById(appId);
      if(!app?.url) return {ok:false,reason:'APP_LINK_NOT_VERIFIED'};
      const opened=window.open(app.url,'_blank','noopener');
      if(opened===null) return {ok:false,reason:'POPUP_BLOCKED'};
      return {ok:true,url:app.url};
    },
    prepareLearningLoop:async({appId,workId,returnNonce})=>{
      const app=appById(appId);
      if(app?.id!=='ready-set'||!app.url)return {ok:false,reason:'READY_LINK_NOT_VERIFIED'};
      const url=new URL(app.url);
      url.searchParams.set('taky_mobile_return_target',mobileReturnTarget());
      url.searchParams.set('taky_mobile_work_id',String(workId||''));
      url.searchParams.set('taky_mobile_nonce',String(returnNonce||''));
      url.searchParams.set('from_app','taky-mobile');
      if(LOCAL_SPECIALIST_TARGETS.hide)url.searchParams.set('hide_target',LOCAL_SPECIALIST_TARGETS.hide);
      if(LOCAL_SPECIALIST_TARGETS.snap)url.searchParams.set('snap_target',LOCAL_SPECIALIST_TARGETS.snap);
      if(LOCAL_SPECIALIST_TARGETS.playCamp)url.searchParams.set('play_camp_target',LOCAL_SPECIALIST_TARGETS.playCamp);
      return {ok:true,url:url.href};
    },
    openScreen:async target=>activateScreen(target),
    refreshCanonical:async()=>{
      const out=await refreshCanonical(true);
      const summary=canonicalSummary(out);
      return {ok:summary.verified===true,source:out?.source||'UNVERIFIED',reason:summary.verified?null:'CANONICAL_NOT_VERIFIED'};
    },
  });
  const index=state.works.findIndex(w => w.id === work.id);
  if(index>=0) state.works[index]=applyExecutionResult(state.works[index],result);
  await persist();
  renderWork();
  renderWorkSummary();
  await addTrace(
    'WORK_EXECUTION',
    work.title,
    result.receipt?.result || result.reason || result.status,
    result.ok ? result.status : 'FAILED'
  );
  if(result.ok && result.navigateTo)location.assign(result.navigateTo);
  return result;
}

async function executeNextWork() {
  const work=selectNextExecutableWork(state.works);
  if(!work) return {ok:false,status:'NOT_EXECUTABLE',reason:'NO_EXECUTABLE_WORK'};
  return {work,...await executeOneWork(work)};
}

function openPalette() { document.getElementById('palette').classList.remove('hidden'); }
function closePalette() { document.getElementById('palette').classList.add('hidden'); }
function openAuthSheet() {
  const sheet = document.getElementById('authSheet');
  const input = document.getElementById('authKeyInput');
  document.getElementById('authError').textContent = '';
  sheet.classList.remove('hidden');
  setTimeout(() => input.focus(), 80);
}
function closeAuthSheet() {
  document.getElementById('authSheet').classList.add('hidden');
  document.getElementById('authKeyInput').value = '';
}

async function refreshCanonical(force=false) {
  const status = document.getElementById('canonicalStatus');
  status.textContent = 'Canonical: checking…';
  canonicalResult = await loadCanonical({ force, allowAuthPrompt:false });
  const summary = canonicalSummary(canonicalResult);
  status.textContent = `${summary.label} · ${summary.detail}`;
  document.getElementById('statusBtn').textContent = summary.verified ? 'CANONICAL OK' : 'RUNTIME MVP';
  document.getElementById('authBtn')?.classList.toggle('hidden', !canonicalResult.authRequired);
  renderOps();
  if (force) {
    await addTrace('CANONICAL_REFRESH', 'GitHub TAKY via secure gateway', summary.detail, summary.verified ? 'REMOTE_VERIFIED' : canonicalResult.source);
    addMessage(summary.verified
      ? `최신 TAKY canonical을 확인했습니다. <b>${esc(summary.detail)}</b>`
      : canonicalResult.authRequired
        ? '이 기기는 인증이 필요합니다. <b>기기 인증</b>을 눌러 최초 1회 인증하세요.'
        : `Canonical 새로고침 결과: <b>${esc(canonicalResult.source)}</b>. 캐시 또는 로컬 상태를 사용합니다.`);
  }
  return canonicalResult;
}

// Read-only release status (GitHub revision + Netlify published deploy) via the owner-session gateway.
// Bounded: one request at boot and on explicit recheck/auth; never polled.
let releaseInFlight = null;
function refreshRelease() {
  releaseInFlight ??= loadReleaseStatus()
    .then(result => { releaseResult = result; renderOps(); return result; })
    .finally(() => { releaseInFlight = null; });
  return releaseInFlight;
}

// Local-only QA summary: fetched solely on localhost/127.0.0.1 (same origin fixture host), once at boot and on explicit recheck.
let qaInFlight = null;
function refreshQa() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return Promise.resolve(null);
  qaInFlight ??= fetch('/__taky_qa_summary', { method:'GET', cache:'no-store' })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .then(result => { qaResult = result; renderOps(); return result; })
    .finally(() => { qaInFlight = null; });
  return qaInFlight;
}

async function executeIntent(intent, rawText='') {
  closePalette();

  switch (intent) {
    case 'COMMAND_DISCOVERY':
      openPalette();
      return;
    case 'CONTINUE': {
      const outcome=await executeNextWork();
      if(!outcome.ok){
        await addTrace('CONTINUE', 'ㄱ shortcut', outcome.reason || 'No executable work', 'NO_EXECUTABLE_WORK');
        addMessage('실행 가능한 다음 작업이 없습니다. <b>기록만 하고 진행한 척하지 않습니다.</b>');
        return;
      }
      addMessage(`<b>${esc(outcome.work.title)}</b>의 다음 액션을 실제 실행했습니다. 상태: <b>${esc(outcome.status)}</b>`);
      return;
    }
    case 'REVIEW':
      await addTrace('REVIEW', 'User request', 'Read-only governed review');
      addMessage('REVIEW로 라우팅했습니다. <b>읽기/비교만 수행</b>하며 canonical 수정 권한은 열지 않습니다.');
      return;
    case 'APPLY':
      await addTrace('APPLY', 'User request', 'Approval gate', 'APPROVAL_REQUIRED');
      addMessage('APPLY로 라우팅했습니다. 브라우저가 직접 MASTER를 쓰지 않으며, <b>승인 + 서버측 write adapter</b>가 연결되기 전까지 APPROVAL_REQUIRED입니다.');
      return;
    case 'SOURCE_COMPARE': {
      const files = canonicalResult?.bundle?.files?.map(f => f.path).join(', ');
      await addTrace('SOURCE_COMPARE', 'Current source set', files || 'Canonical unavailable', files ? 'SOURCE_READY' : 'UNVERIFIED');
      addMessage(files ? `현재 canonical source set: <b>${esc(files)}</b>` : '현재 canonical source를 검증된 원격 상태로 불러오지 못했습니다.');
      return;
    }
    case 'HANDOFF':
      await addTrace('HANDOFF', 'Current runtime state', 'Markdown + embedded machine state');
      downloadHandoff(state, canonicalResult);
      addMessage('현재 WORK/LAB/TRACE와 canonical 포인터를 포함한 <b>Handoff .md</b>를 생성했습니다.');
      return;
    case 'RESUME':
      document.getElementById('resumeFileInput').click();
      return;
    case 'CLOSE':
      await addTrace('CLOSE', 'Current runtime state', 'Persist + Handoff');
      await persist();
      downloadHandoff(state, canonicalResult);
      addMessage('현재 상태를 저장하고 Handoff를 생성했습니다. 실제 원격 persistence는 연결된 adapter 증거가 있을 때만 완료로 판단합니다.');
      return;
    case 'ARCHIVE':
      await addTrace('ARCHIVE', 'Current browser conversation', 'Archive contract pending', 'PARTIAL');
      addMessage('현재 MVP는 앱 내부 세션만 보존할 수 있습니다. ChatGPT 전체 원문 archive와 동일하다고 주장하지 않습니다.');
      return;
    case 'RECOVER':
      await addTrace('RECOVER', 'Explicit recovery request', 'Forensic workflow boundary', 'RECOVERY_REQUIRED');
      addMessage('Full forensic recovery는 명시 호출 전용입니다. 현재 MVP에는 원대화 전체 검색 adapter가 아직 연결되지 않아 <b>RECOVERY_REQUIRED</b>로 유지합니다.');
      return;
    case 'CHAT':
    default: {
      const app = findApp(rawText);
      if (app && isOpenRequest(rawText)) {
        await addTrace('APP_OPEN', app.name, app.url || 'Link pending', app.url ? 'LINK_VERIFIED' : 'LINK_REQUIRED');
        if (app.url) {
          addMessage(`<b>${esc(app.name)}</b>을 엽니다.`);
          window.location.assign(app.url);
        } else {
          addMessage(`<b>${esc(app.name)}</b>은 아직 배포 링크가 검증되지 않아 열지 않았습니다. 연결 확인 후 활성화합니다.`);
        }
        return;
      }
      await addTrace('CHAT', rawText ? 'Natural language' : 'Fallback', 'AI provider not connected', 'ROUTED_LOCAL');
      addMessage('자연어 Intent Router가 입력을 받았습니다. 현재는 앱 열기와 로컬 명령 라우팅까지 동작하며, AI Provider/Gateway 연결은 다음 단계입니다.');
    }
  }
}

function setAdminAccess(granted){
  adminAuthorized=granted===true;
  document.querySelectorAll('[data-admin-only]').forEach(e=>e.hidden=!adminAuthorized);
  document.getElementById('adminLoginBtn').textContent=adminAuthorized?'관리자 열기':'관리자 로그인';
  if(!adminAuthorized&&document.querySelector('.screen.active[data-admin-only]'))activateScreen('taky');
  renderApps();
}
async function refreshAdminProgress(){
  if(!adminAuthorized)return;
  const status=document.getElementById('adminProgressStatus');
  status.textContent='관리자 관제 확인 중…';
  const value=await readAdminProgress();
  if(value.error==='ADMIN_AUTH_REQUIRED'){setAdminAccess(false);status.textContent='관리자 세션 만료';return}
  status.textContent=value.ok?'워크벤치 기준 · 조회 전용':'조회 제한: '+(value.error||'연결 불가');
  renderAdminProgress(document.getElementById('adminProgress'),value);
}
function bindAdminProgress(){
  const sheet=document.getElementById('adminLoginSheet'),key=document.getElementById('adminLoginKey'),error=document.getElementById('adminLoginError');
  const close=()=>{sheet.classList.add('hidden');key.value='';error.textContent=''};
  document.getElementById('adminLoginBtn').addEventListener('click',()=>{
    if(adminAuthorized){activateScreen('admin');refreshAdminProgress();return}
    sheet.classList.remove('hidden');key.focus();
  });
  document.getElementById('adminLoginBackdrop').addEventListener('click',close);
  document.getElementById('adminLoginCancelBtn').addEventListener('click',close);
  document.getElementById('adminLoginSubmitBtn').addEventListener('click',async()=>{
    if(!key.value.trim()){error.textContent='관리자 인증키를 입력하세요.';return}
    error.textContent='확인 중…';
    const response=await adminLogin(key.value.trim());
    if(!response.authorized){error.textContent='관리자 인증 실패 · '+(response.error||'');return}
    close();setAdminAccess(true);activateScreen('admin');await refreshAdminProgress();
  });
  key.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('adminLoginSubmitBtn').click()});
  document.getElementById('adminProgressRefreshBtn').insertAdjacentElement('afterend',document.getElementById('adminLogoutBtn'));
  document.getElementById('adminProgressRefreshBtn').addEventListener('click',refreshAdminProgress);
  document.getElementById('adminLogoutBtn').addEventListener('click',async()=>{await adminLogout();setAdminAccess(false)});
}
async function checkAdminSession(){const value=await adminSession();setAdminAccess(value.authorized);if(adminAuthorized)await refreshAdminProgress()}

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => activateScreen(btn.dataset.target)));
  document.getElementById('openWorkBtn')?.addEventListener('click', () => activateScreen('work'));
}

function bindAppHub() {
  document.getElementById('appGrid')?.addEventListener('click', event => {
    const learningBtn=event.target.closest('[data-app-learning]');
    if(learningBtn){
      if(!adminAuthorized)return;
      createLearningLoopWork().then(work=>{
        activateScreen('work');
        addMessage(`<b>${esc(work.title)}</b> 작업을 만들었습니다. <b>ㄱ</b>을 누르면 Ready로 이동하고, 실제 학습 결과가 돌아와야 완료됩니다.`);
      });
      return;
    }
    const workBtn = event.target.closest('[data-app-work]');
    if (workBtn) {
      const app = APPS.find(item => item.id === workBtn.dataset.appWork);
      upsertAppWork(app).then(work => {
        activateScreen('work');
        addMessage(work
          ? `<b>${esc(app?.name || '앱')}</b> 실행 작업을 만들었습니다. 이제 <b>ㄱ</b> 또는 WORK의 실행 버튼이 실제로 앱을 엽니다.`
          : '실행 작업을 만들지 못했습니다.');
      });
      return;
    }
    const pendingBtn = event.target.closest('[data-app-pending]');
    if (pendingBtn) {
      const app = APPS.find(item => item.id === pendingBtn.dataset.appPending);
      addMessage(`<b>${esc(app?.name || '앱')}</b>은 현재 연결 대기 상태입니다. 확인되지 않은 주소를 임의로 열지 않습니다.`);
    }
  });
}

function bindOperations() {
  const run = async action => {
    if (action === 'auth') return openAuthSheet();
    if (action === 'refresh') { await readCacheKeys(); return Promise.all([refreshCanonical(true), refreshRelease(), refreshQa()]); }
    if (action === 'trace' || action === 'work') return activateScreen(action);
    if (action === 'handoff') return executeIntent('HANDOFF');
    if (action === 'resume') return executeIntent('RESUME');
  };
  const onClick = event => {
    if (event.target.closest('[data-ops-open]')) { activateScreen('ops'); return; }
    const btn = event.target.closest('[data-ops-action]');
    if (btn) run(btn.dataset.opsAction);
  };
  document.getElementById('operationsList')?.addEventListener('click', onClick);
  document.getElementById('opsConsole')?.addEventListener('click', onClick);
  document.getElementById('opsRecheckBtn')?.addEventListener('click', () => run('refresh'));
}

function bindAuth() {
  const authBtn = document.getElementById('authBtn');
  const input = document.getElementById('authKeyInput');
  const error = document.getElementById('authError');
  authBtn?.addEventListener('click', openAuthSheet);
  document.getElementById('authBackdrop')?.addEventListener('click', closeAuthSheet);
  document.getElementById('authCancelBtn')?.addEventListener('click', closeAuthSheet);
  document.getElementById('authSubmitBtn')?.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) { error.textContent = '인증키를 입력하세요.'; return; }
    error.textContent = '인증 중…';
    const result = await authenticateWithKey(key);
    if (!result.ok) { error.textContent = '인증키를 확인해주세요.'; return; }
    closeAuthSheet();
    await Promise.all([refreshCanonical(true), refreshRelease()]);
  });
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('authSubmitBtn').click();
  });
}

function bindCommands() {
  document.getElementById('slashBtn').addEventListener('click', openPalette);
  document.getElementById('paletteBackdrop').addEventListener('click', closePalette);
  document.querySelectorAll('[data-command]').forEach(btn => btn.addEventListener('click', () => executeIntent(commandToIntent(btn.dataset.command))));
  document.getElementById('canonicalRefreshBtn').addEventListener('click', () => refreshCanonical(true));
  document.getElementById('statusBtn').addEventListener('click', () => refreshCanonical(true));
}

function bindComposer() {
  const input = document.getElementById('input');
  document.getElementById('sendBtn').addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(esc(text), 'user');
    input.value = '';
    const routed = routeIntent(text);
    await executeIntent(routed.intent, text);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('sendBtn').click();
    }
  });
}

function bindEditors() {
  document.getElementById('workList').addEventListener('click', async event => {
    const button=event.target.closest('[data-work-execute]');
    if(!button) return;
    const work=state.works.find(w => w.id === button.dataset.workExecute);
    const outcome=await executeOneWork(work);
    addMessage(outcome.ok
      ? `<b>${esc(work.title)}</b> 실행 완료: ${esc(outcome.status)}`
      : `<b>${esc(work?.title || '작업')}</b> 실행 실패: ${esc(outcome.reason || outcome.status)}`);
  });
  document.getElementById('addWorkBtn').addEventListener('click', async () => {
    const title = prompt('작업 제목');
    if (!title) return;
    state.works.unshift({ id:uuid(), title, project:'UNCLASSIFIED', state:'DRAFT', next:'분류/검토' });
    await persist(); renderWork(); renderWorkSummary();
  });
  document.getElementById('addIdeaBtn').addEventListener('click', async () => {
    const title = prompt('아이디어');
    if (!title) return;
    state.ideas.unshift({ id:uuid(), title, status:'NEW', note:'LAB에서 생성' });
    await persist(); renderLab();
  });
}

function bindResume() {
  const fileInput = document.getElementById('resumeFileInput');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const packet = await parseResumeFile(file);
      state = packet.state;
      await addTrace('RESUME', file.name, `Handoff ${packet.exportedAt}`, 'RESUMED_LOCAL');
      await persist();
      renderAll();
      addMessage(`Handoff에서 상태를 복원했습니다. <b>${esc(file.name)}</b>`);
    } catch (error) {
      addMessage(`재개 실패: <b>${esc(String(error))}</b>`);
    }
  });
}

async function init() {
  state = await loadAppState(seed);
  const learningReturn=await consumeLearningLoopReturn();
  await persist(); // write probe: storage state shown in OPS is an observed write, not an assumption
  await readCacheKeys();
  renderAll();
  bindNavigation();
  bindOperations();
  bindAppHub();
  bindAuth();
  bindCommands();
  bindComposer();
  bindEditors();
  bindResume();
  bindAdminProgress();
  await checkAdminSession();
  createFamilySignin().mount();
  const refreshFamily=()=>{const hub=document.getElementById('familyHub');void mountFamilyHub(hub).catch(error=>console.warn('Family hub unavailable',String(error))).then(()=>mountCharacterRequests(hub)).catch(error=>console.warn('Character requests unavailable',String(error)));};
  refreshFamily();
  window.addEventListener('taky-central-auth-ready',refreshFamily);
  window.addEventListener('taky-central-auth-cleared',refreshFamily);
  if(learningReturn?.ok){
    addMessage(`Ready 학습 결과를 받았습니다. <b>${esc(learningReturn.work.state)}</b> · WORK 완료`);
  }else if(learningReturn && !learningReturn.ok){
    addMessage(`학습 결과 영수증을 적용하지 않았습니다. <b>${esc(learningReturn.reason || 'INVALID_RETURN')}</b>`);
  }
  refreshRelease();
  refreshQa();
  await refreshCanonical(false);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('SW register failed', error));
  }
}

init().catch(error => {
  console.error(error);
  addMessage(`Runtime 초기화 오류: <b>${esc(String(error))}</b>`);
});