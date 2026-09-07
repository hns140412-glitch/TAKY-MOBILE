import crypto from 'node:crypto';

const COOKIE_NAME = 'taky_session';

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        return index < 0
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function env(name) {
  return globalThis.Netlify?.env?.get?.(name) ?? process.env[name];
}

export function safeEqual(left = '', right = '') {
  const a = crypto.createHash('sha256').update(String(left)).digest();
  const b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createSession(secret, maxAgeSeconds = 86400) {
  const expires = Date.now() + maxAgeSeconds * 1000;
  const payload = String(expires);
  return `${payload}.${sign(payload, secret)}`;
}

export function sessionCookie(session, maxAgeSeconds = 86400) {
  const secure = env('TAKY_COOKIE_SECURE') !== 'false';
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(session)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function isAuthorized(request, secret) {
  if (!secret) return false;
  const session = parseCookies(request.headers.get('cookie') || '')[COOKIE_NAME];
  if (!session) return false;
  const [payload, signature] = session.split('.');
  const expires = Number(payload);
  if (!payload || !signature || !Number.isFinite(expires) || Date.now() >= expires) return false;
  return safeEqual(signature, sign(payload, secret));
}
