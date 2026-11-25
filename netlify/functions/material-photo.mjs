// /api/family/material-photo — homework photos (Ready 보호자 화면, 재능 books) in the family Google Drive folder
// (Taky 2026-11-24 "구글 드라이브에 저장하고"). Any family device signed in can upload, list and read them; the
// base PC interpreter (tools/talent-photo-interpret.mjs) reads them to fill the week's ranges. Private: never
// public URLs, same family + authorized member checks as the central user-data endpoint.
import crypto from 'node:crypto';
import googleAuthLibrary from 'google-auth-library';
import { readCentralConfig, notConfigured } from './_central_host.mjs';
import { createDriveClient, createDriveMembershipProvider } from './_central_drive.mjs';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier } from './_family_device.mjs';

export const MATERIAL_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const REF = /^[A-Za-z0-9_-]{10,160}$/;
const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const BEARER = /^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/;
const KIND = 'material-photo';

// Same rule as the central principal: a CHILD only reaches itself; adults reach self + granted members.
export function authorizedFor(rows, familyId) {
  const out = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.status !== 'ACTIVE' || r.family_id !== familyId || !r.self_member_id) continue;
    out.add(r.self_member_id);
    if (r.role !== 'CHILD') for (const g of r.learning_evidence_submit_member_ids || []) out.add(String(g));
  }
  return out;
}

export function createMaterialPhotoHandler({ verifySubject, lookupMemberships, drive, folderId, allowedOrigins }) {
  const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' }, {});
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } : {};
    if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: cors }) : json(404, { ok: false }, {});
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(405, { ok: false, reason: 'METHOD_NOT_ALLOWED' }, cors);
    const q = new URL(request.url).searchParams;
    const family_id = String(q.get('family_id') || ''), member_id = String(q.get('member_id') || '');
    if (!ID.test(family_id) || !ID.test(member_id)) return json(400, { ok: false, reason: 'FAMILY_AND_MEMBER_REQUIRED' }, cors);
    const m = String(request.headers.get('authorization') || '').trim().match(BEARER);
    if (!m) return json(401, { ok: false, reason: 'VERIFIED_BEARER_REQUIRED' }, cors);
    let rows;
    try { rows = await lookupMemberships({ provider: 'GOOGLE_OIDC', subject: await verifySubject(m[1]) }); }
    catch { return json(401, { ok: false, reason: 'BEARER_IDENTITY_VERIFICATION_FAILED' }, cors); }
    if (!Array.isArray(rows) || !rows.some(r => r?.status === 'ACTIVE')) return json(401, { ok: false, reason: 'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED' }, cors);
    if (!authorizedFor(rows, family_id).has(member_id)) return json(403, { ok: false, reason: 'AUTHORIZED_MEMBER_REQUIRED' }, cors);
    const mine = async ref => {
      if (!REF.test(ref)) return null;
      try { const f = await drive.meta(ref); const a = f?.appProperties || {};
        return a.taky_kind === KIND && a.taky_family === family_id && a.taky_member === member_id ? f : null; } catch { return null; }
    };
    try {
      if (request.method === 'POST') {
        const week_id = String(q.get('week_id') || ''), book = String(q.get('book') || ''), type = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!WEEK.test(week_id) || !ID.test(book)) return json(400, { ok: false, reason: 'WEEK_AND_BOOK_REQUIRED' }, cors);
        if (!TYPES.includes(type)) return json(415, { ok: false, reason: 'IMAGE_TYPE_REQUIRED' }, cors);
        if (Number(request.headers.get('content-length')) > MATERIAL_PHOTO_MAX_BYTES) return json(413, { ok: false, reason: 'PHOTO_TOO_LARGE' }, cors);
        const bytes = Buffer.from(await request.arrayBuffer());
        if (!bytes.length || bytes.length > MATERIAL_PHOTO_MAX_BYTES) return json(413, { ok: false, reason: 'PHOTO_TOO_LARGE' }, cors);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        const same = await drive.find({ parent: folderId, props: { taky_kind: KIND, taky_family: family_id, taky_member: member_id, taky_sha: sha256.slice(0, 40) }, pageSize: 1 });
        if (same[0]) return json(200, { ok: true, photo_ref: same[0].id, duplicate: true }, cors);
        const f = await drive.create({ parent: folderId, name: `talent-${week_id}-${book}-${sha256.slice(0, 12)}.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]}`,
          mime: type, bytes, appProperties: { taky_kind: KIND, taky_family: family_id, taky_member: member_id, taky_week: week_id, taky_book: book, taky_sha: sha256.slice(0, 40) } });
        return json(200, { ok: true, photo_ref: f.id, sha256 }, cors);
      }
      const ref = String(q.get('ref') || '');
      if (request.method === 'DELETE') {
        const f = await mine(ref); if (!f) return json(404, { ok: false, reason: 'PHOTO_NOT_FOUND' }, cors);
        await drive.remove(f.id); return json(200, { ok: true }, cors);
      }
      if (ref) {
        const f = await mine(ref); if (!f) return json(404, { ok: false, reason: 'PHOTO_NOT_FOUND' }, cors);
        return new Response(await drive.readBytes(f.id), { status: 200, headers: { 'Content-Type': TYPES.includes(f.mimeType) ? f.mimeType : 'image/jpeg',
          'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
      }
      const week_id = String(q.get('week_id') || '');
      if (!WEEK.test(week_id)) return json(400, { ok: false, reason: 'WEEK_OR_REF_REQUIRED' }, cors);
      const files = await drive.find({ parent: folderId, props: { taky_kind: KIND, taky_family: family_id, taky_member: member_id, taky_week: week_id }, pageSize: 100 });
      return json(200, { ok: true, photos: files.map(f => ({ photo_ref: f.id, book: f.appProperties?.taky_book || '', created_at: f.createdTime || null })) }, cors);
    } catch (e) { if (process.env.TAKY_TEST_DEBUG) console.error(e); return json(503, { ok: false, reason: 'PHOTO_STORE_UNAVAILABLE' }, cors); }
  };
}

export function materialPhotoFor({ config = readCentralConfig(), fetchImpl, oauth2Client } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  const client = deviceAwareOAuthClient(oauth2Client || new googleAuthLibrary.OAuth2Client(), createDeviceTokens(config.ticketSecret));
  return { ok: true, handle: createMaterialPhotoHandler({ verifySubject: subjectVerifier(client, config.clientIds),
    lookupMemberships: createDriveMembershipProvider({ drive, folderId: config.folderId }), drive, folderId: config.folderId, allowedOrigins: config.allowedOrigins }) };
}

export default async request => { const c = materialPhotoFor(); return c.ok ? c.handle(request) : notConfigured(c.missing); };
// Netlify reads this statically at build time: it must be a string literal.
export const config = { path: '/api/family/material-photo' };
