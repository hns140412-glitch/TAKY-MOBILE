import { loadAppState, saveAppState } from './db.js';
import { routeIntent, commandToIntent } from './intent.js';
import { loadCanonical, canonicalSummary } from './canonical.js';
import { authenticateWithKey } from './auth.js';
import { downloadHandoff, parseResumeFile } from './handoff.js';

const APPS = [
  {
    id:'ready-set',
    name:'Ready & Set',
    short:'R&S',
    aliases:['레디앤셋','레디 앤 셋','레디셋','ready & set','ready set'],
    url:'https://profound-ganache-902032.netlify.app',
    status:'LINKED',
    note:'시간표 · 숙제 · Planner',
  },
  {
    id:'snap-pop',
    name:'Snap & Pop',
    short:'S&P',
    aliases:['스냅팝','스냅 앤 팝','snap & pop','snap pop'],
    url:'https://cheerful-pothos-d1c3ee.netlify.app',
    status:'LINKED',
    note:'글쓰기 · 표현 · Family',
  },
  {
    id:'hide-seek',
    name:'Hide & Seek',
    short:'H&S',
    aliases:['하이드앤씩','하이드앤시크','하이드 앤 시크','hide & seek','hide seek'],
    url:null,
    status:'PENDING_LINK',
    note:'촬영 · OCR · 분석',
  },
  {
    id:'zpd-word',
    name:'ZPD Word',
    short:'ZPD',
    aliases:['zpd word','zpd 워드','zpd'],
    url:'https://dainty-froyo-a6e427.netlify.app',
    status:'LINKED',
    note:'영어 단어장',
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

const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc = value => String(value).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function persist() {
  const mode = await saveAppState(state);
  document.getElementById('statusBtn').title = `Storage: ${mode}`;
  return mode;
}

function renderApps() {
  const grid = document.getElementById('appGrid');
  if (!grid) return;
  grid.innerHTML = APPS.map(app => {
    const linked = Boolean(app.url);
    const action = linked
      ? `<a class="app-open" href="${app.url}" target="_blank" rel="noopener" data-app-open="${app.id}">열기</a>`
      : `<button class="app-open disabled" type="button" data-app-pending="${app.id}">연결 대기</button>`;
    return `
      <article class="app-card ${linked ? 'linked' : 'pending'}">
        <div class="app-card-top">
          <div class="app-mark">${esc(app.short)}</div>
          <span class="app-state">${linked ? '연결됨' : '연결 대기'}</span>
        </div>
        <h3>${esc(app.name)}</h3>
        <p>${esc(app.note)}</p>
        <div class="app-actions">
          ${action}
          <button class="app-manage" type="button" data-app-work="${app.id}">작업</button>
        </div>
      </article>`;
  }).join('');

  const linkedCount = APPS.filter(app => app.url).length;
  document.getElementById('appSummary').textContent = `${linkedCount}개 연결 · ${APPS.length - linkedCount}개 대기`;
}

function renderWork() {
  document.getElementById('workList').innerHTML = state.works.map(w => `
    <article class="card">
      <div class="eyebrow">${esc(w.project)}</div>
      <h3>${esc(w.title)}</h3>
      <div class="meta">Next · ${esc(w.next)}</div>
      <div class="status">${esc(w.state)}</div>
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

function renderAll() {
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
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === target));
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.dataset.screen === target));
  renderAll();
}

function findApp(text='') {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return APPS.find(app => app.aliases.some(alias => normalized.includes(alias.toLowerCase())));
}

function isOpenRequest(text='') {
  return /열어|실행|접속|켜줘|바로가기|open|launch/i.test(text);
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
  if (force) {
    await addTrace('CANONICAL_REFRESH', 'GitHub TAKY via secure gateway', summary.detail, summary.verified ? 'REMOTE_VERIFIED' : canonicalResult.source);
    addMessage(summary.verified
      ? `최신 TAKY canonical을 확인했습니다. <b>${esc(summary.detail)}</b>`
      : canonicalResult.authRequired
        ? '이 기기는 인증이 필요합니다. <b>기기 인증</b>을 눌러 최초 1회 인증하세요.'
        : `Canonical 새로고침 결과: <b>${esc(canonicalResult.source)}</b>. 캐시 또는 로컬 상태를 사용합니다.`);
  }
}

async function executeIntent(intent, rawText='') {
  closePalette();

  switch (intent) {
    case 'COMMAND_DISCOVERY':
      openPalette();
      return;
    case 'CONTINUE':
      await addTrace('CONTINUE', 'ㄱ shortcut', 'Next-action continuation');
      addMessage('`ㄱ`을 계속 진행 신호로 인식했습니다. 현재 작업의 다음 액션을 유지합니다.');
      return;
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

function bindNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => activateScreen(btn.dataset.target)));
  document.getElementById('openWorkBtn')?.addEventListener('click', () => activateScreen('work'));
}

function bindAppHub() {
  document.getElementById('appGrid')?.addEventListener('click', event => {
    const workBtn = event.target.closest('[data-app-work]');
    if (workBtn) {
      const app = APPS.find(item => item.id === workBtn.dataset.appWork);
      activateScreen('work');
      addMessage(`<b>${esc(app?.name || '앱')}</b> 관련 작업을 WORK에서 확인하세요.`);
      return;
    }
    const pendingBtn = event.target.closest('[data-app-pending]');
    if (pendingBtn) {
      const app = APPS.find(item => item.id === pendingBtn.dataset.appPending);
      addMessage(`<b>${esc(app?.name || '앱')}</b>은 현재 연결 대기 상태입니다. 확인되지 않은 주소를 임의로 열지 않습니다.`);
    }
  });
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
    await refreshCanonical(true);
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
  renderAll();
  bindNavigation();
  bindAppHub();
  bindAuth();
  bindCommands();
  bindComposer();
  bindEditors();
  bindResume();
  await refreshCanonical(false);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('SW register failed', error));
  }
}

init().catch(error => {
  console.error(error);
  addMessage(`Runtime 초기화 오류: <b>${esc(String(error))}</b>`);
});
