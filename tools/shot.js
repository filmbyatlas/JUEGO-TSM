// Captura pantallas del juego con Playwright: node tools/shot.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const THREE_LOCAL = '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/three.min.js';
  const routeThree = async (pg) => { await pg.route('**/three.min.js', r => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' })); await pg.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' })); };
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await routeThree(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(1200);
  console.log('use3d =', await page.evaluate(() => TSM_GAME.use3d));
  await page.screenshot({ path: OUT + '/01-title.png' });
  const waitT = (t) => page.waitForFunction((t) => TSM_GAME.intro.t > t || TSM_GAME.screen !== 'intro', t, { timeout: 60000 });
  const waitScreen = (pg, s) => pg.waitForFunction((s) => TSM_GAME.screen === s, s, { timeout: 90000 });
  await page.click('#btn-fight');
  await waitT(1.5); await page.screenshot({ path: OUT + '/02-intro-oscar.png' });
  await waitT(4.7); await page.screenshot({ path: OUT + '/03-intro-muslera.png' });
  await waitScreen(page, 'fight'); await page.waitForTimeout(600); await page.screenshot({ path: OUT + '/04-round1.png' });
  await page.waitForFunction(() => TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 });
  // pelear un poco: avanzar y pegar
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(350); await page.keyboard.press('KeyL'); await page.waitForTimeout(500); }
  await page.screenshot({ path: OUT + '/05-fight.png' });
  await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/06-block.png' }); await page.keyboard.up('ShiftLeft');
  await page.keyboard.down('ControlLeft'); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/06b-crouch.png' }); await page.keyboard.up('ControlLeft');
  await page.keyboard.press('Space'); await page.waitForTimeout(250); await page.screenshot({ path: OUT + '/06c-jump.png' }); await page.keyboard.press('KeyK'); await page.waitForTimeout(150); await page.screenshot({ path: OUT + '/06d-fly.png' });
  await page.waitForTimeout(900); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp'); await page.screenshot({ path: OUT + '/06e-strafe.png' });
  // forzar fin de asalto para ver la pausa
  await page.evaluate(() => { TSM_GAME.sim.roundT = 0.2; });
  await page.waitForFunction(() => !document.getElementById('ov-break').hidden, null, { timeout: 60000 }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/07-break.png' });
  await page.click('#btn-pool');
  const waitPool = (ph) => page.waitForFunction((ph) => TSM_GAME.screen !== 'pool' || TSM_GAME.pool.t / 7.2 > ph, ph, { timeout: 60000 });
  await waitPool(0.15); await page.screenshot({ path: OUT + '/08-pool-walk.png' });
  await waitPool(0.5); await page.screenshot({ path: OUT + '/09-pool-dunk.png' });
  await waitPool(0.85); await page.screenshot({ path: OUT + '/10-pool-shake.png' });
  await waitScreen(page, 'fight'); await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/11-round2.png' });
  await page.waitForFunction(() => TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 });
  // forzar knockdown de Muslera
  await page.evaluate(() => { TSM_GAME.sim.p.hp = 1; });
  await page.waitForFunction(() => TSM_GAME.sim.p.state === 'down' && TSM_GAME.sim.p.count >= 1, null, { timeout: 60000 }); await page.screenshot({ path: OUT + '/12-down.png' });
  await page.waitForFunction(() => TSM_GAME.sim.p.count >= 3, null, { timeout: 60000 });
  for (let i = 0; i < 40; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(40); }
  await page.waitForFunction(() => TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/13-up.png' });
  // forzar victoria del jugador
  await page.evaluate(() => { TSM_GAME.sim.o.hp = 1; TSM_GAME.sim.o.knockdowns = 2; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 14 && (await page.evaluate(() => TSM_GAME.screen)) !== 'over'; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); }
  await waitScreen(page, 'over'); await page.waitForTimeout(700); await page.screenshot({ path: OUT + '/14-win.png' });
  await page.waitForFunction(() => !document.getElementById('ov-over').hidden, null, { timeout: 60000 }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/15-results.png' });
  // móvil vertical
  const m = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); await routeThree(m);
  await m.goto('file://' + path.resolve('index.html')); await m.waitForTimeout(1000); await m.screenshot({ path: OUT + '/16-mobile-title.png' });
  await m.tap('#btn-fight'); await waitScreen(m, 'fight'); await m.waitForTimeout(500); await m.screenshot({ path: OUT + '/17-mobile-fight.png' });
  await m.tap('#btn-howto').catch(() => {});
  const l = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); await routeThree(l);
  await l.goto('file://' + path.resolve('index.html')); await l.waitForTimeout(800); await l.tap('#btn-fight'); await waitScreen(l, 'fight'); await l.waitForTimeout(500); await l.screenshot({ path: OUT + '/18-mobile-land.png' });
  await page.click('#btn-menu'); await page.click('#btn-howto'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/19-howto.png' });
  await page.click('.btn-back'); await page.click('#btn-belts'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/20-belts.png' });
  console.log(errors.length ? errors.join('\n') : 'sin errores de consola');
  await browser.close();
})().catch(e => { console.error('FALLO', e); process.exit(1); });
