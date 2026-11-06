// TAKY central family + learning API, same origin as TAKY Mobile.
// Routes: /api/family/session, /api/family/member-profile, /api/family/character-profile,
// /api/family/character-asset, /api/family/user-data, /api/learning/evidence, /api/learning/decision.
import { centralFor, runNodeBridge, notConfigured } from './_central_host.mjs';

export default async function central(request) {
  const origin = new URL(request.url).origin;
  const c = centralFor(origin);
  if (!c.ok) return notConfigured(c.missing);
  return runNodeBridge(c.host.handler, request);
}

export const config = {
  path: ['/api/family/session', '/api/family/member-profile', '/api/family/character-profile', '/api/family/character-asset',
    '/api/family/user-data', '/api/learning/evidence', '/api/learning/decision'],
};
