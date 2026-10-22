// Procedural Mediterranean old-town generator. Every round gets a new city from the round seed:
// a long avenue running north/south (the riot axis), a big central plaza where the lines meet,
// irregular blocks of perimeter buildings with courtyards, side streets, props, parked cars,
// market stalls, a fountain, a monument, palms and collectibles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TEX from './textures.js';
import { PROPS, collectibleMesh, mat, box } from './props.js';
import { PROJECTILES, ECONOMY } from '../data/config.js';

const GROUND_H = 4.2, FLOOR_H = 3.1, BAY_W = 3.6;

export class World {
  constructor(scene, rng, quality) {
    this.scene = scene; this.rng = rng; this.quality = quality;
    this.minX = -96; this.maxX = 96; this.minZ = -132; this.maxZ = 132;
    this.gw = this.maxX - this.minX; this.gd = this.maxZ - this.minZ;
    this.grid = new Uint8Array(this.gw * this.gd);
    this.buildings = []; this.props = []; this.collectibles = []; this.blocks = [];
    this.lineZ = 0;
    this.plaza = { x0: -36, x1: 36, z0: -26, z1: 30 };
    this.avenueHalf = 9;
    this.regroup = { rioter: { x: 0, z: -62 }, peacekeeper: { x: 0, z: 62 } };
    this.spawn = { rioter: { z0: -72, z1: -42 }, peacekeeper: { z0: 40, z1: 68 } };
    this.group = new THREE.Group(); scene.add(this.group);
    this.atlas = TEX.facadeAtlas(rng.int(1, 1e6));
    this.facadeMat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
    this.glassMat = new THREE.MeshLambertMaterial({ color: '#7fb3d5', transparent: true, opacity: 0.45, emissive: '#1a3040', emissiveIntensity: 0.3 });
    this.time = 0;
    this.avenueCenters = [];
    // North/south side streets that run the whole map: together with the avenue they are the
    // corridors a riot can move through, and each gets its own front line.
    this.sideStreets = [
      { x: -rng.float(70, 78), w: rng.float(6, 8) }, { x: -rng.float(44, 50), w: rng.float(6, 8) },
      { x: rng.float(44, 50), w: rng.float(6, 8) }, { x: rng.float(70, 78), w: rng.float(6, 8) },
    ];
    this.corridors = [
      { id: 0, name: 'West Alley', x: this.sideStreets[0].x, half: this.sideStreets[0].w / 2 - 0.7 },
      { id: 1, name: 'West Street', x: this.sideStreets[1].x, half: this.sideStreets[1].w / 2 - 0.7 },
      { id: 2, name: 'Main Avenue', x: null, half: null, avenue: true },
      { id: 3, name: 'East Street', x: this.sideStreets[2].x, half: this.sideStreets[2].w / 2 - 0.7 },
      { id: 4, name: 'East Alley', x: this.sideStreets[3].x, half: this.sideStreets[3].w / 2 - 0.7 },
    ];
    this.avenueIndex = 2;
    // Radial format: peacekeepers hold the core (the plaza) and expand outwards; mobs come in from the
    // edges. The contested perimeter is tracked per angular sector around the centre.
    this.center = { x: 0, z: 2 }; this.R0 = 40; this.SECTORS = 8;
    this.generate();
    this.buildSurfaces();
    this.buildCoarse();
  }
  sectorOf(x, z) { const a = Math.atan2(z - this.center.z, x - this.center.x); return ((Math.round(a / (2 * Math.PI / this.SECTORS)) % this.SECTORS) + this.SECTORS) % this.SECTORS; }
  sectorAngle(k) { return k * (2 * Math.PI / this.SECTORS); }
  sectorName(k) { return ['East', 'South-East', 'South', 'South-West', 'West', 'North-West', 'North', 'North-East'][k]; }
  /** A walkable point at radius r along sector k's bisector. */
  sectorPoint(k, r) { const a = this.sectorAngle(k); return this.nearestWalkable(this.center.x + Math.cos(a) * r, this.center.z + Math.sin(a) * r, 16); }
  distToCenter(x, z) { return Math.hypot(x - this.center.x, z - this.center.z); }

  // ---------- coarse grid + flow fields (BFS from a goal) for street navigation ----------
  buildCoarse() {
    this.cs = 2; this.cw = this.gw / this.cs; this.cd = this.gd / this.cs;
    this.walk = new Uint8Array(this.cw * this.cd);
    for (let cz = 0; cz < this.cd; cz++) for (let cx = 0; cx < this.cw; cx++) {
      const x = this.minX + cx * this.cs, z = this.minZ + cz * this.cs;
      let free = 0; for (let dz = 0; dz < this.cs; dz++) for (let dx = 0; dx < this.cs; dx++) if (!this.blockedAt(x + dx + 0.5, z + dz + 0.5)) free++;
      this.walk[cz * this.cw + cx] = free === this.cs * this.cs ? 1 : 0;
    }
  }
  cellOf(x, z) { return [Math.max(0, Math.min(this.cw - 1, Math.floor((x - this.minX) / this.cs))), Math.max(0, Math.min(this.cd - 1, Math.floor((z - this.minZ) / this.cs)))]; }
  cellCenter(cx, cz) { return { x: this.minX + (cx + 0.5) * this.cs, z: this.minZ + (cz + 0.5) * this.cs }; }
  nearestWalkable(x, z, maxR = 10) {
    if (!this.walk) return { x, z };
    const [cx0, cz0] = this.cellOf(x, z);
    if (this.walk[cz0 * this.cw + cx0]) return { x, z };
    const rc = Math.ceil(maxR / this.cs);
    let best = null, bd = 1e9;
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz; if (cx < 0 || cz < 0 || cx >= this.cw || cz >= this.cd) continue;
      if (!this.walk[cz * this.cw + cx]) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = this.cellCenter(cx, cz); }
    }
    return best || { x, z };
  }
  /** True when a character can walk straight from a to b without hitting anything (sampled). */
  lineFree(x0, z0, x1, z1, radius = 0.35) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); if (l < 0.01) return true;
    const n = Math.ceil(l / 0.7), px = -dz / l * radius, pz = dx / l * radius;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = x0 + dx * t, z = z0 + dz * t;
      if (this.blockedAt(x, z) || this.blockedAt(x + px, z + pz) || this.blockedAt(x - px, z - pz)) return false;
    }
    return true;
  }
  reachable(field, x, z) { const [cx, cz] = this.cellOf(x, z); return field.dist[cz * this.cw + cx] >= 0; }
  /** Breadth-first distance field from a goal point over walkable coarse cells. */
  flowField(gx, gz) {
    const g = this.nearestWalkable(gx, gz, 16); const [sx, sz] = this.cellOf(g.x, g.z);
    const dist = new Int16Array(this.cw * this.cd).fill(-1);
    const q = new Int32Array(this.cw * this.cd); let qh = 0, qt = 0;
    const start = sz * this.cw + sx; dist[start] = 0; q[qt++] = start;
    while (qh < qt) {
      const i = q[qh++]; const cx = i % this.cw, cz = (i / this.cw) | 0, d = dist[i];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= this.cw || nz >= this.cd) continue;
        const j = nz * this.cw + nx; if (!this.walk[j] || dist[j] >= 0) continue;
        if (dx && dz && (!this.walk[cz * this.cw + nx] || !this.walk[nz * this.cw + cx])) continue; // no corner cutting
        dist[j] = d + 1; q[qt++] = j;
      }
    }
    return { dist, goal: g };
  }
  /** Next waypoint along a flow field from (x,z): the lowest-distance neighbour, two cells ahead. */
  fieldNext(field, x, z) {
    let [cx, cz] = this.cellOf(x, z);
    let here = field.dist[cz * this.cw + cx];
    if (here < 0) { const w = this.nearestWalkable(x, z, 8); [cx, cz] = this.cellOf(w.x, w.z); here = field.dist[cz * this.cw + cx]; if (here < 0) return null; }
    if (here === 0) return null;
    for (let step = 0; step < 2; step++) {
      let bx = cx, bz = cz, bd = here;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= this.cw || nz >= this.cd) continue;
        const d = field.dist[nz * this.cw + nx]; if (d < 0 || d >= bd) continue;
        if (dx && dz && (!this.walk[cz * this.cw + nx] || !this.walk[nz * this.cw + cx])) continue;
        bd = d; bx = nx; bz = nz;
      }
      if (bd === here) break; cx = bx; cz = bz; here = bd; if (here === 0) break;
    }
    return this.cellCenter(cx, cz);
  }
  /** Well separated peripheral spawn spots for mobs: corners and mid-edges of the city, randomised. */
  mobSpawnSpots(rng, n) {
    const cands = [[-78, -118], [78, -118], [-78, 118], [78, 118], [-82, 0], [82, 0], [0, -124], [0, 124], [-50, -124], [50, 124], [-82, 60], [82, -60]];
    rng.shuffle(cands);
    const picked = [];
    for (const [x, z] of cands) {
      if (picked.length >= n) break;
      const p = this.nearestWalkable(x + rng.float(-6, 6), z + rng.float(-6, 6), 20);
      if (picked.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 70)) continue;
      // must be able to reach the core
      const f = this.flowField(this.center.x, this.center.z); const [cx, cz] = this.cellOf(p.x, p.z);
      if (f.dist[cz * this.cw + cx] < 0) continue;
      picked.push(p);
    }
    while (picked.length < n) picked.push(this.nearestWalkable(rng.float(-80, 80), rng.pick([-118, 118]), 20));
    return picked;
  }
  // ---------- rooftops: a walkable height map over every building and climbable monument ----------
  buildSurfaces() {
    this.surf = new Float32Array(this.gw * this.gd); this.surfId = new Int16Array(this.gw * this.gd).fill(-1); this.surfaces = [];
    this.banners = 0;
    for (const b of this.buildings) {
      b.target = b; b.climbable = true; b.roofY = b.h; b.rise = Math.min(3, (b.z1 - b.z0) * 0.35);
      const alongX = (b.x1 - b.x0) >= (b.z1 - b.z0);
      b.heightAt = (x, z) => {
        if (!b.alive) return 1.0; // rubble
        const k = b.clutter; if (k && x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1) return k.top; // tank / AC box
        if (!b.pitched) return b.h;
        const half = alongX ? (b.z1 - b.z0) / 2 : (b.x1 - b.x0) / 2;
        const d = alongX ? Math.abs(z - (b.z0 + b.z1) / 2) : Math.abs(x - (b.x0 + b.x1) / 2);
        return b.h + b.rise * Math.max(0, 1 - d / half);
      };
      this.addSurface(b);
    }
    for (const p of this.props) if (p.climbable) {
      const sf = { x0: p.x - p.halfW, x1: p.x + p.halfW, z0: p.z - p.halfD, z1: p.z + p.halfD, roofY: p.roofY, target: p, alive: true, climbable: true, heightAt: () => p.roofY };
      sf.target = p; p.surface = sf; this.addSurface(sf);
    }
  }
  addSurface(sf) {
    const id = this.surfaces.length; this.surfaces.push(sf); sf.sid = id; this.paintSurface(sf);
  }
  paintSurface(sf) {
    // only cells whose centre is actually over the building, so roof edges sit on the wall line
    const a = Math.max(this.minX, Math.ceil(sf.x0 - 0.5)), b = Math.min(this.maxX - 1, Math.floor(sf.x1 - 0.5));
    const c = Math.max(this.minZ, Math.ceil(sf.z0 - 0.5)), d = Math.min(this.maxZ - 1, Math.floor(sf.z1 - 0.5));
    for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) {
      const i = (z - this.minZ) * this.gw + (x - this.minX);
      this.surf[i] = sf.heightAt(x + 0.5, z + 0.5); this.surfId[i] = sf.sid;
    }
  }
  /** Walkable top at a point for something already off the ground: Infinity = wall you can't enter. */
  surfaceAt(x, z) {
    if (!this.inBounds(x, z)) return Infinity;
    const i = this.gi(x, z); if (this.grid[i] === 2) return Infinity;
    return this.surf[i];
  }
  /** Visible height at a point (courtyards and streets are 0). */
  heightAt(x, z) { if (!this.inBounds(x, z)) return 0; const i = this.gi(x, z); return this.grid[i] === 2 ? 0 : this.surf[i]; }
  surfaceObjAt(x, z) { if (!this.inBounds(x, z)) return null; const id = this.surfId[this.gi(x, z)]; return id >= 0 ? this.surfaces[id] : null; }
  /** Highest walkable surface under a character's footprint (so you don't fall until you're over the edge). */
  groundUnder(x, z, r = 0.22) {
    let g = 0;
    for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const px = x + ox, pz = z + oz; if (!this.inBounds(px, pz)) continue;
      const i = this.gi(px, pz); if (this.grid[i] !== 2 && this.surf[i] > g) g = this.surf[i];
    }
    return g;
  }
  /**
   * Movement for anything off the ground (on a roof or in the air). A cell can be entered if its
   * surface is no higher than feet + step (step up / mantle) and, for bots, no more than maxDrop below.
   */
  moveElevated(pos, dx, dz, radius, y, step, maxDrop = Infinity) {
    const free = (x, z) => {
      for (const [ox, oz] of [[radius, radius], [-radius, radius], [radius, -radius], [-radius, -radius]]) {
        const px = x + ox, pz = z + oz; if (!this.inBounds(px, pz)) return false;
        const i = this.gi(px, pz), g = this.grid[i]; if (g === 2) return false;
        const sh = this.surf[i];
        if (sh > y + step) return false;
        if (sh < y - maxDrop) return false;
        if (sh < 0.05 && g === 1 && y < 1.6) return false; // street prop
      }
      return true;
    };
    const nx = pos.x + dx; if (free(nx, pos.z)) pos.x = nx;
    const nz = pos.z + dz; if (free(pos.x, nz)) pos.z = nz;
  }
  /** From roof cell (cx,cz) looking along (ax,az): the first open street cell within 3 cells, or null. */
  streetBeyond(cx, cz, ax, az) {
    for (let k = 1; k <= 3; k++) {
      const nx = cx + ax * k, nz = cz + az * k; if (!this.inBounds(nx, nz)) return null;
      const j = this.gi(nx, nz); if (this.surf[j] > 0.05 || this.grid[j] === 2) return null;
      if (this.grid[j] === 0) return { x: nx + 0.5, z: nz + 0.5 };
    }
    return null;
  }
  /** Where to climb down from a roof near (x,z): a point just outside the wall over open street. */
  roofExitNear(x, z, maxD = 1.5) {
    let best = null, bd = maxD;
    const r = Math.ceil(maxD) + 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz; if (!this.inBounds(cx, cz)) continue;
      const i = this.gi(cx, cz); if (this.surf[i] < 0.5 || this.grid[i] === 2) continue;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const st = this.streetBeyond(cx, cz, ax, az); if (!st) continue;
        // edge of this roof cell facing open street
        const ex = cx + 0.5 + ax * 0.5, ez = cz + 0.5 + az * 0.5;
        const d = Math.hypot(ex - x, ez - z);
        if (d < bd) { bd = d; best = { x: st.x, z: st.z, edgeX: ex, edgeZ: ez, roofY: this.surf[i], sf: this.surfaces[this.surfId[i]] }; }
      }
    }
    return best;
  }
  /**
   * Plan a route across connected rooftops (step up <= 0.6m, drop <= 3.5m) from (x,z) to the roof edge
   * cell nearest (tx,tz). Returns { path: [{x,z}], exit } or null.
   */
  roofPlan(x, z, tx, tz, maxCells = 2600) {
    if (!this.inBounds(x, z)) return null;
    let start = this.gi(x, z);
    if (this.surf[start] < 0.5) { // standing over the wall line: start from the nearest roof cell
      let bs = -1, bd = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!this.inBounds(x + dx, z + dz)) continue; const j = this.gi(x + dx, z + dz); if (this.surf[j] >= 0.5 && this.grid[j] !== 2 && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; bs = j; } }
      if (bs < 0) return null; start = bs;
    }
    const prev = new Map(); prev.set(start, -1);
    const q = [start]; let qi = 0, best = start, bestD = Infinity, bestExit = null;
    while (qi < q.length && q.length < maxCells) {
      const i = q[qi++]; const cx = i % this.gw, cz = (i / this.gw) | 0; const h = this.surf[i];
      let exit = null;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ax, nz = cz + az; if (nx < 0 || nz < 0 || nx >= this.gw || nz >= this.gd) continue;
        const j = nz * this.gw + nx; const g = this.grid[j], sh = this.surf[j];
        if (sh < 0.05) { if (!exit) { const st = this.streetBeyond(this.minX + cx, this.minZ + cz, ax, az); if (st) exit = { ax, az, st }; } continue; }
        if (g === 2 || sh < 0.5 || prev.has(j)) continue;
        if (sh > h + 0.6 || sh < h - 3.5) continue;
        prev.set(j, i); q.push(j);
      }
      if (exit) {
        const wx = this.minX + cx + 0.5, wz = this.minZ + cz + 0.5; const d = Math.hypot(wx - tx, wz - tz);
        if (d < bestD) { bestD = d; best = i; bestExit = { x: exit.st.x, z: exit.st.z, edgeX: wx + exit.ax * 0.5, edgeZ: wz + exit.az * 0.5, roofY: h, sf: this.surfaces[this.surfId[i]] }; }
      }
    }
    const path = []; for (let i = best; i !== -1; i = prev.get(i)) path.push({ x: this.minX + (i % this.gw) + 0.5, z: this.minZ + ((i / this.gw) | 0) + 0.5 });
    path.reverse();
    return { path, exit: bestExit, end: path[path.length - 1] };
  }
  corridorX(i, z) { const c = this.corridors[i]; return c.avenue ? this.avenueCenterAt(z) : c.x; }
  corridorHalf(i, z) { const c = this.corridors[i]; return c.avenue ? this.avenueHalfAt(z) : c.half; }
  /** Index of the corridor a point belongs to (nearest centre line). */
  corridorAt(x, z) {
    let best = 2, bd = 1e9;
    for (const c of this.corridors) { const d = Math.abs(x - this.corridorX(c.id, z)); if (d < bd) { bd = d; best = c.id; } }
    return best;
  }
  /** Nearest cross street centre z, preferring ones on the given side of `frontZ` (dir = own side sign). */
  nearestCrossZ(z, frontZ = null, ownDir = 0) {
    let best = null, bd = 1e9;
    for (const cs of this.crossStreets) {
      if (!cs.cross) continue;
      const cz = (cs.z0 + cs.z1) / 2;
      let d = Math.abs(cz - z);
      if (frontZ !== null && (cz - frontZ) * ownDir > 0) d += 40; // on the wrong (enemy) side: strongly avoid
      if (d < bd) { bd = d; best = cz; }
    }
    return best ?? z;
  }
  crossStreetHalfAt(z) { for (const cs of this.crossStreets) if (cs.cross && z >= cs.z0 && z <= cs.z1) return (cs.z1 - cs.z0) / 2; return 0; }

  // ---------- grid ----------
  gi(x, z) { return (Math.floor(z) - this.minZ) * this.gw + (Math.floor(x) - this.minX); }
  inBounds(x, z) { return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ; }
  blockedAt(x, z) { if (!this.inBounds(x, z)) return true; return this.grid[this.gi(x, z)] !== 0; }
  fillRect(x0, z0, x1, z1, v = 1) {
    const a = Math.max(this.minX, Math.floor(x0)), b = Math.min(this.maxX - 1, Math.ceil(x1) - 1);
    const c = Math.max(this.minZ, Math.floor(z0)), d = Math.min(this.maxZ - 1, Math.ceil(z1) - 1);
    for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) this.grid[(z - this.minZ) * this.gw + (x - this.minX)] = v;
  }
  fillCircle(cx, cz, r, v = 1) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!this.inBounds(x, z)) continue;
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) this.grid[this.gi(x, z)] = v;
    }
  }
  /** Axis-separated slide movement against the grid for a character of given radius. */
  moveWithCollision(pos, dx, dz, radius = 0.4) {
    const free = (x, z) => !this.blockedAt(x - radius, z - radius) && !this.blockedAt(x + radius, z - radius)
      && !this.blockedAt(x - radius, z + radius) && !this.blockedAt(x + radius, z + radius);
    const ox = pos.x, oz = pos.z;
    let nx = pos.x + dx, nz = pos.z;
    if (free(nx, nz)) pos.x = nx; else { nx = pos.x; }
    nz = pos.z + dz;
    if (free(nx, nz)) pos.z = nz;
    // head-on into something: deflect around it so round obstacles and corners don't stop movement dead
    if (pos.x === ox && pos.z === oz && (dx !== 0 || dz !== 0)) {
      const l = Math.hypot(dx, dz), a0 = Math.atan2(dz, dx);
      for (const da of [0.7, -0.7, 1.2, -1.2]) {
        const tx = ox + Math.cos(a0 + da) * l, tz = oz + Math.sin(a0 + da) * l;
        if (free(tx, tz)) { pos.x = tx; pos.z = tz; break; }
      }
    }
    if (!free(pos.x, pos.z)) { // got stuck inside (e.g. prop placed on us): nudge out
      for (let r = 0.5; r < 6; r += 0.5) for (let a = 0; a < 8; a++) {
        const tx = pos.x + Math.cos(a) * r, tz = pos.z + Math.sin(a) * r;
        if (free(tx, tz)) { pos.x = tx; pos.z = tz; return; }
      }
    }
  }
  isStreet(x, z) { return !this.blockedAt(x, z); }

  // ---------- generation ----------
  generate() {
    const rng = this.rng;
    this.makeGround();
    const open = []; // z-intervals where no blocks go
    let z = -116;
    while (z < 118) {
      const w = rng.float(7, 11);
      if (!(z > -38 && z < 44)) open.push({ z0: z - w / 2, z1: z + w / 2, cross: true });
      z += rng.float(30, 46);
    }
    open.push({ z0: this.plaza.z0, z1: this.plaza.z1, plaza: true });
    open.sort((a, b) => a.z0 - b.z0);
    this.crossStreets = open;
    // block rows between open regions
    const rows = [];
    let prev = this.minZ;
    for (const o of open) { if (o.z0 - prev > 10) rows.push({ z0: prev, z1: o.z0 }); prev = o.z1; }
    if (this.maxZ - prev > 10) rows.push({ z0: prev, z1: this.maxZ });

    let cx = 0;
    for (const row of rows) {
      const nearPlaza = row.z1 <= this.plaza.z0 + 1 && row.z1 >= this.plaza.z0 - 14 || row.z0 >= this.plaza.z1 - 1 && row.z0 <= this.plaza.z1 + 14;
      cx = nearPlaza ? rng.float(-3, 3) : Math.max(-9, Math.min(9, cx + rng.float(-7, 7)));
      row.cx = cx;
      this.avenueCenters.push({ z0: row.z0, z1: row.z1, cx });
      const isPlazaRow = row.z1 > this.plaza.z0 && row.z0 < this.plaza.z1;
      const leftEdge = isPlazaRow ? this.plaza.x0 : cx - this.avenueHalf;
      const rightEdge = isPlazaRow ? this.plaza.x1 : cx + this.avenueHalf;
      this.splitRegion(this.minX, leftEdge, row, 'left');
      this.splitRegion(rightEdge, this.maxX, row, 'right');
    }
    // the plaza row: blocks beyond the plaza x-range
    const plazaRow = { z0: this.plaza.z0, z1: this.plaza.z1, cx: 0 };
    this.splitRegion(this.minX, this.plaza.x0, plazaRow, 'left', true);
    this.splitRegion(this.plaza.x1, this.maxX, plazaRow, 'right', true);

    for (const b of this.blocks) this.fillBlock(b);
    this.buildBuildingMeshes();
    this.placeStreetFurniture();
    this.placePlaza();
    this.placeLineMarkers();
    this.placeCollectibles();
  }

  splitRegion(x0, x1, row, side, plazaRow = false) {
    const rng = this.rng;
    if (x1 - x0 < 12) return;
    const blocks = [];
    // cut the region at the global side streets, then subdivide very wide pieces with a short lane
    const cuts = this.sideStreets.filter((st) => st.x - st.w / 2 > x0 + 6 && st.x + st.w / 2 < x1 - 6).sort((a, b) => a.x - b.x);
    let x = x0;
    const pieces = [];
    for (const st of cuts) { pieces.push([x, st.x - st.w / 2]); x = st.x + st.w / 2; }
    pieces.push([x, x1]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 10) continue;
      if (p1 - p0 > 46 && rng.chance(0.6)) { const lane = rng.float(5, 7), mid = (p0 + p1) / 2 + rng.float(-6, 6); blocks.push({ x0: p0, x1: mid - lane / 2, z0: row.z0, z1: row.z1, side, plazaRow }); blocks.push({ x0: mid + lane / 2, x1: p1, z0: row.z0, z1: row.z1, side, plazaRow }); }
      else blocks.push({ x0: p0, x1: p1, z0: row.z0, z1: row.z1, side, plazaRow });
    }
    for (const b of blocks) {
      b.axis = side === 'left' ? Math.abs(b.x1 - x1) < 0.01 : Math.abs(b.x0 - x0) < 0.01; // touches avenue/plaza
      this.blocks.push(b);
    }
  }

  fillBlock(b) {
    const rng = this.rng;
    const W = b.x1 - b.x0, D = b.z1 - b.z0;
    const depth = Math.min(rng.float(9, 12), W / 2 - 0.5, D / 2 - 0.5);
    const lots = [];
    const addLots = (ax0, az0, ax1, az1, along, facing) => {
      const len = along === 'x' ? ax1 - ax0 : az1 - az0;
      let p = 0; const parts = [];
      while (p < len) { let w = rng.float(7, 13); if (len - (p + w) < 6) w = len - p; parts.push([p, p + w]); p += w; }
      for (const [s, e] of parts) {
        lots.push(along === 'x'
          ? { x0: ax0 + s, x1: ax0 + e, z0: az0, z1: az1, facing }
          : { x0: ax0, x1: ax1, z0: az0 + s, z1: az0 + e, facing });
      }
    };
    if (W < 16 || D < 16) {
      addLots(b.x0, b.z0, b.x1, b.z1, W >= D ? 'x' : 'z', b.side === 'left' ? '+x' : '-x');
    } else {
      addLots(b.x0, b.z1 - depth, b.x1, b.z1, 'x', '+z');
      addLots(b.x0, b.z0, b.x1, b.z0 + depth, 'x', '-z');
      addLots(b.x0, b.z0 + depth, b.x0 + depth, b.z1 - depth, 'z', '-x');
      addLots(b.x1 - depth, b.z0 + depth, b.x1, b.z1 - depth, 'z', '+x');
      // courtyard
      const cx0 = b.x0 + depth, cx1 = b.x1 - depth, cz0 = b.z0 + depth, cz1 = b.z1 - depth;
      if (cx1 - cx0 > 8 && cz1 - cz0 > 8) {
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) this.addProp('tree', rng.float(cx0 + 2, cx1 - 2), rng.float(cz0 + 2, cz1 - 2), 0, false);
      }
    }
    this.fillRect(b.x0, b.z0, b.x1, b.z1, 1);
    if (W >= 16 && D >= 16) { const cx0 = b.x0 + depth, cx1 = b.x1 - depth, cz0 = b.z0 + depth, cz1 = b.z1 - depth; if (cx1 - cx0 > 1 && cz1 - cz0 > 1) this.fillRect(cx0 + 0.5, cz0 + 0.5, cx1 - 0.5, cz1 - 0.5, 2); }
    const axisFacing = b.side === 'left' ? '+x' : '-x';
    for (const l of lots) {
      const near = b.plazaRow || Math.abs(l.z0) < 60;
      const floors = Math.max(2, Math.round(rng.gaussian(near ? 4.4 : 3.4, 1.0)));
      const h = GROUND_H + floors * FLOOR_H;
      const style = rng.int(0, TEX.FACADE_STYLES.length - 1);
      const front = b.axis && (l.facing === axisFacing || (b.plazaRow && l.facing === axisFacing));
      const pitched = rng.chance(0.3);
      this.buildings.push({
        id: this.buildings.length, x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, h, floors, style, front, pitched,
        facing: l.facing, hp: 100 + floors * 60, maxHp: 100 + floors * 60, alive: true, burning: 0,
        roofY: h, climbable: !pitched, kind: 'building', value: ECONOMY.prop.building,
        cx: (l.x0 + l.x1) / 2, cz: (l.z0 + l.z1) / 2, radius: Math.hypot(l.x1 - l.x0, l.z1 - l.z0) / 2,
      });
    }
  }

  buildingGeometry(b) {
    const pos = [], nor = [], uvs = [];
    const uv = this.atlas.uv;
    const quad = (p0, p1, p2, p3, n, t) => { // p0..p3 counter-clockwise seen from outside; t = [u0,v0,u1,v1]
      const [u0, v0, u1, v1] = t;
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let i = 0; i < 6; i++) nor.push(...n);
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    const upper = uv(b.style), ground = uv(8 + b.style);
    const sides = [
      { a: [b.x0, b.z1], b: [b.x1, b.z1], n: [0, 0, 1] },   // +z face
      { a: [b.x1, b.z1], b: [b.x1, b.z0], n: [1, 0, 0] },   // +x face
      { a: [b.x1, b.z0], b: [b.x0, b.z0], n: [0, 0, -1] },  // -z face
      { a: [b.x0, b.z0], b: [b.x0, b.z1], n: [-1, 0, 0] },  // -x face
    ];
    const parapet = b.pitched ? 0 : 0.45;
    for (const s of sides) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const bays = Math.max(1, Math.round(len / BAY_W));
      const dx = (s.b[0] - s.a[0]) / bays, dz = (s.b[1] - s.a[1]) / bays;
      for (let i = 0; i < bays; i++) {
        const x0 = s.a[0] + dx * i, z0 = s.a[1] + dz * i, x1 = x0 + dx, z1 = z0 + dz;
        quad([x0, 0, z0], [x1, 0, z1], [x1, GROUND_H, z1], [x0, GROUND_H, z0], s.n, ground);
        for (let f = 0; f < b.floors; f++) {
          const y0 = GROUND_H + f * FLOOR_H, y1 = y0 + FLOOR_H + (f === b.floors - 1 ? parapet : 0);
          const t = f === b.floors - 1 && parapet ? [upper[0], upper[1], upper[2], upper[1] + (upper[3] - upper[1]) * ((FLOOR_H + parapet) / FLOOR_H)] : upper;
          quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], s.n, t);
        }
      }
    }
    const roofT = uv(14), tileT = uv(15);
    if (!b.pitched) {
      // up-facing and inward-facing quads need the opposite winding to the walls
      const rq = (p0, p1, p2, p3, n, t) => quad(p0, p3, p2, p1, n, t);
      // terrace floor (slightly below parapet top) + inner parapet faces
      const y = b.h;
      rq([b.x0, y, b.z0], [b.x1, y, b.z0], [b.x1, y, b.z1], [b.x0, y, b.z1], [0, 1, 0], roofT);
      const yt = y + parapet, t = 0.3;
      rq([b.x0 + t, yt, b.z0 + t], [b.x1 - t, yt, b.z0 + t], [b.x1 - t, y, b.z0 + t], [b.x0 + t, y, b.z0 + t], [0, 0, 1], roofT);
      rq([b.x1 - t, yt, b.z1 - t], [b.x0 + t, yt, b.z1 - t], [b.x0 + t, y, b.z1 - t], [b.x1 - t, y, b.z1 - t], [0, 0, -1], roofT);
      rq([b.x0 + t, yt, b.z1 - t], [b.x0 + t, yt, b.z0 + t], [b.x0 + t, y, b.z0 + t], [b.x0 + t, y, b.z1 - t], [1, 0, 0], roofT);
      rq([b.x1 - t, yt, b.z0 + t], [b.x1 - t, yt, b.z1 - t], [b.x1 - t, y, b.z1 - t], [b.x1 - t, y, b.z0 + t], [-1, 0, 0], roofT);
      // parapet top ring
      rq([b.x0, yt, b.z0], [b.x1, yt, b.z0], [b.x1 - t, yt, b.z0 + t], [b.x0 + t, yt, b.z0 + t], [0, 1, 0], roofT);
      rq([b.x1, yt, b.z1], [b.x0, yt, b.z1], [b.x0 + t, yt, b.z1 - t], [b.x1 - t, yt, b.z1 - t], [0, 1, 0], roofT);
      rq([b.x0, yt, b.z1], [b.x0, yt, b.z0], [b.x0 + t, yt, b.z0 + t], [b.x0 + t, yt, b.z1 - t], [0, 1, 0], roofT);
      rq([b.x1, yt, b.z0], [b.x1, yt, b.z1], [b.x1 - t, yt, b.z1 - t], [b.x1 - t, yt, b.z0 + t], [0, 1, 0], roofT);
      // rooftop clutter: water tank / AC box
      const r = this.rng;
      if (r.chance(0.7)) {
        const w = r.float(1.2, 2.2), d = r.float(1.2, 2.2), hh = r.float(0.8, 1.8);
        const x = r.float(b.x0 + 1.5, b.x1 - 1.5 - w), z = r.float(b.z0 + 1.5, b.z1 - 1.5 - d);
        b.clutter = { x0: x, x1: x + w, z0: z, z1: z + d, top: y + hh };
        quad([x, y, z + d], [x + w, y, z + d], [x + w, y + hh, z + d], [x, y + hh, z + d], [0, 0, 1], roofT);
        quad([x + w, y, z + d], [x + w, y, z], [x + w, y + hh, z], [x + w, y + hh, z + d], [1, 0, 0], roofT);
        quad([x + w, y, z], [x, y, z], [x, y + hh, z], [x + w, y + hh, z], [0, 0, -1], roofT);
        quad([x, y, z], [x, y, z + d], [x, y + hh, z + d], [x, y + hh, z], [-1, 0, 0], roofT);
        rq([x, y + hh, z], [x + w, y + hh, z], [x + w, y + hh, z + d], [x, y + hh, z + d], [0, 1, 0], roofT);
      }
    } else {
      const y = b.h, ridge = y + Math.min(3, (b.z1 - b.z0) * 0.35), cz = (b.z0 + b.z1) / 2;
      const alongX = (b.x1 - b.x0) >= (b.z1 - b.z0);
      if (alongX) {
        quad([b.x0, y, b.z1], [b.x1, y, b.z1], [b.x1, ridge, cz], [b.x0, ridge, cz], [0, 0.7, 0.7], tileT);
        quad([b.x1, y, b.z0], [b.x0, y, b.z0], [b.x0, ridge, cz], [b.x1, ridge, cz], [0, 0.7, -0.7], tileT);
        // gables
        pos.push(b.x1, y, b.z1, b.x1, y, b.z0, b.x1, ridge, cz); nor.push(1, 0, 0, 1, 0, 0, 1, 0, 0); uvs.push(upper[0], upper[1], upper[2], upper[1], (upper[0] + upper[2]) / 2, upper[3]);
        pos.push(b.x0, y, b.z0, b.x0, y, b.z1, b.x0, ridge, cz); nor.push(-1, 0, 0, -1, 0, 0, -1, 0, 0); uvs.push(upper[0], upper[1], upper[2], upper[1], (upper[0] + upper[2]) / 2, upper[3]);
      } else {
        const cxm = (b.x0 + b.x1) / 2;
        quad([b.x1, y, b.z0], [b.x1, y, b.z1], [cxm, ridge, b.z1], [cxm, ridge, b.z0], [0.7, 0.7, 0], tileT);
        quad([b.x0, y, b.z1], [b.x0, y, b.z0], [cxm, ridge, b.z0], [cxm, ridge, b.z1], [-0.7, 0.7, 0], tileT);
        pos.push(b.x0, y, b.z1, b.x1, y, b.z1, cxm, ridge, b.z1); nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1); uvs.push(upper[0], upper[1], upper[2], upper[1], (upper[0] + upper[2]) / 2, upper[3]);
        pos.push(b.x1, y, b.z0, b.x0, y, b.z0, cxm, ridge, b.z0); nor.push(0, 0, -1, 0, 0, -1, 0, 0, -1); uvs.push(upper[0], upper[1], upper[2], upper[1], (upper[0] + upper[2]) / 2, upper[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return g;
  }

  buildBuildingMeshes() {
    const staticGeos = [];
    for (const b of this.buildings) {
      const g = this.buildingGeometry(b);
      if (b.front) {
        const m = new THREE.Mesh(g, this.facadeMat);
        m.castShadow = true; m.receiveShadow = true; m.userData.building = b; b.mesh = m;
        this.group.add(m);
        this.addFrontDetails(b);
      } else staticGeos.push(g);
    }
    if (staticGeos.length) {
      const merged = mergeGeometries(staticGeos, false);
      const m = new THREE.Mesh(merged, this.facadeMat); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      for (const g of staticGeos) g.dispose();
    }
  }

  /** Breakable ground-floor windows and lootables in front of buildings facing the riot axis. */
  addFrontDetails(b) {
    const rng = this.rng;
    const face = b.facing; // '+x' | '-x' | '+z' | '-z'
    const n = face === '+x' ? [1, 0] : face === '-x' ? [-1, 0] : face === '+z' ? [0, 1] : [0, -1];
    const along = face === '+x' || face === '-x' ? 'z' : 'x';
    const len = along === 'z' ? b.z1 - b.z0 : b.x1 - b.x0;
    const bays = Math.max(1, Math.round(len / BAY_W));
    const fx = face === '+x' ? b.x1 : face === '-x' ? b.x0 : null;
    const fz = face === '+z' ? b.z1 : face === '-z' ? b.z0 : null;
    for (let i = 0; i < bays; i++) {
      const t = (i + 0.5) / bays;
      const px = fx ?? b.x0 + len * t, pz = fz ?? b.z0 + len * t;
      // window plane just in front of the facade
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.0), this.glassMat);
      w.position.set(px + n[0] * 0.06, 2.2, pz + n[1] * 0.06);
      w.rotation.y = face === '+x' ? Math.PI / 2 : face === '-x' ? -Math.PI / 2 : face === '+z' ? 0 : Math.PI;
      this.group.add(w);
      this.props.push({ group: w, kind: 'fragile', type: 'window', hp: 1, maxHp: 1, radius: 1.0, blocking: false,
        value: ECONOMY.prop.fragile, alive: true, x: w.position.x, z: w.position.z, y: 2.2, height: 3, building: b });
      // something lootable or decorative in front of some bays
      if (rng.chance(0.45)) {
        const type = rng.pick(['jewelryCase', 'artPiece', 'flowerPot', 'cafeTable', 'chair', 'scooter', 'bikeRack', 'newspaperBox', 'trashCan']);
        this.addProp(type, px + n[0] * rng.float(1.2, 2.4), pz + n[1] * rng.float(1.2, 2.4), rng.float(0, Math.PI * 2));
      }
    }
  }

  addProp(type, x, z, rotY = 0, markGrid = true, y = 0) {
    const p = PROPS[type](this.rng);
    p.group.position.set(x, y, z); p.group.rotation.y = rotY;
    p.x = x; p.z = z; p.y = y; p.alive = true; p.rot = rotY;
    this.group.add(p.group);
    this.props.push(p);
    if (markGrid && p.blocking) this.markProp(p, 1);
    return p;
  }
  markProp(p, v) {
    if (p.halfW) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const hw = Math.abs(c) * p.halfW + Math.abs(s) * p.halfD, hd = Math.abs(s) * p.halfW + Math.abs(c) * p.halfD;
      this.fillRect(p.x - hw, p.z - hd, p.x + hw, p.z + hd, v);
    } else this.fillCircle(p.x, p.z, Math.max(0.5, p.radius * 0.8), v);
  }

  placeStreetFurniture() {
    const rng = this.rng;
    for (const row of this.avenueCenters) {
      const isPlaza = row.z1 > this.plaza.z0 && row.z0 < this.plaza.z1;
      if (isPlaza) continue;
      for (let z = row.z0 + 6; z < row.z1 - 4; z += 12) {
        this.addProp('lamppost', row.cx - this.avenueHalf + 0.8, z, Math.PI / 2);
        this.addProp('lamppost', row.cx + this.avenueHalf - 0.8, z + 6, -Math.PI / 2);
      }
      // parked cars along the avenue edges in some rows
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const side = rng.chance(0.5) ? -1 : 1;
        const z = rng.float(row.z0 + 4, row.z1 - 4);
        if (Math.abs(z) < 36) continue;
        this.addProp('car', row.cx + side * (this.avenueHalf - 2.2), z, Math.PI / 2 + rng.float(-0.05, 0.05));
      }
      if (rng.chance(0.5)) this.addProp('dumpster', row.cx + (rng.chance(0.5) ? -1 : 1) * (this.avenueHalf - 1.5), rng.float(row.z0 + 3, row.z1 - 3), 0);
      if (rng.chance(0.6)) this.addProp('streetSign', row.cx + (rng.chance(0.5) ? -1 : 1) * (this.avenueHalf - 0.6), rng.float(row.z0 + 3, row.z1 - 3), 0);
    }
    // shopfront loot along the side streets (mobs loot the periphery before moving on the core)
    for (const st of this.sideStreets) for (let z = -120; z < 120; z += rng.float(6, 11)) {
      const side = rng.chance(0.5) ? -1 : 1; const x = st.x + side * (st.w / 2 - 1.1);
      if (this.blockedAt(x, z)) continue;
      this.addProp(rng.pick(['jewelryCase', 'artPiece', 'flowerPot', 'scooter', 'newspaperBox', 'trashCan', 'cafeTable', 'chair', 'bikeRack']), x, z, rng.float(0, 6.28));
    }
    // side-street lampposts
    for (const st of this.sideStreets) for (let z = -120; z < 120; z += 18) if (!this.blockedAt(st.x - st.w / 2 + 0.7, z)) this.addProp('lamppost', st.x - st.w / 2 + 0.7, z + rng.float(-3, 3), Math.PI / 2);
    // cross-street furniture
    for (const s of this.crossStreets) {
      if (!s.cross) continue;
      const zc = (s.z0 + s.z1) / 2;
      for (let i = 0; i < 3; i++) {
        const x = rng.float(-80, 80); if (Math.abs(x) < 14) continue;
        if (this.sideStreets.some((st) => Math.abs(st.x - x) < st.w / 2 + 3)) continue;
        const type = rng.pick(['car', 'scooter', 'trashCan', 'dumpster', 'bikeRack', 'streetSign']);
        this.addProp(type, x, zc + rng.float(-2, 2), rng.float(0, 6.28));
      }
    }
    // peacekeeper command post: vans parked across the north end of the plaza
    for (const x of [-9, 0, 9]) this.addProp('riotVan', x, 26 + rng.float(-1, 1), Math.PI / 2 + rng.float(-0.1, 0.1));
    // crowd barriers in short runs at the plaza mouths, leaving clear 4m+ gaps for people to pass
    const run = (x, z, dx, dz, n) => { for (let i = 0; i < n; i++) this.addProp('barrier', x + dx * i * 2.25, z + dz * i * 2.25, dx ? rng.float(-0.08, 0.08) : Math.PI / 2); };
    run(-16, this.plaza.z0 + 1.5, 1, 0, 3); run(-4, this.plaza.z0 + 1.5, 1, 0, 3); run(9, this.plaza.z0 + 1.5, 1, 0, 3);
    run(-16, this.plaza.z1 - 1.5, 1, 0, 2); run(6, this.plaza.z1 - 1.5, 1, 0, 3);
    run(this.plaza.x0 + 1.5, -18, 0, 1, 3); run(this.plaza.x0 + 1.5, 6, 0, 1, 3);
    run(this.plaza.x1 - 1.5, -14, 0, 1, 3); run(this.plaza.x1 - 1.5, 12, 0, 1, 3);
    // benches on the avenue
    for (let i = 0; i < 10; i++) {
      const row = rng.pick(this.avenueCenters); const z = rng.float(row.z0 + 2, row.z1 - 2);
      const side = rng.chance(0.5) ? -1 : 1;
      this.addProp('bench', row.cx + side * (this.avenueHalf - 1.2), z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  placePlaza() {
    const rng = this.rng; const P = this.plaza;
    this.addProp('fountain', -9, -19, 0);
    this.addProp('statue', 9, 19, 0);
    for (let z = P.z0 + 4; z < P.z1 - 2; z += 8) { this.addProp('palm', P.x0 + 3, z, 0); this.addProp('palm', P.x1 - 3, z + 4, 0); }
    for (let z = P.z0 + 3; z < P.z1 - 3; z += 10) { this.addProp('lamppost', P.x0 + 6, z, Math.PI / 2); this.addProp('lamppost', P.x1 - 6, z + 5, -Math.PI / 2); }
    // market stalls in two rows
    for (let i = 0; i < 4; i++) { this.addProp('marketStall', -24 + rng.float(-1, 1), 18 + i * 3.4 - 6, Math.PI / 2); this.addProp('marketStall', 24 + rng.float(-1, 1), 18 + i * 3.4 - 6, -Math.PI / 2); }
    // cafe terraces near the sides
    for (let i = 0; i < 14; i++) {
      const x = rng.pick([-1, 1]) * rng.float(18, 30), z = rng.float(P.z0 + 3, P.z1 - 3);
      if (Math.abs(x) > 20 && z > 8 && z < 24) continue;
      this.addProp('cafeTable', x, z, 0);
      this.addProp('chair', x + 0.8, z, Math.PI / 2); this.addProp('chair', x - 0.8, z, -Math.PI / 2);
    }
    for (let i = 0; i < 6; i++) this.addProp('flowerPot', rng.float(-30, 30), rng.float(P.z0 + 2, P.z1 - 2), 0);
    for (let i = 0; i < 4; i++) this.addProp('trashCan', rng.float(-30, 30), rng.float(P.z0 + 2, P.z1 - 2), 0);
    for (let i = 0; i < 4; i++) this.addProp('newspaperBox', rng.float(-30, 30), rng.float(P.z0 + 2, P.z1 - 2), rng.float(0, 6.28));
    for (let i = 0; i < 3; i++) this.addProp('bench', rng.float(-28, 28), rng.float(-24, -16), rng.float(0, 6.28));
    // small grass patches in the plaza corners
    for (const [x, z] of [[P.x0 + 7, P.z0 + 7], [P.x1 - 7, P.z0 + 7], [P.x0 + 7, P.z1 - 7], [P.x1 - 7, P.z1 - 7]]) {
      const g = new THREE.Mesh(new THREE.CircleGeometry(5, 18), this.grassMat);
      g.rotation.x = -Math.PI / 2; g.position.set(x, 0.03, z); g.receiveShadow = true; this.group.add(g);
    }
  }

  placeLineMarkers() {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(72, 0.6), new THREE.MeshBasicMaterial({ map: TEX.lineStripe(), transparent: true, depthWrite: false }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.04, 0); this.group.add(stripe);
  }

  placeCollectibles() {
    const rng = this.rng;
    const types = ['rock', 'rock', 'molotov', 'teargas', 'flashbang', 'rock', 'molotov', 'teargas', 'flashbang'];
    for (let i = 0; i < 28; i++) this.spawnCollectible(rng.pick(types), rng.float(-32, 32), rng.float(-70, 70));
  }
  spawnCollectible(type, x, z) {
    for (let t = 0; t < 10 && this.blockedAt(x, z); t++) { x += this.rng.float(-3, 3); z += this.rng.float(-3, 3); }
    if (this.blockedAt(x, z)) return null;
    const m = collectibleMesh(type, PROJECTILES[type].color);
    m.position.set(x, 1.0, z); this.group.add(m);
    const c = { type, x, z, mesh: m, alive: true, phase: this.rng.float(0, 6.28) };
    this.collectibles.push(c); return c;
  }

  makeGround() {
    const cob = TEX.cobblestone(this.rng.int(1, 1e6)); cob.repeat.set(this.gw / 3, this.gd / 3);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.gw + 400, this.gd + 400), new THREE.MeshLambertMaterial({ map: cob }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.group.add(ground);
    const slab = TEX.slabs(this.rng.int(1, 1e6)); const P = this.plaza; slab.repeat.set((P.x1 - P.x0) / 6, (P.z1 - P.z0) / 6);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0), new THREE.MeshLambertMaterial({ map: slab }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set((P.x0 + P.x1) / 2, 0.02, (P.z0 + P.z1) / 2); plaza.receiveShadow = true; this.group.add(plaza);
    this.grassMat = new THREE.MeshLambertMaterial({ map: TEX.grass() });
    // kerb/sidewalk strips along the avenue would be nice; keep the ground simple for perf.
  }

  // ---------- queries ----------
  /** Buildings/monuments with a climbable face near (x,z) that `facing` points into. */
  climbableAt(x, z, fx, fz) {
    for (const b of this.buildings) {
      if (!b.climbable || !b.alive) continue;
      if (x < b.x0 - 1.6 || x > b.x1 + 1.6 || z < b.z0 - 1.6 || z > b.z1 + 1.6) continue;
      const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; if (inside) continue;
      const tx = Math.max(b.x0, Math.min(b.x1, x)) - x, tz = Math.max(b.z0, Math.min(b.z1, z)) - z;
      const d = Math.hypot(tx, tz); if (d > 1.6 || d < 1e-4) continue;
      if ((tx / d) * fx + (tz / d) * fz > 0.55) return { target: b, roofY: b.roofY, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
    }
    for (const p of this.props) {
      if (!p.climbable || !p.alive) continue;
      const x0 = p.x - p.halfW, x1 = p.x + p.halfW, z0 = p.z - p.halfD, z1 = p.z + p.halfD;
      if (x < x0 - 2 || x > x1 + 2 || z < z0 - 2 || z > z1 + 2) continue;
      const tx = Math.max(x0, Math.min(x1, x)) - x, tz = Math.max(z0, Math.min(z1, z)) - z;
      const d = Math.hypot(tx, tz); if (d < 1e-4) continue;
      if ((tx / d) * fx + (tz / d) * fz > 0.5) return { target: p, roofY: p.roofY, x0, x1, z0, z1 };
    }
    return null;
  }
  nearestProp(x, z, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const p of this.props) {
      if (!p.alive || (filter && !filter(p))) continue;
      const d = Math.hypot(p.x - x, p.z - z) - (p.radius || 0) * 0.5;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  buildingNear(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  /** Avenue centre x at a given z (so bots form lines across the street, not into buildings). */
  avenueCenterAt(z) {
    for (const r of this.avenueCenters) if (z >= r.z0 && z <= r.z1) return r.cx;
    return 0;
  }
  avenueHalfAt(z) {
    const P = this.plaza; if (z > P.z0 && z < P.z1) return (P.x1 - P.x0) / 2 - 4;
    return this.avenueHalf - 0.8;
  }

  update(dt) {
    this.time += dt;
    for (const c of this.collectibles) {
      if (!c.alive) continue;
      c.mesh.position.y = 1.0 + Math.sin(this.time * 2 + c.phase) * 0.2;
      c.mesh.rotation.y += dt * 1.5;
    }
  }
}
