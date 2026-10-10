/* ============================================================
   TSM — Todos Somos Muslera · motor de combate 3D (sin render)
   Unidades: 1 = 1 metro aprox. Suelo en y = 0. Los dos se miran siempre.
   Lógica pura: se ejecuta también en Node para calibrar a Oscar.
   ============================================================ */
(function (root) {
  'use strict';

  const ARENA = { x0: 0.0, x1: 9.6, z0: -0.7, z1: 4.0, minSep: 0.95 };
  const ROUND_TIME = 60;
  const ROUNDS = 3;
  const GRAVITY = 13.5;
  const HEAD_H = 2.05;

  // windup / active / recover en segundos; dmg; reach (m); stam; stun; push (m); high = pasa por encima si el otro está agachado
  const MOVES = {
    muslera: {
      jab:   { windup: 0.16, active: 0.08, recover: 0.24, dmg: 5,  reach: 1.28, stam: 6,  stun: 0.34, push: 0.14, high: true },
      cross: { windup: 0.24, active: 0.10, recover: 0.34, dmg: 9,  reach: 1.34, stam: 10, stun: 0.46, push: 0.20, high: true },
      upper: { windup: 0.21, active: 0.10, recover: 0.46, dmg: 15, reach: 1.08, stam: 15, stun: 0.62, push: 0.26, high: false },
      fly:   { windup: 0.10, active: 0.60, recover: 0.50, dmg: 16, reach: 1.15, stam: 16, stun: 0.70, push: 0.40, high: true, air: true },
    },
    oscar: {
      jab:   { windup: 0.13, active: 0.08, recover: 0.22, dmg: 5,  reach: 1.34, stam: 4,  stun: 0.34, push: 0.14, high: true },
      cross: { windup: 0.21, active: 0.10, recover: 0.33, dmg: 9,  reach: 1.4, stam: 7,  stun: 0.46, push: 0.20, high: true },
      upper: { windup: 0.31, active: 0.10, recover: 0.46, dmg: 16, reach: 1.1, stam: 11, stun: 0.62, push: 0.26, high: false },
      fly:   { windup: 0.10, active: 0.60, recover: 0.50, dmg: 15, reach: 1.15, stam: 14, stun: 0.70, push: 0.40, high: true, air: true },
    },
  };

  const PROFILES = {
    muslera: {
      name: 'MUSLERA', alias: 'EL PUEBLO', guard: 'low',
      hp: 100, stamina: 100,
      walk: 2.1, back: 1.7, strafe: 1.7,
      blockStartup: 0.16, blockReduce: 0.55, blockStamCost: 8,
      dodgeDur: 0.32, dodgeInv: [0.03, 0.27], dodgeCost: 7, dodgeCooldown: 0.4,
      jumpVel: 4.8, jumpCost: 8,
      regenIdle: 14, regenWalk: 8,
      riseHp: [42, 32, 0],
    },
    oscar: {
      name: 'OSCAR', alias: 'EL CAMPEÓN', guard: 'high',
      hp: 100, stamina: 100,
      walk: 2.0, back: 1.75, strafe: 1.7,
      blockStartup: 0.0, blockReduce: 0.85, blockStamCost: 5,
      dodgeDur: 0.30, dodgeInv: [0.02, 0.26], dodgeCost: 6, dodgeCooldown: 0.45,
      jumpVel: 4.8, jumpCost: 8,
      regenIdle: 14, regenWalk: 8,
      riseHp: [36, 26, 0],
    },
  };

  // parámetros de la IA según dificultad (0 = sin cinturones, 1 = cinturón negro)
  const AI_EASY = { reactJab: 0.6, reactHeavy: 0.8, reactDelay: 0.12, aggression: 0.95, comboBreak: 0.85, tauntEvery: [12, 19], tauntDur: 1.0, preferDodge: 0.25, dmgScale: 0.6, globalDmg: 0.7, followUp: 0.45, cooldownMin: 1.3, cooldownRand: 1.2, airPunish: 0.5, duckPunish: 0.45, jumpRate: 0.025, strafeRate: 0.4, spamRead: 0.2 };
  const AI_HARD = { reactJab: 0.66, reactHeavy: 0.85, reactDelay: 0.115, aggression: 0.95, comboBreak: 0.87, tauntEvery: [13, 21], tauntDur: 0.95, preferDodge: 0.28, dmgScale: 0.66, globalDmg: 0.7, followUp: 0.5, cooldownMin: 1.3, cooldownRand: 1.2, airPunish: 0.6, duckPunish: 0.55, jumpRate: 0.03, strafeRate: 0.42, spamRead: 0.24 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function makeRng(seed) {
    let s = (seed >>> 0) || 123456789;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
  }

  class Fighter {
    constructor(key, x, z) {
      const p = PROFILES[key];
      this.key = key; this.name = p.name; this.alias = p.alias; this.profile = p; this.moves = MOVES[key];
      this.x = x; this.z = z; this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0;
      this.fx = 1; this.fz = 0; this.yaw = 0;      // dirección hacia el rival
      this.hp = p.hp; this.maxHp = p.hp; this.stamina = p.stamina; this.maxStamina = p.stamina;
      this.state = 'idle'; this.t = 0; this.move = null; this.hitDone = false;
      this.stun = 0; this.openT = 0; this.invT = 0; this.dodgeCd = 0; this.blockT = 0;
      this.knockdowns = 0; this.comboTaken = 0; this.comboTimer = 0;
      this.landed = 0; this.thrown = 0; this.damageDealt = 0; this.roundDamage = 0;
      this.moveA = 0; this.moveS = 0;               // intención de movimiento aplicada (acercarse / lateral)
      this.speed = 0;                               // velocidad horizontal real (para animar los pasos)
      this.fresh = 0; this.sweat = 0; this.rise = { need: 0, got: 0 }; this.count = 0; this.downT = 0;
      this.tauntT = 0; this.tired = false; this.face = 'normal'; this.lastHitBy = null; this.wobble = 0;
      this.airPunched = false; this.landT = 0; this.crouchT = 0; this.dir = 1;
      this.guardHits = 0; this.guardHitT = 0; this.guardBreak = 0;
    }
    get airborne() { return this.y > 0.02 || this.state === 'jump' || this.state === 'fly'; }
    get busy() { return !['idle', 'walk', 'block', 'crouch'].includes(this.state); }
    get attacking() { return this.move !== null; }
    get phase() {
      if (!this.move) return null; const m = this.move;
      if (this.t < m.windup) return 'windup'; if (this.t < m.windup + m.active) return 'active'; return 'recover';
    }
    setState(s) { this.state = s; this.t = 0; if (!['jab', 'cross', 'upper', 'fly'].includes(s)) this.move = null; }
    headPos() { return { x: this.x, y: HEAD_H * (this.state === 'crouch' ? 0.7 : 1) + this.y - (this.state === 'down' ? 1.7 : 0), z: this.z }; }
    distToWall() { return Math.min(this.x - ARENA.x0, ARENA.x1 - this.x, this.z - ARENA.z0, ARENA.z1 - this.z); }
  }

  class Sim {
    constructor(opts = {}) {
      this.rng = makeRng(opts.seed || ((Math.random() * 1e9) | 0));
      const d = clamp(opts.difficulty == null ? 0 : opts.difficulty, 0, 1);
      this.difficulty = d;
      this.ai = {}; for (const k in AI_EASY) this.ai[k] = Array.isArray(AI_EASY[k]) ? AI_EASY[k].map((v, i) => lerp(v, AI_HARD[k][i], d)) : lerp(AI_EASY[k], AI_HARD[k], d);
      Object.assign(this.ai, opts.ai || {});
      this.events = []; this.time = 0; this.round = 1; this.roundT = ROUND_TIME;
      this.phase = 'ready'; this.phaseT = 0; this.poolUsed = false; this.scores = []; this.result = null;
      this.p = new Fighter('muslera', 3.6, 1.2); this.o = new Fighter('oscar', 6.0, 1.2);
      this.brain = { plan: [], cooldown: 0.8, nextTaunt: 11, backoff: 0, strafeDir: 0, strafeT: 0, seenAttack: null, reaction: null, reactAt: 0, recent: [], seriousUntil: 0, crouchSeen: 0 };
      this.hitstopT = 0; this.slowmo = 1; this.totalFightTime = 0; this._timers = [];
      this.face();
    }

    emit(type, data) { this.events.push(Object.assign({ type, time: this.time }, data || {})); }
    say(text, who) { this.emit('say', { text, who }); }
    after(secs, fn) { this._timers.push({ at: this.time + secs, fn }); }

    beginRound() {
      this.phase = 'ready'; this.phaseT = 0; this.roundT = ROUND_TIME;
      this.p.x = 3.6; this.p.z = 1.2; this.o.x = 6.0; this.o.z = 1.2;
      for (const f of [this.p, this.o]) { f.setState('idle'); f.y = 0; f.vy = 0; f.vx = f.vz = 0; f.stun = 0; f.openT = 0; f.invT = 0; f.comboTaken = 0; f.roundDamage = 0; f.moveA = f.moveS = 0; f.speed = 0; f.face = 'normal'; f.airPunched = false; f.guardHits = 0; f.guardBreak = 0; }
      this.brain.plan = []; this.brain.cooldown = 1.2; this.brain.nextTaunt = this.time + 8 + this.rng() * 6;
      this.face();
      this.emit('roundStart', { round: this.round });
    }

    applyBreakChoice(choice) {
      const p = this.p, o = this.o;
      o.hp = Math.min(o.maxHp, o.hp + 10); o.stamina = Math.min(o.maxStamina, o.stamina + 45);
      if (choice === 'pool' && !this.poolUsed) { this.poolUsed = true; p.hp = p.maxHp; p.stamina = p.maxStamina; p.fresh = 22; this.emit('pool'); }
      else { p.hp = Math.min(p.maxHp, p.hp + 10); p.stamina = Math.min(p.maxStamina, p.stamina + 40); }
    }

    face() {
      const p = this.p, o = this.o;
      let dx = o.x - p.x, dz = o.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      p.fx = dx; p.fz = dz; o.fx = -dx; o.fz = -dz;
      p.yaw = Math.atan2(-dz, dx); o.yaw = Math.atan2(dz, -dx);
      p.dir = 1; o.dir = -1;
      this.dist = d;
    }

    // ---------------------------------------------------------- update
    update(dt, input) {
      input = input || {};
      this.events.length = 0;
      if (this._timers.length) { const due = this._timers.filter(t => this.time >= t.at); this._timers = this._timers.filter(t => this.time < t.at); due.forEach(t => t.fn()); }
      if (this.hitstopT > 0) { this.hitstopT -= dt; return; }
      dt *= this.slowmo;
      this.time += dt; this.phaseT += dt;
      const p = this.p, o = this.o;
      switch (this.phase) {
        case 'ready': this.stepPassive(dt); if (this.phaseT > 1.3) { this.phase = 'fight'; this.phaseT = 0; this.emit('bell', { kind: 'start' }); } break;
        case 'fight': this.roundT -= dt; this.totalFightTime += dt; this.stepFighters(dt, input); if (this.roundT <= 0 && this.phase === 'fight') this.endRound(); break;
        case 'count': this.stepCount(dt, input); break;
        case 'roundEnd': this.stepFighters(dt, {}); if (this.phaseT > 2.2) { this.phase = 'break'; this.phaseT = 0; this.emit('break', { round: this.round }); } break;
        case 'break': case 'over': this.stepPassive(dt); break;
      }
      for (const f of [p, o]) {
        f.sweat = clamp(f.sweat + dt * (f.attacking ? 0.4 : 0.05) - dt * 0.08, 0, 1);
        f.tired = f.stamina < 28;
        if (f.fresh > 0) f.fresh -= dt;
        if (f.wobble > 0) f.wobble -= dt;
      }
    }

    stepPassive(dt) { for (const f of [this.p, this.o]) { f.t += dt; this.physics(f, dt); } this.face(); }

    stepFighters(dt, input) {
      const p = this.p, o = this.o;
      this.face();
      const ai = this.thinkOscar(dt);
      this.applyIntent(p, this.playerIntent(input), dt);
      this.applyIntent(o, ai, dt);
      this.advance(p, o, dt); this.advance(o, p, dt);
      this.separate(); this.face();
      this.resolveHit(p, o); this.resolveHit(o, p);
      for (const f of [p, o]) { if (f.comboTimer > 0) { f.comboTimer -= dt; if (f.comboTimer <= 0) f.comboTaken = 0; } }
    }

    playerIntent(input) {
      return {
        approach: clamp(input.approach || 0, -1, 1), strafe: clamp(input.strafe || 0, -1, 1),
        jab: !!input.jab, cross: !!input.cross, upper: !!input.upper,
        block: !!input.block, dodge: !!input.dodge, jump: !!input.jump, crouch: !!input.crouch,
      };
    }

    applyIntent(f, it, dt) {
      if (!it) return;
      f.moveA = 0; f.moveS = 0;
      if (f.stun > 0 || ['hit', 'down', 'rise', 'taunt', 'win', 'lose', 'land'].includes(f.state)) { f.speed = 0; return; }
      if (f.dodgeCd > 0) f.dodgeCd -= dt;
      const stamFactor = f.stamina < 20 ? 0.6 : 1;
      // en el aire: solo puede lanzar el puñetazo volador
      if (f.state === 'jump' || f.state === 'fly') {
        const punch = it.upper || it.cross || it.jab;
        if (punch && !f.airPunched && f.state === 'jump' && f.stamina > 2) {
          f.airPunched = true; f.setState('fly'); f.move = f.moves.fly; f.hitDone = false; f.thrown++;
          f.stamina = Math.max(0, f.stamina - f.moves.fly.stam); this.emit('swing', { who: f.key, move: 'fly' });
        }
        return;
      }
      if (f.move) { f.speed = 0; return; }
      if (it.dodge && f.dodgeCd <= 0 && f.stamina >= 4 && f.state !== 'crouch') {
        f.setState('dodge'); f.dodgeCd = f.profile.dodgeCooldown + f.profile.dodgeDur; f.stamina = Math.max(0, f.stamina - f.profile.dodgeCost);
        f.x = clamp(f.x - f.fx * 0.12, ARENA.x0, ARENA.x1); f.z = clamp(f.z - f.fz * 0.12, ARENA.z0, ARENA.z1);
        this.emit('dodgeStart', { who: f.key }); return;
      }
      if (f.state === 'dodge') return;
      if (it.jump && f.stamina >= 6) {
        f.setState('jump'); f.vy = f.profile.jumpVel; f.airPunched = false; f.stamina = Math.max(0, f.stamina - f.profile.jumpCost);
        const a = it.approach || 0, s = it.strafe || 0; const px = -f.fz, pz = f.fx;
        f.vx = (f.fx * a + px * s) * 1.6; f.vz = (f.fz * a + pz * s) * 1.6;
        this.emit('jump', { who: f.key }); return;
      }
      const punch = it.upper ? 'upper' : it.cross ? 'cross' : it.jab ? 'jab' : null;
      if (punch && f.stamina > 2) {
        const m = f.moves[punch];
        f.setState(punch); f.move = m; f.hitDone = false; f.thrown++;
        f.stamina = Math.max(0, f.stamina - m.stam * (f.fresh > 0 ? 0.7 : 1)); f.blockT = 0;
        this.emit('swing', { who: f.key, move: punch }); return;
      }
      if (it.crouch) { if (f.state !== 'crouch') { f.setState('crouch'); this.emit('crouch', { who: f.key }); } }
      else if (f.state === 'crouch') f.setState('idle');
      const a = it.approach || 0, s = it.strafe || 0;
      if (it.block && f.stamina > 0 && f.state !== 'crouch' && f.guardBreak <= 0) {
        if (f.state !== 'block') { f.setState('block'); f.blockT = 0; }
        this.moveBy(f, a, s, dt, 0.5 * stamFactor);   // con la guardia puesta se avanza a medio paso
        return;
      }
      else if (f.state === 'block') f.setState('idle');
      if (a || s) {
        const crouched = f.state === 'crouch';
        this.moveBy(f, a, s, dt, stamFactor * (f.fresh > 0 ? 1.12 : 1) * (crouched ? 0.35 : 1));
        if (f.state === 'idle') f.setState('walk');
      } else { f.speed = 0; if (f.state === 'walk') f.setState('idle'); }
    }

    moveBy(f, a, s, dt, factor) {
      if (!a && !s) { f.speed = 0; return; }
      const spA = (a > 0 ? f.profile.walk : f.profile.back) * factor, spS = f.profile.strafe * factor;
      const px = -f.fz, pz = f.fx; // perpendicular (lateral)
      let vx = f.fx * a * spA + px * s * spS, vz = f.fz * a * spA + pz * s * spS;
      const mag = Math.hypot(vx, vz), maxSp = Math.max(spA, spS); if (mag > maxSp) { vx *= maxSp / mag; vz *= maxSp / mag; }
      f.x = clamp(f.x + vx * dt, ARENA.x0, ARENA.x1); f.z = clamp(f.z + vz * dt, ARENA.z0, ARENA.z1);
      f.moveA = a; f.moveS = s; f.speed = Math.hypot(vx, vz);
    }

    physics(f, dt) {
      if (f.y > 0 || f.vy > 0) {
        f.vy -= GRAVITY * dt; f.y += f.vy * dt;
        f.x = clamp(f.x + f.vx * dt, ARENA.x0, ARENA.x1); f.z = clamp(f.z + f.vz * dt, ARENA.z0, ARENA.z1);
        if (f.y <= 0) {
          f.y = 0; f.vy = 0; f.vx = f.vz = 0;
          if (f.state === 'jump' || f.state === 'fly') {
            const hard = f.state === 'fly';
            f.setState('land'); f.landT = hard ? 0.45 : 0.12; f.move = null;
            this.emit('land', { who: f.key, hard });
          }
        }
      }
    }

    advance(f, opp, dt) {
      f.t += dt;
      if (f.openT > 0) f.openT -= dt;
      if (f.invT > 0) f.invT -= dt;
      this.physics(f, dt);
      if (f.stun > 0) { f.stun -= dt; if (f.stun <= 0 && f.state === 'hit') { f.setState('idle'); f.face = 'normal'; } }
      const p = f.profile;
      if (f.state === 'idle' || f.state === 'crouch') f.stamina = Math.min(f.maxStamina, f.stamina + p.regenIdle * dt * (f.fresh > 0 ? 1.5 : 1));
      else if (f.state === 'walk') f.stamina = Math.min(f.maxStamina, f.stamina + p.regenWalk * dt);
      else if (f.state === 'block') f.stamina = Math.min(f.maxStamina, f.stamina + p.regenIdle * 0.4 * dt);
      if (f.state === 'block') { f.blockT += dt; if (f.stamina <= 0) f.setState('idle'); }
      if (f.guardHitT > 0) { f.guardHitT -= dt; if (f.guardHitT <= 0) f.guardHits = 0; }
      if (f.guardBreak > 0) f.guardBreak -= dt;
      if (f.state === 'land') { f.landT -= dt; if (f.landT <= 0) f.setState('idle'); }
      if (f.move && !f.move.air) {
        const m = f.move;
        const slow = f.stamina < 35 ? 1 + (35 - f.stamina) / 35 * 0.45 : 1;
        const total = (m.windup + m.active + m.recover) * slow;
        // paso adelante durante la preparación del golpe
        if (f.t < m.windup * slow && !f.airborne) {
          const step = (m === f.moves.cross ? 0.3 : 0.18) * dt / Math.max(0.05, m.windup * slow);
          const d = Math.hypot(opp.x - f.x, opp.z - f.z);
          if (d > ARENA.minSep + 0.05) { f.x = clamp(f.x + f.fx * step, ARENA.x0, ARENA.x1); f.z = clamp(f.z + f.fz * step, ARENA.z0, ARENA.z1); }
        }
        if (f.t >= total) { f.setState('idle'); f.face = 'normal'; }
      }
      if (f.state === 'dodge' && f.t >= p.dodgeDur) f.setState('idle');
      if (f.state === 'taunt' && f.t >= f.tauntT) { f.setState('idle'); f.face = 'normal'; }
    }

    separate() {
      const p = this.p, o = this.o;
      const dx = o.x - p.x, dz = o.z - p.z; const d = Math.hypot(dx, dz) || 0.001;
      if (d < ARENA.minSep) {
        const push = (ARENA.minSep - d) / 2; const nx = dx / d, nz = dz / d;
        const pw = p.distToWall() < 0.05, ow = o.distToWall() < 0.05;
        const kp = ow ? 2 : pw ? 0 : 1, ko = pw ? 2 : ow ? 0 : 1;
        p.x = clamp(p.x - nx * push * kp, ARENA.x0, ARENA.x1); p.z = clamp(p.z - nz * push * kp, ARENA.z0, ARENA.z1);
        o.x = clamp(o.x + nx * push * ko, ARENA.x0, ARENA.x1); o.z = clamp(o.z + nz * push * ko, ARENA.z0, ARENA.z1);
      }
    }

    isInvulnerable(f) {
      if (f.invT > 0) return true;
      if (f.state === 'dodge') { const [a, b] = f.profile.dodgeInv; return f.t >= a && f.t <= b; }
      return false;
    }

    resolveHit(att, def) {
      if (!att.move || att.hitDone) return;
      const m = att.move;
      const slow = att.stamina < 35 ? 1 + (35 - att.stamina) / 35 * 0.45 : 1;
      const tN = att.t / slow;
      if (tN < m.windup) return;
      const dist = Math.hypot(def.x - att.x, def.z - att.z);
      const reach = m.reach + (att.fresh > 0 ? 0.06 : 0);
      if (m.air) {
        if (att.vy > 0.5) return;                                   // golpea al bajar
        if (dist > reach) { if (att.y <= 0.05) att.hitDone = true; return; }
      }
      att.hitDone = true;
      if (dist > reach) { this.emit('whiff', { who: att.key, move: att.state }); return; }
      if (def.state === 'down' || def.state === 'rise') return;
      const hp = def.headPos();
      if (def.state === 'crouch' && m.high && !m.air) { this.emit('duck', { who: def.key, by: att.key, x: hp.x, y: hp.y + 0.4, z: hp.z }); att.openT = Math.max(att.openT, 0.35); return; }
      if (def.airborne && def.y > 0.35 && !m.high) { this.emit('whiff', { who: att.key, move: att.state }); return; }
      if (this.isInvulnerable(def)) {
        att.openT = 1.0; att.t -= 0.18;
        this.emit('dodge', { who: def.key, by: att.key, x: hp.x, y: hp.y, z: hp.z });
        if (def.key === 'muslera') this.say('¡Esquiva de Muslera! ¡Oscar se ha quedado vendido!', 'muslera');
        else this.say('Oscar lo ve venir. Ni se despeina.', 'oscar');
        return;
      }
      let dmg = m.dmg * this.ai.globalDmg * (att.key === 'oscar' ? this.ai.dmgScale : 1);
      dmg *= 0.65 + 0.45 * clamp(att.stamina / att.maxStamina, 0, 1);   // con el aguante a tope pega más fuerte
      if (att.fresh > 0) dmg *= 1.1;
      if (def.state === 'crouch' && !m.high) dmg *= 1.3;
      let counter = false;
      if (def.openT > 0) { dmg *= 1.6; counter = true; def.openT = 0; }
      const blocking = def.state === 'block' && def.blockT >= def.profile.blockStartup && !counter && !m.air;
      const nx = att.fx, nz = att.fz;
      const pushDef = (k) => { const kk = def.distToWall() < 0.15 ? k * 0.3 : k; def.x = clamp(def.x + nx * kk, ARENA.x0, ARENA.x1); def.z = clamp(def.z + nz * kk, ARENA.z0, ARENA.z1); };
      if (blocking) {
        const perfect = def.blockT < def.profile.blockStartup + 0.14;
        dmg *= (1 - def.profile.blockReduce);
        def.stamina = Math.max(0, def.stamina - def.profile.blockStamCost);
        pushDef(m.push * 0.4);
        def.hp = Math.max(0, def.hp - dmg); att.damageDealt += dmg; att.roundDamage += dmg;
        this.emit('block', { who: def.key, by: att.key, perfect, x: hp.x, y: hp.y - 0.1, z: hp.z, dmg, hits: def.guardHits + 1 });
        if (perfect && def.key === 'oscar') { att.openT = 0.45; this.emit('parry', { who: def.key }); }
        // cuatro golpes seguidos a la guardia la rompen: 4 segundos sin poder cubrirse
        def.guardHits++; def.guardHitT = 3.0;
        if (def.guardHits >= 4) {
          def.guardHits = 0; def.guardBreak = 4.0; def.setState('hit'); def.face = 'hit'; def.stun = 0.55; def.wobble = 0.6; def.openT = Math.max(def.openT, 0.6);
          pushDef(0.3); this.hitstopT = 0.06;
          this.emit('guardBreak', { who: def.key, by: att.key, x: hp.x, y: hp.y, z: hp.z });
          this.say(def.key === 'oscar' ? '¡Muslera le rompe la guardia a Oscar! ¡Cuatro segundos de barra libre!' : 'Oscar le rompe la guardia a Muslera. Y Muslera no tenía mucha.', att.key);
          return;
        }
        if (def.stamina <= 0) { def.setState('idle'); def.wobble = 0.5; }
        return;
      }
      const wasAir = def.airborne;
      def.hp = Math.max(0, def.hp - dmg);
      att.landed++; att.damageDealt += dmg; att.roundDamage += dmg;
      def.comboTaken++; def.comboTimer = 1.0; def.lastHitBy = att.state;
      def.setState('hit'); def.face = 'hit'; def.stun = m.stun * (counter ? 1.4 : 1); def.move = null; def.blockT = 0;
      if (wasAir) { def.vy = Math.min(def.vy, -1.5); def.stun = Math.max(def.stun, 0.75); }
      pushDef(m.push * (counter ? 1.5 : 1));
      this.emit('hit', { who: def.key, by: att.key, move: att.state, dmg, counter, air: wasAir, x: hp.x, y: hp.y - 0.05, z: hp.z, combo: def.comboTaken });
      this.hitstopT = counter ? 0.09 : (att.state === 'upper' || att.state === 'fly' ? 0.07 : 0.035);
      if (def.key === 'oscar') this.brain.seriousUntil = this.time + 3;
      if (counter) this.say(def.key === 'oscar' ? '¡¡CONTRA DE MUSLERA!! ¡Eso ha dolido!' : '¡Contra de Oscar! Esto es lo que pasa cuando vas con las manos abajo.', att.key);
      else if (wasAir) this.say(def.key === 'oscar' ? '¡Muslera baja a Oscar del aire!' : 'Oscar baja a Muslera del aire. Como a una paloma.', att.key);
      const maxCombo = def.key === 'muslera' ? 3 : 4;
      if (def.comboTaken >= maxCombo) { def.comboTaken = 0; def.invT = 0.6; pushDef(0.35); this.emit('comboEnd', { who: def.key }); }
      if (def.hp <= 0) this.knockdown(def, att);
    }

    knockdown(def, att) {
      def.knockdowns++;
      def.setState('down'); def.stun = 0; def.face = 'ko'; def.comboTaken = 0; def.count = 0; def.downT = 0; def.y = 0; def.vy = 0; def.vx = def.vz = 0;
      def.rise = { need: def.key === 'muslera' ? 8 + 6 * (def.knockdowns - 1) : 0, got: 0 };
      this.phase = 'count'; this.phaseT = 0; this.hitstopT = 0.25;
      this.emit('knockdown', { who: def.key, by: att.key, n: def.knockdowns });
      if (def.key === 'oscar') this.say(def.knockdowns === 1 ? '¡¡OSCAR AL SUELO!! ¡El público no se lo cree!' : '¡¡OTRA VEZ AL SUELO!! ¡TODOS SOMOS MUSLERA!', 'muslera');
      else this.say(def.knockdowns === 1 ? 'Muslera besa el césped. ¡Dale a los botones para levantarte!' : 'Muslera otra vez en el suelo... ¡machaca los botones!', 'oscar');
      att.setState(att.key === 'oscar' ? 'taunt' : 'idle'); att.tauntT = 99; att.face = att.key === 'oscar' ? 'happy' : 'angry'; att.move = null; att.y = 0; att.vy = 0;
      if (def.knockdowns >= 3) this.finish(att.key === 'muslera' ? 'player' : 'oscar', 'TKO');
    }

    stepCount(dt, input) {
      const p = this.p, o = this.o;
      const down = p.state === 'down' ? p : o; const up = down === p ? o : p;
      down.t += dt; up.t += dt; down.downT += dt; this.physics(up, dt);
      const newCount = Math.floor(down.downT / 0.85);
      if (newCount !== down.count) { down.count = newCount; this.emit('count', { n: newCount, who: down.key }); }
      if (down === p) {
        if (input.mash) { down.rise.got++; this.emit('mash', { got: down.rise.got, need: down.rise.need }); }
        if (down.rise.got >= down.rise.need && down.count >= 3) { this.getUp(down, up); return; }
        if (down.count >= 10) { this.finish('oscar', 'KO'); return; }
      } else {
        if (!down.riseAt) down.riseAt = 4 + Math.floor(this.rng() * 4);
        if (down.count >= down.riseAt) { down.riseAt = 0; this.getUp(down, up); return; }
      }
    }

    getUp(down, up) {
      down.hp = down.profile.riseHp[Math.min(down.knockdowns, 2) - 1] || 20;
      down.stamina = Math.max(down.stamina, 45);
      down.setState('rise'); down.stun = 0.9; down.face = 'tired'; down.invT = 1.4;
      up.setState('idle'); up.tauntT = 0; up.face = 'normal';
      const mx = (down.x + up.x) / 2, mz = (down.z + up.z) / 2; let dx = up.x - down.x, dz = up.z - down.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      down.x = clamp(mx - dx * 1.2, ARENA.x0, ARENA.x1); down.z = clamp(mz - dz * 1.2, ARENA.z0, ARENA.z1);
      up.x = clamp(mx + dx * 1.2, ARENA.x0, ARENA.x1); up.z = clamp(mz + dz * 1.2, ARENA.z0, ARENA.z1);
      this.phase = 'fight'; this.phaseT = 0; this.brain.cooldown = 1.2;
      this.emit('getUp', { who: down.key });
      this.say(down.key === 'muslera' ? '¡Muslera se levanta! Esto es puro corazón.' : 'Oscar se levanta como si nada. Mala señal.', down.key);
      this.after(0.9, () => { if (down.state === 'rise') { down.setState('idle'); down.face = 'normal'; } });
    }

    endRound() {
      const p = this.p, o = this.o;
      this.phase = 'roundEnd'; this.phaseT = 0;
      this.emit('bell', { kind: 'end', round: this.round });
      let ps = 9, os = 10;
      if (p.roundDamage > o.roundDamage * 1.15) { ps = 10; os = 9; }
      const prev = this.roundKd || { p: 0, o: 0 };
      if (o.knockdowns > prev.o) { os = Math.min(os, 8); ps = 10; }
      if (p.knockdowns > prev.p) { ps = Math.min(ps, 8); os = 10; }
      this.scores.push({ p: ps, o: os, pd: Math.round(p.roundDamage), od: Math.round(o.roundDamage) });
      this.roundKd = { p: p.knockdowns, o: o.knockdowns };
      for (const f of [p, o]) { f.setState('idle'); f.move = null; f.stun = 0; f.face = f.hp < 35 ? 'tired' : 'normal'; }
      if (this.round >= ROUNDS) {
        const sp = this.scores.reduce((a, s) => a + s.p, 0), so = this.scores.reduce((a, s) => a + s.o, 0);
        this.finish(sp > so ? 'player' : 'oscar', 'decision');
      }
    }
    nextRound() { this.round++; this.beginRound(); }

    finish(winner, method) {
      this.result = { winner, method, round: this.round, time: Math.round(ROUND_TIME - this.roundT), scores: this.scores.slice(), landed: { p: this.p.landed, o: this.o.landed }, thrown: { p: this.p.thrown, o: this.o.thrown }, kd: { p: this.p.knockdowns, o: this.o.knockdowns }, pool: this.poolUsed, difficulty: this.difficulty };
      this.phase = 'over'; this.phaseT = 0;
      const w = winner === 'player' ? this.p : this.o, l = winner === 'player' ? this.o : this.p;
      w.setState('win'); w.face = 'happy'; w.move = null; w.stun = 0;
      if (l.state !== 'down') { l.setState('lose'); l.face = 'tired'; } l.move = null;
      this.emit('over', this.result);
    }

    // ---------------------------------------------------------- IA de Oscar
    thinkOscar(dt) {
      const o = this.o, p = this.p, b = this.brain, A = this.ai;
      const it = { approach: 0, strafe: 0, jab: false, cross: false, upper: false, block: false, dodge: false, jump: false, crouch: false };
      if (['down', 'rise', 'taunt', 'land', 'jump', 'fly', 'hit'].includes(o.state)) {
        if (o.state === 'jump' && !o.airPunched && this.dist < 1.5 && o.vy < 1) it.cross = true;
        return it;
      }
      const dist = this.dist;
      b.cooldown -= dt; if (b.backoff > 0) b.backoff -= dt; if (b.strafeT > 0) b.strafeT -= dt;

      // --- 1. Reacción a los golpes del jugador
      if (p.move && p.phase === 'windup' && b.seenAttack !== p.move) {
        b.seenAttack = p.move; b.lastSwing = this.time;
        const heavy = p.state !== 'jab';
        let pr = heavy ? A.reactHeavy : A.reactJab;
        b.recent = b.recent.concat(p.state).slice(-3);
        if (b.recent.length === 3 && b.recent.every(x => x === p.state)) pr += 0.14;
        b.swings = (b.swings || []).filter(t => this.time - t < 2.5); b.swings.push(this.time);
        pr += A.spamRead * Math.min(3, b.swings.length - 1);
        if (this.time < b.seriousUntil) pr += 0.10;
        if (o.stamina < 28) pr *= 0.5; if (o.hp < 40) pr *= 0.8; if (o.move) pr *= 0.35;
        b.reaction = this.rng() < pr ? ((this.rng() < A.preferDodge || o.guardBreak > 0) && !o.move ? 'dodge' : 'block') : 'none';
        b.reactAt = this.time + A.reactDelay * (0.7 + this.rng() * 0.6);
      }
      if (!p.move) b.seenAttack = null;
      if (b.reaction && b.reaction !== 'none' && this.time >= b.reactAt) {
        if (p.move && p.phase !== 'recover' && dist < p.move.reach + 0.3) {
          if (b.reaction === 'dodge') { it.dodge = true; b.reaction = null; b.plan = []; return it; }
          it.block = true; return it;
        }
        b.reaction = null;
      }
      if (o.state === 'block' && p.move && p.phase !== 'recover') { it.block = true; return it; }

      // --- 2. El jugador salta hacia él: lo baja de un golpe
      if (p.airborne && dist < 1.7 && !o.move && p.vy < 2.0 && this.rng() < A.airPunish * 0.5) { it.jab = true; return it; }
      // --- 3. El jugador se queda agachado: uppercut
      if (p.state === 'crouch') { b.crouchSeen += dt; if (b.crouchSeen > 0.3 && dist < o.moves.upper.reach + 0.2 && !o.move && this.rng() < A.duckPunish * 0.4) { b.plan = ['upper']; b.crouchSeen = 0; } }
      else b.crouchSeen = 0;

      // --- 4. Castigo: el jugador está vendido o en recuperación larga
      const playerOpen = p.openT > 0 || (p.move && p.phase === 'recover' && p.t < p.move.windup + p.move.active + p.move.recover - 0.15 && p.state !== 'jab') || p.state === 'land';
      if (playerOpen && dist <= o.moves.cross.reach && !o.move && b.cooldown < 0.4) {
        b.plan = p.openT > 0 ? (dist <= o.moves.upper.reach - 0.04 ? ['upper'] : ['cross']) : (this.rng() < 0.5 ? ['cross', 'jab'] : ['jab', 'cross']);
        b.cooldown = 0.5;
      }
      if (p.state === 'hit' && !o.move && !b.plan.length && dist <= o.moves.cross.reach && this.rng() < A.followUp) {
        b.plan = [dist <= o.moves.upper.reach - 0.04 && this.rng() < 0.35 ? 'upper' : (this.rng() < 0.5 ? 'jab' : 'cross')];
      }

      // --- 5. Chulería
      if (this.time > b.nextTaunt && o.hp > p.hp + 20 && !o.move && dist > 1.0 && this.phase === 'fight') {
        b.nextTaunt = this.time + A.tauntEvery[0] + this.rng() * (A.tauntEvery[1] - A.tauntEvery[0]);
        o.setState('taunt'); o.tauntT = A.tauntDur; o.face = 'happy'; o.openT = A.tauntDur + 0.2;
        this.emit('taunt', { who: 'oscar' });
        this.say(['Oscar se pone a hacer el chulo. ¡AHORA, MUSLERA!', 'Oscar baja los brazos para mirar al público. ¡Es tu momento!', '¡Oscar está vacilando! ¡Pégale ya!'][Math.floor(this.rng() * 3)], 'oscar');
        return it;
      }

      // --- 6. Ejecutar el plan
      if (b.plan.length && !o.move) {
        if (b.plan[0] === 'upper' && dist > o.moves.upper.reach + 0.3) b.plan[0] = 'cross';
        const need = b.plan[0] === 'upper' ? o.moves.upper.reach - 0.06 : o.moves[b.plan[0]].reach - 0.02;
        if (dist <= need) {
          const mv = b.plan.shift(); it[mv] = true;
          if (b.plan.length && this.rng() > A.comboBreak) b.plan = [];
          if (!b.plan.length) { b.cooldown = A.cooldownMin + this.rng() * A.cooldownRand / A.aggression; b.backoff = this.rng() < 0.5 ? 0.55 : 0; }
          return it;
        }
        it.approach = 1; return it;
      }

      // --- 7. Gestión de distancia: no arrinconar
      const tiredO = o.stamina < 30;
      const cornered = p.distToWall() < 0.45 && dist < 1.4;
      if (cornered && b.strafeT <= 0 && this.rng() < 0.6) { b.strafeT = 0.6 + this.rng() * 0.6; b.strafeDir = this.rng() < 0.5 ? 1 : -1; b.backoff = Math.max(b.backoff, 0.4); }
      if (b.backoff > 0 || (tiredO && dist < 1.3) || (o.guardBreak > 0 && dist < 1.4 && !b.plan.length)) { it.approach = -1; it.strafe = b.strafeT > 0 ? b.strafeDir : 0; return it; }
      if (p.state === 'down') { it.approach = -1; return it; }

      // --- 8. Salto ocasional desde media distancia (puñetazo volador telegrafiado)
      if (dist > 1.5 && dist < 2.3 && !p.move && b.cooldown <= 0 && this.time - (b.lastSwing || -9) > 1.5 && this.rng() < A.jumpRate * dt * 4.8) { it.jump = true; it.approach = 1; b.cooldown = 1.6; return it; }

      // --- 9. Decidir un nuevo combo
      if (b.cooldown <= 0 && !o.move && dist <= 1.5) {
        if (dist > o.moves.cross.reach) { it.approach = 1; return it; }
        const r = this.rng();
        const aggr = A.aggression * (o.hp < 40 ? 1.25 : 1) * (tiredO ? 0.5 : 1);
        if (r < 0.42 * aggr) b.plan = [['jab', 'cross'], ['jab', 'jab', 'cross'], ['cross', 'upper'], ['jab', 'upper'], ['jab'], ['cross'], ['jab', 'cross', 'upper']][Math.floor(this.rng() * 7)];
        else if (r < 0.52 * aggr) b.plan = dist < o.moves.upper.reach ? ['upper'] : ['cross'];
        else { b.cooldown = 0.25 + this.rng() * 0.4; it.approach = this.rng() < 0.5 ? 1 : -1; }
        return it;
      }
      // --- 10. Moverse: acercarse si está lejos; rodear de vez en cuando
      if (b.strafeT <= 0 && this.rng() < A.strafeRate * dt) { b.strafeT = 0.5 + this.rng() * 0.8; b.strafeDir = this.rng() < 0.5 ? 1 : -1; }
      if (dist > 1.5) { it.approach = 1; it.strafe = b.strafeT > 0 ? b.strafeDir * 0.5 : 0; return it; }
      if (dist < 1.05) it.approach = -0.6;
      it.strafe = b.strafeT > 0 ? b.strafeDir : 0;
      return it;
    }
  }

  const api = { Sim, Fighter, MOVES, PROFILES, ARENA, ROUND_TIME, ROUNDS, HEAD_H, makeRng, AI_EASY, AI_HARD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TSM_SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
