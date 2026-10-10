/* ============================================================
   TSM · bucle de juego, cámara, HUD, menús, entrada, progreso
   ============================================================ */
(function (root) {
  'use strict';
  const S = root.TSM_SIM, D = root.TSM_DRAW, AU = root.TSM_AUDIO, R3 = root.TSM_3D;
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
  function beltCount() { return D.BELTS.filter(b => save.wins >= b.wins).length; }
  function difficulty() { return clamp(beltCount() / D.BELTS.length, 0, 1); }

  // ----------------------------------------------------------- estado global
  const G = {
    canvas: null, ctx: null, cw: 0, ch: 0, dpr: 1,
    screen: 'title',       // title intro fight pool corner over
    sim: null, t: 0, acc: 0, last: 0, lastDt: 0.016,
    cam: { zoom: 1, zoomT: 0, override: null, shake: 0 },
    fx: { parts: [], texts: [], flash: 0, slow: 0, ring: [] },
    crowd: { excite: 0.2, cheer: 0 },
    ticker: { text: '', t: 0, who: '' },
    intro: { t: 0, step: 0 }, pool: { t: 0 }, corner: { t: 0 },
    touch: false, paused: false,
    input: { held: new Set(), pressed: new Set(), joy: { x: 0, y: 0, active: false } },
    lastSayAt: 0, roundCard: { text: '', t: 0 }, results: null, bubbles: [], quoteCd: { muslera: 0, oscar: 0 },
  };

  // ----------------------------------------------------------- FX
  function addText(text, x, y, z, opts) { G.fx.texts.push(Object.assign({ text, x, y, z, t: 0, life: 0.9, size: 26, color: '#fff', stroke: '#2a0a0a', vy: 0.5, rot: (Math.random() - 0.5) * 0.4 }, opts || {})); }
  function burst(x, y, z, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI, sp = (opts && opts.speed || 2.2) * (0.4 + Math.random());
      G.fx.parts.push({ x, y, z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + 1.2, vz: Math.sin(a) * Math.cos(b) * sp, t: 0, life: 0.5 + Math.random() * 0.5, r: 2 + Math.random() * 3, color: (opts && opts.color) || '#fff', g: (opts && opts.g != null) ? opts.g : 7, kind: (opts && opts.kind) || 'dot' });
    }
  }
  function sweat(f) {
    if (Math.random() < f.sweat * 0.25 && f.state !== 'down') { const h = f.headPos(); G.fx.parts.push({ x: h.x + (Math.random() - 0.5) * 0.3, y: h.y + 0.1, z: h.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 1.4, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 1.4, t: 0, life: 0.6, r: 2 + Math.random() * 1.5, color: 'rgba(180,220,255,0.9)', g: 9, kind: 'drop' }); }
  }
  function shake(a) { G.cam.shake = Math.max(G.cam.shake, a); }
  function say(text, who) { G.ticker = { text, t: 0, who: who || '' }; G.lastSayAt = G.t; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ----------------------------------------------------------- frases épicas
  const QUOTES = {
    muslera: { frances: 'Yo te puedo hablar en francés: como tú tapel, yo llameg Musler.', gordo: 'Un gordo en un súper es un súper gordo.', anal: '¡Y se la metí por detrás, por el culo, anal!', bajas: '¿Bajas tío? Eh eh eh eh ¿bajas? Eh eh ¿bajas?' },
    oscar: { btc: 'Compra BTC, bro.', especular: 'Especular e invertir no es lo mismo, bro.', dios: 'Soy Dios.', marito: '¡Meritocracia!', trump: '¡Viva Trump!' },
  };
  function quote(who, key, opts) {
    opts = opts || {};
    const text = QUOTES[who][key]; if (!text) return;
    if (!opts.force && G.t < G.quoteCd[who]) return;
    G.quoteCd[who] = G.t + (opts.cooldown || 6);
    G.bubbles = G.bubbles.filter(b => b.who !== who);
    G.bubbles.push({ who, text, t: 0, life: Math.max(2.6, 1.2 + text.length * 0.055) });
    speak(who, text);
  }
  function speak(who, text) {
    if (!save.voices || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/¡|!|¿/g, '').replace('llameg', 'yamej').replace('tapel', 'tapél'));
      u.lang = 'es-ES'; u.rate = who === 'muslera' ? 1.0 : 1.12; u.pitch = who === 'muslera' ? 0.65 : 1.15; u.volume = save.muted ? 0 : 1;
      const es = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
      if (es.length) u.voice = es[who === 'muslera' ? 0 : Math.min(1, es.length - 1)];
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { }
  }
  function cancelSpeech() { if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { } }

  const LINES = {
    hitO: ['Oscar conecta. Muslera ni lo ha visto venir.', 'Jab limpio de Oscar. Las manos, Muslera, LAS MANOS.', 'Oscar pega como quien firma un autógrafo.', 'Golpe de Oscar. Alguien en el público ha dicho "uf".', 'Oscar encuentra la cara de Muslera. No era difícil: la guardia está en el sótano.', 'Directo de Oscar. El perro ha mirado hacia otro lado.'],
    hitP: ['¡Muslera conecta! ¡El público se levanta!', '¡Eso es, Muslera! ¡Con todo!', '¡Golpe del pueblo! ¡Oscar lo ha notado!', '¡Muslera encuentra el hueco! ¡Vamos!', '¡TOMA YA! Eso ha sonado en toda la urbanización.'],
    blockO: ['Oscar bloquea como un profesional. Porque lo es.', 'Guardia de Oscar. Sólida como la tapia del fondo.', 'Oscar cubre. Ni se despeina.'],
    blockP: ['Muslera se cubre tarde, pero se cubre.', '¡Bloqueo de Muslera! Alguien le ha enseñado algo.', 'Muslera sube las manos. Milagro en la casa rural.'],
    whiffP: ['Muslera pega al aire. El aire está KO.', 'Muslera lanza y no hay nadie. Clásico.', 'Golpe al vacío. Oscar sonríe.'],
    whiffO: ['Oscar falla. Esto no pasa a menudo.', 'Oscar pega al aire. Toma nota, Muslera.'],
    upperP: ['¡¡UPPERCUT DE MUSLERA!! ¡Con las manos abajo le sale solo!', '¡GANCHO DESDE EL SÓTANO! ¡Oscar lo ha visto todo blanco!'],
    upperO: ['¡Uppercut de Oscar! Muslera ha visto a su abuela.', 'Gancho de Oscar. Eso duele hasta en el público.'],
    flyP: ['¡¡PUÑETAZO VOLADOR DE MUSLERA!! ¡Nadie en la casa rural se lo esperaba!', '¡Muslera vuela! Mal, pero vuela.'],
    flyO: ['¡Oscar salta y conecta! Esto ya es exhibición.'],
    duckP: ['¡Muslera se agacha! Por una vez tener la cabeza baja sirve de algo.', 'Oscar pega al aire por encima de Muslera. ¡Agachado!'],
    duckO: ['Oscar se agacha. Cómo no.'],
    roundStart: { 1: ['¡Primer asalto! Oscar hace boxeo. Muslera hace... lo que puede.', '¡Empieza la pelea! Recordad: todos somos Muslera.'], 2: ['¡Segundo asalto! Muslera vuelve. Veremos si con cabeza o sin ella.', '¡Segundo asalto! Oscar sigue fresco. Muslera sigue siendo Muslera.'], 3: ['¡Último asalto! Lo que pase aquí se contará en el grupo durante años.', '¡Tercer asalto! Si Muslera sigue de pie es porque el césped es blando.'] },
  };

  // ----------------------------------------------------------- arranque
  function boot() {
    loadSave();
    G.canvas = $('game'); G.ctx = G.canvas.getContext('2d');
    G.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch', G.touch);
    G.use3d = !!(R3 && R3.init($('game3d'), { mobile: G.touch }));
    AU.muted = !!save.muted; updateMuteBtn();
    bindInput(); bindUI();
    resize(); window.addEventListener('resize', resize);
    if (!G.use3d) { showScreen('nogl'); return; }
    showScreen('title'); refreshTitle();
    requestAnimationFrame(loop);
  }
  function resize() {
    const area = $('arena');
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
    const r = area.getBoundingClientRect();
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    G.cw = Math.max(1, Math.round(r.width)); G.ch = Math.max(1, Math.round(r.height));
    G.canvas.width = Math.round(G.cw * G.dpr); G.canvas.height = Math.round(G.ch * G.dpr);
    G.canvas.style.width = G.cw + 'px'; G.canvas.style.height = G.ch + 'px';
    if (G.use3d) { const c3 = $('game3d'); c3.style.width = G.cw + 'px'; c3.style.height = G.ch + 'px'; R3.resize(G.cw, G.ch); }
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
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', KeyJ: 'jab', KeyZ: 'jab', KeyK: 'cross', KeyX: 'cross', KeyL: 'upper', KeyC: 'upper', Space: 'jump', ShiftLeft: 'block', ShiftRight: 'block', ControlLeft: 'crouch', ControlRight: 'crouch', KeyV: 'dodge', KeyQ: 'dodge', KeyE: 'dodge' };
  function press(a) { if (!G.input.held.has(a)) G.input.pressed.add(a); G.input.held.add(a); }
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
    // joystick flotante
    const zone = $('joy'), base = $('joy-base'), knob = $('joy-knob'); let jid = null, ox = 0, oy = 0; const R = 44;
    const setJoy = (x, y) => { const d = Math.hypot(x, y); const k = d > R ? R / d : 1; x *= k; y *= k; knob.style.transform = `translate(${x}px, ${y}px)`; const dead = 8; const m = Math.max(0, d * k - dead) / (R - dead); const nx = d > 0 ? x / (d * k) : 0, ny = d > 0 ? y / (d * k) : 0; G.input.joy.x = nx * m; G.input.joy.y = -ny * m; };
    zone.addEventListener('pointerdown', e => {
      if (jid !== null) return; jid = e.pointerId; AU.init(); if (G.screen === 'intro') skipIntro();
      const r = zone.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
      base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); G.input.joy.active = true; setJoy(0, 0);
      zone.setPointerCapture(e.pointerId); e.preventDefault();
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId !== jid) return; const r = zone.getBoundingClientRect(); setJoy(e.clientX - r.left - ox, e.clientY - r.top - oy); e.preventDefault(); });
    const endJoy = e => { if (e.pointerId !== jid) return; jid = null; base.classList.remove('on'); G.input.joy.x = G.input.joy.y = 0; G.input.joy.active = false; knob.style.transform = ''; };
    zone.addEventListener('pointerup', endJoy); zone.addEventListener('pointercancel', endJoy);
    $('arena').addEventListener('pointerdown', () => { AU.init(); if (G.screen === 'intro') skipIntro(); });
  }
  // convierte la entrada (relativa a la pantalla) en acercarse/lateral respecto al rival
  function readInput() {
    const h = G.input.held, p = G.input.pressed;
    let sx = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0), sy = (h.has('up') ? 1 : 0) - (h.has('down') ? 1 : 0);
    if (G.input.joy.active) { sx = G.input.joy.x; sy = G.input.joy.y; }
    let approach = 0, strafe = 0;
    if ((sx || sy) && G.sim) {
      const b = R3.cameraBasis(); const wx = b.rightX * sx + b.fwdX * sy, wz = b.rightZ * sx + b.fwdZ * sy;
      const f = G.sim.p; approach = wx * f.fx + wz * f.fz; strafe = wx * (-f.fz) + wz * f.fx;
    }
    const inp = { approach, strafe, block: h.has('block'), crouch: h.has('crouch'), jab: p.has('jab'), cross: p.has('cross'), upper: p.has('upper'), dodge: p.has('dodge'), jump: p.has('jump'), mash: p.has('jab') || p.has('cross') || p.has('upper') || p.has('dodge') || p.has('jump') };
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
    $('btn-voice').onclick = () => { save.voices = !save.voices; persist(); updateMuteBtn(); if (save.voices) speak('oscar', 'Soy Dios.'); else cancelSpeech(); };
    $('btn-full').onclick = () => goFullscreen();
    $('btn-resume').onclick = () => togglePause();
    $('btn-quit').onclick = () => { G.paused = false; cancelSpeech(); G.screen = 'title'; showScreen('title'); refreshTitle(); };
    $('btn-pause').onclick = () => togglePause();
    $('btn-reset').onclick = () => { if ($('btn-reset').dataset.armed) { Object.assign(save, { wins: 0, losses: 0, fights: 0, streak: 0, bestStreak: 0, kos: 0, pool: 0, fastest: 0, decisions: 0, knockedDown: 0 }); persist(); renderBelts(); $('btn-reset').textContent = 'Progreso borrado'; delete $('btn-reset').dataset.armed; } else { $('btn-reset').dataset.armed = '1'; $('btn-reset').textContent = '¿Seguro? Pulsa otra vez'; } };
  }
  function updateMuteBtn() {
    $('btn-mute').textContent = save.muted ? '🔇' : '🔊'; $('btn-mute').setAttribute('aria-label', save.muted ? 'Activar sonido' : 'Silenciar');
    $('btn-voice').textContent = save.voices ? '🗣️' : '🤐'; $('btn-voice').setAttribute('aria-label', save.voices ? 'Quitar voces' : 'Poner voces'); $('btn-voice').classList.toggle('off', !save.voices);
  }
  function goFullscreen() {
    const el = document.documentElement; const req = el.requestFullscreen || el.webkitRequestFullscreen;
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
    const dif = Math.round(difficulty() * 100);
    $('title-next').textContent = (next ? `Siguiente: ${next.name} con ${next.wins} ${next.wins === 1 ? 'victoria' : 'victorias'}` : 'Has llegado al final. Eres leyenda.') + (dif > 0 ? ` · Oscar un ${dif}% más serio` : '');
    const c = $('title-beltcv'); const ctx = c.getContext('2d'); c.width = 220 * 2; c.height = 60 * 2; ctx.scale(2, 2); ctx.clearRect(0, 0, 220, 60);
    if (belt) D.drawBelt(ctx, 110, 30, 200, belt, false); else D.drawBelt(ctx, 110, 30, 200, { color: '#555', trim: '#333' }, true);
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
    G.sim = new S.Sim({ difficulty: difficulty() });
    G.sim.p.x = 0.6; G.sim.p.z = 0.4; G.sim.o.x = 9.2; G.sim.o.z = 0.4; G.sim.face();
    G.screen = 'intro'; G.intro = { t: 0, step: 0 }; G.paused = false; $('ov-pause').hidden = true;
    G.fx.parts.length = 0; G.fx.texts.length = 0; G.bubbles.length = 0; G.crowd.excite = 0.3; G.crowd.cheer = 0;
    G.cam.override = null; G.cam.zoom = 1;
    showScreen('none'); setControls(G.touch);
    AU.init(); AU.crowd(0.25); AU.intro();
    say('Casa rural. Noche. Dos amigos, dos pares de guantes y ninguna idea buena.', '');
  }
  function skipIntro() { if (G.screen === 'intro' && G.intro.t > 0.5) { G.intro.t = 99; G.bubbles.length = 0; cancelSpeech(); } }
  function beginRound1() {
    G.screen = 'fight'; G.sim.beginRound(); G.sim.p.face = 'normal'; G.sim.o.face = 'normal';
    G.roundCard = { text: 'ASALTO 1', t: 0 }; AU.crowd(0.3); G.cam.override = null; G.cam.zoom = 1; G.nextIdleQuote = G.t + 14;
    say(pick(LINES.roundStart[1]), '');
  }
  function chooseBreak(choice) {
    const sim = G.sim; if (!sim || sim.phase !== 'break') return;
    showScreen('none');
    if (choice === 'pool' && !sim.poolUsed) {
      sim.applyBreakChoice('pool'); save.pool++; persist();
      G.screen = 'pool'; G.pool = { t: 0, splashed: false, shook: false, healed: true, x0: sim.p.x, z0: sim.p.z, px: clamp(sim.p.x, 2.2, 6.2) }; AU.crowd(0.15);
      say('Muslera se va a la piscina. Entre asaltos. Como un campeón. O como un pato.', 'muslera');
    } else {
      sim.applyBreakChoice('rest');
      G.screen = 'corner'; G.corner = { t: 0 }; say('Muslera descansa en la esquina. Oscar ni se ha sentado.', '');
    }
  }
  function startNextRound() {
    const sim = G.sim; sim.nextRound();
    G.screen = 'fight'; G.roundCard = { text: 'ASALTO ' + sim.round, t: 0 }; G.cam.override = null; G.cam.zoom = 1;
    say(pick(LINES.roundStart[sim.round] || LINES.roundStart[3]), '');
    if (G.pool.healed) { G.pool.healed = false; setTimeout(() => { const h = sim.p.headPos(); addText('¡VIDA AL MÁXIMO!', h.x, h.y + 0.6, h.z, { size: 34, color: '#8dffb0', stroke: '#0a3a1a', life: 1.6, vy: 0.3 }); }, 600); setTimeout(() => quote('muslera', 'gordo', { force: true }), 2600); }
    G.nextIdleQuote = G.t + 12;
    AU.crowd(0.3); setControls(G.touch);
  }
  function showBreak() {
    const sim = G.sim; const sc = sim.scores[sim.scores.length - 1];
    $('break-title').textContent = `FIN DEL ASALTO ${sim.round}`;
    $('break-score').innerHTML = `<div class="sc"><span>Muslera</span><b>${sc.p}</b><small>${sc.pd} de daño</small></div><div class="sc"><span>Oscar</span><b>${sc.o}</b><small>${sc.od} de daño</small></div>`;
    $('break-judges').textContent = sc.p > sc.o ? '¡Muslera gana el asalto! Los jueces no se lo creen.' : sc.p === sc.o ? 'Asalto igualado. Y los jueces son amigos de Oscar.' : 'Asalto para Oscar. Los jueces lo tenían claro antes de empezar.';
    $('break-state').textContent = `Muslera: ${Math.round(sim.p.hp)}% de vida · ${Math.round(sim.p.stamina)}% de aguante`;
    $('btn-pool').disabled = sim.poolUsed; $('btn-pool').querySelector('small').textContent = sim.poolUsed ? 'Ya la has usado. Solo una vez por pelea.' : 'VIDA AL MÁXIMO · aguante al máximo · 20 s fresquito';
    showScreen('break');
  }
  function endFight(res) {
    G.screen = 'over'; G.results = res;
    save.fights++;
    if (res.winner === 'player') { save.wins++; save.streak++; save.bestStreak = Math.max(save.bestStreak, save.streak); if (res.method !== 'decision') save.kos++; else save.decisions++; const secs = (res.round - 1) * 60 + res.time; if (!save.fastest || secs < save.fastest) save.fastest = secs; }
    else { save.losses++; save.streak = 0; }
    save.knockedDown += res.kd.p; persist();
    AU.crowd(res.winner === 'player' ? 0.7 : 0.35);
    setTimeout(() => quote(res.winner === 'player' ? 'muslera' : 'oscar', res.winner === 'player' ? pick(['anal', 'frances']) : pick(['dios', 'trump']), { force: true }), 2000);
    if (res.winner === 'player') { AU.win(); G.crowd.cheer = 1; const w = G.sim.p; for (let i = 0; i < 6; i++) setTimeout(() => burst(w.x + (Math.random() - 0.5) * 3, 2 + Math.random() * 1.5, w.z + (Math.random() - 0.5) * 2, 40, { color: pick(['#f2d33b', '#ec93c0', '#56cfcb', '#fff', '#f08a2a']), speed: 3, g: 3 }), i * 350); }
    else AU.lose();
    setTimeout(showResults, 2600);
  }
  function showResults() {
    const r = G.results; if (!r || G.screen !== 'over') return;
    const won = r.winner === 'player';
    $('res-title').textContent = won ? '¡¡HAS GANADO A OSCAR!!' : 'OSCAR GANA';
    $('res-title').className = won ? 'win' : 'lose';
    const method = r.method === 'decision' ? 'por decisión de los jueces' : r.method === 'KO' ? 'por KO' : 'por KO técnico (tres caídas)';
    const when = r.method === 'decision' ? 'tras tres asaltos' : `en el asalto ${r.round}, minuto ${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}`;
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
    const next = nextBelt();
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
      const hp = (who) => (who === 'muslera' ? sim.p : sim.o).headPos();
      switch (e.type) {
        case 'bell': AU.bell(e.kind === 'end' ? 3 : 1); if (e.kind === 'end') { say(`Fin del asalto ${e.round}. Los dos a su esquina. Muslera a por aire.`, ''); G.crowd.cheer = 0.4; } break;
        case 'whiff': AU.whiff(); if (Math.random() < 0.3 && G.t - G.lastSayAt > 2.5) say(pick(e.who === 'muslera' ? LINES.whiffP : LINES.whiffO), e.who); break;
        case 'hit': {
          const byP = e.by === 'muslera';
          if (e.counter) AU.counter(); else AU.punch(e.move === 'fly' ? 'upper' : e.move);
          shake(e.counter ? 14 : (e.move === 'upper' || e.move === 'fly') ? 10 : e.move === 'cross' ? 6 : 3);
          if (e.counter || e.move === 'upper' || e.move === 'fly') { G.cam.zoom = e.counter ? 0.8 : 0.88; G.cam.zoomT = e.counter ? 0.6 : 0.35; }
          else if (G.cam.zoomT <= 0) { G.cam.zoom = 0.95; G.cam.zoomT = 0.18; }
          burst(e.x, e.y, e.z, e.counter ? 22 : 10, { color: byP ? '#ffe36b' : '#ffffff', speed: e.counter ? 3.2 : 1.8 });
          G.fx.ring.push({ x: e.x, y: e.y, z: e.z, t: 0, big: e.counter || e.move === 'upper' || e.move === 'fly' });
          const word = e.counter ? '¡CONTRA!' : e.move === 'fly' ? '¡VOLADOR!' : e.move === 'upper' ? pick(['¡UPPER!', '¡GANCHO!']) : pick(['¡PUM!', '¡PAM!', '¡ZAS!', '¡TOMA!', '¡CLONC!']);
          addText(word, e.x, e.y + 0.35, e.z, { size: e.counter ? 48 : (e.move === 'upper' || e.move === 'fly') ? 40 : 28, color: byP ? '#ffe36b' : '#ffffff', stroke: byP ? '#6b3a00' : '#2a0a0a' });
          if (e.combo >= 3) addText(`COMBO x${e.combo}`, e.x, e.y + 0.85, e.z, { size: 22, color: '#ffd1e8', stroke: '#5a1030', life: 1.1 });
          if (e.air) addText('¡DEL AIRE!', e.x, e.y + 0.7, e.z, { size: 24, color: '#cfe8ff', stroke: '#10304a', life: 1 });
          G.crowd.excite = clamp(G.crowd.excite + (byP ? 0.2 : 0.08), 0, 1); if (byP) G.crowd.cheer = Math.max(G.crowd.cheer, e.counter ? 1 : 0.5);
          AU.crowdBurst(byP ? 0.25 : 0.08);
          if (byP && e.counter && Math.random() < 0.5) quote('muslera', 'bajas');
          if (!byP && (e.move === 'upper' || e.combo >= 3) && Math.random() < 0.45) quote('oscar', 'marito');
          if (!e.counter && Math.random() < 0.3 && G.t - G.lastSayAt > 2.5) say(pick(e.move === 'fly' ? (byP ? LINES.flyP : LINES.flyO) : e.move === 'upper' ? (byP ? LINES.upperP : LINES.upperO) : (byP ? LINES.hitP : LINES.hitO)), e.by);
          break;
        }
        case 'block': AU.punch('jab', true); addText(e.perfect ? '¡PARADA!' : 'BLOQUEO', e.x, e.y + 0.4, e.z, { size: 20, color: '#cfe8ff', stroke: '#10304a', life: 0.7 }); if (Math.random() < 0.2 && G.t - G.lastSayAt > 3) say(pick(e.who === 'oscar' ? LINES.blockO : LINES.blockP), e.who); break;
        case 'parry': { const h = hp('oscar'); addText('¡OSCAR LEE EL GOLPE!', h.x, h.y + 0.7, h.z, { size: 20, color: '#56cfcb', stroke: '#083a3a', life: 1 }); break; }
        case 'dodge': AU.dodge(); addText('ESQUIVA', e.x, e.y + 0.5, e.z, { size: 22, color: '#b8ffb8', stroke: '#0a3a0a', life: 0.8 }); if (e.who === 'muslera') G.fx.slow = 0.25; break;
        case 'duck': AU.whiff(); addText('¡AGACHADO!', e.x, e.y + 0.1, e.z, { size: 24, color: '#b8ffb8', stroke: '#0a3a0a', life: 0.9 }); if (Math.random() < 0.4 && G.t - G.lastSayAt > 2.5) say(pick(e.who === 'muslera' ? LINES.duckP : LINES.duckO), e.who); break;
        case 'jump': AU.dodge(); break;
        case 'land': { const f = e.who === 'muslera' ? sim.p : sim.o; if (e.hard) { AU.punch('cross', true); shake(5); burst(f.x, 0.05, f.z, 12, { color: 'rgba(120,200,90,0.9)', speed: 1.4, g: 6 }); } break; }
        case 'knockdown': {
          AU.knockdown(); shake(26); G.fx.flash = 1; G.fx.slow = 0.9;
          const f = e.who === 'oscar' ? sim.o : sim.p;
          addText(e.who === 'oscar' ? '¡¡AL SUELO!!' : '¡¡MUSLERA CAE!!', (sim.p.x + sim.o.x) / 2, 2.6, (sim.p.z + sim.o.z) / 2, { size: 54, color: e.who === 'oscar' ? '#ffe36b' : '#ff8a8a', stroke: '#3a0a0a', life: 1.8, vy: 0.1 });
          G.crowd.excite = 1; G.crowd.cheer = 1; AU.crowd(0.7, true);
          burst(f.x, 1.5, f.z, 30, { color: '#fff', speed: 3 });
          G.cam.zoom = 0.72; G.cam.zoomT = 2.2;
          setTimeout(() => quote(e.who === 'oscar' ? 'muslera' : 'oscar', e.who === 'oscar' ? 'anal' : 'dios', { force: true }), 900);
          break;
        }
        case 'count': if (e.n === 4 && e.who === 'oscar') quote('muslera', 'bajas', { force: true }); if (e.n > 0 && e.n <= 10) { AU.count(e.n); const f = e.who === 'muslera' ? sim.p : sim.o; addText(String(e.n), f.x, 1.6, f.z, { size: 56, color: '#fff', stroke: '#000', life: 0.8, vy: 0.2 }); } break;
        case 'getUp': AU.getUp(); G.crowd.cheer = 0.6; AU.crowd(0.4); break;
        case 'taunt': { AU.taunt(); const h = hp('oscar'); addText('¡OSCAR VACILA!', h.x, h.y + 0.75, h.z, { size: 26, color: '#56cfcb', stroke: '#083a3a', life: 1.2 }); G.crowd.cheer = 0.5; quote('oscar', pick(['trump', 'btc', 'especular']), { force: true, cooldown: 3 }); break; }
        case 'say': if (G.t - G.lastSayAt > 0.8 || /CONTRA|SUELO|levanta|chulo|vacil|momento|aire/i.test(e.text)) say(e.text, e.who); break;
        case 'break': showBreak(); setControls(false); break;
        case 'over': endFight(e); break;
      }
    }
  }

  // ----------------------------------------------------------- bucle
  function loop(now) {
    requestAnimationFrame(loop);
    if (G.freeze) { G.last = now; return; }
    const dtRaw = Math.min(0.05, (now - (G.last || now)) / 1000); G.last = now; G.lastDt = dtRaw;
    G.t += dtRaw;
    if (!G.paused) update(dtRaw);
    render();
  }
  function update(dt) {
    const sim = G.sim;
    if (G.fx.slow > 0) G.fx.slow -= dt;
    const simDt = dt * (G.fx.slow > 0 ? 0.45 : 1);
    for (const p of G.fx.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.g * dt; if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; } }
    G.fx.parts = G.fx.parts.filter(p => p.t < p.life);
    for (const t of G.fx.texts) { t.t += dt; t.y += t.vy * dt; }
    G.fx.texts = G.fx.texts.filter(t => t.t < t.life);
    for (const r of G.fx.ring) r.t += dt; G.fx.ring = G.fx.ring.filter(r => r.t < 0.35);
    G.fx.flash = Math.max(0, G.fx.flash - dt * 3);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 60);
    if (G.cam.zoomT > 0) { G.cam.zoomT -= dt; if (G.cam.zoomT <= 0 && G.screen === 'fight') G.cam.zoom = 1; }
    G.crowd.cheer = Math.max(0, G.crowd.cheer - dt * 0.7);
    G.crowd.excite = Math.max(0.15, G.crowd.excite - dt * 0.05);
    G.ticker.t += dt; G.roundCard.t += dt;
    for (const b of G.bubbles) b.t += dt; G.bubbles = G.bubbles.filter(b => b.t < b.life);
    switch (G.screen) {
      case 'intro': updateIntro(dt); break;
      case 'fight': {
        G.acc += simDt; let n = 0;
        const inp = readInput();
        while (G.acc >= 1 / 60 && n < 4) { sim.update(1 / 60, inp); handleEvents(sim); inp.jab = inp.cross = inp.upper = inp.dodge = inp.jump = inp.mash = false; G.acc -= 1 / 60; n++; }
        sweat(sim.p); sweat(sim.o);
        if (sim.p.fresh > 0 && Math.random() < 0.3) { const h = sim.p.headPos(); G.fx.parts.push({ x: h.x + (Math.random() - 0.5) * 0.24, y: h.y - 0.2, z: h.z + (Math.random() - 0.5) * 0.24, vx: 0, vy: -0.3, vz: 0, t: 0, life: 0.5, r: 2, color: 'rgba(160,220,255,0.9)', g: 5, kind: 'drop' }); }
        if (sim.phase === 'fight' && G.t > (G.nextIdleQuote || 0)) { G.nextIdleQuote = G.t + 16 + Math.random() * 14; if (Math.random() < 0.6) quote('muslera', pick(['frances', 'gordo'])); else quote('oscar', pick(['btc', 'especular'])); }
        G.cam.override = G.debugCam || null;
        break;
      }
      case 'pool': updatePool(dt); break;
      case 'corner': { G.corner.t += dt; G.acc += dt; while (G.acc >= 1 / 60) { sim.update(1 / 60, {}); G.acc -= 1 / 60; } if (G.corner.t > 2.4) startNextRound(); break; }
      case 'over': {
        G.acc += dt; while (G.acc >= 1 / 60) { sim.update(1 / 60, {}); G.acc -= 1 / 60; }
        const w = G.results && G.results.winner === 'player' ? sim.p : sim.o;
        G.cam.override = { focus: { x: w.x, y: 1.15, z: w.z }, yaw: Math.PI / 2 + Math.sin(G.t * 0.35) * 0.55, dist: 4.6, height: 0.5 };
        break;
      }
      case 'title': G.cam.override = null; break;
    }
  }

  function updateIntro(dt) {
    const sim = G.sim, I = G.intro; I.t += dt;
    const o = sim.o, p = sim.p;
    const walk = (f, from, to, t0, t1) => { const k = clamp((I.t - t0) / (t1 - t0), 0, 1); f.x = lerp(from, to, k); f.z = 0.4; const moving = k > 0 && k < 1; f.state = moving ? 'walk' : 'idle'; f.moveA = moving ? 1 : 0; f.speed = moving ? 1.3 : 0; f.t = I.t; f.face = 'normal'; };
    walk(o, 9.2, 6.0, 0.4, 2.9); walk(p, 0.6, 3.6, 3.4, 5.9);
    sim.face();
    if (I.step === 0 && I.t > 0.6) { I.step = 1; G.crowd.cheer = 0.8; say('¡Entra OSCAR! Con medallas. Medallas de verdad. Esto empieza mal para Muslera.', 'oscar'); AU.crowdBurst(0.5); }
    if (I.step === 1 && I.t > 2.0) { I.step = 2; quote('oscar', 'btc', { force: true }); }
    if (I.step === 2 && I.t > 3.5) { I.step = 3; G.crowd.cheer = 0.5; say('Y aquí llega MUSLERA, con su toalla, sus guantes rosas y la guardia por los suelos.', 'muslera'); }
    if (I.step === 3 && I.t > 4.6) { I.step = 4; quote('muslera', 'frances', { force: true }); }
    if (I.step === 4 && I.t > 6.4) { I.step = 5; say('Tres asaltos de un minuto. Que gane el mejor. O sea, Oscar. Salvo que...', ''); }
    if (I.step === 5 && I.t > 7.3) { I.step = 6; quote('oscar', 'dios', { force: true }); }
    if (I.t < 3.4) G.cam.override = { focus: { x: o.x - 0.2, y: 1.25, z: o.z }, yaw: Math.PI / 2 + 0.7, dist: 3.4, height: 0.25 };
    else if (I.t < 6.4) G.cam.override = { focus: { x: p.x + 0.2, y: 1.25, z: p.z }, yaw: Math.PI / 2 - 0.7, dist: 3.4, height: 0.25 };
    else G.cam.override = null;
    if (I.t > 8.6) { p.x = 3.6; o.x = 6.0; p.moveA = o.moveA = 0; p.speed = o.speed = 0; beginRound1(); }
  }

  function updatePool(dt) {
    const P = G.pool, sim = G.sim, p = sim.p, o = sim.o; P.t += dt;
    const total = 7.2, ph = P.t / total;
    const walkK = clamp(ph / 0.3, 0, 1), kneel = clamp((ph - 0.3) / 0.12, 0, 1), dunk = clamp((ph - 0.42) / 0.08, 0, 1), under = ph > 0.46 && ph < 0.66, out = clamp((ph - 0.66) / 0.08, 0, 1), shaking = ph > 0.76 && ph < 0.95;
    // Oscar se queda en su esquina
    o.state = 'idle'; o.t += dt; o.x = 6.4; o.z = 0.2;
    // Muslera camina hasta el borde de la piscina
    const tx = P.px, tz = 3.78;
    const k = 1 - Math.pow(1 - walkK, 2);
    p.x = lerp(P.x0, tx, k); p.z = lerp(P.z0, tz, k);
    p.yaw = -Math.PI / 2; p.fx = 0; p.fz = 1; p.t += dt;
    const moving = walkK < 1; p.state = moving ? 'walk' : 'idle'; p.moveA = moving ? 1 : 0; p.speed = moving ? 1.4 : 0;
    const dip = dunk - out;
    const mode = (dunk > 0 && dunk < 1) || (out > 0 && out < 1) ? 'splash' : under ? 'under' : shaking ? 'shake' : null;
    G.poolPose = { k: kneel, dip, under, shake: shaking, wet: ph > 0.5, hx: tx, hz: tz + 0.78, splash: mode };
    if (!P.splashed && dunk > 0) { P.splashed = true; AU.splash(); AU.bubbles(1.6); }
    if (!P.shook && shaking) { P.shook = true; AU.splash(); say('¡FRESQUITO! Muslera vuelve con la cabeza mojada y las ideas... igual de poco claras.', 'muslera'); }
    G.cam.override = { focus: { x: tx, y: 0.4 + (1 - kneel) * 0.6, z: tz + 0.5 }, yaw: 0.7 + kneel * 0.1, dist: 3.4 - kneel * 0.3, height: 0.8 + kneel * 0.6 };
    if (ph >= 1) { G.poolPose = null; startNextRound(); }
  }

  // ----------------------------------------------------------- render
  function render() {
    const ctx = G.ctx, cw = G.cw, ch = G.ch;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const sim = G.sim;
    R3.render({ sim, t: G.t, dt: G.lastDt, screen: G.screen, cheer: G.crowd.cheer, excite: G.crowd.excite, intro: G.screen === 'intro', shake: G.cam.shake, zoom: G.cam.zoom, cam: G.cam.override, poolPose: G.screen === 'pool' ? G.poolPose : null });
    const s = R3.pxPerMeter() / 100;
    drawEffects(ctx, s);
    if (G.fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.fx.flash * 0.6})`; ctx.fillRect(0, 0, cw, ch); }
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    if (sim && ['fight', 'over', 'corner', 'intro', 'pool'].includes(G.screen)) renderHUD(ctx, s);
  }
  function drawEffects(ctx, s) {
    const P = R3.project;
    for (const r of G.fx.ring) { const k = r.t / 0.35; const p = P(r.x, r.y, r.z); if (p.behind) continue; ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = (r.big ? 6 : 3) * (1 - k) * s; ctx.beginPath(); ctx.arc(p.x, p.y, ((r.big ? 90 : 50) * k + 10) * s, 0, Math.PI * 2); ctx.stroke(); }
    for (const p of G.fx.parts) { const a = 1 - p.t / p.life; const q = P(p.x, p.y, p.z); if (q.behind) continue; ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); if (p.kind === 'drop') ctx.ellipse(q.x, q.y, p.r * 0.7 * s, p.r * 1.3 * s, 0, 0, Math.PI * 2); else ctx.arc(q.x, q.y, p.r * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const t of G.fx.texts) {
      const k = t.t / t.life; const pop = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.5 : 1.1 - Math.min(0.1, (t.t - 0.12));
      const q = P(t.x, t.y, t.z); if (q.behind) continue; q.y = Math.max(q.y, G.ch * 0.2);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t.rot); ctx.scale(pop * s, pop * s); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${t.size}px "Anton", Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, t.size / 7); ctx.strokeStyle = t.stroke; ctx.lineJoin = 'round'; ctx.strokeText(t.text, 0, 0); ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }

  function renderHUD(ctx, s) {
    const sim = G.sim, cw = G.cw, ch = G.ch;
    const u = clamp(Math.min(cw / 960, ch / 540), 0.5, 1.4);
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
    if (G.screen !== 'intro' && G.screen !== 'pool') {
      drawBar(pad + 54 * u, top, barW, barH, sim.p.hp / sim.p.maxHp, '#e8463c', false, '#ff2a2a');
      drawBar(pad + 54 * u, top + barH + 5 * u, barW * 0.7, 7 * u, sim.p.stamina / sim.p.maxStamina, sim.p.fresh > 0 ? '#7fe0ff' : '#f2c230');
      drawBar(cw - pad - 54 * u - barW, top, barW, barH, sim.o.hp / sim.o.maxHp, '#e8463c', true, '#ff2a2a');
      drawBar(cw - pad - 54 * u - barW * 0.7, top + barH + 5 * u, barW * 0.7, 7 * u, sim.o.stamina / sim.o.maxStamina, '#f2c230', true);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; D.rr(ctx, pad, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.fill(); ctx.beginPath(); D.rr(ctx, pad, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.clip(); ctx.translate(pad + 24 * u, top + 20 * u); ctx.scale(u, u); D.drawPortrait(ctx, 'muslera', 0, 0, 56, sim.p.face === 'hit' ? 'hit' : sim.p.hp < 30 ? 'tired' : 'normal', { wet: sim.p.fresh > 0 }); ctx.restore();
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; D.rr(ctx, cw - pad - 48 * u, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.fill(); ctx.beginPath(); D.rr(ctx, cw - pad - 48 * u, top - 6 * u, 48 * u, 48 * u, 8 * u); ctx.clip(); ctx.translate(cw - pad - 24 * u, top + 20 * u); ctx.scale(-u, u); D.drawPortrait(ctx, 'oscar', 0, 0, 54, sim.o.face === 'hit' ? 'hit' : sim.o.hp < 30 ? 'tired' : 'angry'); ctx.restore();
      ctx.font = font(20, '"Anton", Impact, sans-serif'); ctx.textBaseline = 'top'; ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'left'; ctx.strokeText('MUSLERA', pad + 56 * u, top + barH + 14 * u); ctx.fillText('MUSLERA', pad + 56 * u, top + barH + 14 * u);
      ctx.textAlign = 'right'; ctx.strokeText('OSCAR', cw - pad - 56 * u, top + barH + 14 * u); ctx.fillText('OSCAR', cw - pad - 56 * u, top + barH + 14 * u);
      ctx.font = font(12); ctx.fillStyle = '#ffd7d7'; ctx.textAlign = 'left'; ctx.fillText('EL PUEBLO · guardia baja', pad + 56 * u, top + barH + 36 * u); ctx.textAlign = 'right'; ctx.fillText('EL CAMPEÓN · guardia alta', cw - pad - 56 * u, top + barH + 36 * u);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < sim.p.knockdowns ? '#ff5a5a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(pad + 56 * u + barW - 10 * u - i * 14 * u, top + barH + 24 * u, 4 * u, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = i < sim.o.knockdowns ? '#ff5a5a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(cw - pad - 56 * u - barW + 10 * u + i * 14 * u, top + barH + 24 * u, 4 * u, 0, Math.PI * 2); ctx.fill(); }
      const tm = Math.max(0, Math.ceil(sim.roundT)); const mm = Math.floor(tm / 60), ss = tm % 60;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; D.rr(ctx, cw / 2 - 48 * u, top - 4 * u, 96 * u, 50 * u, 8 * u); ctx.fill();
      ctx.font = font(30, '"Anton", Impact, sans-serif'); ctx.textAlign = 'center'; ctx.fillStyle = sim.roundT < 10 ? '#ff6b6b' : '#fff'; ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, cw / 2, top);
      ctx.font = font(12); ctx.fillStyle = '#ffd7a0'; ctx.fillText(`ASALTO ${sim.round} / 3`, cw / 2, top + 32 * u);
      if (sim.p.fresh > 0) { ctx.font = font(13); ctx.fillStyle = '#9fe9ff'; ctx.textAlign = 'left'; ctx.fillText(`FRESQUITO ${Math.ceil(sim.p.fresh)}s`, pad + 56 * u + barW * 0.7 + 8 * u, top + barH + 3 * u); }
      if (sim.phase === 'count') {
        const down = sim.p.state === 'down' ? sim.p : sim.o; ctx.textAlign = 'center';
        if (down === sim.p) {
          ctx.font = font(26, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; ctx.strokeText('¡LEVÁNTATE! MACHACA LOS BOTONES', cw / 2, ch * 0.22); ctx.fillText('¡LEVÁNTATE! MACHACA LOS BOTONES', cw / 2, ch * 0.22);
          const bw = Math.min(cw * 0.5, 360 * u); drawBar(cw / 2 - bw / 2, ch * 0.22 + 40 * u, bw, 16 * u, down.rise.got / Math.max(1, down.rise.need), '#7fe0ff');
          if (down.count < 3) { ctx.font = font(14); ctx.fillStyle = '#ffd7a0'; ctx.fillText('(tienes que esperar al 3 para levantarte)', cw / 2, ch * 0.22 + 62 * u); }
        } else {
          ctx.font = font(26, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#ffe36b'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; ctx.strokeText('¡¡OSCAR EN EL SUELO!!', cw / 2, ch * 0.22); ctx.fillText('¡¡OSCAR EN EL SUELO!!', cw / 2, ch * 0.22);
        }
      }
      if (sim.phase === 'ready' && G.screen === 'fight') {
        ctx.textAlign = 'center'; ctx.font = font(22, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4 * u; const txt = sim.phaseT > 1.1 ? '¡BOXEAD!' : 'PREPARADOS...'; ctx.strokeText(txt, cw / 2, ch * 0.62); ctx.fillText(txt, cw / 2, ch * 0.62);
      }
    }
    if (G.roundCard.t < 2.2 && G.roundCard.text) {
      const k = G.roundCard.t; const a = k < 0.3 ? k / 0.3 : k > 1.7 ? (2.2 - k) / 0.5 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(64, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = '#ffe36b';
      ctx.strokeText(G.roundCard.text, cw / 2, ch * 0.42); ctx.fillText(G.roundCard.text, cw / 2, ch * 0.42);
      ctx.restore();
    }
    if (G.screen === 'intro') {
      const I = G.intro; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const card = (name, alias, record, k, x) => {
        const a = clamp(k, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.translate(x, ch * 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; D.rr(ctx, -150 * u, -36 * u, 300 * u, 92 * u, 10 * u); ctx.fill();
        ctx.font = font(44, '"Anton", Impact, sans-serif'); ctx.fillStyle = '#fff'; ctx.fillText(name, 0, -8 * u);
        ctx.font = font(18); ctx.fillStyle = '#ffd7a0'; ctx.fillText(alias, 0, 24 * u); ctx.font = font(13); ctx.fillStyle = '#ccc'; ctx.fillText(record, 0, 42 * u);
        ctx.restore();
      };
      if (I.t > 0.8 && I.t < 3.6) card('OSCAR', '"EL CAMPEÓN" · hace boxeo de verdad', 'Récord: todas ganadas · Medallas: 3 · Guardia: impecable', (I.t - 0.8) * 2, cw * 0.72);
      if (I.t > 3.8 && I.t < 6.6) card('MUSLERA', '"EL PUEBLO" · no hace boxeo', `Récord: ${save.wins}-${save.losses} · Guardia: ¿qué guardia?`, (I.t - 3.8) * 2, cw * 0.28);
      if (I.t > 6.6) { ctx.save(); ctx.globalAlpha = clamp((I.t - 6.6) * 2, 0, 1); ctx.font = font(96, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = '#ffe36b'; ctx.strokeText('VS', cw / 2, ch * 0.38); ctx.fillText('VS', cw / 2, ch * 0.38); ctx.restore(); }
      ctx.font = font(13); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('toca para saltar', cw - pad, ch - pad - 30 * u);
    }
    if (G.screen === 'pool') {
      const ph = G.pool.t / 7.2; const txt = ph < 0.42 ? 'ENTRE ASALTOS: LA PISCINA' : ph < 0.7 ? 'GLU GLU GLU' : '¡FRESQUITO!';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = font(44, '"Anton", Impact, sans-serif'); ctx.lineWidth = 6 * u; ctx.strokeStyle = '#06253a'; ctx.fillStyle = '#bff0ff'; ctx.strokeText(txt, cw / 2, 18 * u); ctx.fillText(txt, cw / 2, 18 * u);
    }
    // bocadillos
    if (sim && sim.phase !== 'break' && G.screen !== 'pool') for (const b of G.bubbles) {
      const f = b.who === 'muslera' ? sim.p : sim.o; const h = f.headPos();
      const anchor = R3.project(h.x, h.y + (f.state === 'down' ? 0.3 : 0.4), h.z); if (anchor.behind) continue;
      const shown = Math.min(b.text.length, Math.floor(b.t * 38));
      const a = b.t < 0.15 ? b.t / 0.15 : b.t > b.life - 0.3 ? (b.life - b.t) / 0.3 : 1;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `700 ${17 * u}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const maxW = Math.min(cw * 0.46, 300 * u); const words = b.text.split(' '); const lines = []; let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line);
      const lh = 21 * u, padX = 12 * u, padY = 9 * u; const bw = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))) + padX * 2, bh = lines.length * lh + padY * 2;
      const bx = clamp(anchor.x - bw / 2 + (b.who === 'muslera' ? -30 * u : 30 * u), 6, cw - bw - 6), by = clamp(anchor.y - bh - 26 * u, (G.screen === 'intro' ? 20 : 100) * u, ch - bh - 80 * u);
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
    // ticker
    if (G.ticker.text && G.ticker.t < 5.5) {
      const a = G.ticker.t < 0.2 ? G.ticker.t / 0.2 : G.ticker.t > 4.8 ? (5.5 - G.ticker.t) / 0.7 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.font = font(16); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const maxW = cw - 2 * pad - 20 * u; let txt = G.ticker.text;
      while (ctx.measureText(txt).width > maxW && txt.length > 10) txt = txt.slice(0, -4) + '…';
      const playing = document.body.classList.contains('playing'), portrait = document.body.classList.contains('portrait');
      const inset = playing ? (portrait ? 46 : 150) : 0;
      const tw = ctx.measureText(txt).width + 24 * u, th = 30 * u, ty = ch - pad - th - inset;
      ctx.fillStyle = G.ticker.who === 'oscar' ? 'rgba(10,60,60,0.8)' : G.ticker.who === 'muslera' ? 'rgba(90,20,60,0.8)' : 'rgba(0,0,0,0.7)'; D.rr(ctx, pad, ty, tw, th, 6 * u); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, pad + 12 * u, ty + th / 2);
      ctx.restore();
    }
    if (G.screen === 'over' && G.results) {
      const won = G.results.winner === 'player'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(60, '"Anton", Impact, sans-serif'); ctx.lineWidth = 8 * u; ctx.strokeStyle = '#3a0a0a'; ctx.fillStyle = won ? '#ffe36b' : '#ff8a8a';
      const txt = won ? '¡GANA MUSLERA!' : (G.results.method === 'decision' ? 'GANA OSCAR' : 'K.O.');
      ctx.strokeText(txt, cw / 2, ch * 0.8); ctx.fillText(txt, cw / 2, ch * 0.8);
    }
  }

  G.step = function (dt) { G.t += dt; G.lastDt = dt; update(dt); render(); };
  document.addEventListener('DOMContentLoaded', boot);
  root.TSM_GAME = G;
})(window);
