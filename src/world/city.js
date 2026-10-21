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
    this.generate();
  }

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
    let x = x0;
    while (x < x1) {
      let w = rng.float(24, 40);
      if (x1 - (x + w) < 14) w = x1 - x;
      blocks.push({ x0: x, x1: x + w, z0: row.z0, z1: row.z1, side, plazaRow });
      x += w + rng.float(5, 8);
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
    const parapet = b.pitched ? 0 : 0.8;
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
      // terrace floor (slightly below parapet top) + inner parapet faces
      const y = b.h;
      quad([b.x0, y, b.z0], [b.x1, y, b.z0], [b.x1, y, b.z1], [b.x0, y, b.z1], [0, 1, 0], roofT);
      const yt = y + parapet, t = 0.3;
      quad([b.x0 + t, yt, b.z0 + t], [b.x1 - t, yt, b.z0 + t], [b.x1 - t, y, b.z0 + t], [b.x0 + t, y, b.z0 + t], [0, 0, 1], roofT);
      quad([b.x1 - t, yt, b.z1 - t], [b.x0 + t, yt, b.z1 - t], [b.x0 + t, y, b.z1 - t], [b.x1 - t, y, b.z1 - t], [0, 0, -1], roofT);
      quad([b.x0 + t, yt, b.z1 - t], [b.x0 + t, yt, b.z0 + t], [b.x0 + t, y, b.z0 + t], [b.x0 + t, y, b.z1 - t], [1, 0, 0], roofT);
      quad([b.x1 - t, yt, b.z0 + t], [b.x1 - t, yt, b.z1 - t], [b.x1 - t, y, b.z1 - t], [b.x1 - t, y, b.z0 + t], [-1, 0, 0], roofT);
      // parapet top ring
      quad([b.x0, yt, b.z0], [b.x1, yt, b.z0], [b.x1 - t, yt, b.z0 + t], [b.x0 + t, yt, b.z0 + t], [0, 1, 0], roofT);
      quad([b.x1, yt, b.z1], [b.x0, yt, b.z1], [b.x0 + t, yt, b.z1 - t], [b.x1 - t, yt, b.z1 - t], [0, 1, 0], roofT);
      quad([b.x0, yt, b.z1], [b.x0, yt, b.z0], [b.x0 + t, yt, b.z0 + t], [b.x0 + t, yt, b.z1 - t], [0, 1, 0], roofT);
      quad([b.x1, yt, b.z0], [b.x1, yt, b.z1], [b.x1 - t, yt, b.z1 - t], [b.x1 - t, yt, b.z0 + t], [0, 1, 0], roofT);
      // rooftop clutter: water tank / AC box
      const r = this.rng;
      if (r.chance(0.7)) {
        const w = r.float(1.2, 2.2), d = r.float(1.2, 2.2), hh = r.float(0.8, 1.8);
        const x = r.float(b.x0 + 1.5, b.x1 - 1.5 - w), z = r.float(b.z0 + 1.5, b.z1 - 1.5 - d);
        quad([x, y, z + d], [x + w, y, z + d], [x + w, y + hh, z + d], [x, y + hh, z + d], [0, 0, 1], roofT);
        quad([x + w, y, z + d], [x + w, y, z], [x + w, y + hh, z], [x + w, y + hh, z + d], [1, 0, 0], roofT);
        quad([x + w, y, z], [x, y, z], [x, y + hh, z], [x + w, y + hh, z], [0, 0, -1], roofT);
        quad([x, y, z], [x, y, z + d], [x, y + hh, z + d], [x, y + hh, z], [-1, 0, 0], roofT);
        quad([x, y + hh, z], [x + w, y + hh, z], [x + w, y + hh, z + d], [x, y + hh, z + d], [0, 1, 0], roofT);
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
    // cross-street furniture
    for (const s of this.crossStreets) {
      if (!s.cross) continue;
      const zc = (s.z0 + s.z1) / 2;
      for (let i = 0; i < 3; i++) {
        const x = rng.float(-80, 80); if (Math.abs(x) < 14) continue;
        const type = rng.pick(['car', 'scooter', 'trashCan', 'dumpster', 'bikeRack', 'streetSign']);
        this.addProp(type, x, zc + rng.float(-2, 2), rng.float(0, 6.28));
      }
    }
    // peacekeeper vans behind their spawn
    for (const x of [-7, 0, 7]) this.addProp('riotVan', x, 74 + rng.float(-2, 2), Math.PI / 2);
    // crowd barriers near the line
    for (let x = -14; x <= 14; x += 2.4) if (rng.chance(0.8)) this.addProp('barrier', x + rng.float(-0.2, 0.2), 3 + rng.float(-0.3, 0.3), rng.float(-0.1, 0.1));
    for (let i = 0; i < 6; i++) this.addProp('barrier', rng.float(-30, 30), rng.float(-18, -6), rng.float(0, 6.28));
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
      if (x < b.x0 - 1.2 || x > b.x1 + 1.2 || z < b.z0 - 1.2 || z > b.z1 + 1.2) continue;
      const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; if (inside) continue;
      const tx = Math.max(b.x0, Math.min(b.x1, x)) - x, tz = Math.max(b.z0, Math.min(b.z1, z)) - z;
      const d = Math.hypot(tx, tz); if (d > 1.2 || d < 1e-4) continue;
      if ((tx / d) * fx + (tz / d) * fz > 0.6) return { target: b, roofY: b.roofY, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
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
