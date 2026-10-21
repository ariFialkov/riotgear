// Procedural low-poly humanoid with per-archetype costume, held weapons, and a procedural animation
// state machine (walk/run, attacks with several swing variants, throws, duck, jump, KO fall, climb,
// shield block, carrying a restrained rioter, holding a prop overhead).
import * as THREE from 'three';
import { mat, box, cyl, sph } from '../world/props.js';
import { ARCHETYPES, WEAPONS } from '../data/config.js';
import { tattoo } from '../world/textures.js';

let tattooTex = null;
const SKINS = ['#f1c9a5', '#e0ac7e', '#c68c5a', '#9c6b43', '#6b4a2f', '#f5d6bd'];
const HOODIES = ['#141414', '#1c1c1c', '#232323', '#1a2420', '#241a1a'];
const BANDANAS = ['#c62828', '#111', '#ef6c00', '#1565c0', '#6a1b9a', '#2e7d32'];

const BUILDS = {
  standard: { w: 1.0, h: 1.0, arm: 1.0 },
  heavy:    { w: 1.3, h: 1.07, arm: 1.3 },
  agile:    { w: 0.88, h: 1.0, arm: 0.9 },
  stocky:   { w: 1.2, h: 0.94, arm: 1.15 },
};

export function buildWeapon(id) {
  const g = new THREE.Group();
  const wood = mat('#8a5a2b'), steel = mat('#8d949c'), black = mat('#1e1e1e');
  switch (id) {
    case 'baton': g.add(cyl(0.025, 0.65, black, 0, -0.25, 0)); g.add(cyl(0.035, 0.12, mat('#444'), 0, 0.02, 0)); break;
    case 'pepper': g.add(cyl(0.04, 0.18, mat('#c62828'), 0, -0.05, 0)); g.add(cyl(0.02, 0.05, black, 0, 0.07, 0)); break;
    case 'prod': g.add(cyl(0.025, 0.9, mat('#2b2b2b'), 0, -0.4, 0)); g.add(cyl(0.02, 0.12, mat('#ffd600', { emissive: '#ffd600', emissiveIntensity: 0.6 }), 0, -0.9, 0)); break;
    case 'flail': {
      g.add(cyl(0.025, 0.45, black, 0, -0.18, 0));
      for (let i = 0; i < 5; i++) g.add(sph(0.03, steel, 0, -0.45 - i * 0.09, 0));
      g.add(sph(0.11, steel, 0, -0.95, 0)); break;
    }
    case 'gauntlets': g.add(box(0.14, 0.12, 0.16, mat('#2a3a5a', { emissive: '#3d8bff', emissiveIntensity: 0.9 }), 0, 0.02, 0)); break;
    case 'plank': g.add(box(0.09, 1.0, 0.045, wood, 0, -0.4, 0)); break;
    case 'knuckles': g.add(box(0.12, 0.06, 0.1, mat('#d4af37', { emissive: '#6a5410', emissiveIntensity: 0.3 }), 0, 0.03, 0.04)); break;
    case 'bat': { const b = cyl(0.03, 0.85, mat('#c9a070'), 0, -0.35, 0, 0.045); g.add(b); g.add(cyl(0.035, 0.05, black, 0, 0.08, 0)); break; }
    case 'nunchucks': {
      g.add(cyl(0.022, 0.32, black, 0, -0.1, 0)); for (let i = 0; i < 3; i++) g.add(sph(0.02, steel, 0, -0.3 - i * 0.05, 0));
      const b = cyl(0.022, 0.32, black, 0.05, -0.55, 0.1); b.rotation.z = 0.5; g.add(b); break;
    }
    case 'sledge': g.add(cyl(0.028, 0.95, wood, 0, -0.4, 0)); g.add(box(0.12, 0.13, 0.26, mat('#3b3b3b'), 0, -0.88, 0)); break;
    case 'gun': g.add(box(0.07, 0.12, 0.5, black, 0, 0, 0.2)); g.add(cyl(0.035, 0.3, mat('#444'), 0, 0, 0.5)); g.children[1].rotation.x = Math.PI / 2; g.add(box(0.05, 0.14, 0.06, black, 0, -0.1, 0.05)); break;
    case 'smokestick': g.add(cyl(0.02, 0.35, mat('#444'), 0, -0.1, 0)); g.add(cyl(0.028, 0.1, mat('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 1.5 }), 0, 0.1, 0)); break;
    case 'shield': {
      const s = box(0.62, 1.1, 0.03, mat('#9bc4e8', { transparent: true, opacity: 0.55 }), 0, -0.25, 0.12);
      g.add(s); g.add(box(0.64, 0.05, 0.05, black, 0, 0.3, 0.12)); g.add(box(0.64, 0.05, 0.05, black, 0, -0.8, 0.12));
      g.add(box(0.3, 0.1, 0.02, mat('#f5f5f5'), 0, -0.1, 0.14)); break;
    }
    default: break;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Humanoid {
  constructor({ archetype, weapon = null, rng, isPlayer = false, bandana = null }) {
    this.arch = ARCHETYPES[archetype]; this.faction = this.arch.faction; this.rng = rng; this.isPlayer = isPlayer;
    const B = BUILDS[this.arch.build] || BUILDS.standard; this.build = B;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.legLen = 0.85 * B.h; this.body.position.y = this.legLen;
    this.height = 1.78 * B.h;
    const pk = this.faction === 'peacekeeper';
    const skin = mat(rng.pick(SKINS));
    const armorC = pk ? mat('#1b2538') : null, plateC = pk ? mat('#2d3b55') : null;
    const hoodie = pk ? null : mat(this.arch.npc ? rng.pick(HOODIES) : '#141414');
    const bandanaC = mat(bandana || rng.pick(BANDANAS));
    const tank = mat('#d8d8d0');
    if (!tattooTex) tattooTex = tattoo();
    const tattooMat = new THREE.MeshLambertMaterial({ map: tattooTex });

    // torso
    const tw = 0.42 * B.w, th = 0.62 * B.h, td = 0.24 * B.w;
    const torsoM = pk ? armorC : (this.arch.tanktop ? tank : hoodie);
    this.torso = new THREE.Group(); this.body.add(this.torso);
    this.torso.add(box(tw, th, td, torsoM, 0, th / 2, 0));
    if (pk) {
      this.torso.add(box(tw * 0.9, th * 0.5, td * 1.1, plateC, 0, th * 0.62, 0)); // chest plate
      this.torso.add(box(tw * 0.5, th * 0.3, td * 1.12, mat(this.arch.npc ? '#ffd600' : '#3d8bff'), 0, th * 0.35, 0)); // stripe / hi-vis
      this.torso.add(box(tw * 0.35, th * 0.14, 0.02, mat('#eee'), 0, th * 0.75, td * 0.56)); // badge
    } else if (!this.arch.tanktop) {
      this.torso.add(box(tw * 1.05, th * 0.18, td * 1.05, hoodie, 0, th * 0.9, -0.03)); // hood bunch
      if (this.arch.spraycan) { const c = cyl(0.04, 0.16, mat('#ffea00'), tw * 0.5, 0.1, 0.05); this.torso.add(c); this.torso.add(cyl(0.04, 0.16, mat('#ff1744'), -tw * 0.5, 0.1, 0.05)); }
    }
    // belt + hips
    this.torso.add(box(tw * 1.02, 0.08, td * 1.02, mat('#222'), 0, 0.02, 0));

    // head
    this.head = new THREE.Group(); this.head.position.y = th + 0.04; this.torso.add(this.head);
    const hs = 0.24;
    this.head.add(box(hs, hs * 1.1, hs, skin, 0, hs * 0.55, 0));
    if (pk) {
      const helmetC = this.arch.helmet === 'crest' ? mat('#e8e8e8') : mat('#1f2630');
      const helm = sph(hs * 0.78, helmetC, 0, hs * 0.72, 0); helm.scale.y *= 0.9; this.head.add(helm);
      this.head.add(box(hs * 1.05, hs * 0.5, hs * 0.3, mat('#0d1117', { transparent: true, opacity: 0.85 }), 0, hs * 0.55, hs * 0.5)); // visor
      if (this.arch.helmet === 'crest') {
        this.head.add(box(0.05, 0.1, hs * 1.2, mat('#c62828'), 0, hs * 1.15, -0.02));
        this.head.add(box(hs * 1.4, 0.05, hs * 1.4, mat('#d4af37'), 0, hs * 0.95, 0));
      }
    } else {
      this.head.add(box(hs * 1.05, hs * 0.38, hs * 1.05, bandanaC, 0, hs * 0.38, 0)); // face bandana
      if (!this.arch.tanktop) this.head.add(box(hs * 1.25, hs * 0.9, hs * 1.2, hoodie, 0, hs * 0.85, -0.03)); // hood up
      else this.head.add(box(hs * 1.1, hs * 0.2, hs * 1.1, bandanaC, 0, hs * 1.05, 0)); // head bandana
    }

    // arms
    const aw = 0.11 * B.arm, al = 0.62 * B.h;
    const armM = pk ? armorC : (this.arch.tanktop ? tattooMat : hoodie);
    const mkArm = (side) => {
      const g = new THREE.Group(); g.position.set(side * (tw / 2 + aw / 2 + 0.01), th - 0.05, 0); this.torso.add(g);
      g.add(box(aw, al * 0.5, aw, armM, 0, -al * 0.25, 0));
      g.add(box(aw * 0.95, al * 0.5, aw * 0.95, armM, 0, -al * 0.75, 0));
      if (pk) g.add(sph(aw * 0.9, plateC, 0, 0, 0)); // shoulder pad
      const hand = new THREE.Group(); hand.position.y = -al; g.add(hand);
      hand.add(box(aw * 0.9, 0.1, aw * 0.9, pk ? mat('#111') : skin, 0, -0.03, 0));
      g.hand = hand; return g;
    };
    this.armR = mkArm(1); this.armL = mkArm(-1);
    this.handR = this.armR.hand; this.handL = this.armL.hand;

    // legs
    const lw = 0.15 * B.w;
    const legM = pk ? armorC : mat('#1a1a22');
    const mkLeg = (side) => {
      const g = new THREE.Group(); g.position.set(side * (tw / 2 - lw / 2), 0, 0); this.body.add(g);
      g.add(box(lw, this.legLen * 0.52, lw, legM, 0, -this.legLen * 0.26, 0));
      g.add(box(lw * 0.95, this.legLen * 0.5, lw * 0.95, legM, 0, -this.legLen * 0.75, 0));
      if (pk) g.add(box(lw * 1.1, 0.12, lw * 1.1, plateC, 0, -this.legLen * 0.5, 0.01)); // knee pad
      g.add(box(lw * 1.1, 0.08, lw * 1.6, pk ? mat('#111') : mat('#f0f0f0'), 0, -this.legLen + 0.04, 0.04)); // boot/sneaker
      return g;
    };
    this.legR = mkLeg(1); this.legL = mkLeg(-1);

    // equipment
    this.weaponGroup = new THREE.Group(); this.handR.add(this.weaponGroup);
    this.weaponGroup.rotation.x = 0.5;
    this.setWeapon(weapon);
    if (this.arch.shield) { this.shield = buildWeapon('shield'); this.handL.add(this.shield); this.shield.rotation.x = -0.2; }
    if (this.arch.gun) { this.gun = buildWeapon('gun'); this.handL.add(this.gun); this.gun.position.set(0.02, 0, 0.1); this.gun.rotation.x = -1.2; }
    if (this.arch.smokestick) { this.smoke = buildWeapon('smokestick'); this.handL.add(this.smoke); this.smokeTip = new THREE.Object3D(); this.smokeTip.position.y = 0.15; this.smoke.add(this.smokeTip); }

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

    // animation state
    this.phase = rng.float(0, 6.28); this.speed = 0; this.action = null;
    this.duck = 0; this.fall = 0; this.fallDir = 1; this.climb = 0; this.block = 0; this.carry = 0; this.hold = 0;
    this.jumpY = 0; this.flags = {}; this.lastVariant = -1; this.stun = 0;
  }

  setWeapon(id) {
    this.weaponId = id;
    while (this.weaponGroup.children.length) this.weaponGroup.remove(this.weaponGroup.children[0]);
    if (id) this.weaponGroup.add(buildWeapon(id));
  }

  /** Start an action: attack (variant chosen semi-randomly per weapon), throw, bash, grab, loot, fire. */
  play(type, { dur = 0.45, variant = null, onHit = null } = {}) {
    if (variant === null && type === 'attack') {
      const w = this.weaponId && (WEAPONS.rioter.concat(WEAPONS.peacekeeper)).find((x) => x.id === this.weaponId);
      const mech = w?.mech || 'swing';
      const pool = { swing: ['swipeR', 'swipeL', 'overhead', 'stab', 'uppercut'], combo: ['jabR', 'jabL', 'uppercut', 'hook'], spray: ['spray'],
        stun: ['stab', 'stab', 'jabR'], sweep: ['swipeR', 'swipeL', 'spin'], pulse: ['jabR', 'jabL', 'overhead', 'hook'], flurry: ['flurry', 'swipeR', 'swipeL'], slam: ['overhead', 'overhead', 'swipeR'] }[mech];
      let v = this.rng.int(0, pool.length - 1);
      if (pool.length > 1 && v === this.lastVariant) v = (v + 1) % pool.length;
      this.lastVariant = v; variant = pool[v];
    }
    this.action = { type, t: 0, dur, variant: variant || type, onHit, hitDone: false };
  }
  get busy() { return !!this.action; }

  update(dt, { speed = 0, moving = false, duck = false, jumpY = 0, ko = false, climbing = false, blocking = false, carrying = false, holding = false, stunned = false, stance = 0 } = {}) {
    const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
    this.duck = lerp(this.duck, duck ? 1 : 0, dt * 8);
    this.fall = lerp(this.fall, ko ? 1 : 0, dt * (ko ? 4 : 2.5));
    this.climb = lerp(this.climb, climbing ? 1 : 0, dt * 6);
    this.block = lerp(this.block, blocking ? 1 : 0, dt * 8);
    this.carry = lerp(this.carry, carrying ? 1 : 0, dt * 6);
    this.hold = lerp(this.hold, holding ? 1 : 0, dt * 6);
    this.jumpY = jumpY;

    // locomotion
    const run = Math.min(1, speed / 4.5);
    if (moving && !ko) this.phase += dt * (6 + speed * 1.6); else this.phase += dt * 1.2;
    const amp = moving ? 0.45 + 0.45 * run : 0;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const duckBend = this.duck;
    this.legL.rotation.x = s * amp + duckBend * 0.9;
    this.legR.rotation.x = -s * amp + duckBend * 0.9;
    const idleBob = moving ? Math.abs(c) * 0.04 * run : Math.sin(this.phase) * 0.012;
    this.body.position.y = this.legLen + idleBob - duckBend * 0.38 + this.jumpY;
    this.torso.rotation.x = 0.06 * run + duckBend * 0.35;
    this.torso.rotation.y = moving ? c * 0.08 * run : 0;
    this.torso.rotation.z = 0;
    this.head.rotation.set(0, 0, 0);
    // arms default: swing with walk
    let arx = -s * amp * 0.8, alx = s * amp * 0.8, ary = 0, aly = 0, arz = 0.08, alz = -0.08;
    if (this.weaponId && !moving) { arx = -0.25; arz = 0.25; }
    if (stance > 0) { arx = -0.6 * stance; alx = -0.4 * stance; } // ready stance when enemies near
    if (this.shield) { alx = -1.1; aly = 0.3; alz = -0.3; }
    if (this.gun) { alx = -0.9; aly = 0.5; }
    // blocking: shield up and square
    if (this.block > 0) { alx = lerp(alx, -1.5, this.block); aly = lerp(aly, 0.1, this.block); alz = lerp(alz, 0.0, this.block); this.torso.rotation.x += 0.15 * this.block; }
    // carrying a restrained rioter: both arms forward
    if (this.carry > 0) { arx = lerp(arx, -1.2, this.carry); alx = lerp(alx, -1.2, this.carry); ary = lerp(ary, -0.4, this.carry); aly = lerp(aly, 0.4, this.carry); }
    // holding a prop overhead
    if (this.hold > 0) { arx = lerp(arx, -2.9, this.hold); alx = lerp(alx, -2.9, this.hold); arz = lerp(arz, 0.3, this.hold); alz = lerp(alz, -0.3, this.hold); }
    // climbing: alternate reach
    if (this.climb > 0) {
      const cs = Math.sin(this.phase * 1.3);
      arx = lerp(arx, -2.6 + cs * 0.5, this.climb); alx = lerp(alx, -2.6 - cs * 0.5, this.climb);
      this.legL.rotation.x = lerp(this.legL.rotation.x, -0.9 + cs * 0.5, this.climb);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -0.9 - cs * 0.5, this.climb);
    }
    // stunned: arms up, head shake
    if (stunned) { arx = -2.2; alx = -2.2; ary = 0.5; aly = -0.5; this.head.rotation.y = Math.sin(this.phase * 9) * 0.4; this.head.rotation.x = 0.3; }

    // action overlay
    if (this.action) {
      const a = this.action; a.t += dt; const u = Math.min(1, a.t / a.dur);
      const hitAt = a.type === 'throw' ? 0.5 : a.type === 'fire' ? 0.05 : 0.42;
      if (!a.hitDone && u >= hitAt) { a.hitDone = true; a.onHit && a.onHit(); }
      const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      const k = ease(u);
      const wind = Math.min(1, u / 0.3), strike = u < 0.3 ? 0 : Math.min(1, (u - 0.3) / 0.25), rec = u < 0.6 ? 0 : (u - 0.6) / 0.4;
      switch (a.variant) {
        case 'swipeR': arx = -1.6; ary = 1.0 - 2.2 * strike + 0.6 * rec; arz = -0.3; this.torso.rotation.y = 0.5 - 1.1 * strike + 0.4 * rec; break;
        case 'swipeL': arx = -1.6; ary = -1.0 + 2.2 * strike - 0.6 * rec; arz = 0.3; this.torso.rotation.y = -0.5 + 1.1 * strike - 0.4 * rec; break;
        case 'spin': arx = -1.6; ary = -2.5 + 6.28 * k; this.torso.rotation.y = 6.28 * k; break;
        case 'overhead': arx = -3.0 * wind + 2.2 * strike - 0.4 * rec; this.torso.rotation.x = -0.2 * wind + 0.6 * strike - 0.3 * rec; this.body.position.y -= 0.15 * strike * (1 - rec); break;
        case 'stab': case 'jabR': arx = -0.8 - 0.9 * wind; this.armR.position.z = 0.25 * strike * (1 - rec); this.torso.rotation.y = -0.3 * strike + 0.2 * rec; break;
        case 'jabL': alx = -0.8 - 0.9 * wind; this.armL.position.z = 0.25 * strike * (1 - rec); this.torso.rotation.y = 0.3 * strike - 0.2 * rec; break;
        case 'hook': arx = -1.2; ary = 1.2 - 2.0 * strike + 0.5 * rec; this.torso.rotation.y = 0.6 - 1.0 * strike; break;
        case 'uppercut': arx = 0.5 * wind - 2.6 * strike + 0.8 * rec; arz = -0.4; this.torso.rotation.x = 0.3 * wind - 0.4 * strike; break;
        case 'spray': arx = -1.5; arz = 0.1; ary = Math.sin(a.t * 30) * 0.08; break;
        case 'flurry': arx = -1.3 + Math.sin(a.t * 40) * 0.6; ary = Math.cos(a.t * 40) * 0.6; alx = -1.0; break;
        case 'throw': arx = 1.2 * wind - 4.0 * strike + 0.8 * rec; arz = -0.2; this.torso.rotation.y = 0.6 * wind - 1.0 * strike + 0.3 * rec; this.torso.rotation.x = -0.15 * wind + 0.4 * strike - 0.2 * rec; break;
        case 'bash': alx = -1.3 - 0.5 * wind; this.armL.position.z = 0.35 * strike * (1 - rec); this.torso.rotation.x = 0.1 + 0.3 * strike; break;
        case 'grab': arx = -1.4; alx = -1.4; ary = -0.4 * strike; aly = 0.4 * strike; this.torso.rotation.x = 0.35 * strike; break;
        case 'fire': alx = -1.5; aly = 0.2; this.armL.position.z = -0.08 * (1 - u); break;
        case 'loot': arx = -0.9; this.torso.rotation.x = 0.6 * Math.sin(u * Math.PI); break;
        case 'rally': arx = -3.0; alx = -2.6; aly = -0.3; ary = 0.3; this.torso.rotation.x = -0.15; this.head.rotation.x = -0.4; break;
        case 'hurt': this.torso.rotation.x = -0.3 * Math.sin(u * Math.PI); arx = -0.6; alx = -0.6; break;
        default: break;
      }
      if (u >= 1) { this.action = null; this.armR.position.z = 0; this.armL.position.z = 0; }
    } else { this.armR.position.z = 0; this.armL.position.z = 0; }

    this.armR.rotation.set(arx, ary, arz); this.armL.rotation.set(alx, aly, alz);

    // KO: fall over from the feet pivot
    if (this.fall > 0) {
      const f = this.fall;
      this.root.rotation.x = 0; this.body.rotation.x = f * Math.PI / 2 * this.fallDir;
      this.body.position.y = this.legLen * (1 - f) + 0.25 * f;
      this.legL.rotation.x = f * 0.2; this.legR.rotation.x = -f * 0.1;
      this.armR.rotation.set(-f * 1.2, 0, 0.6 * f); this.armL.rotation.set(-f * 0.8, 0, -0.6 * f);
    } else this.body.rotation.x = 0;
  }

  handWorld(v = new THREE.Vector3()) { return this.handR.getWorldPosition(v); }
}
