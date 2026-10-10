/* ============================================================
   TSM · bucle de juego, cámara, HUD, menús, entrada, progreso
   ============================================================ */
(function (root) {
  'use strict';
  const S = root.TSM_SIM, D = root.TSM_DRAW, AU = root.TSM_AUDIO;
  const W = D.W, H = D.H, FLOOR = D.FLOOR;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = id => document.getElementById(id);

  // ----------------------------------------------------------- progreso
  const SAVE_KEY = 'tsm_progreso_v1';
  const save = { wins: 0, losses: 0, fights: 0, streak: 0, bestStreak: 0, kos: 0, pool: 0, fastest: 0, decisions: 0, knockedDown: 0, muted: false, voices: true };
  function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); Object.assign(save, s); } catch (e) { } }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
  function currentBelt() { let b = null; for (const belt of D.BELTS) if (save.wins >= belt.wins) b = belt; return b; }
  function nextBelt() { for (const belt of D.BELTS) if (save.wins < belt.wins) return belt; return null; }

  // ----------------------------------------------------------- estado global
  const G = {
    canvas: null, ctx: null, cw: 0, ch: 0, dpr: 1,
    screen: 'title',       // title intro fight pool corner over
    sim: null, t: 0, acc: 0, last: 0,
    cam: { x: 0, y: 0, scale: 1, vw: W, shake: 0, zoom: 1, zoomT: 0, orbit: 0, lookX: null, lookY: null, camH: 0.4 },
    fx: { parts: [], texts: [], flash: 0, slow: 0, ring: [] },
    crowd: { excite: 0.2, cheer: 0 },
    ticker: { text: '', t: 0, who: '' },
    intro: { t: 0, step: 0 },
    pool: { t: 0 },
    corner: { t: 0 },
    touch: false, paused: false,
    input: { held: new Set(), pressed: new Set() },
    stats: null, lastSayAt: 0, roundCard: { text: '', t: 0 },
    results: null,
  };

  // ----------------------------------------------------------- utilidades de FX
  function addText(text, x, y, opts) { G.fx.texts.push(Object.assign({ text, x, y, t: 0, life: 0.9, size: 26, color: '#fff', stroke: '#2a0a0a', vy: -40, rot: (Math.random() - 0.5) * 0.4 }, opts || {})); }
  function burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts && opts.speed || 180) * (0.4 + Math.random());
      G.fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.5 + Math.random() * 0.5, r: 2 + Math.random() * 3, color: (opts && opts.color) || '#fff', g: 400, kind: (opts && opts.kind) || 'dot' });
    }
  }
  function sweat(f) {
    if (Math.random() < f.sweat * 0.25) G.fx.parts.push({ x: f.x + (Math.random() - 0.5) * 30, y: FLOOR - 215 + Math.random() * 20, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 80, t: 0, life: 0.6, r: 2 + Math.random() * 1.5, color: 'rgba(180,220,255,0.9)', g: 500, kind: 'drop' });
  }
  function shake(a) { G.cam.shake = Math.max(G.cam.shake, a); }
  function say(text, who) { G.ticker = { text, t: 0, who: who || '' }; G.lastSayAt = G.t; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Frases épicas reales de los protagonistas
  const QUOTES = {
    muslera: {
      frances: 'Yo te puedo hablar en francés: como tú tapel, yo llameg Musler.',
      gordo: 'Un gordo en un súper es un súper gordo.',
      anal: '¡Y se la metí por detrás, por el culo, anal!',
      bajas: '¿Bajas tío? Eh eh eh eh ¿bajas? Eh eh ¿bajas?',
    },
    oscar: {
      btc: 'Compra BTC, bro.',
      especular: 'Especular e invertir no es lo mismo, bro.',
      dios: 'Soy Dios.',
      marito: '¡Maritocracia!',
      trump: '¡Viva Trump!',
    },
  };
  G.bubbles = []; G.quoteCd = { muslera: 0, oscar: 0 };
  function quote(who, key, opts) {
    opts = opts || {};
    const text = QUOTES[who][key]; if (!text) return;
    if (!opts.force && G.t < G.quoteCd[who]) return;
    G.quoteCd[who] = G.t + (opts.cooldown || 6);
    G.bubbles = G.bubbles.filter(b => b.who !== who);
    const life = Math.max(2.6, 1.2 + text.length * 0.055);
    G.bubbles.push({ who, text, t: 0, life });
    speak(who, text);
  }
  function speak(who, text) {
    if (!save.voices || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/¡|!|¿/g, '').replace('llameg', 'yamej').replace('tapel', 'tapél'));
      u.lang = 'es-ES'; u.rate = who === 'muslera' ? 1.0 : 1.12; u.pitch = who === 'muslera' ? 0.65 : 1.15; u.volume = save.muted ? 0 : 1;
      const voices = speechSynthesis.getVoices(); const es = voices.filter(v => /^es/i.test(v.lang));
      if (es.length) u.voice = es[who === 'muslera' ? 0 : Math.min(1, es.length - 1)];
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { }
  }

  const LINES = {
    hitO: ['Oscar conecta. Muslera ni lo ha visto venir.', 'Jab limpio de Oscar. Las manos, Muslera, LAS MANOS.', 'Oscar pega como quien firma un autógrafo.', 'Golpe de Oscar. Alguien en el público ha dicho "uf".', 'Oscar encuentra la cara de Muslera. No era difícil: la guardia está en el sótano.', 'Directo de Oscar. El perro ha mirado hacia otro lado.'],
    hitP: ['¡Muslera conecta! ¡El público se levanta!', '¡Eso es, Muslera! ¡Con todo!', '¡Golpe del pueblo! ¡Oscar lo ha notado!', '¡Muslera encuentra el hueco! ¡Vamos!', '¡TOMA YA! Eso ha sonado en toda la urbanización.'],
    blockO: ['Oscar bloquea como un profesional. Porque lo es.', 'Guardia de Oscar. Sólida como la tapia del fondo.', 'Oscar cubre. Ni se despeina.'],
    blockP: ['Muslera se cubre tarde, pero se cubre.', '¡Bloqueo de Muslera! Alguien le ha enseñado algo.', 'Muslera sube las manos. Milagro en la casa rural.'],
    whiffP: ['Muslera pega al aire. El aire está KO.', 'Muslera lanza y no hay nadie. Clásico.', 'Golpe al vacío. Oscar sonríe.'],
    whiffO: ['Oscar falla. Esto no pasa a menudo.', 'Oscar pega al aire. Toma nota, Muslera.'],
    upperP: ['¡¡UPPERCUT DE MUSLERA!! ¡Con las manos abajo le sale solo!', '¡GANCHO DESDE EL SÓTANO! ¡Oscar lo ha visto todo blanco!'],
    upperO: ['¡Uppercut de Oscar! Muslera ha visto a su abuela.', 'Gancho de Oscar. Eso duele hasta en el público.'],
    roundStart: { 1: ['¡Primer asalto! Oscar hace boxeo. Muslera hace... lo que puede.', '¡Empieza la pelea! Recordad: todos somos Muslera.'], 2: ['¡Segundo asalto! Muslera vuelve. Veremos si con cabeza o sin ella.', '¡Segundo asalto! Oscar sigue fresco. Muslera sigue siendo Muslera.'], 3: ['¡Último asalto! Lo que pase aquí se contará en el grupo durante años.', '¡Tercer asalto! Si Muslera sigue de pie es porque el césped es blando.'] },
  };

  // ----------------------------------------------------------- arranque
  function boot() {
    loadSave();
    G.canvas = $('game'); G.ctx = G.canvas.getContext('2d');
    G.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    G.use3d = !!(root.TSM_3D && root.TSM_3D.init($('game3d'), { mobile: G.touch }));
    if (!G.use3d) $('game3d').hidden = true;
    document.body.classList.toggle('touch', G.touch);
    AU.muted = !!save.muted; updateMuteBtn();
    bindInput(); bindUI();
    resize(); window.addEventListener('resize', resize);
    showScreen('title'); refreshTitle();
    requestAnimationFrame(loop);
  }

  function resize() {
    const area = $('arena');
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
    const r = area.getBoundingClientRect();
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    G.cw = Math.max(1, Math.round(r.width)); G.ch = Math.max(1, Math.round(r.height));
    G.canvas.width = Math.round(G.cw * G.dpr); G.canvas.height = Math.round(G.ch * G.dpr);
    G.canvas.style.width = G.cw + 'px'; G.canvas.style.height = G.ch + 'px';
    if (G.use3d) { const c3 = $('game3d'); c3.style.width = G.cw + 'px'; c3.style.height = G.ch + 'px'; root.TSM_3D.resize(G.cw, G.ch); }
  }

  function showScreen(name) {
    for (const el of document.querySelectorAll('.overlay')) el.hidden = el.id !== 'ov-' + name;
    setControls(['fight', 'intro', 'corner'].includes(G.screen) && G.touch);
  }
  function setControls(on) {
    $('controls').classList.toggle('active', on); document.body.classList.toggle('playing', on && G.touch);
    requestAnimationFrame(resize);
  }

  // ----------------------------------------------------------- entrada
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyJ: 'jab', KeyZ: 'jab', KeyK: 'cross', KeyX: 'cross', KeyL: 'upper', KeyC: 'upper', Space: 'dodge', ArrowUp: 'dodge', KeyW: 'dodge', KeyS: 'block', ArrowDown: 'block', ShiftLeft: 'block', ShiftRight: 'block' };
  function press(a) { if (!G.input.held.has(a)) { G.input.pressed.add(a); } G.input.held.add(a); }
  function release(a) { G.input.held.delete(a); }
  function bindInput() {
    window.addEventListener('keydown', e => {
      if (e.repeat) { if (KEYS[e.code]) e.preventDefault(); return; }
      if (e.code === 'Escape') { togglePause(); return; }
      if (e.code === 'Enter') { const btn = document.querySelector('.overlay:not([hidden]) .btn.primary'); if (btn) { btn.click(); e.preventDefault(); return; } }
      if (G.screen === 'intro' && (e.code === 'Space' || e.code === 'Enter')) { skipIntro(); return; }
      const a = KEYS[e.code]; if (a) { press(a); AU.init(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { const a = KEYS[e.code]; if (a) release(a); });
    window.addEventListener('blur', () => G.input.held.clear());
    for (const b of document.querySelectorAll('#controls .ctl')) {
      const a = b.dataset.a;
      const down = e => { e.preventDefault(); AU.init(); press(a); b.classList.add('on'); if (G.screen === 'intro') skipIntro(); };
      const up = e => { e.preventDefault(); release(a); b.classList.remove('on'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }
    $('arena').addEventListener('pointerdown', () => { AU.init(); if (G.screen === 'intro') skipIntro(); });
  }
  function readInput() {
    const h = G.input.held, p = G.input.pressed;
    const inp = { left: h.has('left'), right: h.has('right'), block: h.has('block'), jab: p.has('jab'), cross: p.has('cross'), upper: p.has('upper'), dodge: p.has('dodge'), mash: p.has('jab') || p.has('cross') || p.has('upper') || p.has('dodge') };
    p.clear();
    return inp;
  }

  // ----------------------------------------------------------- UI
  function bindUI() {
    $('btn-fight').onclick = () => { AU.init(); AU.uiClick(); if (G.touch) goFullscreen(); startFight(); };
    $('btn-howto').onclick = () => { AU.init(); AU.uiClick(); showScreen('howto'); };
    $('btn-belts').onclick = () => { AU.init(); AU.uiClick(); renderBelts(); showScreen('belts'); };
    for (const b of document.querySelectorAll('.btn-back')) b.onclick = () => { AU.uiClick(); showScreen('title'); refreshTitle(); };
    $('btn-rest').onclick = () => { AU.uiClick(); chooseBreak('rest'); };
    $('btn-pool').onclick = () => { AU.uiClick(); chooseBreak('pool'); };
    $('btn-again').onclick = () => { AU.uiClick(); if (G.touch) goFullscreen(); startFight(); };
    $('btn-menu').onclick = () => { AU.uiClick(); G.screen = 'title'; showScreen('title'); refreshTitle(); };
    $('btn-mute').onclick = () => { AU.init(); save.muted = !save.muted; AU.setMuted(save.muted); persist(); updateMuteBtn(); };
    $('btn-voice').onclick = () => { save.voices = !save.voices; persist(); updateMuteBtn(); if (save.voices) speak('oscar', 'Soy Dios.'); else if ('speechSynthesis' in window) speechSynthesis.cancel(); };
    $('btn-full').onclick = () => { goFullscreen(); };
    $('btn-resume').onclick = () => togglePause();
    $('btn-quit').onclick = () => { G.paused = false; G.screen = 'title'; showScreen('title'); refreshTitle(); };
    $('btn-pause').onclick = () => togglePause();
    $('btn-reset').onclick = () => { if ($('btn-reset').dataset.armed) { Object.assign(save, { wins: 0, losses: 0, fights: 0, streak: 0, bestStreak: 0, kos: 0, pool: 0, fastest: 0, decisions: 0, knockedDown: 0 }); persist(); renderBelts(); $('btn-reset').textContent = 'Progreso borrado'; delete $('btn-reset').dataset.armed; } else { $('btn-reset').dataset.armed = '1'; $('btn-reset').textContent = '¿Seguro? Pulsa otra vez'; } };
  }
  function updateMuteBtn() {
    $('btn-mute').textContent = save.muted ? '🔇' : '🔊'; $('btn-mute').setAttribute('aria-label', save.muted ? 'Activar sonido' : 'Silenciar');
    $('btn-voice').textContent = save.voices ? '🗣️' : '🤐'; $('btn-voice').setAttribute('aria-label', save.voices ? 'Quitar voces' : 'Poner voces'); $('btn-voice').classList.toggle('off', !save.voices);
  }
  // pantalla completa + horizontal en el móvil (donde el navegador lo permita)
  function goFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { const r = req.call(el); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (e) { }
  }
  function togglePause() {
    if (!['fight', 'intro', 'corner'].includes(G.screen)) return;
    G.paused = !G.paused; $('ov-pause').hidden = !G.paused; G.input.held.clear();
  }
  function refreshTitle() {
    const belt = currentBelt(), next = nextBelt();
    $('title-record').textContent = `${save.wins} ${save.wins === 1 ? 'victoria' : 'victorias'} · ${save.losses} ${save.losses === 1 ? 'derrota' : 'derrotas'}`;
    $('title-belt').textContent = belt ? belt.name : 'Sin cinturón';
    $('title-next').textContent = next ? `Siguiente: ${next.name} con ${next.wins} ${next.wins === 1 ? 'victoria' : 'victorias'}` : 'Has llegado al final. Eres leyenda.';
    const c = $('title-beltcv'); const ctx = c.getContext('2d'); c.width = 220 * 2; c.height = 60 * 2; ctx.scale(2, 2); ctx.clearRect(0, 0, 220, 60);
    if (belt) D.drawBelt(ctx, 110, 30, 200, belt, false); else { D.drawBelt(ctx, 110, 30, 200, { color: '#555', trim: '#333' }, true); }
    const pc = $('title-portraits'); const pctx = pc.getContext('2d'); pc.width = 320 * 2; pc.height = 150 * 2; pctx.scale(2, 2); pctx.clearRect(0, 0, 320, 150);
    D.drawPortrait(pctx, 'muslera', 95, 70, 110, 'normal'); pctx.save(); pctx.translate(320, 0); pctx.scale(-1, 1); D.drawPortrait(pctx, 'oscar', 95, 70, 105, 'angry'); pctx.restore();
  }
  function renderBelts() {
    const list = $('belts-list'); list.innerHTML = '';
    $('belts-summary').textContent = `${save.wins} victorias sobre Oscar · ${save.fights} combates · mejor racha ${save.bestStreak}`;
    for (const belt of D.BELTS) {
      const row = document.createElement('div'); row.className = 'belt-row' + (save.wins >= belt.wins ? ' unlocked' : '');
      const cv = document.createElement('canvas'); cv.width = 180 * 2; cv.height = 50 * 2; cv.style.width = '180px'; cv.style.height = '50px';
      const ctx = cv.getContext('2d'); ctx.scale(2, 2); D.drawBelt(ctx, 90, 25, 160, belt, save.wins < belt.wins);
      const info = document.createElement('div'); info.className = 'belt-info';
      info.innerHTML = `<strong>${belt.name}</strong><span>${belt.wins} ${belt.wins === 1 ? 'victoria' : 'victorias'}${save.wins >= belt.wins ? ' · conseguido' : ` · te faltan ${belt.wins - save.wins}`}</span><em>${save.wins >= belt.wins ? belt.text : ''}</em>`;
      row.appendChild(cv); row.appendChild(info); list.appendChild(row);
    }
    $('btn-reset').textContent = 'Borrar progreso'; delete $('btn-reset').dataset.armed;
  }

  // ----------------------------------------------------------- flujo de combate
  function startFight() {
    G.sim = new S.Sim({});
    G.sim.p.x = 60; G.sim.o.x = 1000; // entran desde fuera
    G.screen = 'intro'; G.intro = { t: 0, step: 0 }; G.paused = false; $('ov-pause').hidden = true;
    G.fx.parts.length = 0; G.fx.texts.length = 0; G.crowd.excite = 0.3; G.crowd.cheer = 0;
    G.cam.x = 200; G.cam.vw = W; G.stats = { startT: G.t };
    showScreen('none'); setControls(G.touch);
    AU.init(); AU.crowd(0.25); AU.intro();
    say('Casa rural. Noche. Dos amigos, dos pares de guantes y ninguna idea buena.', '');
  }
  function skipIntro() { if (G.screen === 'intro' && G.intro.t > 0.5) { G.intro.t = 99; G.bubbles.length = 0; if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { } } }

  function beginRound1() {
    G.screen = 'fight'; G.sim.beginRound(); G.sim.p.face = 'normal'; G.sim.o.face = 'normal';
    G.cam.lookX = null; G.cam.zoom = 1; G.cam.orbit = 0; G.cam.camH = 0.4; G.nextIdleQuote = G.t + 14;
    G.roundCard = { text: 'ASALTO 1', t: 0 }; AU.crowd(0.3);
    say(pick(LINES.roundStart[1]), '');
  }

  function chooseBreak(choice) {
    const sim = G.sim; if (!sim || sim.phase !== 'break') return;
    showScreen('none');
    if (choice === 'pool' && !sim.poolUsed) {
      sim.applyBreakChoice('pool'); save.pool++; persist();
      G.screen = 'pool'; G.pool = { t: 0, splashed: false, bubbled: false, healed: true }; AU.crowd(0.15);
      say('Muslera se va a la piscina. Entre asaltos. Como un campeón. O como un pato.', 'muslera');
    } else {
      sim.applyBreakChoice('rest');
      G.screen = 'corner'; G.corner = { t: 0 }; say('Muslera descansa en la esquina. Oscar ni se ha sentado.', '');
    }
  }
  function startNextRound() {
    const sim = G.sim; sim.nextRound();
    G.screen = 'fight'; G.roundCard = { text: 'ASALTO ' + sim.round, t: 0 };
    if (G.pool.healed) { G.pool.healed = false; setTimeout(() => addText('¡VIDA AL MÁXIMO!', sim.p.x, FLOOR - 280, { size: 34, color: '#8dffb0', stroke: '#0a3a1a', life: 1.6, vy: -25 }), 600); setTimeout(() => quote('muslera', 'gordo', { force: true }), 2600); }
    G.nextIdleQuote = G.t + 12;
    say(pick(LINES.roundStart[sim.round] || LINES.roundStart[3]), '');
    AU.crowd(0.3);
    setControls(G.touch);
  }

  function showBreak() {
    const sim = G.sim;
    const sc = sim.scores[sim.scores.length - 1];
    $('break-title').textContent = `FIN DEL ASALTO ${sim.round}`;
    $('break-score').innerHTML = `<div class="sc"><span>Muslera</span><b>${sc.p}</b><small>${sc.pd} de daño</small></div><div class="sc"><span>Oscar</span><b>${sc.o}</b><small>${sc.od} de daño</small></div>`;
    const judgesMsg = sc.p > sc.o ? '¡Muslera gana el asalto! Los jueces no se lo creen.' : sc.p === sc.o ? 'Asalto igualado. Y los jueces son amigos de Oscar.' : 'Asalto para Oscar. Los jueces lo tenían claro antes de empezar.';
    $('break-judges').textContent = judgesMsg;
    const hp = Math.round(sim.p.hp), st = Math.round(sim.p.stamina);
    $('break-state').textContent = `Muslera: ${hp}% de vida · ${st}% de aguante`;
    $('btn-pool').disabled = sim.poolUsed; $('btn-pool').querySelector('small').textContent = sim.poolUsed ? 'Ya la has usado. Solo una vez por pelea.' : 'VIDA AL MÁXIMO · aguante al máximo · 20 s fresquito';
    showScreen('break');
  }

  function endFight(res) {
    G.screen = 'over'; G.results = res;
    save.fights++;
    if (res.winner === 'player') { save.wins++; save.streak++; save.bestStreak = Math.max(save.bestStreak, save.streak); if (res.method !== 'decision') save.kos++; else save.decisions++; const secs = (res.round - 1) * 60 + res.time; if (!save.fastest || secs < save.fastest) save.fastest = secs; }
    else { save.losses++; save.streak = 0; }
    save.knockedDown += res.kd.p;
    persist();
    AU.crowd(res.winner === 'player' ? 0.7 : 0.35);
    setTimeout(() => quote(res.winner === 'player' ? 'muslera' : 'oscar', res.winner === 'player' ? pick(['anal', 'frances']) : pick(['dios', 'trump']), { force: true }), 2000);
    if (res.winner === 'player') { AU.win(); G.crowd.cheer = 1; for (let i = 0; i < 6; i++) setTimeout(() => burst(200 + Math.random() * 560, 120 + Math.random() * 160, 40, { color: pick(['#f2d33b', '#ec93c0', '#56cfcb', '#fff', '#f08a2a']), speed: 260 }), i * 350); }
    else AU.lose();
    setTimeout(showResults, 2600);
  }

  function showResults() {
    const r = G.results; if (!r || G.screen !== 'over') return;
    const won = r.winner === 'player';
    $('res-title').textContent = won ? '¡¡HAS GANADO A OSCAR!!' : 'OSCAR GANA';
    $('res-title').className = won ? 'win' : 'lose';
    const method = r.method === 'decision' ? 'por decisión de los jueces' : r.method === 'KO' ? 'por KO' : 'por KO técnico (tres caídas)';
    const when = r.method === 'decision' ? 'tras tres asaltos' : `en el asalto ${r.round}, minuto ${String(Math.floor(r.time / 60)).padStart(1, '0')}:${String(r.time % 60).padStart(2, '0')}`;
    $('res-sub').textContent = `${won ? 'Muslera' : 'Oscar'} gana ${method} ${when}.`;
    const acc = (l, t) => t ? Math.round(100 * l / t) : 0;
    let rows = `<tr><th></th><th>Muslera</th><th>Oscar</th></tr>`;
    rows += `<tr><td>Golpes lanzados</td><td>${r.thrown.p}</td><td>${r.thrown.o}</td></tr>`;
    rows += `<tr><td>Golpes conectados</td><td>${r.landed.p}</td><td>${r.landed.o}</td></tr>`;
    rows += `<tr><td>Precisión</td><td>${acc(r.landed.p, r.thrown.p)}%</td><td>${acc(r.landed.o, r.thrown.o)}%</td></tr>`;
    rows += `<tr><td>Caídas</td><td>${r.kd.p}</td><td>${r.kd.o}</td></tr>`;
    if (r.scores.length) rows += `<tr><td>Tarjetas</td><td>${r.scores.map(s => s.p).join(' · ')}</td><td>${r.scores.map(s => s.o).join(' · ')}</td></tr>`;
    rows += `<tr><td>Piscina</td><td colspan="2">${r.pool ? 'Cabeza mojada, sí' : 'No la ha usado'}</td></tr>`;
    $('res-stats').innerHTML = rows;
    const belt = currentBelt(), next = nextBelt();
    const justUnlocked = won && D.BELTS.find(b => b.wins === save.wins);
    $('res-belt').hidden = !justUnlocked;
    if (justUnlocked) { const c = $('res-beltcv'); const ctx = c.getContext('2d'); c.width = 260 * 2; c.height = 70 * 2; ctx.scale(2, 2); D.drawBelt(ctx, 130, 35, 240, justUnlocked, false); $('res-beltname').textContent = `¡Nuevo cinturón! ${justUnlocked.name}`; $('res-belttext').textContent = justUnlocked.text; }
    $('res-progress').textContent = won ? `Victorias totales: ${save.wins}. ${next ? `Siguiente cinturón: ${next.name} (${next.wins - save.wins} más).` : ''}` : `Derrotas: ${save.losses}. Victorias: ${save.wins}. ${next ? `Para el ${next.name} te faltan ${next.wins - save.wins}.` : ''} Todos somos Muslera.`;
    $('res-quote').textContent = won ? pick(['Oscar pide la revancha. Y un abogado.', 'El grupo KLK no da crédito.', 'Alguien lo ha grabado. Esta vez sí.', 'Muslera ha ganado con las manos abajo. Lección para todos.']) : pick(['Muslera sigue sin subir las manos. Y sigue sin ganar.', 'Oscar ni ha sudado. Bueno, un poco.', 'La piscina está ahí para algo, Muslera.', 'Oscar: "¿Otra?" Muslera: "Dame un minuto."', 'El perro del público también lo vio venir.']);
    showScreen('over');
  }

  // ----------------------------------------------------------- eventos del motor
  function handleEvents(sim) {
    for (const e of sim.events) {
      switch (e.type) {
        case 'bell': AU.bell(e.kind === 'end' ? 3 : 1); if (e.kind === 'end') { say(`Fin del asalto ${e.round}. Los dos a su esquina. Muslera a por aire.`, ''); G.crowd.cheer = 0.4; } break;
        case 'swing': if (e.who === 'muslera' && e.move === 'upper') { } break;
        case 'whiff': AU.whiff(); if (Math.random() < 0.35) say(pick(e.who === 'muslera' ? LINES.whiffP : LINES.whiffO), e.who); break;
        case 'hit': {
          const byP = e.by === 'muslera';
          if (e.counter) AU.counter(); else AU.punch(e.move);
          if (e.counter || e.move === 'upper') { G.cam.zoom = e.counter ? 0.8 : 0.9; G.cam.zoomT = e.counter ? 0.6 : 0.35; }
          if (byP && e.counter && Math.random() < 0.5) quote('muslera', 'bajas');
          if (!byP && (e.move === 'upper' || e.combo >= 3) && Math.random() < 0.45) quote('oscar', 'marito');
          shake(e.counter ? 14 : e.move === 'upper' ? 10 : e.move === 'cross' ? 6 : 3);
          burst(e.x, e.y, e.counter ? 22 : 10, { color: byP ? '#ffe36b' : '#ffffff', speed: e.counter ? 320 : 180 });
          G.fx.ring.push({ x: e.x, y: e.y, t: 0, big: e.counter || e.move === 'upper' });
          const word = e.counter ? '¡CONTRA!' : e.move === 'upper' ? pick(['¡UPPER!', '¡GANCHO!']) : pick(['¡PUM!', '¡PAM!', '¡ZAS!', '¡TOMA!', '¡CLONC!']);
          addText(word, e.x, e.y - 40, { size: e.counter ? 48 : e.move === 'upper' ? 40 : 28, color: byP ? '#ffe36b' : '#ffffff', stroke: byP ? '#6b3a00' : '#2a0a0a' });
          if (e.combo >= 3) addText(`COMBO x${e.combo}`, e.x, e.y - 90, { size: 22, color: '#ffd1e8', stroke: '#5a1030', life: 1.1 });
          G.crowd.excite = clamp(G.crowd.excite + (byP ? 0.2 : 0.08), 0, 1); if (byP) G.crowd.cheer = Math.max(G.crowd.cheer, e.counter ? 1 : 0.5);
          AU.crowdBurst(byP ? 0.25 : 0.08);
          if (!e.counter && Math.random() < 0.3 && G.t - G.lastSayAt > 2.5) say(pick(e.move === 'upper' ? (byP ? LINES.upperP : LINES.upperO) : (byP ? LINES.hitP : LINES.hitO)), e.by);
          break;
        }
        case 'block': AU.punch(e.by === 'muslera' ? 'jab' : 'jab', true); addText(e.perfect ? '¡PARADA!' : 'BLOQUEO', e.x, FLOOR - 250, { size: 20, color: '#cfe8ff', stroke: '#10304a', life: 0.7 }); if (Math.random() < 0.2 && G.t - G.lastSayAt > 3) say(pick(e.who === 'oscar' ? LINES.blockO : LINES.blockP), e.who); break;
        case 'parry': addText('¡OSCAR LEE EL GOLPE!', sim.o.x, FLOOR - 280, { size: 20, color: '#56cfcb', stroke: '#083a3a', life: 1 }); break;
        case 'dodge': AU.dodge(); addText('ESQUIVA', e.who === 'muslera' ? sim.p.x : sim.o.x, FLOOR - 260, { size: 22, color: '#b8ffb8', stroke: '#0a3a0a', life: 0.8 }); if (e.who === 'muslera') { G.fx.slow = 0.25; } break;
        case 'dodgeStart': break;
        case 'knockdown': {
          AU.knockdown(); shake(26); G.fx.flash = 1; G.fx.slow = 0.9;
          addText(e.who === 'oscar' ? '¡¡AL SUELO!!' : '¡¡MUSLERA CAE!!', (sim.p.x + sim.o.x) / 2, FLOOR - 300, { size: 54, color: e.who === 'oscar' ? '#ffe36b' : '#ff8a8a', stroke: '#3a0a0a', life: 1.8, vy: -10 });
          G.crowd.excite = 1; G.crowd.cheer = 1; AU.crowd(0.7, true);
          burst(e.who === 'oscar' ? sim.o.x : sim.p.x, FLOOR - 200, 30, { color: '#fff', speed: 300 });
          G.cam.zoom = 0.7; G.cam.zoomT = 2.2; G.cam.orbitT = 2.2;
          setTimeout(() => quote(e.who === 'oscar' ? 'muslera' : 'oscar', e.who === 'oscar' ? 'anal' : 'dios', { force: true }), 900);
          break;
        }
        case 'count': if (e.n === 4 && e.who === 'oscar') quote('muslera', 'bajas', { force: true }); if (e.n > 0 && e.n <= 10) { AU.count(e.n); addText(String(e.n), e.who === 'muslera' ? sim.p.x : sim.o.x, FLOOR - 240, { size: 56, color: '#fff', stroke: '#000', life: 0.8, vy: -20 }); } break;
        case 'mash': break;
        case 'getUp': AU.getUp(); G.crowd.cheer = 0.6; AU.crowd(0.4); break;
        case 'taunt': AU.taunt(); addText('¡OSCAR VACILA!', sim.o.x, FLOOR - 290, { size: 26, color: '#56cfcb', stroke: '#083a3a', life: 1.2 }); G.crowd.cheer = 0.5; quote('oscar', pick(['trump', 'btc', 'especular']), { force: true, cooldown: 3 }); break;
        case 'comboEnd': break;
        case 'say': if (G.t - G.lastSayAt > 0.8 || /CONTRA|SUELO|levanta|chulo|vacil|momento/i.test(e.text)) say(e.text, e.who); break;
        case 'roundStart': break;
        case 'break': showBreak(); setControls(false); break;
        case 'over': endFight(e); break;
      }
    }
  }

  // ----------------------------------------------------------- bucle
  function loop(now) {
    requestAnimationFrame(loop);
    const dtRaw = Math.min(0.05, (now - (G.last || now)) / 1000); G.last = now; G.lastDt = dtRaw;
    G.t += dtRaw;
    if (!G.paused) update(dtRaw);
    render();
  }

  function update(dt) {
    const sim = G.sim;
    // fx timers
    if (G.fx.slow > 0) G.fx.slow -= dt;
    const simDt = dt * (G.fx.slow > 0 ? 0.45 : 1);
    for (const p of G.fx.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; }
    G.fx.parts = G.fx.parts.filter(p => p.t < p.life);
    for (const t of G.fx.texts) { t.t += dt; t.y += t.vy * dt; }
    G.fx.texts = G.fx.texts.filter(t => t.t < t.life);
    for (const r of G.fx.ring) r.t += dt; G.fx.ring = G.fx.ring.filter(r => r.t < 0.35);
    G.fx.flash = Math.max(0, G.fx.flash - dt * 3);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 60);
    if (G.cam.zoomT > 0) { G.cam.zoomT -= dt; if (G.cam.zoomT <= 0 && G.screen === 'fight') G.cam.zoom = 1; }
    if (G.cam.orbitT > 0) { G.cam.orbitT -= dt; G.cam.orbit = Math.sin(G.t * 0.9) * 0.35; if (G.cam.orbitT <= 0) G.cam.orbit = 0; }
    if (G.screen === 'over') { G.cam.orbit = Math.sin(G.t * 0.35) * 0.5; G.cam.zoom = 1.0; G.cam.camH = 0.5; }
    if (G.screen === 'title') { G.cam.orbit = Math.sin(G.t * 0.18) * 0.45; G.cam.zoom = 0.9; G.cam.camH = 0.5; G.cam.lookX = null; }
    for (const b of G.bubbles) b.t += dt; G.bubbles = G.bubbles.filter(b => b.t < b.life);
    G.crowd.cheer = Math.max(0, G.crowd.cheer - dt * 0.7);
    G.crowd.excite = Math.max(0.15, G.crowd.excite - dt * 0.05);
    G.ticker.t += dt; G.roundCard.t += dt;

    switch (G.screen) {
      case 'intro': updateIntro(dt); break;
      case 'fight': {
        G.acc += simDt; let n = 0;
        const inp = readInput();
        while (G.acc >= 1 / 60 && n < 4) { sim.update(1 / 60, inp); handleEvents(sim); inp.jab = inp.cross = inp.upper = inp.dodge = inp.mash = false; G.acc -= 1 / 60; n++; }
        if (n === 0) { G.input.pressed.clear(); } // evitar perder pulsaciones: readInput ya las consumió
        sweat(sim.p); sweat(sim.o);
        if (sim.phase === 'fight' && G.t > (G.nextIdleQuote || 0)) { G.nextIdleQuote = G.t + 16 + Math.random() * 14; if (Math.random() < 0.6) quote('muslera', pick(['frances', 'gordo'])); else quote('oscar', pick(['btc', 'especular'])); }
        if (sim.p.fresh > 0 && Math.random() < 0.3) G.fx.parts.push({ x: sim.p.x + (Math.random() - 0.5) * 24, y: FLOOR - 225, vx: (Math.random() - 0.5) * 40, vy: 40, t: 0, life: 0.5, r: 2, color: 'rgba(160,220,255,0.9)', g: 300, kind: 'drop' });
        break;
      }
      case 'pool': updatePool(dt); break;
      case 'corner': G.corner.t += dt; if (G.corner.t > 2.4) startNextRound(); break;
      case 'over': { G.acc += dt; while (G.acc >= 1 / 60) { sim.update(1 / 60, {}); G.acc -= 1 / 60; } break; }
    }
    // cámara
    updateCamera(dt);
  }

  function updateIntro(dt) {
    const sim = G.sim, I = G.intro; I.t += dt;
    const o = sim.o, p = sim.p;
    // Oscar entra por la derecha con medallas (0-3s), Muslera por la izquierda con toalla (3-6s), presentación (6-8s)
    if (I.t < 3.2) { o.x = clamp(lerp(1000, 640, (I.t - 0.4) / 2.4), 640, 1000); o.state = 'walk'; o.walkDir = -1; o.dir = -1; o.t = I.t; o.face = 'normal'; p.x = 60; p.state = 'walk'; p.t = I.t; p.walkDir = 1; }
    else if (I.t < 6.2) { o.state = 'idle'; o.t = I.t; p.x = clamp(lerp(60, 330, (I.t - 3.4) / 2.4), 60, 330); p.state = 'walk'; p.walkDir = 1; p.t = I.t; p.dir = 1; if (I.t > 5.9) { p.state = 'idle'; } }
    else { o.state = 'idle'; p.state = 'idle'; o.t = I.t; p.t = I.t; }
    if (I.step === 0 && I.t > 0.6) { I.step = 1; G.crowd.cheer = 0.8; say('¡Entra OSCAR! Con medallas. Medallas de verdad. Esto empieza mal para Muslera.', 'oscar'); AU.crowdBurst(0.5); }
    if (I.step === 1 && I.t > 2.0) { I.step = 2; quote('oscar', 'btc', { force: true }); }
    if (I.step === 2 && I.t > 3.5) { I.step = 3; G.crowd.cheer = 0.5; say('Y aquí llega MUSLERA, con su toalla, sus guantes rosas y la guardia por los suelos.', 'muslera'); }
    if (I.step === 3 && I.t > 4.6) { I.step = 4; quote('muslera', 'frances', { force: true }); }
    if (I.step === 4 && I.t > 6.4) { I.step = 5; say('Tres asaltos de un minuto. Que gane el mejor. O sea, Oscar. Salvo que...', ''); }
    if (I.step === 5 && I.t > 7.3) { I.step = 6; quote('oscar', 'dios', { force: true }); }
    // cámara de presentación: cerca de quien entra, luego plano general
    if (I.t < 3.4) { G.cam.lookX = o.x + 40; G.cam.zoom = 0.72; G.cam.orbit = -0.6; G.cam.camH = 0.1; }
    else if (I.t < 6.4) { G.cam.lookX = p.x - 40; G.cam.zoom = 0.72; G.cam.orbit = 0.6; G.cam.camH = 0.1; }
    else { G.cam.lookX = null; G.cam.zoom = 1; G.cam.orbit = 0; G.cam.camH = 0.4; }
    if (I.t > 8.6) { p.x = 360; o.x = 600; p.walkDir = 0; o.walkDir = 0; beginRound1(); }
  }

  function updatePool(dt) {
    const P = G.pool; P.t += dt;
    const ph = P.t / 6.5;
    if (!P.splashed && ph > 0.42) { P.splashed = true; AU.splash(); AU.bubbles(1.6); }
    if (!P.shook && ph > 0.78) { P.shook = true; AU.splash(); say('¡FRESQUITO! Muslera vuelve con la cabeza mojada y las ideas... igual de poco claras.', 'muslera'); }
    if (ph >= 1) { startNextRound(); }
  }

  function updateCamera(dt) {
    const sim = G.sim; const cam = G.cam;
    let cx = W / 2, vw = W;
    if (sim && ['fight', 'intro', 'over', 'corner'].includes(G.screen)) {
      const mid = (sim.p.x + sim.o.x) / 2, sep = Math.abs(sim.p.x - sim.o.x);
      const aspect = G.cw / G.ch;
      // cuanto más estrecha la pantalla, más cerca la cámara
      vw = aspect >= 1.6 ? W : clamp(sep + (aspect < 1 ? 250 : 330), Math.min(W, Math.max(aspect < 1 ? 400 : 520, aspect * 540)), W);
      cx = clamp(mid, vw / 2, W - vw / 2);
      if (G.screen === 'over' && G.results) { vw = Math.min(vw, 620); const w = G.results.winner === 'player' ? sim.p : sim.o; cx = clamp(w.x, vw / 2, W - vw / 2); }
    }
    const k = 1 - Math.pow(0.001, dt);
    cam.vw = lerp(cam.vw || W, vw, k * 0.6); cam.x = lerp(cam.x || cx, cx, k);
  }

  // ----------------------------------------------------------- render
  function render() {
    const ctx = G.ctx, cw = G.cw, ch = G.ch;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const sim = G.sim;
    if (G.screen === 'pool' && sim) { renderPool(ctx); return; }
    let toScreen, s;
    if (G.use3d) {
      const R3 = root.TSM_3D;
      R3.render({ sim, t: G.t, dt: G.lastDt || 0.016, screen: G.screen, cheer: G.crowd.cheer, excite: G.crowd.excite, intro: G.screen === 'intro', vw: G.cam.vw, cx: G.cam.x, shake: G.cam.shake, results: G.results, zoom: G.cam.zoom, orbit: G.cam.orbit, lookX: G.cam.lookX, camH: G.cam.camH });
      toScreen = R3.project; s = R3.pxPerLogical();
    } else {
      const r = render2D(ctx); toScreen = r.toScreen; s = r.scale;
    }
    G.toScreen = toScreen; G.pxScale = s;
    drawEffects(ctx, toScreen, s);
    if (G.fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.fx.flash * 0.6})`; ctx.fillRect(0, 0, cw, ch); }
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    if (sim && ['fight', 'over', 'corner', 'intro'].includes(G.screen)) renderHUD(ctx);
  }

  // mundo en 2D (si no hay WebGL)
  function render2D(ctx) {
    const cw = G.cw, ch = G.ch, sim = G.sim;
    let scale = cw / G.cam.vw;
    if (ch / scale < 345) scale = ch / 345;
    const vh = ch / scale, vwReal = cw / scale;
    const camX = clamp(G.cam.x - vwReal / 2, Math.min(0, (W - vwReal) / 2), Math.max(0, W - vwReal));
    const camY = FLOOR + 95 - vh;
    const sh = G.cam.shake; const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    ctx.save();
    ctx.scale(scale, scale); ctx.translate(-camX + sx, -camY + sy);
    ctx.fillStyle = '#070a14'; ctx.fillRect(camX - 50, camY - 600, vwReal + 100, 600 - camY + 10);
    ctx.fillStyle = '#0f2a12'; ctx.fillRect(camX - 50, 60, 50 - camX, 360);
    ctx.fillStyle = '#8c7a5a'; ctx.fillRect(W, 90, vwReal, 330);
    ctx.fillStyle = '#1f6a22'; ctx.fillRect(camX - 50, 415, vwReal + 100, 700);
    ctx.drawImage(D.background(), 0, 0);
    D.drawSpectators(ctx, G.t, G.crowd.excite, G.crowd.cheer);
    if (sim && ['fight', 'intro', 'over', 'corner'].includes(G.screen)) {
      const intro = G.screen === 'intro';
      const front = sim.p.move ? sim.p : sim.o.move ? sim.o : (sim.p.state === 'down' ? sim.o : sim.p);
      const back = front === sim.p ? sim.o : sim.p;
      for (const f of [back, front]) D.drawFighter(ctx, f, G.t, { medals: intro && f.key === 'oscar', towel: intro && f.key === 'muslera', wet: f.fresh > 0, entrance: intro && f.state === 'walk' });
    }
    D.drawForeground(ctx);
    ctx.restore();
    return { toScreen: (x, y) => ({ x: (x - camX + sx) * scale, y: (y - camY + sy) * scale }), scale };
  }

  // partículas, anillos y textos flotantes en coordenadas de pantalla
  function drawEffects(ctx, toScreen, s) {
    for (const r of G.fx.ring) { const k = r.t / 0.35; const p = toScreen(r.x, r.y); ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = (r.big ? 6 : 3) * (1 - k) * s; ctx.beginPath(); ctx.arc(p.x, p.y, ((r.big ? 90 : 50) * k + 10) * s, 0, Math.PI * 2); ctx.stroke(); }
    for (const p of G.fx.parts) { const a = 1 - p.t / p.life; const q = toScreen(p.x, p.y); ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); if (p.kind === 'drop') ctx.ellipse(q.x, q.y, p.r * 0.7 * s, p.r * 1.3 * s, 0, 0, Math.PI * 2); else ctx.arc(q.x, q.y, p.r * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const t of G.fx.texts) {
      const k = t.t / t.life; const pop = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.5 : 1.1 - Math.min(0.1, (t.t - 0.12));
      const q = toScreen(t.x, t.y);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t.rot); ctx.scale(pop * s, pop * s); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${t.size}px "Anton", Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, t.size / 7); ctx.strokeStyle = t.stroke; ctx.lineJoin = 'round'; ctx.strokeText(t.text, 0, 0); ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }

  function renderHUD(ctx) {
    const sim = G.sim, cw = G.cw, ch = G.ch;
    const u = clamp(Math.min(cw / 960, ch / 540), 0.5, 1.4);       // unidad de escala del HUD
    const pad = 10 * u, barW = Math.min(cw * 0.5 - 60 * u - 16 * u, 380 * u), barH = 18 * u, top = pad + 6 * u;
    const font = (sz, fam) => `${sz * u}px ${fam || '"Barlow Condensed", "Arial Narrow", sans-serif'}`;
    const drawBar = (x, y, w, h, frac, color, right, lowColor) => {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; D.rr(ctx, x - 2, y - 2, w + 4, h + 4, 4 * u); ctx.fill();
      ctx.fillStyle = '#2a1414'; ctx.fillRect(x, y, w, h);
      const fw = w * clamp(frac, 0, 1);
      ctx.fillStyle = frac < 0.3 && lowColor ? lowColor : color; ctx.fillRect(right ? x + w - fw : x, y, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w, h * 0.35);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 10, y); ctx.lineTo(x + w * i / 10, y + h); ctx.stroke(); }
    };
    if (G.screen !== 'intro') {
      // Muslera (izquierda)
      drawBar(pad + 54 * u, top, barW, barH, sim.p.hp / sim.p.maxHp, '#e8463c', false, '#ff2a2a');
      drawBar(pad + 54 * u, top + barH + 5 * u, barW * 0.7, 7 * u, sim.p.stamina / sim.p.maxStamina, sim.p.fresh > 0 ? '#7fe0ff' : '#f2c230');
      drawBar(cw - pad - 54 * u - barW, top, barW, barH, sim.o.hp / sim.o.maxHp, '#e8463c', true, '#ff2a2a');
      drawBar(cw - pad - 54 * u - barW * 0.7, top + barH + 5 * u, barW * 0.7, 7 * u, sim.o.stamina / sim.o.maxStamina, '#f2c230', true);
      // retratos
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; D.rr(ctx, pad, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.fill(); ctx.beginPath(); D.rr(ctx, pad, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.clip(); ctx.translate(pad + 24 * u, top + 20 * u); ctx.scale(u, u); D.drawPortrait(ctx, 'muslera', 0, 0, 56, sim.p.face === 'hit' ? 'hit' : sim.p.hp < 30 ? 'tired' : 'normal', { wet: sim.p.fresh > 0 }); ctx.restore();
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; D.rr(ctx, cw - pad - 48 * u, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.fill(); ctx.beginPath(); D.rr(ctx, cw - pad - 48 * u, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.clip(); ctx.translate(cw - pad - 24 * u, top + 20 * u); ctx.scale(-u, u); D.drawPortrait(ctx, 'oscar', 0, 0, 54, sim.o.face === 'hit' ? 'hit' : sim.o.hp < 30 ? 'tired' : 'angry'); ctx.restore();
      // nombres
      ctx.font = font(20, '"Anton", Impact, sans-serif'); ctx.textBaseline = 'top'; ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'left'; ctx.strokeText('MUSLERA', pad + 56 * u, top + barH + 14 * u); ctx.fillText('MUSLERA', pad + 56 * u, top + barH + 14 * u);
      ctx.textAlign = 'right'; ctx.strokeText('OSCAR', cw - pad - 56 * u, top + barH + 14 * u); ctx.fillText('OSCAR', cw - pad - 56 * u, top + barH + 14 * u);
      ctx.font = font(12); ctx.fillStyle = '#ffd7d7'; ctx.textAlign = 'left'; ctx.fillText('EL PUEBLO · guardia baja', pad + 56 * u, top + barH + 36 * u); ctx.textAlign = 'right'; ctx.fillText('EL CAMPEÓN · guardia alta', cw - pad - 56 * u, top + barH + 36 * u);
      // caídas (puntos)
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < sim.p.knockdowns ? '#ff5a5a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(pad + 56 * u + barW - 10 * u - i * 14 * u, top + barH + 24 * u, 4 * u, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = i < sim.o.knockdowns ? '#ff5a5a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(cw - pad - 56 * u - barW + 10 * u + i * 14 * u, top + barH + 24 * u, 4 * u, 0, Math.PI * 2); ctx.fill(); }
      // reloj central
      const tm = Math.max(0, Math.ceil(sim.roundT)); const mm = Math.floor(tm / 60), ss = tm % 60;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; D.rr(ctx, cw / 2 - 48 * u, top - 4 * u, 96 * u, 50 * u, 8 * u); ctx.fill();
      ctx.font = font(30, '"Anton", Impact, sans-serif'); ctx.textAlign = 'center'; ctx.fillStyle = sim.roundT < 10 ? '#ff6b6b' : '#fff'; ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, cw / 2, top);
      ctx.font = font(12); ctx.fillStyle = '#ffd7a0'; ctx.fillText(`ASALTO ${sim.round} / 3`, cw / 2, top + 32 * u);
      // buff piscina
      if (sim.p.fresh > 0) { ctx.font = font(13); ctx.fillStyle = '#9fe9ff'; ctx.textAlign = 'left'; ctx.fillText(`FRESQUITO ${Math.ceil(sim.p.fresh)}s`, pad + 56 * u + barW * 0.7 + 8 * u, top + barH + 3 * u); }
      // cuenta de protección
      if (sim.phase === 'count') {
        const down = sim.p.state === 'down' ? sim.p : sim.o;
        ctx.textAlign = 'center';
        if (down === sim.p) {
          ctx.font = font(26, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; ctx.strokeText('¡LEVÁNTATE! MACHACA LOS BOTONES', cw / 2, ch * 0.3); ctx.fillText('¡LEVÁNTATE! MACHACA LOS BOTONES', cw / 2, ch * 0.3);
          const bw = Math.min(cw * 0.5, 360 * u); drawBar(cw / 2 - bw / 2, ch * 0.3 + 40 * u, bw, 16 * u, down.rise.got / Math.max(1, down.rise.need), '#7fe0ff');
          if (down.count < 3) { ctx.font = font(14); ctx.fillStyle = '#ffd7a0'; ctx.fillText('(tienes que esperar al 3 para levantarte)', cw / 2, ch * 0.3 + 62 * u); }
        } else {
          ctx.font = font(26, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; ctx.strokeText('¡¡OSCAR EN EL SUELO!!', cw / 2, ch * 0.3); ctx.fillText('¡¡OSCAR EN EL SUELO!!', cw / 2, ch * 0.3);
        }
      }
      if (sim.phase === 'ready' && G.screen === 'fight') {
        ctx.textAlign = 'center'; ctx.font = font(22, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; const txt = sim.phaseT > 1.1 ? '¡BOXEAD!' : 'PREPARADOS...'; ctx.strokeText(txt, cw / 2, ch * 0.6); ctx.fillText(txt, cw / 2, ch * 0.6);
      }
    }
    // tarjeta de asalto
    if (G.roundCard.t < 2.2 && G.roundCard.text) {
      const k = G.roundCard.t; const a = k < 0.3 ? k / 0.3 : k > 1.7 ? (2.2 - k) / 0.5 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(64, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = '#ffe36b';
      ctx.strokeText(G.roundCard.text, cw / 2, ch * 0.42); ctx.fillText(G.roundCard.text, cw / 2, ch * 0.42);
      ctx.restore();
    }
    // presentación en la intro
    if (G.screen === 'intro') {
      const I = G.intro; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const card = (name, alias, record, k, x) => {
        const a = clamp(k, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.translate(x, ch * 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; D.rr(ctx, -150 * u, -36 * u, 300 * u, 92 * u, 10 * u); ctx.fill();
        ctx.font = font(44, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.fillText(name, 0, -8 * u);
        ctx.font = font(18); ctx.fillStyle = '#ffd7a0'; ctx.fillText(alias, 0, 24 * u); ctx.font = font(13); ctx.fillStyle = '#ccc'; ctx.fillText(record, 0, 42 * u);
        ctx.restore();
      };
      if (I.t > 0.8 && I.t < 3.6) card('OSCAR', '"EL CAMPEÓN" · hace boxeo de verdad', 'Récord: todas ganadas · Medallas: 3 · Guardia: impecable', (I.t - 0.8) * 2, cw * 0.24);
      if (I.t > 3.8 && I.t < 6.6) card('MUSLERA', '"EL PUEBLO" · no hace boxeo', `Récord: ${save.wins}-${save.losses} · Guardia: ¿qué guardia?`, (I.t - 3.8) * 2, cw * 0.78);
      if (I.t > 6.6) { ctx.save(); ctx.globalAlpha = clamp((I.t - 6.6) * 2, 0, 1); ctx.font = font(96, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = '#ffe36b'; ctx.strokeText('VS', cw / 2, ch * 0.38); ctx.fillText('VS', cw / 2, ch * 0.38); ctx.restore(); }
      ctx.font = font(13); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('toca para saltar', cw - pad, ch - pad - 30 * u);
    }
    // bocadillos de frases épicas
    if (sim && sim.phase !== 'break') for (const b of G.bubbles) {
      const f = b.who === 'muslera' ? sim.p : sim.o;
      const anchor = G.toScreen(f.x, FLOOR - 262 + (f.state === 'down' ? 200 : 0));
      const shown = Math.min(b.text.length, Math.floor(b.t * 38));
      const a = b.t < 0.15 ? b.t / 0.15 : b.t > b.life - 0.3 ? (b.life - b.t) / 0.3 : 1;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `700 ${17 * u}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const maxW = Math.min(cw * 0.46, 300 * u); const words = b.text.split(' '); const lines = []; let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line);
      const lh = 21 * u, padX = 12 * u, padY = 9 * u; const bw = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))) + padX * 2, bh = lines.length * lh + padY * 2;
      let bx = clamp(anchor.x - bw / 2 + (b.who === 'muslera' ? -30 * u : 30 * u), 6, cw - bw - 6), by = clamp(anchor.y - bh - 26 * u, (G.screen === 'intro' ? 20 : 108) * u, ch - bh - 80 * u);
      const pop = b.t < 0.15 ? 0.8 + b.t / 0.15 * 0.2 : 1;
      ctx.translate(bx + bw / 2, by + bh); ctx.scale(pop, pop); ctx.translate(-(bx + bw / 2), -(by + bh));
      ctx.fillStyle = '#fffdf7'; ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 2.5 * u;
      D.rr(ctx, bx, by, bw, bh, 12 * u); ctx.fill(); ctx.stroke();
      const tx = clamp(anchor.x, bx + 20 * u, bx + bw - 20 * u);
      ctx.beginPath(); ctx.moveTo(tx - 10 * u, by + bh - 1); ctx.lineTo(anchor.x, by + bh + 18 * u); ctx.lineTo(tx + 10 * u, by + bh - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 10 * u, by + bh); ctx.lineTo(anchor.x, by + bh + 18 * u); ctx.lineTo(tx + 10 * u, by + bh); ctx.stroke();
      ctx.fillStyle = '#fffdf7'; ctx.fillRect(tx - 9 * u, by + bh - 3, 18 * u, 5);
      ctx.fillStyle = '#1a0c08'; let count = 0;
      for (let i = 0; i < lines.length; i++) { const l = lines[i]; const vis = l.slice(0, Math.max(0, shown - count)); count += l.length + 1; ctx.fillText(vis, bx + padX, by + padY + i * lh); }
      ctx.font = `700 ${11 * u}px "Barlow Condensed", sans-serif`; ctx.fillStyle = b.who === 'muslera' ? '#b84e86' : '#1f8c88'; ctx.fillText(b.who === 'muslera' ? 'MUSLERA' : 'OSCAR', bx + padX, by - 14 * u);
      ctx.restore();
    }
    // ticker de comentarios
    if (G.ticker.text && G.ticker.t < 5.5) {
      const a = G.ticker.t < 0.2 ? G.ticker.t / 0.2 : G.ticker.t > 4.8 ? (5.5 - G.ticker.t) / 0.7 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.font = font(16); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const maxW = cw - 2 * pad - 20 * u; let txt = G.ticker.text;
      while (ctx.measureText(txt).width > maxW && txt.length > 10) txt = txt.slice(0, -4) + '…';
      const inset = document.body.classList.contains('playing') && !document.body.classList.contains('portrait') ? 150 : 0;
      const tw = ctx.measureText(txt).width + 24 * u, th = 30 * u, ty = ch - pad - th - inset;
      ctx.fillStyle = G.ticker.who === 'oscar' ? 'rgba(10,60,60,0.8)' : G.ticker.who === 'muslera' ? 'rgba(90,20,60,0.8)' : 'rgba(0,0,0,0.7)'; D.rr(ctx, pad, ty, tw, th, 6 * u); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, pad + 12 * u, ty + th / 2);
      ctx.restore();
    }
    // resultado antes de la pantalla de estadísticas
    if (G.screen === 'over' && G.results) {
      const won = G.results.winner === 'player'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(60, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = won ? '#ffe36b' : '#ff8a8a';
      const txt = won ? '¡GANA MUSLERA!' : (G.results.method === 'decision' ? 'GANA OSCAR' : 'K.O.');
      ctx.strokeText(txt, cw / 2, ch * 0.8); ctx.fillText(txt, cw / 2, ch * 0.8);
    }
  }

  function renderPool(ctx) {
    const cw = G.cw, ch = G.ch;
    // encajar 960x540 con "cover"
    if (G.use3d) { root.TSM_3D.renderPool(G.t, G.pool.t / 6.5); }
    else {
      const scale = Math.max(cw / W, ch / H); const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
      ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
      D.drawPoolScene(ctx, G.t, G.sim.p, G.pool.t / 6.5);
      ctx.restore();
    }
    const u = clamp(Math.min(cw / 960, ch / 540), 0.45, 1.4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `${44 * u}px "Anton", Impact, sans-serif`; ctx.lineWidth = 6 * u; ctx.strokeStyle = '#06253a'; ctx.fillStyle = '#bff0ff';
    const ph = G.pool.t / 6.5; const txt = ph < 0.4 ? 'ENTRE ASALTOS: LA PISCINA' : ph < 0.7 ? 'GLU GLU GLU' : '¡FRESQUITO!';
    ctx.strokeText(txt, cw / 2, 18 * u); ctx.fillText(txt, cw / 2, 18 * u);
    if (G.ticker.text && G.ticker.t < 5.5) { ctx.font = `${16 * u}px "Barlow Condensed", sans-serif`; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fff'; ctx.fillText(G.ticker.text, cw / 2, ch - 16 * u); }
  }

  document.addEventListener('DOMContentLoaded', boot);
  root.TSM_GAME = G;
})(window);
