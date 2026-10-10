// Estadísticas detalladas de combate: node tools/diag.js [nivel] [dificultad]
const { Sim } = require('../src/sim.js');
const { makeBot } = require('./calibrate.js');
const level = process.argv[2] || 'decent';
const DIFF = parseFloat(process.argv[3] || '0');
const agg = { hitsP: 0, hitsO: 0, blocksP: 0, blocksO: 0, dodgesP: 0, dodgesO: 0, counterP: 0, counterO: 0, whiffP: 0, whiffO: 0, swingP: 0, swingO: 0, kdP: 0, kdO: 0, taunts: 0, ducksP: 0, airHitsO: 0, jumpsP: 0, jumpsO: 0, cornerFrames: 0 };
const N = 100;
for (let i = 0; i < N; i++) {
  const sim = new Sim({ seed: 1 + i * 13, difficulty: DIFF });
  let s = (1 + i * 13) * 7 + 1; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bot = makeBot(level, rng); sim.beginRound(); const dt = 1 / 60; let g = 0;
  while (sim.phase !== 'over' && g++ < 60 * 400) {
    sim.update(dt, bot(sim, dt));
    if (sim.phase === 'fight' && sim.p.distToWall() < 0.1 && sim.dist < 1.3) agg.cornerFrames++;
    for (const e of sim.events) {
      if (e.type === 'hit') { if (e.by === 'muslera') { agg.hitsP++; if (e.counter) agg.counterP++; } else { agg.hitsO++; if (e.counter) agg.counterO++; if (e.air) agg.airHitsO++; } }
      if (e.type === 'block') { e.who === 'oscar' ? agg.blocksO++ : agg.blocksP++; }
      if (e.type === 'dodge') { e.who === 'oscar' ? agg.dodgesO++ : agg.dodgesP++; }
      if (e.type === 'whiff') { e.who === 'oscar' ? agg.whiffO++ : agg.whiffP++; }
      if (e.type === 'swing') { e.who === 'oscar' ? agg.swingO++ : agg.swingP++; }
      if (e.type === 'knockdown') { e.who === 'oscar' ? agg.kdO++ : agg.kdP++; }
      if (e.type === 'taunt') agg.taunts++;
      if (e.type === 'duck' && e.who === 'muslera') agg.ducksP++;
      if (e.type === 'jump') { e.who === 'oscar' ? agg.jumpsO++ : agg.jumpsP++; }
    }
    if (sim.phase === 'break') { sim.applyBreakChoice('pool'); sim.nextRound(); }
  }
}
for (const k in agg) agg[k] = +(agg[k] / N).toFixed(1);
agg.cornerSecs = +(agg.cornerFrames / 60).toFixed(1); delete agg.cornerFrames;
console.log(level, 'dif', DIFF, agg);
