import { ACTION_REGISTRY_VERSION, discoverActions, getAction, resolveAction } from './action-registry.js';

const TRACE_KEY = 'taky-mobile-action-registry-trace-v1';
const esc = value => String(value).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function addMessage(text, who='assistant') {
  const chat = document.getElementById('chat');
  if (!chat) return;
  const row = document.createElement('div');
  row.className = `msg ${who}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = text;
  row.appendChild(bubble);
  chat.appendChild(row);
  row.scrollIntoView({ behavior:'smooth', block:'end' });
}

function loadTrace() {
  try { return JSON.parse(localStorage.getItem(TRACE_KEY) || '[]'); }
  catch { return []; }
}

function saveTrace(entry) {
  const trace = loadTrace();
  trace.unshift(entry);
  localStorage.setItem(TRACE_KEY, JSON.stringify(trace.slice(0, 100)));
}

function traceEntry(action, rawText) {
  return {
    at:new Date().toISOString(),
    source:rawText || 'Action palette',
    decision:action.actionId,
    owner:'Action / Skill Registry',
    implementation:`${action.toolRoute} · ${action.truthClass} · ${action.usageClass}`,
    state:action.adapterStatus,
    registryVersion:ACTION_REGISTRY_VERSION
  };
}

function actionStateCopy(action) {
  if (action.adapterStatus === 'EVIDENCE_REQUIRED') return '실제 실행 전 권위 있는 원본/측정자료가 필요합니다.';
  if (action.adapterStatus === 'APPROVAL_REQUIRED') return '승인과 배포 어댑터 확인 전에는 실행하지 않습니다.';
  return '현재 모바일에서는 Action 선택·Truth/Cost 분류·실행계약 라우팅까지 동작하며, 실제 작업 어댑터는 아직 연결 전입니다.';
}

function renderActionResult(action, rawText='') {
  saveTrace(traceEntry(action, rawText));
  const warning = action.warning ? `<br><b>주의</b> · ${esc(action.warning)}` : '';
  addMessage(
    `<b>${esc(action.displayName)}</b> → <code>${esc(action.actionId)}</code>` +
    `<br>Truth · <b>${esc(action.truthClass)}</b> · Cost · <b>${esc(action.usageClass)}</b>` +
    `<br>Route · ${esc(action.toolRoute)} · State · <b>${esc(action.adapterStatus)}</b>` +
    warning +
    `<br><span>${esc(actionStateCopy(action))}</span>`
  );
}

function executeFromText(text) {
  const matched = resolveAction(text);
  if (!matched) return false;
  addMessage(esc(text), 'user');
  renderActionResult(matched.action, text);
  return true;
}

function paletteBlock() {
  const panel = document.querySelector('#palette .sheet-panel');
  if (!panel) return null;
  let block = document.getElementById('actionRegistryBlock');
  if (!block) {
    block = document.createElement('div');
    block.id = 'actionRegistryBlock';
    const firstCommand = panel.querySelector('[data-command]');
    if (firstCommand) panel.insertBefore(block, firstCommand);
    else panel.appendChild(block);
  }
  return block;
}

function renderPaletteActions() {
  const block = paletteBlock();
  if (!block) return;
  const text = document.getElementById('input')?.value || '';
  const actions = discoverActions(text, 5);
  block.innerHTML = `
    <div class="eyebrow" style="margin:8px 4px 6px">ACTION REGISTRY · ${esc(ACTION_REGISTRY_VERSION)}</div>
    ${actions.map(action => `
      <button class="sheet-item" type="button" data-taky-action="${esc(action.actionId)}">
        <b>${esc(action.displayName)}</b>
        <span>${esc(action.domain)} · ${esc(action.truthClass)} · ${esc(action.usageClass)}</span>
      </button>`).join('')}
    <div class="eyebrow" style="margin:14px 4px 6px">CORE COMMANDS</div>`;
}

function renderStoredActionTrace() {
  const target = document.getElementById('traceList');
  if (!target) return;
  target.querySelectorAll('[data-action-trace]').forEach(node => node.remove());
  const trace = loadTrace().slice(0, 20);
  if (!trace.length) return;
  const fragment = document.createDocumentFragment();
  trace.forEach(item => {
    const row = document.createElement('div');
    row.dataset.actionTrace = '1';
    row.className = 'trace-flow';
    row.innerHTML = `
      <div class="trace-node"><strong>ACTION</strong><span>${esc(item.decision)}</span></div>
      <div class="arrow">↓</div>
      <div class="trace-node"><strong>TRUTH / COST</strong><span>${esc(item.implementation)}</span></div>
      <div class="arrow">↓</div>
      <div class="trace-node"><strong>STATE</strong><span>${esc(item.state)}</span></div>`;
    fragment.appendChild(row);
  });
  target.prepend(fragment);
}

function handleSendClick(event) {
  const send = event.target.closest?.('#sendBtn');
  if (!send) return;
  const input = document.getElementById('input');
  const text = input?.value.trim() || '';
  if (!resolveAction(text)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (executeFromText(text) && input) input.value = '';
}

function handleEnter(event) {
  if (event.target?.id !== 'input' || event.key !== 'Enter' || event.shiftKey) return;
  const text = event.target.value.trim();
  if (!resolveAction(text)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (executeFromText(text)) event.target.value = '';
}

function handleActionClick(event) {
  const button = event.target.closest?.('[data-taky-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const action = getAction(button.dataset.takyAction);
  if (!action) return;
  document.getElementById('palette')?.classList.add('hidden');
  renderActionResult(action, `/${action.actionId}`);
}

function init() {
  renderPaletteActions();
  document.addEventListener('click', handleSendClick, true);
  document.addEventListener('keydown', handleEnter, true);
  document.addEventListener('click', handleActionClick);
  document.getElementById('slashBtn')?.addEventListener('click', () => setTimeout(renderPaletteActions, 0));
  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.target === 'trace') setTimeout(renderStoredActionTrace, 0);
  }));
  renderStoredActionTrace();
}

init();
