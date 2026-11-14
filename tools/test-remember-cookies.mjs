// Admin key + app access key: asked once per device, renewed on use (~400 days), sign-out clears. No network.
import assert from 'node:assert/strict';
process.env.TAKY_ADMIN_ACCESS_KEY = 'admin-key-for-test'; process.env.TAKY_ADMIN_SESSION_SECRET = 'a'.repeat(40);
process.env.TAKY_APP_ACCESS_KEY = 'app-key-for-test'; process.env.TAKY_SESSION_SECRET = 'b'.repeat(40);
const admin = (await import('../netlify/functions/admin-session.mjs')).default;
const auth = (await import('../netlify/functions/auth.mjs')).default;
const { isAuthorized } = await import('../netlify/functions/_auth.mjs');
const O = 'https://taky-mobile.example';
const cookieOf = r => (r.headers.get('set-cookie') || '').split(';')[0];
const maxAge = r => Number(/Max-Age=(\d+)/.exec(r.headers.get('set-cookie') || '')?.[1]);
const DAYS400 = 400 * 86400;

let r = await admin(new Request(O + '/.netlify/functions/admin-session', { method: 'POST', headers: { Origin: O }, body: JSON.stringify({ key: 'admin-key-for-test' }) }));
assert.equal(r.status, 200); assert.equal(maxAge(r), DAYS400);
const c1 = cookieOf(r);
r = await admin(new Request(O + '/.netlify/functions/admin-session', { headers: { cookie: c1 } }));
assert.equal((await r.json()).authorized, true); assert.equal(maxAge(r), DAYS400, 'GET renews the admin session');
assert.notEqual(cookieOf(r), c1);
r = await admin(new Request(O + '/.netlify/functions/admin-session', { headers: {} }));
assert.equal((await r.json()).authorized, false); assert.equal(r.headers.get('set-cookie'), null, 'no cookie for a signed-out device');
r = await admin(new Request(O + '/.netlify/functions/admin-session', { method: 'DELETE', headers: { Origin: O, cookie: c1 } }));
assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
console.log('PASS admin key: once per device, rolling 400 days, sign-out clears');

r = await auth(new Request(O + '/.netlify/functions/auth', { method: 'POST', body: JSON.stringify({ key: 'app-key-for-test' }) }));
assert.equal(r.status, 200); assert.equal(maxAge(r), DAYS400);
assert.equal(isAuthorized(new Request(O, { headers: { cookie: cookieOf(r) } }), process.env.TAKY_SESSION_SECRET), true);
r = await auth(new Request(O + '/.netlify/functions/auth', { method: 'POST', body: JSON.stringify({ key: 'wrong' }) }));
assert.equal(r.status, 401);
console.log('PASS app access key: 400-day session (renewed by each canonical load)');
console.log('remember cookies: 2 passed');
