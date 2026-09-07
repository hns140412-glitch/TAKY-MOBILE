const KEY = 'taky-mobile-mvp-v1';

const seed = {
  works: [
    {id:'work-1', title:'TAKY Mobile MVP', project:'TAKY Mobile', state:'IMPLEMENTATION', next:'Command/Intent 기본동작 검증'},
    {id:'work-2', title:'MASTER 승계 감사', project:'TAKY', state:'PASS_WITH_SOURCE_GAPS', next:'비차단 HOLD 유지'}
  ],
  ideas: [
    {id:'idea-1', title:'Shared Engine first', status:'CANDIDATE', note:'공통 엔진 우선 설계'},
    {id:'idea-2', title:'Artifact Output Contract', status:'HOLD', note:'정확한 계약은 구현 단계 재평가'}
  ],
  traces: [
    {source:'이전 대화/MASTER', decision:'TAKY Mobile 별도 Project/Runtime', owner:'TAKY Mobile', implementation:'MVP package', state:'IN_PROGRESS'}
  ]
};

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(seed); }
  catch { return structuredClone(seed); }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
let state = load();

function esc(v){ return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

function renderWork(){
  const el=document.getElementById('workList');
  el.innerHTML=state.works.map(w=>`
    <article class="card">
      <div class="eyebrow">${esc(w.project)}</div>
      <h3>${esc(w.title)}</h3>
      <div class="meta">Next · ${esc(w.next)}</div>
      <div class="status">${esc(w.state)}</div>
    </article>`).join('');
}
function renderLab(){
  const el=document.getElementById('labList');
  el.innerHTML=state.ideas.map(i=>`
    <article class="card">
      <div class="eyebrow">${esc(i.status)}</div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${esc(i.note)}</div>
    </article>`).join('');
}
function renderTrace(){
  const el=document.getElementById('traceList');
  el.innerHTML=state.traces.map(t=>`
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

function addMessage(text, who='assistant'){
  const chat=document.getElementById('chat');
  const row=document.createElement('div'); row.className=`msg ${who}`;
  const bubble=document.createElement('div'); bubble.className='bubble'; bubble.innerHTML=text;
  row.appendChild(bubble); chat.appendChild(row);
  row.scrollIntoView({behavior:'smooth',block:'end'});
}

const commandReplies = {
  review: 'REVIEW intent를 실행했습니다. 현재 MVP에서는 <b>READ ONLY</b> 검토 흐름만 시뮬레이션합니다.',
  apply: 'APPLY intent가 선택됐습니다. 실제 canonical write는 아직 연결하지 않았으므로 <b>승인 대기 상태</b>로 유지합니다.',
  handoff: 'HANDOFF intent를 실행했습니다. 현재 MVP 상태를 LocalStorage에서 복구 가능한 상태로 유지하고 있습니다.',
  source_compare: 'SOURCE_COMPARE intent를 실행했습니다. 다음 단계에서 실제 GitHub/Drive source adapter와 연결합니다.',
  close: 'CLOSE intent를 실행했습니다. 현재 상태 저장 → 다음 작업 유지 → 재개 가능 상태로 마감합니다.'
};

function runCommand(cmd){
  closePalette();
  addMessage(commandReplies[cmd] || '알 수 없는 명령입니다.');
  state.traces.unshift({
    source:'User command',
    decision:`Intent ${cmd.toUpperCase()}`,
    owner:'Command / Interaction OS',
    implementation:'Local MVP simulation',
    state:'VERIFIED_LOCAL'
  });
  save(); renderTrace();
}

function openPalette(){ document.getElementById('palette').classList.remove('hidden'); }
function closePalette(){ document.getElementById('palette').classList.add('hidden'); }

document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelector(`[data-screen="${btn.dataset.target}"]`).classList.add('active');
  if(btn.dataset.target==='work') renderWork();
  if(btn.dataset.target==='lab') renderLab();
  if(btn.dataset.target==='trace') renderTrace();
}));

document.getElementById('slashBtn').addEventListener('click',openPalette);
document.getElementById('paletteBackdrop').addEventListener('click',closePalette);
document.querySelectorAll('[data-command]').forEach(btn=>btn.addEventListener('click',()=>runCommand(btn.dataset.command)));

document.getElementById('sendBtn').addEventListener('click',()=>{
  const input=document.getElementById('input');
  const text=input.value.trim(); if(!text) return;
  addMessage(esc(text),'user'); input.value='';
  if(text === '/'){ openPalette(); return; }
  if(text === 'ㄱ'){ addMessage('계속 진행 신호로 인식했습니다. 현재 MVP에서는 다음 구현 큐로 이동합니다.'); return; }
  const t=text.toLowerCase();
  if(t.includes('검토')) return runCommand('review');
  if(t.includes('반영')) return runCommand('apply');
  if(t.includes('인수인계')) return runCommand('handoff');
  if(t.includes('원본')) return runCommand('source_compare');
  if(t.includes('대화 종료')) return runCommand('close');
  addMessage('자연어 입력을 받았습니다. 다음 단계에서 Intent Router를 실제 규칙/AI 라우터와 연결합니다.');
});

document.getElementById('input').addEventListener('keydown',(e)=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); document.getElementById('sendBtn').click(); }
});

document.getElementById('addWorkBtn').addEventListener('click',()=>{
  const title=prompt('작업 제목'); if(!title) return;
  state.works.unshift({id:crypto.randomUUID(),title,project:'UNCLASSIFIED',state:'DRAFT',next:'분류/검토'});
  save(); renderWork();
});
document.getElementById('addIdeaBtn').addEventListener('click',()=>{
  const title=prompt('아이디어'); if(!title) return;
  state.ideas.unshift({id:crypto.randomUUID(),title,status:'NEW',note:'LAB에서 생성'});
  save(); renderLab();
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
renderWork(); renderLab(); renderTrace();
