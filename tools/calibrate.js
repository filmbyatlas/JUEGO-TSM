// Calibración headless: bots de distinto nivel juegan contra Oscar.
// node tools/calibrate.js [fights] [seed]
const { Sim } = require('../src/sim.js');

function makeBot(level, rng) {
  // level: 'masher' | 'decent' | 'good' | 'pro'
  let dodgeCd = 0, lastSeen = null, guardMode = 0, guardT = 0, pending = null, pendingAt = 0;
  return function (sim, dt) {
    const p = sim.p, o = sim.o;
    const inp = {};
    if (sim.phase === 'count') { inp.mash = rng() < (level === 'masher' ? 0.5 : 0.8); return inp; }
    if (sim.phase !== 'fight') return inp;
    const dist = Math.abs(o.x - p.x);
    const toward = o.x > p.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';
    dodgeCd -= dt;
    if (level === 'masher') {
      if (dist > 110) inp[toward] = true;
      const r = rng();
      if (r < 0.08) inp.jab = true; else if (r < 0.12) inp.cross = true; else if (r < 0.14) inp.upper = true;
      return inp;
    }
    // reacción a golpes de Oscar
    const react = { decent: 0.35, good: 0.6, pro: 0.85 }[level];
    // reacción humana: ve el windup pero tarda en responder
    const delay = { decent: 0.30, good: 0.24, pro: 0.19 }[level];
    if (o.move && o.phase !== 'recover' && lastSeen !== o.move) {
      lastSeen = o.move; pendingAt = sim.time + delay * (0.8 + rng() * 0.4); pending = rng() < react ? (dodgeCd <= 0 && rng() < 0.65 ? 'dodge' : 'block') : null;
    }
    if (!o.move) lastSeen = null;
    if (pending && sim.time >= pendingAt) {
      const act = pending; pending = null;
      if (o.move && o.phase !== 'recover') { if (act === 'dodge') { inp.dodge = true; dodgeCd = 1.0; } else inp.block = true; return inp; }
    }
    if (o.move && o.phase !== 'recover' && p.state === 'block') { inp.block = true; return inp; }
    // guardia preventiva (los humanos no reaccionan a un jab de 130ms: se cubren antes)
    guardT -= dt;
    if (guardT <= 0) { guardT = 0.4 + rng() * 0.4; guardMode = rng() < { decent: 0.3, good: 0.5, pro: 0.6 }[level] ? 1 : 0; }
    // castigo
    if (o.openT > 0 && dist < 88) { inp.upper = true; return inp; }
    if (o.openT > 0) { inp[toward] = true; return inp; }
    if (o.move && o.phase === 'recover' && dist < 120 && level !== 'decent') { inp[rng() < 0.5 ? 'cross' : 'jab'] = true; return inp; }
    // gestión: si Oscar está preparando, retroceder
    if (level === 'pro' && o.move && dist < 140 && dodgeCd > 0) { inp[away] = true; return inp; }
    if (p.stamina < 25) { inp[away] = true; return inp; }
    if (dist > 108) { inp[toward] = true; return inp; }
    if (guardMode && !(o.move && o.phase === 'recover') && p.stamina > 15) { inp.block = true; return inp; }
    const r = rng();
    const rate = { decent: 0.05, good: 0.045, pro: 0.04 }[level];
    if (r < rate) inp.jab = true; else if (r < rate * 1.6) inp.cross = true; else if (r < rate * 1.8 && dist < 88) inp.upper = true;
    else if (r < rate * 2.6) inp[away] = true;
    return inp;
  };
}

function runFight(level, seed, ai) {
  const sim = new Sim({ seed, ai });
  let s = seed * 7 + 1;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bot = makeBot(level, rng);
  sim.beginRound();
  const dt = 1 / 60;
  let guard = 0;
  while (sim.phase !== 'over' && guard++ < 60 * 400) {
    const inp = bot(sim, dt);
    sim.update(dt, inp);
    if (sim.phase === 'break') { sim.applyBreakChoice(sim.round === 2 || sim.p.hp < 50 ? 'pool' : 'rest'); sim.nextRound(); }
  }
  return sim.result || { winner: 'none', method: 'timeout' };
}

const AI = process.env.AI ? JSON.parse(process.env.AI) : undefined;
const N = parseInt(process.argv[2] || '200', 10);
const seed0 = parseInt(process.argv[3] || '1', 10);
for (const level of ['masher', 'decent', 'good', 'pro']) {
  const tally = { player: 0, oscar: 0, none: 0, methods: {} }; let rounds = 0, secs = 0;
  for (let i = 0; i < N; i++) {
    const r = runFight(level, seed0 + i * 13, AI);
    tally[r.winner]++; rounds += r.round; secs += (r.round - 1) * 60 + r.time;
    const k = r.winner + ':' + r.method; tally.methods[k] = (tally.methods[k] || 0) + 1;
  }
  console.log(level.padEnd(8), 'player win %', (100 * tally.player / N).toFixed(1), JSON.stringify(tally.methods), 'avg round', (rounds / N).toFixed(2), 'avg secs', (secs / N).toFixed(0));
}
