// /api/family/handoff — a signed-in TAKY app (Ready) gets a 2-minute pass to open another approved TAKY app signed in.
import googleAuthLibrary from 'google-auth-library';
import { readCentralConfig, notConfigured } from './_central_host.mjs';
import { createDriveClient, createDriveMembershipProvider } from './_central_drive.mjs';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier, createFamilyHandoffHandler, HANDOFF_TTL_SECONDS } from './_family_device.mjs';

export function familyHandoffFor({ config = readCentralConfig(), fetchImpl, oauth2Client, now } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  const opts = now ? { now } : {};
  const tokens = createDeviceTokens(config.ticketSecret, opts);
  const handoffTokens = createDeviceTokens(config.ticketSecret, { ...opts, ttlSeconds: HANDOFF_TTL_SECONDS });
  const client = deviceAwareOAuthClient(oauth2Client || new googleAuthLibrary.OAuth2Client(), tokens, opts);
  return { ok: true, handle: createFamilyHandoffHandler({ verifySubject: subjectVerifier(client, config.clientIds),
    lookupMemberships: createDriveMembershipProvider({ drive, folderId: config.folderId }), handoffTokens, allowedOrigins: config.allowedOrigins }) };
}

export default async request => {
  const c = familyHandoffFor();
  return c.ok ? c.handle(request) : notConfigured(c.missing);
};
// Netlify reads this statically at build time: it must be a string literal, not an imported constant.
export const config = { path: '/api/family/handoff' };
