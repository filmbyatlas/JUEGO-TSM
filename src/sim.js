/* ============================================================
   TSM — Todos Somos Muslera · motor de combate (sin render)
   Lógica pura: se puede ejecutar en Node para calibrar a Oscar.
   ============================================================ */
(function (root) {
  'use strict';

  const ARENA = { left: 150, right: 810, floor: 440, minSep: 78 };
  const ROUND_TIME = 60;
  const ROUNDS = 3;

  // Definición de golpes: windup (preparación), active (ventana de impacto),
  // recover (recuperación), dmg, reach (alcance), stam (coste), stun (aturdimiento)
  const MOVES = {
    muslera: {
      jab:   { windup: 0.17, active: 0.08, recover: 0.30, dmg: 5,  reach: 118, stam: 5,  stun: 0.34, push: 18 },
      cross: { windup: 0.26, active: 0.10, recover: 0.42, dmg: 9,  reach: 124, stam: 9,  stun: 0.46, push: 26 },
      upper: { windup: 0.21, active: 0.10, recover: 0.55, dmg: 15, reach: 96,  stam: 14, stun: 0.62, push: 34 },
    },
    oscar: {
      jab:   { windup: 0.13, active: 0.08, recover: 0.22, dmg: 5,  reach: 126, stam: 4,  stun: 0.34, push: 18 },
      cross: { windup: 0.21, active: 0.10, recover: 0.33, dmg: 9,  reach: 132, stam: 7,  stun: 0.46, push: 26 },
      upper: { windup: 0.31, active: 0.10, recover: 0.46, dmg: 16, reach: 98,  stam: 11, stun: 0.62, push: 34 },
    },
  };

  const PROFILES = {
    muslera: {
      name: 'MUSLERA', alias: 'EL PUEBLO', guard: 'low',
      hp: 100, stamina: 100,
      walk: 150, back: 118,
      blockStartup: 0.16, blockReduce: 0.55, blockStamCost: 9,
      dodgeDur: 0.36, dodgeInv: [0.04, 0.30], dodgeCost: 8, dodgeCooldown: 0.55,
      regenIdle: 13, regenWalk: 6,
      riseHp: [40, 30, 0],
    },
    oscar: {
      name: 'OSCAR', alias: 'EL CAMPEÓN', guard: 'high',
      hp: 100, stamina: 100,
      walk: 168, back: 140,
      blockStartup: 0.0, blockReduce: 0.85, blockStamCost: 5,
      dodgeDur: 0.30, dodgeInv: [0.02, 0.26], dodgeCost: 6, dodgeCooldown: 0.45,
      regenIdle: 15, regenWalk: 8,
      riseHp: [36, 26, 0],
    },
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Generador determinista (para simulaciones reproducibles)
  function makeRng(seed) {
    let s = (seed >>> 0) || 123456789;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  class Fighter {
    constructor(key, x, dir) {
      const p = PROFILES[key];
      this.key = key;
      this.name = p.name;
      this.alias = p.alias;
      this.profile = p;
      this.moves = MOVES[key];
      this.x = x;
      this.dir = dir;           // +1 mira a la derecha
      this.hp = p.hp; this.maxHp = p.hp;
      this.stamina = p.stamina; this.maxStamina = p.stamina;
      this.state = 'idle';      // idle walk jab cross upper block dodge hit down rise taunt win lose
      this.t = 0;               // tiempo en el estado actual
      this.move = null;         // golpe en curso
      this.hitDone = false;     // ya se resolvió el impacto de este golpe
      this.stun = 0;
      this.openT = 0;           // ventana en la que está "vendido" (contra)
      this.invT = 0;            // invulnerabilidad breve tras combo largo
      this.dodgeCd = 0;
      this.blockT = 0;          // tiempo con el bloqueo levantado
      this.knockdowns = 0;
      this.comboTaken = 0;
      this.comboTimer = 0;
      this.landed = 0; this.thrown = 0; this.damageDealt = 0;
      this.roundDamage = 0;
      this.walkDir = 0;
      this.fresh = 0;           // buff de la piscina (segundos)
      this.sweat = 0;
      this.rise = { need: 0, got: 0 };
      this.count = 0;
      this.downT = 0;
      this.tauntT = 0;
      this.tired = false;
      this.face = 'normal';     // normal, hit, angry, tired, ko, happy
      this.lastHitBy = null;
      this.wobble = 0;
    }
    get busy() { return !['idle', 'walk', 'block'].includes(this.state); }
    get attacking() { return this.move !== null; }
    get phase() {
      if (!this.move) return null;
      const m = this.move;
      if (this.t < m.windup) return 'windup';
      if (this.t < m.windup + m.active) return 'active';
      return 'recover';
    }
    setState(s) { this.state = s; this.t = 0; if (!['jab', 'cross', 'upper'].includes(s)) { this.move = null; } }
  }

  class Sim {
    constructor(opts = {}) {
      this.rng = makeRng(opts.seed || ((Math.random() * 1e9) | 0));
      this.ai = Object.assign({
        reactJab: 0.65, reactHeavy: 0.82, reactDelay: 0.10,
        aggression: 1.0, comboBreak: 0.9, tauntEvery: [15, 25], tauntDur: 0.9,
        preferDodge: 0.28, dmgScale: 0.78, globalDmg: 0.7, followUp: 0.45, cooldownMin: 1.3, cooldownRand: 1.5,
      }, opts.ai || {});
      this.events = [];
      this.time = 0;
      this.round = 1;
      this.roundT = ROUND_TIME;
      this.phase = 'ready';     // ready fight count roundEnd break over
      this.phaseT = 0;
      this.poolUsed = false;
      this.scores = [];         // puntuación de jueces por asalto
      this.result = null;
      this.commentary = [];
      this.p = new Fighter('muslera', 360, +1);
      this.o = new Fighter('oscar', 600, -1);
      this.brain = { nextThink: 0, plan: [], planT: 0, cooldown: 0.8, nextTaunt: 11, mode: 'neutral', seenAttack: null, sawAt: 0, backoff: 0, stepTarget: 0 };
      this.hitstopT = 0;
      this.slowmo = 1;
      this.totalFightTime = 0;
    }

    emit(type, data) { this.events.push(Object.assign({ type, time: this.time }, data || {})); }
    say(text, who) { this.emit('say', { text, who }); }

    beginRound() {
      this.phase = 'ready'; this.phaseT = 0;
      this.roundT = ROUND_TIME;
      this.p.x = 360; this.o.x = 600;
      for (const f of [this.p, this.o]) {
        f.setState('idle'); f.stun = 0; f.openT = 0; f.invT = 0; f.comboTaken = 0; f.roundDamage = 0; f.walkDir = 0; f.face = 'normal';
      }
      this.brain.plan = []; this.brain.cooldown = 1.2; this.brain.nextTaunt = this.time + 8 + this.rng() * 6;
      this.emit('roundStart', { round: this.round });
    }

    applyBreakChoice(choice) {
      const p = this.p, o = this.o;
      // Oscar se recupera siempre como un profesional
      o.hp = Math.min(o.maxHp, o.hp + 10); o.stamina = Math.min(o.maxStamina, o.stamina + 45);
      if (choice === 'pool' && !this.poolUsed) {
        this.poolUsed = true;
        p.hp = p.maxHp; p.stamina = p.maxStamina; p.fresh = 22;
        this.emit('pool');
      } else {
        p.hp = Math.min(p.maxHp, p.hp + 10); p.stamina = Math.min(p.maxStamina, p.stamina + 40);
      }
    }

    // ---------------------------------------------------------- update
    update(dt, input) {
      input = input || {};
      this.events.length = 0;
      if (this.hitstopT > 0) { this.hitstopT -= dt; return; }
      dt *= this.slowmo;
      this.time += dt;
      this.phaseT += dt;
      const p = this.p, o = this.o;

      switch (this.phase) {
        case 'ready':
          if (this.phaseT > 1.6) { this.phase = 'fight'; this.phaseT = 0; this.emit('bell', { kind: 'start' }); }
          break;
        case 'fight':
          this.roundT -= dt; this.totalFightTime += dt;
          this.stepFighters(dt, input);
          if (this.roundT <= 0 && this.phase === 'fight') this.endRound();
          break;
        case 'count':
          this.stepCount(dt, input);
          break;
        case 'roundEnd':
          this.stepFighters(dt, {});
          if (this.phaseT > 2.2) { this.phase = 'break'; this.phaseT = 0; this.emit('break', { round: this.round }); }
          break;
        case 'break':
        case 'over':
          this.stepPassive(dt);
          break;
      }
      // sudor / fatiga visual
      for (const f of [p, o]) {
        f.sweat = clamp(f.sweat + dt * (f.attacking ? 0.4 : 0.05) - dt * 0.08, 0, 1);
        f.tired = f.stamina < 28;
        if (f.fresh > 0) f.fresh -= dt;
        if (f.wobble > 0) f.wobble -= dt;
      }
    }

    stepPassive(dt) {
      for (const f of [this.p, this.o]) { f.t += dt; }
    }

    // ---------------------------------------------------------- fighters
    stepFighters(dt, input) {
      const p = this.p, o = this.o;
      const ai = this.thinkOscar(dt);
      this.applyIntent(p, this.playerIntent(input), dt);
      this.applyIntent(o, ai, dt);
      this.advance(p, o, dt);
      this.advance(o, p, dt);
      this.separate();
      // resolver impactos
      this.resolveHit(p, o);
      this.resolveHit(o, p);
      // combos: expiran
      for (const f of [p, o]) {
        if (f.comboTimer > 0) { f.comboTimer -= dt; if (f.comboTimer <= 0) f.comboTaken = 0; }
      }
    }

    playerIntent(input) {
      return {
        walk: (input.right ? 1 : 0) - (input.left ? 1 : 0),
        jab: !!input.jab, cross: !!input.cross, upper: !!input.upper,
        block: !!input.block, dodge: !!input.dodge,
      };
    }

    applyIntent(f, it, dt) {
      if (!it) return;
      if (f.stun > 0 || ['hit', 'down', 'rise', 'taunt', 'win', 'lose'].includes(f.state)) return;
      // en recuperación de un golpe no se puede hacer nada
      if (f.move) return;
      if (f.dodgeCd > 0) f.dodgeCd -= dt;
      const stamFactor = f.stamina < 20 ? 0.6 : 1;
      if (it.dodge && f.dodgeCd <= 0 && f.stamina >= 4) {
        f.setState('dodge'); f.dodgeCd = f.profile.dodgeCooldown + f.profile.dodgeDur; f.stamina = Math.max(0, f.stamina - f.profile.dodgeCost);
        this.emit('dodgeStart', { who: f.key });
        return;
      }
      if (f.state === 'dodge') return;
      const punch = it.upper ? 'upper' : it.cross ? 'cross' : it.jab ? 'jab' : null;
      if (punch && f.stamina > 2) {
        const m = f.moves[punch];
        f.setState(punch); f.move = m; f.hitDone = false; f.thrown++;
        f.stamina = Math.max(0, f.stamina - m.stam * (f.fresh > 0 ? 0.7 : 1));
        f.blockT = 0;
        this.emit('swing', { who: f.key, move: punch });
        return;
      }
      if (it.block && f.stamina > 0) {
        if (f.state !== 'block') { f.setState('block'); f.blockT = 0; }
        f.walkDir = 0;
        return;
      } else if (f.state === 'block') { f.setState('idle'); }
      if (it.walk) {
        f.walkDir = it.walk;
        if (f.state !== 'walk') f.setState('walk');
        const back = (it.walk !== f.dir);
        const sp = (back ? f.profile.back : f.profile.walk) * stamFactor * (f.fresh > 0 ? 1.12 : 1);
        f.x = clamp(f.x + it.walk * sp * dt, ARENA.left, ARENA.right);
      } else {
        f.walkDir = 0;
        if (f.state === 'walk') f.setState('idle');
      }
    }

    advance(f, opp, dt) {
      f.t += dt;
      if (f.openT > 0) f.openT -= dt;
      if (f.invT > 0) f.invT -= dt;
      if (f.stun > 0) {
        f.stun -= dt;
        if (f.stun <= 0 && f.state === 'hit') { f.setState('idle'); f.face = 'normal'; }
      }
      const p = f.profile;
      // Regeneración de aguante
      if (f.state === 'idle') f.stamina = Math.min(f.maxStamina, f.stamina + p.regenIdle * dt * (f.fresh > 0 ? 1.5 : 1));
      else if (f.state === 'walk') f.stamina = Math.min(f.maxStamina, f.stamina + p.regenWalk * dt);
      else if (f.state === 'block') f.stamina = Math.max(0, f.stamina - 2 * dt);
      if (f.state === 'block') { f.blockT += dt; if (f.stamina <= 0) f.setState('idle'); }
      if (f.move) {
        const m = f.move;
        const slow = f.stamina < 35 ? 1 + (35 - f.stamina) / 35 * 0.45 : 1;
        const total = (m.windup + m.active + m.recover) * slow;
        // avanzamos en "tiempo normalizado" guardando t real
        if (f.t >= total) { f.setState('idle'); f.face = 'normal'; }
      }
      if (f.state === 'dodge' && f.t >= p.dodgeDur) f.setState('idle');
      if (f.state === 'taunt' && f.t >= f.tauntT) { f.setState('idle'); f.face = 'normal'; }
      // encarar al rival
      f.dir = opp.x > f.x ? 1 : -1;
    }

    separate() {
      const p = this.p, o = this.o;
      const d = o.x - p.x;
      if (Math.abs(d) < ARENA.minSep) {
        const push = (ARENA.minSep - Math.abs(d)) / 2;
        const s = d >= 0 ? 1 : -1;
        p.x = clamp(p.x - push * s, ARENA.left, ARENA.right);
        o.x = clamp(o.x + push * s, ARENA.left, ARENA.right);
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
      att.hitDone = true;
      const dist = Math.abs(def.x - att.x);
      const reach = m.reach + (att.fresh > 0 ? 6 : 0);
      if (dist > reach) { this.emit('whiff', { who: att.key, move: att.state }); return; }
      if (def.state === 'down' || def.state === 'rise') return;
      if (this.isInvulnerable(def)) {
        // esquiva limpia: el atacante queda vendido
        att.openT = 1.0; att.t -= 0.18; // se alarga la recuperación
        this.emit('dodge', { who: def.key, by: att.key });
        if (def.key === 'muslera') this.say('¡Esquiva de Muslera! ¡Oscar se ha quedado vendido!', 'muslera');
        else this.say('Oscar lo ve venir. Ni se despeina.', 'oscar');
        return;
      }
      let dmg = m.dmg * this.ai.globalDmg * (att.key === 'oscar' ? this.ai.dmgScale : 1);
      if (att.stamina < 20) dmg *= 0.75;
      if (att.fresh > 0) dmg *= 1.1;
      let counter = false;
      if (def.openT > 0) { dmg *= 1.6; counter = true; def.openT = 0; }
      // bloqueo
      const blocking = def.state === 'block' && def.blockT >= def.profile.blockStartup && !counter;
      if (blocking) {
        const perfect = def.blockT < def.profile.blockStartup + 0.14;
        dmg *= (1 - def.profile.blockReduce);
        def.stamina = Math.max(0, def.stamina - def.profile.blockStamCost);
        def.x = clamp(def.x + att.dir * m.push * 0.5, ARENA.left, ARENA.right);
        def.hp = Math.max(0, def.hp - dmg);
        att.damageDealt += dmg; att.roundDamage += dmg;
        this.emit('block', { who: def.key, by: att.key, perfect, x: def.x, dmg });
        if (perfect && def.key === 'oscar') { att.openT = 0.45; this.emit('parry', { who: def.key }); }
        if (def.stamina <= 0) { def.setState('idle'); def.wobble = 0.5; }
        return;
      }
      // impacto limpio
      def.hp = Math.max(0, def.hp - dmg);
      att.landed++; att.damageDealt += dmg; att.roundDamage += dmg;
      def.comboTaken++; def.comboTimer = 1.0;
      def.lastHitBy = att.state;
      def.setState('hit'); def.face = 'hit';
      def.stun = m.stun * (counter ? 1.4 : 1);
      def.move = null; def.blockT = 0;
      def.x = clamp(def.x + att.dir * m.push * (counter ? 1.6 : 1), ARENA.left, ARENA.right);
      att.x = clamp(att.x + att.dir * 4, ARENA.left, ARENA.right);
      const hitX = def.x - def.dir * 10, hitY = m === att.moves.upper ? 290 : 300;
      this.emit('hit', { who: def.key, by: att.key, move: att.state, dmg, counter, x: hitX, y: hitY, combo: def.comboTaken });
      if (def.key === 'oscar') this.brain.seriousUntil = this.time + 3;
      this.hitstopT = counter ? 0.09 : (att.state === 'upper' ? 0.07 : 0.035);
      if (counter) this.say(def.key === 'oscar' ? '¡¡CONTRA DE MUSLERA!! ¡Eso ha dolido!' : '¡Contra de Oscar! Esto es lo que pasa cuando vas con las manos abajo.', att.key);
      // combo largo: el que lo recibe sale despedido y respira
      if (def.comboTaken >= 4) {
        def.comboTaken = 0; def.invT = 0.5; def.x = clamp(def.x + att.dir * 40, ARENA.left, ARENA.right);
        this.emit('comboEnd', { who: def.key });
      }
      if (def.hp <= 0) this.knockdown(def, att);
    }

    knockdown(def, att) {
      def.knockdowns++;
      def.setState('down'); def.stun = 0; def.face = 'ko'; def.comboTaken = 0;
      def.count = 0; def.downT = 0;
      def.rise = { need: def.key === 'muslera' ? 9 + 7 * (def.knockdowns - 1) : 0, got: 0 };
      this.phase = 'count'; this.phaseT = 0;
      this.hitstopT = 0.25;
      this.emit('knockdown', { who: def.key, by: att.key, n: def.knockdowns });
      if (def.key === 'oscar') this.say(def.knockdowns === 1 ? '¡¡OSCAR AL SUELO!! ¡El público no se lo cree!' : '¡¡OTRA VEZ AL SUELO!! ¡TODOS SOMOS MUSLERA!', 'muslera');
      else this.say(def.knockdowns === 1 ? 'Muslera besa el césped. ¡Dale a los botones para levantarte!' : 'Muslera otra vez en el suelo... ¡machaca los botones!', 'oscar');
      att.setState(att.key === 'oscar' ? 'taunt' : 'idle'); att.tauntT = 99; att.face = att.key === 'oscar' ? 'happy' : 'angry';
      if (def.knockdowns >= 3) {
        this.finish(att.key === 'muslera' ? 'player' : 'oscar', 'TKO');
      }
    }

    stepCount(dt, input) {
      const p = this.p, o = this.o;
      const down = p.state === 'down' ? p : o;
      const up = down === p ? o : p;
      down.t += dt; up.t += dt; down.downT += dt;
      const newCount = Math.floor(down.downT / 0.85);
      if (newCount !== down.count) { down.count = newCount; this.emit('count', { n: newCount, who: down.key }); }
      if (down === p) {
        if (input.mash) { down.rise.got++; this.emit('mash', { got: down.rise.got, need: down.rise.need }); }
        if (down.rise.got >= down.rise.need && down.count >= 3) { this.getUp(down, up); return; }
        if (down.count >= 10) { this.finish('oscar', 'KO'); return; }
      } else {
        // Oscar se levanta solo, profesional, entre el 4 y el 7
        if (!down.riseAt) down.riseAt = 4 + Math.floor(this.rng() * 4);
        if (down.count >= down.riseAt) { down.riseAt = 0; this.getUp(down, up); return; }
      }
    }

    getUp(down, up) {
      down.hp = down.profile.riseHp[Math.min(down.knockdowns, 2) - 1] || 20;
      down.stamina = Math.max(down.stamina, 45);
      down.setState('rise'); down.stun = 0.9; down.face = 'tired';
      down.invT = 1.4;
      up.setState('idle'); up.tauntT = 0; up.face = 'normal';
      // separar
      const mid = (down.x + up.x) / 2;
      down.x = clamp(mid - down.dir * 120, ARENA.left, ARENA.right);
      up.x = clamp(mid + down.dir * 120, ARENA.left, ARENA.right);
      this.phase = 'fight'; this.phaseT = 0;
      this.brain.cooldown = 1.0;
      this.emit('getUp', { who: down.key });
      this.say(down.key === 'muslera' ? '¡Muslera se levanta! Esto es puro corazón.' : 'Oscar se levanta como si nada. Mala señal.', down.key);
      setTimeoutSim(this, 0.9, () => { if (down.state === 'rise') { down.setState('idle'); down.face = 'normal'; } });
    }

    endRound() {
      const p = this.p, o = this.o;
      this.phase = 'roundEnd'; this.phaseT = 0;
      this.emit('bell', { kind: 'end', round: this.round });
      // puntuación de jueces (10-9 sistema; empate favorece a Oscar: son colegas)
      let ps = 9, os = 10;
      if (p.roundDamage > o.roundDamage * 1.15) { ps = 10; os = 9; }
      if (o.knockdowns > 0 && this.kdThisRound(o)) { os = Math.min(os, 8); ps = 10; }
      if (p.knockdowns > 0 && this.kdThisRound(p)) { ps = Math.min(ps, 8); os = 10; }
      this.scores.push({ p: ps, o: os, pd: Math.round(p.roundDamage), od: Math.round(o.roundDamage) });
      this.roundKd = { p: p.knockdowns, o: o.knockdowns };
      for (const f of [p, o]) { f.setState('idle'); f.move = null; f.stun = 0; f.face = f.hp < 35 ? 'tired' : 'normal'; }
      if (this.round >= ROUNDS) {
        const sp = this.scores.reduce((a, s) => a + s.p, 0), so = this.scores.reduce((a, s) => a + s.o, 0);
        this.finish(sp > so ? 'player' : 'oscar', 'decision');
      }
    }
    kdThisRound(f) { const prev = this.roundKd || { p: 0, o: 0 }; return f.knockdowns > (f.key === 'muslera' ? prev.p : prev.o); }

    nextRound() { this.round++; this.beginRound(); }

    finish(winner, method) {
      this.result = { winner, method, round: this.round, time: Math.round(ROUND_TIME - this.roundT), scores: this.scores.slice(), landed: { p: this.p.landed, o: this.o.landed }, thrown: { p: this.p.thrown, o: this.o.thrown }, kd: { p: this.p.knockdowns, o: this.o.knockdowns }, pool: this.poolUsed };
      this.phase = 'over'; this.phaseT = 0;
      const w = winner === 'player' ? this.p : this.o, l = winner === 'player' ? this.o : this.p;
      w.setState('win'); w.face = 'happy'; w.move = null; w.stun = 0;
      if (l.state !== 'down') { l.setState('lose'); l.face = 'tired'; } l.move = null;
      this.emit('over', this.result);
    }

    // ---------------------------------------------------------- IA de Oscar
    thinkOscar(dt) {
      const o = this.o, p = this.p, b = this.brain, A = this.ai;
      const intent = { walk: 0, jab: false, cross: false, upper: false, block: false, dodge: false };
      if (o.state === 'down' || o.state === 'rise' || o.state === 'taunt') return intent;
      const dist = Math.abs(p.x - o.x);
      const toward = p.x > o.x ? 1 : -1;
      b.cooldown -= dt;
      if (b.backoff > 0) b.backoff -= dt;

      // --- 1. Reacción a los golpes del jugador (ve el windup)
      if (p.move && p.phase === 'windup' && b.seenAttack !== p.move) {
        b.seenAttack = p.move; b.sawAt = this.time;
        const heavy = p.state !== 'jab';
        let pr = heavy ? A.reactHeavy : A.reactJab;
        b.recent = (b.recent || []).concat(p.state).slice(-3);
        if (b.recent.length === 3 && b.recent.every(x => x === p.state)) pr += 0.14; // lee el spam
        if (this.time < (b.seriousUntil || 0)) pr += 0.10;                           // se pone serio tras encajar
        if (o.stamina < 28) pr *= 0.5;           // cansado reacciona peor
        if (o.hp < 40) pr *= 0.8;                // herido, más nervioso
        if (o.move) pr *= 0.35;                  // si está pegando, no puede cubrirse tan fácil
        b.reaction = this.rng() < pr ? (this.rng() < A.preferDodge && !o.move ? 'dodge' : 'block') : 'none';
        b.reactAt = this.time + A.reactDelay * (0.7 + this.rng() * 0.6);
      }
      if (!p.move) b.seenAttack = null;
      if (b.reaction && b.reaction !== 'none' && this.time >= b.reactAt) {
        if (p.move && p.phase !== 'recover' && dist < p.move.reach + 30) {
          if (b.reaction === 'dodge') { intent.dodge = true; b.reaction = null; b.plan = []; return intent; }
          intent.block = true;
          if (p.phase === 'recover' || !p.move) b.reaction = null;
          return intent;
        }
        b.reaction = null;
      }
      // seguir bloqueando mientras el golpe sigue en el aire
      if (o.state === 'block' && p.move && p.phase !== 'recover') { intent.block = true; return intent; }

      // --- 2. Castigo: el jugador está vendido o en recuperación larga
      const playerOpen = p.openT > 0 || (p.move && p.phase === 'recover' && p.t < p.move.windup + p.move.active + p.move.recover - 0.15 && p.state !== 'jab');
      if (playerOpen && dist <= o.moves.cross.reach && !o.move && b.cooldown < 0.4) {
        b.plan = p.openT > 0 ? (dist <= o.moves.upper.reach - 4 ? ['upper'] : ['cross']) : (this.rng() < 0.5 ? ['cross', 'jab'] : ['jab', 'cross']);
        b.planT = 0; b.cooldown = 0.5;
      }
      // remate: el jugador está aturdido y a tiro
      if (p.state === 'hit' && !o.move && !b.plan.length && dist <= o.moves.cross.reach && this.rng() < A.followUp) {
        b.plan = [dist <= o.moves.upper.reach - 4 && this.rng() < 0.35 ? 'upper' : (this.rng() < 0.5 ? 'jab' : 'cross')];
      }

      // --- 3. Chulería: de vez en cuando baja la guardia y hace el tonto (ventana para Muslera)
      if (this.time > b.nextTaunt && o.hp > p.hp + 20 && !o.move && dist > 100 && this.phase === 'fight') {
        b.nextTaunt = this.time + A.tauntEvery[0] + this.rng() * (A.tauntEvery[1] - A.tauntEvery[0]);
        o.setState('taunt'); o.tauntT = A.tauntDur; o.face = 'happy'; o.openT = A.tauntDur + 0.2;
        this.emit('taunt', { who: 'oscar' });
        this.say(['Oscar se pone a hacer el chulo. ¡AHORA, MUSLERA!', 'Oscar baja los brazos para mirar al público. ¡Es tu momento!', '¡Oscar está vacilando! ¡Pégale ya!'][Math.floor(this.rng() * 3)], 'oscar');
        return intent;
      }

      // --- 4. Ejecutar el plan de combo
      if (b.plan.length && !o.move) {
        if (b.plan[0] === 'upper' && dist > o.moves.upper.reach + 30) b.plan[0] = 'cross';
        const need = b.plan[0] === 'upper' ? o.moves.upper.reach - 6 : o.moves[b.plan[0]].reach - 2;
        if (dist <= need) {
          const mv = b.plan.shift(); intent[mv] = true;
          if (b.plan.length && this.rng() > A.comboBreak) b.plan = [];
          if (!b.plan.length) { b.cooldown = A.cooldownMin + this.rng() * A.cooldownRand / A.aggression; b.backoff = this.rng() < 0.45 ? 0.5 : 0; }
          return intent;
        }
        intent.walk = toward; return intent;
      }

      // --- 5. Gestión de distancia
      const tiredO = o.stamina < 30;
      if (b.backoff > 0 || (tiredO && dist < 130)) { intent.walk = -toward; return intent; }
      if (p.state === 'down') { intent.walk = -toward; return intent; }

      // --- 6. Decidir un nuevo combo
      if (b.cooldown <= 0 && !o.move && dist <= 150) {
        if (dist > o.moves.cross.reach) { intent.walk = toward; return intent; }
        const r = this.rng();
        const aggr = A.aggression * (o.hp < 40 ? 1.25 : 1) * (tiredO ? 0.5 : 1);
        if (r < 0.42 * aggr) b.plan = [['jab', 'cross'], ['jab', 'jab', 'cross'], ['cross', 'upper'], ['jab', 'upper'], ['jab'], ['cross'], ['jab', 'cross', 'upper']][Math.floor(this.rng() * 7)];
        else if (r < 0.52 * aggr) b.plan = dist < o.moves.upper.reach ? ['upper'] : ['cross'];
        else { b.cooldown = 0.25 + this.rng() * 0.4; intent.walk = this.rng() < 0.5 ? toward : -toward; }
        return intent;
      }
      if (dist > 150) { intent.walk = toward; return intent; }
      // bailar un poco
      if (!b.stepTarget || this.rng() < 0.02) b.stepTarget = this.rng() < 0.5 ? 1 : -1;
      if (dist < 95 && b.stepTarget === toward) b.stepTarget = -toward;
      intent.walk = this.rng() < 0.6 ? b.stepTarget : 0;
      return intent;
    }
  }

  // mini temporizadores dentro de la simulación
  function setTimeoutSim(sim, secs, fn) {
    sim._timers = sim._timers || [];
    sim._timers.push({ at: sim.time + secs, fn });
    const orig = sim.update;
    if (!sim._timerHooked) {
      sim._timerHooked = true;
      sim.update = function (dt, input) {
        orig.call(sim, dt, input);
        if (sim._timers.length) {
          const due = sim._timers.filter(t => sim.time >= t.at);
          sim._timers = sim._timers.filter(t => sim.time < t.at);
          due.forEach(t => t.fn());
        }
      };
    }
  }

  const api = { Sim, Fighter, MOVES, PROFILES, ARENA, ROUND_TIME, ROUNDS, makeRng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TSM_SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
