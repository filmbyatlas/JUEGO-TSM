// Calibración headless (motor 3D): bots de distinto nivel juegan contra Oscar.
// node tools/calibrate.js [peleas] [semilla] [dificultad 0..1]    (AI='{"json"}' para forzar parámetros)
const { Sim } = require('../src/sim.js');

function makeBot(level, rng) {
  let dodgeCd = 0, lastSeen = null, guardMode = 0, guardT = 0, pending = null, pendingAt = 0, strafeT = 0, strafeDir = 0, jumpCd = 0;
  const cfg = { masher: { react: 0, delay: 0.5, guard: 0, rate: 0.08, crouch: 0.0 }, decent: { react: 0.3, delay: 0.3, guard: 0.3, rate: 0.022, crouch: 0.15 }, good: { react: 0.55, delay: 0.24, guard: 0.5, rate: 0.026, crouch: 0.3 }, pro: { react: 0.8, delay: 0.19, guard: 0.6, rate: 0.03, crouch: 0.45 } }[level];
  return function (sim, dt) {
    const p = sim.p, o = sim.o; const inp = {};
    if (sim.phase === 'count') { inp.mash = rng() < (level === 'masher' ? 0.5 : 0.8); return inp; }
    if (sim.phase !== 'fight') return inp;
    const dist = sim.dist;
    dodgeCd -= dt; strafeT -= dt; jumpCd -= dt; guardT -= dt;
    if (level === 'masher') {
      if (dist > 1.2) inp.approach = 1;
      const r = rng();
      if (r < 0.08) inp.jab = true; else if (r < 0.12) inp.cross = true; else if (r < 0.14) inp.upper = true; else if (r < 0.145) inp.jump = true;
      return inp;
    }
    // reacción humana con retardo
    if (o.move && o.phase !== 'recover' && lastSeen !== o.move) {
      lastSeen = o.move; pendingAt = sim.time + cfg.delay * (0.8 + rng() * 0.4);
      const r = rng();
      pending = r < cfg.react ? (o.move.high && rng() < cfg.crouch ? 'crouch' : (dodgeCd <= 0 && rng() < 0.6 ? 'dodge' : 'block')) : null;
    }
    if (!o.move) lastSeen = null;
    if (pending && sim.time >= pendingAt) {
      const act = pending; pending = null;
      if (o.move && o.phase !== 'recover') { if (act === 'dodge') { inp.dodge = true; dodgeCd = 1.0; } else if (act === 'crouch') { inp.crouch = true; } else inp.block = true; return inp; }
    }
    if (o.move && o.phase !== 'recover' && p.state === 'block') { inp.block = true; return inp; }
    if (o.move && o.move.high && o.phase !== 'recover' && p.state === 'crouch') { inp.crouch = true; return inp; }
    if (guardT <= 0) { guardT = 0.4 + rng() * 0.4; guardMode = rng() < cfg.guard ? 1 : 0; }
    // castigo
    if (o.openT > 0 && dist < 1.0) { inp.upper = true; return inp; }
    if (o.openT > 0) { inp.approach = 1; return inp; }
    if (o.move && o.phase === 'recover' && dist < 1.2 && level !== 'decent') { inp[rng() < 0.5 ? 'cross' : 'jab'] = true; return inp; }
    if (p.stamina < 25) { inp.approach = -1; return inp; }
    // salto ofensivo ocasional (bueno/pro)
    if (level !== 'decent' && jumpCd <= 0 && dist > 1.4 && dist < 2.0 && !o.move && rng() < 0.01) { inp.jump = true; inp.approach = 1; jumpCd = 3; return inp; }
    if (p.state === 'jump' && dist < 1.4 && p.vy < 1) { inp.cross = true; return inp; }
    if (dist > 1.2) { inp.approach = 1; if (strafeT <= 0 && rng() < 0.02) { strafeT = 0.5; strafeDir = rng() < 0.5 ? 1 : -1; } inp.strafe = strafeT > 0 ? strafeDir : 0; return inp; }
    if (guardMode && !(o.move && o.phase === 'recover') && p.stamina > 15) { inp.block = true; return inp; }
    const r = rng(), rate = cfg.rate;
    if (r < rate) inp.jab = true; else if (r < rate * 1.6) inp.cross = true; else if (r < rate * 1.8 && dist < 1.0) inp.upper = true;
    else if (r < rate * 2.6) { inp.approach = -1; if (rng() < 0.5) inp.strafe = rng() < 0.5 ? 1 : -1; }
    return inp;
  };
}

function runFight(level, seed, ai, difficulty) {
  const sim = new Sim({ seed, ai, difficulty });
  let s = seed * 7 + 1;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bot = makeBot(level, rng);
  sim.beginRound();
  const dt = 1 / 60; let guard = 0;
  while (sim.phase !== 'over' && guard++ < 60 * 400) {
    sim.update(dt, bot(sim, dt));
    if (sim.phase === 'break') { sim.applyBreakChoice(sim.round === 2 || sim.p.hp < 50 ? 'pool' : 'rest'); sim.nextRound(); }
  }
  return sim.result || { winner: 'none', method: 'timeout', round: sim.round, time: 0 };
}

const AI = process.env.AI ? JSON.parse(process.env.AI) : undefined;
const N = parseInt(process.argv[2] || '200', 10);
const seed0 = parseInt(process.argv[3] || '1', 10);
const DIFF = parseFloat(process.argv[4] || '0');
if (require.main === module) {
  for (const level of ['masher', 'decent', 'good', 'pro']) {
    const tally = { player: 0, oscar: 0, none: 0, methods: {} }; let rounds = 0, secs = 0;
    for (let i = 0; i < N; i++) {
      const r = runFight(level, seed0 + i * 13, AI, DIFF);
      tally[r.winner]++; rounds += r.round; secs += (r.round - 1) * 60 + r.time;
      const k = r.winner + ':' + r.method; tally.methods[k] = (tally.methods[k] || 0) + 1;
    }
    console.log(level.padEnd(8), 'player win %', (100 * tally.player / N).toFixed(1), JSON.stringify(tally.methods), 'avg round', (rounds / N).toFixed(2), 'avg secs', (secs / N).toFixed(0));
  }
}
module.exports = { makeBot, runFight };
