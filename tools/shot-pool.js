
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = '/tmp/claude-0/-home-user-JUEGO-TSM/5bd36043-0abc-52c3-84c0-56401295a617/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.route('**/three.min.js', r => r.fulfill({ path: OUT + '/../three.min.js', contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve('index.html')); await page.waitForTimeout(800);
  await page.click('#btn-fight'); await page.evaluate(() => { TSM_GAME.intro.t = 99; });
  await page.waitForFunction(() => TSM_GAME.screen === 'fight' && TSM_GAME.sim.phase === 'fight', null, { timeout: 60000 });
  await page.evaluate(() => { TSM_GAME.sim.roundT = 0.2; });
  await page.waitForFunction(() => !document.getElementById('ov-break').hidden, null, { timeout: 60000 });
  await page.click('#btn-pool');
  for (const ph of [0.1, 0.35, 0.5, 0.72, 0.9]) { await page.waitForFunction((ph) => TSM_GAME.screen !== 'pool' || TSM_GAME.pool.t / 7.2 > ph, ph, { timeout: 60000 }); await page.screenshot({ path: OUT + '/pool-' + ph + '.png' }); }
  await page.waitForFunction(() => TSM_GAME.screen === 'fight', null, { timeout: 60000 }); await page.waitForTimeout(900); await page.screenshot({ path: OUT + '/pool-after.png' });
  console.log(errors.length ? errors.join('\n') : 'sin errores');
  await browser.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
