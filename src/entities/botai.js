// Bot behaviour: formation keeping, engagement, projectiles, archetype specials, strategy-driven tactics.
import * as THREE from 'three';
import { meleeStrike, shieldBash } from '../game/combat.js';

const DECIDE = 0.15;
const tmp = new THREE.Vector2();

export function updateBot(c, dt) {
  const g = c.game, world = g.world;
  if (c.arrested || c.removed) return;
  if (c.carriedBy) { c.moving = false; return; }
  if (c.ko) { c.moving = false; c.moveSpeed = 0; return; }
  if (c.climbing) { climbStep(c, dt); return; }
  c.aiTimer -= dt;
  if (c.aiTimer <= 0) { c.aiTimer = DECIDE + c.rng.float(0, 0.05); decide(c); }
  if (c.stun > 0) { c.moving = false; c.moveSpeed = 0; return; }
  // act on cached decision every frame
  const d = c.desired; let dx = d.x - c.pos.x, dz = d.y - c.pos.z; let dist = Math.hypot(dx, dz);
  if (!c.engage && dist > 3) {
    const wp = route(c, d.x, d.y);
    if (wp) { dx = wp.x - c.pos.x; dz = wp.z - c.pos.z; dist = Math.hypot(dx, dz); }
  }
  const stop = c.engage ? Math.max(0.5, c.reach - 0.35) : 0.5;
  if (c.wantBlock) { c.blocking = true; } else c.blocking = false;
  if (dist > stop && !c.holdStill) {
    const sp = c.speed * (c.engage ? 1.05 : 1);
    let vx = (dx / dist) * sp, vz = (dz / dist) * sp;
    // separation from neighbours
    let sx = 0, sz = 0;
    for (const o of g.nearby(c, 1.1)) {
      if (o === c || !o.alive) continue;
      const ox = c.pos.x - o.pos.x, oz = c.pos.z - o.pos.z, l = Math.hypot(ox, oz) || 0.01;
      if (l < 1.0) { sx += (ox / l) * (1.0 - l); sz += (oz / l) * (1.0 - l); }
    }
    vx += sx * 3.5; vz += sz * 3.5;
    const vl = Math.hypot(vx, vz) || 1; const m = Math.min(sp, vl);
    vx = (vx / vl) * m; vz = (vz / vl) * m;
    c.stepOffRoof = false;
    c.move(vx * dt, vz * dt);
    c.moving = true; c.moveSpeed = m;
    if (!c.engage || dist > 2.5) c.faceTowards(c.pos.x + vx, c.pos.z + vz, dt, 10);
  } else { c.moving = false; c.moveSpeed = 0; }
  if (c.engage && c.target && c.target.alive) c.faceTowards(c.target.pos.x, c.target.pos.z, dt, 12);
}

/**
 * Street routing: corridors (avenue + side streets) are joined by cross streets. To reach a point in
 * another corridor a bot walks along its own corridor to a cross street on its side of the front,
 * along the cross street, then up the target corridor. Returns the next waypoint or null (go direct).
 */
function route(c, tx, tz) {
  const W = c.game.world, g = c.game;
  const inPlaza = (x, z) => z > W.plaza.z0 && z < W.plaza.z1 && x > W.plaza.x0 && x < W.plaza.x1;
  const here = W.corridorAt(c.pos.x, c.pos.z), target = W.corridorAt(tx, tz);
  const crossHalf = W.crossStreetHalfAt(c.pos.z);
  const onCross = crossHalf > 0 && !inPlaza(c.pos.x, c.pos.z);
  const inCorridor = (i) => Math.abs(c.pos.x - W.corridorX(i, c.pos.z)) < W.corridorHalf(i, c.pos.z) + 1.5;
  if (here === target && (inCorridor(target) || inPlaza(c.pos.x, c.pos.z))) {
    // same corridor: look ahead along it so the winding avenue / corners are followed
    if (Math.abs(tz - c.pos.z) > 7) {
      const aheadZ = c.pos.z + Math.sign(tz - c.pos.z) * 9;
      const cx = W.corridorX(target, aheadZ), half = W.corridorHalf(target, aheadZ) - 1;
      const lane = Math.max(-half, Math.min(half, tx - W.corridorX(target, tz)));
      return { x: cx + lane * 0.6, z: aheadZ };
    }
    return null;
  }
  if (onCross || (inPlaza(c.pos.x, c.pos.z) && !inPlaza(tx, tz) && target !== W.avenueIndex)) {
    // travelling along a cross street (or across the plaza) towards the target corridor
    if (inPlaza(c.pos.x, c.pos.z)) { // leave the plaza through the nearest cross street on our side
      const cz = W.nearestCrossZ(c.pos.z, g.fronts[W.avenueIndex].z, -c.dir);
      return { x: Math.max(W.plaza.x0 + 4, Math.min(W.plaza.x1 - 4, c.pos.x)), z: cz };
    }
    const cx = W.corridorX(target, c.pos.z);
    if (Math.abs(cx - c.pos.x) < 1.5) return { x: cx, z: c.pos.z + Math.sign(tz - c.pos.z) * 6 };
    return { x: cx, z: c.pos.z };
  }
  // in some corridor, need a cross street: pick the nearest one on our side of this corridor's front
  const cz = W.nearestCrossZ(c.pos.z, g.fronts[here].z, -c.dir);
  return { x: W.corridorX(here, cz), z: cz };
}

function decide(c) {
  const g = c.game, world = g.world, grp = c.group, s = grp ? grp.strategy : null;
  const rng = c.rng; const bias = g.biasFor(c.faction);
  const aggression = (s?.aggression ?? 0.5) * (0.8 + 0.4 * Math.max(0, bias + 0.5));
  c.engage = false; c.wantBlock = false; c.holdStill = false; c.stance = 0;
  // carrying someone (snatch): drag them behind our line
  if (c.carried) {
    const ci = c.group ? c.group.corridor : world.corridorAt(c.pos.x, c.pos.z);
    const homeZ = g.fronts[ci].z + c.dir * -8; // behind own line
    c.desired.set(world.corridorX(ci, homeZ) + c.slot.sx * 2, homeZ);
    if (Math.abs(c.pos.z - homeZ) < 2.5) g.arrest(c, c.carried);
    return;
  }
  // pick up our own faction's collectibles when they're right there
  for (const col of world.collectibles) {
    if (!col.alive) continue;
    if (Math.hypot(col.x - c.pos.x, col.z - c.pos.z) < 1.1) g.pickupCollectible(c, col);
  }
  // on a roof: hold position near the edge facing the enemy and throw
  if (c.onRoof) {
    const r = c.onRoof; const edgeZ = c.dir > 0 ? r.z1 - 1 : r.z0 + 1;
    c.desired.set(Math.max(r.x0 + 1, Math.min(r.x1 - 1, c.pos.x)), edgeZ);
    const t = nearestEnemy(c, 40); c.target = t;
    if (t && c.inventory.rock > 0 && rng.chance(0.45)) throwAt(c, 'rock', t);
    else if (t && c.inventory.molotov > 0 && rng.chance(0.15)) throwAt(c, 'molotov', t);
    if (t) c.faceTowards(t.pos.x, t.pos.z, 1, 1);
    if (!s?.climb || s.climb < 0.3) { if (rng.chance(0.05)) startDescend(c); }
    return;
  }
  const t = nearestEnemy(c, 30); c.target = t;
  const dT = t ? c.distTo(t) : 1e9;
  if (t && dT < 6) c.stance = 1;
  const ci = grp ? grp.corridor : world.corridorAt(c.pos.x, c.pos.z);
  const lineZ = grp ? grp.lineZ() : g.fronts[ci].z;
  const slotZ = lineZ - c.dir * (c.slot.sz * 7 * (s?.depth ?? 1) + 0.5) + c.slot.jitter;
  const halfW = world.corridorHalf(ci, slotZ), cxz = world.corridorX(ci, slotZ);
  const slotX = cxz + c.slot.sx * Math.min(grp?.spreadHalf ?? 6, halfW) * (s?.spread ?? 1);
  c.desired.set(Math.max(cxz - halfW, Math.min(cxz + halfW, slotX)), slotZ);
  const frontHere = g.fronts[ci].z;

  // --- archetype specials ---
  const A = c.arch.id;
  if (A === 'snatch_squad' && t && (s?.snatch ?? 0.3) > 0.15) {
    const beyond = (t.pos.z - frontHere) * c.dir; // how far past the front the target is (negative = on their side)
    const playerOk = !t.isPlayer || g.director?.ending || (g.director?.progress ?? 0) > 0.88;
    const wantSnatch = playerOk && !c.snatchCd && beyond > -7 && dT < 9 && (s?.snatch ?? 0.3) * (0.5 + aggression) > rng.float(0, 0.9);
    if (wantSnatch || c.snatching) {
      c.snatching = true; c.engage = true; c.desired.set(t.pos.x, t.pos.z);
      if (dT < 1.4 && !c.humanoid.busy) {
        c.humanoid.play('grab', { dur: 0.7, variant: 'grab', onHit: () => { if (t.alive && c.distTo(t) < 1.8 && !t.carriedBy && !t.onRoof) g.grab(c, t); c.snatching = false; c.snatchCd = 6; } });
      }
      return;
    }
  }
  if (c.snatchCd) c.snatchCd = Math.max(0, c.snatchCd - DECIDE);
  if (A === 'looter' && (s?.climb ?? 0) > 0.5 && !c.climbCd) {
    const b = nearestClimbable(c, 26);
    if (b) {
      // move to the face of the building nearest us, then climb
      const tx = Math.max(b.x0, Math.min(b.x1, c.pos.x)), tz = Math.max(b.z0, Math.min(b.z1, c.pos.z));
      const ox = c.pos.x - tx, oz = c.pos.z - tz, l = Math.hypot(ox, oz) || 1;
      const goalX = tx + (ox / l) * 0.9, goalZ = tz + (oz / l) * 0.9;
      c.desired.set(goalX, goalZ);
      if (l < 1.3) {
        c.faceTowards(tx, tz, 1, 1);
        const f = c.forward(); const hit = world.climbableAt(c.pos.x, c.pos.z, f.x, f.y);
        if (hit) { startClimb(c, hit); return; }
      }
      c.holdStill = false; return;
    }
  }
  if (A === 'brawler' && t && dT < 14 && !c.heldProp && rng.chance(0.25 * aggression)) {
    const p = world.nearestProp(c.pos.x, c.pos.z, 4, (q) => q.kind === 'medium' && !q.held);
    if (p) { if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 1.6) { g.pickupProp(c, p); c.throwTimer = rng.float(0.6, 1.4); } else c.desired.set(p.x, p.z); return; }
  }
  if (c.heldProp) {
    c.throwTimer = (c.throwTimer ?? 1) - DECIDE;
    if (t) { c.faceTowards(t.pos.x, t.pos.z, 1, 1); c.engage = true; c.desired.set(c.pos.x, c.pos.z); }
    if (c.throwTimer <= 0 || !t) { g.throwProp(c, t ? 1 : 0.5); }
    return;
  }
  if (A === 'grenadier' && t && dT > 4 && dT < 22 && c.fireAmmo > 0 && rng.chance(0.22 * (s?.fire ?? 0.5) + 0.05)) {
    c.faceTowards(t.pos.x, t.pos.z, 1, 1); g.fireGun(c, t);
    c.holdStill = dT < 16; return;
  }
  if (A === 'instigator' && t && dT < 12 && rng.chance(0.03) && !c.humanoid.busy) c.humanoid.play('rally', { dur: 1.0, variant: 'rally' });

  // --- projectiles ---
  const fire = (s?.fire ?? 0.5) * (0.7 + 0.6 * Math.max(0, bias + 0.5));
  if (t && dT > 5 && dT < 26 && !c.humanoid.busy) {
    const inv = c.inventory;
    if (c.faction === 'rioter') {
      if (inv.molotov > 0 && rng.chance(0.08 * fire)) { throwAt(c, 'molotov', t); return; }
      if (inv.rock > 0 && rng.chance(0.3 * fire)) { throwAt(c, 'rock', t); return; }
    } else {
      if (inv.teargas > 0 && dT > 8 && rng.chance(0.07 * fire)) { throwAt(c, 'teargas', t); return; }
      if (inv.flashbang > 0 && dT > 6 && rng.chance(0.06 * fire)) { throwAt(c, 'flashbang', t); return; }
    }
  }
  // --- wrecking props (rioters in scorched mode, and idle npcs sometimes) ---
  if (c.faction === 'rioter' && (s?.wreck || rng.chance(0.08)) && (!t || dT > 5)) {
    const p = world.nearestProp(c.pos.x, c.pos.z, s?.wreck ? 9 : 4, (q) => q.kind !== 'fragile' && !q.indestructible && !q.held && q.alive);
    if (p) {
      const dp = Math.hypot(p.x - c.pos.x, p.z - c.pos.z) - (p.radius || 0) * 0.5;
      if (dp < c.reach) { c.faceTowards(p.x, p.z, 1, 1); c.engage = true; c.desired.set(c.pos.x, c.pos.z); attack(c, true); }
      else { c.desired.set(p.x, p.z); }
      return;
    }
  }
  // --- melee engagement ---
  if (t) {
    const chase = 1.5 + aggression * 9 + (s?.scatter ? 10 : 0) + (s?.column ? 4 : 0);
    const beyond = (c.pos.z - frontHere) * c.dir; // how far we are past the front
    const maxBeyond = (s?.scatter ? 30 : s?.column ? 8 : 2.5 + aggression * 4) + (bias > 0 ? bias * 6 : 0);
    if (dT < c.reach + t.radius + 0.1) {
      c.engage = true; c.desired.set(c.pos.x, c.pos.z);
      if (A === 'front_echelon' && rng.chance(0.35) && !c.humanoid.busy) { c.wantBlock = true; c.blockT = 0.6; }
      else if (A === 'front_echelon' && rng.chance(0.25) && !c.humanoid.busy) { c.humanoid.play('bash', { dur: 0.45, variant: 'bash', onHit: () => shieldBash(g, c) }); }
      else attack(c, false);
      return;
    }
    if (dT < chase && (beyond < maxBeyond || (t.pos.z - frontHere) * c.dir < beyond)) {
      c.engage = true; c.desired.set(t.pos.x, t.pos.z); return;
    }
  }
  // counter-snatch: mob the snatch squad dragging someone away
  if (s?.counter) {
    for (const o of g.characters) if (o.alive && o.faction !== c.faction && o.carried && c.distTo(o) < 14) { c.engage = true; c.target = o; c.desired.set(o.pos.x, o.pos.z); return; }
  }
}

function attack(c, propOnly) {
  if (c.attackCd > 0 || c.humanoid.busy) return;
  const g = c.game;
  c.attackCd = c.weapon.cooldown * (1.15 + c.rng.float(0, 0.5)) / (0.8 + 0.4 * c.strengthMult);
  c.humanoid.play('attack', { dur: Math.max(0.3, c.weapon.cooldown * 1.1), onHit: () => { if (c.alive) meleeStrike(g, c); } });
}

function throwAt(c, type, t) {
  const g = c.game;
  c.inventory[type]--;
  c.faceTowards(t.pos.x, t.pos.z, 1, 1);
  const lead = 0.35;
  const target = new THREE.Vector3(t.pos.x + (t.moving ? Math.sin(t.yaw) * t.moveSpeed * lead : 0), t.y + 0.8, t.pos.z + (t.moving ? Math.cos(t.yaw) * t.moveSpeed * lead : 0));
  target.x += c.rng.float(-1.5, 1.5); target.z += c.rng.float(-1.5, 1.5);
  c.humanoid.play('throw', { dur: 0.6, variant: 'throw', onHit: () => {
    if (!c.alive) return;
    const from = c.humanoid.handWorld(); from.y = Math.max(from.y, c.y + 1.4);
    g.projectiles.launchAt(type, c, from, target);
  } });
}

function nearestEnemy(c, maxD) {
  const g = c.game; let best = null, bd = maxD;
  for (const o of g.characters) {
    if (o === c || !o.alive || o.faction === c.faction || o.carriedBy) continue;
    const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) + (o.onRoof ? 8 : 0) + (o.isPlayer ? -g.playerThreat : 0);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function nearestClimbable(c, maxD) {
  const w = c.game.world; let best = null, bd = maxD;
  for (const b of w.buildings) {
    if (!b.front || !b.climbable || !b.alive) continue;
    if ((b.cz - c.game.frontAt(b.cx, b.cz)) * c.dir > 14) continue; // don't climb buildings deep in enemy territory
    const dx = Math.max(b.x0 - c.pos.x, 0, c.pos.x - b.x1), dz = Math.max(b.z0 - c.pos.z, 0, c.pos.z - b.z1);
    const d = Math.hypot(dx, dz) + (b.occupants || 0) * 6;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function startClimb(c, hit) {
  c.climbing = { target: hit.target, roofY: hit.roofY, x0: hit.x0, x1: hit.x1, z0: hit.z0, z1: hit.z1, dirY: 1 };
  c.moving = false; c.moveSpeed = 0; c.ducking = false;
  hit.target.occupants = (hit.target.occupants || 0) + 1;
}
export function startDescend(c) {
  const r = c.onRoof; if (!r) return;
  // walk to nearest edge then climb down
  const ex = Math.abs(c.pos.x - r.x0) < Math.abs(c.pos.x - r.x1) ? r.x0 : r.x1;
  const ez = Math.abs(c.pos.z - r.z0) < Math.abs(c.pos.z - r.z1) ? r.z0 : r.z1;
  const useX = Math.abs(c.pos.x - ex) < Math.abs(c.pos.z - ez);
  if (useX) { c.pos.x = ex + (ex === r.x0 ? -0.55 : 0.55); } else { c.pos.z = ez + (ez === r.z0 ? -0.55 : 0.55); }
  c.climbing = { target: r.target || r, roofY: r.roofY, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, dirY: -1 };
  c.onRoof = null;
}
export function climbStep(c, dt, dirInput = null) {
  const cl = c.climbing; if (!cl) return;
  const dirY = dirInput ?? cl.dirY;
  c.moving = true; c.moveSpeed = 1;
  if (dirY === 0) { c.moving = false; return; }
  c.y += dirY * 2.4 * dt;
  if (c.y >= cl.roofY) {
    c.y = cl.roofY; c.onRoof = { roofY: cl.roofY, x0: cl.x0, x1: cl.x1, z0: cl.z0, z1: cl.z1, target: cl.target }; c.climbing = null;
    // step onto the roof
    const cx = (cl.x0 + cl.x1) / 2, cz = (cl.z0 + cl.z1) / 2;
    const dx = cx - c.pos.x, dz = cz - c.pos.z, l = Math.hypot(dx, dz) || 1;
    c.pos.x += (dx / l) * 1.2; c.pos.z += (dz / l) * 1.2;
  } else if (c.y <= 0) {
    c.y = 0; c.climbing = null; c.climbCd = 3;
    if (cl.target) cl.target.occupants = Math.max(0, (cl.target.occupants || 0) - 1);
  }
}
