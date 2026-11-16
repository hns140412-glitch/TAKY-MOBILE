// Engine tests for the one-key-one-writer design. Run: node test/engine.test.mjs
import assert from 'node:assert/strict';
import { createRoom, poll, send, final, memoryKV, INTRO_MS } from '../netlify/functions/teamgame/engine.mjs';

// A store that yields between operations, so requests really interleave.
function slowKV() {
  const kv = memoryKV(), tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const wrap = (f) => async (...a) => { await tick(); return f(...a); };
  return { get: wrap(kv.get), put: wrap(kv.put), del: wrap(kv.del), list: wrap(kv.list) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kv = slowKV();
let t = 1_800_000_000_000;
const { code, hostKey } = await createRoom(kv, 'learn', t);
const host = { code, hostKey }, tv = { code, hostKey, view: true };

// joins wait for the host screen: with no host polling they give up politely
const lonely = await send(kv, { code }, { t: 'join', code, name: '혼자팀' }, t, (() => { let c = 0; return () => (c += 4000); })());
assert.equal(lonely[0].code, 'HOST_AWAY');

// 12 teams join at once (+1 duplicate name) while the host screen polls -> 12 unique teams, one DUP
let hostOn = true;
const hostLoop = (async () => { while (hostOn) { await poll(kv, host, t + 100); await sleep(60); } })();
const names = Array.from({ length: 12 }, (_, i) => `팀${i + 1}`);
const joins = await Promise.all([...names, '팀1'].map((name) => send(kv, { code }, { t: 'join', code, name }, t)));
hostOn = false; await hostLoop;
const joined = joins.map((m, i) => ({ ...m[0], st: m[1], name: [...names, '팀1'][i] })).filter((m) => m.t === 'joined').sort((a, b) => +a.name.slice(1) - +b.name.slice(1));
assert.equal(joined.length, 12, 'all distinct teams joined');
assert.equal(joins.filter((m) => m[0].code === 'DUP').length, 1, 'duplicate name refused once');
assert.equal(joined[0].st.team.name, '팀1', 'joined reply carries the team state');
assert.ok(!joins.some((m) => m[0].code === 'HOST_AWAY'), 'nobody timed out');
let hs = (await poll(kv, host, t))[0];
assert.equal(hs.teams.length, 12);
assert.equal(new Set(hs.teams.map((x) => x.crew)).size, 12, 'crew avatars unique');
assert.ok(hs.teams.every((x) => x.online), 'joined teams show online');
assert.ok(!('token' in hs.teams[0]), 'tokens never leak to host');
assert.equal((await kv.list(`join/${code}/`)).length, 0, 'join requests cleaned up');

// crew picking: peek shows taken crews; a pick is honoured, a taken pick is refused before waiting
{
  const peek = (await send(kv, { code }, { t: 'peek', code }, t))[0];
  assert.equal(peek.t, 'room'); assert.equal(peek.pack, 'learn'); assert.equal(peek.taken.length, 12);
  const free = Array.from({ length: 24 }, (_, i) => i + 1).find((n) => !peek.taken.includes(n));
  const takenOne = peek.taken[0];
  assert.equal((await send(kv, { code }, { t: 'join', code, name: '고른팀X', crew: takenOne }, t))[0].code, 'CREW');
  let on = true; const loop = (async () => { while (on) { await poll(kv, host, t + 100); await sleep(40); } })();
  const [a2, b2] = await Promise.all([send(kv, { code }, { t: 'join', code, name: '고른팀A', crew: free }, t), send(kv, { code }, { t: 'join', code, name: '고른팀B', crew: free }, t)]);
  on = false; await loop;
  const crews = [a2[1].team.crew, b2[1].team.crew];
  assert.ok(crews.includes(free), 'one team got the picked crew'); assert.notEqual(crews[0], crews[1], 'the other got a different free crew');
  await send(kv, host, { t: 'kick', teamId: a2[0].teamId }, t); await send(kv, host, { t: 'kick', teamId: b2[0].teamId }, t);
}

// start a count round
hs = (await send(kv, host, { t: 'start', round: 'tap' }, t))[0];
assert.equal(hs.phase, 'intro');
const auth = joined.map((j) => ({ code, teamId: j.teamId, token: j.token }));
assert.deepEqual(await send(kv, auth[0], { t: 'count', n: 3 }, t + 100), [], 'taps before the start are ignored');
t += INTRO_MS + 10;
// phones and the TV see play before the host polls again
assert.equal((await poll(kv, auth[0], t))[0].phase, 'play');
assert.equal((await poll(kv, tv, t))[0].phase, 'play');
// teams tap concurrently with each other, in order within a team (one request in flight per phone)
await Promise.all(auth.map(async (a, i) => { for (let k = 0; k < 4; k++) await send(kv, a, { t: 'count', n: i + 1 }, t + 1000); }));
assert.equal((await poll(kv, auth[11], t + 1000))[0].progress.value, 23, 'rate cap holds (5 + 18/s)');
assert.equal((await poll(kv, auth[1], t + 1000))[0].progress.value, 8, 'no lost taps');
assert.equal((await send(kv, auth[2], { t: 'count', n: 999 }, t + 3000))[0].progress.value, 12 + 47, 'one message adds at most 60, under the 18/s cap');

// after the end: phones and the TV poll many times, nothing is scored until the host polls, then once
t += 15_000;
await Promise.all([...Array.from({ length: 20 }, (_, i) => poll(kv, auth[i % 12], t)), poll(kv, tv, t), poll(kv, tv, t)]);
assert.equal((await poll(kv, tv, t))[0].played.length, 0, 'only the host screen ends a round');
hs = (await poll(kv, host, t))[0];
hs = (await poll(kv, host, t + 50))[0];
assert.equal(hs.phase, 'result');
assert.equal(hs.played.length, 1, 'round recorded once');
assert.equal(hs.teams.reduce((a, x) => a + x.score, 0), hs.lastResult.rows.reduce((a, x) => a + x.points, 0), 'points added once');
assert.equal(hs.lastResult.rows[0].value, 59);
assert.deepEqual(await send(kv, auth[0], { t: 'count', n: 5 }, t), [], 'inputs after the round are ignored');

// the TV cannot change the game
assert.equal((await send(kv, tv, { t: 'final' }, t))[0].phase, 'result');

// wrong host key / token
assert.equal((await poll(kv, { code, hostKey: 'nope' }, t))[0].code, 'NO_ROOM');
assert.equal((await poll(kv, { code, hostKey: 'nope', view: true }, t))[0].code, 'NO_ROOM');
assert.equal((await poll(kv, { code, teamId: auth[0].teamId, token: 'x' }, t))[0].code, 'NO_TEAM');

// kick -> that phone hears it
await send(kv, host, { t: 'kick', teamId: auth[0].teamId }, t);
assert.equal((await poll(kv, auth[0], t))[0].t, 'kicked');

// family pack: all 12 teams played the tap round -> everyone got the 'together' bonus
assert.equal(hs.lastResult.together, true, 'family pack: all-together bonus');
assert.ok(hs.lastResult.rows.every((x) => x.bonus === 2), 'bonus on every row');
assert.equal(hs.lastResult.rows[0].points, 6 + 2, 'family ranks are gentle (6 for 1st) + bonus');
// family final: no prize draw, the whole expedition is revealed at once
await send(kv, host, { t: 'final' }, t);
assert.equal((await send(kv, host, { t: 'draw' }, t))[0].draw, null, 'no prize draw in the family pack');
assert.equal((await send(kv, host, { t: 'reveal' }, t))[0].revealStep, 11, 'family reveal is all at once');
const rows = await final(kv, code, hostKey, t);
assert.equal(rows.length, 11); assert.ok(rows.every((r) => r.praise));

// company pack: own mission names, steep ranks, last-place-first reveal, prize draw
{
  const ev = await createRoom(kv, 'event', t), eh = { code: ev.code, hostKey: ev.hostKey };
  let on = true; const loop = (async () => { while (on) { await poll(kv, eh, t + 100); await sleep(40); } })();
  const ej = await Promise.all(['가', '나', '다'].map((name) => send(kv, { code: ev.code }, { t: 'join', code: ev.code, name }, t)));
  on = false; await loop;
  let es = (await poll(kv, eh, t))[0];
  assert.ok(es.rounds.some((r) => r.title === '스피드 탭 배틀'), 'company pack renames the tap mission');
  assert.ok(!es.rounds.some((r) => r.id === 'clock'), 'school missions stay in the family pack');
  assert.ok(es.rounds.some((r) => r.id === 'abbr'), 'company-only missions present');
  await send(kv, eh, { t: 'start', round: 'tap' }, t);
  const ea = ej.map((m) => ({ code: ev.code, teamId: m[0].teamId, token: m[0].token }));
  await Promise.all(ea.map((a, i) => send(kv, a, { t: 'count', n: i + 1 }, t + INTRO_MS + 2000)));
  es = (await poll(kv, eh, t + INTRO_MS + 20_000))[0]; es = (await poll(kv, eh, t + INTRO_MS + 20_100))[0];
  assert.equal(es.phase, 'result'); assert.equal(es.lastResult.together, false);
  assert.deepEqual(es.lastResult.rows.map((x) => x.points), [10, 8, 6], 'company ranks are steep, no bonus');
  await send(kv, eh, { t: 'final' }, t);
  assert.equal((await send(kv, eh, { t: 'reveal' }, t))[0].revealStep, 1, 'company reveal one by one');
  const drawn = [];
  for (let i = 0; i < 4; i++) { const s = (await send(kv, eh, { t: 'draw' }, t + i))[0]; if (s.draw && !drawn.includes(s.draw.teamId)) drawn.push(s.draw.teamId); }
  assert.equal(drawn.length, 3, 'prize draw picks each team once');
}

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

assert.equal((await poll(kv, { code: '12', hostKey: 'x' }, t))[0].code, 'NO_ROOM');
console.log('engine tests: PASS');
