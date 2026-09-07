import { createSession, safeEqual, sessionCookie } from './_auth.mjs';

// Trusted-device session: authenticate once per device/browser, then keep the
// HttpOnly session for 30 days. New device, cookie clear, or expiry requires
// the access key again.
const MAX_AGE = 30 * 24 * 60 * 60;

export const handler = async event => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type':'application/json', Allow:'POST', 'Cache-Control':'no-store' },
      body: JSON.stringify({ ok:false, error:'METHOD_NOT_ALLOWED' }),
    };
  }

  const expectedKey = process.env.TAKY_APP_ACCESS_KEY;
  const sessionSecret = process.env.TAKY_SESSION_SECRET;
  if (!expectedKey || !sessionSecret) {
    return {
      statusCode: 503,
      headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' },
      body: JSON.stringify({ ok:false, error:'AUTH_ENV_NOT_CONFIGURED' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    if (!safeEqual(payload.key || '', expectedKey)) {
      return {
        statusCode: 401,
        headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' },
        body: JSON.stringify({ ok:false, error:'INVALID_ACCESS_KEY' }),
      };
    }

    const session = createSession(sessionSecret, MAX_AGE);
    return {
      statusCode: 200,
      headers: {
        'Content-Type':'application/json',
        'Cache-Control':'no-store',
        'Set-Cookie': sessionCookie(session, MAX_AGE),
      },
      body: JSON.stringify({ ok:true, expiresIn:MAX_AGE }),
    };
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' },
      body: JSON.stringify({ ok:false, error:'INVALID_REQUEST' }),
    };
  }
};
