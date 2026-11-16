// Runs the team game engine against the local Netlify Blobs server (get/put/delete/list through the real client).
// The engine never relies on conditional writes: on the live platform, parallel onlyIfMatch writes to one key
// were both accepted (8 parallel score changes landed as 4, measured 2026-11-16), so each key has one writer.
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { blobsKV, createRoom, poll, send } from '../netlify/functions/teamgame/engine.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-blobs-'));
const server = new BlobsServer({ directory: dir, token: 'local', port: 0 });
const { port } = await server.start();
const store = getStore({ name: 'taky-teamgame', siteID: 'local-site', token: 'local', apiURL: `http://localhost:${port}`, consistency: 'strong' });
const kv = blobsKV(store);
// The local emulator ignores list prefixes (its walk() compares against on-disk paths); the platform does not.
// List everything and filter here so the rest of the flow runs through the real client.
kv.list = async (prefix) => (await store.list()).blobs.map((b) => b.key).filter((k) => k.startsWith(prefix));
let ok = true; const check = (v, m) => { console.log(v ? 'ok  ' : 'FAIL', m); ok &&= Boolean(v); };
await kv.put('a/1', { v: 1 }); await kv.put('a/2', { v: 2 }); await kv.put('b/1', { v: 3 });
check((await kv.get('a/1')).data.v === 1, 'put/get');
check((await kv.list('a/')).sort().join() === 'a/1,a/2', 'list by prefix');
await kv.del('a/1'); check((await kv.get('a/1')) === null, 'delete');
const t = Date.now();
const { code, hostKey } = await createRoom(kv, 'event', t);
let on = true; const loop = (async () => { while (on) { await poll(kv, { code, hostKey }); await new Promise((r) => setTimeout(r, 100)); } })();
const js = await Promise.all(['가', '나', '다', '가'].map((name) => send(kv, { code }, { t: 'join', code, name })));
on = false; await loop;
check(js.filter((m) => m[0].t === 'joined').length === 3 && js.filter((m) => m[0].code === 'DUP').length === 1, 'joins through the host screen: 3 joined, 1 duplicate refused');
const hs = (await poll(kv, { code, hostKey }))[0];
check(hs.teams.length === 3 && hs.teams.every((x) => x.online), 'host sees 3 online teams');
await server.stop(); fs.rmSync(dir, { recursive: true, force: true });
console.log(ok ? 'teamgame blobs store: PASS' : 'teamgame blobs store: FAIL'); process.exit(ok ? 0 : 1);
