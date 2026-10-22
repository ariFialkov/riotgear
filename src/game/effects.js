// Pooled GPU particle system + helpers for fire, smoke, gas clouds, debris, sparks, flashes.
import * as THREE from 'three';
import { particleSprite } from '../world/textures.js';

const MAX = 6000;

export class Particles {
  constructor(scene) {
    this.n = MAX; this.i = 0;
    this.pos = new Float32Array(MAX * 3); this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX); this.fade = new Float32Array(MAX); this.grow = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: particleSprite() } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA;
        void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = min(aSize * (300.0 / -mv.z), 90.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map,gl_PointCoord); if(vA<=0.001) discard; gl_FragColor=vec4(vC, t.a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    this.geom = g;
  }
  emit(x, y, z, o = {}) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = o.vx ?? 0; this.vel[i3 + 1] = o.vy ?? 0; this.vel[i3 + 2] = o.vz ?? 0;
    const c = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color ?? '#ffffff');
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size[i] = o.size ?? 0.5; this.life[i] = this.maxLife[i] = o.life ?? 1;
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0; this.alpha[i] = o.alpha ?? 1;
    this.fade[i] = o.fade ?? 1; this.grow[i] = o.grow ?? 0;
  }
  burst(x, y, z, count, fn) { for (let k = 0; k < count; k++) this.emit(x, y, z, fn(k)); }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      const d = 1 - this.drag[i] * dt;
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.3; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6; }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.fade[i] ? Math.min(1, t * 2) * (1 - (1 - t) * 0.3) : 1;
      if (this.grow[i]) this.size[i] += this.grow[i] * dt;
    }
    this.geom.attributes.position.needsUpdate = true; this.geom.attributes.aAlpha.needsUpdate = true;
    this.geom.attributes.aSize.needsUpdate = true; this.geom.attributes.aColor.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng; this.p = new Particles(scene);
    // A fixed pool of point lights lives in the scene for the whole round. Adding/removing lights at
    // runtime makes three.js recompile every material (a visible freeze), so we only re-use these.
    this.lightPool = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ffffff', 0, 1); l.position.set(0, -50, 0); scene.add(l); this.lightPool.push(l); }
    this.fires = []; this.gases = []; this.smokes = []; this.lights = [];
    this.flashLevel = 0;
    this.time = 0;
  }
  r(a, b) { return this.rng.float(a, b); }

  takeLight(color, intensity, distance, x, y, z) {
    const l = this.lightPool.find((q) => !q.busy); if (!l) return null;
    l.busy = true; l.color.set(color); l.intensity = intensity; l.distance = distance; l.position.set(x, y, z); return l;
  }
  freeLight(l) { if (!l) return; l.busy = false; l.intensity = 0; l.position.set(0, -50, 0); }
  fire(x, y, z, radius, duration, onTick) {
    const light = this.takeLight('#ff7a2a', 2.5, radius * 5, x, y + 1, z);
    this.fires.push({ x, y, z, radius, t: duration, light, onTick });
  }
  gas(x, z, radius, duration) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshLambertMaterial({ color: '#e8e8d0', transparent: true, opacity: 0.0, depthWrite: false }));
    m.position.set(x, 0.6, z); m.scale.setScalar(0.5); this.scene.add(m);
    this.gases.push({ x, z, radius, t: duration, max: duration, mesh: m });
  }
  smokeStick(obj, color) { this.smokes.push({ obj, color }); }
  flash(x, y, z, strength = 1) {
    this.flashLevel = Math.max(this.flashLevel, strength);
    const light = this.takeLight('#ffffff', 40, 30, x, y, z);
    if (light) this.lights.push({ light, t: 0.25 });
    this.p.burst(x, y, z, 60, () => ({ vx: this.r(-8, 8), vy: this.r(-2, 8), vz: this.r(-8, 8), color: '#ffffff', size: this.r(0.4, 1.2), life: this.r(0.2, 0.5), drag: 3 }));
  }
  sparks(x, y, z, color = '#ffd27a', n = 10) {
    this.p.burst(x, y, z, n, () => ({ vx: this.r(-3, 3), vy: this.r(1, 4), vz: this.r(-3, 3), color, size: this.r(0.15, 0.3), life: this.r(0.2, 0.5), gravity: 9, fade: 1 }));
  }
  hit(x, y, z, color = '#ffffff') {
    this.p.burst(x, y, z, 8, () => ({ vx: this.r(-2, 2), vy: this.r(0.5, 3), vz: this.r(-2, 2), color, size: this.r(0.2, 0.45), life: this.r(0.15, 0.35), gravity: 6 }));
  }
  debris(x, y, z, color, n = 25, power = 1) {
    this.p.burst(x, y, z, n, () => ({ vx: this.r(-4, 4) * power, vy: this.r(2, 7) * power, vz: this.r(-4, 4) * power, color, size: this.r(0.2, 0.6), life: this.r(0.6, 1.4), gravity: 12, drag: 0.5, fade: 0 }));
  }
  glass(x, y, z) {
    this.p.burst(x, y, z, 30, () => ({ vx: this.r(-3, 3), vy: this.r(0, 4), vz: this.r(-3, 3), color: '#cfe8ff', size: this.r(0.12, 0.3), life: this.r(0.5, 1.2), gravity: 12, fade: 0 }));
  }
  dust(x, y, z, n = 40, size = 2, color = '#b8ad98') {
    this.p.burst(x, y, z, n, () => ({ vx: this.r(-3, 3), vy: this.r(0.5, 3), vz: this.r(-3, 3), color, size: this.r(size * 0.5, size), life: this.r(1.2, 2.6), gravity: -0.2, drag: 1.2, grow: 1.5, alpha: 0.7 }));
  }
  puff(x, y, z, color = '#cccccc') {
    this.p.burst(x, y, z, 6, () => ({ vx: this.r(-1, 1), vy: this.r(0.5, 2), vz: this.r(-1, 1), color, size: this.r(0.5, 1), life: this.r(0.5, 1), drag: 1, grow: 0.8, alpha: 0.6 }));
  }
  trail(x, y, z, color, size = 0.3) { this.p.emit(x, y, z, { color, size, life: 0.3, alpha: 0.8 }); }

  update(dt) {
    this.time += dt;
    const p = this.p;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.t -= dt;
      if (f.light) f.light.intensity = 2 + Math.sin(this.time * 17 + i) * 0.8;
      for (let k = 0; k < 3; k++) {
        const a = this.r(0, 6.28), rr = this.r(0, f.radius);
        p.emit(f.x + Math.cos(a) * rr, f.y + 0.1, f.z + Math.sin(a) * rr, { vx: this.r(-0.5, 0.5), vy: this.r(1.5, 3.5), vz: this.r(-0.5, 0.5), color: this.rng.chance(0.5) ? '#ff8c1a' : '#ffd23d', size: this.r(0.5, 1.1), life: this.r(0.4, 0.9), drag: 1, alpha: 0.95 });
      }
      if (this.rng.chance(0.5)) p.emit(f.x, f.y + 1.2, f.z, { vx: this.r(-0.5, 0.5), vy: this.r(1, 2), vz: this.r(-0.5, 0.5), color: '#1a1a1a', size: this.r(1.2, 2.5), life: this.r(1.5, 3), drag: 0.8, grow: 1.2, alpha: 0.55 });
      if (f.onTick) f.onTick(dt);
      if (f.t <= 0) { this.freeLight(f.light); this.fires.splice(i, 1); }
    }
    for (let i = this.gases.length - 1; i >= 0; i--) {
      const g = this.gases[i]; g.t -= dt;
      const life = g.t / g.max;
      const s = g.radius * (1 - Math.pow(1 - Math.min(1, (g.max - g.t) / 2), 2)) + 0.5;
      g.mesh.scale.set(s, s * 0.6, s); g.mesh.material.opacity = 0.45 * Math.min(1, life * 3);
      for (let k = 0; k < 2; k++) {
        const a = this.r(0, 6.28), rr = this.r(0, s);
        p.emit(g.x + Math.cos(a) * rr, 0.3, g.z + Math.sin(a) * rr, { vx: this.r(-0.3, 0.3), vy: this.r(0.2, 0.8), vz: this.r(-0.3, 0.3), color: '#e6e6d2', size: this.r(1.5, 3), life: this.r(1.5, 3), drag: 0.5, grow: 1, alpha: 0.5 });
      }
      if (g.t <= 0) { this.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); this.gases.splice(i, 1); }
    }
    for (const s of this.smokes) {
      if (!s.obj.parent) continue;
      const v = new THREE.Vector3(); s.obj.getWorldPosition(v);
      if (this.rng.chance(0.5)) p.emit(v.x, v.y, v.z, { vx: this.r(-0.3, 0.3), vy: this.r(1, 2), vz: this.r(-0.3, 0.3), color: s.color, size: this.r(0.25, 0.5), life: this.r(1.2, 2.2), drag: 0.6, grow: 0.5, alpha: 0.45 });
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i]; l.t -= dt; l.light.intensity *= 0.8;
      if (l.t <= 0) { this.freeLight(l.light); this.lights.splice(i, 1); }
    }
    this.flashLevel = Math.max(0, this.flashLevel - dt * 1.6);
    p.update(dt);
  }
  inGas(x, z) { for (const g of this.gases) if (Math.hypot(g.x - x, g.z - z) < g.mesh.scale.x) return true; return false; }
  inFire(x, z) { for (const f of this.fires) if (Math.hypot(f.x - x, f.z - z) < f.radius + 0.5) return true; return false; }
}
