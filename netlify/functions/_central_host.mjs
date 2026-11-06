// Assembles the TAKY central host (vendored TAKY LEARNING/transport, unchanged) for
// Netlify Functions. Replaces the PC pilot C:\TAKY_CENTRAL_LOCAL\server.cjs + tunnel.
import { Readable } from 'node:stream';
import googleAuthLibrary from 'google-auth-library';
import { getStore } from '@netlify/blobs';
import Host from '../central/LEARNING/transport/central-learning-production-host.js';
import { createDriveClient, createDriveJsonStore, createRoutingStore, createDriveMembershipProvider, createDriveCharacterObjectStore } from './_central_drive.mjs';

export const LIVE_STORE_NAME = 'taky-central-live-v1';
const readEnv = name => String(globalThis.Netlify?.env?.get?.(name) ?? process.env[name] ?? '').trim();
const list = v => v.split(',').map(s => s.trim()).filter(Boolean);

export function readCentralConfig(env = readEnv) {
  const c = {
    clientIds: list(env('TAKY_GOOGLE_WEB_CLIENT_ID')),
    allowedOrigins: list(env('TAKY_CENTRAL_ALLOWED_ORIGINS')),
    drive: { clientId: env('TAKY_DRIVE_OAUTH_CLIENT_ID'), clientSecret: env('TAKY_DRIVE_OAUTH_CLIENT_SECRET'), refreshToken: env('TAKY_DRIVE_OAUTH_REFRESH_TOKEN') },
    folderId: env('TAKY_FAMILY_DRIVE_FOLDER_ID'),
    ticketSecret: env('TAKY_CENTRAL_TICKET_SECRET'),
  };
  const missing = [];
  if (!c.clientIds.length) missing.push('TAKY_GOOGLE_WEB_CLIENT_ID');
  if (!c.allowedOrigins.length) missing.push('TAKY_CENTRAL_ALLOWED_ORIGINS');
  for (const [k, v] of Object.entries({ TAKY_DRIVE_OAUTH_CLIENT_ID: c.drive.clientId, TAKY_DRIVE_OAUTH_CLIENT_SECRET: c.drive.clientSecret, TAKY_DRIVE_OAUTH_REFRESH_TOKEN: c.drive.refreshToken, TAKY_FAMILY_DRIVE_FOLDER_ID: c.folderId }))
    if (!v) missing.push(k);
  if (c.ticketSecret.length < 32) missing.push('TAKY_CENTRAL_TICKET_SECRET');
  return { ...c, missing };
}

const hosts = new Map();
// deps are injectable for tests (fetchImpl for Drive, oauth2Client, liveStore).
export function centralFor(origin, { config = readCentralConfig(), fetchImpl, oauth2Client, liveStore } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const cacheKey = origin + '|' + (liveStore ? 'test' : 'prod');
  if (!fetchImpl && hosts.has(cacheKey)) return hosts.get(cacheKey);
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  // Lazy: Blobs is opened on first use, so a missing Blobs context fails inside the endpoint (503), not at import.
  let blobs = null;
  const lazy = () => (blobs ||= getStore(LIVE_STORE_NAME, { consistency: 'strong' }));
  const live = liveStore || { getWithMetadata: (k, o) => lazy().getWithMetadata(k, o), setJSON: (k, v, o) => lazy().setJSON(k, v, o) };
  const objectStore = createDriveCharacterObjectStore({ drive, folderId: config.folderId, secret: config.ticketSecret, publicOrigin: origin });
  const host = Host.create({
    clientIds: config.clientIds,
    googleAuthLibrary, oauth2Client,
    lookupMemberships: createDriveMembershipProvider({ drive, folderId: config.folderId }),
    store: createRoutingStore({ driveStore: createDriveJsonStore({ drive, folderId: config.folderId }), liveStore: live }),
    characterAssetObjectStore: objectStore,
    // Same fail-closed learning stubs as the PC pilot: no browser claim becomes real evidence.
    verifySpecialistEvidence: async () => ({ ok: false }),
    resolveIndexedEvidence: async () => null,
    independentIndexOwnerVerifier: () => null,
    allowedOrigins: config.allowedOrigins,
  });
  const entry = { ok: true, host, objectStore, allowedOrigins: config.allowedOrigins };
  if (!fetchImpl) hosts.set(cacheKey, entry);
  return entry;
}

// Fetch Request -> the vendored Node bridge (req/res) -> Fetch Response.
export async function runNodeBridge(handler, request) {
  const u = new URL(request.url);
  const body = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS' ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const req = Readable.from(body.length ? [body] : []);
  req.method = request.method;
  req.url = u.pathname + u.search;
  req.headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  return new Promise(resolve => {
    let status = 500, headers = {}, sent = false;
    const res = {
      get headersSent() { return sent; },
      writeHead(s, h = {}) { status = s; headers = { ...headers, ...h }; sent = true; return res; },
      setHeader(k, v) { headers[k] = v; },
      end(chunk) { resolve(new Response(status === 204 ? null : (chunk ?? ''), { status, headers })); },
    };
    Promise.resolve(handler(req, res)).catch(() => resolve(new Response(JSON.stringify({ ok: false, reason: 'CENTRAL_HOST_FAILED' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })));
  });
}

export const notConfigured = missing => new Response(JSON.stringify({ ok: false, reason: 'CENTRAL_NOT_CONFIGURED', missing }), {
  status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0' } });
