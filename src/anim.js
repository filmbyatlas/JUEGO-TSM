/* ============================================================
   TSM · animación procedural de los luchadores
   - Objetivos de pose por estado (guardia, golpes, bloqueo, salto...)
   - Suavizado por parámetro (cada cosa se mueve a su velocidad)
   - Muelles para la reacción de la cabeza y el torso al recibir golpes
   - Ciclo de pasos a partir de la velocidad real
   Coordenadas: x hacia delante (hacia el rival), y hacia arriba, z lateral
   (z positivo = lado cercano a la cámara cuando mira a +x). Unidades: metros.
   ============================================================ */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  // medidas base por luchador (metros)
  const BODY = {
    muslera: { hip: 1.08, shoulder: 1.68, headR: 0.25, shoulderW: 0.62, upper: 0.42, fore: 0.40, thigh: 0.56, shin: 0.52, belly: 1, bob: 2.4 },
    oscar:   { hip: 1.1,  shoulder: 1.72, headR: 0.23, shoulderW: 0.54, upper: 0.42, fore: 0.40, thigh: 0.58, shin: 0.52, belly: 0, bob: 6.2 },
  };

  // muelle amortiguado 2D para reacciones
  class Spring {
    constructor(k, d) { this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.k = k; this.d = d; }
    kick(ix, iy) { this.vx += ix; this.vy += iy; }
    step(dt) {
      const ax = -this.k * this.x - this.d * this.vx, ay = -this.k * this.y - this.d * this.vy;
      this.vx += ax * dt; this.vy += ay * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    }
  }

  // parámetros de la pose y su velocidad de suavizado (1/s)
  const RATES = {
    lean: 10, twist: 12, crouch: 11, sway: 8,
    headX: 11, headY: 11, headTilt: 10, headYaw: 8,
    leadX: 12, leadY: 12, leadZ: 10, rearX: 12, rearY: 12, rearZ: 10,
    footFX: 14, footFY: 18, footBX: 14, footBY: 18, stance: 6,
    lying: 7, armsUp: 8, elbowOut: 8, mouth: 14,
  };

  class Animator {
    constructor(key) {
      this.key = key; this.B = BODY[key];
      this.low = key === 'muslera';
      this.cur = null; this.tgt = {};
      this.headSpring = new Spring(260, 18);   // reacción de la cabeza
      this.bodySpring = new Spring(140, 14);   // reacción del torso
      this.stepPhase = 0; this.blinkT = 2 + Math.random() * 3; this.blink = 0;
      this.breath = Math.random() * 6; this.wasState = ''; this.stateT = 0; this.lastHp = 100;
      this.gloveVel = { l: [0, 0], r: [0, 0] }; this.prevLead = null; this.prevRear = null;
      this.rateMul = {};
    }

    // --- objetivos por estado -------------------------------------------
    targets(f, t, opts) {
      const B = this.B, low = this.low;
      const T = {
        lean: 0, twist: 0, crouch: 0, sway: 0, headX: 0, headY: 0, headTilt: 0, headYaw: 0,
        leadX: 0, leadY: 0, leadZ: -0.2, rearX: 0, rearY: 0, rearZ: 0.2,
        footFX: 0.24, footFY: 0, footBX: -0.22, footBY: 0, stance: 0,
        lying: 0, armsUp: 0, elbowOut: 0.08, mouth: 0,
      };
      // guardia base (relativa a los pies)
      if (low) { T.leadX = 0.36; T.leadY = 1.18; T.rearX = 0.08; T.rearY = 1.1; T.leadZ = -0.24; T.rearZ = 0.22; T.lean = 0.04; T.elbowOut = 0.12; }
      else { T.leadX = 0.42; T.leadY = 1.9; T.rearX = 0.2; T.rearY = 1.82; T.leadZ = -0.16; T.rearZ = 0.18; T.lean = 0.1; T.elbowOut = 0.04; }
      const s = f.state, st = f.t;
      const m = f.move;
      const slow = f.stamina < 35 ? 1 + (35 - f.stamina) / 35 * 0.45 : 1;
      // respiración e inquietud (idle)
      const br = Math.sin(t * 1.9 + this.breath);
      T.crouch = 0.01 + 0.012 * Math.sin(t * B.bob);
      if (low) { T.sway = Math.sin(t * 1.3 + this.breath) * 0.05; T.leadX += Math.sin(t * 2.1) * 0.03; T.rearY += Math.cos(t * 1.7) * 0.025; T.headTilt = Math.sin(t * 0.9) * 0.04; }
      else { T.leadY += Math.sin(t * 6.2) * 0.015; T.rearY += Math.cos(t * 6.2) * 0.015; T.crouch += Math.abs(Math.sin(t * B.bob / 2)) * 0.03; T.headYaw = Math.sin(t * 0.7) * 0.05; }
      if (f.tired) { T.crouch += 0.04; T.lean += 0.06; T.mouth = 0.5; T.leadY -= 0.06; T.rearY -= 0.06; }
      this.setRates({});
      switch (s) {
        case 'walk': {
          // se inclina hacia donde va; los pies se animan en applyStep
          T.lean += 0.06 * f.moveA; T.sway = 0.04 * f.moveS; break;
        }
        case 'crouch': {
          T.crouch = 0.62; T.lean = 0.35; T.headY = -0.02; T.headTilt = -0.15; T.footFX = 0.34; T.footBX = -0.3; T.stance = 0.1;
          T.leadX = 0.3; T.leadY = 0.9; T.rearX = 0.1; T.rearY = 0.85; T.elbowOut = 0.16; break;
        }
        case 'jab': case 'cross': case 'upper': {
          const tN = st / slow; const w = m.windup, a = m.active, r = m.recover;
          let ph, p;
          if (tN < w) { ph = 0; p = tN / w; } else if (tN < w + a) { ph = 1; p = (tN - w) / a; } else { ph = 2; p = clamp((tN - w - a) / r, 0, 1); }
          this.setRates(ph === 2 ? { leadX: 9, leadY: 9, rearX: 9, rearY: 9 } : { leadX: 28, leadY: 28, rearX: 28, rearY: 28, twist: 24, lean: 20 });
          if (s === 'jab') {
            const g0 = [T.leadX, T.leadY];
            if (ph === 0) { T.leadX = g0[0] - 0.08 * easeOut(p); T.leadY = lerp(g0[1], 1.86, easeOut(p)); T.lean += 0.04; T.twist = -0.1 * p; }
            else if (ph === 1) { T.leadX = 1.08; T.leadY = 1.84; T.leadZ = -0.04; T.lean += 0.2; T.headX = 0.06; T.twist = 0.25; T.footFX = 0.32; T.crouch += 0.02; }
            else { T.leadX = lerp(1.0, g0[0], smooth(p)); T.leadY = lerp(1.88, g0[1], smooth(p)); T.lean += lerp(0.12, 0, p); T.twist = lerp(0.15, 0, p); }
            T.mouth = ph === 1 ? 0.5 : 0.2;
          } else if (s === 'cross') {
            const g0 = [T.rearX, T.rearY];
            if (ph === 0) { T.twist = -0.35 * easeOut(p); T.rearX = g0[0] - 0.12 * p; T.rearY = lerp(g0[1], 1.74, p); T.lean += -0.03; T.rearZ = 0.26; }
            else if (ph === 1) { T.twist = 1.1; T.rearX = 1.14; T.rearY = 1.82; T.rearZ = -0.02; T.lean += 0.34; T.headX = 0.08; T.footBX = -0.08; T.crouch += 0.05; T.leadX = 0.2; T.leadY = low ? 1.3 : 1.75; }
            else { T.twist = lerp(1, 0, smooth(p)); T.rearX = lerp(1.04, g0[0], smooth(p)); T.rearY = lerp(1.86, g0[1], smooth(p)); T.rearZ = lerp(0.02, 0.2, p); T.lean += lerp(0.24, 0, p); }
            T.mouth = ph === 1 ? 0.6 : 0.2;
          } else {
            const g0 = [T.rearX, T.rearY];
            if (ph === 0) { T.rearX = lerp(g0[0], 0.2, easeOut(p)); T.rearY = lerp(g0[1], 0.96, easeOut(p)); T.crouch += 0.18 * easeOut(p); T.lean += 0.22 * easeOut(p); T.twist = 0.3 * p; T.rearZ = 0.24; }
            else if (ph === 1) { T.rearX = lerp(0.35, 0.72, easeOut(p)); T.rearY = lerp(1.0, 2.35, easeOut(p)); T.rearZ = 0.04; T.crouch -= 0.06; T.lean += lerp(0.2, -0.1, p); T.twist = 1.0; T.headY = -0.05; T.headTilt = -0.12; T.footBX = -0.1; }
            else { T.rearX = lerp(0.52, g0[0], smooth(p)); T.rearY = lerp(2.25, g0[1], smooth(p)); T.twist = lerp(0.9, 0, smooth(p)); T.lean += lerp(-0.06, 0, p); }
            T.mouth = ph === 1 ? 0.7 : 0.3;
          }
          break;
        }
        case 'fly': {
          // puñetazo volador: brazo trasero por delante, cuerpo estirado
          T.rearX = 1.0; T.rearY = 1.95; T.rearZ = 0.05; T.leadX = -0.1; T.leadY = 1.5; T.leadZ = -0.3;
          T.lean = 0.35; T.twist = 0.8; T.footFX = -0.1; T.footBX = -0.45; T.footFY = 0.15; T.footBY = 0.35; T.mouth = 0.8; T.headX = 0.04;
          this.setRates({ rearX: 26, rearY: 26 }); break;
        }
        case 'jump': {
          const up = f.vy > 0;
          T.crouch = -0.02; T.lean = 0.1; T.footFX = 0.18; T.footBX = -0.24; T.footFY = up ? 0.25 : 0.12; T.footBY = up ? 0.35 : 0.18;
          T.leadY += 0.15; T.rearY += 0.1; T.leadX += 0.05; T.mouth = 0.3; T.headTilt = -0.05; break;
        }
        case 'land': {
          const k = clamp(1 - f.landT / 0.45, 0, 1);
          T.crouch = 0.28 * (1 - k) + 0.02; T.lean = 0.22 * (1 - k); T.leadY -= 0.2 * (1 - k); T.rearY -= 0.2 * (1 - k); T.footFX = 0.3; T.footBX = -0.3; break;
        }
        case 'block': {
          const k = low ? clamp(f.blockT / Math.max(0.01, f.profile.blockStartup), 0, 1) : 1;
          this.setRates({ leadX: 22, leadY: 22, rearX: 22, rearY: 22 });
          T.leadX = lerp(T.leadX, 0.48, k); T.leadY = lerp(T.leadY, 1.98, k); T.leadZ = -0.14;
          T.rearX = lerp(T.rearX, 0.34, k); T.rearY = lerp(T.rearY, 1.9, k); T.rearZ = 0.14;
          T.crouch += 0.06; T.lean += 0.12; T.headY = -0.03; T.elbowOut = 0.02; break;
        }
        case 'dodge': {
          const k = Math.sin(clamp(st / f.profile.dodgeDur, 0, 1) * Math.PI);
          T.lean = -0.5 * k; T.crouch += 0.08 * k; T.headX = -0.08 * k; T.headTilt = -0.2 * k; T.footBX = -0.32; T.footFX = 0.3; T.twist = -0.2 * k; break;
        }
        case 'hit': {
          const k = clamp(f.stun / 0.45, 0, 1); const upperHit = f.lastHitBy === 'upper' || f.lastHitBy === 'fly';
          T.lean = -0.42 * k - (upperHit ? 0.2 : 0); T.headX = -0.14 * k; T.headY = upperHit ? -0.1 * k : 0.02; T.headTilt = (upperHit ? -0.7 : -0.45) * k; T.headYaw = 0.35 * k;
          T.leadX -= 0.18 * k; T.rearX -= 0.22 * k; T.leadY += 0.1; T.rearY += 0.14; T.leadZ -= 0.1; T.rearZ += 0.1; T.crouch += 0.06; T.mouth = 1; T.footBX = -0.4; T.footFX = 0.1; T.elbowOut = 0.25; T.twist = -0.3 * k;
          this.setRates({ lean: 16, headX: 20, headTilt: 20 }); break;
        }
        case 'down': {
          T.lying = 1; T.mouth = 0.8; T.leadX = 0.6; T.leadY = 1.5; T.rearX = -0.3; T.rearY = 1.65; T.leadZ = -0.25; T.rearZ = 0.3;
          T.footFX = 0.36; T.footFY = 0.08; T.footBX = -0.14; T.footBY = 0.04; T.headTilt = 0.2; break;
        }
        case 'rise': { const k = 1 - smooth(clamp(st / 0.9, 0, 1)); T.lying = k; T.crouch += 0.12 * k; T.lean = 0.3 * k; T.leadX = lerp(T.leadX, 0.6, k); T.leadY = lerp(T.leadY, 1.5, k); T.mouth = 0.5; break; }
        case 'taunt': {
          const k = Math.sin(t * 9) * 0.5 + 0.5;
          T.leadX = 0.56 + k * 0.06; T.leadY = 1.5; T.leadZ = -0.4; T.rearX = -0.44; T.rearY = 1.56 + k * 0.06; T.rearZ = 0.45; T.elbowOut = 0.25;
          T.lean = -0.18; T.headTilt = -0.25; T.headY = -0.03; T.mouth = 0.9; T.crouch = 0.02 + Math.abs(Math.sin(t * 9)) * 0.06;
          T.footFX = 0.3 + Math.sin(t * 9) * 0.08; T.footBX = -0.28 - Math.sin(t * 9) * 0.08; T.headYaw = Math.sin(t * 2) * 0.4; break;
        }
        case 'win': {
          const k = Math.abs(Math.sin(t * 7));
          T.leadX = 0.34; T.leadY = 2.62 + k * 0.1; T.leadZ = -0.3; T.rearX = -0.24; T.rearY = 2.58 + k * 0.1; T.rearZ = 0.3; T.armsUp = 1;
          T.crouch = -k * 0.14 + 0.04; T.headY = -0.02; T.mouth = 0.8; T.headTilt = -0.12; T.footFX = 0.2; T.footBX = -0.2; break;
        }
        case 'lose': { T.lean = 0.35; T.crouch += 0.14; T.leadX = 0.34; T.leadY = 0.96; T.rearX = -0.02; T.rearY = 0.9; T.headY = 0.1; T.headTilt = 0.4; T.elbowOut = 0.1; break; }
      }
      if (f.wobble > 0 && s !== 'down') { T.lean += Math.sin(t * 30) * 0.06; T.headTilt += Math.sin(t * 25) * 0.1; }
      // cinemática de la piscina: se arrodilla y mete la cabeza
      if (opts && opts.pool) {
        const P = opts.pool, k = P.k, dip = P.dip;
        T.lean = 0.08 + k * 1.5 + dip * 0.8; T.crouch = 0.02 + k * 0.66 + dip * 0.12; T.twist = 0; T.sway = 0;
        T.headTilt = (P.shake ? Math.sin(t * 28) * 0.3 : 0) + k * 0.4; T.headYaw = P.shake ? Math.sin(t * 22) * 0.3 : 0; T.headX = 0; T.headY = 0;
        T.leadX = 0.6 + k * 0.25; T.leadY = 1.0 - k * 0.55; T.leadZ = -0.26; T.rearX = 0.5 + k * 0.25; T.rearY = 0.95 - k * 0.55; T.rearZ = 0.26; T.elbowOut = 0.1;
        T.footFX = 0.3; T.footBX = -0.22 - k * 0.42; T.footFY = 0; T.footBY = 0; T.mouth = P.under ? 0 : 0.4; T.lying = 0;
        this.setRates({ lean: 6, crouch: 6 });
      }
      if (opts && opts.entrance) { T.leadX = low ? 0.36 : 0.28; T.leadY = low ? 1.2 : 1.5; T.rearX = -0.06; T.rearY = 1.2; T.leadZ = -0.22; T.rearZ = 0.22; T.elbowOut = 0.12; }
      return T;
    }
    setRates(over) { this.rateMul = over; }

    // --- actualización por frame -----------------------------------------
    update(f, t, dt, opts) {
      dt = Math.min(dt, 0.05);
      const T = this.targets(f, t, opts);
      if (!this.cur) { this.cur = Object.assign({}, T); }
      const C = this.cur;
      for (const k in T) {
        const rate = this.rateMul[k] || RATES[k] || 10;
        const a = 1 - Math.exp(-rate * dt);
        C[k] += (T[k] - C[k]) * a;
      }
      // golpes recibidos: impulso en los muelles
      if (f.state !== this.wasState) {
        if (f.state === 'hit') {
          const upperHit = f.lastHitBy === 'upper' || f.lastHitBy === 'fly';
          this.headSpring.kick(-5.0, upperHit ? -3.6 : -1.0); this.bodySpring.kick(-2.6, 0);
        }
        if (f.state === 'land') { this.bodySpring.kick(0, 2.2); }
        if (f.state === 'block') { this.headSpring.kick(-0.6, 0); }
        this.wasState = f.state; this.stateT = 0;
      } else this.stateT += dt;
      if (f.state === 'block' && f.hp < this.lastHp) { this.headSpring.kick(-1.2, 0); this.bodySpring.kick(-0.6, 0); }
      this.lastHp = f.hp;
      this.headSpring.step(dt); this.bodySpring.step(dt);
      // parpadeo
      this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = 2.5 + Math.random() * 4; }
      if (this.blink > 0) this.blink -= dt;
      // ciclo de pasos
      this.applyStep(f, dt);
      return C;
    }

    applyStep(f, dt) {
      const C = this.cur;
      const moving = (f.state === 'walk' || (f.state === 'crouch' && f.speed > 0.05)) && f.speed > 0.05;
      if (moving) {
        this.stepPhase += dt * (4.5 + f.speed * 3.5);
        const ph = this.stepPhase; const sw = Math.sin(ph);
        const dirA = f.moveA, dirS = f.moveS;
        // paso: un pie adelante y otro atrás; en lateral, se cruzan menos
        const amp = 0.14 * (Math.abs(dirA) + 0.5 * Math.abs(dirS));
        this.stepF = { x: 0.24 + sw * amp * (dirA >= 0 ? 1 : -1), y: Math.max(0, sw) * 0.07, z: dirS * 0.1 * Math.cos(ph) };
        this.stepB = { x: -0.22 - sw * amp * (dirA >= 0 ? 1 : -1), y: Math.max(0, -sw) * 0.07, z: -dirS * 0.1 * Math.cos(ph) };
        C.crouch += Math.abs(sw) * 0.012;
      } else { this.stepF = null; this.stepB = null; }
    }
  }

  root.TSM_ANIM = { Animator, BODY, Spring };
})(window);
