// Client side of the read-only release-status gateway.
// LIVE_VERIFIED = gateway answered in this check and the answer is fresh /
// HISTORICAL = an earlier answer (stale or reused after failure); never the current deployment /
// AUTH_REQUIRED = owner session missing / UNAVAILABLE = gateway unreachable or invalid, nothing to show.

export const RELEASE_ENDPOINT = '/.netlify/functions/release-status';
export const RELEASE_STATES = Object.freeze(['LIVE_VERIFIED','HISTORICAL','AUTH_REQUIRED','UNAVAILABLE']);
export const RELEASE_STALE_MS = 10 * 60 * 1000;
const STORE_KEY = 'taky_release_status_last';
const CONTRACT = 'TAKY_MOBILE_RELEASE_STATUS_V1';
const PROVIDER_STATUS = new Set(['LIVE','NOT_CONNECTED','UNAVAILABLE']);

const str = (v, re) => (typeof v === 'string' && re.test(v) ? v : null);
const iso = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const ERR = /^[A-Z0-9_]{1,64}$/;

// Re-validate the gateway payload; the client never trusts shape or renders free text from it.
export function sanitizeReleasePayload(body) {
  if (!body || body.ok !== true || body.contract !== CONTRACT) return null;
  const checkedAt = iso(body.checkedAt);
  if (!checkedAt) return null;
  const g = body.github || {}, n = body.netlify || {};
  return {
    checkedAt,
    github:{
      status:PROVIDER_STATUS.has(g.status) ? g.status : 'UNAVAILABLE',
      repository:str(g.repository, /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
      ref:str(g.ref, /^[A-Za-z0-9._\/-]{1,100}$/),
      sha:str(g.sha, /^[0-9a-f]{7,40}$/),
      committedAt:iso(g.committedAt),
      error:str(g.error, ERR),
    },
    netlify:{
      status:PROVIDER_STATUS.has(n.status) ? n.status : 'UNAVAILABLE',
      deployId:str(n.deployId, /^[0-9a-f]{24}$/),
      state:str(n.state, /^[a-z_]{1,20}$/),
      commitRef:str(n.commitRef, /^[0-9a-f]{7,40}$/),
      publishedAt:iso(n.publishedAt),
      error:str(n.error, ERR),
    },
    revisionMatch:['MATCH','MISMATCH'].includes(body.revisionMatch) ? body.revisionMatch : 'UNKNOWN',
  };
}

export function isStale(data, now = Date.now()) {
  const age = now - Date.parse(data?.checkedAt || '');
  return !Number.isFinite(age) || age < -60_000 || age >= RELEASE_STALE_MS;
}

function readStored(storage) {
  try { return sanitizeReleasePayload(JSON.parse(storage?.getItem(STORE_KEY) || 'null')); } catch { return null; }
}
function writeStored(storage, body) {
  try { storage?.setItem(STORE_KEY, JSON.stringify(body)); } catch { /* storage optional */ }
}

// fetchImpl/storage/now are injected so tests never touch the network.
export async function loadReleaseStatus({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  const previous = readStored(storage);
  const historical = reason => previous
    ? { state:'HISTORICAL', data:previous, reason }
    : { state:reason === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'UNAVAILABLE', data:null, reason };
  let response;
  try {
    response = await fetchImpl(RELEASE_ENDPOINT, { headers:{ Accept:'application/json' }, credentials:'same-origin', cache:'no-store' });
  } catch {
    return historical('GATEWAY_UNREACHABLE');
  }
  if (response.status === 401) {
    // Previous evidence may still be shown, but only labelled historical; auth is the action.
    return { ...historical('AUTH_REQUIRED'), authRequired:true };
  }
  if (!response.ok) return historical(`GATEWAY_HTTP_${response.status}`);
  let raw;
  try { raw = await response.json(); } catch { return historical('GATEWAY_PAYLOAD_INVALID'); }
  const data = sanitizeReleasePayload(raw);
  if (!data) return historical('GATEWAY_PAYLOAD_INVALID');
  writeStored(storage, raw);
  if (isStale(data, now())) return { state:'HISTORICAL', data, reason:'STALE_RESPONSE' };
  return { state:'LIVE_VERIFIED', data, reason:null };
}
