// Redeems short-lived signed tickets issued by /api/family/character-asset.
// PUT = upload character image bytes to the family Drive folder; GET = read them back.
import { centralFor, readCentralConfig, notConfigured } from './_central_host.mjs';
import { verifyTicket, MAX_ASSET_BYTES, ASSET_BYTES_PATH } from './_central_drive.mjs';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...extra } });

export async function handleAssetBytes(request, deps = {}) {
  const config = deps.config || readCentralConfig();
  const origin = new URL(request.url).origin;
  const c = centralFor(origin, { config, ...deps });
  if (!c.ok) return notConfigured(c.missing);
  const reqOrigin = request.headers.get('origin');
  if (reqOrigin && !c.allowedOrigins.includes(reqOrigin)) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
  const cors = reqOrigin ? { 'Access-Control-Allow-Origin': reqOrigin, 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' } : {};
  if (request.method === 'OPTIONS') return reqOrigin ? new Response(null, { status: 204, headers: cors }) : json(404, { ok: false, reason: 'PREFLIGHT_NOT_ALLOWED' });
  const claims = verifyTicket(config.ticketSecret, new URL(request.url).searchParams.get('t'));
  if (!claims) return json(401, { ok: false, reason: 'ASSET_TICKET_INVALID' }, cors);
  if (request.method === 'PUT' && claims.op === 'put') {
    if ((request.headers.get('content-type') || '').toLowerCase() !== claims.content_type) return json(415, { ok: false, reason: 'ASSET_CONTENT_TYPE_MISMATCH' }, cors);
    if (Number(request.headers.get('content-length')) > MAX_ASSET_BYTES) return json(413, { ok: false, reason: 'ASSET_TOO_LARGE' }, cors);
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > MAX_ASSET_BYTES) return json(413, { ok: false, reason: 'ASSET_TOO_LARGE' }, cors);
    let r; try { r = await c.objectStore.putBytes(claims, bytes); } catch { return json(503, { ok: false, reason: 'ASSET_STORE_UNAVAILABLE' }, cors); }
    return r.ok ? json(200, { ok: true, upload_id: claims.upload_id }, cors) : json(409, { ok: false, reason: r.reason }, cors);
  }
  if (request.method === 'GET' && claims.op === 'get') {
    let r; try { r = await c.objectStore.getBytes(claims); } catch { return json(503, { ok: false, reason: 'ASSET_STORE_UNAVAILABLE' }, cors); }
    if (!r) return json(404, { ok: false, reason: 'ASSET_NOT_AVAILABLE' }, cors);
    return new Response(r.bytes, { status: 200, headers: { 'Content-Type': r.contentType, 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
  }
  return json(405, { ok: false, reason: 'ASSET_METHOD_NOT_ALLOWED' }, cors);
}

export default request => handleAssetBytes(request);
// Netlify reads config statically: the path must be a literal (same value as ASSET_BYTES_PATH).
export const config = { path: '/api/family/character-asset-bytes' };
