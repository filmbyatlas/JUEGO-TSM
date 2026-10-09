const { Sim } = require('../src/sim.js');
const level = process.argv[2] || 'decent';
// reuse bot from calibrate by requiring with a hack
const src = require('fs').readFileSync(__dirname + '/calibrate.js', 'utf8');
const makeBot = new Function('Sim', src.split('function runFight')[0].replace(/const \{ Sim \}.*\n/, '') + '; return makeBot;')(Sim);
const agg = { hitsP: 0, hitsO: 0, blocksP: 0, blocksO: 0, dodgesP: 0, dodgesO: 0, counterP: 0, counterO: 0, whiffP: 0, whiffO: 0, swingP: 0, swingO: 0, kdP: 0, kdO: 0, taunts: 0, hitsOnTaunt: 0 };
const N = 100;
for (let i = 0; i < N; i++) {
  const sim = new Sim({ seed: 1 + i * 13 });
  let s = (1 + i * 13) * 7 + 1; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bot = makeBot(level, rng); sim.beginRound(); const dt = 1 / 60; let g = 0;
  while (sim.phase !== 'over' && g++ < 60 * 400) {
    sim.update(dt, bot(sim, dt));
    for (const e of sim.events) {
      if (e.type === 'hit') { if (e.by === 'muslera') { agg.hitsP++; if (e.counter) agg.counterP++; if (sim.o.state==='taunt') agg.hitsOnTaunt++; } else { agg.hitsO++; if (e.counter) agg.counterO++; } }
      if (e.type === 'block') { e.who === 'oscar' ? agg.blocksO++ : agg.blocksP++; }
      if (e.type === 'dodge') { e.who === 'oscar' ? agg.dodgesO++ : agg.dodgesP++; }
      if (e.type === 'whiff') { e.who === 'oscar' ? agg.whiffO++ : agg.whiffP++; }
      if (e.type === 'swing') { e.who === 'oscar' ? agg.swingO++ : agg.swingP++; }
      if (e.type === 'knockdown') { e.who === 'oscar' ? agg.kdO++ : agg.kdP++; }
      if (e.type === 'taunt') agg.taunts++;
    }
    if (sim.phase === 'break') { sim.applyBreakChoice('rest'); sim.nextRound(); }
  }
}
for (const k in agg) agg[k] = +(agg[k] / N).toFixed(1);
console.log(level, agg);
