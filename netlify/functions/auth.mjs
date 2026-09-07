import { createSession, env, safeEqual, sessionCookie } from './_auth.mjs';

const MAX_AGE = 30 * 24 * 60 * 60;

export default async request => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok:false, error:'METHOD_NOT_ALLOWED' }), {
      status:405,
      headers:{ 'Content-Type':'application/json', Allow:'POST', 'Cache-Control':'no-store' },
    });
  }

  const expectedKey = env('TAKY_APP_ACCESS_KEY');
  const sessionSecret = env('TAKY_SESSION_SECRET');
  if (!expectedKey || !sessionSecret) {
    return new Response(JSON.stringify({ ok:false, error:'AUTH_ENV_NOT_CONFIGURED' }), {
      status:503,
      headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' },
    });
  }

  try {
    const payload = await request.json();
    if (!safeEqual(payload?.key || '', expectedKey)) {
      return new Response(JSON.stringify({ ok:false, error:'INVALID_ACCESS_KEY' }), {
        status:401,
        headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' },
      });
    }

    const session = createSession(sessionSecret, MAX_AGE);
    return new Response(JSON.stringify({ ok:true, expiresIn:MAX_AGE }), {
      status:200,
      headers:{
        'Content-Type':'application/json',
        'Cache-Control':'no-store',
        'Set-Cookie':sessionCookie(session, MAX_AGE),
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok:false, error:'INVALID_REQUEST' }), {
      status:400,
      headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' },
    });
  }
};
