// TAKY central family data on Google Drive (server side only).
// Drive holds the FAMILY data: member registry (members.json), member/character
// profiles and character images. It is NOT the live learning-evidence/badge ledger
// (LEARNING_ENGINE_DRIVE_HYBRID_STORAGE_REVIEW_2026-09-26 option C rejected), so
// the host routes only profile keys here. Scope: drive.file (files this app made).
import crypto from 'node:crypto';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ID = /^[A-Za-z0-9_-]{10,160}$/;
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
export const DRIVE_VERSION = 'TAKY_CENTRAL_FAMILY_DRIVE_V1';

export function createDriveClient({ clientId, clientSecret, refreshToken, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (!clientId || !clientSecret || !refreshToken) throw Error('CENTRAL_DRIVE_OAUTH_NOT_CONFIGURED');
  let cached = null;
  async function token() {
    if (cached && cached.exp - 60_000 > now()) return cached.value;
    const res = await fetchImpl(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.access_token !== 'string') throw Error('CENTRAL_DRIVE_TOKEN_REFRESH_FAILED_' + res.status + (body.error ? '_' + body.error : ''));
    cached = { value: body.access_token, exp: now() + (Number(body.expires_in) || 3000) * 1000 };
    return cached.value;
  }
  async function call(method, url, { json, body, contentType } = {}) {
    const headers = { Authorization: 'Bearer ' + await token(), Accept: 'application/json' };
    if (contentType) headers['Content-Type'] = contentType;
    else if (json !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    const res = await fetchImpl(url, { method, headers, body: json !== undefined ? JSON.stringify(json) : body, redirect: 'error' });
    if (!res.ok) throw Object.assign(Error('CENTRAL_DRIVE_HTTP_' + res.status), { status: res.status });
    return res;
  }
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  // props: extra exact appProperties matches. newest: newest-first, so a single page
  // always holds the latest match however many older files exist.
  async function find({ parent, name, appKey, appValue, props = {}, newest = false, pageSize = 10 }) {
    if (!ID.test(parent)) throw Error('CENTRAL_DRIVE_FOLDER_ID_INVALID');
    const parts = [q(parent) + ' in parents', 'trashed = false'];
    if (name) parts.push('name = ' + q(name));
    const all = { ...(appKey ? { [appKey]: appValue } : {}), ...props };
    for (const [k, v] of Object.entries(all)) parts.push('appProperties has { key=' + q(k) + ' and value=' + q(v) + ' }');
    const u = new URL(API);
    u.searchParams.set('q', parts.join(' and '));
    u.searchParams.set('fields', 'files(id,name,version,mimeType,size,appProperties,createdTime)');
    u.searchParams.set('orderBy', newest ? 'createdTime desc' : 'createdTime');
    u.searchParams.set('pageSize', String(Math.min(Math.max(pageSize | 0, 1), 100)));
    return (await (await call('GET', u.href)).json()).files || [];
  }
  async function readText(id) {
    const res = await call('GET', API + '/' + encodeURIComponent(id) + '?alt=media');
    return res.text();
  }
  async function readBytes(id) {
    const res = await call('GET', API + '/' + encodeURIComponent(id) + '?alt=media');
    return Buffer.from(await res.arrayBuffer());
  }
  async function meta(id) {
    return (await call('GET', API + '/' + encodeURIComponent(id) + '?fields=id,name,version,mimeType,size,appProperties')).json();
  }
  function multipart(metadata, bytes, mime) {
    const boundary = 'taky' + crypto.randomBytes(12).toString('hex');
    const head = Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n');
    return { body: Buffer.concat([head, Buffer.from(bytes), Buffer.from('\r\n--' + boundary + '--')]), contentType: 'multipart/related; boundary=' + boundary };
  }
  async function create({ parent, name, appProperties = {}, bytes, mime = 'application/json' }) {
    const m = multipart({ name, parents: [parent], appProperties, mimeType: mime }, bytes, mime);
    return (await call('POST', UPLOAD + '?uploadType=multipart&fields=id,name,version,appProperties', m)).json();
  }
  async function update(id, { bytes, mime = 'application/json', appProperties }) {
    const m = multipart(appProperties ? { appProperties } : {}, bytes, mime);
    return (await call('PATCH', UPLOAD + '/' + encodeURIComponent(id) + '?uploadType=multipart&fields=id,name,version,appProperties', m)).json();
  }
  async function patchMeta(id, metadata) {
    return (await call('PATCH', API + '/' + encodeURIComponent(id) + '?fields=id,version,appProperties', { json: metadata })).json();
  }
  async function remove(id) { await call('DELETE', API + '/' + encodeURIComponent(id)); }
  return Object.freeze({ version: DRIVE_VERSION, token, find, readText, readBytes, meta, create, update, patchMeta, remove });
}

// Strong-store shaped adapter (getWithMetadata / setJSON onlyIfNew|onlyIfMatch) for
// LOW-CHURN family profile JSON. etag = Drive file version. Drive has no atomic CAS:
// the version check narrows but does not close a concurrent-write window. That is
// accepted only for parent-edited profiles; ledgers must never use this store.
export function createDriveJsonStore({ drive, folderId }) {
  if (!drive || !ID.test(String(folderId || ''))) throw Error('CENTRAL_DRIVE_STORE_NOT_CONFIGURED');
  const ids = new Map();
  const nameFor = key => 'taky-profile-' + sha(key).slice(0, 40) + '.json';
  async function locate(key) {
    const files = await drive.find({ parent: folderId, appKey: 'taky_key_sha', appValue: sha(key) });
    return files[0] || null;
  }
  async function getWithMetadata(key) {
    const f = await locate(key);
    if (!f) return null;
    const parsed = JSON.parse(await drive.readText(f.id));
    if (parsed.key !== key) throw Error('CENTRAL_DRIVE_KEY_MISMATCH');
    ids.set(key, f.id);
    return { data: parsed.data, etag: 'v' + f.version, consistency: 'strong', type: 'json' };
  }
  async function setJSON(key, value, opts = {}) {
    const payload = Buffer.from(JSON.stringify({ store_version: DRIVE_VERSION, key, data: value }), 'utf8');
    const f = await locate(key);
    if (!f) {
      if (opts.onlyIfMatch) return { modified: false, etag: null };
      const made = await drive.create({ parent: folderId, name: nameFor(key), appProperties: { taky_key_sha: sha(key), taky_kind: 'profile' }, bytes: payload });
      // Two concurrent creates: keep the oldest file, drop ours if it lost.
      const all = await drive.find({ parent: folderId, appKey: 'taky_key_sha', appValue: sha(key) });
      if (all.length > 1 && all[0].id !== made.id) { await drive.remove(made.id).catch(() => {}); return { modified: false, etag: 'v' + all[0].version }; }
      return { modified: true, etag: 'v' + made.version };
    }
    if (opts.onlyIfNew) return { modified: false, etag: 'v' + f.version };
    if (opts.onlyIfMatch && opts.onlyIfMatch !== 'v' + f.version) return { modified: false, etag: 'v' + f.version };
    const done = await drive.update(f.id, { bytes: payload });
    return { modified: true, etag: 'v' + done.version };
  }
  return Object.freeze({ version: DRIVE_VERSION, getWithMetadata, setJSON });
}

// Routes family profile keys to Drive, everything else (learning evidence, decisions,
// user-data records) to the strong live store (Netlify Blobs).
export const DRIVE_KEY = /^families\/[^/]+\/members\/[^/]+\/profile\/[a-z0-9-]+$/;
export function createRoutingStore({ driveStore, liveStore }) {
  if (!liveStore?.getWithMetadata || !liveStore?.setJSON) throw Error('CENTRAL_LIVE_STRONG_STORE_REQUIRED');
  const pick = key => (DRIVE_KEY.test(String(key)) ? driveStore : liveStore);
  return Object.freeze({
    getWithMetadata: (key, o) => { const s = pick(key); if (!s) throw Error('CENTRAL_DRIVE_STORE_NOT_CONFIGURED'); return s.getWithMetadata(key, o); },
    setJSON: (key, v, o) => { const s = pick(key); if (!s) throw Error('CENTRAL_DRIVE_STORE_NOT_CONFIGURED'); return s.setJSON(key, v, o); },
  });
}

// members.json in the family Drive folder is the server-owned registry (same shape as
// the PC pilot C:\TAKY_CENTRAL_LOCAL\members.json). A parent may edit it in Drive.
export function createDriveMembershipProvider({ drive, folderId, ttlMs = 30_000, now = Date.now }) {
  let cache = null;
  async function rows() {
    if (cache && now() - cache.at < ttlMs) return cache.rows;
    const f = (await drive.find({ parent: folderId, name: 'members.json' }))[0];
    if (!f) throw Error('CENTRAL_MEMBER_REGISTRY_MISSING');
    const parsed = JSON.parse(await drive.readText(f.id));
    if (!Array.isArray(parsed)) throw Error('CENTRAL_MEMBER_REGISTRY_INVALID');
    cache = { at: now(), rows: parsed };
    return parsed;
  }
  return async function lookupMemberships({ provider, subject }) {
    return (await rows()).filter(r => r && r.provider === provider && r.subject === subject)
      .map(({ provider: _p, subject: _s, note: _n, ...m }) => m);
  };
}

// Character image object store on Drive with short-lived HMAC tickets that the
// character-asset-bytes function redeems (upload PUT / read GET).
const b64u = b => Buffer.from(b).toString('base64url');
export function signTicket(secret, claims) {
  const body = b64u(JSON.stringify(claims));
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
export function verifyTicket(secret, token, now = Date.now) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let c; try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!Number.isFinite(c.exp) || c.exp * 1000 < now()) return null;
  return c;
}
export const ASSET_BYTES_PATH = '/api/family/character-asset-bytes';
export const MAX_ASSET_BYTES = 5 * 1024 * 1024; // Netlify sync function body limit is 6 MB
export function createDriveCharacterObjectStore({ drive, folderId, secret, publicOrigin, now = Date.now }) {
  if (!drive || !ID.test(String(folderId || '')) || String(secret || '').length < 32 || !/^https?:\/\/[^/]+$/.test(String(publicOrigin || '')))
    throw Error('CENTRAL_CHARACTER_OBJECT_STORE_NOT_CONFIGURED');
  const exp = s => Math.floor(now() / 1000) + Math.min(Math.max(Number(s) || 300, 30), 600);
  const url = t => publicOrigin + ASSET_BYTES_PATH + '?t=' + encodeURIComponent(t);
  return Object.freeze({
    async createUploadTicket({ asset_ref, content_type, byte_size, sha256, expires_in_seconds }) {
      if (byte_size > MAX_ASSET_BYTES) throw Error('CHARACTER_ASSET_TOO_LARGE');
      const upload_id = 'up_' + crypto.randomBytes(16).toString('hex');
      const e = exp(expires_in_seconds);
      return { upload_id, upload_url: url(signTicket(secret, { op: 'put', asset_ref, content_type, byte_size, sha256, upload_id, exp: e })), expires_at: new Date(e * 1000).toISOString() };
    },
    async commitUpload({ asset_ref, upload_id, sha256 }) {
      const f = (await drive.find({ parent: folderId, appKey: 'taky_upload_id', appValue: upload_id }))[0];
      if (!f || f.appProperties?.taky_asset_sha !== sha(asset_ref) || f.appProperties?.taky_sha256 !== sha256) return { ok: false };
      const done = await drive.patchMeta(f.id, { appProperties: { taky_committed: '1' } });
      return { ok: true, sha256, etag: 'v' + done.version };
    },
    async createReadTicket({ asset_ref, expires_in_seconds }) {
      // Newest committed upload for this asset_ref, filtered server-side (no page-size blind spot).
      const f = (await drive.find({ parent: folderId, appKey: 'taky_asset_sha', appValue: sha(asset_ref), props: { taky_committed: '1' }, newest: true, pageSize: 1 }))[0];
      if (!f || f.appProperties?.taky_committed !== '1') return null;
      const e = exp(expires_in_seconds);
      return { read_url: url(signTicket(secret, { op: 'get', file_id: f.id, exp: e })), expires_at: new Date(e * 1000).toISOString() };
    },
    // Called by the bytes function after the ticket is verified.
    async putBytes(claims, bytes) {
      if (bytes.length !== claims.byte_size || sha(bytes) !== claims.sha256) return { ok: false, reason: 'ASSET_BYTES_MISMATCH' };
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[claims.content_type];
      if (!ext) return { ok: false, reason: 'ASSET_TYPE_NOT_ALLOWED' };
      // A ticket is good for one upload: a replay of the same upload_id stores nothing new.
      // (Drive has no unique constraint, so two truly simultaneous first redemptions could
      // still both write; commit/read then pick one file and the bytes are identical.)
      if ((await drive.find({ parent: folderId, appKey: 'taky_upload_id', appValue: claims.upload_id, pageSize: 1 }))[0]) return { ok: true, replay: true };
      await drive.create({ parent: folderId, name: 'taky-character-' + sha(claims.asset_ref).slice(0, 24) + '.' + ext, mime: claims.content_type, bytes,
        appProperties: { taky_asset_sha: sha(claims.asset_ref), taky_upload_id: claims.upload_id, taky_sha256: claims.sha256, taky_kind: 'character-asset' } });
      return { ok: true };
    },
    async getBytes(claims) {
      const m = await drive.meta(claims.file_id);
      if (m.appProperties?.taky_committed !== '1' || m.appProperties?.taky_kind !== 'character-asset') return null;
      return { bytes: await drive.readBytes(claims.file_id), contentType: m.mimeType };
    },
  });
}
