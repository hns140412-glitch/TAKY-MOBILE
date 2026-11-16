// TAKY 팀게임 — shared look: round icons, team avatars, theme scenery, sound. No libraries.
'use strict';
(function () {
  const S = (d, vb = '0 0 48 48') => `<svg class="ico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    tap: S('<path d="M20 26V11a3.5 3.5 0 0 1 7 0v11"/><path d="M27 21.5a3.5 3.5 0 0 1 7 0V25"/><path d="M34 24a3.5 3.5 0 0 1 7 0v8c0 7-5 12-12 12h-2c-5 0-8-2-11-6l-6-8a3.4 3.4 0 0 1 5-4.6L20 30"/><path d="M8 9l4 3M23.5 2v3M36 6l-3 3" stroke="var(--accent-2)"/>'),
    shake: S('<rect x="15" y="7" width="18" height="34" rx="4" fill="var(--panel-solid)"/><path d="M21 35h6"/><path d="M8 16c-3 5-3 11 0 16M41 16c3 5 3 11 0 16" stroke="var(--accent-2)"/><path d="M3 12c-4 8-4 16 0 24M46 12c4 8 4 16 0 24" stroke="var(--gold)" opacity=".8"/>'),
    chosung: S('<rect x="5" y="9" width="38" height="30" rx="7" fill="var(--panel-solid)"/><path d="M12 18h9v4M12 26v6h9"/><path d="M27 18v14h9" stroke="var(--accent-2)"/>'),
    english: S('<path d="M8 9h32a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H22l-9 7v-7H8a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z" fill="var(--panel-solid)"/><path d="M12 28l5-13 5 13M13.6 24h6.8"/><path d="M27 15v13M27 23.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0" stroke="var(--accent-2)"/>'),
    hanja: S('<rect x="7" y="7" width="34" height="34" rx="5" fill="var(--panel-solid)"/><path d="M24 13v22M14 20v15h20V20"/><path d="M11 13h26" stroke="var(--bad)" stroke-width="2"/>'),
    math: S('<rect x="6" y="6" width="36" height="36" rx="8" fill="var(--panel-solid)"/><path d="M24 6v36M6 24h36" stroke-width="1.6" opacity=".35"/><path d="M15 11v8M11 15h8"/><path d="M29 15h8" stroke="var(--accent-2)"/><path d="M12 30l6 6M18 30l-6 6" stroke="var(--accent-2)"/><path d="M29 31h8M33 28.5v.1M33 33.5v.1"/>'),
    order: S('<path d="M11 36c4-10 10-2 14-12s10-6 12-13" stroke-dasharray="3 5" stroke-width="2.2"/><circle cx="11" cy="36" r="5" fill="var(--panel-solid)"/><circle cx="25" cy="24" r="5" fill="var(--panel-solid)"/><circle cx="37" cy="11" r="5" fill="var(--accent-2)" stroke="var(--accent-2)"/>'),
    memory: S('<rect x="7" y="7" width="9" height="9" rx="2"/><rect x="19.5" y="7" width="9" height="9" rx="2" fill="var(--gold)" stroke="var(--gold)"/><rect x="32" y="7" width="9" height="9" rx="2"/><rect x="7" y="19.5" width="9" height="9" rx="2"/><rect x="19.5" y="19.5" width="9" height="9" rx="2"/><rect x="32" y="19.5" width="9" height="9" rx="2" fill="var(--accent-2)" stroke="var(--accent-2)"/><rect x="7" y="32" width="9" height="9" rx="2" fill="var(--gold)" stroke="var(--gold)"/><rect x="19.5" y="32" width="9" height="9" rx="2"/><rect x="32" y="32" width="9" height="9" rx="2"/>'),
    arrow: S('<path d="M30 12H10m0 0l7-7m-7 7l7 7"/><path d="M18 36h20m0 0l-7-7m7 7l-7 7" stroke="var(--accent-2)"/>'),
    stroop: S('<path d="M24 5C12.4 5 5 13 5 22.5 5 31 11 36 17 36c3 0 3.6 2.4 3 4.5-.8 2.6 1.4 3.5 4 3.5C35.6 44 43 35 43 24 43 13.5 35 5 24 5z" fill="var(--panel-solid)"/><circle cx="15" cy="20" r="3.4" fill="var(--bad)" stroke="none"/><circle cx="24" cy="13" r="3.4" fill="var(--gold)" stroke="none"/><circle cx="33" cy="19" r="3.4" fill="var(--good)" stroke="none"/><circle cx="34" cy="30" r="3.4" fill="var(--accent)" stroke="none"/>'),
    react: S('<rect x="15" y="3" width="18" height="42" rx="9" fill="var(--panel-solid)"/><circle cx="24" cy="13" r="4.4" opacity=".35"/><circle cx="24" cy="24" r="4.4" opacity=".35"/><circle cx="24" cy="35" r="4.6" fill="var(--good)" stroke="var(--good)"/><path d="M7 33l4 1M41 33l-4 1M9 26h3M39 26h-3" stroke="var(--good)"/>'),
    ox: S('<circle cx="15" cy="24" r="9" stroke="var(--accent)" stroke-width="4"/><path d="M30 15l14 18M44 15L30 33" stroke="var(--bad)" stroke-width="4"/>'),
    compass: S('<circle cx="24" cy="24" r="18" fill="var(--panel-solid)"/><path d="M24 9v3M24 36v3M9 24h3M36 24h3" stroke-width="2"/><path d="M30 18l-3.5 8.5L18 30l3.5-8.5z" fill="var(--accent-2)" stroke="var(--accent-2)" stroke-width="1.6"/><circle cx="24" cy="24" r="1.6" fill="currentColor"/>'),
    spell: S('<path d="M10 38l4-12 20-20 8 8-20 20z" fill="var(--panel-solid)"/><path d="M14 26l8 8"/><path d="M28 40l5 5 10-12" stroke="var(--good)"/>'),
    opposite: S('<path d="M6 24h36"/><path d="M14 16l-8 8 8 8"/><path d="M34 16l8 8-8 8" stroke="var(--accent-2)"/>'),
    engspell: S('<rect x="4" y="10" width="40" height="28" rx="6" fill="var(--panel-solid)"/><path d="M9 31l5-13 5 13M10.6 27h6.8"/><path d="M23 32h8" stroke="var(--accent-2)" stroke-width="3"/><path d="M35 20h6M35 20v11h6"/>'),
    proverb: S('<path d="M12 8h26v28a6 6 0 0 1-6 6H10a4 4 0 0 1-4-4v-4h26" fill="var(--panel-solid)"/><path d="M17 16h16M17 23h11" stroke="var(--accent-2)"/>'),
    unit: S('<rect x="4" y="16" width="40" height="16" rx="3" fill="var(--panel-solid)"/><path d="M10 16v7M16 16v4M22 16v7M28 16v4M34 16v7M40 16v4"/>'),
    odd: S('<circle cx="14" cy="14" r="7" fill="var(--panel-solid)"/><circle cx="34" cy="14" r="7" fill="var(--panel-solid)"/><circle cx="14" cy="34" r="7" fill="var(--panel-solid)"/><rect x="27" y="27" width="14" height="14" rx="2" fill="var(--accent-2)" stroke="var(--accent-2)"/>'),
    bigger: S('<path d="M10 12l24 12-24 12" stroke-width="4"/><circle cx="40" cy="24" r="3" fill="var(--accent-2)" stroke="var(--accent-2)"/>'),
    next: S('<circle cx="8" cy="36" r="3"/><circle cx="18" cy="29" r="3"/><circle cx="28" cy="22" r="3"/><path d="M34 9a4.5 4.5 0 1 1 5.5 4.4c-1.2.6-1.5 1.6-1.5 3.1M38 22.5v.1" stroke="var(--accent-2)"/>'),
    alt: S('<ellipse cx="16" cy="31" rx="6" ry="9" fill="var(--panel-solid)"/><ellipse cx="32" cy="17" rx="6" ry="9" fill="var(--accent-2)" stroke="var(--accent-2)"/><path d="M13 44h6M29 30h6" stroke-width="2"/>'),
    stop: S('<circle cx="24" cy="27" r="16" fill="var(--panel-solid)"/><path d="M19 5h10M24 5v6M24 27V17"/><path d="M24 27l7 5" stroke="var(--accent-2)"/>'),
    nonsense: S('<path d="M17 31a12 12 0 1 1 14 0v5H17z" fill="var(--panel-solid)"/><path d="M18 41h12M20 45h8"/><path d="M21 22l3 4 3-4" stroke="var(--accent-2)"/>'),
    capital: S('<circle cx="24" cy="24" r="17" fill="var(--panel-solid)"/><path d="M7 24h34M24 7c6 6 6 28 0 34M24 7c-6 6-6 28 0 34" stroke-width="1.8"/><circle cx="31" cy="17" r="4" fill="var(--bad)" stroke="var(--bad)"/>'),
    trivia: S('<path d="M8 8h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-9 7v-7H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="var(--panel-solid)"/><path d="M20 16a4 4 0 1 1 5 4c-1 .8-1 2-1 3M24 28v.1" stroke="var(--accent-2)"/>'),
    gift: S('<rect x="7" y="20" width="34" height="22" rx="3" fill="var(--panel-solid)"/><rect x="5" y="13" width="38" height="8" rx="2" fill="var(--gold)" stroke="var(--gold)"/><path d="M24 13v29" stroke="var(--bad)" stroke-width="3"/><path d="M24 13c-4-8-14-6-10 0M24 13c4-8 14-6 10 0"/>'),
    flag: S('<path d="M12 43V6"/><path d="M12 7h24l-6 7 6 7H12" fill="var(--gold)" stroke="var(--gold)"/>'),
  };
  function icon(id) { return ICONS[id] || ICONS.compass; }

  // Text colour that stays readable on a team colour (WCAG: pick the higher-contrast of white / deep navy).
  function inkOn(hex) {
    const h = String(hex).replace('#', ''); if (h.length !== 6) return '#fff';
    const L = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
    return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0662 ? '#FFFFFF' : '#1B2238';
  }

  // Team avatar: crew character in the learning pack, emblem badge in the event pack.
  function avatar(team, size, pack) {
    if (!team) return '';
    if (pack !== 'event' && team.crew) return `<img class="ava" src="art/crew/${String(team.crew).padStart(2, '0')}.webp" alt="" style="height:${size}px;width:auto" draggable="false">`;
    const ch = [...String(team.name || '?').replace(/팀$/, '')][0] || '?';
    return `<span class="emb" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px;background:${team.color};color:${inkOn(team.color)}">${esc(ch)}</span>`;
  }


  // Live "how to play" phone mock for the big screen intro (replaces a demo video: no download, matches the theme).
  const DEMO_Q = {
    chosung: ['ㅅㄱ', '과일', ['사과', '수건', '시계', '상자'], 0], english: ['apple', '', ['사과', '바다', '연필', '구름'], 0],
    hanja: ['山', '뜻과 소리', ['메 산', '물 수', '불 화', '나무 목'], 0], math: ['3 + 4', '', ['7', '6', '8', '12'], 0],
    arrow: ['←', '반대쪽!', ['←', '→'], 1], stroop: ['파랑', '글자 색', ['빨강', '파랑', '초록', '노랑'], 0], ox: ['해는 동쪽에서 떠요', '', ['O', 'X'], 0],
    spell: ['그릇 씻기', '바르게 쓴 말은?', ['설거지', '설겆이'], 0], opposite: ['크다', '반대말은?', ['작다', '길다', '높다', '빠르다'], 0],
    engspell: ['c a _', '고양이', ['t', 'm', 'p', 'd'], 0], proverb: ['티끌 모아 …', '뒷부분은?', ['태산', '바다', '보물', '모래'], 0],
    unit: ['3m', '몇 cm?', ['300cm', '30cm', '3000cm', '360cm'], 0], odd: ['다른 하나는?', '', ['사과', '포도', '기차', '수박'], 2],
    bigger: ['더 큰 수는?', '', ['748', '847'], 1], next: ['2 · 4 · 6 · ?', '', ['8', '7', '9', '10'], 0],
    nonsense: ['왕이 넘어지면?', '', ['킹콩', '우하하', '피자', '언덕'], 0], capital: ['프랑스', '수도는?', ['파리', '런던', '로마', '베를린'], 0],
    trivia: ['거미 다리는?', '', ['8개', '6개', '10개', '4개'], 0],
  };
  function demo(id, color) {
    const c = color || 'var(--accent-2)';
    let body = '';
    if (id === 'tap' || id === 'shake') body = `<div class="dm-tap ${id}" style="background:${c};color:${inkOn(color || '#F08A3C')}">${id === 'shake' ? '흔들어요!' : '눌러요!'}<i class="dm-finger">${ICONS.tap}</i></div>`;
    else if (DEMO_Q[id]) { const [big, small, ch, ans] = DEMO_Q[id]; body = `<div class="dm-q"><b style="${id === 'stroop' ? 'color:var(--bad)' : ''}">${big}</b>${small ? `<small>${small}</small>` : ''}</div><div class="dm-ch ${ch.length === 2 ? 'two' : ''}">${ch.map((x, i) => `<span class="${i === ans ? 'ok' : ''}">${x}</span>`).join('')}</div>`; }
    else if (id === 'order') body = `<div class="dm-hint">다음 숫자 <b>1</b></div><div class="dm-grid g12">${[7, 2, 11, 1, 9, 4, 12, 3, 6, 10, 5, 8].map((n) => `<span class="${n <= 3 ? 'go n' + n : ''}">${n}</span>`).join('')}</div>`;
    else if (id === 'memory') body = `<div class="dm-hint">잘 보고 따라 눌러요</div><div class="dm-grid g9">${Array.from({ length: 9 }, (_, i) => `<span class="${[4, 0, 8].includes(i) ? 'lit l' + [4, 0, 8].indexOf(i) : ''}"></span>`).join('')}</div>`;
    else if (id === 'alt') body = `<div class="dm-hint">번갈아 콩콩!</div><div class="dm-feet"><span class="a">왼발</span><span class="b">오른발</span></div>`;
    else if (id === 'stop') body = `<div class="dm-stop">${stopwatch('dmsw')}<b>5.00?</b></div><div class="dm-btn">멈춰!</div>`;
    else if (id === 'react') body = `<div class="dm-react"><span class="w">기다려요…</span><span class="g">지금!</span></div>`;
    return `<div class="demo" aria-label="폰에서 하는 방법"><div class="dm-phone"><div class="dm-notch"></div>${body}</div><p class="dm-cap">폰에서는 이렇게!</p></div>`;
  }

  // Theme scenery, drawn once per theme into #scene.
  const SCENES = {
    island: () => `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"/><stop offset=".72" stop-color="var(--sky-bottom)"/></linearGradient>
      <linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mount-far)"/><stop offset="1" stop-color="var(--mount-far)" stop-opacity=".55"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#sk)"/>
      <g fill="#fff" opacity=".85"><path d="M190 150c0-22 26-34 44-22 8-20 42-22 52 0 22-6 36 10 30 26H196c-4 0-6-2-6-4z"/><path d="M1180 110c0-18 22-28 36-18 7-16 34-18 42 0 18-5 29 8 24 21h-96c-4 0-6-1-6-3z"/><path d="M1380 220c0-14 17-22 28-14 5-12 26-14 32 0 14-4 23 6 19 16h-74c-3 0-5-1-5-2z" opacity=".7"/></g>
      <path d="M-20 620L180 360 300 470 470 260 640 480 760 400 930 560 1080 330 1230 470 1360 380 1620 600V900H-20z" fill="url(#mf)"/>
      <g fill="var(--mount-snow)"><path d="M470 260l-48 62 22-6 26 18 22-22 26 12z"/><path d="M1080 330l-44 56 22-4 22 14 20-18 24 8z"/><path d="M180 360l-36 46 18-4 18 10 16-14 18 6z"/><path d="M1360 380l-30 36 16-3 14 9 13-11 15 4z"/></g>
      <path d="M-20 700C200 610 380 650 560 640s360-70 560-40 330 30 500 0V900H-20z" fill="var(--hill)"/>
      <g fill="var(--hill-2)">${[80, 132, 1290, 1340, 1395, 1450, 1500].map((x, i) => `<path d="M${x} ${690 - (i % 3) * 14}l-24 52h14l-20 40h60l-20-40h14z"/>`).join('')}</g>
      <path d="M-20 790C260 740 520 760 800 750s560-30 820 10V900H-20z" fill="var(--hill-2)"/>
      <path d="M-20 850C300 820 600 830 900 826s520 4 720 20V900H-20z" fill="var(--ground)"/>
    </svg>`,
    stage: () => `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14183A"/><stop offset="1" stop-color="var(--bg)"/></linearGradient>
      <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B7AEFF" stop-opacity=".32"/><stop offset="1" stop-color="#B7AEFF" stop-opacity="0"/></linearGradient>
      <linearGradient id="cone2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FF3EA" stop-opacity=".22"/><stop offset="1" stop-color="#7FF3EA" stop-opacity="0"/></linearGradient>
      <radialGradient id="floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7C6CFF" stop-opacity=".35"/><stop offset="1" stop-color="#7C6CFF" stop-opacity="0"/></radialGradient></defs>
      <rect width="1600" height="900" fill="url(#bk)"/>
      <path d="M330 -10h60l200 900H40z" fill="url(#cone)"/><path d="M1210 -10h60l290 900h-470z" fill="url(#cone)"/><path d="M770 -10h60l140 900H630z" fill="url(#cone2)"/>
      <ellipse cx="800" cy="900" rx="900" ry="150" fill="url(#floor)"/>
      <g fill="#fff" opacity=".5">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 397) % 1600}" cy="${(i * 211) % 420}" r="${i % 3 ? 1.2 : 2}"/>`).join('')}</g>
    </svg>`,
    paper: () => `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#D9D5CA"/></pattern></defs><rect width="1600" height="900" fill="url(#dots)"/></svg>`,
  };
  let drawn = '';
  // Island = painted scene art (--art set by the page), other themes = SVG scenery.
  function scene(theme) {
    let el = document.getElementById('scene');
    if (!el) { el = document.createElement('div'); el.id = 'scene'; document.body.prepend(el); }
    if (drawn === theme) return; drawn = theme;
    el.innerHTML = theme === 'island' || !SCENES[theme] ? '<div class="paint"></div><div class="veil"></div>' : SCENES[theme]();
  }
  function art(name) { document.body.style.setProperty('--art', `url(art/scenes/${name}.webp)`); }

  // Rosette medal (case review: podium rosettes). place 0/1/2 = gold/silver/bronze, else navy.
  const ROS = [['#F6C945', '#C9952B', '#FFE79A'], ['#C9D3DD', '#8F9DAC', '#F4F7FA'], ['#E29A6C', '#AE6639', '#F8CDAE']];
  function rosette(place, size = 96) {
    const [c, d, hi] = ROS[place] || ['#2F5DA8', '#1E3A6E', '#7FA3E0'], n = 18;
    const bumps = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx="${50 + 34 * Math.cos(a)}" cy="${44 + 34 * Math.sin(a)}" r="9"/>`; }).join('');
    const ink = place > 2 || place < 0 ? '#FFF8EA' : '#2A1E00';
    return `<svg class="rosette" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}" aria-hidden="true">
      <path d="M30 64L18 116l16-9 10 13 8-50z" fill="${d}"/><path d="M70 64l12 52-16-9-10 13-8-50z" fill="${d}"/>
      <path d="M30 64L18 116l16-9 10 13 8-50z" fill="#1E3A6E" opacity=".55"/><path d="M70 64l12 52-16-9-10 13-8-50z" fill="#1E3A6E" opacity=".55"/>
      <g fill="${d}">${bumps}</g><circle cx="50" cy="44" r="34" fill="${c}"/><circle cx="50" cy="44" r="26" fill="none" stroke="${hi}" stroke-width="2.5" stroke-dasharray="3 3"/>
      <path d="M26 30a30 30 0 0 1 30-16" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".55"/>
      <text x="50" y="${44 + 12}" text-anchor="middle" font-family="Jua, sans-serif" font-size="34" fill="${ink}">${place >= 0 ? place + 1 : ''}</text></svg>`;
  }
  // Stopwatch with a pie wedge for time left (case review: countdown timers). Call wedge(frac) to update.
  function wedge(frac) {
    const f = Math.max(0, Math.min(0.9999, frac)), a = f * Math.PI * 2, r = 38, cx = 60, cy = 68;
    if (f <= 0) return '';
    return `M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}Z`;
  }
  function stopwatch(id) {
    return `<svg class="stopwatch" viewBox="0 0 120 120" aria-hidden="true">
      <rect x="51" y="4" width="18" height="12" rx="3" fill="var(--navy)"/><rect x="45" y="0" width="30" height="8" rx="4" fill="var(--gold)"/>
      <path d="M92 26l8-8 6 6-8 8z" fill="var(--navy)"/>
      <circle cx="60" cy="68" r="50" fill="var(--navy)"/><circle cx="60" cy="68" r="44" fill="#FFF8EA"/>
      <g stroke="#1E3A6E" stroke-width="2.4" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d="M${60 + 40 * Math.sin(a)} ${68 - 40 * Math.cos(a)}L${60 + 36 * Math.sin(a)} ${68 - 36 * Math.cos(a)}"/>`; }).join('')}</g>
      <path id="${id}" d="${wedge(1)}" fill="var(--accent-2)" opacity=".9"/>
      <circle cx="60" cy="68" r="22" fill="#FFF8EA"/></svg>`;
  }
  // Fixed comic backdrop for countdowns.
  function comic() { return `<div class="comic-bg" aria-hidden="true">${[[6, 14], [90, 10], [14, 70], [84, 64], [48, 6], [94, 40]].map(([x, y], i) => `<i class="star" style="left:${x}%;top:${y}%;transform:rotate(${i * 17}deg) scale(${0.7 + (i % 3) * 0.25})"></i>`).join('')}</div>`; }
  function setThemeAttr(t) { document.documentElement.dataset.theme = t; scene(t); }

  // Small synthesized sounds (WebAudio). Unlocks on the first touch/click/key.
  let ac = null, muted = false;
  const unlock = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { ac = null; } };
  ['pointerdown', 'keydown'].forEach((e) => addEventListener(e, unlock, { passive: true }));
  function tone(f, at, dur, type = 'triangle', vol = 0.18) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + dur + 0.02);
  }
  const SFX = {
    tick: [[660, 0, 0.12]], go: [[784, 0, 0.12], [1046, 0.1, 0.32]],
    ok: [[880, 0, 0.08], [1318, 0.07, 0.16]], no: [[220, 0, 0.18, 'square', 0.08]],
    tap: [[520, 0, 0.05, 'sine', 0.08]], join: [[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.2]],
    reveal: [[392, 0, 0.12], [523, 0.1, 0.24]], end: [[784, 0, 0.14], [587, 0.14, 0.14], [392, 0.28, 0.3]],
    fanfare: [[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1046, 0.4, 0.5], [784, 0.4, 0.5, 'sine', 0.1]],
  };
  function sfx(name) { if (muted || !ac || !SFX[name]) return; const t = ac.currentTime + 0.01; SFX[name].forEach(([f, d, dur, type, vol]) => tone(f, t + d, dur, type, vol)); }
  function setMuted(m) { muted = !!m; }

  window.UI = { icon, inkOn, demo, avatar, scene, art, rosette, stopwatch, wedge, comic, setThemeAttr, sfx, setMuted };
})();
