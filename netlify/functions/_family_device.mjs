// Device sign-in for TAKY family login: one Google sign-in per device, kept until sign-out (Taky 2026-11-14).
// A device token is an HMAC-signed, rolling { sub, exp } for a Google subject that is ACTIVE in members.json.
// It carries NO family scope or role: every call still runs lookupMemberships, so removing a member from
// members.json revokes that device at once. It is accepted by wrapping the OAuth2 client's verifyIdToken,
// so the vendored TAKY LEARNING transport stays unchanged. Key = HMAC(TAKY_CENTRAL_TICKET_SECRET, label).
import crypto from 'node:crypto';

export const DEVICE_PREFIX = 'tdv1.';
export const DEVICE_PATH = '/api/family/device';
// Renewed on every app open; ~400 days of no use ends it (same ceiling Chrome puts on cookies).
export const DEVICE_TTL_SECONDS = 400 * 24 * 60 * 60;
const SUB = /^[A-Za-z0-9_-]{1,255}$/;
const BEARER = /^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/;

export function createDeviceTokens(ticketSecret, { now = Date.now, ttlSeconds = DEVICE_TTL_SECONDS } = {}) {
  if (typeof ticketSecret !== 'string' || ticketSecret.length < 32) throw Error('DEVICE_SECRET_REQUIRED');
  const key = crypto.createHmac('sha256', ticketSecret).update('taky-family-device-v1').digest();
  const mac = body => crypto.createHmac('sha256', key).update(DEVICE_PREFIX + body).digest('base64url');
  const sec = () => Math.floor(now() / 1000);
  return Object.freeze({
    issue(sub) {
      if (!SUB.test(String(sub || ''))) throw Error('DEVICE_SUBJECT_INVALID');
      const iat = sec(), exp = iat + ttlSeconds;
      const body = Buffer.from(JSON.stringify({ v: 1, sub, iat, exp })).toString('base64url');
      return { token: DEVICE_PREFIX + body + '.' + mac(body), expires_at: new Date(exp * 1000).toISOString() };
    },
    verify(token) {
      if (typeof token !== 'string' || !token.startsWith(DEVICE_PREFIX) || token.length > 1024) return null;
      const parts = token.slice(DEVICE_PREFIX.length).split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      const want = Buffer.from(mac(parts[0])), got = Buffer.from(parts[1]);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      let p; try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
      if (p?.v !== 1 || !SUB.test(String(p.sub || '')) || !Number.isSafeInteger(p.exp) || p.exp <= sec()) return null;
      return { sub: p.sub, exp: p.exp };
    },
  });
}

// Google ID tokens go to the real client; device tokens become a short-lived Google-shaped payload
// for the same subject, so the vendored verifier (iss/aud/sub/iat/exp) and membership lookup run as before.
export function deviceAwareOAuthClient(base, tokens, { now = Date.now } = {}) {
  return Object.freeze({
    async verifyIdToken({ idToken, audience }) {
      if (typeof idToken === 'string' && idToken.startsWith(DEVICE_PREFIX)) {
        const d = tokens.verify(idToken);
        if (!d) throw Error('DEVICE_TOKEN_INVALID');
        const s = Math.floor(now() / 1000);
        const payload = Object.freeze({ iss: 'https://accounts.google.com', aud: Array.isArray(audience) ? audience[0] : audience,
          sub: d.sub, iat: s, exp: Math.min(d.exp, s + 300) });
        return { getPayload: () => payload };
      }
      return base.verifyIdToken({ idToken, audience });
    },
  });
}

export function subjectVerifier(client, clientIds) {
  return async idToken => {
    const t = await client.verifyIdToken({ idToken, audience: clientIds });
    const p = t.getPayload();
    if (!p?.sub || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)) throw Error('BAD_TOKEN');
    return p.sub;
  };
}

// POST /api/family/device with a Google ID token (first sign-in) or a device token (renewal)
// -> a fresh device token. Only a subject with an ACTIVE membership gets one.
export function createFamilyDeviceHandler({ verifySubject, lookupMemberships, tokens, allowedOrigins }) {
  const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' }, {});
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } : {};
    if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: cors }) : json(404, { ok: false }, {});
    if (request.method !== 'POST') return json(405, { ok: false, reason: 'POST_REQUIRED' }, cors);
    const m = String(request.headers.get('authorization') || '').trim().match(BEARER);
    if (!m) return json(401, { ok: false, reason: 'VERIFIED_BEARER_REQUIRED' }, cors);
    let sub, rows;
    try {
      sub = await verifySubject(m[1]);
      rows = await lookupMemberships({ provider: 'GOOGLE_OIDC', subject: sub });
    } catch { return json(401, { ok: false, reason: 'BEARER_IDENTITY_VERIFICATION_FAILED' }, cors); }
    if (!Array.isArray(rows) || !rows.some(r => r?.status === 'ACTIVE')) return json(401, { ok: false, reason: 'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED' }, cors);
    const out = tokens.issue(sub);
    return json(200, { ok: true, device_token: out.token, expires_at: out.expires_at }, cors);
  };
}

// ---- Ready -> app handoff (Taky 2026-11-14: "래디앤셋 로그인 하면 나머지는 일괄 차용").
// Every app lives on its own origin (and on iOS every home-screen app has its own storage), so a sign-in
// cannot be shared through the browser. Instead a signed-in app (Ready) asks for a 2-minute device-format
// token and opens the other app with it in the URL fragment (#taky_handoff=…). The fragment never reaches a
// server; the receiving app immediately trades it at /api/family/device for its own long-lived device token.
// Same key and checks as a device token, so membership is still re-checked on every call.
export const HANDOFF_PATH = '/api/family/handoff';
export const HANDOFF_TTL_SECONDS = 120;
export function createFamilyHandoffHandler({ verifySubject, lookupMemberships, handoffTokens, allowedOrigins }) {
  const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...cors } });
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' }, {});
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } : {};
    if (request.method === 'OPTIONS') return origin ? new Response(null, { status: 204, headers: cors }) : json(404, { ok: false }, {});
    if (request.method !== 'POST') return json(405, { ok: false, reason: 'POST_REQUIRED' }, cors);
    let target;
    try { target = new URL(String((await request.json())?.target || '')); } catch { target = null; }
    // The pass is only ever handed to another approved TAKY app.
    if (!target || target.protocol !== 'https:' || !allowedOrigins.includes(target.origin))
      return json(403, { ok: false, reason: 'TARGET_ORIGIN_NOT_ALLOWED' }, cors);
    const m = String(request.headers.get('authorization') || '').trim().match(BEARER);
    if (!m) return json(401, { ok: false, reason: 'VERIFIED_BEARER_REQUIRED' }, cors);
    let sub, rows;
    try {
      sub = await verifySubject(m[1]);
      rows = await lookupMemberships({ provider: 'GOOGLE_OIDC', subject: sub });
    } catch { return json(401, { ok: false, reason: 'BEARER_IDENTITY_VERIFICATION_FAILED' }, cors); }
    if (!Array.isArray(rows) || !rows.some(r => r?.status === 'ACTIVE')) return json(401, { ok: false, reason: 'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED' }, cors);
    const out = handoffTokens.issue(sub);
    return json(200, { ok: true, handoff_token: out.token, expires_at: out.expires_at, target_origin: target.origin }, cors);
  };
}
