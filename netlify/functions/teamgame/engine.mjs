// TAKY 팀게임 engine — stateless request handlers over a small key/value store.
// Runs inside a Netlify Function (Blobs) or the local dev server (memory/file store).
// No sockets and no timers: phases advance from the clock when the host screen polls.
// One key, one writer (Netlify Blobs does not enforce conditional writes, measured 2026-11-16):
//   room/CODE        written only by the controlling host screen (its requests are serialized client-side)
//   join/CODE/TEAM   written once by the joining phone; the host merges it into the room and deletes it
//   metric/CODE/SEED/TEAM, seen/CODE/TEAM   written only by that team's phone (serialized client-side)
import crypto from 'node:crypto';
import R from './rounds.cjs';

const { FAMILIES, ROUNDS, buildContent, placePoints, viewOf } = R;
export const MAX_TEAMS = 16;
export const INTRO_MS = 5000;
const TOGETHER_BONUS = 2;
const ROOM_TTL = 3 * 864e5;
const ONLINE_MS = 15000;
const BEAT_MS = 6000;
const TEAM_COLORS = ['#FF7A59', '#15786C', '#3266D1', '#E8B400', '#7F4CBD', '#BE3B3F', '#20754C', '#AE4082', '#00A6D6', '#7E6259', '#5765B6', '#2F7332', '#FB8C00', '#6D4C41', '#00756A', '#C0CA33'];
const id = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const CODE_RE = /^\d{4}$/;

/*
 kv interface (all async):
   get(key) -> { data } | null     put(key, data)     del(key)     list(prefix) -> [key]
*/
const CREW_COUNT = 24;
const JOIN_WAIT_MS = 6000;   // a joining phone waits this long for the host screen to admit it
const JOIN_STALE_MS = 6500;  // the host ignores join requests older than this (that phone already gave up)
const K = {
  room: (c) => `room/${c}`,
  join: (c, t) => `join/${c}/${t}`,
  metric: (c, seed, t) => `metric/${c}/${seed}/${t}`,
  seen: (c, t) => `seen/${c}/${t}`,
};

const packRounds = (pack) => ROUNDS.filter((r) => r.pack === 'both' || r.pack === pack).map((d) => viewOf(d, pack));
const defOf = (rid, pack) => { const d = ROUNDS.find((x) => x.id === rid); return d && viewOf(d, pack); };
const err = (code, text) => ({ t: 'error', code, text });
const NO_ROOM = () => err('NO_ROOM', '방을 찾을 수 없어요. 진행 화면의 QR을 다시 찍어 주세요.');

// ---------- room I/O ----------
async function readMetrics(kv, room) {
  const r = room.round; if (!r) return {};
  const out = {};
  await Promise.all(room.teams.map(async (t) => { const rec = await kv.get(K.metric(room.code, r.seed, t.id)); if (rec) out[t.id] = rec.data; }));
  return out;
}
async function readSeen(kv, room) {
  const out = {};
  await Promise.all(room.teams.map(async (t) => { const rec = await kv.get(K.seen(room.code, t.id)); out[t.id] = rec ? rec.data.at : 0; }));
  return out;
}

// Advance intro→play and play→result from the clock. Returns true when the room changed.
async function advance(kv, room, now) {
  let changed = false;
  if (room.phase === 'intro' && room.round && now >= room.round.startsAt) { room.phase = 'play'; changed = true; }
  if (room.phase === 'play' && room.round && now > room.round.endsAt + 400) { endRound(room, await readMetrics(kv, room), now); changed = true; }
  return changed;
}

// Admit (or refuse) phones that asked to join since the last host poll.
async function mergeJoins(kv, room, now) {
  const keys = await kv.list(`join/${room.code}/`);
  if (!keys.length) return false;
  let changed = false;
  for (const key of keys.sort()) {
    const rec = await kv.get(key); await kv.del(key);
    const j = rec && rec.data; if (!j || now - j.at > JOIN_STALE_MS || room.teams.some((t) => t.id === j.id)) continue;
    room.rejected = room.rejected || {};
    if (room.teams.length >= MAX_TEAMS) room.rejected[j.id] = 'FULL';
    else if (room.teams.some((t) => t.name === j.name)) room.rejected[j.id] = 'DUP';
    else {
      const used = new Set(room.teams.map((t) => t.crew));
      const free = Array.from({ length: CREW_COUNT }, (_, i) => i + 1).filter((n) => !used.has(n));
      const crew = free.includes(j.crew) ? j.crew : free[crypto.randomInt(0, free.length)] || 1; // the team's pick, or any free crew member
      room.teams.push({ id: j.id, token: j.token, name: j.name, crew, color: TEAM_COLORS[room.teams.length % TEAM_COLORS.length], score: 0, best: {}, joinedAt: j.at });
    }
    const ids = Object.keys(room.rejected); if (ids.length > 40) delete room.rejected[ids[0]];
    changed = true;
  }
  return changed;
}

async function loadRoom(kv, code, now) {
  if (!CODE_RE.test(String(code || ''))) return null;
  const rec = await kv.get(K.room(code));
  return rec && now - rec.data.createdAt <= ROOM_TTL ? rec.data : null;
}

/** Host-screen write path: the only writer of room/CODE. */
async function hostRoom(kv, code, hostKey, now, mutate) {
  const room = await loadRoom(kv, code, now);
  if (!room || room.hostKey !== hostKey) return null;
  let changed = await mergeJoins(kv, room, now);
  if (await advance(kv, room, now)) changed = true;
  if (mutate) { const r = await mutate(room); if (r && r.changed) changed = true; }
  if (changed) await kv.put(K.room(code), room);
  return room;
}

// What phones see between host polls: an intro whose start time passed is already play.
function asSeen(room, now) {
  if (room.phase === 'intro' && room.round && now >= room.round.startsAt) return { ...room, phase: 'play' };
  return room;
}

export async function createRoom(kv, packIn, now = Date.now()) {
  const pack = packIn === 'event' ? 'event' : 'learn';
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + crypto.randomInt(0, 9000));
    const room = { code, hostKey: id(16), pack, theme: pack === 'event' ? 'stage' : 'island', createdAt: now, teams: [], kicked: [], phase: 'lobby', roundIdx: -1, round: null, history: [], revealStep: 0, draws: [], draw: null };
    if (await loadRoom(kv, code, now)) continue;
    await kv.put(K.room(code), room);
    return { code, hostKey: room.hostKey };
  }
  throw new Error('NO_FREE_CODE');
}

// ---------- views ----------
const publicTeams = (room, seen, now) => room.teams.map(({ token, ...t }) => ({ ...t, online: now - (seen[t.id] || 0) < ONLINE_MS })); // eslint-disable-line no-unused-vars
function roundMeta(room) {
  const r = room.round; if (!r) return null;
  const def = defOf(r.id, room.pack);
  return { id: r.id, title: def.title, how: def.how, kind: def.kind, input: def.input || null, family: def.family, seconds: def.seconds, unit: def.unit, better: def.better || 'high', startsAt: r.startsAt, endsAt: r.endsAt, index: room.roundIdx };
}
function metricValue(kind, m) {
  if (!m) return null;
  if (kind === 'react') return m.best.length ? Math.round(m.best.reduce((a, b) => a + b, 0) / m.best.length) : null;
  if (kind === 'timing') return m.best.length ? Math.min(...m.best) : null;
  return m.value;
}
const liveScores = (room, metrics) => (room.round ? room.teams.map((t) => ({ teamId: t.id, value: metricValue(room.round.kind, metrics[t.id]) })) : null);

async function hostState(kv, room, now) {
  const [seen, metrics] = await Promise.all([readSeen(kv, room), room.round ? readMetrics(kv, room) : {}]);
  return {
    t: 'state', code: room.code, pack: room.pack, theme: room.theme, phase: room.phase, teams: publicTeams(room, seen, now),
    rounds: packRounds(room.pack).map((d) => ({ id: d.id, title: d.title, how: d.how, seconds: d.seconds, family: d.family, familyName: FAMILIES[d.family] })),
    played: room.history.map((h) => h.id), round: roundMeta(room), live: liveScores(room, metrics),
    lastResult: room.history[room.history.length - 1] || null, revealStep: room.revealStep, draw: room.draw || null, draws: (room.draws || []).length, now,
  };
}
async function playerState(kv, room, teamId, now) {
  const team = room.teams.find((t) => t.id === teamId);
  const last = room.history[room.history.length - 1];
  const r = room.round;
  const prog = r ? await kv.get(K.metric(room.code, r.seed, teamId)) : null;
  return {
    t: 'state', code: room.code, theme: room.theme, phase: room.phase, team: team && { id: team.id, name: team.name, color: team.color, score: team.score, crew: team.crew }, pack: room.pack,
    teamCount: room.teams.length, round: roundMeta(room),
    content: r && room.phase !== 'lobby' ? r.content : null,
    progress: prog ? prog.data : null,
    lastResult: last ? { id: last.id, title: last.title, unit: last.unit, mine: last.rows.find((x) => x.teamId === teamId) || null, count: last.rows.length, together: !!last.together } : null,
    final: room.phase === 'final' ? finalRows(room).map((x) => ({ teamId: x.id, place: x.place, praise: praiseFor(room, x) })) : null,
    revealStep: room.revealStep, draw: room.draw && room.draw.teamId === teamId ? room.draw : null, now,
  };
}

// ---------- rounds ----------
function startRound(room, roundId, now) {
  const def = packRounds(room.pack).find((d) => d.id === roundId); if (!def) return false;
  const seed = crypto.randomInt(1, 2 ** 31);
  room.roundIdx = room.history.length;
  room.round = { id: def.id, kind: def.kind, seed, content: buildContent(def.id, seed), startsAt: now + INTRO_MS, endsAt: now + INTRO_MS + def.seconds * 1000 };
  room.phase = 'intro';
  return true;
}
function endRound(room, metrics, now) {
  const r = room.round; if (!r) return;
  const def = defOf(r.id, room.pack), low = def.better === 'low';
  const rows = room.teams.map((t) => ({ teamId: t.id, name: t.name, color: t.color, crew: t.crew, value: metricValue(r.kind, metrics[t.id]) }));
  const played = rows.filter((x) => x.value !== null).sort((a, b) => (low ? a.value - b.value : b.value - a.value));
  let place = 0;
  played.forEach((x, i) => { if (i > 0 && x.value !== played[i - 1].value) place = i; x.place = place; x.points = placePoints(place, room.pack); });
  // Family pack is cooperative: when every expedition took part, everyone gets the 'all together' bonus.
  const together = room.pack === 'learn' && rows.length > 1 && rows.every((x) => x.value !== null && (low || x.value > 0));
  if (together) rows.forEach((x) => { x.points += TOGETHER_BONUS; x.bonus = TOGETHER_BONUS; });
  rows.forEach((x) => { if (x.value === null) { x.place = null; x.points = 0; } });
  rows.forEach((x) => { const t = room.teams.find((tt) => tt.id === x.teamId); t.score += x.points; t.best = t.best || {}; t.best[r.id] = x.place; });
  rows.sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  room.history.push({ id: r.id, title: def.title, unit: def.unit, better: def.better || 'high', rows, together, at: now });
  room.round = null; room.phase = 'result';
}
function finalRows(room) {
  const sorted = room.teams.slice().sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.map((t, i) => { if (i > 0 && t.score !== sorted[i - 1].score) place = i; return { ...t, place }; });
}
// One honest praise line per team on the final reveal, picked from what it actually did.
function praiseFor(room, team) {
  const entries = Object.entries(team.best || {}).filter(([, p]) => p !== null);
  if (!entries.length) return room.pack === 'event' ? '끝까지 함께한 팀' : '끝까지 함께 걸은 탐험대';
  const top = Math.min(...entries.map(([, p]) => p));
  const cands = entries.filter(([, p]) => p === top).map(([k]) => k);
  const pick = cands[[...team.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % cands.length];
  const t = defOf(pick, room.pack).title;
  const wins = entries.filter(([, p]) => p === 0).length;
  const unit = room.pack === 'event' ? '라운드' : '미션', who = room.pack === 'event' ? '팀' : '탐험대';
  if (top === 0) return wins > 1 ? `${wins}개 ${unit} 1등 · ${t}에서 특히 빛난 ${who}` : `${t} 1등을 차지한 ${who}`;
  if (top <= 2) return `${t}에서 ${top + 1}등까지 오른 ${who}`;
  return `${t}에서 끝까지 힘을 낸 ${who}`;
}

// ---------- host commands ----------
function onHost(room, msg, metricsP, now) {
  const ch = { changed: true };
  switch (msg.t) {
    case 'start': return (room.phase === 'lobby' || room.phase === 'result') && startRound(room, msg.round, now) ? ch : null;
    case 'endNow': if (room.phase === 'play' || room.phase === 'intro') return metricsP().then((m) => { endRound(room, m, now); return ch; }); return null;
    case 'toLobby': if (room.phase === 'result' || room.phase === 'final') { room.revealStep = 0; room.phase = 'lobby'; return ch; } return null;
    case 'undo': {
      if (room.phase !== 'result' && room.phase !== 'lobby') return null;
      const h = room.history.pop(); if (!h) return null;
      h.rows.forEach((x) => { const t = room.teams.find((tt) => tt.id === x.teamId); if (t) t.score -= x.points; });
      room.phase = 'lobby'; room.round = null; return ch;
    }
    case 'adjust': { const t = room.teams.find((x) => x.id === msg.teamId); if (!t) return null; t.score += Math.max(-10, Math.min(10, msg.d | 0)); return ch; }
    case 'kick': room.teams = room.teams.filter((x) => x.id !== msg.teamId); room.kicked = [...(room.kicked || []), String(msg.teamId)].slice(-50); return ch;
    case 'theme': if (['island', 'stage', 'paper'].includes(msg.theme)) { room.theme = msg.theme; return ch; } return null;
    case 'final': room.phase = 'final'; room.round = null; room.revealStep = 0; return ch;
    // company: last place first, one by one. family: the whole expedition graduates together.
    case 'reveal': if (room.phase === 'final') { room.revealStep = room.pack === 'learn' ? room.teams.length : Math.min(room.teams.length, room.revealStep + 1); return ch; } return null;
    case 'draw': {
      if (room.pack !== 'event') return null; // prize draw is a company-event thing
      room.draws = room.draws || [];
      const pool = room.teams.filter((t) => !room.draws.includes(t.id)); if (!pool.length) return null;
      const t = pool[crypto.randomInt(0, pool.length)]; room.draws.push(t.id);
      room.draw = { teamId: t.id, name: t.name, n: room.draws.length, at: now }; return ch;
    }
    case 'drawReset': room.draws = []; room.draw = null; return ch;
    case 'restart': room.teams.forEach((t) => { t.score = 0; t.best = {}; }); room.history = []; room.draws = []; room.draw = null; room.round = null; room.phase = 'lobby'; room.revealStep = 0; return ch;
    default: return null;
  }
}

// ---------- player input (written to the team's own metric key) ----------
async function onPlayer(kv, room, teamId, msg, now) {
  const r = room.round; if (!r || room.phase !== 'play') return null;
  if (now < r.startsAt || now > r.endsAt + 300) return null;
  const key = K.metric(room.code, r.seed, teamId);
  {
    const rec = await kv.get(key);
    const m = rec ? rec.data : { value: 0, idx: 0, lockUntil: 0, best: [], last: 0, wrong: 0 };
    if (r.kind === 'count' && msg.t === 'count') {
      const add = Math.max(0, Math.min(60, msg.n | 0)); // phones batch taps while a request is in flight
      const cap = Math.floor((now - r.startsAt) / 1000 * 18) + 5; // ~18/s ceiling against auto-clickers
      m.value = Math.min(cap, m.value + add);
    } else if (r.kind === 'quiz' && msg.t === 'answer') {
      if (msg.qi !== m.idx || now < m.lockUntil) return m;
      const q = r.content[m.idx % r.content.length]; if (!q) return m;
      if (msg.choice === q.answer) { m.value += 1; m.idx += 1; } else { m.wrong += 1; m.lockUntil = now + 1200; m.idx += 1; }
    } else if (r.kind === 'level' && msg.t === 'level') {
      const n = msg.n | 0; if (n !== m.value + 1 || n > 20) return m; m.value = n;
    } else if (r.kind === 'react' && msg.t === 'react') {
      const ms = msg.ms | 0; if (!(ms >= 90 && ms < 3000 && m.best.length < 5)) return m; m.best.push(ms);
    } else if (r.kind === 'timing' && msg.t === 'timing') {
      const ms = Math.abs(msg.ms | 0); if (!(ms < 20000 && m.best.length < 3)) return m; m.best.push(ms);
    } else return null;
    await kv.put(key, m);
    return m;
  }
}

async function beat(kv, code, teamId, now) {
  const rec = await kv.get(K.seen(code, teamId));
  if (!rec || now - rec.data.at > BEAT_MS) await kv.put(K.seen(code, teamId), { at: now });
}

// ---------- public API ----------
/** auth: { code, hostKey[, view] } for a host screen or { code, teamId, token } for a team. Returns messages for the caller. */
export async function poll(kv, auth, now = Date.now()) {
  if (auth.hostKey !== undefined) {
    // view: a second screen (the TV) only reads; the controlling screen advances and writes the room
    const room = auth.view ? await loadRoom(kv, auth.code, now) : await hostRoom(kv, auth.code, auth.hostKey, now);
    if (!room || room.hostKey !== auth.hostKey) return [NO_ROOM()];
    return [await hostState(kv, auth.view ? asSeen(room, now) : room, now)];
  }
  const room = await loadRoom(kv, auth.code, now);
  if (!room) return [NO_ROOM()];
  const team = room.teams.find((t) => t.id === auth.teamId && t.token === auth.token);
  if (!team) return [(room.kicked || []).includes(String(auth.teamId)) ? { t: 'kicked' } : err('NO_TEAM', '팀 정보가 없어요. 다시 합류해 주세요.')];
  await beat(kv, room.code, team.id, now);
  return [await playerState(kv, asSeen(room, now), team.id, now)];
}

// What a phone needs before joining: which pack, and which crew members are already taken.
const peekOf = (room) => ({ t: 'room', code: room.code, pack: room.pack, theme: room.theme, taken: room.teams.map((t) => t.crew), teamCount: room.teams.length });
const JOIN_ERR = { FULL: () => err('FULL', `팀은 ${MAX_TEAMS}개까지 들어올 수 있어요.`), DUP: () => err('DUP', '같은 이름의 팀이 있어요. 다른 이름으로 해 주세요.') };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function send(kv, auth, msg, now = Date.now(), clock = Date.now) {
  if (!msg || typeof msg.t !== 'string') return [];
  const code = String(auth.code || '');
  if (msg.t === 'join') {
    const name = String(msg.name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!name) return [err('NAME', '팀 이름을 적어 주세요.')];
    let room = await loadRoom(kv, code, now);
    if (!room) return [NO_ROOM()];
    if (room.teams.length >= MAX_TEAMS) return [JOIN_ERR.FULL()];
    if (room.teams.some((t) => t.name === name)) return [JOIN_ERR.DUP()];
    const crew = Number.isInteger(msg.crew) && msg.crew >= 1 && msg.crew <= CREW_COUNT ? msg.crew : null;
    if (crew && room.teams.some((t) => t.crew === crew)) return [err('CREW', '다른 팀이 먼저 고른 대원이에요. 다른 대원을 골라 주세요.'), peekOf(room)];
    const j = { id: id(6), token: id(16), name, crew, at: now };
    await kv.put(K.join(code, j.id), j);
    const until = clock() + JOIN_WAIT_MS;
    for (;;) {
      room = await loadRoom(kv, code, now);
      if (room && room.teams.some((t) => t.id === j.id)) {
        const t = now + (clock() - (until - JOIN_WAIT_MS)); // the request's clock, advanced by the time spent waiting
        await kv.put(K.seen(code, j.id), { at: t });
        return [{ t: 'joined', teamId: j.id, token: j.token, code }, await playerState(kv, asSeen(room, t), j.id, t)];
      }
      const why = room && room.rejected && room.rejected[j.id];
      if (why) return [JOIN_ERR[why]()];
      if (clock() >= until) { await kv.del(K.join(code, j.id)); return [err('HOST_AWAY', '진행 화면이 응답하지 않아요. 진행 화면이 켜져 있는지 보고 다시 눌러 주세요.')]; }
      await wait(350);
    }
  }
  if (msg.t === 'peek') { const room = await loadRoom(kv, code, now); return [room ? peekOf(room) : NO_ROOM()]; }
  if (msg.t === 'host' || msg.t === 'rejoin') return poll(kv, auth, now);
  if (auth.hostKey !== undefined) {
    if (auth.view) return poll(kv, auth, now); // the TV screen never changes the game
    const room = await hostRoom(kv, code, auth.hostKey, now, (room) => onHost(room, msg, () => readMetrics(kv, room), now));
    if (!room) return [NO_ROOM()];
    return [await hostState(kv, room, now)];
  }
  const room = await loadRoom(kv, code, now);
  if (!room) return [NO_ROOM()];
  const team = room.teams.find((t) => t.id === auth.teamId && t.token === auth.token);
  if (!team) return [err('NO_TEAM', '팀 정보가 없어요. 다시 합류해 주세요.')];
  const progress = await onPlayer(kv, asSeen(room, now), team.id, msg, now);
  return progress ? [{ t: 'progress', progress, now }] : [];
}

export async function final(kv, code, hostKey, now = Date.now()) {
  const room = await loadRoom(kv, code, now);
  if (!room || hostKey !== room.hostKey) return null;
  return finalRows(room).map((t) => ({ id: t.id, name: t.name, color: t.color, crew: t.crew, score: t.score, place: t.place, praise: praiseFor(room, t) }));
}

// ---------- stores ----------
/** In-memory store for local dev and tests. */
export function memoryKV() {
  const m = new Map();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
    async get(k) { return m.has(k) ? { data: clone(m.get(k)) } : null; },
    async put(k, data) { m.set(k, clone(data)); },
    async del(k) { m.delete(k); },
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
  };
}

/** Netlify Blobs store (strong consistency). */
export function blobsKV(store) {
  return {
    async get(k) { const d = await store.get(k, { type: 'json' }); return d == null ? null : { data: d }; },
    async put(k, data) { await store.setJSON(k, data); },
    async del(k) { await store.delete(k); },
    async list(prefix) { const { blobs } = await store.list({ prefix }); return blobs.map((b) => b.key); },
  };
}
