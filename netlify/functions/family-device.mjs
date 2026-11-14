// /api/family/device — keep a device signed in to the TAKY family until it signs out.
import googleAuthLibrary from 'google-auth-library';
import { readCentralConfig, notConfigured } from './_central_host.mjs';
import { createDriveClient, createDriveMembershipProvider } from './_central_drive.mjs';
import { createDeviceTokens, deviceAwareOAuthClient, subjectVerifier, createFamilyDeviceHandler, DEVICE_PATH } from './_family_device.mjs';

export function familyDeviceFor({ config = readCentralConfig(), fetchImpl, oauth2Client, now } = {}) {
  if (config.missing.length) return { ok: false, missing: config.missing };
  const drive = createDriveClient({ ...config.drive, ...(fetchImpl ? { fetchImpl } : {}) });
  const tokens = createDeviceTokens(config.ticketSecret, now ? { now } : {});
  const client = deviceAwareOAuthClient(oauth2Client || new googleAuthLibrary.OAuth2Client(), tokens, now ? { now } : {});
  return { ok: true, tokens, handle: createFamilyDeviceHandler({ verifySubject: subjectVerifier(client, config.clientIds),
    lookupMemberships: createDriveMembershipProvider({ drive, folderId: config.folderId }), tokens, allowedOrigins: config.allowedOrigins }) };
}

export default async request => {
  const c = familyDeviceFor();
  return c.ok ? c.handle(request) : notConfigured(c.missing);
};
export const config = { path: DEVICE_PATH };
