// "Ready에서 로그인하면 나머지는 일괄 차용" (Taky 2026-11-14): Ready, signed in, opens Hide with a 2-minute pass
// in the URL fragment; Hide (another origin, its own storage) signs in silently and keeps its own device token.
// Real device/handoff code, fake Google, no network.
import assert from 'node:assert/strict';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier, createFamilyDeviceHandler, createFamilyHandoffHandler, HANDOFF_TTL_SECONDS } from '../netlify/functions/_family_device.mjs';

const READY = 'https://ready.example', HIDE = 'https://hide.example', EVIL = 'https://evil.example';
const stores = { [READY]: new Map(), [HIDE]: new Map() };
const ls = m => ({ getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
let page; // current origin
function open(url) { const u = new URL(url); page = u.origin; globalThis.localStorage = ls(stores[page]);
  globalThis.location = { origin: u.origin, href: u.href, pathname: u.pathname, search: u.search, hash: u.hash };
  globalThis.history = { state: null, replaceState(_s, _t, next) { const n = new URL(next, u.origin); Object.assign(globalThis.location, { href: n.href, pathname: n.pathname, search: n.search, hash: n.hash }); } }; }
globalThis.sessionStorage = { removeItem() {} };
const el = () => { const e = { hidden: false, disabled: true, textContent: '', children: [], listeners: {},
  addEventListener(t, f) { (e.listeners[t] ||= []).push(f); }, replaceChildren() { e.children = []; }, appendChild(c) { e.children.push(c); }, click() { (e.listeners.click || []).forEach(f => f()); } }; return e; };
const nodes = () => ({ familyLogin: el(), familySignInBtn: el(), familyGoogleTarget: el(), familyChooseTarget: el(), familyLoginStatus: el(), familySignOutBtn: el() });
let dom = nodes();
globalThis.document = { getElementById: id => dom[id] || null, documentElement: { dataset: {} }, createElement: () => el(), head: { appendChild() {} } };
globalThis.dispatchEvent = () => true;
const { createFamilySignin } = await import('../src/family-signin.mjs');

let now = Date.UTC(2026, 10, 14); const clock = () => now;
const SECRET = 's'.repeat(40);
const tokens = createDeviceTokens(SECRET, { now: clock });
const handoffTokens = createDeviceTokens(SECRET, { now: clock, ttlSeconds: HANDOFF_TTL_SECONDS });
const GOOGLE = 'eyJhbGciOiJSUzI1NiJ9.' + 'g'.repeat(120) + '.sig';
const google = { async verifyIdToken({ idToken, audience }) { if (idToken !== GOOGLE) throw Error('bad'); const s = Math.floor(now / 1000);
  return { getPayload: () => ({ iss: 'https://accounts.google.com', aud: audience[0], sub: '111', iat: s, exp: s + 3600 }) }; } };
const verifySubject = subjectVerifier(deviceAwareOAuthClient(google, tokens, { now: clock }), ['c1']);
const lookupMemberships = async ({ subject }) => subject === '111' ? [{ status: 'ACTIVE' }] : [];
const allowedOrigins = [READY, HIDE];
const device = createFamilyDeviceHandler({ verifySubject, lookupMemberships, tokens, allowedOrigins });
const handoff = createFamilyHandoffHandler({ verifySubject, lookupMemberships, handoffTokens, allowedOrigins });
const calls = [];
async function fetchImpl(url, opt = {}) {
  const u = new URL(url, location.href); calls.push(page + ' ' + u.pathname);
  if (u.pathname === '/.netlify/functions/family-auth-config') return Response.json({ ok: true, loginOrigin: page, googleClientId: '123-abc.apps.googleusercontent.com', apiBaseUrl: 'https://central.example/' });
  const headers = { authorization: opt.headers?.authorization || '', origin: page, 'content-type': 'application/json' };
  if (u.pathname === '/api/family/device') return device(new Request(u, { method: 'POST', headers, body: '{}' }));
  if (u.pathname === '/api/family/handoff') return handoff(new Request(u, { method: 'POST', headers, body: opt.body }));
  if (u.pathname === '/api/family/session') {
    try { const sub = await verifySubject(headers.authorization.slice(7)); if (!(await lookupMemberships({ subject: sub })).length) throw 0;
      return Response.json({ ok: true, session: { principal_id: 'google:' + sub, families: [{ family_id: 'TAKY-HOME', self_member_id: 'OWNER', authorized_member_ids: ['CHILD'] }] } });
    } catch { return Response.json({ ok: false }, { status: 401 }); }
  }
  throw Error('unexpected ' + url);
}
let googleCallback = null, prompted = 0;
const googleSdk = async () => ({ initialize(o) { googleCallback = o.callback; }, renderButton() {}, prompt() { prompted++; } });
const settle = () => new Promise(r => setTimeout(r, 20));
let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };

let ready, target;
await t('Ready signs in once, then builds the Hide link with a 2-minute pass', async () => {
  open(READY + '/'); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME;
  ready = createFamilySignin({ fetchImpl, googleSdk }); ready.mount();
  await ready.begin(); googleCallback({ credential: GOOGLE }); await settle();
  assert.equal(ready.status().state, 'BOUND');
  target = await ready.handoffUrl(HIDE + '/index.html?session_id=S1&child_id=CHILD');
  const u = new URL(target);
  assert.equal(u.origin + u.pathname + u.search, HIDE + '/index.html?session_id=S1&child_id=CHILD', 'Ready query kept');
  const pass = new URLSearchParams(u.hash.slice(1)).get('taky_handoff');
  const p = handoffTokens.verify(pass); assert.equal(p.sub, '111');
  assert.ok(p.exp - Math.floor(now / 1000) <= HANDOFF_TTL_SECONDS, 'short-lived');
});

await t('Hide (empty storage) opens signed in, no Google prompt; pass removed from the address bar', async () => {
  open(target); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME; prompted = 0; googleCallback = null;
  assert.equal(stores[HIDE].size, 0);
  const hide = createFamilySignin({ fetchImpl, googleSdk }); hide.mount(); await settle();
  assert.equal(hide.status().state, 'BOUND'); assert.equal(prompted, 0); assert.equal(googleCallback, null);
  assert.equal(location.hash, ''); assert.equal(location.search, '?session_id=S1&child_id=CHILD');
  const own = stores[HIDE].get('taky.familyDevice.v1');
  assert.equal(tokens.verify(own).exp - Math.floor(now / 1000) > 300 * 86400, true, 'traded for its own long-lived device token');
  assert.equal(await globalThis.TAKY_FAMILY_RUNTIME.getToken(), own);
});

await t('Hide reopened later in the same browser storage: still signed in', async () => {
  open(HIDE + '/'); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME; now += 3 * 86400e3; prompted = 0;
  const hide = createFamilySignin({ fetchImpl, googleSdk }); hide.mount(); await settle();
  assert.equal(hide.status().state, 'BOUND'); assert.equal(prompted, 0);
});

await t('a stale pass (over 2 minutes) is refused; app shows normal sign-in', async () => {
  open(READY + '/'); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME;
  ready = createFamilySignin({ fetchImpl, googleSdk }); ready.mount(); await settle();
  const late = await ready.handoffUrl(HIDE + '/');
  stores[HIDE].clear(); now += (HANDOFF_TTL_SECONDS + 5) * 1000;
  open(late); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME; prompted = 0;
  const hide = createFamilySignin({ fetchImpl, googleSdk }); hide.mount(); await settle();
  assert.equal(hide.status().state, 'UNBOUND'); assert.equal(stores[HIDE].has('taky.familyDevice.v1'), false);
  assert.equal(location.hash, '');
});

await t('handoff endpoint: only to approved apps, only for signed-in members', async () => {
  open(READY + '/');
  const req = (auth, target, origin = READY) => handoff(new Request('https://central.example/api/family/handoff', { method: 'POST',
    headers: { authorization: auth, origin, 'content-type': 'application/json' }, body: JSON.stringify({ target }) }));
  const dev = tokens.issue('111').token;
  assert.equal((await req('Bearer ' + dev, HIDE + '/x')).status, 200);
  assert.equal((await req('Bearer ' + dev, EVIL + '/x')).status, 403, 'pass never handed to an unknown site');
  assert.equal((await req('Bearer ' + dev, 'http://hide.example/')).status, 403);
  assert.equal((await req('', HIDE + '/')).status, 401);
  assert.equal((await req('Bearer ' + tokens.issue('999').token, HIDE + '/')).status, 401, 'not a member');
  assert.equal((await req('Bearer ' + dev, HIDE + '/', EVIL)).status, 403, 'called from an unknown site');
});

await t('not signed in: handoffUrl returns the plain link', async () => {
  open(READY + '/'); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME; stores[READY].clear();
  const r = createFamilySignin({ fetchImpl, googleSdk }); r.mount(); await settle();
  assert.equal(await r.handoffUrl(HIDE + '/a?b=1'), HIDE + '/a?b=1');
});

await t('Android: openApp uses an intent link (installed app can take it), pass in the query; app accepts it there', async () => {
  open(READY + '/'); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME;
  const went = []; const r = createFamilySignin({ fetchImpl, googleSdk, navigate: u => went.push(u) }); r.mount();
  await r.begin(); googleCallback({ credential: GOOGLE }); await settle();
  assert.equal((await r.openApp(HIDE + '/index.html?session_id=S1', { android: true })).via, 'ANDROID_INTENT');
  const m = /^intent:\/\/hide\.example\/index\.html\?session_id=S1&taky_handoff=(tdv1\.[^#]+)#Intent;scheme=https;S\.browser_fallback_url=([^;]+);end$/.exec(went[0]);
  assert.ok(m, went[0]); assert.equal(new URL(decodeURIComponent(m[2])).searchParams.get('taky_handoff'), decodeURIComponent(m[1]));
  assert.equal((await r.openApp(HIDE + '/', { android: false })).via, 'LINK'); assert.match(went[1], /#taky_handoff=tdv1\./);
  stores[HIDE].clear(); open(decodeURIComponent(m[2])); dom = nodes(); delete globalThis.TAKY_FAMILY_RUNTIME;
  const hide = createFamilySignin({ fetchImpl, googleSdk }); hide.mount(); await settle();
  assert.equal(hide.status().state, 'BOUND'); assert.equal(location.search, '?session_id=S1', 'pass removed from the query');
});

console.log(`family handoff: ${passed} passed`);
