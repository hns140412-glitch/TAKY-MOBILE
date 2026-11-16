// Engine race tests: concurrent joins, concurrent round-end polls, concurrent taps. Run: node test/engine.test.mjs
import assert from 'node:assert/strict';
import { createRoom, poll, send, final, memoryKV, INTRO_MS } from '../netlify/functions/teamgame/engine.mjs';

// A store that yields between every operation, so get→cas sequences really interleave.
function slowKV() {
  const kv = memoryKV(), tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  return { async get(k) { await tick(); return kv.get(k); }, async cas(k, d, e) { await tick(); return kv.cas(k, d, e); }, async put(k, d) { await tick(); return kv.put(k, d); } };
}

const kv = slowKV();
let t = 1_800_000_000_000;
const { code, hostKey } = await createRoom(kv, 'learn', t);
const host = { code, hostKey };

// 12 teams join at once (+1 duplicate name) -> 12 unique teams, one DUP error
const names = Array.from({ length: 12 }, (_, i) => `팀${i + 1}`);
const joins = await Promise.all([...names, '팀1'].map((name) => send(kv, { code }, { t: 'join', code, name }, t)));
const joined = joins.map((m, i) => ({ ...m[0], name: [...names, '팀1'][i] })).filter((m) => m.t === 'joined').sort((a, b) => +a.name.slice(1) - +b.name.slice(1));
assert.equal(joined.length, 12, 'all distinct teams joined');
assert.equal(joins.map((m) => m[0]).filter((m) => m.code === 'DUP').length, 1, 'duplicate name refused once');
let hs = (await poll(kv, host, t))[0];
assert.equal(hs.teams.length, 12);
assert.equal(new Set(hs.teams.map((x) => x.crew)).size, 12, 'crew avatars unique');
assert.ok(hs.teams.every((x) => x.online), 'joined teams show online');
assert.ok(!('token' in hs.teams[0]), 'tokens never leak to host');

// start a count round; intro -> play lazily
hs = (await send(kv, host, { t: 'start', round: 'tap' }, t))[0];
assert.equal(hs.phase, 'intro');
t += INTRO_MS + 10;
const auth = joined.map((j) => ({ code, teamId: j.teamId, token: j.token }));
// every team taps concurrently, several batches each
await Promise.all(auth.flatMap((a, i) => Array.from({ length: 4 }, () => send(kv, a, { t: 'count', n: i + 1 }, t + 1000))));
const p0 = (await poll(kv, auth[11], t + 1000))[0];
assert.equal(p0.phase, 'play');
assert.equal(p0.progress.value, 23, 'rate cap holds (5 + 18/s)');
const p1 = (await poll(kv, auth[1], t + 1000))[0];
assert.equal(p1.progress.value, 8, 'no lost concurrent taps for a team');

// 20 polls land right after the end at once -> scored exactly once
t += 15_000;
await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? poll(kv, host, t) : poll(kv, auth[i % 12], t))));
hs = (await poll(kv, host, t))[0];
assert.equal(hs.phase, 'result');
assert.equal(hs.played.length, 1, 'round recorded once');
const total = hs.teams.reduce((a, x) => a + x.score, 0);
assert.equal(total, hs.lastResult.rows.reduce((a, x) => a + x.points, 0), 'points added once');
assert.equal(hs.lastResult.rows[0].value, 23); assert.equal(hs.lastResult.rows.filter((x) => x.place === 0).length, 7, 'capped teams tie for first');

// inputs after the round are ignored
assert.deepEqual(await send(kv, auth[0], { t: 'count', n: 5 }, t), []);

// wrong host key / token
assert.equal((await poll(kv, { code, hostKey: 'nope' }, t))[0].code, 'NO_ROOM');
assert.equal((await poll(kv, { code, teamId: auth[0].teamId, token: 'x' }, t))[0].code, 'NO_TEAM');

// kick -> that phone hears it
await send(kv, host, { t: 'kick', teamId: auth[0].teamId }, t);
assert.equal((await poll(kv, auth[0], t))[0].t, 'kicked');

// final + draw: 11 draws give 11 distinct teams then stop
await send(kv, host, { t: 'final' }, t);
const drawn = [];
for (let i = 0; i < 12; i++) { const s = (await send(kv, host, { t: 'draw' }, t + i))[0]; if (s.draw && !drawn.includes(s.draw.teamId)) drawn.push(s.draw.teamId); }
assert.equal(drawn.length, 11);
const rows = await final(kv, code, hostKey, t);
assert.equal(rows.length, 11); assert.ok(rows.every((r) => r.praise));

// quiz: wrong answer locks for 1.2s
await send(kv, host, { t: 'toLobby' }, t);
await send(kv, host, { t: 'start', round: 'english' }, t);
t += INTRO_MS + 10;
const st = (await poll(kv, auth[1], t))[0];
const q = st.content[0];
let pr = (await send(kv, auth[1], { t: 'answer', qi: 0, choice: (q.answer + 1) % q.choices.length }, t))[0].progress;
assert.equal(pr.wrong, 1); assert.equal(pr.idx, 1);
pr = (await send(kv, auth[1], { t: 'answer', qi: 1, choice: st.content[1].answer }, t + 500))[0].progress;
assert.equal(pr.value, 0, 'locked answer ignored');
pr = (await send(kv, auth[1], { t: 'answer', qi: 1, choice: st.content[1].answer }, t + 1300))[0].progress;
assert.equal(pr.value, 1);

// no room / bad code
assert.equal((await poll(kv, { code: '12', hostKey: 'x' }, t))[0].code, 'NO_ROOM');
console.log('engine tests: PASS');
