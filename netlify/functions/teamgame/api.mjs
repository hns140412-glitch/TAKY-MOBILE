// HTTP surface of the team game: Web Request -> Response. Shared by the Netlify Function and the local dev server.
//   POST room?pack=learn|event|olympic|sports       -> { code, hostKey }
//   POST send  { auth, msg }          -> { msgs: [...] }
//   POST poll  { auth }               -> { msgs: [...] }
//   GET  final?r=CODE&k=HOSTKEY       -> [...]
//   GET  qr.svg?u=URL                 -> svg
import QRCode from 'qrcode';
import { createRoom, poll, send, final } from './engine.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const MAX_BODY = 4096;

function cleanAuth(a) {
  if (!a || typeof a !== 'object') return {};
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  const out = { code: s(a.code, 8) };
  if (typeof a.hostKey === 'string') { out.hostKey = s(a.hostKey, 32); if (a.view === true) out.view = true; }
  else { out.teamId = s(a.teamId, 16); out.token = s(a.token, 32); }
  return out;
}

export async function handleApi(req, kv, route) {
  const url = new URL(req.url);
  try {
    if (route === 'room' && req.method === 'POST') return json(200, await createRoom(kv, url.searchParams.get('pack')));
    if ((route === 'send' || route === 'poll') && req.method === 'POST') {
      const raw = await req.text(); if (raw.length > MAX_BODY) return json(413, { error: 'TOO_BIG' });
      let body; try { body = JSON.parse(raw); } catch { return json(400, { error: 'BAD_JSON' }); }
      const auth = cleanAuth(body.auth);
      const msgs = route === 'poll' ? await poll(kv, auth) : await send(kv, auth, body.msg && typeof body.msg === 'object' ? body.msg : null);
      return json(200, { msgs, now: Date.now() });
    }
    if (route === 'final' && req.method === 'GET') {
      const rows = await final(kv, url.searchParams.get('r'), url.searchParams.get('k'));
      return rows ? json(200, rows) : json(404, { error: 'NO_ROOM' });
    }
    if (route === 'qr.svg' && req.method === 'GET') {
      const u = (url.searchParams.get('u') || '').slice(0, 300);
      const svg = await QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' } });
    }
    return json(404, { error: 'NOT_FOUND' });
  } catch (e) {
    if (e && e.message === 'ROOM_BUSY') return json(503, { error: 'ROOM_BUSY' });
    console.error('teamgame api', e);
    return json(500, { error: 'SERVER' });
  }
}
