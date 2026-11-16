// TAKY 팀게임 BGM — original loops composed for this game and played live with Web Audio (no audio files, no outside music).
// Family pack = bright adventure (C major, marimba-like pluck). Company pack = upbeat show (A minor, four-on-the-floor).
// One loop per scene: lobby · intro · play · result · final. Host/TV screen only; phones never load this file.
// License: TAKY original, free to use (see art/PROVENANCE.json "bgm").
'use strict';
(function () {
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  const PROG = {
    learn: [[48, MAJ], [43, MAJ], [45, MIN], [41, MAJ]], // C G Am F
    event: [[45, MIN], [41, MAJ], [48, MAJ], [43, MAJ]], // Am F C G
  };
  // 4-bar hooks, 16 steps a bar (null = rest). Written for this game.
  const _ = null;
  const HOOK = {
    learn: [
      [76, _, 79, _, 84, _, 79, _, 76, _, 74, _, 72, _, _, _],
      [74, _, 79, _, 83, _, 79, _, 74, _, _, _, 71, _, _, _],
      [72, _, 76, _, 81, _, 76, _, 72, _, 71, _, 69, _, _, _],
      [69, _, 72, _, 77, _, 81, _, 79, _, _, _, _, _, _, _],
    ],
    event: [
      [69, _, _, 72, _, _, 76, _, 81, _, _, 79, _, 76, _, _],
      [77, _, _, 76, _, _, 72, _, 69, _, _, _, _, _, _, _],
      [67, _, _, 72, _, _, 76, _, 79, _, _, 76, _, 72, _, _],
      [71, _, _, 74, _, _, 79, _, _, _, 71, _, 74, _, _, _],
    ],
  };
  // Scene recipes: tempo and which layers play.
  const SCENES = {
    lobby: { learn: { bpm: 96, pad: 1, arp: 'eighth', hat: 'soft' }, event: { bpm: 112, pad: 1, arp: 'eighth', kick: 'half', hat: 'off' } },
    intro: { learn: { bpm: 120, pulse: 1, hat: 'roll' }, event: { bpm: 128, pulse: 1, hat: 'roll', kick: 'four' } },
    play: { learn: { bpm: 126, arp: 'six', bass: 1, kick: 'half', snare: 1, hat: 'eighth', hook: 0.6 }, event: { bpm: 132, arp: 'six', bass: 1, kick: 'four', snare: 1, hat: 'off', hook: 0.5 } },
    result: { learn: { bpm: 100, pad: 1, arp: 'eighth', fanfare: 1, hat: 'soft' }, event: { bpm: 116, pad: 1, arp: 'eighth', fanfare: 1, kick: 'half', hat: 'off' } },
    final: { learn: { bpm: 112, pad: 1, arp: 'six', bass: 1, kick: 'half', snare: 1, hat: 'eighth', hook: 1 }, event: { bpm: 120, pad: 1, arp: 'six', bass: 1, kick: 'four', snare: 1, hat: 'off', hook: 1 } },
  };
  const LEVEL = { lobby: 1.1, intro: 0.9, play: 0.8, result: 1.0, final: 0.95 }; // under the sound effects

  let ac = null, out = null, noise = null, timer = null, on = true, muted = false;
  let cur = null, pack = 'learn', step = 0, nextT = 0, startedAt = 0;

  function ensure() {
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function env(t, vol, a, dur, node) { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(node || out); return g; }
  function osc(type, f, t, dur, vol, a = 0.008, cutoff) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    let dest = env(t, vol, a, dur);
    if (cutoff) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.connect(dest); dest = lp; }
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function hit(t, kind, vol) {
    if (kind === 'kick') { const o = ac.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); o.connect(env(t, vol, 0.003, 0.22)); o.start(t); o.stop(t + 0.3); return; }
    const s = ac.createBufferSource(); s.buffer = noise; const f = ac.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
    s.connect(f); f.connect(env(t, vol, 0.002, kind === 'hat' ? 0.05 : 0.14)); s.start(t); s.stop(t + 0.2);
  }
  const pluck = (p, f, t, vol) => (p === 'learn' ? osc('triangle', f, t, 0.32, vol, 0.004) : osc('sawtooth', f, t, 0.22, vol * 0.7, 0.004, 2400));

  function playStep(i, t) {
    const R = SCENES[cur][pack], s = i % 16, bar = Math.floor(i / 16) % 4, [root, q] = PROG[pack][bar], beat = 60 / R.bpm;
    const tones = q.map((x) => root + x);
    if (R.pad && s === 0) tones.forEach((n) => osc('sine', midi(n + 12), t, beat * 4 * 0.98, 0.035, 0.25));
    if (R.arp) {
      const every = R.arp === 'eighth' ? 2 : 1;
      if (s % every === 0 && (R.arp !== 'six' || [0, 3, 6, 8, 11, 14].includes(s))) pluck(pack, midi(tones[(s / every) % 3 | 0] + 24), t, R.arp === 'six' ? 0.05 : 0.06);
    }
    if (R.bass && [0, 3, 6, 8, 11, 14].includes(s)) osc(pack === 'learn' ? 'triangle' : 'square', midi(root - 12 + (s === 14 ? 7 : 0)), t, beat * 0.45, pack === 'learn' ? 0.12 : 0.05, 0.005, 900);
    if (R.pulse && s % 4 === 0) osc('triangle', midi(root - 12 + Math.min(12, Math.floor((t - startedAt) / beat))), t, beat * 0.6, 0.1, 0.005, 1200);
    if (R.kick === 'four' && s % 4 === 0) hit(t, 'kick', 0.22);
    if (R.kick === 'half' && s % 8 === 0) hit(t, 'kick', 0.18);
    if (R.snare && (s === 4 || s === 12)) hit(t, 'snare', 0.07);
    if (R.hat === 'eighth' && s % 2 === 0) hit(t, 'hat', 0.025);
    if (R.hat === 'soft' && s % 4 === 2) hit(t, 'hat', 0.015);
    if (R.hat === 'off' && s % 4 === 2) hit(t, 'hat', 0.035);
    if (R.hat === 'roll') hit(t, 'hat', 0.01 + 0.03 * Math.min(1, (t - startedAt) / 5));
    if (R.hook) { const n = HOOK[pack][bar][s]; if (n) osc(pack === 'learn' ? 'square' : 'sawtooth', midi(n), t, beat * 0.55, 0.035 * R.hook, 0.01, 3200); }
    if (R.fanfare && i < 16 && [0, 2, 4, 8].includes(s)) { const f = [0, 4, 7, 12][[0, 2, 4, 8].indexOf(s)]; osc('square', midi(root + 24 + f), t, s === 8 ? beat * 2 : beat * 0.45, 0.05, 0.005, 3500); }
  }
  function pump() {
    if (!cur || !ac) return;
    const beat = 60 / SCENES[cur][pack].bpm;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += beat / 4; step++; }
  }
  function level() { if (!ac) return; const v = on && !muted && cur ? LEVEL[cur] : 0; out.gain.cancelScheduledValues(ac.currentTime); out.gain.setTargetAtTime(v, ac.currentTime, 0.25); }
  function scene(name, p) {
    const want = SCENES[name] ? name : null, wantPack = p === 'event' ? 'event' : 'learn';
    if (want === cur && wantPack === pack) return;
    cur = want; pack = wantPack; step = 0;
    if (!cur) { level(); clearInterval(timer); timer = null; return; }
    if (!on || !ensure()) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    startedAt = ac.currentTime; nextT = ac.currentTime + 0.08; level();
    if (!timer) timer = setInterval(pump, 40);
  }
  function setOn(v) { on = !!v; if (on && cur) { const c = cur; cur = null; scene(c, pack); } else level(); }
  function setMuted(m) { muted = !!m; level(); }
  // Browsers start sound only after a tap or key press: resume then.
  const wake = () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); if (on && cur && !ac) { const c = cur; cur = null; scene(c, pack); } };
  addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  window.BGM = { scene, setOn, setMuted, get on() { return on; }, _recipe: { SCENES, PROG, HOOK, playStepFor: (ctx, p, sc, seconds) => render(ctx, p, sc, seconds) } };

  // Offline render, used by tests to check level and clipping without speakers.
  function render(ctx, p, sc, seconds) {
    const saved = { ac, out, noise, cur, pack };
    ac = ctx; out = ctx.createGain(); out.gain.value = LEVEL[sc]; out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    cur = sc; pack = p; startedAt = 0; const beat = 60 / SCENES[sc][p].bpm;
    for (let i = 0, t = 0.02; t < seconds; i++, t += beat / 4) playStep(i, t);
    ({ ac, out, noise, cur, pack } = saved);
  }
})();
