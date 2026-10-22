// Prop factories. Each returns { group, kind, type, hp, radius, blocking, value, climbable, burnable, throwMass }.
// kinds: fragile (1 hit), small (lootable), medium (brawler can pick up & throw), large (multi-hit), building.
import * as THREE from 'three';
import { ECONOMY } from '../data/config.js';

const mats = {};
export function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  return mats[key];
}
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sph: new THREE.SphereGeometry(0.5, 10, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};
export const GEO = geo;

export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo.box, m); o.scale.set(w, h, d); o.position.set(x, y, z); return o;
}
export function cyl(r, h, m, x = 0, y = 0, z = 0, r2 = r) {
  const o = new THREE.Mesh(r2 === r ? geo.cyl : new THREE.CylinderGeometry(r, r2, 1, 10), m);
  o.scale.set(r2 === r ? r * 2 : 1, h, r2 === r ? r * 2 : 1); o.position.set(x, y, z); return o;
}
export function sph(r, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo.sph, m); o.scale.setScalar(r * 2); o.position.set(x, y, z); return o;
}

function mk(group, kind, type, hp, radius, extra = {}) {
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group, kind, type, hp, maxHp: hp, radius, blocking: kind === 'medium' || kind === 'large',
    value: ECONOMY.prop[kind] ?? 0, climbable: false, burnable: false, throwMass: 1, lootable: kind === 'small',
    height: 1.5, ...extra,
  };
}

export const PROPS = {
  lamppost(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.12, 6.5, mat('#2d2f33'), 0, 3.25, 0));
    g.add(cyl(0.28, 0.4, mat('#2d2f33'), 0, 0.2, 0));
    g.add(box(0.1, 0.1, 1.4, mat('#2d2f33'), 0, 6.3, 0.6));
    const lamp = box(0.5, 0.35, 0.5, mat('#ffe9b0', { emissive: '#ffd27a', emissiveIntensity: 0.9 }), 0, 6.1, 1.2);
    g.add(lamp);
    return mk(g, 'large', 'lamppost', 70, 0.35, { height: 6.5 });
  },
  streetSign(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.06, 3.0, mat('#55595f'), 0, 1.5, 0));
    g.add(box(0.9, 0.5, 0.05, mat(rng.chance(0.5) ? '#1f4fa8' : '#c62828'), 0, 2.7, 0));
    g.add(box(0.8, 0.08, 0.06, mat('#f5f5f5'), 0, 2.7, 0.03));
    return mk(g, 'large', 'sign', 40, 0.2, { height: 3 });
  },
  bench(rng) {
    const g = new THREE.Group(); const wood = mat('#7a5230'), iron = mat('#2b2b2b');
    g.add(box(1.9, 0.08, 0.5, wood, 0, 0.45, 0));
    g.add(box(1.9, 0.5, 0.07, wood, 0, 0.75, -0.25));
    g.add(box(0.08, 0.45, 0.5, iron, -0.8, 0.22, 0)); g.add(box(0.08, 0.45, 0.5, iron, 0.8, 0.22, 0));
    return mk(g, 'medium', 'bench', 35, 0.9, { throwMass: 1.4, height: 1 });
  },
  newspaperBox(rng) {
    const g = new THREE.Group();
    g.add(box(0.55, 1.1, 0.5, mat(rng.pick(['#c62828', '#1565c0', '#2e7d32', '#f9a825'])), 0, 0.55, 0));
    g.add(box(0.45, 0.4, 0.04, mat('#dfe8f0'), 0, 0.8, 0.26));
    return mk(g, 'medium', 'newsbox', 28, 0.4, { throwMass: 1.0, height: 1.1 });
  },
  trashCan(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.3, 0.95, mat('#3b4a3b'), 0, 0.48, 0));
    g.add(cyl(0.33, 0.08, mat('#2b2b2b'), 0, 0.98, 0));
    return mk(g, 'medium', 'trashcan', 18, 0.35, { throwMass: 0.7, height: 1, burnable: true });
  },
  barrier(rng) {
    const g = new THREE.Group(); const m = mat('#9ea7b0');
    g.add(box(2.2, 0.06, 0.06, m, 0, 1.05, 0)); g.add(box(2.2, 0.06, 0.06, m, 0, 0.7, 0)); g.add(box(2.2, 0.06, 0.06, m, 0, 0.35, 0));
    for (let i = -1; i <= 1; i += 0.5) g.add(box(0.05, 1.05, 0.05, m, i * 1.0, 0.55, 0));
    g.add(box(0.06, 0.06, 0.7, m, -1.05, 0.04, 0)); g.add(box(0.06, 0.06, 0.7, m, 1.05, 0.04, 0));
    return mk(g, 'medium', 'barrier', 40, 1.1, { throwMass: 1.6, height: 1.1 });
  },
  scooter(rng) {
    const g = new THREE.Group(); const body = mat(rng.pick(['#e53935', '#f5f5f5', '#1e88e5', '#212121']));
    g.add(box(1.4, 0.35, 0.4, body, 0, 0.5, 0)); g.add(box(0.5, 0.4, 0.35, body, 0.45, 0.85, 0));
    g.add(cyl(0.22, 0.12, mat('#222'), -0.55, 0.22, 0)); g.add(cyl(0.22, 0.12, mat('#222'), 0.6, 0.22, 0));
    g.children[2].rotation.z = Math.PI / 2; g.children[3].rotation.z = Math.PI / 2;
    return mk(g, 'medium', 'scooter', 24, 0.7, { throwMass: 1.2, height: 1, burnable: true });
  },
  cafeTable(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.4, 0.04, mat('#e7e3d8'), 0, 0.72, 0)); g.add(cyl(0.03, 0.7, mat('#2b2b2b'), 0, 0.35, 0));
    g.add(cyl(0.2, 0.03, mat('#2b2b2b'), 0, 0.02, 0));
    g.add(cyl(0.05, 0.14, mat('#c9a24a', { emissive: '#4a3a10', emissiveIntensity: 0.4 }), 0.1, 0.82, 0.05));
    return mk(g, 'small', 'cafetable', 12, 0.45, { throwMass: 0.6, height: 0.8 });
  },
  chair(rng) {
    const g = new THREE.Group(); const m = mat(rng.pick(['#8a6a3a', '#3a3a3a', '#7a3a2a']));
    g.add(box(0.42, 0.04, 0.42, m, 0, 0.45, 0)); g.add(box(0.42, 0.45, 0.04, m, 0, 0.68, -0.2));
    g.add(box(0.03, 0.45, 0.03, m, -0.18, 0.22, 0.18)); g.add(box(0.03, 0.45, 0.03, m, 0.18, 0.22, 0.18));
    g.add(box(0.03, 0.45, 0.03, m, -0.18, 0.22, -0.18)); g.add(box(0.03, 0.45, 0.03, m, 0.18, 0.22, -0.18));
    return mk(g, 'small', 'chair', 10, 0.3, { throwMass: 0.5, height: 0.9 });
  },
  flowerPot(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.3, 0.5, mat('#b5532e'), 0, 0.25, 0, 0.22));
    g.add(sph(0.38, mat('#3f7a3a'), 0, 0.6, 0));
    g.add(sph(0.1, mat(rng.pick(['#ff3d6b', '#ffd23d', '#ff7a3d'])), 0.15, 0.78, 0.1));
    g.add(sph(0.1, mat('#ffd23d'), -0.15, 0.72, -0.05));
    return mk(g, 'small', 'flowerpot', 8, 0.35, { throwMass: 0.6, height: 0.9 });
  },
  jewelryCase(rng) {
    const g = new THREE.Group();
    g.add(box(0.7, 0.8, 0.5, mat('#2a2a2e'), 0, 0.4, 0));
    g.add(box(0.72, 0.3, 0.52, mat('#9fd5ff', { transparent: true, opacity: 0.5 }), 0, 0.95, 0));
    g.add(sph(0.08, mat('#ffd700', { emissive: '#8a6a00', emissiveIntensity: 0.8 }), -0.15, 0.95, 0));
    g.add(sph(0.06, mat('#ffffff', { emissive: '#aaaaaa', emissiveIntensity: 0.6 }), 0.15, 0.93, 0.05));
    return mk(g, 'small', 'jewelry', 10, 0.45, { lootValue: ECONOMY.loot * 1.5, height: 1.1 });
  },
  artPiece(rng) {
    const g = new THREE.Group();
    g.add(box(0.5, 0.6, 0.5, mat('#d8d4cc'), 0, 0.3, 0));
    const s = sph(0.35, mat(rng.pick(['#c0392b', '#2980b9', '#f1c40f'])), 0, 0.95, 0); s.scale.y *= 1.6; g.add(s);
    return mk(g, 'small', 'art', 10, 0.4, { lootValue: ECONOMY.loot * 1.2, height: 1.4 });
  },
  marketStall(rng) {
    const g = new THREE.Group(); const post = mat('#5a3d22');
    for (const [x, z] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) g.add(cyl(0.05, 2.4, post, x, 1.2, z));
    g.add(box(3.0, 0.1, 1.9, mat(rng.pick(['#c62828', '#1565c0', '#2e7d32', '#ef6c00'])), 0, 2.45, 0));
    g.add(box(3.2, 0.06, 2.1, mat('#f5f0e6'), 0, 2.5, 0));
    g.add(box(2.8, 0.9, 1.4, post, 0, 0.45, 0));
    g.add(box(0.5, 0.3, 0.4, mat('#e65100'), -0.8, 1.05, 0)); g.add(box(0.5, 0.3, 0.4, mat('#7cb342'), 0.1, 1.05, 0.2)); g.add(box(0.5, 0.3, 0.4, mat('#fdd835'), 0.9, 1.05, -0.1));
    return mk(g, 'large', 'stall', 90, 1.7, { burnable: true, height: 2.5 });
  },
  dumpster(rng) {
    const g = new THREE.Group(); const m = mat(rng.pick(['#2e7d32', '#1565c0', '#546e7a']));
    g.add(box(1.8, 1.2, 1.1, m, 0, 0.6, 0)); g.add(box(1.85, 0.12, 1.15, mat('#263238'), 0, 1.25, 0));
    return mk(g, 'large', 'dumpster', 120, 1.1, { burnable: true, height: 1.3 });
  },
  car(rng) {
    const g = new THREE.Group(); const paint = mat(rng.pick(['#b71c1c', '#eceff1', '#37474f', '#1565c0', '#f9a825', '#263238', '#90a4ae']));
    g.add(box(4.1, 0.6, 1.8, paint, 0, 0.6, 0));
    g.add(box(2.2, 0.55, 1.6, paint, -0.2, 1.17, 0));
    g.add(box(2.1, 0.45, 1.62, mat('#1b2630', { transparent: true, opacity: 0.85 }), -0.2, 1.2, 0));
    const wheel = mat('#111');
    for (const [x, z] of [[-1.3, -0.95], [1.3, -0.95], [-1.3, 0.95], [1.3, 0.95]]) { const w = cyl(0.33, 0.25, wheel, x, 0.33, z); w.rotation.x = Math.PI / 2; g.add(w); }
    g.add(box(0.1, 0.2, 0.4, mat('#ffe082', { emissive: '#ffd54f', emissiveIntensity: 0.3 }), 2.05, 0.65, 0.6));
    g.add(box(0.1, 0.2, 0.4, mat('#ffe082', { emissive: '#ffd54f', emissiveIntensity: 0.3 }), 2.05, 0.65, -0.6));
    return mk(g, 'large', 'car', 180, 2.2, { burnable: true, height: 1.5, halfW: 2.1, halfD: 0.95 });
  },
  riotVan(rng) {
    const g = new THREE.Group(); const paint = mat('#1a2a44'), white = mat('#e8eef5');
    g.add(box(5.6, 2.2, 2.3, paint, 0, 1.3, 0));
    g.add(box(5.65, 0.35, 2.35, white, 0, 1.6, 0));
    g.add(box(1.6, 0.8, 2.32, mat('#1b2630', { transparent: true, opacity: 0.85 }), 2.0, 1.8, 0));
    g.add(box(0.5, 0.2, 1.2, mat('#2979ff', { emissive: '#2979ff', emissiveIntensity: 1.2 }), 0, 2.5, 0));
    for (const [x, z] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) { const w = cyl(0.45, 0.3, mat('#111'), x, 0.45, z); w.rotation.x = Math.PI / 2; g.add(w); }
    return mk(g, 'large', 'van', 1e9, 3.0, { indestructible: true, height: 2.6, halfW: 2.8, halfD: 1.2 });
  },
  tree(rng) {
    const g = new THREE.Group();
    g.add(cyl(0.18, 2.6, mat('#5a3d22'), 0, 1.3, 0, 0.25));
    const leaf = mat(rng.pick(['#3f7a3a', '#4a8a3a', '#2f6a30']));
    g.add(sph(1.6, leaf, 0, 3.4, 0)); g.add(sph(1.2, leaf, 0.9, 3.0, 0.4)); g.add(sph(1.1, leaf, -0.8, 3.2, -0.5));
    return mk(g, 'large', 'tree', 1e9, 0.4, { indestructible: true, height: 5 });
  },
  palm(rng) {
    const g = new THREE.Group();
    const trunk = cyl(0.16, 6, mat('#8a6a4a'), 0, 3, 0, 0.26); trunk.rotation.z = rng.float(-0.08, 0.08); g.add(trunk);
    const leaf = mat('#3e8a3a');
    for (let i = 0; i < 7; i++) {
      const l = box(3.0, 0.08, 0.5, leaf, 0, 6, 0);
      l.rotation.y = (i / 7) * Math.PI * 2; l.rotation.z = -0.35;
      l.translateX(1.3); g.add(l);
    }
    return mk(g, 'large', 'palm', 1e9, 0.35, { indestructible: true, height: 6 });
  },
  fountain(rng) {
    const g = new THREE.Group(); const stone = mat('#b9b2a2');
    g.add(cyl(4.2, 0.8, stone, 0, 0.4, 0)); g.add(cyl(3.6, 0.1, mat('#3b6f8f', { transparent: true, opacity: 0.85 }), 0, 0.82, 0));
    g.add(cyl(0.5, 2.6, stone, 0, 1.3, 0, 0.7)); g.add(cyl(1.5, 0.3, stone, 0, 2.6, 0)); g.add(cyl(0.3, 1.2, stone, 0, 3.2, 0));
    return mk(g, 'large', 'fountain', 1e9, 4.4, { indestructible: true, height: 3.6 });
  },
  statue(rng) {
    const g = new THREE.Group(); const stone = mat('#9e9686'), bronze = mat('#5a4a2e');
    g.add(box(4, 1.2, 4, stone, 0, 0.6, 0)); g.add(box(2.6, 2.4, 2.6, stone, 0, 2.4, 0));
    g.add(box(0.9, 1.4, 0.6, bronze, 0, 4.4, 0)); g.add(sph(0.35, bronze, 0, 5.4, 0));
    g.add(box(0.25, 1.2, 0.25, bronze, -0.6, 4.5, 0)); g.add(box(0.25, 1.4, 0.25, bronze, 0.55, 5.0, 0.1));
    g.add(box(0.3, 1.3, 0.3, bronze, -0.25, 3.0, 0)); g.add(box(0.3, 1.3, 0.3, bronze, 0.25, 3.0, 0));
    return mk(g, 'large', 'statue', 420, 2.9, { climbable: true, roofY: 3.6, halfW: 1.3, halfD: 1.3, height: 6 });
  },
  bikeRack(rng) {
    const g = new THREE.Group(); const m = mat('#555');
    for (let i = -1; i <= 1; i++) { g.add(box(0.06, 0.8, 0.06, m, i * 0.6, 0.4, -0.3)); g.add(box(0.06, 0.8, 0.06, m, i * 0.6, 0.4, 0.3)); g.add(box(0.06, 0.06, 0.66, m, i * 0.6, 0.8, 0)); }
    g.add(box(1.3, 0.05, 0.05, mat('#c62828'), 0, 0.5, 0.12)); g.add(box(1.2, 0.05, 0.05, mat('#1565c0'), 0, 0.55, -0.12));
    return mk(g, 'medium', 'bikerack', 30, 0.8, { throwMass: 1.3, height: 0.9 });
  },
};

const COLLECTIBLE_LOOK = {
  rock: () => sph(0.22, mat('#8a8a80')),
  molotov: () => { const g = new THREE.Group(); g.add(cyl(0.1, 0.4, mat('#4a7a3a', { transparent: true, opacity: 0.85 }), 0, 0.2, 0)); g.add(cyl(0.04, 0.2, mat('#eee'), 0, 0.5, 0)); return g; },
  teargas: () => { const g = new THREE.Group(); g.add(cyl(0.1, 0.36, mat('#6b7a6b'), 0, 0.18, 0)); g.add(box(0.1, 0.08, 0.1, mat('#c0c0c0'), 0, 0.4, 0)); return g; },
  flashbang: () => { const g = new THREE.Group(); g.add(cyl(0.09, 0.3, mat('#333'), 0, 0.15, 0)); g.add(box(0.14, 0.06, 0.14, mat('#999'), 0, 0.33, 0)); return g; },
};
export function collectibleMesh(type, color) {
  const g = new THREE.Group();
  const look = COLLECTIBLE_LOOK[type](); g.add(look);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 24), mat(color, { emissive: color, emissiveIntensity: 1.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.3; g.add(ring);
  return g;
}
