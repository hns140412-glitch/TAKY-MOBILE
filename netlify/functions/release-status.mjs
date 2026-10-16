import { env as readEnv, isAuthorized } from './_auth.mjs';

// Read-only release status: GitHub source revision + Netlify published deploy.
// GET only, owner session required. Never writes, never triggers a deploy, never returns
// provider bodies, file content, URLs or credentials — only validated identifiers and times.

export const CONTRACT = 'TAKY_MOBILE_RELEASE_STATUS_V1';
const DEFAULT_REPO = 'hns140412-glitch/TAKY-MOBILE';
const DEFAULT_REF = 'main';
const TIMEOUT_MS = 8000;

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._\/-]{1,100}$/;
const SITE_RE = /^[A-Za-z0-9-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const DEPLOY_ID_RE = /^[0-9a-f]{24}$/;
const DEPLOY_STATES = new Set(['new','pending_review','accepted','enqueued','building','uploading','uploaded','preparing','prepared','processing','processed','ready','error','retrying','rejected']);

const json = (status, body, cache = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':cache },
});
const isoOrNull = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const pick = (value, re) => (typeof value === 'string' && re.test(value) ? value : null);

async function getJson(fetchImpl, url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method:'GET', headers, signal:controller.signal, redirect:'error' });
    if (!response.ok) return { error:response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH_FAILED' : `PROVIDER_HTTP_${response.status}` };
    return { body:await response.json() };
  } catch (error) {
    return { error:error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNREACHABLE' };
  } finally {
    clearTimeout(timer);
  }
}

export async function readGithubRevision({ token, repository, ref, fetchImpl }) {
  const base = { repository, ref };
  if (!token) return { ...base, status:'NOT_CONNECTED', error:'GITHUB_TOKEN_NOT_CONFIGURED' };
  if (!REPO_RE.test(repository) || !REF_RE.test(ref)) return { ...base, repository:null, ref:null, status:'NOT_CONNECTED', error:'GITHUB_TARGET_INVALID' };
  const url = `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`;
  const out = await getJson(fetchImpl, url, {
    Accept:'application/vnd.github+json',
    Authorization:`Bearer ${token}`,
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'TAKY-MOBILE',
  });
  if (out.error) return { ...base, status:'UNAVAILABLE', error:out.error };
  const sha = pick(out.body?.sha, SHA_RE);
  if (!sha) return { ...base, status:'UNAVAILABLE', error:'PROVIDER_PAYLOAD_INVALID' };
  return { ...base, status:'LIVE', sha, committedAt:isoOrNull(out.body?.commit?.committer?.date) };
}

export async function readNetlifyDeploy({ token, siteId, fetchImpl }) {
  if (!token || !siteId) return { status:'NOT_CONNECTED', error:!token ? 'NETLIFY_TOKEN_NOT_CONFIGURED' : 'NETLIFY_SITE_ID_NOT_CONFIGURED' };
  if (!SITE_RE.test(siteId)) return { status:'NOT_CONNECTED', error:'NETLIFY_SITE_ID_INVALID' };
  const out = await getJson(fetchImpl, `https://api.netlify.com/api/v1/sites/${siteId}`, {
    Accept:'application/json',
    Authorization:`Bearer ${token}`,
    'User-Agent':'TAKY-MOBILE',
  });
  if (out.error) return { status:'UNAVAILABLE', error:out.error };
  const deploy = out.body?.published_deploy;
  const deployId = pick(deploy?.id, DEPLOY_ID_RE);
  if (!deployId) return { status:'UNAVAILABLE', error:'NO_PUBLISHED_DEPLOY' };
  return {
    status:'LIVE',
    deployId,
    state:DEPLOY_STATES.has(deploy.state) ? deploy.state : 'unknown',
    commitRef:pick(deploy.commit_ref, SHA_RE),
    publishedAt:isoOrNull(deploy.published_at),
  };
}

export function compareRevisions(github, netlify) {
  if (github?.status !== 'LIVE' || netlify?.status !== 'LIVE' || !github.sha || !netlify.commitRef) return 'UNKNOWN';
  const [a, b] = [github.sha, netlify.commitRef];
  return a.startsWith(b) || b.startsWith(a) ? 'MATCH' : 'MISMATCH';
}

export function createReleaseStatusHandler({ getEnv = readEnv, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async request => {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ ok:false, error:'METHOD_NOT_ALLOWED' }), {
        status:405,
        headers:{ 'Content-Type':'application/json', Allow:'GET', 'Cache-Control':'no-store' },
      });
    }
    if (!isAuthorized(request, getEnv('TAKY_SESSION_SECRET'))) return json(401, { ok:false, error:'AUTH_REQUIRED' });

    const [github, netlify] = await Promise.all([
      readGithubRevision({
        token:getEnv('GITHUB_TOKEN'),
        repository:getEnv('TAKY_RELEASE_REPO') || DEFAULT_REPO,
        ref:getEnv('TAKY_RELEASE_REF') || DEFAULT_REF,
        fetchImpl,
      }),
      readNetlifyDeploy({
        token:getEnv('NETLIFY_AUTH_TOKEN'),
        siteId:getEnv('NETLIFY_SITE_ID') || getEnv('SITE_ID'),
        fetchImpl,
      }),
    ]);
    return json(200, {
      ok:true,
      contract:CONTRACT,
      checkedAt:new Date(now()).toISOString(),
      github,
      netlify,
      revisionMatch:compareRevisions(github, netlify),
    });
  };
}

export default createReleaseStatusHandler();
