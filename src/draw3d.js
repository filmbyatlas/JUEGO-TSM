/* ============================================================
   TSM · render 3D con three.js (r128): escenario, público,
   luchadores low-poly con cara pintada en textura, piscina.
   Unidades: 1 = 100 px lógicos del motor. Suelo en y = 0.
   ============================================================ */
(function (root) {
  'use strict';
  const U = 0.01;
  const D = root.TSM_DRAW;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  let THREE;

  const R3 = { ready: false, renderer: null, scene: null, camera: null, rigs: {}, crowd: [], pool: null, w: 1, h: 1, camTarget: { x: 4.8, dist: 7 }, lights: {}, textures: {}, faceCache: {} };

  // ----------------------------------------------------------- materiales y utilidades
  function toon(color, opts) { const m = new THREE.MeshToonMaterial(Object.assign({ color }, opts || {})); return m; }
  function lam(color, opts) { return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {})); }
  const Y_AXIS = () => new THREE.Vector3(0, 1, 0);

  function canvasTex(size, paint, repeatX, repeatY) {
    const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    if (repeatX) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY || repeatX); }
    t.anisotropy = 4; return t;
  }
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // hueso: cilindro unitario orientado entre dos puntos
  function makeBone(r0, r1, mat, parent) {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 10, 1); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
  }
  function setBone(m, a, b) {
    m.position.copy(a);
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length() || 0.001;
    m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(Y_AXIS(), d.multiplyScalar(1 / len));
  }
  let outlineMat = null;
  function addOutline(mesh, k) {
    if (!outlineMat) outlineMat = new THREE.MeshBasicMaterial({ color: '#1a0c08', side: THREE.BackSide });
    const o = new THREE.Mesh(mesh.geometry, outlineMat); o.scale.setScalar(k || 1.07); o.castShadow = false; o.receiveShadow = false; mesh.add(o); return o;
  }
  function outlineTree(obj, k) { obj.traverse(m => { if (m.isMesh && m.material !== outlineMat && !m.userData.noOutline) addOutline(m, k); }); }
  function sphere(r, mat, parent, seg) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, seg ? Math.max(6, seg - 4) : 9), mat); m.castShadow = true; parent.add(m); return m; }
  function box(w, h, d, mat, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }

  // ----------------------------------------------------------- texturas procedurales
  function grassTexture() {
    return canvasTex(512, (ctx, S) => {
      const R = rng(11);
      ctx.fillStyle = '#2a6f28'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 9000; i++) { const x = R() * S, y = R() * S; ctx.strokeStyle = R() < 0.5 ? `rgba(${90 + R() * 80},${190 + R() * 50},${70 + R() * 50},0.5)` : `rgba(0,${30 + R() * 40},0,0.45)`; ctx.lineWidth = 1 + R(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 5); ctx.stroke(); }
    }, 10, 10);
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
      // grafiti KLK
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
  let glowTex = null;
  function glow(color, size, x, y, z, parent) {
    if (!glowTex) glowTex = canvasTex(128, (ctx, S) => { const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    sp.scale.set(size, size, 1); sp.position.set(x, y, z); (parent || R3.scene).add(sp); return sp;
  }
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
      const C = D.CHARS[key]; this.key = key; this.C = C;
      const g = this.group = new THREE.Group();
      this.skin = toon(C.skin); this.skinDark = toon(C.skinDark);
      const black = toon(C.gloveDark);
      const legR = C.belly ? 0.105 : 0.09;
      // piernas
      this.thighF = makeBone(legR, legR * 0.85, this.skin, g); this.shinF = makeBone(legR * 0.85, legR * 0.7, this.skin, g);
      this.thighB = makeBone(legR, legR * 0.85, this.skinDark, g); this.shinB = makeBone(legR * 0.85, legR * 0.7, this.skinDark, g);
      this.kneeF = sphere(legR * 0.88, this.skin, g); this.kneeB = sphere(legR * 0.88, this.skinDark, g);
      this.footF = sphere(0.1, this.skin, g); this.footF.scale.set(1.6, 0.5, 0.9);
      this.footB = sphere(0.1, this.skinDark, g); this.footB.scale.set(1.6, 0.5, 0.9);
      // pantalón corto (sigue la cadera)
      this.hipGroup = new THREE.Group(); g.add(this.hipGroup);
      const shortsMat = toon(C.shorts);
      const sw = C.belly ? 0.27 : 0.23;
      const shorts = new THREE.Mesh(new THREE.CylinderGeometry(sw, sw * 0.98, C.belly ? 0.5 : 0.42, 14, 1), shortsMat); shorts.scale.z = 0.78; shorts.position.y = -(C.belly ? 0.2 : 0.17); shorts.castShadow = true; this.hipGroup.add(shorts);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(sw * 1.03, sw * 1.03, 0.07, 14, 1), toon(C.band)); band.scale.z = 0.78; band.position.y = 0.04; this.hipGroup.add(band);
      // torso (pivote en la cadera)
      this.torso = new THREE.Group(); g.add(this.torso);
      const pts = [];
      const prof = C.belly
        ? [[0.2, 0], [0.26, 0.14], [0.29, 0.3], [0.28, 0.46], [0.3, 0.58], [0.24, 0.68], [0.1, 0.72]]
        : [[0.17, 0], [0.19, 0.16], [0.22, 0.32], [0.26, 0.5], [0.28, 0.6], [0.2, 0.68], [0.09, 0.72]];
      for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
      const torsoMesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), this.skin); torsoMesh.scale.z = 0.72; torsoMesh.castShadow = true; this.torso.add(torsoMesh);
      // hombros
      this.shoulderF = sphere(0.1, this.skinDark, this.torso); this.shoulderN = sphere(0.1, this.skin, this.torso);
      // brazos
      const armR = C.belly ? 0.09 : 0.08;
      this.upperF = makeBone(armR, armR * 0.9, this.skinDark, this.torso); this.foreF = makeBone(armR * 0.9, armR * 0.8, this.skinDark, this.torso); this.elbowF = sphere(armR * 0.9, this.skinDark, this.torso);
      this.upperN = makeBone(armR, armR * 0.9, this.skin, this.torso); this.foreN = makeBone(armR * 0.9, armR * 0.8, this.skin, this.torso); this.elbowN = sphere(armR * 0.9, this.skin, this.torso);
      this.gloveF = this.makeGlove(C, black); this.gloveN = this.makeGlove(C, black);
      // cabeza
      this.head = new THREE.Group(); this.torso.add(this.head);
      const hr = this.hr = C.headR * U * 1.05;
      this.faceMat = new THREE.MeshToonMaterial({ map: faceTexture(key, 'normal', false) });
      this.headMesh = sphere(hr, this.faceMat, this.head, 20); this.headMesh.scale.set(0.98, 1.06, 0.95);
      const hairMat = this.hairMat = toon(C.hair);
      if (C.hairStyle === 'wavy') {
        const back = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.14, 18, 12, Math.PI * 1.42, Math.PI * 1.16, 0, Math.PI * 0.78), hairMat); back.castShadow = true; this.head.add(back);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), hairMat); cap.position.y = 0.02; this.head.add(cap);
        this.hairCap = cap; this.hairBack = back;
      } else {
        const back = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 18, 12, Math.PI * 1.4, Math.PI * 1.2, 0, Math.PI * 0.56), hairMat); this.head.add(back);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat); this.head.add(cap);
        const quiff = box(hr * 0.5, hr * 0.32, hr * 0.9, hairMat, this.head); quiff.position.set(hr * 0.55, hr * 0.98, 0); quiff.rotation.z = -0.5;
      }
      const nose = sphere(hr * 0.17, this.skin, this.head, 8); nose.position.set(hr * 0.95, -hr * 0.05, 0); nose.scale.set(1.1, 0.9, 0.8);
      for (const s of [-1, 1]) { const ear = sphere(hr * 0.22, this.skin, this.head, 8); ear.position.set(-hr * 0.05, 0, s * hr * 0.95); ear.scale.set(0.6, 1, 0.5); }
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 10), this.skin); this.torso.add(neck); this.neck = neck;
      // medallas (Oscar) y toalla (Muslera)
      this.medals = new THREE.Group(); this.torso.add(this.medals);
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.012), lam('#c62828')); rib.position.set(0.22, 0.52 - i * 0.03, (i - 1) * 0.05); rib.rotation.z = 0.15; this.medals.add(rib);
        const rib2 = rib.clone(); rib2.position.set(0.22, 0.52 - i * 0.03, (i - 1) * 0.05); rib2.rotation.z = -0.15; this.medals.add(rib2);
        const med = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), lam('#f2c230', { emissive: '#4a3a00' })); med.rotation.z = Math.PI / 2; med.position.set(0.25, 0.34 - i * 0.04, (i - 1) * 0.05); this.medals.add(med);
      }
      this.towel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.05), lam('#f3efe6')); this.towel.userData.noOutline = true; this.towel.position.set(-0.05, 0.42, -0.2); this.towel.rotation.z = 0.15; this.torso.add(this.towel);
      this.medals.visible = false; this.towel.visible = false;
      this.lastFace = '';
      outlineTree(g, 1.07);
      // vectores reutilizables
      this.v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
    }
    makeGlove(C, black) {
      const g = new THREE.Group(); this.torso.add(g);
      const mat = toon(C.glove);
      const body = sphere(C.gloveR * U * 1.05, mat, g, 14); body.scale.set(1.15, 1, 0.95); body.position.x = 0.03;
      const thumb = sphere(C.gloveR * U * 0.5, mat, g, 8); thumb.position.set(-0.02, -C.gloveR * U * 0.55, C.gloveR * U * 0.6);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(C.gloveR * U * 0.75, C.gloveR * U * 0.8, 0.16, 12), black); cuff.rotation.z = Math.PI / 2; cuff.position.x = -0.12; g.add(cuff);
      return g;
    }
    setFace(face, wet) {
      const k = face + (wet ? 'w' : '');
      if (k === this.lastFace) return; this.lastFace = k;
      this.faceMat.map = faceTexture(this.key, face, wet); this.faceMat.needsUpdate = true;
      this.hairMat.color.set(wet ? '#1f140a' : this.C.hair);
      if (this.hairCap) { this.hairCap.scale.y = wet ? 0.9 : 1; this.hairBack.scale.y = wet ? 0.95 : 1; }
    }
    // P: pose 2D (ver draw.js). dir: +1 mira a +x.
    apply(f, P, opts) {
      const g = this.group, C = this.C, v = this.v;
      g.position.set(f.x * U, 0, 0); g.rotation.y = f.dir > 0 ? 0 : Math.PI;
      // caída: el cuerpo gira hacia atrás hasta quedar tumbado
      const ly = P.lying || 0;
      g.rotation.z = ly * Math.PI / 2 * 0.96;
      g.position.x += -f.dir * ly * 0.42; g.position.y = ly * 0.2;
      // agachado (crouch positivo baja el cuerpo)
      const cr = -(P.crouch || 0) * U;
      const hipY = 1.12 + cr;
      // piernas (IK 2D en plano XY con la rodilla hacia delante)
      const legs = [[this.thighF, this.shinF, this.kneeF, this.footF, 0.07, hipY, P.footF, -0.13], [this.thighB, this.shinB, this.kneeB, this.footB, -0.07, hipY + 0.02, P.footB, 0.13]];
      for (const [th, sh, kn, ft, hx, hy, foot, z] of legs) {
        const r = D.ik(hx, -hy, foot.x * U, foot.y * U - 0.07, 0.58, 0.56, -1); // en coords y-abajo
        v.a.set(hx, hy, z); v.b.set(r.ex, -r.ey, z); v.c.set(r.tx, -r.ty, z);
        setBone(th, v.a, v.b); setBone(sh, v.b, v.c); kn.position.copy(v.b); ft.position.set(r.tx + 0.06, -r.ty - 0.02, z);
      }
      this.hipGroup.position.set(0, hipY, 0); this.hipGroup.rotation.z = -(P.lean || 0) * 0.3;
      // torso
      this.torso.position.set(0, hipY, 0); this.torso.rotation.z = -(P.lean || 0);
      const tw = P.twist || 0;
      const shY = 0.64 + (C.headR - 23) * 2 * U;
      const sF = v.a.set(0.1 - tw * 0.06, shY + 0.02, -0.2), sN = v.b.set(-0.08 + tw * 0.22, shY - 0.02, 0.2);
      this.shoulderF.position.copy(sF); this.shoulderN.position.copy(sN);
      // brazos: objetivos 2D relativos a los pies -> torso-local (origen cadera)
      const arms = [[this.upperF, this.foreF, this.elbowF, this.gloveF, sF.clone(), P.lead, P.leadSide, -0.2], [this.upperN, this.foreN, this.elbowN, this.gloveN, sN.clone(), P.rear, P.rearSide, 0.2]];
      for (const [up, fo, el, gl, s, tgt, side, z] of arms) {
        const r = D.ik(s.x, -s.y, tgt.x * U, tgt.y * U + 1.12, C.upper * U, C.fore * U, side);
        const e = new THREE.Vector3(r.ex, -r.ey, z), t = new THREE.Vector3(r.tx, -r.ty, z);
        setBone(up, s, e); setBone(fo, e, t); el.position.copy(e);
        gl.position.copy(t);
        const d = new THREE.Vector3().subVectors(t, e).normalize();
        gl.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
      }
      // cabeza y cuello
      const hy = shY + this.hr + 0.08 + (P.headDy || 0) * U, hx = 0.06 + (P.headDx || 0) * U;
      this.head.position.set(hx, hy, 0); this.head.rotation.z = -(P.headTilt || 0);
      this.neck.position.set(hx * 0.6, shY + 0.06, 0);
      this.medals.visible = !!(opts && opts.medals); this.towel.visible = !!(opts && opts.towel);
      let face = f.face || 'normal';
      if (face === 'normal' && (P.mouthOpen || 0) > 0.5) face = 'tired';
      this.setFace(face, !!(opts && opts.wet));
    }
  }

  // ----------------------------------------------------------- público 3D
  function buildCrowdPerson(p) {
    const g = new THREE.Group(); g.position.set(p.x * U, 0, -1.55); g.scale.setScalar(p.s * 1.02);
    const skin = toon(p.skin), shirt = toon(p.shirt), shorts = toon(p.shorts);
    const seated = p.pose === 'sit';
    const hipY = seated ? 0.5 : 0.92, shY = seated ? 1.16 : 1.58;
    if (seated) {
      // silla de madera
      const wood = lam('#7a5230');
      for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 6), wood); leg.position.set(x, 0.23, z); g.add(leg); }
      const seat = box(0.44, 0.05, 0.4, wood, g); seat.position.y = 0.47;
      const backr = box(0.4, 0.5, 0.04, wood, g); backr.position.set(0, 0.74, -0.18);
      // piernas sentadas
      for (const s of [-1, 1]) { const th = makeBone(0.07, 0.06, shorts, g); setBone(th, new THREE.Vector3(s * 0.08, hipY, 0), new THREE.Vector3(s * 0.1, hipY - 0.02, 0.3)); const sh = makeBone(0.06, 0.05, skin, g); setBone(sh, new THREE.Vector3(s * 0.1, hipY - 0.02, 0.3), new THREE.Vector3(s * 0.12, 0.02, 0.32)); const ft = sphere(0.06, toon(p.crocs ? '#f2d93a' : '#222'), g, 8); ft.position.set(s * 0.12, 0.03, 0.38); ft.scale.set(1, 0.5, 1.6); }
    } else {
      for (const s of [-1, 1]) { const th = makeBone(0.08, 0.07, shorts, g); setBone(th, new THREE.Vector3(s * 0.09, hipY, 0), new THREE.Vector3(s * 0.1, hipY - 0.42, 0)); const sh = makeBone(0.065, 0.055, skin, g); setBone(sh, new THREE.Vector3(s * 0.1, hipY - 0.42, 0), new THREE.Vector3(s * 0.11, 0.02, 0)); const ft = sphere(0.06, toon(p.crocs ? '#f2d93a' : '#222'), g, 8); ft.position.set(s * 0.11, 0.03, 0.05); ft.scale.set(1, 0.5, 1.6); }
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, shY - hipY + 0.08, 12), shirt); torso.scale.z = 0.7; torso.position.y = (shY + hipY) / 2; torso.castShadow = true; g.add(torso);
    if (p.extra === 'kanji') { const t = canvasTex(64, (ctx, S) => { ctx.fillStyle = p.shirt; ctx.fillRect(0, 0, S, S); ctx.fillStyle = '#d8d8d8'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.fillText('超源', S / 2, S * 0.6); }); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshLambertMaterial({ map: t, transparent: true })); pl.position.set(0, shY - 0.22, 0.16); g.add(pl); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshToonMaterial({ map: simpleFaceTexture(p) })); head.position.y = shY + 0.22; head.rotation.y = Math.PI / 2; head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * (p.hair === 'buzz' ? 0.42 : 0.5)), toon('#1c1410')); hair.position.y = shY + 0.23; g.add(hair);
    // brazos (se animan)
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 0.22, shY, 0); g.add(a);
      const up = makeBone(0.06, 0.055, shirt, a); const fo = makeBone(0.055, 0.05, skin, a); const hand = sphere(0.055, skin, a, 8);
      arms.push({ a, up, fo, hand, s });
    }
    // extras
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
      const bob = Math.sin(t * 2.2 + ph) * 0.015 + (cheer > 0 ? Math.sin(t * 14 + ph) * cheer * 0.05 : 0);
      g.position.y = bob;
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
    S.fog = new THREE.Fog('#080b16', 14, 30);
    // luces
    S.add(new THREE.HemisphereLight('#3e4c8a', '#0e2410', 0.4));
    S.add(new THREE.AmbientLight('#2a2a3a', 0.35));
    const key = new THREE.DirectionalLight('#ffd9a8', 0.7); key.position.set(3, 7, 5); key.castShadow = true;
    const rim = new THREE.DirectionalLight('#7fa0ff', 0.3); rim.position.set(-4, 5, -6); S.add(rim);
    key.shadow.mapSize.set(R3.mobile ? 1024 : 2048, R3.mobile ? 1024 : 2048); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -4; key.shadow.camera.near = 1; key.shadow.camera.far = 20; key.shadow.bias = -0.002;
    key.target.position.set(4.8, 0, 0); S.add(key); S.add(key.target); R3.lights.key = key;
    const green = new THREE.PointLight('#7dff8a', 1.3, 6, 2); green.position.set(0.7, 2.2, -1.6); S.add(green);
    const warm = new THREE.PointLight('#ffc27a', 1.5, 7, 2); warm.position.set(9.0, 2.2, -1.6); S.add(warm);
    const inner = new THREE.PointLight('#ffe8c0', 0.6, 9, 2); inner.position.set(4.4, 1.8, -1.0); S.add(inner);
    // suelo de césped
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), lam('#ffffff', { map: grassTexture() })); ground.rotation.x = -Math.PI / 2; ground.position.set(4.8, 0, 2); ground.receiveShadow = true; S.add(ground);
    // pavimento beige delante de la casa
    const pav = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), lam('#cdbb96')); pav.rotation.x = -Math.PI / 2; pav.position.set(8.6, 0.005, -1.0); pav.receiveShadow = true; S.add(pav);
    // tapia de piedra al fondo
    const wall = box(7.0, 3.8, 0.4, lam('#ffffff', { map: stoneTexture() }), S); wall.position.set(4.4, 1.9, -3.3);
    // carpa de paneles crema
    const panelMat = new THREE.MeshLambertMaterial({ map: panelTexture(), emissive: '#7a6436', emissiveIntensity: 0.5 });
    const alu = lam('#c9ced4', { emissive: '#222' });
    const roof = box(6.7, 0.22, 1.3, lam('#2a2a2e'), S); roof.position.set(4.35, 2.6, -2.5);
    const roofUnder = box(6.7, 0.05, 1.3, lam('#44444c'), S); roofUnder.position.set(4.35, 2.47, -2.5);
    for (const [x0, x1] of [[1.22, 3.32], [3.38, 5.48], [5.54, 6.98]]) { const p = box(x1 - x0, 2.42, 0.06, panelMat, S); p.position.set((x0 + x1) / 2, 1.21 + 0.06, -2.2); }
    const door = box(0.46, 2.38, 0.3, lam('#1b1a1f'), S); door.position.set(7.23, 1.25, -2.3);
    for (const x of [1.16, 3.35, 5.51, 7.5]) { const f = box(0.1, 2.58, 0.12, alu, S); f.position.set(x, 1.29, -2.2); }
    const rail = box(6.5, 0.06, 0.12, alu, S); rail.position.set(4.35, 2.5, -2.2);
    const sill = box(6.5, 0.06, 0.12, alu, S); sill.position.set(4.35, 0.03, -2.2);
    // seto de hiedra a la izquierda
    const hedge = box(2.8, 3.7, 0.9, lam('#ffffff', { map: hedgeTexture() }), S); hedge.position.set(-0.3, 1.85, -2.8);
    const lamp = sphere(0.06, new THREE.MeshBasicMaterial({ color: '#c8ffc8' }), S, 8); lamp.position.set(0.7, 2.2, -2.3); glow('#7dff8a', 2.4, 0.7, 2.2, -2.2);
    // casa a la derecha con tejado y farol
    const house = box(2.6, 3.3, 2.4, lam('#ffffff', { map: houseTexture() }), S); house.position.set(8.9, 1.65, -3.2);
    const roofH = box(2.9, 0.12, 2.7, lam('#8a4030'), S); roofH.position.set(8.9, 3.36, -3.2);
    for (let i = 0; i < 14; i++) { const tile = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.75, 8, 1, false, 0, Math.PI), lam('#9a4a30')); tile.rotation.x = Math.PI / 2; tile.rotation.z = 0; tile.position.set(7.55 + i * 0.2, 3.44, -3.2); tile.rotation.y = 0; S.add(tile); }
    const hdoor = box(0.6, 1.7, 0.1, lam('#2b2520'), S); hdoor.position.set(8.2, 0.85, -1.98);
    const wl = box(0.14, 0.26, 0.1, lam('#ffe9b0', { emissive: '#ffd080', emissiveIntensity: 0.9 }), S); wl.position.set(9.05, 2.1, -1.95); glow('#ffc27a', 1.8, 9.05, 2.1, -1.85);
    // maceta junto a la puerta y árbol con guirnalda
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 10), lam('#5a3b2a')); pot.position.set(7.7, 0.2, -1.7); S.add(pot);
    const plant = sphere(0.32, lam('#ffffff', { map: foliageTexture() }), S, 10); plant.position.set(7.7, 0.65, -1.7); plant.scale.set(1, 1.2, 1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.0, 8), lam('#3a2a1c')); trunk.position.set(8.7, 1.5, -1.5); S.add(trunk);
    const folMat = lam('#ffffff', { map: foliageTexture() });
    for (const [x, y, z, r] of [[8.7, 3.5, -1.5, 0.8], [8.1, 3.8, -1.7, 0.6], [9.3, 3.9, -1.4, 0.65], [8.6, 4.4, -1.6, 0.55]]) { const f = sphere(r, folMat, S, 10); f.position.set(x, y, z); }
    const bulb = new THREE.MeshBasicMaterial({ color: '#fff0b0' }); const R = rng(21);
    for (let i = 0; i < 26; i++) { const x = 8.0 + R() * 1.5, y = 2.6 + R() * 1.6, z = -2.0 + R() * 1.0; const b = sphere(0.035, bulb, S, 6); b.position.set(x, y, z); b.castShadow = false; glow('#ffd990', 0.32, x, y, z); }
    // estrellas
    const starGeo = new THREE.BufferGeometry(); const sp = []; const R2 = rng(33);
    for (let i = 0; i < 160; i++) sp.push(-10 + R2() * 30, 4 + R2() * 8, -12 - R2() * 6);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    S.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#e9edff', size: 0.06 })));
    // luna / farola lejana
    const moon = sphere(0.25, new THREE.MeshBasicMaterial({ color: '#fff3d0' }), S, 10); moon.position.set(5.6, 6.5, -9); glow('#ffe9b8', 3.2, 5.6, 6.5, -8.9);
    // luz interior cálida de la carpa (brillo difuso detrás de los paneles)
    for (const x of [2.3, 4.4, 6.2]) glow('#ffe2a8', 2.2, x, 1.3, -2.1).material.opacity = 0.35;
    // ropa tirada y chanclas en primer plano
    for (const [x, z, sx, sz, c] of [[4.7, 0.9, 0.5, 0.3, '#e8e1d2'], [5.0, 1.0, 0.4, 0.25, '#5577aa'], [4.45, 1.1, 0.3, 0.2, '#d9d0c0'], [6.5, 1.1, 0.35, 0.2, '#c8c0b0'], [3.0, 1.0, 0.16, 0.08, '#222'], [3.2, 1.05, 0.16, 0.08, '#222']]) { const m = sphere(0.1, lam(c), S, 8); m.position.set(x, 0.03, z); m.scale.set(sx * 2, 0.35, sz * 2); m.castShadow = false; }
    // silla con toalla en primer plano
    const chair = buildChair(); chair.position.set(8.9, 0, 0.9); chair.rotation.y = -0.4; S.add(chair);
    // público
    for (const p of D.CROWD) { const g = buildCrowdPerson(p); R3.crowd.push(g); S.add(g); }
  }
  function buildChair() {
    const g = new THREE.Group(); const wood = lam('#7a5230');
    for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 6), wood); leg.position.set(x, 0.23, z); g.add(leg); }
    const seat = box(0.44, 0.05, 0.4, wood, g); seat.position.y = 0.47; const backr = box(0.4, 0.5, 0.04, wood, g); backr.position.set(0, 0.74, -0.18);
    const towel = box(0.2, 0.55, 0.06, lam('#efe6d4'), g); towel.position.set(0.08, 0.72, -0.14); towel.rotation.z = 0.1;
    return g;
  }

  // ----------------------------------------------------------- piscina
  function buildPool() {
    const g = new THREE.Group(); g.position.set(40, 0, 0); R3.scene.add(g); R3.pool = g;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), lam('#cdbb96')); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -4.5); ground.receiveShadow = true; g.add(ground);
    const edge = box(30, 0.12, 0.5, lam('#b5a07c'), g); edge.position.set(0, 0.06, 0.55);
    const waterMat = new THREE.MeshLambertMaterial({ map: waterTexture(), transparent: true, opacity: 0.78, color: '#2aa7d6' });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), waterMat); water.rotation.x = -Math.PI / 2; water.position.set(0, -0.05, 5.8); g.add(water); g.userData.water = water;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), lam('#0b4f86')); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.4, 5.8); g.add(floor);
    const wallB = box(30, 1.5, 0.3, lam('#9fd0e8'), g); wallB.position.set(0, -0.7, 0.8);
    // casa al fondo con luces
    const house = box(30, 3.4, 1, lam('#ffffff', { map: houseTexture() }), g); house.position.set(0, 1.7, -6);
    const roof = box(30, 0.2, 1.4, lam('#8a4030'), g); roof.position.set(0, 3.45, -6);
    const bulb = new THREE.MeshBasicMaterial({ color: '#fff0b0' }); const R = rng(44);
    for (let i = 0; i < 40; i++) { const x = -12 + R() * 24, y = 1.2 + R() * 2; const b = sphere(0.05, bulb, g, 6); b.position.set(x, y, -5.4); glow('#ffd990', 0.5, x, y, -5.3, g); }
    const hl = new THREE.PointLight('#ffd9a0', 1.2, 14, 2); hl.position.set(0, 3, -3); g.add(hl);
    const bl = new THREE.PointLight('#7fd0ff', 1.0, 10, 2); bl.position.set(0.5, 0.5, 2); g.add(bl);
    // salpicaduras y ondas
    g.userData.drops = []; const dropMat = new THREE.MeshBasicMaterial({ color: '#dff6ff' });
    for (let i = 0; i < 40; i++) { const d = sphere(0.035, dropMat, g, 5); d.visible = false; d.castShadow = false; g.userData.drops.push({ m: d, v: new THREE.Vector3(), t: 0 }); }
    g.userData.rings = [];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); r.rotation.x = Math.PI / 2; r.visible = false; g.add(r); g.userData.rings.push(r); }
    R3.poolRig = new Rig('muslera'); g.add(R3.poolRig.group);
  }

  function renderPool(t, phase, f) {
    const g = R3.pool, ud = g.userData;
    ud.water.material.map.offset.set(t * 0.02, Math.sin(t * 0.5) * 0.02);
    const walkK = clamp(phase / 0.25, 0, 1), kneel = clamp((phase - 0.25) / 0.15, 0, 1), dunk = clamp((phase - 0.4) / 0.1, 0, 1), under = phase > 0.42 && phase < 0.68, out = clamp((phase - 0.68) / 0.1, 0, 1), shaking = phase > 0.78;
    const x = lerp(-2.6, -0.1, 1 - Math.pow(1 - walkK, 2));
    const k = kneel, dip = (dunk - out);
    // el torso se dobla hacia delante: arrodillado ~1.5 rad, con la cabeza dentro ~2.15 rad
    const P = {
      lean: 0.08 + k * 1.45 + dip * 0.7, crouch: 3 + k * 68, twist: 0, headDx: 0, headDy: 0, headTilt: (shaking ? Math.sin(t * 28) * 0.3 : 0) + k * 0.4, lying: 0,
      lead: k > 0 ? { x: 60 + k * 20, y: -(100 - k * 60) } : { x: 36, y: -122 }, rear: k > 0 ? { x: 50 + k * 20, y: -(95 - k * 60) } : { x: 2, y: -112 },
      leadSide: 1, rearSide: 1, footF: { x: 30 + k * 6, y: 0 }, footB: { x: -22 - k * 40, y: 0 }, mouthOpen: under ? 0 : 0.4,
    };
    if (walkK < 1) { const sw = Math.sin(t * 11); P.footF = { x: 24 + sw * 12, y: -Math.max(0, sw) * 6 }; P.footB = { x: -22 - sw * 12, y: -Math.max(0, -sw) * 6 }; P.crouch = 4 + Math.abs(sw) * 3; }
    const fake = { x: x * 100, dir: 1, face: under ? 'happy' : phase > 0.7 ? 'happy' : 'tired', state: 'idle' };
    R3.poolRig.apply(fake, P, { wet: phase > 0.5 });
    // al arrodillarse se gira hacia el agua (+z)
    R3.poolRig.group.rotation.y = -Math.PI / 2 * k;
    R3.poolRig.group.position.z = -0.35 + k * 0.4;
    // gotas y ondas
    const splashNow = (dunk > 0 && dunk < 1) || (out > 0 && out < 1);
    const hx = x, hz = 1.0;
    for (const d of ud.drops) {
      if (d.t <= 0 && (splashNow || (shaking && Math.random() < 0.3)) && Math.random() < 0.5) {
        d.t = 0.5 + Math.random() * 0.4; const a = Math.random() * Math.PI * 2;
        if (shaking) { d.m.position.set(hx + 0.1, 1.55, -0.1); d.v.set(Math.cos(a) * 1.5, 1.2 + Math.random(), Math.sin(a) * 1.5); }
        else { d.m.position.set(hx + Math.cos(a) * 0.2, 0.02, hz + Math.sin(a) * 0.2); d.v.set(Math.cos(a) * 1.2, 2 + Math.random() * 1.5, Math.sin(a) * 1.2); }
        d.m.visible = true;
      }
      if (d.t > 0) { d.t -= 1 / 60; d.v.y -= 9 / 60; d.m.position.addScaledVector(d.v, 1 / 60); if (d.t <= 0 || d.m.position.y < -0.1) { d.t = 0; d.m.visible = false; } }
    }
    ud.rings.forEach((r, i) => { const on = under || splashNow; r.visible = on; if (on) { const s = 0.4 + ((t * 0.8 + i * 0.33) % 1) * 1.6; r.scale.set(s, s, s); r.material.opacity = 0.7 * (1 - ((t * 0.8 + i * 0.33) % 1)); r.position.set(hx, 0.0, hz); } });
    // cámara lateral
    const cam = R3.camera;
    const cx = 40 + x;
    cam.position.set(cx + 3.8 - k * 0.5, 1.7, 2.6); cam.lookAt(cx + 0.1, 0.5, 0.8);
    R3.renderer.render(R3.scene, cam);
  }

  // ----------------------------------------------------------- API
  R3.init = function (canvas, opts) {
    THREE = root.THREE; if (!THREE) return false;
    try {
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      R3.mobile = !!(opts && opts.mobile);
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, R3.mobile ? 1.5 : 2));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
      R3.renderer = r; R3.scene = new THREE.Scene(); R3.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
      buildWorld(); buildPool();
      R3.rigs.muslera = new Rig('muslera'); R3.rigs.oscar = new Rig('oscar');
      R3.scene.add(R3.rigs.muslera.group); R3.scene.add(R3.rigs.oscar.group);
      R3.rigs.muslera.group.visible = R3.rigs.oscar.group.visible = false;
      R3.ready = true; return true;
    } catch (e) { console.warn('3D no disponible', e); R3.ready = false; return false; }
  };
  R3.resize = function (w, h) { if (!R3.ready) return; R3.w = w; R3.h = h; R3.renderer.setSize(w, h, false); R3.camera.aspect = w / h; R3.camera.updateProjectionMatrix(); };

  // frame: { sim, t, screen, cheer, excite, intro, vw (ancho lógico deseado), cx (centro lógico), results }
  R3.render = function (fr) {
    if (!R3.ready) return;
    const cam = R3.camera, sim = fr.sim;
    animateCrowd(fr.t, fr.excite, fr.cheer);
    const show = !!sim && ['fight', 'intro', 'over', 'corner'].includes(fr.screen);
    for (const key of ['muslera', 'oscar']) {
      const rig = R3.rigs[key]; rig.group.visible = show;
      if (!show) continue;
      const f = key === 'muslera' ? sim.p : sim.o;
      const P = D.pose(f, fr.t, { entrance: fr.intro && f.state === 'walk' });
      rig.apply(f, P, { medals: fr.intro && key === 'oscar', towel: fr.intro && key === 'muslera', wet: f.fresh > 0 });
    }
    // cámara: encuadra el ancho lógico pedido y garantiza altura mínima
    const vwU = fr.vw * U, aspect = R3.w / R3.h;
    const tanV = Math.tan(cam.fov / 2 * Math.PI / 180), tanH = tanV * aspect;
    const distH = (vwU / 2) / tanH, distV = (3.7 / 2) / tanV;
    const dist = Math.max(distH, distV);
    const cx = fr.cx * U;
    const k = fr.snap ? 1 : 1 - Math.pow(0.0005, fr.dt || 0.016);
    R3.camTarget.x = lerp(R3.camTarget.x, cx, k); R3.camTarget.dist = lerp(R3.camTarget.dist, dist, k * 0.7);
    const sh = (fr.shake || 0) * U * 0.5;
    const zoom = fr.zoom || 1, orbit = fr.orbit || 0;
    R3.camTarget.zoom = lerp(R3.camTarget.zoom || 1, zoom, k); R3.camTarget.orbit = lerp(R3.camTarget.orbit || 0, orbit, k * 0.8);
    const dz = R3.camTarget.dist * R3.camTarget.zoom, ob = R3.camTarget.orbit;
    const lookY = fr.lookY != null ? fr.lookY : 1.35, lookX = fr.lookX != null ? fr.lookX * U : R3.camTarget.x + 0.25;
    R3.camTarget.lx = lerp(R3.camTarget.lx == null ? lookX : R3.camTarget.lx, lookX, k); R3.camTarget.ly = lerp(R3.camTarget.ly == null ? lookY : R3.camTarget.ly, lookY, k);
    const camH = (fr.camH != null ? fr.camH : 0.4) * dz / 7 + R3.camTarget.ly;
    cam.position.set(R3.camTarget.lx + Math.sin(ob) * dz + (Math.random() - 0.5) * sh, camH + (Math.random() - 0.5) * sh, Math.cos(ob) * dz);
    cam.lookAt(R3.camTarget.lx, R3.camTarget.ly, 0);
    R3.lights.key.target.position.set(R3.camTarget.x, 0, 0);
    R3.renderer.render(R3.scene, cam);
  };
  R3.renderPool = function (t, phase) { if (R3.ready) renderPool(t, phase); };
  // proyección de coordenadas lógicas (px del motor, y hacia abajo desde el techo del mundo 2D) a píxeles de pantalla
  const _p = { v: null };
  R3.project = function (x, y) {
    if (!_p.v) _p.v = new THREE.Vector3();
    _p.v.set(x * U, (D.FLOOR - y) * U, 0.3).project(R3.camera);
    return { x: (_p.v.x + 1) / 2 * R3.w, y: (1 - _p.v.y) / 2 * R3.h };
  };
  R3.pxPerLogical = function () { const a = R3.project(400, 300), b = R3.project(500, 300); return Math.abs(b.x - a.x) / 100; };

  root.TSM_3D = R3;
})(window);
