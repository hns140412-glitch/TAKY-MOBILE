// TAKY central sign-in page: /family-connect.html?return=<app page>[&silent=1]
// The one place a family signs in for every TAKY app that shares this browser's storage. When signed in here,
// it sends the app back with a 2-minute pass (#taky_handoff=…); silent and not signed in -> #taky_handoff=none.
// It only ever returns to an approved TAKY app: the handoff endpoint checks the return origin first.
import { createFamilySignin } from './family-signin.mjs';

const q = new URLSearchParams(location.search);
const silent = q.get('silent') === '1';
const status = () => document.getElementById('familyLoginStatus');
const say = t => { const s = status(); if (s) s.textContent = t; };
let target = null;
try { const u = new URL(q.get('return') || ''); if (u.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname)) { u.hash = ''; target = u; } } catch {}

function back(pass) {
  const u = new URL(target.href); u.hash = 'taky_handoff=' + pass;
  location.replace(u.href);
}
// 403 = not an approved TAKY app (never redirect); 401 = approved, sign-in needed.
async function approved() {
  try {
    const r = await fetch('/api/family/handoff', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: target.href }) });
    return r.status === 401;
  } catch { return false; }
}

async function run() {
  if (!target || !(await approved())) { say('등록된 TAKY 앱에서 연 로그인이 아니에요.'); return; }
  const link = document.getElementById('connectBack');
  if (link) { link.href = target.href; link.hidden = false; }
  const signin = createFamilySignin();
  let done = false;
  const finish = async () => {
    if (done) return; done = true;
    say('앱으로 돌아가는 중…');
    const url = await signin.handoffUrl(target.href);
    location.replace(url === target.href ? (() => { const u = new URL(target.href); u.hash = 'taky_handoff=none'; return u.href; })() : url);
  };
  globalThis.addEventListener('taky-central-auth-ready', () => void finish());
  const hadDevice = (() => { try { return !!localStorage.getItem('taky.familyDevice.v1'); } catch { return false; } })();
  if (silent && !hadDevice) { back('none'); return; }
  signin.mount();
  if (silent) setTimeout(() => { if (!done) { done = true; back('none'); } }, 8000);
  else if (!hadDevice) say('Google 가족 계정으로 로그인해 주세요.');
}
void run();
