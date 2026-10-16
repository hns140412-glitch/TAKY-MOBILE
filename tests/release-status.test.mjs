import assert from 'node:assert/strict';
import { createSession } from '../netlify/functions/_auth.mjs';
import { createReleaseStatusHandler, CONTRACT } from '../netlify/functions/release-status.mjs';
import { loadReleaseStatus, RELEASE_ENDPOINT, RELEASE_STALE_MS } from '../src/release-status.mjs';
import { deriveOperations, renderOperationsConsole } from '../src/admin-status.mjs';

// No network: every provider call goes through an injected fetch that records the request.
const SECRET = 'test-session-secret';
const GH_TOKEN = 'ghp_TEST_SECRET_VALUE', NF_TOKEN = 'nfp_TEST_SECRET_VALUE';
const NOW = Date.parse('2026-10-12T03:00:00Z');
const SHA = '9bcb7d9aa11bb22cc33dd44ee55ff66778899001';
const DEPLOY = '6a9ea85873979b00083c30cf';
const fullEnv = { TAKY_SESSION_SECRET:SECRET, GITHUB_TOKEN:GH_TOKEN, NETLIFY_AUTH_TOKEN:NF_TOKEN, NETLIFY_SITE_ID:'site-1234' };
const envOf = vars => name => vars[name];
const req = (cookie, method = 'GET') => new Request('https://taky.test/.netlify/functions/release-status', { method, headers:cookie ? { cookie } : {} });
const authed = () => req(`taky_session=${encodeURIComponent(createSession(SECRET))}`);
const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json' } });

function providerFetch(overrides = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url:String(url), init });
    assert.equal(init.method, 'GET', 'providers are only read');
    const u = new URL(url);
    if (u.host === 'api.github.com') return overrides.github?.() ?? jsonRes(200, {
      sha:SHA, commit:{ committer:{ date:'2026-10-11T15:00:00Z' }, message:'PRIVATE COMMIT MESSAGE' }, files:[{ patch:'PRIVATE PATCH' }],
    });
    if (u.host === 'api.netlify.com') return overrides.netlify?.() ?? jsonRes(200, {
      url:'https://evil.example', admin_url:'https://evil.example/admin',
      published_deploy:{ id:DEPLOY, state:'ready', commit_ref:'7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9', published_at:'2026-09-07T12:04:53.141Z', deploy_ssl_url:'https://evil.example', title:'<script>x</script>' },
    });
    throw new Error(`unexpected host ${u.host}`);
  };
  fn.calls = calls;
  return fn;
}
const run = async (vars, fetchImpl, request = authed(), at = NOW) => {
  const res = await createReleaseStatusHandler({ getEnv:envOf(vars), fetchImpl, now:() => at })(request);
  const text = await res.text();
  return { status:res.status, text, body:JSON.parse(text), cache:res.headers.get('cache-control') };
};
const noSecrets = text => {
  for (const s of [GH_TOKEN, NF_TOKEN, SECRET, 'PRIVATE', 'evil.example', '<script>']) assert.ok(!text.includes(s), `leaked ${s}`);
};
const results = {};

// 1. Success: both providers LIVE, only validated identifiers returned.
{
  const f = providerFetch();
  const r = await run(fullEnv, f);
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'no-store');
  assert.equal(r.body.contract, CONTRACT);
  assert.equal(r.body.checkedAt, new Date(NOW).toISOString());
  assert.deepEqual(r.body.github, { repository:'hns140412-glitch/TAKY-MOBILE', ref:'main', status:'LIVE', sha:SHA, committedAt:'2026-10-11T15:00:00.000Z' });
  assert.deepEqual(r.body.netlify, { status:'LIVE', deployId:DEPLOY, state:'ready', commitRef:'7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9', publishedAt:'2026-09-07T12:04:53.141Z' });
  assert.equal(r.body.revisionMatch, 'MISMATCH', 'old deploy is not the current main');
  noSecrets(r.text);
  assert.deepEqual(f.calls.map(c => c.url).sort(), [
    'https://api.github.com/repos/hns140412-glitch/TAKY-MOBILE/commits/main',
    'https://api.netlify.com/api/v1/sites/site-1234',
  ]);
  assert.ok(f.calls.every(c => c.init.redirect === 'error' && c.init.signal), 'no redirects, bounded by timeout');
  results.success = 'PASS';
}

// 2. Unauthorized: no session / forged session / wrong method never reach providers.
{
  const f = providerFetch();
  for (const request of [req(null), req('taky_session=9999999999999.forged'), req(`taky_session=${createSession('other-secret')}`)]) {
    const r = await run(fullEnv, f, request);
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { ok:false, error:'AUTH_REQUIRED' });
  }
  const expired = `${NOW - 1000}`;
  assert.equal((await run(fullEnv, f, req(`taky_session=${expired}.x`))).status, 401);
  assert.equal((await run(fullEnv, f, req(`taky_session=${encodeURIComponent(createSession(SECRET))}`, 'POST'))).status, 405);
  assert.equal((await run({ ...fullEnv, TAKY_SESSION_SECRET:undefined }, f)).status, 401, 'missing session secret fails closed');
  assert.equal(f.calls.length, 0);
  results.unauthorized = 'PASS';
}

// 3. Missing credentials: explicit NOT_CONNECTED, no provider call, no fake LIVE.
{
  const f = providerFetch();
  const r = await run({ TAKY_SESSION_SECRET:SECRET }, f);
  assert.equal(r.status, 200);
  assert.equal(r.body.github.status, 'NOT_CONNECTED');
  assert.equal(r.body.github.error, 'GITHUB_TOKEN_NOT_CONFIGURED');
  assert.equal(r.body.netlify.status, 'NOT_CONNECTED');
  assert.equal(r.body.netlify.error, 'NETLIFY_TOKEN_NOT_CONFIGURED');
  assert.equal(r.body.revisionMatch, 'UNKNOWN');
  const r2 = await run({ ...fullEnv, NETLIFY_SITE_ID:undefined }, f);
  assert.equal(r2.body.netlify.status, 'NOT_CONNECTED');
  assert.equal(r2.body.netlify.error, 'NETLIFY_SITE_ID_NOT_CONFIGURED');
  const r3 = await run({ ...fullEnv, NETLIFY_SITE_ID:'../../accounts', TAKY_RELEASE_REPO:'a/b/../c' }, f);
  assert.equal(r3.body.netlify.error, 'NETLIFY_SITE_ID_INVALID');
  assert.equal(r3.body.github.error, 'GITHUB_TARGET_INVALID');
  assert.deepEqual(f.calls.map(c => new URL(c.url).host), ['api.github.com'], 'unconfigured or invalid targets are never requested');
  results.missingCredentials = 'PASS';
}

// 4. Provider error: status codes, auth failure, timeout/network, bad payload -> UNAVAILABLE with code only.
{
  const cases = [
    [{ github:() => jsonRes(500, { message:'PRIVATE stack' }), netlify:() => jsonRes(401, { message:'PRIVATE token' }) }, 'PROVIDER_HTTP_500', 'PROVIDER_AUTH_FAILED'],
    [{ github:() => { throw new TypeError('fetch failed PRIVATE'); }, netlify:() => { const e = new Error('x'); e.name = 'AbortError'; throw e; } }, 'PROVIDER_UNREACHABLE', 'PROVIDER_TIMEOUT'],
    [{ github:() => jsonRes(200, { sha:'not-a-sha PRIVATE' }), netlify:() => jsonRes(200, { published_deploy:null }) }, 'PROVIDER_PAYLOAD_INVALID', 'NO_PUBLISHED_DEPLOY'],
  ];
  for (const [over, gErr, nErr] of cases) {
    const r = await run(fullEnv, providerFetch(over));
    assert.equal(r.status, 200);
    assert.equal(r.body.github.status, 'UNAVAILABLE');
    assert.equal(r.body.github.error, gErr);
    assert.equal(r.body.netlify.status, 'UNAVAILABLE');
    assert.equal(r.body.netlify.error, nErr);
    assert.equal(r.body.revisionMatch, 'UNKNOWN');
    noSecrets(r.text);
  }
  results.providerError = 'PASS';
}

// Client: gateway -> LIVE_VERIFIED / HISTORICAL / AUTH_REQUIRED / UNAVAILABLE.
const memStore = () => { const m = new Map(); return { getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, String(v)) }; };
const gatewayBody = async checkedAtMs => (await run(fullEnv, providerFetch(), authed(), checkedAtMs)).body;
const clientFetch = response => async url => { assert.equal(url, RELEASE_ENDPOINT); if (response instanceof Error) throw response; return response; };
const ops = release => deriveOperations({ apps:[], canonical:null, release, works:[], traces:[] });
const opsChk = (model, id) => model.lanes.find(l => l.id === 'release').checks.find(c => c.id === id);

// 5. Client success -> LIVE_VERIFIED; console shows VERIFIED but flags old deploy != main.
{
  const store = memStore();
  const live = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(200, await gatewayBody(NOW))), storage:store, now:() => NOW + 1000 });
  assert.equal(live.state, 'LIVE_VERIFIED');
  const m = ops(live);
  assert.equal(opsChk(m, 'github-revision').state, 'VERIFIED');
  assert.equal(opsChk(m, 'netlify-deploy').state, 'VERIFIED');
  assert.match(opsChk(m, 'netlify-deploy').detail, /main 최신과 다름/);
  assert.equal(opsChk(m, 'netlify-deploy').attention, true);
  assert.match(renderOperationsConsole(m), /data-evidence="LIVE_VERIFIED"/);
  results.clientLive = 'PASS';

  // 6. Stale: a response older than the window is HISTORICAL, never VERIFIED.
  const stale = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(200, await gatewayBody(NOW))), storage:memStore(), now:() => NOW + RELEASE_STALE_MS + 1 });
  assert.equal(stale.state, 'HISTORICAL');
  assert.equal(stale.reason, 'STALE_RESPONSE');
  const sm = ops(stale);
  assert.equal(opsChk(sm, 'netlify-deploy').state, 'UNVERIFIED');
  assert.match(opsChk(sm, 'netlify-deploy').detail, /과거 조회 .* 현재 상태로 단정하지 않음/);
  assert.equal(opsChk(sm, 'github-revision').state, 'UNVERIFIED');
  // Future-dated (clock skew) is also not trusted as live.
  assert.equal((await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(200, await gatewayBody(NOW + 3_600_000))), storage:memStore(), now:() => NOW })).state, 'HISTORICAL');

  // 7. Later failure reuses the stored result only as HISTORICAL.
  const after = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(502, {})), storage:store, now:() => NOW + 2000 });
  assert.equal(after.state, 'HISTORICAL');
  assert.equal(after.reason, 'GATEWAY_HTTP_502');
  assert.ok(ops(after).lanes.find(l => l.id === 'release').checks.every(c => c.state !== 'VERIFIED' || c.id === 'canonical'));
  const authAfter = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(401, { ok:false })), storage:store, now:() => NOW + 2000 });
  assert.equal(authAfter.state, 'HISTORICAL');
  assert.equal(authAfter.authRequired, true);
  assert.equal(opsChk(ops(authAfter), 'netlify-deploy').action, 'auth');
  results.stale = 'PASS';
}

// 8. Client unauthorized / unavailable / invalid payload with no history.
{
  const auth = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(401, { ok:false, error:'AUTH_REQUIRED' })), storage:memStore() });
  assert.equal(auth.state, 'AUTH_REQUIRED');
  assert.equal(opsChk(ops(auth), 'github-revision').state, 'UNVERIFIED');
  assert.equal(opsChk(ops(auth), 'netlify-deploy').action, 'auth');
  const down = await loadReleaseStatus({ fetchImpl:clientFetch(new TypeError('offline')), storage:memStore() });
  assert.equal(down.state, 'UNAVAILABLE');
  assert.equal(opsChk(ops(down), 'github-revision').state, 'NOT_CONNECTED');
  assert.equal(opsChk(ops(down), 'netlify-deploy').state, 'UNVERIFIED');
  assert.match(opsChk(ops(down), 'netlify-deploy').detail, /기록 증거: 6a9ea858 .* 실시간 상태 아님/);
  for (const body of [{ ok:true }, { ok:true, contract:CONTRACT, checkedAt:'nope' }, '<html>']) {
    const r = await loadReleaseStatus({ fetchImpl:clientFetch(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status:200 })), storage:memStore() });
    assert.equal(r.state, 'UNAVAILABLE');
    assert.equal(r.reason, 'GATEWAY_PAYLOAD_INVALID');
  }
  results.clientAuthUnavailable = 'PASS';
}

// 9. Missing Netlify credentials surface as NOT_CONNECTED even inside a live answer; payload text is re-sanitized.
{
  const body = (await run({ TAKY_SESSION_SECRET:SECRET, GITHUB_TOKEN:GH_TOKEN }, providerFetch())).body;
  const r = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(200, body)), storage:memStore(), now:() => NOW });
  assert.equal(r.state, 'LIVE_VERIFIED');
  assert.equal(opsChk(ops(r), 'github-revision').state, 'VERIFIED');
  assert.equal(opsChk(ops(r), 'netlify-deploy').state, 'NOT_CONNECTED');
  assert.match(opsChk(ops(r), 'netlify-deploy').detail, /NETLIFY_TOKEN_NOT_CONFIGURED/);
  const hostile = { ...body, github:{ ...body.github, repository:'<img src=x onerror=1>', error:'<b>x</b>' }, netlify:{ status:'LIVE', deployId:'<script>', state:'<i>', commitRef:'zz' } };
  const h = await loadReleaseStatus({ fetchImpl:clientFetch(jsonRes(200, hostile)), storage:memStore(), now:() => NOW });
  const html = renderOperationsConsole(ops(h));
  assert.ok(!/<img|<script|<b>x|<i>/.test(html));
  // No release snapshot keeps the previous recorded-evidence behaviour.
  assert.equal(opsChk(ops(undefined), 'netlify-deploy').state, 'UNVERIFIED');
  results.notConnected = 'PASS';
}

console.log(JSON.stringify({ pass:true, contract:'TAKY_MOBILE_RELEASE_STATUS_TEST_V1', results }));
