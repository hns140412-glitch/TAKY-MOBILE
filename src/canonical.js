import { getCanonicalCache, setCanonicalCache } from './db.js';

const ENDPOINT = '/.netlify/functions/canonical';
const CACHE_TTL_MS = 30 * 60 * 1000;

function isFresh(bundle) {
  if (!bundle?.fetchedAt) return false;
  const age = Date.now() - Date.parse(bundle.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

export async function loadCanonical({ force = false } = {}) {
  const cached = await getCanonicalCache();

  if (!force && cached && isFresh(cached)) {
    return { source: 'CACHE_FRESH', bundle: cached };
  }

  if (!navigator.onLine) {
    return cached
      ? { source: 'CACHE_OFFLINE', bundle: cached }
      : { source: 'UNAVAILABLE_OFFLINE', bundle: null };
  }

  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`canonical gateway ${response.status}`);
    const bundle = await response.json();
    if (!bundle?.ok || !Array.isArray(bundle.files)) throw new Error('invalid canonical bundle');
    await setCanonicalCache(bundle);
    return { source: 'REMOTE_VERIFIED', bundle };
  } catch (error) {
    console.warn('Canonical refresh failed', error);
    return cached
      ? { source: 'CACHE_FALLBACK', bundle: cached, error: String(error) }
      : { source: 'UNAVAILABLE', bundle: null, error: String(error) };
  }
}

export function canonicalSummary(result) {
  const bundle = result?.bundle;
  if (!bundle) return {
    label: 'Canonical: unavailable',
    detail: result?.source || 'UNAVAILABLE',
    verified: false,
  };
  const root = bundle.files.find(file => file.path === 'TAKY.md');
  const shortSha = root?.sha ? root.sha.slice(0, 8) : 'unknown';
  return {
    label: `Canonical: ${result.source}`,
    detail: `${bundle.repository || 'TAKY'} @ ${shortSha}`,
    verified: result.source === 'REMOTE_VERIFIED',
  };
}
