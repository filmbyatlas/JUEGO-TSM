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
