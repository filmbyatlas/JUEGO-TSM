// Comprueba que la cámara no atraviesa paredes: fuerza posiciones extremas y captura.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const enterWho = async (pg, name) => { try { if (!(await pg.$eval('#ov-who', el => el.hidden))) { await pg.fill('#who-name', name || 'Pepe'); await pg.click('#btn-who-enter'); await pg.waitForTimeout(300); } } catch (e) { } };
  for (const [tag, vp] of [['land', { width: 960, height: 540 }], ['port', { width: 390, height: 780 }]]) {
    const page = await browser.newPage({ viewport: vp });
    await page.route('**/three.min.js', r => r.fulfill({ path: OUT + '/../three.min.js', contentType: 'application/javascript' }));
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await page.goto('file://' + path.resolve('index.html')); await page.waitForTimeout(800); await enterWho(page);
    await page.click('#btn-fight'); await page.evaluate(() => { TSM_GAME.intro.t = 99; });
    await page.waitForFunction(() => TSM_GAME.screen === 'fight' && TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 });
    await page.evaluate(() => { TSM_GAME.freeze = true; const s = TSM_GAME.sim; s.ai.reactJab = 0; s.brain.cooldown = 999; s.o.profile.walk = 0; s.o.profile.back = 0; s.o.profile.strafe = 0; });
    const cases = { 'hedge': [1.0, 0.4, 2.1, 0.4], 'house': [7.5, 0.4, 6.4, 0.4], 'carpa-z': [3.0, -0.55, 3.0, 0.6], 'pool-z': [4.5, 2.65, 4.5, 1.5], 'corner': [1.0, 2.65, 2.0, 1.6], 'far': [1.0, -0.5, 7.5, 2.6] };
    for (const [name, [px, pz, ox, oz]] of Object.entries(cases)) {
      await page.evaluate(([px, pz, ox, oz]) => { const s = TSM_GAME.sim; s.p.x = px; s.p.z = pz; s.o.x = ox; s.o.z = oz; s.face(); for (let i = 0; i < 90; i++) TSM_GAME.step(1 / 30); }, [px, pz, ox, oz]);
      await page.screenshot({ path: `${OUT}/cam-${tag}-${name}.png` });
    }
    console.log(tag, errors.length ? errors.join('\n') : 'sin errores');
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
