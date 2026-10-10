/* ============================================================
   TSM · audio sintetizado (sin ficheros externos)
   ============================================================ */
(function (root) {
  'use strict';
  const A = {
    ctx: null, master: null, crowdGain: null, crowdTarget: 0.12, crowdLevel: 0.12, muted: false, ready: false,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const Ctx = root.AudioContext || root.webkitAudioContext; if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(this.ctx.destination);
        this.buildCrowd();
        this.ready = true;
      } catch (e) { this.ctx = null; }
    },
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); },
    // en el móvil el contexto nace suspendido: se desbloquea con cualquier toque o tecla
    unlock() { this.init(); if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { } } },
    noise1() { if (!this._noise) this._noise = this.noiseBuffer(1); return this._noise; },
    // ---------------------------------------------------------- música (secuenciador propio)
    music: { on: false, mode: 'menu', timer: null, next: 0, step: 0, gain: null, filter: null, enabled: true },
    MUS: {
      bpm: 132,
      lead: [69, 0, 72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 0, 0, 67, 0, 71, 0, 74, 0, 79, 0, 76, 0, 74, 0, 72, 71, 69, 0, 69, 0, 72, 0, 76, 0, 81, 0, 83, 0, 81, 0, 79, 0, 76, 0, 77, 0, 76, 0, 74, 0, 72, 0, 71, 0, 72, 0, 74, 0, 76, 0],
      bass: [45, 41, 43, 40, 45, 41, 38, 40], bassPat: [0, 0, 12, 0, 0, 7, 12, 0],
      kick: [1, 0, 0, 0, 1, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1],
    },
    midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },
    startMusic(mode) {
      if (!this.ready) return;
      const m = this.music; if (mode) m.mode = mode;
      if (!m.gain) { m.filter = this.ctx.createBiquadFilter(); m.filter.type = 'lowpass'; m.filter.frequency.value = 18000; m.gain = this.ctx.createGain(); m.gain.gain.value = 0; m.filter.connect(m.gain); m.gain.connect(this.master); }
      this.setMusicMode(m.mode);
      if (m.on) return;
      m.on = true; m.next = this.ctx.currentTime + 0.1; m.step = 0;
      m.timer = setInterval(() => this.musicTick(), 200);
    },
    stopMusic() { const m = this.music; if (!m.on) return; m.on = false; clearInterval(m.timer); if (m.gain) m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); },
    setMusicMode(mode) {
      const m = this.music; m.mode = mode; if (!m.gain) return;
      const lvl = !m.enabled ? 0 : mode === 'fight' ? 0.24 : mode === 'pool' ? 0.34 : mode === 'over' ? 0.36 : mode === 'intro' ? 0.4 : 0.5;
      m.gain.gain.setTargetAtTime(lvl, this.ctx.currentTime, 0.4);
      m.filter.frequency.setTargetAtTime(mode === 'pool' ? 420 : 18000, this.ctx.currentTime, 0.3);
    },
    setMusicEnabled(on) { this.music.enabled = on; this.setMusicMode(this.music.mode); },
    musicTick() {
      const m = this.music, c = this.ctx, M = this.MUS; const stepDur = 60 / M.bpm / 2;
      if (m.next < c.currentTime - 0.5) m.next = c.currentTime + 0.05;   // tras una pausa larga, no intentar recuperar lo perdido
      while (m.next < c.currentTime + 1.1) {
        const s = m.step, t = m.next, out = m.filter, i8 = s % 8, bar = Math.floor(s / 8) % 8;
        const ln = M.lead[s % M.lead.length]; if (ln) this.synthNote(this.midi(ln), t, stepDur * 0.85, 'square', 0.15, out, true);
        this.synthNote(this.midi(M.bass[bar] + M.bassPat[i8]), t, stepDur * 0.9, 'triangle', 0.36, out);
        if (M.kick[i8]) this.kick(t, out);
        if (M.snare[i8]) this.snare(t, out);
        if (M.hat[i8]) this.hat(t, out, i8 % 2 === 0 ? 0.07 : 0.04);
        m.next += stepDur; m.step++;
      }
    },
    synthNote(freq, t, dur, type, vol, out, thick) {
      const c = this.ctx, g = c.createGain(); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(g); o.start(t); o.stop(t + dur + 0.02);
      if (thick) { const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 1.004; const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + 0.02); }
    },
    kick(t, out) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.22); },
    snare(t, out) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise1(); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.16); },
    hat(t, out, vol) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise1(); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.06); },
    noiseBuffer(sec) {
      const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, Math.floor(sr * sec), sr), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },
    buildCrowd() {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuffer(3); src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
      this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0.12;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.35; const lg = c.createGain(); lg.gain.value = 0.03;
      lfo.connect(lg); lg.connect(this.crowdGain.gain); lfo.start();
      src.connect(lp); lp.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master); src.start();
    },
    crowd(level, instant) {
      if (!this.ready) return;
      this.crowdTarget = Math.max(0.05, Math.min(0.75, level));
      this.crowdGain.gain.setTargetAtTime(this.crowdTarget, this.ctx.currentTime, instant ? 0.03 : 0.6);
    },
    crowdBurst(amount) {
      if (!this.ready) return;
      const c = this.ctx, g = this.crowdGain.gain, t = c.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(Math.min(0.9, this.crowdTarget + amount), t + 0.08);
      g.setTargetAtTime(this.crowdTarget, t + 0.5, 1.2);
    },
    tone(freq, dur, type, vol, when, slideTo) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); const t = when || c.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, vol, filterFreq, type, when) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuffer(dur + 0.05);
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 800;
      const g = c.createGain(); const t = when || c.currentTime;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
    },
    bell(n) {
      if (!this.ready) return; const c = this.ctx;
      for (let i = 0; i < (n || 1); i++) {
        const t = c.currentTime + i * 0.45;
        [1480, 2210, 3300].forEach((f, k) => this.tone(f, 1.6 - k * 0.3, 'sine', 0.22 / (k + 1), t));
        this.noise(0.05, 0.25, 4000, 'highpass', t);
      }
    },
    punch(kind, blocked) {
      if (!this.ready) return;
      if (blocked) { this.noise(0.09, 0.5, 900, 'bandpass'); this.tone(180, 0.1, 'triangle', 0.25); return; }
      const heavy = kind === 'upper' || kind === 'cross';
      this.noise(heavy ? 0.16 : 0.1, heavy ? 0.9 : 0.6, heavy ? 500 : 900, 'lowpass');
      this.tone(heavy ? 95 : 140, heavy ? 0.22 : 0.12, 'sine', heavy ? 0.6 : 0.35, 0, 40);
      if (kind === 'upper') this.tone(60, 0.35, 'sine', 0.5, 0, 30);
    },
    counter() { if (!this.ready) return; this.punch('upper'); this.tone(880, 0.25, 'square', 0.12, 0, 1320); this.noise(0.3, 0.5, 300); },
    whiff() { if (!this.ready) return; this.noise(0.14, 0.18, 2200, 'bandpass'); },
    dodge() { if (!this.ready) return; this.noise(0.12, 0.12, 3000, 'highpass'); this.tone(600, 0.12, 'sine', 0.08, 0, 1100); },
    knockdown() {
      if (!this.ready) return; const c = this.ctx, t = c.currentTime;
      this.noise(0.5, 1.0, 250); this.tone(70, 0.6, 'sine', 0.8, t, 28);
      [220, 196, 174, 146].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.12, t + 0.25 + i * 0.22));
      this.crowdBurst(0.5);
    },
    count(n) { if (!this.ready) return; this.tone(n >= 8 ? 520 : 440, 0.12, 'square', 0.15); },
    getUp() { if (!this.ready) return; const t = this.ctx.currentTime; [330, 440, 554, 660].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, t + i * 0.09)); this.crowdBurst(0.35); },
    splash() {
      if (!this.ready) return; const t = this.ctx.currentTime;
      this.noise(0.6, 0.8, 1500, 'lowpass', t); this.noise(1.2, 0.35, 600, 'lowpass', t + 0.2); this.tone(300, 0.4, 'sine', 0.2, t, 90);
    },
    bubbles(dur) {
      if (!this.ready) return; const t = this.ctx.currentTime;
      for (let i = 0; i < dur * 7; i++) this.tone(400 + Math.random() * 500, 0.08, 'sine', 0.05, t + i * (1 / 7) + Math.random() * 0.1, 900 + Math.random() * 400);
    },
    taunt() { if (!this.ready) return; const t = this.ctx.currentTime; [660, 880, 660].forEach((f, i) => this.tone(f, 0.15, 'square', 0.08, t + i * 0.12)); },
    uiClick() { if (!this.ready) return; this.tone(900, 0.06, 'square', 0.08); },
    win() {
      if (!this.ready) return; const t = this.ctx.currentTime;
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => { this.tone(f, 0.35, 'square', 0.14, t + i * 0.16); this.tone(f / 2, 0.4, 'triangle', 0.12, t + i * 0.16); });
      this.crowdBurst(0.7);
    },
    lose() { if (!this.ready) return; const t = this.ctx.currentTime; [392, 370, 349, 294].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.12, t + i * 0.35)); },
    intro() {
      if (!this.ready) return; const t = this.ctx.currentTime;
      const seq = [196, 196, 233, 262, 196, 196, 175, 196]; seq.forEach((f, i) => { this.tone(f, 0.22, 'sawtooth', 0.1, t + i * 0.24); this.tone(f * 2, 0.12, 'square', 0.05, t + i * 0.24); });
      this.crowdBurst(0.4);
    },
  };
  root.TSM_AUDIO = A;
})(window);
