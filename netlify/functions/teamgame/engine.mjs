// TAKY 팀게임 engine — stateless request handlers over a small key/value store.
// Runs inside a Netlify Function (Blobs) or the local dev server (memory/file store).
// No sockets and no timers: phases advance lazily from the clock on every request,
// and every room write is compare-and-swap, so concurrent phones never double-score.
import crypto from 'node:crypto';
import R from './rounds.cjs';

const { FAMILIES, ROUNDS, buildContent, placePoints } = R;
export const MAX_TEAMS = 16;
export const INTRO_MS = 5000;
const ROOM_TTL = 3 * 864e5;
const ONLINE_MS = 15000;
const BEAT_MS = 6000;
const TEAM_COLORS = ['#FF7A59', '#15786C', '#3266D1', '#E8B400', '#7F4CBD', '#BE3B3F', '#20754C', '#AE4082', '#00A6D6', '#7E6259', '#5765B6', '#2F7332', '#FB8C00', '#6D4C41', '#00756A', '#C0CA33'];
const id = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const CODE_RE = /^\d{4}$/;

/*
 kv interface (all async):
   get(key)                 -> { data, etag } | null
   cas(key, data, etag)     -> true when written (etag null = only if new)
   put(key, data)           -> unconditional write
*/
const K = {
  room: (c) => `room/${c}`,
  metric: (c, seed, t) => `metric/${c}/${seed}/${t}`,
  seen: (c, t) => `seen/${c}/${t}`,
};

const packRounds = (pack) => ROUNDS.filter((r) => r.pack === 'both' || r.pack === pack);
const defOf = (rid) => ROUNDS.find((d) => d.id === rid);
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

/** Load a room, apply clock transitions, then optionally mutate it; retries on write races. */
async function withRoom(kv, code, now, mutate) {
  if (!CODE_RE.test(String(code || ''))) return { room: null };
  for (let i = 0; i < 14; i++) {
    if (i) await new Promise((r) => setTimeout(r, 5 + Math.random() * 25 * Math.min(i, 6))); // jittered backoff on write races
    const rec = await kv.get(K.room(code));
    if (!rec || now - rec.data.createdAt > ROOM_TTL) return { room: null };
    const room = rec.data;
    let changed = await advance(kv, room, now);
    let result;
    if (mutate) { result = await mutate(room); if (result && result.changed) changed = true; }
    if (!changed) return { room, result };
    if (await kv.cas(K.room(code), room, rec.etag)) return { room, result };
  }
  throw new Error('ROOM_BUSY');
}

export async function createRoom(kv, packIn, now = Date.now()) {
  const pack = packIn === 'event' ? 'event' : 'learn';
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + crypto.randomInt(0, 9000));
    const room = { code, hostKey: id(16), pack, theme: pack === 'event' ? 'stage' : 'island', createdAt: now, teams: [], kicked: [], phase: 'lobby', roundIdx: -1, round: null, history: [], revealStep: 0, draws: [], draw: null };
    const old = await kv.get(K.room(code));
    if (old && now - old.data.createdAt <= ROOM_TTL) continue;
    if (await kv.cas(K.room(code), room, old ? old.etag : null)) return { code, hostKey: room.hostKey };
  }
  throw new Error('NO_FREE_CODE');
}

// ---------- views ----------
const publicTeams = (room, seen, now) => room.teams.map(({ token, ...t }) => ({ ...t, online: now - (seen[t.id] || 0) < ONLINE_MS })); // eslint-disable-line no-unused-vars
function roundMeta(room) {
  const r = room.round; if (!r) return null;
  const def = defOf(r.id);
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
    lastResult: last ? { id: last.id, title: last.title, unit: last.unit, mine: last.rows.find((x) => x.teamId === teamId) || null, count: last.rows.length } : null,
    final: room.phase === 'final' ? finalRows(room).map((x) => ({ teamId: x.id, place: x.place })) : null,
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
  const def = defOf(r.id), low = def.better === 'low';
  const rows = room.teams.map((t) => ({ teamId: t.id, name: t.name, color: t.color, crew: t.crew, value: metricValue(r.kind, metrics[t.id]) }));
  const played = rows.filter((x) => x.value !== null).sort((a, b) => (low ? a.value - b.value : b.value - a.value));
  let place = 0;
  played.forEach((x, i) => { if (i > 0 && x.value !== played[i - 1].value) place = i; x.place = place; x.points = placePoints(place); });
  rows.forEach((x) => { if (x.value === null) { x.place = null; x.points = 0; } });
  rows.forEach((x) => { const t = room.teams.find((tt) => tt.id === x.teamId); t.score += x.points; t.best = t.best || {}; t.best[r.id] = x.place; });
  rows.sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  room.history.push({ id: r.id, title: def.title, unit: def.unit, better: def.better || 'high', rows, at: now });
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
  const t = defOf(pick).title;
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
    case 'reveal': if (room.phase === 'final') { room.revealStep = Math.min(room.teams.length, room.revealStep + 1); return ch; } return null;
    case 'draw': {
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
  for (let i = 0; i < 8; i++) {
    if (i) await new Promise((r) => setTimeout(r, 3 + Math.random() * 15 * i));
    const rec = await kv.get(key);
    const m = rec ? rec.data : { value: 0, idx: 0, lockUntil: 0, best: [], last: 0, wrong: 0 };
    if (r.kind === 'count' && msg.t === 'count') {
      const add = Math.max(0, Math.min(20, msg.n | 0));
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
    if (await kv.cas(key, m, rec ? rec.etag : null)) return m;
  }
  return null;
}

async function beat(kv, code, teamId, now) {
  const rec = await kv.get(K.seen(code, teamId));
  if (!rec || now - rec.data.at > BEAT_MS) await kv.put(K.seen(code, teamId), { at: now });
}

// ---------- public API ----------
/** auth: { code, hostKey } for the host or { code, teamId, token } for a team. Returns messages for the caller. */
export async function poll(kv, auth, now = Date.now()) {
  const { room } = await withRoom(kv, auth.code, now);
  if (!room) return [NO_ROOM()];
  if (auth.hostKey !== undefined) {
    if (auth.hostKey !== room.hostKey) return [NO_ROOM()];
    return [await hostState(kv, room, now)];
  }
  const team = room.teams.find((t) => t.id === auth.teamId && t.token === auth.token);
  if (!team) return [(room.kicked || []).includes(String(auth.teamId)) ? { t: 'kicked' } : err('NO_TEAM', '팀 정보가 없어요. 다시 합류해 주세요.')];
  await beat(kv, room.code, team.id, now);
  return [await playerState(kv, room, team.id, now)];
}

export async function send(kv, auth, msg, now = Date.now()) {
  if (!msg || typeof msg.t !== 'string') return [];
  const code = String(auth.code || '');
  if (msg.t === 'join') {
    const name = String(msg.name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!name) return [err('NAME', '팀 이름을 적어 주세요.')];
    const { room, result } = await withRoom(kv, code, now, (room) => {
      if (room.teams.length >= MAX_TEAMS) return { e: err('FULL', `팀은 ${MAX_TEAMS}개까지 들어올 수 있어요.`) };
      if (room.teams.some((t) => t.name === name)) return { e: err('DUP', '같은 이름의 팀이 있어요. 다른 이름으로 해 주세요.') };
      const used = new Set(room.teams.map((t) => t.crew));
      const free = Array.from({ length: 24 }, (_, i) => i + 1).filter((n) => !used.has(n));
      const team = { id: id(6), token: id(16), name, crew: free[crypto.randomInt(0, free.length)] || 1, color: TEAM_COLORS[room.teams.length % TEAM_COLORS.length], score: 0, best: {}, joinedAt: now };
      room.teams.push(team);
      return { changed: true, team };
    });
    if (!room) return [NO_ROOM()];
    if (result.e) return [result.e];
    await kv.put(K.seen(code, result.team.id), { at: now });
    return [{ t: 'joined', teamId: result.team.id, token: result.team.token, code }, await playerState(kv, room, result.team.id, now)];
  }
  if (msg.t === 'host' || msg.t === 'rejoin') return poll(kv, auth, now);
  if (auth.hostKey !== undefined) {
    const { room } = await withRoom(kv, code, now, async (room) => {
      if (auth.hostKey !== room.hostKey) return null;
      return onHost(room, msg, () => readMetrics(kv, room), now);
    });
    if (!room || auth.hostKey !== room.hostKey) return [NO_ROOM()];
    return [await hostState(kv, room, now)];
  }
  const { room } = await withRoom(kv, code, now);
  if (!room) return [NO_ROOM()];
  const team = room.teams.find((t) => t.id === auth.teamId && t.token === auth.token);
  if (!team) return [err('NO_TEAM', '팀 정보가 없어요. 다시 합류해 주세요.')];
  const progress = await onPlayer(kv, room, team.id, msg, now);
  return progress ? [{ t: 'progress', progress, now }] : [];
}

export async function final(kv, code, hostKey, now = Date.now()) {
  const { room } = await withRoom(kv, code, now);
  if (!room || hostKey !== room.hostKey) return null;
  return finalRows(room).map((t) => ({ id: t.id, name: t.name, color: t.color, crew: t.crew, score: t.score, place: t.place, praise: praiseFor(room, t) }));
}

// ---------- stores ----------
/** In-memory store for local dev and tests (etag = revision counter). */
export function memoryKV() {
  const m = new Map(); let rev = 0;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
    async get(k) { const e = m.get(k); return e ? { data: clone(e.data), etag: e.etag } : null; },
    async cas(k, data, etag) { const e = m.get(k); if ((etag === null && e) || (etag !== null && (!e || e.etag !== etag))) return false; m.set(k, { data: clone(data), etag: String(++rev) }); return true; },
    async put(k, data) { m.set(k, { data: clone(data), etag: String(++rev) }); },
  };
}

/** Netlify Blobs store (strong consistency, conditional writes by ETag). */
export function blobsKV(store) {
  return {
    async get(k) {
      const r = await store.getWithMetadata(k, { type: 'json' });
      if (!r || r.data == null) return null;
      if (!r.etag) throw new Error('NO_ETAG'); // never fall back to an unconditional write
      return { data: r.data, etag: r.etag };
    },
    async cas(k, data, etag) { const r = await store.setJSON(k, data, etag === null ? { onlyIfNew: true } : { onlyIfMatch: etag }); return Boolean(r && r.modified); },
    async put(k, data) { await store.setJSON(k, data); },
  };
}
