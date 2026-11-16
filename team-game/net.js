// Polling client for the team game API (works on Netlify Functions; no sockets needed).
// Same surface the screens used with WebSocket: Net(onOpen, onMsg, onStatus) -> { send, now, offset, close }.
// The first 'host' / 'rejoin' / 'join' message sets who we are; after that the client polls,
// fast while a round runs and slow otherwise, and only hands the screen real changes.
// Only one request is ever in flight per screen: the server relies on each key having one writer
// that writes in order. Taps queued behind a slow request are merged into one message.
// window.TG_VIEW_ONLY (the TV screen) polls as a read-only host.
window.TG_API = new URL('api/', location.href).href;
window.Net = function Net(onOpen, onMsg, onStatus) {
  let auth = null, closed = false, timer = null, busy = false, ok = null, fails = 0, last = null, lastPhase = 'lobby';
  const queue = [];
  const role = () => (auth && auth.hostKey ? 'host' : 'player');
  const api = {
    offset: 0,
    now() { return Date.now() + api.offset; },
    close() { closed = true; clearTimeout(timer); },
    drop() { last = null; },
    send(m) {
      if (m.t === 'host') auth = { code: m.code, hostKey: m.hostKey, ...(window.TG_VIEW_ONLY ? { view: true } : {}) };
      else if (m.t === 'rejoin') auth = { code: m.code, teamId: m.teamId, token: m.token };
      else if (m.t === 'join') auth = { code: m.code };
      else if (m.t === 'peek' && !auth) auth = { code: m.code };
      if (!auth) return;
      const tail = queue[queue.length - 1];
      if (m.t === 'count' && tail && tail.t === 'count') { tail.n = Math.min(60, tail.n + m.n); return; }
      queue.push({ ...m }); pump();
    },
  };
  async function pump() {
    if (busy || !queue.length) return;
    busy = true; clearTimeout(timer);
    const m = queue.shift();
    const sent = await call('send', { auth, msg: m });
    if (!sent && m.t !== 'count' && m.t !== 'host' && m.t !== 'rejoin') queue.unshift(m); // retry commands and answers in order
    busy = false;
    if (queue.length) setTimeout(pump, sent ? 0 : 800); else schedule(m.t === 'host' || m.t === 'rejoin' || m.t === 'join' ? 0 : undefined);
  }
  function status(v) { if (v !== ok) { ok = v; onStatus && onStatus(v); } }
  async function call(route, body) {
    const t0 = Date.now();
    try {
      const r = await fetch(TG_API + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const rtt = Date.now() - t0; if (j.now) api.offset = j.now + rtt / 2 - Date.now();
      fails = 0; status(true);
      (j.msgs || []).forEach(deliver);
      return true;
    } catch (e) { fails++; if (fails >= 2) status(false); return false; }
  }
  const strip = (s) => { const { now, live, progress, ...rest } = s; return JSON.stringify(rest); }; // eslint-disable-line no-unused-vars
  function deliver(m) {
    if (m.t === 'joined') { auth = { code: m.code || auth.code, teamId: m.teamId, token: m.token }; onMsg(m, api); return; }
    if (m.t !== 'state') { onMsg(m, api); return; }
    lastPhase = m.phase;
    const key = strip(m);
    if (last && key === last.key) {
      if (m.live && JSON.stringify(m.live) !== last.live) onMsg({ t: 'live', live: m.live, now: m.now }, api);
      if (m.progress && JSON.stringify(m.progress) !== last.progress) onMsg({ t: 'progress', progress: m.progress, now: m.now }, api);
    } else onMsg(m, api);
    last = { key, live: JSON.stringify(m.live || null), progress: JSON.stringify(m.progress || null) };
  }
  function interval() {
    if (document.hidden) return role() === 'host' && !window.TG_VIEW_ONLY ? 2000 : 5000; // the controlling screen keeps rounds moving
    if (fails) return Math.min(5000, 600 * 2 ** (fails - 1));
    const busy = lastPhase === 'play' || lastPhase === 'intro';
    return role() === 'host' ? (busy ? 600 : 1500) : (busy ? 1000 : 1800);
  }
  function schedule(ms) { clearTimeout(timer); if (!closed) timer = setTimeout(tick, ms === undefined ? interval() : ms); }
  async function tick() {
    if (closed) return;
    if (!auth || !auth.token && !auth.hostKey || busy || queue.length) return schedule();
    busy = true; await call('poll', { auth }); busy = false;
    if (queue.length) pump(); else schedule();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setTimeout(() => { status(true); onOpen(api); }, 0);
  return api;
};
window.store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
window.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
