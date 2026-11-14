// One sign-in per device: family-signin keeps a device token, restores it silently on the next visit,
// renews it, falls back to Google when it is revoked, and deletes it on sign-out. No network.
import assert from 'node:assert/strict';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier, createFamilyDeviceHandler } from '../netlify/functions/_family_device.mjs';

// ---- minimal browser globals
const store = new Map();
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.sessionStorage = { removeItem() {} };
globalThis.location = { origin: 'https://ready.example' };
const el = () => { const e = { hidden: false, disabled: true, textContent: '', children: [], listeners: {},
  addEventListener(t, f) { (e.listeners[t] ||= []).push(f); }, replaceChildren() { e.children = []; }, appendChild(c) { e.children.push(c); }, click() { (e.listeners.click || []).forEach(f => f()); } }; return e; };
const nodes = { familyLogin: el(), familySignInBtn: el(), familyGoogleTarget: el(), familyChooseTarget: el(), familyLoginStatus: el(), familySignOutBtn: el() };
globalThis.document = { getElementById: id => nodes[id] || null, documentElement: { dataset: {} }, createElement: () => el(), head: { appendChild() {} } };
const events = []; globalThis.dispatchEvent = e => events.push(e.type);
const { createFamilySignin } = await import('../src/family-signin.mjs');

// ---- fake central: real device-token code, fake Google, switchable membership
let now = Date.UTC(2026, 10, 14); const clock = () => now;
const tokens = createDeviceTokens('s'.repeat(40), { now: clock });
const GOOGLE = 'eyJhbGciOiJSUzI1NiJ9.' + 'g'.repeat(120) + '.sig';
const google = { async verifyIdToken({ idToken, audience }) { if (idToken !== GOOGLE) throw Error('bad'); const s = Math.floor(now / 1000);
  return { getPayload: () => ({ iss: 'https://accounts.google.com', aud: audience[0], sub: '111', iat: s, exp: s + 3600 }) }; } };
const client = deviceAwareOAuthClient(google, tokens, { now: clock });
const verifySubject = subjectVerifier(client, ['c1']);
let active = true; const calls = [];
const lookupMemberships = async ({ subject }) => active && subject === '111' ? [{ status: 'ACTIVE', family_id: 'TAKY-HOME', self_member_id: 'OWNER' }] : [];
const device = createFamilyDeviceHandler({ verifySubject, lookupMemberships, tokens, allowedOrigins: ['https://ready.example'] });
let centralUp = true;
async function fetchImpl(url, opt = {}) {
  const u = new URL(url, 'https://ready.example'); calls.push(u.pathname);
  if (u.pathname === '/.netlify/functions/family-auth-config') return Response.json({ ok: true, loginOrigin: 'https://ready.example', googleClientId: '123-abc.apps.googleusercontent.com', apiBaseUrl: 'https://central.example/' });
  if (!centralUp) throw TypeError('network');
  const auth = opt.headers?.authorization || '';
  if (u.pathname === '/api/family/device') return device(new Request(u, { method: 'POST', headers: { authorization: auth, origin: 'https://ready.example' }, body: '{}' }));
  if (u.pathname === '/api/family/session') {
    try { const sub = await verifySubject(auth.slice(7)); const rows = await lookupMemberships({ subject: sub });
      if (!rows.length) return Response.json({ ok: false }, { status: 401 });
      return Response.json({ ok: true, session: { principal_id: 'google:' + sub, families: [{ family_id: 'TAKY-HOME', self_member_id: 'OWNER', authorized_member_ids: ['CHILD'] }] } });
    } catch { return Response.json({ ok: false }, { status: 401 }); }
  }
  throw Error('unexpected ' + url);
}
let googleCallback = null, prompted = 0;
const googleSdk = async () => ({ initialize(o) { googleCallback = o.callback; }, renderButton() {}, prompt() { prompted++; } });
const settle = () => new Promise(r => setTimeout(r, 20));

let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };

await t('device tokens: signed, expiring, tamper-proof, no family scope', async () => {
  const { token } = tokens.issue('111');
  assert.match(token, /^tdv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))), ['v', 'sub', 'iat', 'exp']);
  assert.equal(tokens.verify(token).sub, '111');
  assert.equal(tokens.verify(token.slice(0, -2) + 'AA'), null);
  assert.equal(createDeviceTokens('o'.repeat(40)).verify(token), null, 'another secret cannot verify');
  const forged = 'tdv1.' + Buffer.from(JSON.stringify({ v: 1, sub: '999', iat: 1, exp: 9e9 })).toString('base64url') + '.' + token.split('.')[2];
  assert.equal(tokens.verify(forged), null);
  const later = createDeviceTokens('s'.repeat(40), { now: () => now + 401 * 86400e3 });
  assert.equal(later.verify(token), null, 'expires after 400 days without use');
  await assert.rejects(client.verifyIdToken({ idToken: 'tdv1.x.y', audience: ['c1'] }));
});

await t('first visit: Google sign-in -> device token stored, runtime uses it (not the 1-hour Google token)', async () => {
  const s = createFamilySignin({ fetchImpl, googleSdk }); s.mount();
  await s.begin(); googleCallback({ credential: GOOGLE }); await settle();
  assert.equal(s.status().state, 'BOUND');
  const saved = store.get('taky.familyDevice.v1'); assert.match(saved, /^tdv1\./);
  assert.equal(await globalThis.TAKY_FAMILY_RUNTIME.getToken(), saved);
  assert.ok(calls.includes('/api/family/device'));
});

await t('next visit (a week later): signed in silently, token renewed, no Google prompt', async () => {
  const before = store.get('taky.familyDevice.v1');
  delete globalThis.TAKY_FAMILY_RUNTIME; now += 7 * 86400e3; prompted = 0; googleCallback = null;
  const s = createFamilySignin({ fetchImpl, googleSdk }); s.mount(); await settle();
  assert.equal(s.status().state, 'BOUND');
  assert.equal(prompted, 0); assert.equal(googleCallback, null, 'Google was not asked');
  const after = store.get('taky.familyDevice.v1'); assert.notEqual(after, before, 'rolling renewal');
  assert.ok(tokens.verify(after).exp > tokens.verify(before).exp);
  assert.equal(await globalThis.TAKY_FAMILY_RUNTIME.getToken(), after);
});

await t('central briefly unreachable: token kept, no sign-out', async () => {
  delete globalThis.TAKY_FAMILY_RUNTIME; centralUp = false;
  const s = createFamilySignin({ fetchImpl, googleSdk }); s.mount(); await settle();
  assert.equal(s.status().state, 'UNBOUND'); assert.match(store.get('taky.familyDevice.v1'), /^tdv1\./, 'kept for next time');
  centralUp = true;
});

await t('removed from members.json: device token refused, deleted, falls back to Google', async () => {
  delete globalThis.TAKY_FAMILY_RUNTIME; active = false; prompted = 0;
  const s = createFamilySignin({ fetchImpl, googleSdk }); s.mount(); await settle();
  assert.equal(s.status().state, 'UNBOUND'); assert.equal(store.has('taky.familyDevice.v1'), false);
  assert.equal(prompted, 1, 'asks Google again (auto-select)');
  active = true;
});

await t('sign-out deletes the device token and the resume mark', async () => {
  delete globalThis.TAKY_FAMILY_RUNTIME;
  const s = createFamilySignin({ fetchImpl, googleSdk }); s.mount(); await settle();
  await s.begin(); googleCallback({ credential: GOOGLE }); await settle();
  assert.equal(s.status().state, 'BOUND'); assert.ok(store.has('taky.familyDevice.v1'));
  nodes.familySignOutBtn.click();
  assert.equal(store.has('taky.familyDevice.v1'), false); assert.equal(store.has('taky.familySignin.resume'), false);
  assert.equal(globalThis.TAKY_FAMILY_RUNTIME, undefined);
  prompted = 0; const s2 = createFamilySignin({ fetchImpl, googleSdk }); s2.mount(); await settle();
  assert.equal(s2.status().state, 'UNBOUND'); assert.equal(prompted, 0, 'after sign-out nothing signs in by itself');
});

await t('device endpoint: stranger/forged 401, unlisted origin 403', async () => {
  const req = (auth, origin = 'https://ready.example') => device(new Request('https://central.example/api/family/device', { method: 'POST', headers: { authorization: auth, origin }, body: '{}' }));
  assert.equal((await req('Bearer ' + GOOGLE)).status, 200);
  assert.equal((await req('Bearer ' + tokens.issue('999').token)).status, 401, 'valid token, not a member');
  assert.equal((await req('Bearer tdv1.aaaaaaaaaaaaaaaaaaaaaaaa.bbbb')).status, 401);
  assert.equal((await req('Bearer ' + GOOGLE, 'https://evil.example')).status, 403);
});

console.log(`family signin device: ${passed} passed`);
