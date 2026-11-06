// Central family functions: fake Google Drive REST + fake Google ID-token verifier + in-memory strong store.
// Exercises the real vendored TAKY host through the Netlify Fetch wrapper. No network.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { centralFor, runNodeBridge, readCentralConfig } from '../netlify/functions/_central_host.mjs';
import { handleAssetBytes } from '../netlify/functions/character-asset-bytes.mjs';
import { createRoutingStore } from '../netlify/functions/_central_drive.mjs';

const FOLDER = 'FOLDER_family_0001';
const ORIGIN = 'https://family-login-test--taky-mobile.netlify.app';
const SAVEY = 'https://family-login-test--savey-taky.netlify.app';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// ---- fake Drive (files.list q subset, multipart create/update, media get, patch, delete)
function fakeDrive() {
  const files = new Map(); let n = 0; const log = [];
  const parseQ = q => ({ parent: /'([^']+)' in parents/.exec(q)?.[1], name: /name = '([^']+)'/.exec(q)?.[1],
    apps: [...q.matchAll(/key='([^']+)' and value='([^']+)'/g)] });
  function parseMultipart(buf, ct) {
    const boundary = /boundary=(.+)$/.exec(ct)[1]; const s = buf.toString('latin1');
    const parts = s.split('--' + boundary).slice(1, -1).map(p => p.slice(p.indexOf('\r\n\r\n') + 4, -2));
    return { meta: JSON.parse(Buffer.from(parts[0], 'latin1').toString('utf8')), bytes: Buffer.from(parts[1], 'latin1') };
  }
  async function fetchImpl(url, opt = {}) {
    const u = new URL(url); log.push(opt.method + ' ' + u.pathname);
    const ok = (body, status = 200) => new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), { status });
    if (u.hostname === 'oauth2.googleapis.com') {
      const p = new URLSearchParams(String(opt.body));
      return p.get('refresh_token') === 'refresh-ok' ? ok({ access_token: 'access-token-123456', expires_in: 3600 }) : ok({ error: 'invalid_grant' }, 400);
    }
    assert.equal(opt.headers.Authorization, 'Bearer access-token-123456');
    const idm = /\/files\/([^/?]+)$/.exec(u.pathname);
    if (opt.method === 'GET' && u.pathname === '/drive/v3/files') {
      const q = parseQ(u.searchParams.get('q'));
      let out = [...files.values()].filter(f => f.parents.includes(q.parent) && !f.trashed && (!q.name || f.name === q.name) && q.apps.every(a => f.appProperties[a[1]] === a[2]));
      out.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
      if (u.searchParams.get('orderBy') === 'createdTime desc') out.reverse();
      out = out.slice(0, Number(u.searchParams.get('pageSize') || 100)); // real Drive pages
      return ok({ files: out.map(({ bytes, ...m }) => m) });
    }
    if (opt.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const { meta, bytes } = parseMultipart(opt.body, opt.headers['Content-Type']);
      const f = { id: 'file_' + String(++n).padStart(6, '0'), name: meta.name, parents: meta.parents, mimeType: meta.mimeType, appProperties: meta.appProperties || {}, version: '1', createdTime: new Date(n * 1000).toISOString(), bytes };
      files.set(f.id, f); const { bytes: _b, ...m } = f; return ok(m);
    }
    if (opt.method === 'PATCH' && idm && u.pathname.startsWith('/upload/')) {
      const f = files.get(decodeURIComponent(idm[1])); const { meta, bytes } = parseMultipart(opt.body, opt.headers['Content-Type']);
      f.bytes = bytes; Object.assign(f.appProperties, meta.appProperties || {}); f.version = String(+f.version + 1); const { bytes: _b, ...m } = f; return ok(m);
    }
    if (opt.method === 'PATCH' && idm) {
      const f = files.get(decodeURIComponent(idm[1])); Object.assign(f.appProperties, JSON.parse(opt.body).appProperties); f.version = String(+f.version + 1); const { bytes: _b, ...m } = f; return ok(m);
    }
    if (opt.method === 'GET' && idm) {
      const f = files.get(decodeURIComponent(idm[1])); if (!f) return ok({}, 404);
      if (u.searchParams.get('alt') === 'media') return ok(f.bytes);
      const { bytes: _b, ...m } = f; return ok(m);
    }
    if (opt.method === 'DELETE' && idm) { files.delete(decodeURIComponent(idm[1])); return ok('', 204); }
    throw Error('unexpected ' + opt.method + ' ' + url);
  }
  return { files, fetchImpl, log, seed(name, obj) { const f = { id: 'seed_' + name, name, parents: [FOLDER], mimeType: 'application/json', appProperties: {}, version: '1', createdTime: new Date(0).toISOString(), bytes: Buffer.from(JSON.stringify(obj)) }; files.set(f.id, f); } };
}
function memoryStore() {
  const m = new Map(); let v = 0;
  return { m, async getWithMetadata(k) { return m.has(k) ? { data: m.get(k).data, etag: m.get(k).etag, consistency: 'strong' } : null; },
    async setJSON(k, data, o = {}) { const cur = m.get(k); if (o.onlyIfNew && cur) return { modified: false }; if (o.onlyIfMatch && cur?.etag !== o.onlyIfMatch) return { modified: false }; const etag = 'e' + (++v); m.set(k, { data, etag }); return { modified: true, etag }; } };
}
const CLIENT = '15791067602-lvao9ohkbj3l5s3clbfb9n106uqssaol.apps.googleusercontent.com';
const oauth2Client = { async verifyIdToken({ idToken, audience }) {
  const sub = { 'token-parent-aaaaaaaaaaaa': '111', 'token-stranger-aaaaaaaaaa': '999' }[idToken];
  if (!sub) throw Error('bad token');
  const now = Math.floor(Date.now() / 1000);
  return { getPayload: () => ({ iss: 'https://accounts.google.com', aud: audience[0], sub, iat: now - 5, exp: now + 3000 }) };
} };
const env = o => name => o[name] ?? '';
const baseEnv = { TAKY_GOOGLE_WEB_CLIENT_ID: CLIENT, TAKY_CENTRAL_ALLOWED_ORIGINS: ORIGIN + ',' + SAVEY,
  TAKY_DRIVE_OAUTH_CLIENT_ID: 'cid', TAKY_DRIVE_OAUTH_CLIENT_SECRET: 'csecret', TAKY_DRIVE_OAUTH_REFRESH_TOKEN: 'refresh-ok',
  TAKY_FAMILY_DRIVE_FOLDER_ID: FOLDER, TAKY_CENTRAL_TICKET_SECRET: 'x'.repeat(40) };

let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };

await t('missing config fails closed with names only', async () => {
  const c = readCentralConfig(env({ TAKY_GOOGLE_WEB_CLIENT_ID: CLIENT }));
  assert.ok(c.missing.includes('TAKY_DRIVE_OAUTH_REFRESH_TOKEN') && c.missing.includes('TAKY_CENTRAL_TICKET_SECRET'));
  assert.equal(centralFor(ORIGIN, { config: c }).ok, false);
});

const drive = fakeDrive();
drive.seed('members.json', [
  { provider: 'GOOGLE_OIDC', subject: '111', status: 'ACTIVE', family_id: 'TAKY-HOME', self_member_id: 'OWNER', role: 'PARENT', learning_evidence_submit_member_ids: ['CHILD'], permissions: [], note: 'parent' },
]);
const live = memoryStore();
const config = readCentralConfig(env(baseEnv));
const c = centralFor(ORIGIN, { config, fetchImpl: drive.fetchImpl, oauth2Client, liveStore: live });
const call = (path, { method = 'POST', token = 'token-parent-aaaaaaaaaaaa', body, origin = ORIGIN } = {}) =>
  runNodeBridge(c.host.handler, new Request(ORIGIN + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }));

await t('session: Drive members.json grants family scope', async () => {
  const r = await call('/api/family/session', { body: {} }); const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.deepEqual(j.session.families, [{ family_id: 'TAKY-HOME', self_member_id: 'OWNER', authorized_member_ids: ['CHILD', 'OWNER'] }]);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(j.session.principal_id, 'google:111'); // same contract as the PC pilot
});
await t('session: unregistered Google subject and bad token are both 401 (vendored contract)', async () => {
  assert.equal((await call('/api/family/session', { token: 'token-stranger-aaaaaaaaaa', body: {} })).status, 401);
  assert.equal((await call('/api/family/session', { token: 'token-forged-aaaaaaaaaaa', body: {} })).status, 401);
});
await t('CORS: unlisted origin 403, preflight from SAVEY 204', async () => {
  assert.equal((await call('/api/family/session', { origin: 'https://evil.example', body: {} })).status, 403);
  const p = await runNodeBridge(c.host.handler, new Request(ORIGIN + '/api/family/session', { method: 'OPTIONS', headers: { Origin: SAVEY } }));
  assert.equal(p.status, 204); assert.equal(p.headers.get('access-control-allow-origin'), SAVEY);
});

await t('member-profile GET/PUBLISH/GET round trip is stored in Drive, not the live store', async () => {
  const scope = { family_id: 'TAKY-HOME', member_id: 'CHILD' };
  let r = await call('/api/family/member-profile', { body: { ...scope, action: 'GET' } });
  let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.found, false);
  const projection = { member_id: 'CHILD', profile_version: 1, display_name: '하루', nickname: '하루', family_role: 'CHILD', share_name_mode: 'NAME_NICKNAME', status: 'CONFIRMED', updated_at: new Date().toISOString() };
  r = await call('/api/family/member-profile', { body: { ...scope, action: 'PUBLISH', projection } });
  j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  r = await call('/api/family/member-profile', { body: { ...scope, action: 'GET' } });
  j = await r.json(); assert.equal(j.found, true, JSON.stringify(j)); assert.equal(j.projection.display_name, '하루');
  const onDrive = [...drive.files.values()].filter(f => f.appProperties.taky_kind === 'profile');
  assert.equal(onDrive.length, 1); assert.ok(onDrive[0].bytes.toString('utf8').includes('하루'), 'UTF-8 Korean kept');
  assert.equal([...live.m.keys()].filter(k => /\/profile\//.test(k)).length, 0, 'no profile in live store');
  assert.equal((await call('/api/family/member-profile', { body: { family_id: 'OTHER-FAMILY', member_id: 'CHILD', action: 'GET' } })).status, 403);
  assert.equal((await call('/api/family/member-profile', { body: { family_id: 'TAKY-HOME', member_id: 'SPOUSE', action: 'GET' } })).status, 403);
});

await t('routing store: profile keys -> Drive, everything else -> live', async () => {
  const d = memoryStore(), l = memoryStore(); const s = createRoutingStore({ driveStore: d, liveStore: l });
  await s.setJSON('families/TAKY-HOME/members/CHILD/profile/character-v1', { a: 1 });
  await s.setJSON('families/TAKY-HOME/members/CHILD/user-data/assignment/x1', { b: 1 });
  await s.setJSON('learning/evidence/abc', { c: 1 });
  assert.deepEqual([...d.m.keys()], ['families/TAKY-HOME/members/CHILD/profile/character-v1']);
  assert.equal(l.m.size, 2);
});

await t('character photo: ticket upload -> Drive -> commit -> signed read', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(2000)]);
  const base = { family_id: 'TAKY-HOME', member_id: 'CHILD', character_id: 'ready-photo-1' };
  let r = await call('/api/family/character-asset', { body: { ...base, action: 'CREATE_UPLOAD', content_type: 'image/png', byte_size: png.length, sha256: sha(png), asset_version: 'v1' } });
  let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.ok(j.upload_url.startsWith(ORIGIN + '/api/family/character-asset-bytes?t='));
  const deps = { config, fetchImpl: drive.fetchImpl, oauth2Client, liveStore: live };
  const bad = await handleAssetBytes(new Request(j.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.concat([png, Buffer.from([1])]) }), deps);
  assert.equal(bad.status, 409, 'size/sha mismatch rejected');
  const forged = await handleAssetBytes(new Request(j.upload_url.replace(/.$/, c => c === 'A' ? 'B' : 'A'), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png }), deps);
  assert.equal(forged.status, 401);
  const put = await handleAssetBytes(new Request(j.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png', Origin: SAVEY }, body: png }), deps);
  assert.equal(put.status, 200, await put.clone().text());
  r = await call('/api/family/character-asset', { body: { ...base, action: 'RESOLVE_READ', asset_ref: j.asset_ref } });
  assert.equal(r.status, 404, 'uncommitted asset is not readable');
  r = await call('/api/family/character-asset', { body: { ...base, action: 'COMMIT_UPLOAD', asset_ref: j.asset_ref, upload_id: j.upload_id, sha256: sha(png) } });
  assert.equal(r.status, 200, await r.clone().text());
  r = await call('/api/family/character-asset', { body: { ...base, action: 'RESOLVE_READ', asset_ref: j.asset_ref } });
  const rr = await r.json(); assert.equal(r.status, 200, JSON.stringify(rr));
  const got = await handleAssetBytes(new Request(rr.read_url), deps);
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(sha(Buffer.from(await got.arrayBuffer())), sha(png));
  const stored = [...drive.files.values()].find(f => f.appProperties.taky_kind === 'character-asset');
  assert.ok(stored && stored.parents[0] === FOLDER, 'image lives in family Drive folder');
  const otherFamily = await call('/api/family/character-asset', { body: { ...base, family_id: 'OTHER', action: 'RESOLVE_READ', asset_ref: j.asset_ref } });
  assert.equal(otherFamily.status, 403);
  // Review finding (HIGH): an authorized scope must not unlock another member's/family's asset_ref.
  const crossMember = await call('/api/family/character-asset', { body: { ...base, member_id: 'OWNER', action: 'RESOLVE_READ', asset_ref: j.asset_ref } });
  assert.equal(crossMember.status, 403, 'OWNER scope cannot read CHILD asset_ref');
  assert.equal((await crossMember.json()).reason, 'ASSET_REF_SCOPE_MISMATCH');
  const crossChar = await call('/api/family/character-asset', { body: { ...base, character_id: 'other-char', action: 'RESOLVE_READ', asset_ref: j.asset_ref } });
  assert.equal(crossChar.status, 403);
  // Review finding (MEDIUM): replaying the upload ticket stores nothing new.
  const before = [...drive.files.values()].filter(f => f.appProperties.taky_kind === 'character-asset').length;
  const replay = await handleAssetBytes(new Request(j.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png }), deps);
  assert.equal(replay.status, 200);
  assert.equal([...drive.files.values()].filter(f => f.appProperties.taky_kind === 'character-asset').length, before, 'replay created no file');
});

await t('character photo: newest committed version wins even after 12 uploads (no page blind spot)', async () => {
  const base = { family_id: 'TAKY-HOME', member_id: 'CHILD', character_id: 'many' };
  const deps = { config, fetchImpl: drive.fetchImpl, oauth2Client, liveStore: live };
  let last, ref;
  for (let i = 0; i < 12; i++) {
    const img = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, i]), crypto.randomBytes(64)]);
    const r = await call('/api/family/character-asset', { body: { ...base, action: 'CREATE_UPLOAD', content_type: 'image/png', byte_size: img.length, sha256: sha(img), asset_version: 'v1' } });
    const j = await r.json(); ref = j.asset_ref;
    assert.equal((await handleAssetBytes(new Request(j.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: img }), deps)).status, 200);
    assert.equal((await call('/api/family/character-asset', { body: { ...base, action: 'COMMIT_UPLOAD', asset_ref: ref, upload_id: j.upload_id, sha256: sha(img) } })).status, 200);
    last = img;
  }
  const rr = await (await call('/api/family/character-asset', { body: { ...base, action: 'RESOLVE_READ', asset_ref: ref } })).json();
  const got = await handleAssetBytes(new Request(rr.read_url), deps);
  assert.equal(sha(Buffer.from(await got.arrayBuffer())), sha(last), 'latest committed image is served');
});

await t('learning evidence stays fail-closed (no browser claim becomes evidence)', async () => {
  const r = await call('/api/learning/evidence', { body: { family_id: 'TAKY-HOME', member_id: 'CHILD' } });
  assert.ok(r.status >= 400, 'status ' + r.status);
});

await t('Drive token failure -> 503/401 without leaking secrets', async () => {
  const d2 = fakeDrive();
  const c2 = centralFor(ORIGIN, { config: readCentralConfig(env({ ...baseEnv, TAKY_DRIVE_OAUTH_REFRESH_TOKEN: 'refresh-revoked' })), fetchImpl: d2.fetchImpl, oauth2Client, liveStore: memoryStore() });
  const r = await runNodeBridge(c2.host.handler, new Request(ORIGIN + '/api/family/session', { method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer token-parent-aaaaaaaaaaaa', 'Content-Type': 'application/json' }, body: '{}' }));
  const text = await r.text();
  assert.ok(r.status === 401 || r.status === 503, r.status + text);
  assert.ok(!text.includes('csecret') && !text.includes('refresh-revoked'));
});

console.log(`central functions: ${passed} passed`);
