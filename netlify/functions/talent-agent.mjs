// /api/family/talent-agent — the scheduled cloud Claude run that reads 재능 homework photos (Taky 2026-11-25:
// "클라우드 Claude로 바꾸기", replaces the render PC job). It holds one key (TAKY_TALENT_AGENT_KEY) that opens ONLY this
// narrow door: read/write the 재능 week records and read the photos those records name, for one family's granted child.
// Inside, the call runs as the parent through the normal family endpoints (same member checks); no token leaves here.
import crypto from 'node:crypto';
import { readCentralConfig, notConfigured, centralFor, runNodeBridge } from './_central_host.mjs';
import { createDriveClient } from './_central_drive.mjs';
import { createDeviceTokens } from './_family_device.mjs';
import { materialPhotoFor } from './material-photo.mjs';

const WEEK_RECORD = /^ready-talent-week-(current|\d{4}-\d{2}-\d{2})$/;
const REF = /^[A-Za-z0-9_-]{10,160}$/;

export const AGENT_TOKEN_TTL_SECONDS = 5 * 60;
const ID = /^[A-Za-z0-9._:-]{1,64}$/;

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function createTalentAgentHandler({ agentKey, readMembers, tokens, forward }) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
  return async function handle(request) {
    // Server-to-server only: no browser origin is ever allowed here.
    if (request.headers.get('origin')) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
    if (request.method !== 'POST') return json(405, { ok: false, reason: 'POST_REQUIRED' });
    if (!agentKey || agentKey.length < 32) return json(503, { ok: false, reason: 'AGENT_NOT_CONFIGURED' });
    if (!same(String(request.headers.get('x-taky-agent-key') || ''), agentKey)) return json(401, { ok: false, reason: 'AGENT_KEY_REQUIRED' });
    let req = {}; try { req = (await request.json()) || {}; } catch { req = {}; }
    const family_id = String(req.family_id || '');
    if (!ID.test(family_id)) return json(400, { ok: false, reason: 'FAMILY_REQUIRED' });
    let rows; try { rows = await readMembers(); } catch { return json(503, { ok: false, reason: 'MEMBER_REGISTRY_UNAVAILABLE' }); }
    // The parent account that may write for the child: an ACTIVE adult row with a Google subject and granted members,
    // the family OWNER first. Its granted CHILD (or first grant) is the member the 재능 week is written for.
    const live = (rows || []).filter(r => r && r.status === 'ACTIVE' && r.family_id === family_id);
    const adults = live.filter(r => r.role !== 'CHILD' && r.provider === 'GOOGLE_OIDC' && typeof r.subject === 'string' && r.subject && (r.learning_evidence_submit_member_ids || []).length)
      .sort((a, b) => (b.self_member_id === 'OWNER') - (a.self_member_id === 'OWNER'));
    const owner = adults[0];
    if (!owner) return json(404, { ok: false, reason: 'FAMILY_PARENT_NOT_FOUND' });
    const grants = owner.learning_evidence_submit_member_ids.map(String);
    const child = live.find(r => r.role === 'CHILD' && grants.includes(String(r.self_member_id)));
    const member_id = child ? String(child.self_member_id) : grants[0];
    if (!req.op) return json(200, { ok: true, family_id, member_id });
    // The only three things the key can do. Everything else is refused before any family endpoint is touched.
    const bearer = tokens.issue(owner.subject).token;
    const q = new URLSearchParams({ family_id, member_id });
    if (req.op === 'get_week') {
      if (!WEEK_RECORD.test(String(req.record_id || ''))) return json(400, { ok: false, reason: 'WEEK_RECORD_ONLY' });
      q.set('record_type', 'MATERIAL_REFERENCE'); q.set('record_id', req.record_id);
      return forward('user-data', 'GET', q, bearer);
    }
    if (req.op === 'put_week') {
      const rec = req.record || {}, pl = rec.payload || {};
      if (!WEEK_RECORD.test(String(rec.record_id || '')) || rec.record_type !== 'MATERIAL_REFERENCE' || pl.schema !== 'READY_TALENT_WEEK_V1' || !['INTERPRETED', 'CONFIRMED'].includes(pl.state))
        return json(400, { ok: false, reason: 'WEEK_RECORD_ONLY' });
      const body = { record: Object.assign({}, rec, { family_id, member_id }), ...(req.expected_etag ? { expected_etag: req.expected_etag } : {}) };
      return forward('user-data', 'POST', new URLSearchParams(), bearer, JSON.stringify(body));
    }
    if (req.op === 'photo') {
      const ref = String(req.ref || ''); if (!REF.test(ref)) return json(400, { ok: false, reason: 'REF_REQUIRED' });
      // Only a photo the current week names: read the week first, as the parent.
      q.set('record_type', 'MATERIAL_REFERENCE'); q.set('record_id', 'ready-talent-week-current');
      const w = await (await forward('user-data', 'GET', q, bearer)).json().catch(() => ({}));
      const named = ((w.record && w.record.payload && w.record.payload.books) || []).some(b => (b.photo_refs || []).includes(ref));
      if (!named) return json(404, { ok: false, reason: 'PHOTO_NOT_IN_WEEK' });
      return forward('material-photo', 'GET', new URLSearchParams({ family_id, member_id, ref }), bearer);
    }
    return json(400, { ok: false, reason: 'OP_NOT_ALLOWED' });
  };
}

export function talentAgentFor({ config = readCentralConfig(), fetchImpl, oauth2Client, liveStore, agentKey = String(globalThis.Netlify?.env?.get?.('TAKY_TALENT_AGENT_KEY') ?? process.env.TAKY_TALENT_AGENT_KEY ?? '').trim() } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const origin = config.allowedOrigins[0];
  const central = centralFor(origin, { config, fetchImpl, oauth2Client, liveStore });
  const photos = materialPhotoFor({ config, fetchImpl, oauth2Client });
  if (!central.ok || !photos.ok) return { ok: false, missing: ['CENTRAL'] };
  const forward = (what, method, q, bearer, body) => {
    const r = new Request(origin + '/api/family/' + what + '?' + q, { method, headers: { Origin: origin, Authorization: 'Bearer ' + bearer, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body });
    return what === 'material-photo' ? photos.handle(r) : runNodeBridge(central.host.handler, r);
  };
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  const readMembers = async () => {
    const f = (await drive.find({ parent: config.folderId, name: 'members.json' }))[0];
    if (!f) throw Error('CENTRAL_MEMBER_REGISTRY_MISSING');
    return JSON.parse(await drive.readText(f.id));
  };
  return { ok: true, handle: createTalentAgentHandler({ agentKey, readMembers, forward, tokens: createDeviceTokens(config.ticketSecret, { ttlSeconds: AGENT_TOKEN_TTL_SECONDS }) }) };
}

export default async request => { const c = talentAgentFor(); return c.ok ? c.handle(request) : notConfigured(c.missing); };
// Netlify reads this statically at build time: it must be a string literal.
export const config = { path: '/api/family/talent-agent' };
