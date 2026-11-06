// One-time setup for the TAKY central family Drive (run on a PC with a browser).
// 1) Google consent (scope drive.file only) for the family Drive account (default siezeall@gmail.com,
//    the same account SAVEY's family-finance sheets use), with the existing Desktop OAuth client.
// 2) Creates folder TAKY_FAMILY_CENTRAL (or reuses --folder) and uploads members.json once.
// 3) Writes the server env to the taky-mobile Netlify site with the netlify CLI (secrets never printed).
// Usage:
//   node tools/bootstrap-central-drive.mjs --client-env "D:\Git PWA\SAVEY\.env.local" \
//     --members C:\TAKY_CENTRAL_LOCAL\members.json [--folder <id>] [--site taky-mobile] [--no-netlify]
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createDriveClient } from '../netlify/functions/_central_drive.mjs';

const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const flag = n => process.argv.includes('--' + n);
const envFile = arg('client-env');
const fileEnv = envFile ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])) : {};
const clientId = process.env.TAKY_DRIVE_OAUTH_CLIENT_ID || fileEnv.GOOGLE_CLIENT_ID;
const clientSecret = process.env.TAKY_DRIVE_OAUTH_CLIENT_SECRET || fileEnv.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) { console.error('DESKTOP_OAUTH_CLIENT_MISSING (pass --client-env with GOOGLE_CLIENT_ID/SECRET)'); process.exit(2); }
const account = arg('account', 'siezeall@gmail.com');
const site = arg('site', 'taky-mobile');

const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');
const refreshToken = await new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
    if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) { res.writeHead(400); res.end('state mismatch'); return reject(Error('OAUTH_STATE_MISMATCH')); }
    const redirect = `http://127.0.0.1:${server.address().port}/callback`;
    const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: u.searchParams.get('code'), client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }) })).json();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<p>TAKY 가족 Drive 연결 완료. 이 창은 닫아도 됩니다.</p>');
    server.close();
    tok.refresh_token ? resolve(tok.refresh_token) : reject(Error('NO_REFRESH_TOKEN ' + (tok.error || '')));
  });
  server.listen(0, '127.0.0.1', () => {
    const redirect = `http://127.0.0.1:${server.address().port}/callback`;
    const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256', login_hint: account });
    fs.writeFileSync(new URL('./.central-drive-consent-url.txt', import.meta.url), auth);
    console.log('CONSENT_URL ' + auth);
  });
});
console.log('REFRESH_TOKEN_RECEIVED (not printed)');

const drive = createDriveClient({ clientId, clientSecret, refreshToken });
let folderId = arg('folder');
if (!folderId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + await drive.token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TAKY_FAMILY_CENTRAL', mimeType: 'application/vnd.google-apps.folder', appProperties: { taky_kind: 'family-central-root' } }) });
  const made = await r.json();
  folderId = made.id;
  if (!folderId) throw Error('FOLDER_CREATE_FAILED ' + r.status + ' ' + (made.error?.message || '').slice(0, 300));
}
console.log('FOLDER ' + folderId);
const membersPath = arg('members');
if (membersPath) {
  const rows = JSON.parse(fs.readFileSync(membersPath, 'utf8'));
  if (!Array.isArray(rows)) throw Error('MEMBERS_NOT_ARRAY');
  const existing = (await drive.find({ parent: folderId, name: 'members.json' }))[0];
  const bytes = Buffer.from(JSON.stringify(rows, null, 2), 'utf8');
  existing ? await drive.update(existing.id, { bytes }) : await drive.create({ parent: folderId, name: 'members.json', bytes, appProperties: { taky_kind: 'member-registry' } });
  const back = JSON.parse(await drive.readText((await drive.find({ parent: folderId, name: 'members.json' }))[0].id));
  if (back.length !== rows.length) throw Error('MEMBERS_READBACK_MISMATCH');
  console.log('MEMBERS_UPLOADED rows=' + rows.length + ' readback=OK');
}
if (!flag('no-netlify')) {
  // Run from a folder linked to the taky-mobile site (.netlify/state.json). No shell: values are passed verbatim.
  const state = JSON.parse(fs.readFileSync('.netlify/state.json', 'utf8'));
  if (!state.siteId) throw Error('RUN_FROM_A_FOLDER_LINKED_TO_' + site);
  const cli = path.join(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { shell: process.platform === 'win32' }).toString().trim(), 'netlify-cli', 'bin', 'run.js');
  const set = (k, v) => execFileSync(process.execPath, [cli, 'env:set', k, v, '--force'], { stdio: ['ignore', 'ignore', 'inherit'] });
  set('TAKY_DRIVE_OAUTH_CLIENT_ID', clientId);
  set('TAKY_DRIVE_OAUTH_CLIENT_SECRET', clientSecret);
  set('TAKY_DRIVE_OAUTH_REFRESH_TOKEN', refreshToken);
  set('TAKY_FAMILY_DRIVE_FOLDER_ID', folderId);
  set('TAKY_CENTRAL_TICKET_SECRET', crypto.randomBytes(32).toString('hex'));
  console.log('NETLIFY_ENV_SET site=' + site + ' (5 keys)');
}
