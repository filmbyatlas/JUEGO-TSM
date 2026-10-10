/* ============================================================
   TSM · dibujo: escenario (la casa rural), público, luchadores,
   piscina y retratos. Todo procedural sobre canvas.
   ============================================================ */
(function (root) {
  'use strict';
  const W = 960, H = 540, FLOOR = 440;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;

  // generador fijo para texturas (siempre el mismo escenario)
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  const CHARS = {
    oscar: {
      skin: '#e4b48e', skinDark: '#c9956f', hair: '#1f1410', hairHi: '#3a2820', beard: '#24170f',
      glove: '#56cfcb', gloveDark: '#1c1c1e', gloveHi: '#a8ecea', shorts: '#15151a', band: '#2b4aa3',
      headR: 23, shoulderW: 54, hipW: 38, belly: 0, upper: 42, fore: 40, gloveR: 19, chestDef: 1,
      brow: 'straight', hairStyle: 'short', beardStyle: 'trim',
    },
    muslera: {
      skin: '#e8b792', skinDark: '#cf9a72', hair: '#35210f', hairHi: '#5a3a1e', beard: '#4a2f19',
      glove: '#ec93c0', gloveDark: '#2a2a2e', gloveHi: '#f7c9df', shorts: '#141416', band: '#141416',
      headR: 25, shoulderW: 62, hipW: 48, belly: 1, upper: 43, fore: 41, gloveR: 20, chestDef: 0,
      brow: 'arched', hairStyle: 'wavy', beardStyle: 'full',
    },
  };

  // ----------------------------------------------------------- helpers
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU); }
  function limb(ctx, ax, ay, bx, by, cx, cy, width, color, outline) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = width + 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
  }
  // IK de dos huesos: hombro S, objetivo T, longitudes l1,l2, lado del codo
  function ik(sx, sy, tx, ty, l1, l2, side) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 1; if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    const minD = Math.abs(l1 - l2) + 1; if (d < minD) { const k = minD / (d || 1); dx *= k; dy *= k; d = minD; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx);
    const ang = base + a * side;
    return { ex: sx + Math.cos(ang) * l1, ey: sy + Math.sin(ang) * l1, tx: sx + dx, ty: sy + dy };
  }

  // ----------------------------------------------------------- escenario
  let bgCanvas = null;
  function makeBackground() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const R = rng(7);
    // cielo
    let g = ctx.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, '#070a14'); g.addColorStop(1, '#141a30');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 200);
    ctx.fillStyle = '#e9edff';
    for (let i = 0; i < 60; i++) { const x = R() * W, y = R() * 120, s = R() * 1.4 + 0.3; ctx.globalAlpha = 0.3 + R() * 0.7; ctx.fillRect(x, y, s, s); }
    ctx.globalAlpha = 1;
    // luna/lámpara lejana
    g = ctx.createRadialGradient(560, 48, 2, 560, 48, 60); g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(0.1, 'rgba(255,230,170,0.5)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.fillRect(480, 0, 160, 120);
    // tapia de piedra beige al fondo (fotos: pared alta detrás de la carpa)
    g = ctx.createLinearGradient(0, 70, 0, 170); g.addColorStop(0, '#6b5a42'); g.addColorStop(1, '#8c775a');
    ctx.fillStyle = g; ctx.fillRect(100, 72, 680, 110);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let y = 86; y < 180; y += 14) { ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(780, y); ctx.stroke(); }
    for (let i = 0; i < 90; i++) { const x = 100 + R() * 680, y = 76 + Math.floor(R() * 7) * 14; ctx.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.1})`; ctx.fillRect(x, y, 10 + R() * 30, 12); }
    // grafiti del grupo en la tapia
    ctx.save(); ctx.translate(430, 128); ctx.rotate(-0.04); ctx.font = 'bold 44px "Anton", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,10,30,0.55)'; ctx.strokeText('KLK', 0, 0); ctx.fillStyle = 'rgba(236,147,192,0.78)'; ctx.fillText('KLK', 0, 0);
    ctx.font = 'bold 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('TODOS SOMOS MUSLERA', 0, 28); ctx.restore();
    // casa a la derecha: pared beige, tejado de teja y farol
    g = ctx.createLinearGradient(760, 0, 960, 0); g.addColorStop(0, '#d8c39a'); g.addColorStop(1, '#b89c74');
    ctx.fillStyle = g; ctx.fillRect(740, 90, 220, 330);
    ctx.fillStyle = '#9a4a30';
    for (let x = 730; x < 960; x += 18) { ell(ctx, x + 9, 92, 9, 5); ctx.fill(); }
    ctx.fillStyle = '#7a3a24'; ctx.fillRect(730, 82, 230, 8);
    ctx.fillStyle = '#5a2d1c'; ctx.fillRect(730, 96, 230, 3);
    // farol de pared
    g = ctx.createRadialGradient(905, 210, 4, 905, 210, 110); g.addColorStop(0, 'rgba(255,214,140,0.95)'); g.addColorStop(0.15, 'rgba(255,200,120,0.45)'); g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g; ctx.fillRect(790, 100, 170, 230);
    ctx.fillStyle = '#2a211c'; rr(ctx, 897, 196, 16, 26, 3); ctx.fill(); ctx.fillStyle = '#ffe9b0'; rr(ctx, 900, 200, 10, 18, 2); ctx.fill();
    // puerta de la casa (oscura)
    ctx.fillStyle = '#2b2520'; rr(ctx, 790, 250, 60, 170, 4); ctx.fill();
    ctx.fillStyle = '#3d342c'; rr(ctx, 796, 256, 48, 158, 3); ctx.fill();
    // seto de hiedra a la izquierda con lámpara verde
    ctx.fillStyle = '#0f2a12'; ctx.fillRect(0, 60, 150, 370);
    for (let i = 0; i < 900; i++) {
      const x = R() * 160, y = 60 + R() * 370; const d = Math.hypot(x - 70, y - 220);
      const lit = clamp(1 - d / 190, 0, 1);
      const gcol = `rgb(${Math.floor(20 + lit * 90)},${Math.floor(50 + lit * 150)},${Math.floor(22 + lit * 60)})`;
      ctx.fillStyle = gcol; ell(ctx, x, y, 5 + R() * 6, 4 + R() * 5, R() * 3); ctx.fill();
    }
    g = ctx.createRadialGradient(70, 220, 2, 70, 220, 90); g.addColorStop(0, 'rgba(200,255,200,0.95)'); g.addColorStop(0.1, 'rgba(120,255,140,0.35)'); g.addColorStop(1, 'rgba(60,200,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 130, 170, 180);
    // carpa / cerramiento de paneles crema con marcos de aluminio
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(110, 150, 650, 18);            // losa/techo
    ctx.fillStyle = '#4a4a50'; ctx.fillRect(110, 166, 650, 5);
    const panels = [[122, 332], [338, 548], [554, 748]];
    for (const [x0, x1] of panels) {
      g = ctx.createLinearGradient(0, 172, 0, 415); g.addColorStop(0, '#efe3c4'); g.addColorStop(0.5, '#f6ecd3'); g.addColorStop(1, '#e2d2ae');
      ctx.fillStyle = g; ctx.fillRect(x0, 172, x1 - x0, 243);
      // lamas horizontales (persianas) sutiles
      ctx.strokeStyle = 'rgba(120,100,60,0.13)'; ctx.lineWidth = 1;
      for (let y = 178; y < 412; y += 6) { ctx.beginPath(); ctx.moveTo(x0 + 4, y); ctx.lineTo(x1 - 4, y); ctx.stroke(); }
      // brillo cálido desde dentro
      g = ctx.createRadialGradient((x0 + x1) / 2, 300, 10, (x0 + x1) / 2, 300, 160); g.addColorStop(0, 'rgba(255,230,170,0.25)'); g.addColorStop(1, 'rgba(255,230,170,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, 172, x1 - x0, 243);
    }
    // puerta corredera abierta (hueco oscuro) en el panel derecho
    ctx.fillStyle = '#1b1a1f'; ctx.fillRect(700, 176, 46, 238);
    ctx.fillStyle = 'rgba(255,220,160,0.08)'; ctx.fillRect(704, 180, 38, 230);
    // marcos de aluminio
    for (const x of [116, 334, 550, 752]) {
      g = ctx.createLinearGradient(x, 0, x + 8, 0); g.addColorStop(0, '#9aa0a6'); g.addColorStop(0.4, '#e6eaee'); g.addColorStop(1, '#7f868c');
      ctx.fillStyle = g; ctx.fillRect(x - 2, 160, 10, 258);
    }
    ctx.fillStyle = '#b9bfc5'; ctx.fillRect(112, 168, 648, 5); ctx.fillRect(112, 412, 648, 6);
    ctx.fillStyle = '#8a9096'; ctx.fillRect(112, 418, 648, 2);
    // árbol con guirnalda de luces a la derecha (sobre la casa)
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(868, 300, 8, 120);
    for (let i = 0; i < 120; i++) { const x = 800 + R() * 160, y = 120 + R() * 190; ctx.fillStyle = `rgba(${40 + R() * 40},${90 + R() * 90},${30 + R() * 40},0.9)`; ell(ctx, x, y, 7 + R() * 9, 5 + R() * 7, R() * 3); ctx.fill(); }
    for (let i = 0; i < 26; i++) { const x = 790 + R() * 170, y = 130 + R() * 180; g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(0.3, 'rgba(255,220,140,0.7)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18); }
    // planta en maceta junto a la puerta
    ctx.fillStyle = '#5a3b2a'; rr(ctx, 758, 378, 34, 40, 4); ctx.fill();
    for (let i = 0; i < 40; i++) { const x = 755 + R() * 42, y = 330 + R() * 50; ctx.fillStyle = `rgb(${60 + R() * 50},${130 + R() * 80},${50 + R() * 40})`; ell(ctx, x, y, 6 + R() * 5, 4 + R() * 3, R() * 3); ctx.fill(); }
    // pavimento beige delante de la casa
    g = ctx.createLinearGradient(0, 415, 0, 470); g.addColorStop(0, '#cdbb96'); g.addColorStop(1, '#a89473');
    ctx.fillStyle = g; ctx.fillRect(740, 415, 220, 55);
    ctx.strokeStyle = 'rgba(80,60,40,0.3)'; for (let x = 740; x < 960; x += 44) { ctx.beginPath(); ctx.moveTo(x, 415); ctx.lineTo(x, 470); ctx.stroke(); }
    // césped artificial
    g = ctx.createLinearGradient(0, 415, 0, H); g.addColorStop(0, '#2f7f2c'); g.addColorStop(0.5, '#2e8a2e'); g.addColorStop(1, '#206a22');
    ctx.fillStyle = g; ctx.fillRect(0, 415, 740, H - 415); ctx.fillRect(740, 470, 220, H - 470);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 2600; i++) { const x = R() * W, y = 418 + R() * 122; if (x > 740 && y < 470) continue; ctx.strokeStyle = R() < 0.5 ? 'rgba(120,220,100,0.25)' : 'rgba(0,40,0,0.22)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 4); ctx.stroke(); }
    // luz de la lámpara verde sobre el césped y sombras ambientales
    g = ctx.createRadialGradient(80, 430, 10, 80, 430, 220); g.addColorStop(0, 'rgba(120,255,120,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 415, 400, 125);
    g = ctx.createRadialGradient(480, 440, 50, 480, 440, 520); g.addColorStop(0, 'rgba(255,235,190,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 415, W, 125);
    return c;
  }

  // objetos en primer plano (ropa tirada, silla, toalla) - delante de los luchadores
  function drawForeground(ctx) {
    // montón de ropa (camisetas) en el césped
    ctx.fillStyle = '#e8e1d2'; ell(ctx, 470, 505, 42, 14, 0.2); ctx.fill();
    ctx.fillStyle = '#5577aa'; ell(ctx, 500, 512, 34, 12, -0.3); ctx.fill();
    ctx.fillStyle = '#d9d0c0'; ell(ctx, 445, 515, 24, 9, 0.5); ctx.fill();
    ctx.fillStyle = '#c8c0b0'; ell(ctx, 650, 520, 30, 9, 0.1); ctx.fill();
    // chanclas
    ctx.fillStyle = '#222'; ell(ctx, 300, 520, 14, 6, 0.3); ctx.fill(); ell(ctx, 322, 524, 14, 6, 0.1); ctx.fill();
    // silla de madera en primer plano derecha (respaldo curvo)
    drawChair(ctx, 880, 500, 1.15, true);
  }

  function drawChair(ctx, x, y, s, towel) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-16, -40); ctx.moveTo(18, 0); ctx.lineTo(16, -40); ctx.moveTo(-12, -2); ctx.lineTo(-10, -40); ctx.moveTo(12, -2); ctx.lineTo(10, -40); ctx.stroke();
    ctx.fillStyle = '#8b5e34'; rr(ctx, -22, -46, 44, 9, 4); ctx.fill();
    ctx.strokeStyle = '#7a5130'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-18, -44); ctx.quadraticCurveTo(-22, -95, 0, -98); ctx.quadraticCurveTo(22, -95, 18, -44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -58); ctx.lineTo(12, -88); ctx.moveTo(12, -58); ctx.lineTo(-12, -88); ctx.stroke();
    if (towel) { ctx.fillStyle = '#efe6d4'; ctx.beginPath(); ctx.moveTo(-10, -96); ctx.lineTo(16, -94); ctx.lineTo(24, -40); ctx.lineTo(6, -44); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  // ----------------------------------------------------------- público
  const CROWD = [
    { x: 95, y: 418, s: 0.82, pose: 'stand', shirt: '#1a1a1d', shorts: '#2a2a2a', hair: 'short', beard: true, extra: 'medal', skin: '#e2b08a' },
    { x: 180, y: 420, s: 0.8, pose: 'sit', shirt: '#161618', shorts: '#8a8a8a', hair: 'buzz', beard: true, extra: 'dog', skin: '#dba67f' },
    { x: 262, y: 418, s: 0.78, pose: 'sit', shirt: '#121214', shorts: '#4a4a4a', hair: 'short', beard: false, extra: 'cig', skin: '#e8bb94' },
    { x: 690, y: 418, s: 0.78, pose: 'sit', shirt: '#141416', shorts: '#8b8577', hair: 'short', beard: true, extra: 'kanji', skin: '#e0ad84' },
    { x: 790, y: 420, s: 0.8, pose: 'sit', shirt: '#1b1b1e', shorts: '#555', hair: 'buzz', beard: true, extra: 'phone', skin: '#d9a57c' },
    { x: 900, y: 420, s: 0.84, pose: 'stand', shirt: '#17171a', shorts: '#f09a2a', hair: 'buzz', beard: true, extra: 'beer', skin: '#e3b28c', crocs: true },
  ];

  function drawSpectators(ctx, t, excite, cheer) {
    for (let i = 0; i < CROWD.length; i++) {
      const p = CROWD[i];
      const ph = i * 1.7;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s, p.s);
      const bob = Math.sin(t * 2.2 + ph) * 1.5 + (cheer > 0 ? Math.sin(t * 14 + ph) * cheer * 5 : 0);
      if (p.pose === 'sit') drawChair(ctx, 0, 0, 1, false);
      const seated = p.pose === 'sit';
      const hipY = seated ? -50 : -92, shY = seated ? -118 : -160;
      ctx.lineCap = 'round';
      // piernas
      ctx.strokeStyle = p.skin; ctx.lineWidth = 12;
      if (seated) {
        ctx.beginPath(); ctx.moveTo(-8, hipY); ctx.lineTo(-26, hipY + 8); ctx.lineTo(-30, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, hipY); ctx.lineTo(28, hipY + 10); ctx.lineTo(30, -4); ctx.stroke();
        ctx.strokeStyle = p.shorts; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(-8, hipY); ctx.lineTo(-24, hipY + 6); ctx.moveTo(8, hipY); ctx.lineTo(24, hipY + 8); ctx.stroke();
        ctx.fillStyle = '#222'; ell(ctx, -31, -2, 9, 4); ctx.fill(); ell(ctx, 31, -2, 9, 4); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(-9, hipY); ctx.lineTo(-11, -2); ctx.moveTo(9, hipY); ctx.lineTo(13, -2); ctx.stroke();
        ctx.strokeStyle = p.shorts; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(-9, hipY); ctx.lineTo(-10, hipY + 40); ctx.moveTo(9, hipY); ctx.lineTo(11, hipY + 40); ctx.stroke();
        ctx.fillStyle = p.crocs ? '#f2d93a' : '#222'; ell(ctx, -12, -2, 10, 5); ctx.fill(); ell(ctx, 14, -2, 10, 5); ctx.fill();
      }
      // torso (camiseta)
      ctx.fillStyle = p.shirt;
      ctx.beginPath(); ctx.moveTo(-26, shY + bob); ctx.lineTo(26, shY + bob); ctx.lineTo(22, hipY + 6); ctx.lineTo(-22, hipY + 6); ctx.closePath(); ctx.fill();
      if (p.extra === 'kanji') { ctx.fillStyle = '#d8d8d8'; ctx.font = 'bold 13px serif'; ctx.textAlign = 'center'; ctx.fillText('超', -6, shY + 30 + bob); ctx.fillText('源', 8, shY + 30 + bob); }
      if (p.extra === 'medal') { ctx.strokeStyle = '#c33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, shY + bob); ctx.lineTo(0, shY + 34 + bob); ctx.lineTo(8, shY + bob); ctx.stroke(); ctx.fillStyle = '#e6b800'; ell(ctx, 0, shY + 38 + bob, 6, 6); ctx.fill(); }
      // brazos
      const up = cheer > 0.3;
      ctx.strokeStyle = p.skin; ctx.lineWidth = 10;
      if (up) {
        ctx.beginPath(); ctx.moveTo(-24, shY + 4 + bob); ctx.lineTo(-38, shY - 20 + bob); ctx.lineTo(-30, shY - 48 + bob + Math.sin(t * 12) * 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, shY + 4 + bob); ctx.lineTo(38, shY - 20 + bob); ctx.lineTo(32, shY - 48 + bob + Math.cos(t * 12) * 4); ctx.stroke();
      } else if (seated) {
        ctx.beginPath(); ctx.moveTo(-24, shY + 4 + bob); ctx.lineTo(-30, shY + 40); ctx.lineTo(-14, hipY + 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, shY + 4 + bob); ctx.lineTo(30, shY + 40); ctx.lineTo(14, hipY + 4); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-24, shY + 4 + bob); ctx.lineTo(-30, shY + 44); ctx.lineTo(-26, shY + 80); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, shY + 4 + bob); ctx.lineTo(32, shY + 40); ctx.lineTo(22, shY + 62); ctx.stroke();
      }
      ctx.strokeStyle = p.shirt; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(-24, shY + 4 + bob); ctx.lineTo(up ? -34 : -29, shY + (up ? -10 : 22) + bob); ctx.moveTo(24, shY + 4 + bob); ctx.lineTo(up ? 34 : 29, shY + (up ? -10 : 22) + bob); ctx.stroke();
      // extras en las manos
      if (p.extra === 'dog') { ctx.fillStyle = '#f4f1ea'; ell(ctx, 0, hipY - 6, 22, 14); ctx.fill(); ell(ctx, 16, hipY - 18, 11, 10); ctx.fill(); ctx.fillStyle = '#222'; ell(ctx, 22, hipY - 19, 2, 2); ctx.fill(); ell(ctx, 26, hipY - 15, 2.5, 1.8); ctx.fill(); ctx.fillStyle = '#f4f1ea'; ell(ctx, 10, hipY - 27, 4, 6, -0.4); ctx.fill(); ell(ctx, 20, hipY - 28, 4, 6, 0.3); ctx.fill(); }
      if (p.extra === 'beer') { ctx.fillStyle = '#6b4a1a'; rr(ctx, 16, shY + 50, 10, 26, 3); ctx.fill(); ctx.fillStyle = '#c9a227'; rr(ctx, 18, shY + 46, 6, 8, 2); ctx.fill(); }
      if (p.extra === 'phone') { ctx.fillStyle = '#111'; rr(ctx, 6, hipY - 2, 12, 20, 2); ctx.fill(); ctx.fillStyle = '#bfe8ff'; rr(ctx, 8, hipY, 8, 16, 1); ctx.fill(); }
      if (p.extra === 'cig') { ctx.strokeStyle = '#eee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, hipY + 2); ctx.lineTo(-20, hipY - 6); ctx.stroke(); ctx.fillStyle = '#f80'; ell(ctx, -21, hipY - 7, 1.5, 1.5); ctx.fill(); }
      // cabeza
      const hy = shY - 22 + bob;
      ctx.fillStyle = p.skin; ell(ctx, 0, hy, 15, 17); ctx.fill();
      if (p.beard) { ctx.fillStyle = 'rgba(40,25,15,0.85)'; ctx.beginPath(); ctx.ellipse(0, hy + 7, 14, 10, 0, 0, Math.PI); ctx.fill(); }
      ctx.fillStyle = '#1c1410';
      if (p.hair === 'buzz') { ctx.beginPath(); ctx.ellipse(0, hy - 7, 15, 11, 0, Math.PI, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0, hy - 9, 16, 12, 0, Math.PI, TAU); ctx.fill(); ctx.fillRect(-16, hy - 9, 32, 5); }
      ctx.fillStyle = '#1a1a1a';
      if (cheer > 0.3 || excite > 0.7) { ell(ctx, 0, hy + 7, 5, 4); ctx.fill(); } else { ctx.fillRect(-4, hy + 7, 8, 2); }
      ell(ctx, -5, hy - 1, 2, 2); ctx.fill(); ell(ctx, 5, hy - 1, 2, 2); ctx.fill();
      ctx.restore();
    }
  }

  // ----------------------------------------------------------- luchadores
  function pose(f, t, opts) {
    const C = CHARS[f.key];
    const low = C.hairStyle === 'wavy'; // Muslera: guardia baja
    const P = {
      lean: 0, crouch: 0, twist: 0, headDx: 0, headDy: 0, headTilt: 0, lying: 0,
      lead: low ? { x: 36, y: -122 } : { x: 40, y: -188 },
      rear: low ? { x: 2, y: -112 } : { x: 18, y: -180 },
      leadSide: 1, rearSide: 1, // lado del codo (1 = codo abajo/atrás)
      footF: { x: 24, y: 0 }, footB: { x: -22, y: 0 },
      mouthOpen: 0, armsUp: false,
    };
    const s = f.state, T = f.t;
    const bobF = low ? 2.6 : 6.5, bobA = low ? 3 : 3.5;
    const bob = Math.sin(t * bobF) * bobA;
    P.crouch = 3 + bob;
    if (low) { P.lead.x += Math.sin(t * 2.3) * 4; P.rear.y += Math.cos(t * 2.1) * 3; P.lean = 0.04; }
    else { P.lead.y += Math.sin(t * 6.5) * 2; P.rear.y += Math.cos(t * 6.5) * 2; P.lean = 0.08; }
    const m = f.move;
    const slow = f.stamina < 35 ? 1 + (35 - f.stamina) / 35 * 0.45 : 1;
    switch (s) {
      case 'walk': {
        const sw = Math.sin(t * 11);
        P.footF.x = 24 + sw * 12 * f.walkDir * f.dir; P.footF.y = -Math.max(0, sw * f.walkDir * f.dir) * 6;
        P.footB.x = -22 - sw * 12 * f.walkDir * f.dir; P.footB.y = -Math.max(0, -sw * f.walkDir * f.dir) * 6;
        P.crouch = 4 + Math.abs(sw) * 3; break;
      }
      case 'jab': case 'cross': case 'upper': {
        const tN = T / slow; const w = m.windup, a = m.active, r = m.recover;
        let ph, p;
        if (tN < w) { ph = 0; p = tN / w; } else if (tN < w + a) { ph = 1; p = (tN - w) / a; } else { ph = 2; p = clamp((tN - w - a) / r, 0, 1); }
        const arm = s === 'jab' ? P.lead : P.rear;
        const g0 = { x: arm.x, y: arm.y };
        if (s === 'jab') {
          const ext = { x: 98, y: -192 };
          if (ph === 0) { arm.x = lerp(g0.x, g0.x - 8, easeOut(p)); arm.y = lerp(g0.y, -186, easeOut(p)); P.lean = 0.05; }
          else if (ph === 1) { arm.x = ext.x; arm.y = ext.y; P.lean = 0.16; P.headDx = 4; P.footF.x = 30; }
          else { arm.x = lerp(ext.x, g0.x, ease(p)); arm.y = lerp(ext.y, g0.y, ease(p)); P.lean = lerp(0.16, 0.05, p); }
          P.leadSide = -1;
        } else if (s === 'cross') {
          const ext = { x: 104, y: -190 };
          if (ph === 0) { P.twist = -0.3 * easeOut(p); arm.x = lerp(g0.x, g0.x - 10, p); arm.y = lerp(g0.y, -178, p); P.lean = -0.04; }
          else if (ph === 1) { P.twist = 1; arm.x = ext.x; arm.y = ext.y; P.lean = 0.25; P.headDx = 6; P.footB.x = -14; P.crouch += 4; }
          else { P.twist = lerp(1, 0, ease(p)); arm.x = lerp(ext.x, g0.x, ease(p)); arm.y = lerp(ext.y, g0.y, ease(p)); P.lean = lerp(0.25, 0.05, p); }
          P.rearSide = -1;
        } else {
          const dip = { x: 18, y: -98 }, top = { x: 52, y: -226 };
          if (ph === 0) { arm.x = lerp(g0.x, dip.x, easeOut(p)); arm.y = lerp(g0.y, dip.y, easeOut(p)); P.crouch += 16 * easeOut(p); P.lean = 0.2 * easeOut(p); P.twist = 0.3 * p; }
          else if (ph === 1) { arm.x = lerp(dip.x, top.x, easeOut(p)); arm.y = lerp(dip.y, top.y, easeOut(p)); P.crouch -= 4; P.lean = lerp(0.2, -0.06, p); P.twist = 0.9; P.headDy = -4; }
          else { arm.x = lerp(top.x, g0.x, ease(p)); arm.y = lerp(top.y, g0.y, ease(p)); P.twist = lerp(0.9, 0, p); P.lean = lerp(-0.06, 0.05, p); }
          P.rearSide = 1;
        }
        P.mouthOpen = ph === 1 ? 0.6 : 0.2;
        break;
      }
      case 'block': {
        const k = low ? clamp(f.blockT / Math.max(0.01, f.profile.blockStartup), 0, 1) : 1;
        P.lead = { x: lerp(P.lead.x, 52, k), y: lerp(P.lead.y, -198, k) };
        P.rear = { x: lerp(P.rear.x, 38, k), y: lerp(P.rear.y, -186, k) };
        P.leadSide = 1; P.rearSide = 1; P.crouch += 6; P.lean = 0.12; P.headDy = 4; break;
      }
      case 'dodge': {
        const k = Math.sin(clamp(T / f.profile.dodgeDur, 0, 1) * Math.PI);
        P.lean = -0.5 * k; P.crouch += 8 * k; P.headDx = -8 * k; P.headTilt = -0.2 * k; P.footB.x = -30; break;
      }
      case 'hit': {
        const k = clamp(f.stun / 0.45, 0, 1);
        const upperHit = f.lastHitBy === 'upper';
        P.lean = -0.3 * k - (upperHit ? 0.15 : 0); P.headDx = -12 * k; P.headDy = upperHit ? -10 * k : 2; P.headTilt = (upperHit ? -0.5 : -0.3) * k;
        P.lead.x -= 10 * k; P.rear.x -= 14 * k; P.lead.y += 6; P.rear.y += 8; P.crouch += 4; P.mouthOpen = 1; P.footB.x = -32; break;
      }
      case 'down': { P.lying = 1; P.mouthOpen = 0.8; P.lead = { x: 60, y: -150 }; P.rear = { x: -30, y: -165 }; P.leadSide = -1; P.rearSide = 1; P.footF = { x: 36, y: -8 }; P.footB = { x: -14, y: -4 }; break; }
      case 'rise': { const k = 1 - ease(clamp(T / 0.9, 0, 1)); P.lying = k; P.crouch += 12 * k; P.lean = 0.3 * k; P.lead = { x: lerp(P.lead.x, 60, k), y: lerp(P.lead.y, -150, k) }; break; }
      case 'taunt': {
        const k = Math.sin(t * 9) * 0.5 + 0.5;
        P.lead = { x: 56 + k * 6, y: -150 }; P.rear = { x: -44, y: -156 + k * 6 }; P.leadSide = -1; P.rearSide = -1;
        P.lean = -0.18; P.headTilt = -0.25; P.headDy = -3; P.mouthOpen = 0.9; P.crouch = 2 + Math.abs(Math.sin(t * 9)) * 6;
        P.footF.x = 30 + Math.sin(t * 9) * 8; P.footB.x = -28 - Math.sin(t * 9) * 8; break;
      }
      case 'win': {
        const k = Math.abs(Math.sin(t * 7));
        P.lead = { x: 34, y: -262 - k * 10 }; P.rear = { x: -24, y: -258 - k * 10 }; P.leadSide = -1; P.rearSide = 1; P.armsUp = true;
        P.crouch = -k * 14 + 4; P.headDy = -2; P.mouthOpen = 0.8; P.headTilt = -0.12; break;
      }
      case 'lose': { P.lean = 0.35; P.crouch += 14; P.lead = { x: 34, y: -96 }; P.rear = { x: -2, y: -90 }; P.headDy = 10; P.headTilt = 0.4; P.leadSide = -1; P.rearSide = -1; break; }
    }
    if (f.wobble > 0 && s !== 'down') { P.lean += Math.sin(t * 30) * 0.06; P.headTilt += Math.sin(t * 25) * 0.1; }
    if (opts && opts.entrance) { P.lead = low ? { x: 36, y: -120 } : { x: 28, y: -150 }; P.rear = { x: -6, y: -120 }; P.leadSide = -1; }
    return P;
  }

  function drawFighter(ctx, f, t, opts) {
    opts = opts || {};
    const C = CHARS[f.key];
    const P = pose(f, t, opts);
    const dir = f.dir;
    ctx.save();
    ctx.translate(f.x, FLOOR);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ell(ctx, 0, 2, P.lying ? 90 : 46, 9); ctx.fill();
    ctx.scale(dir, 1);
    if (P.lying > 0) { ctx.translate(-P.lying * 40, 0); ctx.rotate(-P.lying * Math.PI / 2 * 0.98); ctx.translate(0, P.lying * 18); }
    ctx.translate(0, P.crouch);
    const hipY = -112, shY = -(176 + (C.headR - 23) * 2);
    const outline = 'rgba(30,14,8,0.85)';
    const skin = opts.wet ? C.skinDark : C.skin;
    // --- piernas
    const legW = C.belly ? 20 : 17;
    const hipF = { x: 7, y: hipY }, hipB = { x: -7, y: hipY + 2 };
    const lF = ik(hipF.x, hipF.y, P.footF.x, P.footF.y - 6, 58, 56, -1);
    const lB = ik(hipB.x, hipB.y, P.footB.x, P.footB.y - 6, 58, 56, -1);
    // pierna trasera (lejana)
    limb(ctx, hipB.x, hipB.y, lB.ex, lB.ey, lB.tx, lB.ty, legW, C.skinDark, outline);
    drawFoot(ctx, lB.tx, lB.ty, C.skinDark, -1);
    // pantalón corto (muslos)
    const shortsLen = C.belly ? 0.78 : 0.68;
    ctx.save(); ctx.translate(0, 0); ctx.rotate(-P.lean * 0.25);
    ctx.fillStyle = C.shorts; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-C.hipW / 2 - 6, hipY - 10); ctx.lineTo(C.hipW / 2 + 6, hipY - 10);
    ctx.lineTo(lerp(hipF.x, lF.ex, shortsLen) + 14, lerp(hipF.y, lF.ey, shortsLen) + 4);
    ctx.lineTo(lerp(hipF.x, lF.ex, shortsLen) - 8, lerp(hipF.y, lF.ey, shortsLen) + 10);
    ctx.lineTo(lerp(hipB.x, lB.ex, shortsLen) + 8, lerp(hipB.y, lB.ey, shortsLen) + 10);
    ctx.lineTo(lerp(hipB.x, lB.ex, shortsLen) - 14, lerp(hipB.y, lB.ey, shortsLen) + 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.band; ctx.fillRect(-C.hipW / 2 - 6, hipY - 12, C.hipW + 12, 7);
    if (C.belly) { ctx.fillStyle = '#ddd'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('JOMA', 8, hipY + 18); }
    ctx.restore();
    // pierna delantera
    limb(ctx, hipF.x, hipF.y, lF.ex, lF.ey, lF.tx, lF.ty, legW, skin, outline);
    drawFoot(ctx, lF.tx, lF.ty, skin, 1);
    // --- torso (inclinado)
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(P.lean); ctx.translate(0, -hipY);
    const shWF = C.shoulderW / 2, hwF = C.hipW / 2;
    const nearShX = -8 + P.twist * 22, farShX = 10 - P.twist * 6;
    // brazo lejano (de guía / jab) detrás del torso
    const aF = ik(farShX, shY + 2, P.lead.x, P.lead.y, C.upper, C.fore, P.leadSide);
    limb(ctx, farShX, shY + 2, aF.ex, aF.ey, aF.tx, aF.ty, 15, C.skinDark, outline);
    drawGlove(ctx, aF.tx, aF.ty, aF.ex, aF.ey, C, true);
    // torso
    ctx.fillStyle = skin; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-shWF, shY + 4);
    ctx.quadraticCurveTo(0, shY - 6, shWF, shY + 4);
    if (C.belly) { ctx.quadraticCurveTo(shWF + 14, hipY - 30, hwF + 8, hipY - 6); ctx.lineTo(-hwF - 6, hipY - 6); ctx.quadraticCurveTo(-shWF - 10, hipY - 30, -shWF, shY + 4); }
    else { ctx.quadraticCurveTo(shWF - 4, hipY - 30, hwF, hipY - 6); ctx.lineTo(-hwF, hipY - 6); ctx.quadraticCurveTo(-shWF + 4, hipY - 30, -shWF, shY + 4); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // sombreado del torso
    ctx.fillStyle = 'rgba(90,40,20,0.14)';
    ctx.beginPath(); ctx.moveTo(-shWF + 2, shY + 6); ctx.quadraticCurveTo(-shWF - 4, hipY - 40, -hwF - 2, hipY - 8); ctx.lineTo(-hwF + 10, hipY - 8); ctx.quadraticCurveTo(-shWF + 8, hipY - 40, -shWF + 10, shY + 6); ctx.closePath(); ctx.fill();
    if (C.chestDef) {
      ctx.strokeStyle = 'rgba(120,60,30,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-18, shY + 26); ctx.quadraticCurveTo(-4, shY + 38, 0, shY + 22); ctx.quadraticCurveTo(4, shY + 38, 18, shY + 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, shY + 40); ctx.lineTo(0, hipY - 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, shY + 50); ctx.lineTo(10, shY + 50); ctx.moveTo(-10, shY + 62); ctx.lineTo(10, shY + 62); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(120,60,30,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, shY + 28); ctx.quadraticCurveTo(0, shY + 36, 14, shY + 28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-hwF + 2, hipY - 14); ctx.quadraticCurveTo(0, hipY - 2, hwF - 2, hipY - 14); ctx.stroke();
      ctx.fillStyle = 'rgba(60,30,15,0.25)'; for (let i = 0; i < 6; i++) { ell(ctx, -6 + i * 3 - 4, shY + 24 + (i % 2) * 3, 1.2, 1.8); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(150,70,60,0.5)'; ell(ctx, -12, shY + 30, 2.2, 1.8); ctx.fill(); ell(ctx, 12, shY + 30, 2.2, 1.8); ctx.fill();
    // toalla al hombro (entrada de Muslera)
    if (opts.towel) { ctx.fillStyle = '#f3efe6'; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-shWF - 6, shY); ctx.lineTo(-shWF + 16, shY - 4); ctx.lineTo(-shWF + 20, shY + 70); ctx.lineTo(-shWF - 4, shY + 76); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // --- cabeza
    const hx = 6 + P.headDx, hy = shY - C.headR - 8 + P.headDy;
    ctx.fillStyle = skin; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-9, shY + 6); ctx.lineTo(-8, hy + C.headR * 0.5); ctx.lineTo(10, hy + C.headR * 0.5); ctx.lineTo(12, shY + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    drawHead(ctx, f.key, hx, hy, C.headR, f.face, P, opts);
    // medallas (entrada de Oscar)
    if (opts.medals) {
      for (let i = 0; i < 3; i++) {
        const dy = i * 4, dx = (i - 1) * 7;
        ctx.lineWidth = 4; ctx.strokeStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(-14 + dx, shY + 2); ctx.lineTo(dx, shY + 46 + dy); ctx.lineTo(14 + dx, shY + 2); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-14 + dx, shY + 2); ctx.lineTo(dx, shY + 46 + dy); ctx.lineTo(14 + dx, shY + 2); ctx.stroke();
        ctx.fillStyle = '#f2c230'; ctx.strokeStyle = '#a07a10'; ctx.lineWidth = 1.5; ell(ctx, dx, shY + 52 + dy, 9, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d9a814'; ell(ctx, dx, shY + 52 + dy, 6, 6); ctx.fill();
      }
    }
    // brazo cercano (trasero / cruzado)
    const aN = ik(nearShX, shY + 6, P.rear.x, P.rear.y, C.upper, C.fore, P.rearSide);
    limb(ctx, nearShX, shY + 6, aN.ex, aN.ey, aN.tx, aN.ty, 16, skin, outline);
    drawGlove(ctx, aN.tx, aN.ty, aN.ex, aN.ey, C, false);
    ctx.restore(); // torso
    ctx.restore();
  }

  function drawFoot(ctx, x, y, color, side) {
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(30,14,8,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x + 6, y + 4, 15, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 3; i++) { ell(ctx, x + 14 + i * 2.5 - 2, y + 4 + i * 0.5, 1.6, 1.6); ctx.fill(); }
  }

  function drawGlove(ctx, x, y, ex, ey, C, far) {
    const r = C.gloveR * (far ? 0.95 : 1);
    const ang = Math.atan2(y - ey, x - ex);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // muñequera / puño negro
    ctx.fillStyle = C.gloveDark; ctx.strokeStyle = 'rgba(20,10,10,0.9)'; ctx.lineWidth = 2.5;
    rr(ctx, -r - 6, -r * 0.62, 14, r * 1.24, 4); ctx.fill(); ctx.stroke();
    // cuerpo del guante
    ctx.fillStyle = C.glove;
    ctx.beginPath(); ctx.ellipse(2, 0, r * 1.05, r * 0.92, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // pulgar
    ctx.beginPath(); ctx.ellipse(-2, r * 0.6, r * 0.5, r * 0.36, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    // brillo
    ctx.fillStyle = C.gloveHi; ctx.globalAlpha = 0.55; ell(ctx, 6, -r * 0.4, r * 0.4, r * 0.22, -0.3); ctx.fill(); ctx.globalAlpha = 1;
    // costura
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(2, 0, r * 0.8, -1.3, 1.3); ctx.stroke();
    ctx.restore();
  }

  function drawHead(ctx, key, hx, hy, r, face, P, opts) {
    const C = CHARS[key]; opts = opts || {}; P = P || { headTilt: 0, mouthOpen: 0 };
    const wet = !!opts.wet;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(P.headTilt || 0);
    const outline = 'rgba(30,14,8,0.85)';
    // pelo trasero (volumen por detrás de la cabeza) para Muslera
    if (C.hairStyle === 'wavy') {
      ctx.fillStyle = wet ? '#1f140a' : C.hair; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(-6, -2, r * 1.15, r * (wet ? 1.05 : 1.22), 0, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // oreja
    ctx.fillStyle = opts.wet ? C.skinDark : C.skin; ctx.strokeStyle = outline; ctx.lineWidth = 2;
    ell(ctx, -r * 0.82, 2, r * 0.26, r * 0.36); ctx.fill(); ctx.stroke();
    // cara
    ctx.fillStyle = opts.wet ? C.skinDark : C.skin; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 1.08, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // barba
    ctx.fillStyle = C.beard; ctx.strokeStyle = 'rgba(0,0,0,0)';
    if (C.beardStyle === 'full') {
      ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.05); ctx.quadraticCurveTo(-r * 1.0, r * 1.0, -r * 0.1, r * 1.3); ctx.quadraticCurveTo(r * 0.75, r * 1.28, r * 0.98, r * 0.42); ctx.quadraticCurveTo(r * 0.7, r * 0.5, r * 0.7, r * 0.3); ctx.quadraticCurveTo(r * 0.3, r * 0.75, -r * 0.3, r * 0.62); ctx.quadraticCurveTo(-r * 0.75, r * 0.5, -r * 0.9, -r * 0.05); ctx.closePath(); ctx.fill();
      // bigote
      ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.42); ctx.quadraticCurveTo(r * 0.5, r * 0.3, r * 0.74, r * 0.48); ctx.quadraticCurveTo(r * 0.5, r * 0.5, r * 0.2, r * 0.42); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-r * 0.88, 0); ctx.quadraticCurveTo(-r * 0.95, r * 0.95, -r * 0.1, r * 1.1); ctx.quadraticCurveTo(r * 0.7, r * 1.08, r * 0.96, r * 0.4); ctx.quadraticCurveTo(r * 0.72, r * 0.5, r * 0.66, r * 0.34); ctx.quadraticCurveTo(r * 0.3, r * 0.8, -r * 0.35, r * 0.62); ctx.quadraticCurveTo(-r * 0.7, r * 0.45, -r * 0.88, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.24, r * 0.42); ctx.quadraticCurveTo(r * 0.5, r * 0.32, r * 0.72, r * 0.46); ctx.quadraticCurveTo(r * 0.5, r * 0.48, r * 0.24, r * 0.42); ctx.fill();
    }
    // pelo
    ctx.fillStyle = wet ? '#1f140a' : C.hair; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    if (C.hairStyle === 'short') {
      ctx.beginPath(); ctx.moveTo(-r * 0.95, -r * 0.1);
      ctx.quadraticCurveTo(-r * 1.0, -r * 1.25, r * 0.1, -r * 1.22);
      ctx.quadraticCurveTo(r * 0.55, -r * 1.3, r * 0.72, -r * 1.05); // tupé hacia delante
      ctx.quadraticCurveTo(r * 0.9, -r * 0.75, r * 0.78, -r * 0.6);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.5, 0, -r * 0.58);
      ctx.quadraticCurveTo(-r * 0.5, -r * 0.58, -r * 0.75, -r * 0.3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // lados degradados
      ctx.fillStyle = 'rgba(40,25,18,0.55)'; ctx.beginPath(); ctx.moveTo(-r * 0.95, -r * 0.1); ctx.quadraticCurveTo(-r * 0.98, r * 0.25, -r * 0.86, r * 0.3); ctx.lineTo(-r * 0.75, -r * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.hairHi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 1.05); ctx.quadraticCurveTo(r * 0.1, -r * 1.12, r * 0.45, -r * 1.0); ctx.stroke();
    } else {
      // melena ondulada con flequillo
      ctx.beginPath(); ctx.moveTo(-r * 1.1, r * 0.2);
      ctx.quadraticCurveTo(-r * 1.3, -r * 1.1, -r * 0.2, -r * (wet ? 1.2 : 1.36));
      ctx.quadraticCurveTo(r * 0.6, -r * (wet ? 1.25 : 1.42), r * 0.95, -r * 0.8);
      ctx.quadraticCurveTo(r * 1.05, -r * 0.55, r * 0.9, -r * 0.42);
      // flequillo: mechones que caen sobre la frente
      ctx.quadraticCurveTo(r * 0.8, -r * 0.25, r * 0.62, -r * 0.5);
      ctx.quadraticCurveTo(r * 0.5, -r * 0.2, r * 0.3, -r * 0.55);
      ctx.quadraticCurveTo(r * 0.1, -r * 0.28, -r * 0.1, -r * 0.6);
      ctx.quadraticCurveTo(-r * 0.4, -r * 0.4, -r * 0.6, -r * 0.62);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.5, -r * 0.95, -r * 0.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = wet ? '#3a2714' : C.hairHi; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.95); ctx.quadraticCurveTo(-r * 0.2, -r * 1.2, r * 0.35, -r * 1.05); ctx.moveTo(-r * 0.5, -r * 0.75); ctx.quadraticCurveTo(0, -r * 0.95, r * 0.5, -r * 0.8); ctx.stroke();
      if (wet) { ctx.fillStyle = 'rgba(160,210,255,0.8)'; for (let i = 0; i < 4; i++) { ell(ctx, -r * 0.6 + i * r * 0.45, r * 0.9 + ((i * 13) % 7), 1.6, 3); ctx.fill(); } }
    }
    // cejas
    const browY = -r * 0.33;
    ctx.strokeStyle = '#1a100a'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    let bAng = 0, bUp = 0;
    if (face === 'angry' || face === 'normal' && C.brow === 'straight') bAng = 0.18;
    if (face === 'hit' || face === 'tired') bUp = -r * 0.1;
    if (face === 'ko') bUp = -r * 0.14;
    if (face === 'happy') bUp = -r * 0.06;
    if (face === 'angry') bAng = 0.35;
    if (C.brow === 'arched' && face === 'normal') bUp = -r * 0.03;
    ctx.beginPath(); ctx.moveTo(r * 0.12, browY + bUp + bAng * r * 0.2); ctx.lineTo(r * 0.62, browY + bUp - bAng * r * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.5, browY + bUp - bAng * r * 0.15); ctx.lineTo(-r * 0.05, browY + bUp + bAng * r * 0.25); ctx.stroke();
    // ojos
    const eyes = [[r * 0.4, -r * 0.1, r * 0.17], [-r * 0.26, -r * 0.12, r * 0.15]];
    for (const [ex, ey, er] of eyes) {
      if (face === 'ko') { ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er); ctx.moveTo(ex + er, ey - er); ctx.lineTo(ex - er, ey + er); ctx.stroke(); continue; }
      if (face === 'hit') { ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex - er, ey + er * 0.4); ctx.quadraticCurveTo(ex, ey - er * 0.6, ex + er, ey + er * 0.4); ctx.stroke(); continue; }
      if (face === 'happy') { ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex - er, ey + er * 0.3); ctx.quadraticCurveTo(ex, ey - er * 0.9, ex + er, ey + er * 0.3); ctx.stroke(); continue; }
      const open = face === 'tired' ? 0.5 : face === 'angry' ? 0.75 : 1;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.8 * open, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3b2412'; ell(ctx, ex + er * 0.25, ey, er * 0.5, er * 0.5 * open); ctx.fill();
      ctx.fillStyle = '#000'; ell(ctx, ex + er * 0.3, ey, er * 0.25, er * 0.25 * open); ctx.fill();
      ctx.fillStyle = '#fff'; ell(ctx, ex + er * 0.42, ey - er * 0.2, er * 0.1, er * 0.1); ctx.fill();
    }
    // nariz
    ctx.strokeStyle = 'rgba(90,45,25,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.05); ctx.quadraticCurveTo(r * 0.78, r * 0.2, r * 0.56, r * 0.28); ctx.stroke();
    // boca
    const mo = Math.max(P.mouthOpen || 0, face === 'hit' ? 1 : face === 'ko' ? 0.7 : face === 'tired' ? 0.5 : face === 'happy' ? 0.3 : 0);
    ctx.fillStyle = '#4a1a1a'; ctx.strokeStyle = '#2a0f0a'; ctx.lineWidth = 1.5;
    if (face === 'happy' || (face === 'normal' && mo < 0.1 && C.brow === 'arched')) {
      ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.52); ctx.quadraticCurveTo(r * 0.48, r * 0.72, r * 0.74, r * 0.5); if (face === 'happy') { ctx.quadraticCurveTo(r * 0.48, r * 0.62, r * 0.2, r * 0.52); ctx.fill(); } ctx.stroke();
    } else if (mo > 0.1) {
      ell(ctx, r * 0.46, r * 0.58, r * 0.2, r * 0.12 + mo * r * 0.2); ctx.fill(); ctx.stroke();
      if (face === 'ko') { ctx.fillStyle = '#e07090'; ell(ctx, r * 0.5, r * 0.78, r * 0.1, r * 0.16); ctx.fill(); }
      else { ctx.fillStyle = '#fff'; ctx.fillRect(r * 0.3, r * 0.5, r * 0.32, r * 0.07); }
    } else {
      ctx.beginPath(); ctx.moveTo(r * 0.22, r * 0.56); ctx.lineTo(r * 0.72, r * 0.54); ctx.stroke();
    }
    // mejillas enrojecidas / moratón
    if (face === 'hit' || face === 'tired') { ctx.fillStyle = 'rgba(220,70,70,0.25)'; ell(ctx, r * 0.55, r * 0.2, r * 0.3, r * 0.2); ctx.fill(); }
    ctx.restore();
  }

  // retrato para HUD y menús (cabeza grande, sin cuerpo)
  function drawPortrait(ctx, key, x, y, size, face, opts) {
    const C = CHARS[key]; const r = size / 2.6;
    ctx.save(); ctx.translate(x, y);
    const f = { key, face: face || 'normal' };
    // cuello y hombros
    ctx.fillStyle = C.skin; ctx.strokeStyle = 'rgba(30,14,8,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-r * 1.6, r * 2.2); ctx.quadraticCurveTo(-r * 0.5, r * 1.3, -r * 0.4, r * 1.1); ctx.lineTo(r * 0.5, r * 1.1); ctx.quadraticCurveTo(r * 0.6, r * 1.3, r * 1.7, r * 2.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    drawHead(ctx, key, 0, 0, r, f.face, { headTilt: 0, mouthOpen: 0 }, opts || {});
    ctx.restore();
  }

  // ----------------------------------------------------------- piscina (cinemática)
  function drawPoolScene(ctx, t, f, phase) {
    // phase: 0..1 progreso de la escena (caminar, agacharse, meter cabeza, salir, sacudirse)
    const R = rng(3);
    let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a14'); g.addColorStop(1, '#141a30');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // casa al fondo y luces
    ctx.fillStyle = '#b89c74'; ctx.fillRect(0, 120, W, 200);
    ctx.fillStyle = '#9a4a30'; for (let x = 0; x < W; x += 18) { ell(ctx, x + 9, 122, 9, 5); ctx.fill(); }
    for (let i = 0; i < 30; i++) { const x = (i * 97 + 20) % W, y = 150 + (i * 37) % 60; g = ctx.createRadialGradient(x, y, 0, x, y, 10); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 10, y - 10, 20, 20); }
    // borde de piedra y agua
    ctx.fillStyle = '#cdbb96'; ctx.fillRect(0, 320, W, 40);
    ctx.fillStyle = '#b5a07c'; ctx.fillRect(0, 352, W, 8);
    g = ctx.createLinearGradient(0, 360, 0, H); g.addColorStop(0, '#2aa7d6'); g.addColorStop(1, '#0b4f86');
    ctx.fillStyle = g; ctx.fillRect(0, 360, W, H - 360);
    // reflejos del agua
    ctx.strokeStyle = 'rgba(200,240,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = R() * W, y = 370 + R() * 160, w = 20 + R() * 60; const ph = Math.sin(t * 2 + i) * 6; ctx.beginPath(); ctx.moveTo(x + ph, y); ctx.quadraticCurveTo(x + w / 2 + ph, y - 4, x + w + ph, y); ctx.stroke(); }
    // Muslera: camina (0-0.25), se arrodilla (0.25-0.4), mete la cabeza (0.4-0.7), sale y se sacude (0.7-1)
    const walkK = clamp(phase / 0.25, 0, 1), kneel = clamp((phase - 0.25) / 0.15, 0, 1), dunk = clamp((phase - 0.4) / 0.1, 0, 1), under = phase > 0.42 && phase < 0.68, out = clamp((phase - 0.68) / 0.1, 0, 1), shake = phase > 0.78 ? Math.sin(t * 28) : 0;
    const x = lerp(260, 470, easeOut(walkK));
    const C = CHARS.muslera;
    ctx.save(); ctx.translate(x, 352);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ell(ctx, 0, 2, 50, 8); ctx.fill();
    const k = kneel; // 0 de pie, 1 arrodillado
    const headDip = (dunk - out) * 70; // cuánto baja la cabeza
    const lean = lerp(0, 1.1, k) + (under ? 0.3 : 0);
    // piernas
    ctx.lineCap = 'round';
    limb(ctx, -8, -110 + k * 60, -30 + k * 10, -56 + k * 40, -34, -4, 20, C.skinDark, 'rgba(30,14,8,0.85)');
    limb(ctx, 8, -110 + k * 60, 30 - k * 20, -56 + k * 36, 36, -4, 20, C.skin, 'rgba(30,14,8,0.85)');
    ctx.fillStyle = C.shorts; rr(ctx, -30, -122 + k * 60, 60, 40, 8); ctx.fill();
    // torso inclinado hacia el agua
    ctx.save(); ctx.translate(0, -108 + k * 60); ctx.rotate(lean);
    ctx.fillStyle = C.skin; ctx.strokeStyle = 'rgba(30,14,8,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-40, -40, -31, -68); ctx.quadraticCurveTo(0, -78, 31, -68); ctx.quadraticCurveTo(44, -40, 34, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    // brazos apoyados en el borde
    const armT = { x: 40 + k * 30, y: -30 + k * 50 };
    const a1 = ik(26, -62, armT.x, armT.y, 43, 41, 1), a2 = ik(-20, -58, armT.x - 24, armT.y + 6, 43, 41, 1);
    limb(ctx, -20, -58, a2.ex, a2.ey, a2.tx, a2.ty, 15, C.skinDark, 'rgba(30,14,8,0.85)'); drawGlove(ctx, a2.tx, a2.ty, a2.ex, a2.ey, C, true);
    limb(ctx, 26, -62, a1.ex, a1.ey, a1.tx, a1.ty, 16, C.skin, 'rgba(30,14,8,0.85)'); drawGlove(ctx, a1.tx, a1.ty, a1.ex, a1.ey, C, false);
    // cabeza
    ctx.save(); ctx.translate(6, -92 + headDip * 0.4); ctx.rotate(shake * 0.25);
    const face = under ? 'happy' : phase > 0.7 ? 'happy' : 'tired';
    drawHead(ctx, 'muslera', 0, 0, C.headR, face, { headTilt: 0, mouthOpen: under ? 0 : 0.3 }, { wet: phase > 0.5 });
    ctx.restore();
    ctx.restore();
    ctx.restore();
    // agua por delante (tapa la cabeza cuando está dentro) + salpicaduras
    g = ctx.createLinearGradient(0, 360, 0, H); g.addColorStop(0, 'rgba(42,167,214,0.75)'); g.addColorStop(1, 'rgba(11,79,134,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 360, W, H - 360);
    if (under || out > 0 && out < 1 || dunk > 0 && dunk < 1) {
      const cx = x + 70;
      for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(220,245,255,0.9)'; const a = i / 14 * TAU; const rad = 20 + Math.sin(t * 9 + i) * 10 + (under ? 10 : 30); ell(ctx, cx + Math.cos(a) * rad, 362 + Math.sin(a) * rad * 0.3 - (under ? 0 : 14), 4, 6); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { ell(ctx, cx, 364, 20 * i + ((t * 40) % 20), 6 * i + ((t * 12) % 6)); ctx.stroke(); }
    }
    if (under) { // burbujas
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 8; i++) { const yy = 380 - ((t * 60 + i * 23) % 60); ell(ctx, x + 60 + Math.sin(t * 5 + i) * 10 + i * 4, yy, 3, 3); ctx.fill(); }
    }
    if (phase > 0.78) { // gotas al sacudirse
      ctx.fillStyle = 'rgba(190,230,255,0.9)'; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const rad = 40 + ((t * 160 + i * 20) % 60); ell(ctx, x + 6 + Math.cos(a) * rad, 352 - 150 + Math.sin(a) * rad * 0.6, 3, 4); ctx.fill(); }
    }
  }

  // ----------------------------------------------------------- textura facial (3D)
  // Pinta una cara frontal en un lienzo cuadrado que se envuelve sobre una esfera:
  // el centro horizontal es el frente, la franja superior es el pelo.
  function paintFaceTexture(ctx, key, face, opts) {
    const C = CHARS[key]; opts = opts || {}; const wet = !!opts.wet;
    const S = ctx.canvas.width; const cx = S / 2, cy = S * 0.5;
    const skin = wet ? C.skinDark : C.skin;
    ctx.fillStyle = skin; ctx.fillRect(0, 0, S, S);
    // sombra del cuello / nuca
    ctx.fillStyle = 'rgba(120,60,30,0.18)'; ctx.fillRect(0, S * 0.86, S, S * 0.14);
    // pelo: franja superior completa + bordes laterales/traseros
    const hair = wet ? '#1f140a' : C.hair;
    ctx.fillStyle = hair;
    if (C.hairStyle === 'short') {
      ctx.fillRect(0, 0, S, S * 0.3);
      // nuca y laterales degradados (fade)
      ctx.fillStyle = 'rgba(30,20,14,0.55)'; ctx.fillRect(0, S * 0.3, S * 0.3, S * 0.18); ctx.fillRect(S * 0.7, S * 0.3, S * 0.3, S * 0.18);
      ctx.fillStyle = hair;
      // línea del pelo con tupé hacia delante
      ctx.beginPath(); ctx.moveTo(S * 0.3, S * 0.3); ctx.quadraticCurveTo(S * 0.5, S * 0.4, S * 0.7, S * 0.3); ctx.lineTo(S * 0.7, 0); ctx.lineTo(S * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.hairHi; ctx.lineWidth = S * 0.012; ctx.beginPath(); ctx.moveTo(S * 0.38, S * 0.12); ctx.quadraticCurveTo(S * 0.5, S * 0.06, S * 0.62, S * 0.12); ctx.stroke();
    } else {
      ctx.fillRect(0, 0, S, S * 0.36);
      ctx.fillRect(0, 0, S * 0.26, S * 0.72); ctx.fillRect(S * 0.74, 0, S * 0.26, S * 0.72); // melena larga por detrás y lados
      // flequillo: mechones ondulados sobre la frente
      ctx.beginPath(); ctx.moveTo(S * 0.26, S * 0.36);
      for (let i = 0; i < 6; i++) { const x0 = S * 0.26 + i * S * 0.08, x1 = x0 + S * 0.08; ctx.quadraticCurveTo(x0 + S * 0.04, S * (wet ? 0.5 : 0.46), x1, S * 0.36); }
      ctx.lineTo(S * 0.74, 0); ctx.lineTo(S * 0.26, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = wet ? '#3a2714' : C.hairHi; ctx.lineWidth = S * 0.014;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(S * (0.3 + i * 0.1), S * 0.08); ctx.quadraticCurveTo(S * (0.35 + i * 0.1), S * 0.22, S * (0.33 + i * 0.1), S * 0.4); ctx.stroke(); }
    }
    // barba
    ctx.fillStyle = C.beard;
    const full = C.beardStyle === 'full';
    ctx.beginPath();
    ctx.moveTo(S * 0.3, S * 0.5); ctx.quadraticCurveTo(S * 0.3, S * (full ? 0.84 : 0.8), S * 0.5, S * (full ? 0.86 : 0.82)); ctx.quadraticCurveTo(S * 0.7, S * (full ? 0.84 : 0.8), S * 0.7, S * 0.5);
    ctx.lineTo(S * 0.66, S * 0.5); ctx.quadraticCurveTo(S * 0.5, S * (full ? 0.66 : 0.68), S * 0.34, S * 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(S * 0.42, S * 0.6); ctx.quadraticCurveTo(S * 0.5, S * 0.56, S * 0.58, S * 0.6); ctx.quadraticCurveTo(S * 0.5, S * 0.64, S * 0.42, S * 0.6); ctx.fill(); // bigote
    // cejas
    const browY = S * 0.43; ctx.strokeStyle = '#1a100a'; ctx.lineWidth = S * 0.025; ctx.lineCap = 'round';
    let bUp = 0, bAng = C.brow === 'straight' ? 0.1 : 0;
    if (face === 'hit' || face === 'tired' || face === 'ko') bUp = -S * 0.03; if (face === 'angry') bAng = 0.3; if (face === 'happy') bUp = -S * 0.015;
    ctx.beginPath(); ctx.moveTo(S * 0.36, browY + bUp - bAng * S * 0.04); ctx.lineTo(S * 0.46, browY + bUp + bAng * S * 0.03); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S * 0.54, browY + bUp + bAng * S * 0.03); ctx.lineTo(S * 0.64, browY + bUp - bAng * S * 0.04); ctx.stroke();
    // ojos
    for (const ex of [S * 0.42, S * 0.58]) {
      const ey = S * 0.49, er = S * 0.035;
      if (face === 'ko') { ctx.strokeStyle = '#1a100a'; ctx.lineWidth = S * 0.012; ctx.beginPath(); ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er); ctx.moveTo(ex + er, ey - er); ctx.lineTo(ex - er, ey + er); ctx.stroke(); continue; }
      if (face === 'hit' || face === 'happy') { ctx.strokeStyle = '#1a100a'; ctx.lineWidth = S * 0.012; ctx.beginPath(); ctx.moveTo(ex - er, ey + er * 0.3); ctx.quadraticCurveTo(ex, ey - er * (face === 'happy' ? 1 : 0.6), ex + er, ey + er * 0.3); ctx.stroke(); continue; }
      const open = face === 'tired' ? 0.5 : face === 'angry' ? 0.75 : 1;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a100a'; ctx.lineWidth = S * 0.006; ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.8 * open, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3b2412'; ell(ctx, ex, ey, er * 0.5, er * 0.5 * open); ctx.fill(); ctx.fillStyle = '#000'; ell(ctx, ex, ey, er * 0.25, er * 0.25 * open); ctx.fill();
      ctx.fillStyle = '#fff'; ell(ctx, ex + er * 0.15, ey - er * 0.2, er * 0.1, er * 0.1); ctx.fill();
    }
    // nariz y boca
    ctx.strokeStyle = 'rgba(90,45,25,0.6)'; ctx.lineWidth = S * 0.008; ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.5); ctx.lineTo(S * 0.485, S * 0.575); ctx.quadraticCurveTo(S * 0.5, S * 0.59, S * 0.515, S * 0.575); ctx.stroke();
    const mo = face === 'hit' ? 1 : face === 'ko' ? 0.7 : face === 'tired' ? 0.5 : 0;
    ctx.fillStyle = '#4a1a1a'; ctx.strokeStyle = '#2a0f0a'; ctx.lineWidth = S * 0.006;
    if (face === 'happy') { ctx.beginPath(); ctx.moveTo(S * 0.42, S * 0.64); ctx.quadraticCurveTo(S * 0.5, S * 0.72, S * 0.58, S * 0.64); ctx.quadraticCurveTo(S * 0.5, S * 0.69, S * 0.42, S * 0.64); ctx.fill(); ctx.stroke(); }
    else if (mo > 0) { ell(ctx, S * 0.5, S * 0.66, S * 0.05, S * 0.02 + mo * S * 0.035); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(S * 0.46, S * 0.645, S * 0.08, S * 0.012); if (face === 'ko') { ctx.fillStyle = '#e07090'; ell(ctx, S * 0.5, S * 0.69, S * 0.02, S * 0.03); ctx.fill(); } }
    else { ctx.beginPath(); ctx.moveTo(S * 0.44, S * 0.655); ctx.quadraticCurveTo(S * 0.5, S * (C.brow === 'arched' ? 0.68 : 0.66), S * 0.56, S * 0.655); ctx.stroke(); }
    if (face === 'hit' || face === 'tired') { ctx.fillStyle = 'rgba(220,70,70,0.25)'; ell(ctx, S * 0.38, S * 0.56, S * 0.05, S * 0.03); ctx.fill(); ell(ctx, S * 0.62, S * 0.56, S * 0.05, S * 0.03); ctx.fill(); }
  }

  // ----------------------------------------------------------- cinturones
  const BELTS = [
    { wins: 1, name: 'Cinturón Blanco', color: '#f1f1f1', trim: '#cfcfcf', text: 'Le has ganado a Oscar. Una vez. Nadie te creerá.' },
    { wins: 3, name: 'Cinturón Amarillo', color: '#f2d33b', trim: '#b89a14', text: 'Tres victorias. Empieza a ser sospechoso.' },
    { wins: 5, name: 'Cinturón Naranja', color: '#f08a2a', trim: '#b55e10', text: 'Cinco. Oscar ya pregunta quién eres.' },
    { wins: 10, name: 'Cinturón Verde', color: '#3cb04b', trim: '#1f6f2c', text: 'Diez victorias. El pueblo se levanta.' },
    { wins: 25, name: 'Cinturón Azul', color: '#2f6fd6', trim: '#1b3f8a', text: 'Veinticinco. Muslera ya entrena en serio.' },
    { wins: 50, name: 'Cinturón Marrón', color: '#7a4a24', trim: '#4a2a12', text: 'Cincuenta. Oscar ha dejado el boxeo.' },
    { wins: 100, name: 'Cinturón Negro KLK', color: '#161616', trim: '#d4af37', text: 'Cien victorias. Todos somos Muslera. Tú eres Muslera.' },
  ];

  function drawBelt(ctx, x, y, w, belt, locked) {
    ctx.save(); ctx.translate(x, y);
    const h = w * 0.22;
    ctx.globalAlpha = locked ? 0.35 : 1;
    ctx.fillStyle = belt.color; ctx.strokeStyle = belt.trim; ctx.lineWidth = 3;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2.5); ctx.fill(); ctx.stroke();
    // placa central dorada
    ctx.fillStyle = locked ? '#777' : '#e6c04a'; ctx.strokeStyle = locked ? '#555' : '#8a6a10'; ctx.lineWidth = 2;
    ell(ctx, 0, 0, w * 0.14, h * 0.62); ctx.fill(); ctx.stroke();
    ctx.fillStyle = locked ? '#444' : '#6b4c0a'; ctx.font = `bold ${Math.round(h * 0.42)}px "Anton", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TSM', 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.25, 4); ctx.fill();
    ctx.restore();
  }

  root.TSM_DRAW = {
    W, H, FLOOR, CHARS, BELTS, CROWD, ik, pose, paintFaceTexture,
    background() { if (!bgCanvas) bgCanvas = makeBackground(); return bgCanvas; },
    drawForeground, drawSpectators, drawFighter, drawHead, drawPortrait, drawPoolScene, drawBelt, drawChair, rr, ell,
  };
})(window);
