// Character request queue (no paid API): a child's source photo waits privately until a PARENT
// makes the character by hand (e.g. ChatGPT subscription), uploads it through the existing
// character-asset + character-profile endpoints, then COMPLETEs the request. The source photo is
// deleted on COMPLETE/REJECT. Contract: TAKY OS/CHARACTER_ASSET_BEHAVIOR_PIPELINE 3 (raw photo is
// private input, never published), 6.1/6.2 (master goes through the private asset route only).
import crypto from 'node:crypto';
import { signTicket, MAX_ASSET_BYTES, ASSET_BYTES_PATH } from './_central_drive.mjs';

export const REQUEST_PATH = '/api/family/character-request';
const SHA = /^[a-f0-9]{64}$/;
const TYPES = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
const clean = v => typeof v === 'string' ? v.trim() : '';
const sha = v => crypto.createHash('sha256').update(v).digest('hex');

export function createCharacterRequestStore({ drive, folderId, secret, publicOrigin, now = Date.now }) {
  const exp = () => Math.floor(now() / 1000) + 300;
  const url = t => publicOrigin + ASSET_BYTES_PATH + '?t=' + encodeURIComponent(t);
  const scopeKey = (family_id, member_id) => sha(family_id + '\u0000' + member_id);
  return Object.freeze({
    uploadTicket({ family_id, member_id, content_type, byte_size, sha256 }) {
      const request_id = 'req_' + crypto.randomBytes(12).toString('hex');
      return { request_id, upload_url: url(signTicket(secret, { op: 'put_src', family_id, member_id, request_id, content_type, byte_size, sha256, exp: exp() })) };
    },
    async putSource(claims, bytes) {
      if (bytes.length !== claims.byte_size || sha(bytes) !== claims.sha256) return { ok: false, reason: 'SOURCE_BYTES_MISMATCH' };
      const ext = TYPES[claims.content_type]; if (!ext) return { ok: false, reason: 'SOURCE_TYPE_NOT_ALLOWED' };
      if ((await drive.find({ parent: folderId, appKey: 'taky_request_id', appValue: claims.request_id, pageSize: 1 }))[0]) return { ok: true, replay: true };
      // One open request per member: an older pending photo is removed (newest photo wins).
      for (const old of await drive.find({ parent: folderId, appKey: 'taky_req_scope', appValue: scopeKey(claims.family_id, claims.member_id), props: { taky_kind: 'source-photo' }, pageSize: 20 }))
        await drive.remove(old.id);
      await drive.create({ parent: folderId, name: 'taky-character-request-' + claims.request_id + '.' + ext, mime: claims.content_type, bytes,
        appProperties: { taky_kind: 'source-photo', taky_request_id: claims.request_id, taky_req_scope: scopeKey(claims.family_id, claims.member_id),
          taky_family: claims.family_id, taky_member: claims.member_id, taky_sha256: claims.sha256, taky_created: new Date(now()).toISOString() } });
      return { ok: true };
    },
    async status({ family_id, member_id }) {
      const f = (await drive.find({ parent: folderId, appKey: 'taky_req_scope', appValue: scopeKey(family_id, member_id), props: { taky_kind: 'source-photo' }, newest: true, pageSize: 1 }))[0];
      return f ? { pending: true, request_id: f.appProperties.taky_request_id, created_at: f.appProperties.taky_created || null } : { pending: false };
    },
    async list({ family_id }) {
      const rows = await drive.find({ parent: folderId, appKey: 'taky_kind', appValue: 'source-photo', props: { taky_family: family_id }, newest: true, pageSize: 50 });
      return rows.map(f => ({ request_id: f.appProperties.taky_request_id, member_id: f.appProperties.taky_member, created_at: f.appProperties.taky_created || null,
        photo_url: url(signTicket(secret, { op: 'get_src', file_id: f.id, family_id, exp: exp() })) }));
    },
    async close({ family_id, request_id }) {
      const f = (await drive.find({ parent: folderId, appKey: 'taky_request_id', appValue: request_id, props: { taky_family: family_id, taky_kind: 'source-photo' }, pageSize: 1 }))[0];
      if (!f) return { ok: false, reason: 'REQUEST_NOT_FOUND' };
      await drive.remove(f.id);
      return { ok: true, member_id: f.appProperties.taky_member };
    },
    async getSource(claims) {
      const m = await drive.meta(claims.file_id);
      if (m.appProperties?.taky_kind !== 'source-photo' || m.appProperties?.taky_family !== claims.family_id) return null;
      return { bytes: await drive.readBytes(claims.file_id), contentType: m.mimeType };
    },
  });
}

// role/authorization come only from the server registry (members.json) via the verified Google token.
export function createCharacterRequestHandler({ verifyIdToken, lookupMemberships, store, allowedOrigins }) {
  const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' }, {});
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } : {};
    if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: cors }) : json(404, { ok: false }, {});
    if (request.method !== 'POST') return json(405, { ok: false, reason: 'POST_REQUIRED' }, cors);
    const m = clean(request.headers.get('authorization') || '').match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);
    if (!m) return json(401, { ok: false, reason: 'VERIFIED_BEARER_REQUIRED' }, cors);
    let input; try { input = JSON.parse(await request.text()); } catch { return json(400, { ok: false, reason: 'VALID_JSON_REQUIRED' }, cors); }
    const family_id = clean(input?.family_id), action = clean(input?.action);
    if (!family_id || !['CREATE', 'STATUS', 'LIST', 'COMPLETE', 'REJECT'].includes(action)) return json(400, { ok: false, reason: 'REQUEST_ACTION_REQUIRED' }, cors);
    let row;
    try {
      const subject = await verifyIdToken(m[1]);
      row = (await lookupMemberships({ provider: 'GOOGLE_OIDC', subject })).find(r => r.family_id === family_id && r.status === 'ACTIVE');
    } catch { return json(401, { ok: false, reason: 'BEARER_IDENTITY_VERIFICATION_FAILED' }, cors); }
    if (!row) return json(403, { ok: false, reason: 'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED' }, cors);
    const members = [...new Set([row.self_member_id, ...(row.learning_evidence_submit_member_ids || [])].map(clean).filter(Boolean))];
    const parent = row.role === 'PARENT';
    try {
      if (action === 'CREATE' || action === 'STATUS') {
        const member_id = clean(input.member_id);
        if (!members.includes(member_id)) return json(403, { ok: false, reason: 'AUTHORIZED_MEMBER_REQUIRED' }, cors);
        if (action === 'STATUS') return json(200, { ok: true, ...(await store.status({ family_id, member_id })) }, cors);
        const content_type = clean(input.content_type).toLowerCase(), byte_size = Number(input.byte_size), sha256 = clean(input.sha256).toLowerCase();
        if (!TYPES[content_type] || !Number.isInteger(byte_size) || byte_size < 1 || byte_size > MAX_ASSET_BYTES || !SHA.test(sha256))
          return json(400, { ok: false, reason: 'SOURCE_PHOTO_METADATA_INVALID' }, cors);
        return json(200, { ok: true, ...store.uploadTicket({ family_id, member_id, content_type, byte_size, sha256 }) }, cors);
      }
      if (!parent) return json(403, { ok: false, reason: 'PARENT_ROLE_REQUIRED' }, cors);
      if (action === 'LIST') return json(200, { ok: true, requests: (await store.list({ family_id })).filter(r => members.includes(r.member_id)) }, cors);
      const request_id = clean(input.request_id);
      if (!/^req_[a-f0-9]{24}$/.test(request_id)) return json(400, { ok: false, reason: 'REQUEST_ID_REQUIRED' }, cors);
      const out = await store.close({ family_id, request_id });
      return out.ok ? json(200, { ok: true, request_id, member_id: out.member_id, closed: action }, cors) : json(404, { ok: false, reason: out.reason }, cors);
    } catch { return json(503, { ok: false, reason: 'CHARACTER_REQUEST_STORE_UNAVAILABLE' }, cors); }
  };
}
