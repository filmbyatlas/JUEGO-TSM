// Tira de fotogramas para evaluar la animación: node tools/strip.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'); const { execSync } = require('child_process');
const OUT = '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/strip';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const enterWho = async (pg, name) => { try { if (!(await pg.$eval('#ov-who', el => el.hidden))) { await pg.fill('#who-name', name || 'Pepe'); await pg.click('#btn-who-enter'); await pg.waitForTimeout(300); } } catch (e) { } };
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.route('**/three.min.js', r => r.fulfill({ path: OUT + '/../three.min.js', contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve('index.html')); await page.waitForTimeout(800); await enterWho(page);
  await page.click('#btn-fight'); await page.evaluate(() => { TSM_GAME.intro.t = 99; });
  await page.waitForFunction(() => TSM_GAME.screen === 'fight' && TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 });
  await page.evaluate(() => { TSM_GAME.freeze = true; const s = TSM_GAME.sim; s.o.x = s.p.x + 1.3; s.o.z = s.p.z; s.face(); s.ai.reactJab = 0; s.ai.reactHeavy = 0; s.brain.cooldown = 99; s.brain.plan = []; TSM_GAME.debugCam = { focus: { x: (s.p.x + s.o.x) / 2, y: 1.15, z: s.p.z }, yaw: Math.PI / 2 + 0.25, dist: 3.6, height: 0.3 }; for (let i = 0; i < 40; i++) TSM_GAME.step(1 / 30); });
  const seq = async (name, key, frames) => {
    const files = [];
    if (key) await page.evaluate((k) => { TSM_GAME.input.pressed.add(k); }, key);
    for (let i = 0; i < frames; i++) { await page.evaluate(() => TSM_GAME.step(1 / 24)); const f = `${OUT}/${name}-${String(i).padStart(2, '0')}.png`; await page.screenshot({ path: f }); files.push(f); }
    execSync(`montage ${files.join(' ')} -tile 4x -geometry 480x270+2+2 -background '#222' ${OUT}/${name}.png`);
  };
  await seq('idle', null, 8);
  await seq('jab', 'jab', 12);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) TSM_GAME.step(1 / 30); });
  await seq('cross', 'cross', 16);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) TSM_GAME.step(1 / 30); });
  await seq('upper', 'upper', 16);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) TSM_GAME.step(1 / 30); TSM_GAME.input.held.add('right'); });
  await seq('walk', null, 12);
  await page.evaluate(() => { TSM_GAME.input.held.delete('right'); TSM_GAME.input.held.add('down'); });
  await seq('strafe', null, 12);
  await page.evaluate(() => { TSM_GAME.input.held.delete('down'); for (let i = 0; i < 10; i++) TSM_GAME.step(1 / 30); });
  await page.evaluate(() => { TSM_GAME.input.pressed.add('jump'); TSM_GAME.step(1 / 30); TSM_GAME.step(1 / 30); TSM_GAME.step(1 / 30); TSM_GAME.input.pressed.add('cross'); });
  await seq('fly', null, 20);
  // Oscar pega a Muslera: ver la reacción
  await page.evaluate(() => { const s = TSM_GAME.sim; s.p.hp = 100; s.o.setState('cross'); s.o.move = s.o.moves.cross; s.o.hitDone = false; });
  await seq('hit', null, 16);
  console.log(errors.length ? errors.join('\n') : 'sin errores');
  await browser.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
