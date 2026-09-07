const DB_NAME = 'taky-mobile-runtime';
const DB_VERSION = 1;
const STORE = 'kv';
const LEGACY_KEY = 'taky-mobile-mvp-v1';

let dbPromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openRuntimeDB() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function getValue(key) {
  const db = await openRuntimeDB();
  if (!db) return null;
  const tx = db.transaction(STORE, 'readonly');
  return requestResult(tx.objectStore(STORE).get(key));
}

export async function setValue(key, value) {
  const db = await openRuntimeDB();
  if (!db) return false;
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(value, key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadAppState(seed) {
  try {
    const stored = await getValue('appState');
    if (stored) return stored;

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      await setValue('appState', legacy);
      return legacy;
    }
  } catch (error) {
    console.warn('IndexedDB load fallback', error);
  }
  const fresh = structuredClone(seed);
  try { await setValue('appState', fresh); } catch {}
  return fresh;
}

export async function saveAppState(state) {
  try {
    await setValue('appState', state);
    return 'INDEXEDDB';
  } catch (error) {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
    return 'LOCALSTORAGE_FALLBACK';
  }
}

export async function getCanonicalCache() {
  try { return await getValue('canonicalBundle'); }
  catch { return null; }
}

export async function setCanonicalCache(bundle) {
  return setValue('canonicalBundle', bundle);
}
