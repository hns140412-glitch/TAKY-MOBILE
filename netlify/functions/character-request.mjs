// /api/family/character-request — no-cost character making: child photo request -> parent makes and approves.
import googleAuthLibrary from 'google-auth-library';
import { readCentralConfig, notConfigured } from './_central_host.mjs';
import { createDriveClient, createDriveMembershipProvider } from './_central_drive.mjs';
import { createCharacterRequestStore, createCharacterRequestHandler } from './_character_request.mjs';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier } from './_family_device.mjs';

export function characterRequestFor(origin, { config = readCentralConfig(), fetchImpl, oauth2Client } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  const client = deviceAwareOAuthClient(oauth2Client || new googleAuthLibrary.OAuth2Client(), createDeviceTokens(config.ticketSecret));
  const verifyIdToken = subjectVerifier(client, config.clientIds);
  const store = createCharacterRequestStore({ drive, folderId: config.folderId, secret: config.ticketSecret, publicOrigin: origin });
  return { ok: true, store, handle: createCharacterRequestHandler({ verifyIdToken, lookupMemberships: createDriveMembershipProvider({ drive, folderId: config.folderId }), store, allowedOrigins: config.allowedOrigins }) };
}

export default async request => {
  const c = characterRequestFor(new URL(request.url).origin);
  return c.ok ? c.handle(request) : notConfigured(c.missing);
};
export const config = { path: '/api/family/character-request' };
