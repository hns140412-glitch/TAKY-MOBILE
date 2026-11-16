// Checks the Netlify Blobs conditional-write semantics the team game engine relies on, against the local Blobs server.
// (The emulator does not return ETags on reads, so the full race test runs on the in-memory store in tests/teamgame-engine.test.mjs.)
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { blobsKV } from '../netlify/functions/teamgame/engine.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-blobs-'));
const server = new BlobsServer({ directory: dir, token: 'local', port: 0 });
const { port } = await server.start();
const store = getStore({ name: 'taky-teamgame', siteID: 'local-site', token: 'local', apiURL: `http://localhost:${port}`, consistency: 'strong' });
const wait = () => new Promise((r) => setTimeout(r, 3)); // emulator ETag = file mtime (ms)
let ok = true; const check = (v, m) => { console.log(v ? 'ok  ' : 'FAIL', m); ok &&= Boolean(v); };
const kv = blobsKV(store);
check(await kv.cas('room/1', { a: 1 }, null), 'onlyIfNew creates a room');
check(!(await kv.cas('room/1', { a: 2 }, null)), 'onlyIfNew refuses an existing room');
const w1 = await store.setJSON('room/2', { a: 1 }); await wait();
const w2 = await store.setJSON('room/2', { a: 2 }, { onlyIfMatch: w1.etag }); await wait();
check(w2.modified, 'onlyIfMatch writes on the current ETag');
const w3 = await store.setJSON('room/2', { a: 3 }, { onlyIfMatch: w1.etag });
check(!w3.modified, 'onlyIfMatch refuses a stale ETag');
check((await store.get('room/2', { type: 'json' })).a === 2, 'stale write left data untouched');
check((await kv.get('missing')) === null, 'missing key reads as null');
let threw = false; try { await kv.get('room/2'); } catch (e) { threw = e.message === 'NO_ETAG'; }
check(threw, 'a read without an ETag refuses instead of allowing an unconditional write');
await server.stop(); fs.rmSync(dir, { recursive: true, force: true });
console.log(ok ? 'teamgame blobs CAS: PASS' : 'teamgame blobs CAS: FAIL'); process.exit(ok ? 0 : 1);
