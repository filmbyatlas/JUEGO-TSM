// Captura pantallas del juego con Playwright: node tools/shot.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/shots';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/01-title.png' });
  await page.click('#btn-fight');
  await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/02-intro-oscar.png' });
  await page.waitForTimeout(3200); await page.screenshot({ path: OUT + '/03-intro-muslera.png' });
  await page.waitForTimeout(4200); await page.screenshot({ path: OUT + '/04-round1.png' });
  // pelear un poco: avanzar y pegar
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(350); await page.keyboard.press('KeyL'); await page.waitForTimeout(500); }
  await page.screenshot({ path: OUT + '/05-fight.png' });
  await page.keyboard.down('KeyS'); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/06-block.png' }); await page.keyboard.up('KeyS');
  // forzar fin de asalto para ver la pausa
  await page.evaluate(() => { TSM_GAME.sim.roundT = 0.2; });
  await page.waitForTimeout(3500); await page.screenshot({ path: OUT + '/07-break.png' });
  await page.click('#btn-pool');
  await page.waitForTimeout(1200); await page.screenshot({ path: OUT + '/08-pool-walk.png' });
  await page.waitForTimeout(2200); await page.screenshot({ path: OUT + '/09-pool-dunk.png' });
  await page.waitForTimeout(2300); await page.screenshot({ path: OUT + '/10-pool-shake.png' });
  await page.waitForTimeout(2500); await page.screenshot({ path: OUT + '/11-round2.png' });
  // forzar knockdown de Muslera
  await page.evaluate(() => { TSM_GAME.sim.p.hp = 1; });
  await page.waitForTimeout(4000); await page.screenshot({ path: OUT + '/12-down.png' });
  for (let i = 0; i < 30; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/13-up.png' });
  // forzar victoria del jugador
  await page.evaluate(() => { TSM_GAME.sim.o.hp = 1; TSM_GAME.sim.o.knockdowns = 2; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 10; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); }
  await page.waitForTimeout(1000); await page.screenshot({ path: OUT + '/14-win.png' });
  await page.waitForTimeout(3000); await page.screenshot({ path: OUT + '/15-results.png' });
  // móvil vertical
  const m = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await m.goto('file://' + path.resolve('index.html')); await m.waitForTimeout(1000); await m.screenshot({ path: OUT + '/16-mobile-title.png' });
  await m.tap('#btn-fight'); await m.waitForTimeout(9500); await m.screenshot({ path: OUT + '/17-mobile-fight.png' });
  await m.tap('#btn-howto').catch(() => {});
  const l = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await l.goto('file://' + path.resolve('index.html')); await l.waitForTimeout(800); await l.tap('#btn-fight'); await l.waitForTimeout(9500); await l.screenshot({ path: OUT + '/18-mobile-land.png' });
  await page.click('#btn-menu'); await page.click('#btn-howto'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/19-howto.png' });
  await page.click('.btn-back'); await page.click('#btn-belts'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/20-belts.png' });
  console.log(errors.length ? errors.join('\n') : 'sin errores de consola');
  await browser.close();
})().catch(e => { console.error('FALLO', e); process.exit(1); });
