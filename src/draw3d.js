/* ============================================================
   TSM · render 3D con three.js (r128)
   Escenario 360° (carpa, público, seto, casa, árbol, piscina),
   luchadores low-poly con cara pintada en textura y animación
   procedural (TSM_ANIM). Unidades: metros. Suelo en y = 0.
   ============================================================ */
(function (root) {
  'use strict';
  const D = root.TSM_DRAW;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  let THREE;

  const R3 = { ready: false, renderer: null, scene: null, camera: null, rigs: {}, anims: {}, crowd: [], w: 1, h: 1, cam: { yaw: Math.PI / 2, dist: 7, fx: 4.8, fy: 1.1, fz: 0.4, zoom: 1 }, lights: {}, faceCache: {}, pool: null };

  // ----------------------------------------------------------- materiales y utilidades
  function toon(color, opts) { return new THREE.MeshToonMaterial(Object.assign({ color }, opts || {})); }
  function lam(color, opts) { return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {})); }
  const Y_AXIS = () => new THREE.Vector3(0, 1, 0);
  function canvasTex(size, paint, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    if (repeatX) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY || repeatX); }
    t.anisotropy = 4; return t;
  }
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  let outlineMat = null;
  function addOutline(mesh, k) {
    if (!outlineMat) outlineMat = new THREE.MeshBasicMaterial({ color: '#1a0c08', side: THREE.BackSide });
    const o = new THREE.Mesh(mesh.geometry, outlineMat); o.scale.setScalar(k || 1.07); o.castShadow = false; o.receiveShadow = false; mesh.add(o); return o;
  }
  function outlineTree(obj, k) { obj.traverse(m => { if (m.isMesh && m.material !== outlineMat && !m.userData.noOutline) addOutline(m, k); }); }
  function makeBone(r0, r1, mat, parent) {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 12, 1); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
  }
  function setBone(m, a, b) {
    m.position.copy(a);
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length() || 0.001;
    m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(Y_AXIS(), d.multiplyScalar(1 / len));
  }
  function sphere(r, mat, parent, seg) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, seg ? Math.max(6, seg - 4) : 9), mat); m.castShadow = true; parent.add(m); return m; }
  function box(w, h, d, mat, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  let glowTex = null;
  function glow(color, size, x, y, z, parent) {
    if (!glowTex) glowTex = canvasTex(128, (ctx, S) => { const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    sp.scale.set(size, size, 1); sp.position.set(x, y, z); (parent || R3.scene).add(sp); return sp;
  }
  // IK de dos huesos en 3D con vector "polo" para orientar el codo/rodilla
  const _ik = { d: null, p: null, dn: null, tmp: null };
  function ik3(S, T, l1, l2, pole, out) {
    if (!_ik.d) { _ik.d = new THREE.Vector3(); _ik.p = new THREE.Vector3(); _ik.dn = new THREE.Vector3(); _ik.tmp = new THREE.Vector3(); }
    const d = _ik.d.subVectors(T, S); let L = d.length();
    const maxL = l1 + l2 - 0.005, minL = Math.abs(l1 - l2) + 0.005;
    if (L > maxL) { d.multiplyScalar(maxL / L); L = maxL; } else if (L < minL) { d.multiplyScalar(minL / (L || 0.001)); L = minL; }
    const dn = _ik.dn.copy(d).normalize();
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const p = _ik.p.copy(pole).sub(_ik.tmp.copy(dn).multiplyScalar(pole.dot(dn)));
    if (p.length() < 0.05) { const sz = pole.z >= 0 ? 1 : -1; p.set(0.3, 0, sz).sub(_ik.tmp.copy(dn).multiplyScalar(dn.x * 0.3 + dn.z * sz)); }
    p.normalize();
    out.e.copy(S).addScaledVector(dn, a).addScaledVector(p, h);
    out.t.copy(S).add(d);
    return out;
  }

  // ----------------------------------------------------------- texturas procedurales
  function grassTexture(rep) {
    return canvasTex(512, (ctx, S) => {
      const R = rng(11); ctx.fillStyle = '#2a6f28'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 9000; i++) { const x = R() * S, y = R() * S; ctx.strokeStyle = R() < 0.5 ? `rgba(${90 + R() * 80},${190 + R() * 50},${70 + R() * 50},0.5)` : `rgba(0,${30 + R() * 40},0,0.45)`; ctx.lineWidth = 1 + R(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 5); ctx.stroke(); }
    }, rep || 10, rep || 10);
  }
  function panelTexture() {
    return canvasTex(256, (ctx, S) => {
      const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#efe3c4'); g.addColorStop(0.5, '#f8eed6'); g.addColorStop(1, '#e4d4b0');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(120,100,60,0.16)'; for (let y = 4; y < S; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    }, 1, 2);
  }
  function stoneTexture() {
    return canvasTex(512, (ctx, S) => {
      const R = rng(5); ctx.fillStyle = '#7d6a4c'; ctx.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 26) for (let x = ((y / 26) % 2) * 30; x < S; x += 60) { ctx.fillStyle = `rgb(${110 + R() * 40},${92 + R() * 36},${64 + R() * 30})`; ctx.fillRect(x + 2, y + 2, 56, 22); }
      ctx.save(); ctx.translate(S / 2, S * 0.4); ctx.rotate(-0.04); ctx.font = 'bold 150px "Anton", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(20,10,30,0.6)'; ctx.strokeText('KLK', 0, 0); ctx.fillStyle = 'rgba(236,147,192,0.85)'; ctx.fillText('KLK', 0, 0);
      ctx.font = 'bold 40px "Barlow Condensed", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('TODOS SOMOS MUSLERA', 0, 100); ctx.restore();
    });
  }
  function hedgeTexture() {
    return canvasTex(512, (ctx, S) => {
      const R = rng(9); ctx.fillStyle = '#0d2410'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) { const x = R() * S, y = R() * S; ctx.fillStyle = `rgb(${20 + R() * 60},${60 + R() * 110},${25 + R() * 45})`; ctx.beginPath(); ctx.ellipse(x, y, 5 + R() * 7, 4 + R() * 5, R() * 3, 0, Math.PI * 2); ctx.fill(); }
    }, 2, 2);
  }
  function foliageTexture() {
    return canvasTex(256, (ctx, S) => {
      const R = rng(4); ctx.fillStyle = '#2f5a24'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S; ctx.fillStyle = `rgb(${40 + R() * 50},${100 + R() * 90},${35 + R() * 40})`; ctx.beginPath(); ctx.ellipse(x, y, 6 + R() * 8, 4 + R() * 6, R() * 3, 0, Math.PI * 2); ctx.fill(); }
    }, 2, 2);
  }
  function houseTexture() {
    return canvasTex(256, (ctx, S) => {
      const R = rng(2); ctx.fillStyle = '#cfb58c'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 1500; i++) { ctx.fillStyle = `rgba(${80 + R() * 60},${60 + R() * 50},${30 + R() * 30},${0.05 + R() * 0.12})`; ctx.fillRect(R() * S, R() * S, 2 + R() * 4, 2 + R() * 4); }
    }, 3, 3);
  }
  function waterTexture() {
    return canvasTex(256, (ctx, S) => {
      const R = rng(8); ctx.fillStyle = '#1f9ad0'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(210,245,255,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 90; i++) { const x = R() * S, y = R() * S, w = 10 + R() * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 3, x + w, y); ctx.stroke(); }
    }, 4, 3);
  }
  function tileTexture() {
    return canvasTex(256, (ctx, S) => {
      ctx.fillStyle = '#cdbb96'; ctx.fillRect(0, 0, S, S); ctx.strokeStyle = 'rgba(80,60,40,0.35)'; ctx.lineWidth = 3;
      for (let i = 0; i <= S; i += S / 2) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke(); }
    }, 8, 8);
  }
  function poolTileTexture() {
    return canvasTex(256, (ctx, S) => {
      ctx.fillStyle = '#9fd6e8'; ctx.fillRect(0, 0, S, S); ctx.strokeStyle = '#6fb6cf'; ctx.lineWidth = 3;
      for (let i = 0; i <= S; i += S / 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke(); }
      const R = rng(17); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4;
      for (let i = 0; i < 14; i++) { const x = R() * S, y = R() * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 30, y - 20, x + 60, y + 20, x + 90, y); ctx.stroke(); }
    }, 6, 4);
  }
  function animateWater(t) {
    const w = R3.water; if (!w) return;
    const pos = w.geometry.attributes.position, base = R3.waterBase;
    for (let i = 0; i < pos.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pos.array[i * 3 + 1] = 0.028 * Math.sin(x * 2.6 + t * 1.8) + 0.02 * Math.sin(z * 3.4 - t * 2.3 + x) + 0.012 * Math.sin((x + z) * 5 + t * 3.1); }
    pos.needsUpdate = true; w.geometry.computeVertexNormals();
    w.material.map.offset.set(t * 0.012, Math.sin(t * 0.4) * 0.01);
  }
  let shadowTex = null;
  function faceTexture(key, face, wet) {
    const k = key + '|' + face + '|' + (wet ? 1 : 0);
    if (!R3.faceCache[k]) R3.faceCache[k] = canvasTex(256, (ctx) => D.paintFaceTexture(ctx, key, face, { wet }));
    return R3.faceCache[k];
  }
  function simpleFaceTexture(p) {
    const k = 'crowd|' + p.hair + '|' + p.beard + '|' + p.skin;
    if (!R3.faceCache[k]) R3.faceCache[k] = canvasTex(128, (ctx, S) => {
      ctx.fillStyle = p.skin; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#1c1410'; ctx.fillRect(0, 0, S, p.hair === 'buzz' ? S * 0.3 : S * 0.36); ctx.fillRect(0, 0, S * 0.25, S * 0.5); ctx.fillRect(S * 0.75, 0, S * 0.25, S * 0.5);
      if (p.beard) { ctx.fillStyle = 'rgba(40,25,15,0.85)'; ctx.beginPath(); ctx.ellipse(S / 2, S * 0.72, S * 0.2, S * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#1a1a1a'; for (const ex of [S * 0.43, S * 0.57]) { ctx.beginPath(); ctx.arc(ex, S * 0.5, S * 0.025, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(S * 0.45, S * 0.64, S * 0.1, S * 0.015);
    });
    return R3.faceCache[k];
  }

  // ----------------------------------------------------------- luchador 3D
  class Rig {
    constructor(key) {
      const C = D.CHARS[key]; const B = root.TSM_ANIM.BODY[key];
      this.key = key; this.C = C; this.B = B;
      const g = this.group = new THREE.Group(); g.rotation.order = 'YXZ';
      this.skin = toon(new THREE.Color(C.skin).multiplyScalar(0.9)); this.skinDark = toon(new THREE.Color(C.skinDark).multiplyScalar(0.9));
      const black = toon(C.gloveDark);
      const legR = B.belly ? 0.105 : 0.09;
      this.thighF = makeBone(legR, legR * 0.85, this.skin, g); this.shinF = makeBone(legR * 0.85, legR * 0.7, this.skin, g);
      this.thighB = makeBone(legR, legR * 0.85, this.skinDark, g); this.shinB = makeBone(legR * 0.85, legR * 0.7, this.skinDark, g);
      this.kneeF = sphere(legR * 0.9, this.skin, g); this.kneeB = sphere(legR * 0.9, this.skinDark, g);
      this.footF = sphere(0.1, this.skin, g); this.footF.scale.set(1.7, 0.5, 0.9);
      this.footB = sphere(0.1, this.skinDark, g); this.footB.scale.set(1.7, 0.5, 0.9);
      this.hipGroup = new THREE.Group(); g.add(this.hipGroup);
      const sw = B.belly ? 0.27 : 0.23;
      const shorts = new THREE.Mesh(new THREE.CylinderGeometry(sw, sw * 0.98, B.belly ? 0.5 : 0.42, 14, 1), toon(C.shorts)); shorts.scale.z = 0.78; shorts.position.y = -(B.belly ? 0.2 : 0.17); shorts.castShadow = true; this.hipGroup.add(shorts);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(sw * 1.03, sw * 1.03, 0.07, 14, 1), toon(C.band)); band.scale.z = 0.78; band.position.y = 0.04; this.hipGroup.add(band);
      // torso (pivote en la cadera)
      this.torso = new THREE.Group(); this.torso.rotation.order = 'YXZ'; g.add(this.torso);
      const pts = [];
      const prof = B.belly
        ? [[0.2, 0], [0.27, 0.14], [0.3, 0.3], [0.28, 0.46], [0.3, 0.58], [0.24, 0.68], [0.1, 0.72]]
        : [[0.17, 0], [0.19, 0.16], [0.22, 0.32], [0.26, 0.5], [0.28, 0.6], [0.2, 0.68], [0.09, 0.72]];
      for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
      const torsoMesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), this.skin); torsoMesh.scale.z = 0.72; torsoMesh.castShadow = true; this.torso.add(torsoMesh); this.torsoMesh = torsoMesh;
      this.shoulderF = sphere(0.1, this.skinDark, this.torso); this.shoulderN = sphere(0.1, this.skin, this.torso);
      const armR = B.belly ? 0.09 : 0.08;
      this.upperF = makeBone(armR, armR * 0.9, this.skinDark, this.torso); this.foreF = makeBone(armR * 0.9, armR * 0.8, this.skinDark, this.torso); this.elbowF = sphere(armR * 0.9, this.skinDark, this.torso);
      this.upperN = makeBone(armR, armR * 0.9, this.skin, this.torso); this.foreN = makeBone(armR * 0.9, armR * 0.8, this.skin, this.torso); this.elbowN = sphere(armR * 0.9, this.skin, this.torso);
      this.gloveF = this.makeGlove(C, black); this.gloveN = this.makeGlove(C, black);
      // cabeza
      this.head = new THREE.Group(); this.head.rotation.order = 'YXZ'; this.torso.add(this.head);
      const hr = this.hr = B.headR;
      this.faceMat = new THREE.MeshToonMaterial({ map: faceTexture(key, 'normal', false) });
      this.headMesh = sphere(hr, this.faceMat, this.head, 22); this.headMesh.scale.set(0.98, 1.06, 0.95);
      const hairMat = this.hairMat = toon(C.hair);
      if (C.hairStyle === 'wavy') {
        const back = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.1, 18, 12, Math.PI * 1.42, Math.PI * 1.16, 0, Math.PI * 0.74), hairMat); back.castShadow = true; this.head.add(back);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.08, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), hairMat); cap.position.y = 0.02; this.head.add(cap);
        this.hairCap = cap; this.hairBack = back;
        // flequillo: mechones que cuelgan sobre la frente, separados para que se vea la cara
        for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; const lock = new THREE.Mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(hr * 0.1, hr * 0.42, 3, 6) : new THREE.CylinderGeometry(hr * 0.1, hr * 0.06, hr * 0.5, 6), hairMat); lock.position.set(hr * 0.86 * Math.cos(a), hr * 0.55, hr * 0.86 * Math.sin(a)); lock.rotation.z = 0.25 + Math.abs(a) * 0.1; lock.rotation.x = -a * 0.5; this.head.add(lock); }
        // melena que cae por la nuca
        const mane = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.75, 12, 8), hairMat); mane.position.set(-hr * 0.55, -hr * 0.45, 0); mane.scale.set(0.8, 1.1, 1.3); this.head.add(mane);
      } else {
        const back = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 18, 12, Math.PI * 1.4, Math.PI * 1.2, 0, Math.PI * 0.56), hairMat); this.head.add(back);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat); this.head.add(cap);
        const quiff = box(hr * 0.5, hr * 0.32, hr * 0.9, hairMat, this.head); quiff.position.set(hr * 0.55, hr * 0.98, 0); quiff.rotation.z = -0.5;
      }
      const nose = sphere(hr * 0.17, this.skin, this.head, 8); nose.position.set(hr * 0.95, -hr * 0.05, 0); nose.scale.set(1.1, 0.9, 0.8);
      for (const s of [-1, 1]) { const ear = sphere(hr * 0.22, this.skin, this.head, 8); ear.position.set(-hr * 0.05, 0, s * hr * 0.95); ear.scale.set(0.6, 1, 0.5); }
      this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.18, 10), this.skin); this.torso.add(this.neck);
      // medallas y toalla (entrada)
      this.medals = new THREE.Group(); this.torso.add(this.medals);
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.012), lam('#c62828')); rib.position.set(0.22, 0.52 - i * 0.03, (i - 1) * 0.05); rib.rotation.z = 0.15; rib.userData.noOutline = true; this.medals.add(rib);
        const rib2 = rib.clone(); rib2.rotation.z = -0.15; this.medals.add(rib2);
        const med = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), lam('#f2c230', { emissive: '#4a3a00' })); med.rotation.z = Math.PI / 2; med.position.set(0.25, 0.34 - i * 0.04, (i - 1) * 0.05); med.userData.noOutline = true; this.medals.add(med);
      }
      this.towel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.05), lam('#f3efe6')); this.towel.position.set(-0.05, 0.42, -0.2); this.towel.rotation.z = 0.15; this.towel.userData.noOutline = true; this.torso.add(this.towel);
      this.medals.visible = false; this.towel.visible = false;
      this.lastFace = '';
      outlineTree(g, 1.07);
      // sombra de contacto (sprite en el suelo)
      if (!shadowTex) shadowTex = canvasTex(128, (ctx, S) => { const g2 = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g2.addColorStop(0, 'rgba(0,0,0,0.55)'); g2.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, S, S); });
      this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.01;
      this.v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), pole: new THREE.Vector3(), ik: { e: new THREE.Vector3(), t: new THREE.Vector3() }, q: new THREE.Quaternion(), X: new THREE.Vector3(1, 0, 0) };
      // estela del guante (fantasmas que se desvanecen) y flash al encajar
      this.trail = []; const trailMat = new THREE.MeshBasicMaterial({ color: C.glove, transparent: true, opacity: 0.35, depthWrite: false });
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(C.gloveR * 0.0105, 10, 8), trailMat.clone()); m.visible = false; m.userData.noOutline = true; this.trail.push(m); }
      this.trailGroup = new THREE.Group(); for (const m of this.trail) this.trailGroup.add(m);
      this.trailT = 0; this.flash = 0; this.wasHit = false;
    }
    makeGlove(C, black) {
      const g = new THREE.Group(); this.torso.add(g);
      const mat = toon(C.glove);
      const body = sphere(C.gloveR * 0.0105, mat, g, 14); body.scale.set(1.15, 1, 0.95); body.position.x = 0.03;
      const thumb = sphere(C.gloveR * 0.005, mat, g, 8); thumb.position.set(-0.02, -C.gloveR * 0.0055, C.gloveR * 0.006);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(C.gloveR * 0.0075, C.gloveR * 0.008, 0.16, 12), black); cuff.rotation.z = Math.PI / 2; cuff.position.x = -0.12; g.add(cuff);
      return g;
    }
    setFace(face, wet) {
      const k = face + (wet ? 'w' : '');
      if (k === this.lastFace) return; this.lastFace = k;
      this.faceMat.map = faceTexture(this.key, face, wet); this.faceMat.needsUpdate = true;
      this.hairMat.color.set(wet ? '#1f140a' : this.C.hair);
      if (this.hairCap) { this.hairCap.scale.y = wet ? 0.9 : 1; this.hairBack.scale.y = wet ? 0.95 : 1; }
    }
    // f: luchador del motor; C: pose suavizada (TSM_ANIM); an: animator (muelles, pasos)
    apply(f, C, an, opts) {
      const g = this.group, B = this.B, v = this.v;
      const ly = C.lying || 0;
      const fx = Math.cos(f.yaw), fz = -Math.sin(f.yaw);
      g.position.set(f.x - fx * ly * 0.42, (f.y || 0) + ly * 0.2 - (1 - ly) * C.crouch, f.z - fz * ly * 0.42);
      g.rotation.set(0, f.yaw, ly * Math.PI / 2 * 0.96);
      // --- piernas: los pies tocan el suelo (compensan el agachado)
      const groundY = (f.y || 0) > 0.02 ? 0 : C.crouch;
      const sF = an.stepF, sB = an.stepB;
      const fF = { x: sF ? sF.x : C.footFX, y: (sF ? sF.y : C.footFY) + groundY, z: -0.14 + (sF ? sF.z : 0) };
      const fB = { x: sB ? sB.x : C.footBX, y: (sB ? sB.y : C.footBY) + groundY, z: 0.14 + (sB ? sB.z : 0) };
      const hipY = B.hip;
      const legs = [[this.thighF, this.shinF, this.kneeF, this.footF, 0.07, hipY, fF, -0.13], [this.thighB, this.shinB, this.kneeB, this.footB, -0.07, hipY + 0.02, fB, 0.13]];
      for (const [th, sh, kn, ft, hx, hy, foot, z] of legs) {
        v.a.set(hx, hy, z); v.b.set(foot.x, foot.y + 0.06, foot.z);
        v.pole.set(1, 0.15, z * 0.5);
        ik3(v.a, v.b, B.thigh, B.shin, v.pole, v.ik);
        setBone(th, v.a, v.ik.e); setBone(sh, v.ik.e, v.ik.t); kn.position.copy(v.ik.e);
        ft.position.set(v.ik.t.x + 0.06, v.ik.t.y - 0.02, v.ik.t.z);
      }
      this.hipGroup.position.set(0, hipY, 0); this.hipGroup.rotation.set(0, C.twist * 0.25, -C.lean * 0.3);
      // --- torso con muelle de reacción
      const bs = an.bodySpring, hs = an.headSpring;
      this.torso.position.set(bs.x * 0.04, hipY + bs.y * 0.02, 0);
      this.torso.rotation.set(C.sway, C.twist * 0.55, -C.lean - bs.x * 0.12);
      this.torsoMesh.scale.set(1, 1 + Math.sin(an.breath + performance.now() * 0.0019) * 0.012, 0.72);
      // --- brazos: objetivos en el espacio del luchador -> espacio del torso
      const shY = B.shoulder - hipY;
      const inv = v.q.copy(this.torso.quaternion).invert();
      const halfW = B.shoulderW / 2 * 0.72;
      const arms = [
        [this.upperF, this.foreF, this.elbowF, this.gloveF, this.shoulderF, 0.08, shY + 0.02, -halfW, C.leadX, C.leadY, C.leadZ, -1],
        [this.upperN, this.foreN, this.elbowN, this.gloveN, this.shoulderN, -0.06, shY - 0.01, halfW, C.rearX, C.rearY, C.rearZ, 1],
      ];
      for (const [up, fo, el, gl, shm, sx, sy, sz, tx, ty, tz, side] of arms) {
        v.a.set(sx, sy, sz); shm.position.copy(v.a);
        v.b.set(tx, ty, tz).sub(this.torso.position).applyQuaternion(inv);
        v.pole.set(-0.2, -1, side * (0.5 + C.elbowOut * 4)).normalize();
        if (C.armsUp > 0.5) v.pole.set(0.2, 0.2, side * 1.2).normalize();
        ik3(v.a, v.b, B.upper, B.fore, v.pole, v.ik);
        setBone(up, v.a, v.ik.e); setBone(fo, v.ik.e, v.ik.t); el.position.copy(v.ik.e);
        gl.position.copy(v.ik.t);
        v.d.subVectors(v.ik.t, v.ik.e).normalize();
        gl.quaternion.setFromUnitVectors(v.X, v.d);
      }
      // --- cabeza
      const hr = this.hr;
      this.head.position.set(0.05 + C.headX + hs.x * 0.06, shY + hr + 0.1 + C.headY + hs.y * 0.05, 0);
      this.head.rotation.set(hs.y * 0.1, C.headYaw + hs.x * 0.15, -C.headTilt + hs.x * 0.45);
      this.neck.position.set(0.03, shY + 0.06, 0);
      this.medals.visible = !!(opts && opts.medals); this.towel.visible = !!(opts && opts.towel);
      let face = f.face || 'normal';
      if (face === 'normal' && C.mouth > 0.5) face = 'tired';
      if (face === 'normal' && an.blink > 0) face = 'blink';
      this.setFace(face, !!(opts && opts.wet));
      // estela del guante que golpea
      const ph = f.phase; const active = f.move && (ph === 'windup' || ph === 'active') && f.t > 0.04;
      const gl = f.move && (f.state === 'jab' ? this.gloveF : this.gloveN);
      if (active && gl) {
        this.trailT += 1;
        if (this.trailT % 2 === 0) { const m = this.trail[(this.trailT / 2) % this.trail.length | 0]; gl.getWorldPosition(m.position); m.visible = true; m.material.opacity = 0.4; m.scale.setScalar(1); }
      }
      for (const m of this.trail) if (m.visible) { m.material.opacity -= 0.045; m.scale.multiplyScalar(0.96); if (m.material.opacity <= 0) m.visible = false; }
      // flash rojo al encajar
      const hitNow = f.state === 'hit';
      if (hitNow && !this.wasHit) this.flash = 1; this.wasHit = hitNow;
      if (this.flash > 0) { this.flash = Math.max(0, this.flash - 0.12); const k = this.flash; this.skin.emissive.setRGB(k * 0.5, k * 0.08, k * 0.05); this.skinDark.emissive.setRGB(k * 0.5, k * 0.08, k * 0.05); }
      // sombra de contacto
      const h = f.y || 0; this.blob.position.set(f.x, 0.012, f.z); const bsz = (ly > 0.5 ? 1.9 : 1.0) * (1 - clamp(h, 0, 1.2) * 0.5); this.blob.scale.set(bsz, bsz, 1); this.blob.material.opacity = 1 - clamp(h, 0, 1.2) * 0.6;
    }
  }

  // ----------------------------------------------------------- público 3D
  function buildCrowdPerson(p) {
    const g = new THREE.Group(); g.position.set(p.x / 100, 0, -1.55); g.scale.setScalar(p.s * 1.02);
    const skin = toon(p.skin), shirt = toon(p.shirt), shorts = toon(p.shorts);
    const seated = p.pose === 'sit';
    const hipY = seated ? 0.5 : 0.92, shY = seated ? 1.16 : 1.58;
    if (seated) {
      const wood = lam('#7a5230');
      for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 6), wood); leg.position.set(x, 0.23, z); g.add(leg); }
      const seat = box(0.44, 0.05, 0.4, wood, g); seat.position.y = 0.47;
      const backr = box(0.4, 0.5, 0.04, wood, g); backr.position.set(0, 0.74, -0.18);
      for (const s of [-1, 1]) { const th = makeBone(0.07, 0.06, shorts, g); setBone(th, new THREE.Vector3(s * 0.08, hipY, 0), new THREE.Vector3(s * 0.1, hipY - 0.02, 0.3)); const sh = makeBone(0.06, 0.05, skin, g); setBone(sh, new THREE.Vector3(s * 0.1, hipY - 0.02, 0.3), new THREE.Vector3(s * 0.12, 0.02, 0.32)); const ft = sphere(0.06, toon(p.crocs ? '#f2d93a' : '#222'), g, 8); ft.position.set(s * 0.12, 0.03, 0.38); ft.scale.set(1, 0.5, 1.6); }
    } else {
      for (const s of [-1, 1]) { const th = makeBone(0.08, 0.07, shorts, g); setBone(th, new THREE.Vector3(s * 0.09, hipY, 0), new THREE.Vector3(s * 0.1, hipY - 0.42, 0)); const sh = makeBone(0.065, 0.055, skin, g); setBone(sh, new THREE.Vector3(s * 0.1, hipY - 0.42, 0), new THREE.Vector3(s * 0.11, 0.02, 0)); const ft = sphere(0.06, toon(p.crocs ? '#f2d93a' : '#222'), g, 8); ft.position.set(s * 0.11, 0.03, 0.05); ft.scale.set(1, 0.5, 1.6); }
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, shY - hipY + 0.08, 12), shirt); torso.scale.z = 0.7; torso.position.y = (shY + hipY) / 2; torso.castShadow = true; g.add(torso);
    if (p.extra === 'kanji') { const t = canvasTex(64, (ctx, S) => { ctx.fillStyle = p.shirt; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#d8d8d8'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.fillText('超源', S / 2, S * 0.6); }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshLambertMaterial({ map: t, transparent: true })); pl.position.set(0, shY - 0.22, 0.16); g.add(pl); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshToonMaterial({ map: simpleFaceTexture(p) })); head.position.y = shY + 0.22; head.rotation.y = Math.PI / 2; head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * (p.hair === 'buzz' ? 0.42 : 0.5)), toon('#1c1410')); hair.position.y = shY + 0.23; g.add(hair);
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 0.22, shY, 0); g.add(a);
      const up = makeBone(0.06, 0.055, shirt, a); const fo = makeBone(0.055, 0.05, skin, a); const hand = sphere(0.055, skin, a, 8);
      arms.push({ a, up, fo, hand, s });
    }
    if (p.extra === 'dog') { const white = toon('#f4f1ea'); const b = sphere(0.14, white, g, 10); b.position.set(0, hipY + 0.1, 0.22); b.scale.set(1.4, 0.8, 1); const h = sphere(0.09, white, g, 10); h.position.set(0.14, hipY + 0.2, 0.3); const e1 = sphere(0.035, white, g, 6); e1.position.set(0.1, hipY + 0.28, 0.26); const e2 = e1.clone(); e2.position.set(0.1, hipY + 0.28, 0.34); g.add(e2); const n = sphere(0.02, toon('#222'), g, 6); n.position.set(0.22, hipY + 0.19, 0.3); }
    if (p.extra === 'medal') { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.01), lam('#c62828')); rib.position.set(0.05, shY - 0.1, 0.16); rib.rotation.z = 0.2; g.add(rib); const rib2 = rib.clone(); rib2.position.x = -0.05; rib2.rotation.z = -0.2; g.add(rib2); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 12), lam('#e6b800', { emissive: '#3a2e00' })); m.rotation.x = Math.PI / 2; m.position.set(0, shY - 0.3, 0.17); g.add(m); }
    if (p.extra === 'beer') { const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 8), lam('#6b4a1a')); bt.position.set(0.3, shY - 0.3, 0.1); g.add(bt); }
    if (p.extra === 'phone') { const ph = box(0.08, 0.14, 0.01, lam('#9fdcff', { emissive: '#1a4a66' }), g); ph.position.set(0.05, hipY + 0.15, 0.3); ph.rotation.x = -0.6; }
    g.userData = { arms, seated, shY, hipY, p };
    return g;
  }
  function animateCrowd(t, excite, cheer) {
    for (let i = 0; i < R3.crowd.length; i++) {
      const g = R3.crowd[i], d = g.userData, ph = i * 1.7;
      g.position.y = Math.sin(t * 2.2 + ph) * 0.015 + (cheer > 0 ? Math.sin(t * 14 + ph) * cheer * 0.05 : 0);
      const up = cheer > 0.3;
      for (const arm of d.arms) {
        const s = arm.s;
        const e = up ? new THREE.Vector3(s * 0.16, 0.12, 0.05) : d.seated ? new THREE.Vector3(s * 0.08, -0.3, 0.12) : new THREE.Vector3(s * 0.06, -0.36, 0.02);
        const h = up ? new THREE.Vector3(s * 0.12, 0.44 + Math.sin(t * 12 + s + ph) * 0.04, 0.08) : d.seated ? new THREE.Vector3(s * 0.02, -0.5, 0.36) : new THREE.Vector3(s * 0.06, -0.68, 0.06);
        setBone(arm.up, new THREE.Vector3(0, 0, 0), e); setBone(arm.fo, e, h); arm.hand.position.copy(h);
      }
    }
  }

  // ----------------------------------------------------------- escenario
  function buildWorld() {
    const S = R3.scene;
    S.background = new THREE.Color('#080b16');
    S.fog = new THREE.Fog('#080b16', 16, 34);
    S.add(new THREE.HemisphereLight('#3e4c8a', '#0e2410', 0.4));
    S.add(new THREE.AmbientLight('#2a2a3a', 0.35));
    const key = new THREE.DirectionalLight('#ffd9a8', 0.7); key.position.set(3, 8, 5); key.castShadow = true;
    key.shadow.mapSize.set(R3.mobile ? 1024 : 2048, R3.mobile ? 1024 : 2048); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6; key.shadow.camera.near = 1; key.shadow.camera.far = 24; key.shadow.bias = -0.002;
    key.target.position.set(4.8, 0, 0.5); S.add(key); S.add(key.target); R3.lights.key = key;
    const rim = new THREE.DirectionalLight('#7fa0ff', 0.3); rim.position.set(-4, 5, -6); S.add(rim);
    const green = new THREE.PointLight('#7dff8a', 1.3, 6, 2); green.position.set(0.7, 2.2, -1.6); S.add(green);
    const warm = new THREE.PointLight('#ffc27a', 1.5, 7, 2); warm.position.set(8.0, 2.2, 0.2); S.add(warm);
    const inner = new THREE.PointLight('#ffe8c0', 0.6, 9, 2); inner.position.set(4.4, 1.8, -1.0); S.add(inner);
    const poolLight = new THREE.PointLight('#7fd0ff', 1.0, 9, 2); poolLight.position.set(4.8, 0.6, 5.5); S.add(poolLight);
    // césped
    // césped con un hueco para la piscina (coordenadas: x, -z)
    const gShape = new THREE.Shape(); gShape.moveTo(-15.2, -20); gShape.lineTo(24.8, -20); gShape.lineTo(24.8, 20); gShape.lineTo(-15.2, 20); gShape.closePath();
    const gHole = new THREE.Path(); gHole.moveTo(1.1, -9.05); gHole.lineTo(8.1, -9.05); gHole.lineTo(8.1, -4.05); gHole.lineTo(1.1, -4.05); gHole.closePath(); gShape.holes.push(gHole);
    const gGeo = new THREE.ShapeGeometry(gShape); gGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(gGeo, lam('#ffffff', { map: grassTexture(0.25) })); ground.receiveShadow = true; S.add(ground);
    // pavimento delante de la casa
    const pav = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), lam('#ffffff', { map: tileTexture() })); pav.rotation.x = -Math.PI / 2; pav.position.set(8.6, 0.005, -1.0); pav.receiveShadow = true; S.add(pav);
    // tapia de piedra al fondo
    const wall = box(7.0, 3.8, 0.4, lam('#ffffff', { map: stoneTexture() }), S); wall.position.set(4.4, 1.9, -3.3);
    // carpa de paneles
    const panelMat = new THREE.MeshLambertMaterial({ map: panelTexture(), emissive: '#7a6436', emissiveIntensity: 0.5 });
    const alu = lam('#c9ced4', { emissive: '#222' });
    const roof = box(6.7, 0.22, 1.3, lam('#2a2a2e'), S); roof.position.set(4.35, 2.6, -2.5);
    const roofUnder = box(6.7, 0.05, 1.3, lam('#44444c'), S); roofUnder.position.set(4.35, 2.47, -2.5);
    for (const [x0, x1] of [[1.22, 3.32], [3.38, 5.48], [5.54, 6.98]]) { const p = box(x1 - x0, 2.42, 0.06, panelMat, S); p.position.set((x0 + x1) / 2, 1.27, -2.2); }
    const door = box(0.46, 2.38, 0.3, lam('#1b1a1f'), S); door.position.set(7.23, 1.25, -2.3);
    for (const x of [1.16, 3.35, 5.51, 7.5]) { const f = box(0.1, 2.58, 0.12, alu, S); f.position.set(x, 1.29, -2.2); }
    const rail = box(6.5, 0.06, 0.12, alu, S); rail.position.set(4.35, 2.5, -2.2);
    const sill = box(6.5, 0.06, 0.12, alu, S); sill.position.set(4.35, 0.03, -2.2);
    for (const x of [2.3, 4.4, 6.2]) glow('#ffe2a8', 2.2, x, 1.3, -2.1).material.opacity = 0.35;
    // seto de hiedra a la izquierda (todo el lateral) y lámpara verde
    const hedgeMat = lam('#ffffff', { map: hedgeTexture() });
    const hedge = box(0.9, 3.7, 14, hedgeMat, S); hedge.position.set(-0.1, 1.85, 2.4);
    const hedgeBack = box(2.8, 3.7, 0.9, hedgeMat, S); hedgeBack.position.set(-0.3, 1.85, -2.8);
    const lamp = sphere(0.06, new THREE.MeshBasicMaterial({ color: '#c8ffc8' }), S, 8); lamp.position.set(0.7, 2.2, -2.3); glow('#7dff8a', 2.4, 0.7, 2.2, -2.2);
    // casa a la derecha (lateral completo) con tejado y farol
    const house = box(2.6, 3.3, 9, lam('#ffffff', { map: houseTexture() }), S); house.position.set(9.5, 1.65, 0.2);
    const roofH = box(2.9, 0.12, 9.3, lam('#8a4030'), S); roofH.position.set(9.5, 3.36, 0.2);
    for (let i = 0; i < 14; i++) { const tile = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9.3, 8, 1, false, 0, Math.PI), lam('#9a4a30')); tile.rotation.x = Math.PI / 2; tile.position.set(8.15 + i * 0.2, 3.44, 0.2); S.add(tile); }
    const hdoor = box(0.1, 1.9, 0.8, lam('#2b2520'), S); hdoor.position.set(8.18, 0.95, -0.8);
    const wl = box(0.1, 0.26, 0.14, lam('#ffe9b0', { emissive: '#ffd080', emissiveIntensity: 0.9 }), S); wl.position.set(8.17, 2.1, 0.2); glow('#ffc27a', 1.8, 8.1, 2.1, 0.2);
    const hdoor2 = box(0.1, 1.9, 0.8, lam('#2b2520'), S); hdoor2.position.set(8.18, 0.95, 2.6);
    // maceta y árbol con guirnalda
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 10), lam('#5a3b2a')); pot.position.set(7.7, 0.2, -1.7); S.add(pot);
    const plant = sphere(0.32, lam('#ffffff', { map: foliageTexture() }), S, 10); plant.position.set(7.7, 0.65, -1.7); plant.scale.set(1, 1.2, 1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.0, 8), lam('#3a2a1c')); trunk.position.set(7.8, 1.5, 3.2); S.add(trunk);
    const folMat = lam('#ffffff', { map: foliageTexture() });
    for (const [x, y, z, r] of [[7.8, 3.5, 3.2, 0.8], [7.2, 3.8, 3.0, 0.6], [8.4, 3.9, 3.3, 0.65], [7.7, 4.4, 3.1, 0.55]]) { const f = sphere(r, folMat, S, 10); f.position.set(x, y, z); }
    const bulb = new THREE.MeshBasicMaterial({ color: '#fff0b0' }); const R = rng(21);
    for (let i = 0; i < 26; i++) { const x = 7.1 + R() * 1.5, y = 2.6 + R() * 1.6, z = 2.6 + R() * 1.2; const b = sphere(0.035, bulb, S, 6); b.position.set(x, y, z); b.castShadow = false; glow('#ffd990', 0.32, x, y, z); }
    for (let i = 0; i < 18; i++) { const x = 0.6 + i * 0.45, y = 3.1 - Math.sin(i / 17 * Math.PI) * 0.5, z = 2.2; const b = sphere(0.03, bulb, S, 6); b.position.set(x, y, z); b.castShadow = false; glow('#ffd990', 0.3, x, y, z); }
    // piscina al fondo del jardín (+z)
    const coping = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.8), lam('#ffffff', { map: tileTexture() })); coping.rotation.x = -Math.PI / 2; coping.position.set(4.6, 0.012, 3.65); coping.receiveShadow = true; S.add(coping);
    const copingL = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 5.2), lam('#ffffff', { map: tileTexture() })); copingL.rotation.x = -Math.PI / 2; copingL.position.set(0.7, 0.012, 6.6); S.add(copingL);
    const copingR = copingL.clone(); copingR.position.x = 8.5; S.add(copingR);
    const edge = box(8.6, 0.1, 0.1, lam('#b5a07c'), S); edge.position.set(4.6, 0.05, 4.0);
    const poolTile = lam('#ffffff', { map: poolTileTexture() });
    const waterGeo = new THREE.PlaneGeometry(7.0, 5.0, 36, 26); waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({ color: '#3fbbe9', specular: '#e8fbff', shininess: 70, transparent: true, opacity: 0.58, map: waterTexture(), depthWrite: false });
    const water = new THREE.Mesh(waterGeo, waterMat); water.position.set(4.6, -0.05, 6.55); water.renderOrder = 2; S.add(water); R3.water = water; R3.waterBase = waterGeo.attributes.position.array.slice();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 5.0), poolTile); floor.rotation.x = -Math.PI / 2; floor.position.set(4.6, -1.5, 6.55); floor.receiveShadow = true; S.add(floor);
    for (const [x, z, w, dp] of [[4.6, 4.05, 7.0, 0.1], [4.6, 9.05, 7.0, 0.1], [1.1, 6.55, 0.1, 5.0], [8.1, 6.55, 0.1, 5.0]]) { const wb = box(w, 1.6, dp, poolTile, S); wb.position.set(x, -0.75, z); }
    const copingFar = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.8), lam('#ffffff', { map: tileTexture() })); copingFar.rotation.x = -Math.PI / 2; copingFar.position.set(4.6, 0.012, 9.45); S.add(copingFar);
    const waterline = box(7.0, 0.04, 0.03, lam('#eaf8ff', { emissive: '#8fd8ff', emissiveIntensity: 0.4 }), S); waterline.position.set(4.6, 0.0, 4.06); waterline.castShadow = false;
    const poolSpot = new THREE.PointLight('#bfefff', 1.4, 9, 2); poolSpot.position.set(4.6, 1.6, 6.5); S.add(poolSpot);
    // valla de madera al fondo (+z), lejos para que la cámara nunca la atraviese
    const fenceMat = lam('#6b4a2b');
    for (let i = 0; i < 24; i++) { const pl = box(0.16, 1.8, 0.04, fenceMat, S); pl.position.set(0.5 + i * 0.38, 0.9, 13.2); }
    const fenceRail = box(9.2, 0.08, 0.05, fenceMat, S); fenceRail.position.set(4.8, 1.5, 13.22);
    for (let i = 0; i < 16; i++) { const x = 0.6 + i * 0.56, y = 1.9 + Math.sin(i * 0.9) * 0.1; const b = sphere(0.035, bulb, S, 6); b.position.set(x, y, 13.1); b.castShadow = false; glow('#ffd990', 0.36, x, y, 13.05); }
    // estrellas y luna
    const starGeo = new THREE.BufferGeometry(); const sp = []; const R2 = rng(33);
    for (let i = 0; i < 260; i++) { const a = R2() * Math.PI * 2, r = 14 + R2() * 6; sp.push(4.8 + Math.cos(a) * r, 5 + R2() * 9, 1 + Math.sin(a) * r); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    S.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#e9edff', size: 0.07 })));
    const moon = sphere(0.3, new THREE.MeshBasicMaterial({ color: '#fff3d0' }), S, 10); moon.position.set(5.6, 8.5, -11); glow('#ffe9b8', 3.6, 5.6, 8.5, -10.9);
    // ropa tirada y chanclas
    for (const [x, z, sx, sz, c] of [[4.7, 3.0, 0.5, 0.3, '#e8e1d2'], [5.0, 3.1, 0.4, 0.25, '#5577aa'], [4.45, 3.05, 0.3, 0.2, '#d9d0c0'], [6.5, 3.0, 0.35, 0.2, '#c8c0b0'], [3.0, 3.0, 0.16, 0.08, '#222'], [3.2, 3.05, 0.16, 0.08, '#222']]) { const m = sphere(0.1, lam(c), S, 8); m.position.set(x, 0.03, z); m.scale.set(sx * 2, 0.35, sz * 2); m.castShadow = false; }
    const chair = buildChair(); chair.position.set(1.0, 0, 9.8); chair.rotation.y = 0.7; S.add(chair);
    for (const p of D.CROWD) { const g = buildCrowdPerson(p); R3.crowd.push(g); S.add(g); }
  }
  function buildChair() {
    const g = new THREE.Group(); const wood = lam('#7a5230');
    for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 6), wood); leg.position.set(x, 0.23, z); g.add(leg); }
    const seat = box(0.44, 0.05, 0.4, wood, g); seat.position.y = 0.47; const backr = box(0.4, 0.5, 0.04, wood, g); backr.position.set(0, 0.74, -0.18);
    const towel = box(0.2, 0.55, 0.06, lam('#efe6d4'), g); towel.position.set(0.08, 0.72, -0.14); towel.rotation.z = 0.1;
    return g;
  }

  // ----------------------------------------------------------- gotas de la piscina
  function buildSplash() {
    const g = new THREE.Group(); R3.scene.add(g);
    const drops = []; const dropMat = new THREE.MeshBasicMaterial({ color: '#dff6ff' });
    for (let i = 0; i < 48; i++) { const d = sphere(0.03, dropMat, g, 5); d.visible = false; d.castShadow = false; drops.push({ m: d, v: new THREE.Vector3(), t: 0 }); }
    const rings = [];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); r.rotation.x = Math.PI / 2; r.visible = false; g.add(r); rings.push(r); }
    R3.splash = { drops, rings };
  }
  function updateSplash(t, dt, hx, hz, mode) {
    const sp = R3.splash; if (!sp) return;
    for (const d of sp.drops) {
      if (d.t <= 0 && mode && Math.random() < (mode === 'shake' ? 0.25 : 0.5)) {
        d.t = 0.5 + Math.random() * 0.4; const a = Math.random() * Math.PI * 2;
        if (mode === 'shake') { d.m.position.set(hx, 1.6, hz); d.v.set(Math.cos(a) * 1.6, 1.0 + Math.random(), Math.sin(a) * 1.6); }
        else { d.m.position.set(hx + Math.cos(a) * 0.2, 0.02, hz + Math.sin(a) * 0.2); d.v.set(Math.cos(a) * 1.2, 2 + Math.random() * 1.5, Math.sin(a) * 1.2); }
        d.m.visible = true;
      }
      if (d.t > 0) { d.t -= dt; d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); if (d.t <= 0 || d.m.position.y < -0.1) { d.t = 0; d.m.visible = false; } }
    }
    sp.rings.forEach((r, i) => { const on = mode === 'under' || mode === 'splash'; r.visible = on; if (on) { const k = (t * 0.8 + i * 0.33) % 1; const s = 0.4 + k * 1.6; r.scale.set(s, s, s); r.material.opacity = 0.7 * (1 - k); r.position.set(hx, 0.0, hz); } });
  }

  // ----------------------------------------------------------- API
  R3.init = function (canvas, opts) {
    THREE = root.THREE; if (!THREE) return false;
    try {
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      R3.mobile = !!(opts && opts.mobile);
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, R3.mobile ? 1.5 : 2));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
      R3.renderer = r; R3.scene = new THREE.Scene(); R3.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
      buildWorld(); buildSplash();
      for (const key of ['muslera', 'oscar']) { R3.rigs[key] = new Rig(key); R3.anims[key] = new root.TSM_ANIM.Animator(key); R3.scene.add(R3.rigs[key].group); R3.scene.add(R3.rigs[key].blob); R3.scene.add(R3.rigs[key].trailGroup); R3.rigs[key].group.visible = R3.rigs[key].blob.visible = false; }
      R3.ready = true; return true;
    } catch (e) { console.warn('3D no disponible', e); R3.ready = false; return false; }
  };
  R3.resize = function (w, h) { if (!R3.ready) return; R3.w = w; R3.h = h; R3.renderer.setSize(w, h, false); R3.camera.aspect = w / h; R3.camera.updateProjectionMatrix(); };

  // frame: { sim, t, dt, screen, cheer, excite, intro, shake, zoom, cam:{focus:{x,y,z}, yaw, dist, height}|null, poolPose|null }
  R3.render = function (fr) {
    if (!R3.ready) return;
    const cam = R3.camera, sim = fr.sim, dt = fr.dt || 0.016;
    animateCrowd(fr.t, fr.excite, fr.cheer);
    animateWater(fr.t);
    const show = !!sim && ['fight', 'intro', 'over', 'corner', 'pool'].includes(fr.screen);
    for (const key of ['muslera', 'oscar']) {
      const rig = R3.rigs[key]; rig.group.visible = rig.blob.visible = rig.trailGroup.visible = show;
      if (!show) continue;
      const f = key === 'muslera' ? sim.p : sim.o;
      const an = R3.anims[key];
      const C = an.update(f, fr.t, dt, { entrance: fr.intro && f.state === 'walk', pool: fr.poolPose && key === 'muslera' ? fr.poolPose : null });
      rig.apply(f, C, an, { medals: fr.intro && key === 'oscar', towel: fr.intro && key === 'muslera', wet: f.fresh > 0 || (fr.poolPose && fr.poolPose.wet && key === 'muslera') });
    }
    if (fr.poolPose) updateSplash(fr.t, dt, fr.poolPose.hx, fr.poolPose.hz, fr.poolPose.splash); else updateSplash(fr.t, dt, 0, 0, null);
    // --- cámara
    const aspect = R3.w / R3.h; const tanV = Math.tan(cam.fov / 2 * Math.PI / 180), tanH = tanV * aspect;
    let fx = 4.8, fy = 1.15, fz = 0.45, yaw = Math.PI / 2, dist = 7, height = 0.9;
    if (fr.cam) { fx = fr.cam.focus.x; fy = fr.cam.focus.y; fz = fr.cam.focus.z; yaw = fr.cam.yaw; dist = fr.cam.dist; height = fr.cam.height != null ? fr.cam.height : 0.6; }
    else if (sim && show) {
      const p = sim.p, o = sim.o;
      const mx = (p.x + o.x) / 2, mz = (p.z + o.z) / 2; let dx = o.x - p.x, dz = o.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; }   // la cámara nunca pasa detrás de la carpa
      yaw = clamp(Math.atan2(nz, nx), Math.PI / 2 - 0.4, Math.PI / 2 + 0.4);   // el jardín es estrecho: vista casi frontal
      const portrait = aspect < 1;
      const need = Math.max(portrait ? 3.0 : 5.0, d + (portrait ? 1.8 : 3.4));
      const distH = (need / 2) / tanH, distV = ((portrait ? 4.2 : 4.6) / 2) / tanV;
      dist = Math.min(Math.max(distH, distV) * (fr.zoom || 1), portrait ? 8.0 : 7.0);
      fx = mx; fz = mz; fy = 1.1 + Math.max(p.y, o.y) * 0.3; height = 0.45 + dist * 0.07;
      // pegados al seto o a la casa, el encuadre se desplaza hacia el jardín
      if (mx < 2.4) fx = mx + (2.4 - mx) * 0.5; else if (mx > 6.1) fx = mx - (mx - 6.1) * 0.5;
      // el giro lateral se reduce cerca del seto o de la casa para que la cámara se quede entre ambos
      const lo = clamp((1.3 - fx) / dist, -0.39, 0.39), hi = clamp((7.2 - fx) / dist, -0.39, 0.39);
      yaw = Math.acos(clamp(Math.cos(yaw), lo, hi));
    } else { yaw = Math.PI / 2 + Math.sin(fr.t * 0.15) * 0.5; dist = 8; fx = 4.8; fz = 0.3; fy = 1.1; height = 1.4; }
    const k = fr.snap ? 1 : 1 - Math.pow(0.0008, dt);
    const c = R3.cam;
    c.yaw = lerp(c.yaw, yaw, k * 0.8); c.dist = lerp(c.dist, dist, k * 0.7); c.fx = lerp(c.fx, fx, k); c.fy = lerp(c.fy, fy, k); c.fz = lerp(c.fz, fz, k);
    const sh = (fr.shake || 0) * 0.006;
    // la cámara nunca sale del jardín: ni dentro del seto, ni dentro de la casa, ni detrás de la valla
    let cx = c.fx + Math.cos(c.yaw) * c.dist, cz = c.fz + Math.sin(c.yaw) * c.dist;
    if (!fr.cam) { cx = clamp(cx, 0.75, 7.8); cz = clamp(cz, c.fz + 2.5, 12.2); }
    cam.position.set(cx + (Math.random() - 0.5) * sh, c.fy + height + (Math.random() - 0.5) * sh, cz);
    cam.lookAt(c.fx, c.fy, c.fz);
    R3.lights.key.target.position.set(c.fx, 0, c.fz);
    R3.renderer.render(R3.scene, cam);
  };
  const _pv = { v: null };
  R3.project = function (x, y, z) {
    if (!_pv.v) _pv.v = new THREE.Vector3();
    _pv.v.set(x, y, z || 0).project(R3.camera);
    return { x: (_pv.v.x + 1) / 2 * R3.w, y: (1 - _pv.v.y) / 2 * R3.h, behind: _pv.v.z > 1 };
  };
  R3.pxPerMeter = function () { const a = R3.project(R3.cam.fx, 1, R3.cam.fz), b = R3.project(R3.cam.fx, 2, R3.cam.fz); return Math.abs(b.y - a.y); };
  // vectores de cámara en el plano XZ (para que el joystick sea relativo a la pantalla)
  R3.cameraBasis = function () { const y = R3.cam.yaw; return { rightX: Math.sin(y), rightZ: -Math.cos(y), fwdX: -Math.cos(y), fwdZ: -Math.sin(y) }; };

  root.TSM_3D = R3;
})(window);
