// Bot behaviour: a steering crowd model on top of group intent.
//
// Each bot is an individual (speed, courage, spacing, reaction, idle habits) that reacts to the people
// around it: soft separation from friends, alignment with the people it walks with, cohesion with its
// group, wall probing, wander noise and acceleration-limited velocity so turns and stops are gradual.
// Group intent (goal, strategy, formation slot) is an influence, not a rail. Navigation is
// line-of-sight first, then the group's flow field, then a personal field, with stuck detection.
// Rioters at the front surge and fall back on their own courage, retreat when hurt, taunt when idle.
// Peacekeepers hold their line, step forward together, and only break ranks on breakout strategies.
import * as THREE from 'three';
import { meleeStrike, shieldBash } from '../game/combat.js';

const DECIDE = 0.15;

export function updateBot(c, dt) {
  const g = c.game, world = g.world;
  if (c.arrested || c.removed) return;
  if (c.carriedBy) { c.moving = false; return; }
  if (c.ko) { c.moving = false; c.moveSpeed = 0; c.vel.set(0, 0); return; }
  if (c.climbing) { climbStep(c, dt); return; }
  c.aiTimer -= dt;
  if (c.aiTimer <= 0) { c.aiTimer = DECIDE + c.rng.float(0, 0.05); decide(c); }
  if (c.stun > 0) { c.moving = false; c.moveSpeed = 0; c.vel.multiplyScalar(Math.max(0, 1 - dt * 6)); return; }
  if (c.unstick) { c.unstick.t -= dt; if (c.unstick.t <= 0) c.unstick = null; }
  if (c.surge) { c.surge.t -= dt; if (c.surge.t <= 0) { c.surge = null; c.backoff = c.rng.float(1.5, 4); } }
  if (c.backoff > 0) c.backoff -= dt;
  if (c.fieldCd > 0) c.fieldCd -= dt;
  steer(c, dt);
  // idle habits: look around, shift weight, taunt the other side
  if (!c.moving && !c.humanoid.busy && !c.engage) {
    c.traits.fidgetT -= dt;
    if (c.traits.fidgetT <= 0) {
      c.traits.fidgetT = c.rng.float(2.5, 8);
      const nearEnemy = c.target && c.distTo(c.target) < 16;
      const v = c.faction === 'rioter' && nearEnemy && c.rng.chance(0.5) ? c.rng.pick(['taunt', 'beckon']) : c.rng.pick(['lookaround', 'shift', 'shift']);
      c.humanoid.play(v, { dur: v === 'shift' ? 1.2 : 1.6, variant: v });
    }
  }
}

/** Steering: combine goal seeking with neighbour/wall reactions into a smoothly changing velocity. */
function steer(c, dt) {
  const g = c.game, world = g.world, T = c.traits;
  const target = c.unstick || c.desired;
  const tx = c.unstick ? c.unstick.x : target.x, tz = c.unstick ? c.unstick.z : target.y;
  let dx = tx - c.pos.x, dz = tz - c.pos.z; let dist = Math.hypot(dx, dz);
  const stop = c.engage ? Math.max(0.5, c.reach - 0.35) : 0.6;
  c.blocking = !!c.wantBlock;
  let fx = 0, fz = 0, wantMove = dist > stop && !c.holdStill;
  if (wantMove) {
    const wp = c.unstick ? null : waypoint(c, tx, tz);
    if (wp) { dx = wp.x - c.pos.x; dz = wp.z - c.pos.z; dist = Math.hypot(dx, dz) || 1; }
    // arrive: ease off in the last couple of metres unless chasing
    const urgency = c.engage ? 1 : Math.min(1, dist / 2.5);
    fx += (dx / dist) * urgency * 1.0; fz += (dz / dist) * urgency * 1.0;
  }
  // neighbours: separation (soft, personal spacing), alignment with friends walking the same way
  let ax = 0, az = 0, an = 0;
  for (const o of g.nearby(c, 3)) {
    if (!o.alive && !o.ko) continue;
    const ox = c.pos.x - o.pos.x, oz = c.pos.z - o.pos.z, l = Math.hypot(ox, oz) || 0.05;
    const friend = o.faction === c.faction;
    const want = friend ? T.spacing * (c.moving ? 0.85 : 1) : (c.engage ? 0.7 : 1.6);
    if (l < want) { const k = (want - l) / want; fx += (ox / l) * k * (friend ? 1.6 : 2.2); fz += (oz / l) * k * (friend ? 1.6 : 2.2); }
    if (friend && o.moving && l < 3 && !o.ko) { ax += o.vel.x; az += o.vel.y; an++; }
  }
  if (an && wantMove && !c.engage) { const al = Math.hypot(ax, az) || 1; fx += (ax / al) * 0.35; fz += (az / al) * 0.35; }
  // cohesion: don't straggle far from the group
  if (c.group && !c.engage) {
    const gc = c.group.centroid; const cx = gc.x - c.pos.x, cz = gc.z - c.pos.z, cl = Math.hypot(cx, cz);
    if (cl > 10) { const k = Math.min(1, (cl - 10) / 10) * 0.8; fx += (cx / cl) * k; fz += (cz / cl) * k; }
  }
  // walls: probe ahead and slide along the free side
  const vl = Math.hypot(c.vel.x, c.vel.y);
  if (vl > 0.3) {
    const ux = c.vel.x / vl, uz = c.vel.y / vl;
    if (world.blockedAt(c.pos.x + ux * 1.3, c.pos.z + uz * 1.3)) {
      const lx = -uz, lz = ux;
      const leftFree = !world.blockedAt(c.pos.x + (ux * 0.5 + lx) * 1.2, c.pos.z + (uz * 0.5 + lz) * 1.2);
      const rightFree = !world.blockedAt(c.pos.x + (ux * 0.5 - lx) * 1.2, c.pos.z + (uz * 0.5 - lz) * 1.2);
      const side = leftFree && !rightFree ? 1 : rightFree && !leftFree ? -1 : (T.wanderPh > 3.14 ? 1 : -1);
      fx += lx * side * 2.0; fz += lz * side * 2.0; fx -= ux * 0.8; fz -= uz * 0.8;
    }
  }
  // a little wander so nobody walks a perfectly straight line
  if (wantMove && !c.engage) { const w = Math.sin(g.time * 0.9 + T.wanderPh) * 0.22; fx += -dz / (dist || 1) * w; fz += dx / (dist || 1) * w; }

  // turn the force into a target velocity, then accelerate towards it
  const fl = Math.hypot(fx, fz);
  const hurt = c.hp < c.maxHp * T.hurtAt;
  const running = wantMove && (c.engage || !!c.surge || dist > 16 || c.retreating) && !hurt;
  c.running = running;
  const maxSp = c.speed * T.speed * (running ? 1.45 : 1) * (hurt ? 0.8 : 1);
  let vx = 0, vz = 0;
  if (fl > 0.05 && (wantMove || fl > 0.4)) { const m = Math.min(maxSp, maxSp * Math.min(1, fl)); vx = (fx / fl) * m; vz = (fz / fl) * m; }
  const accel = c.engage ? 7 : 4.5;
  c.vel.x += (vx - c.vel.x) * Math.min(1, dt * accel); c.vel.y += (vz - c.vel.y) * Math.min(1, dt * accel);
  const sp = Math.hypot(c.vel.x, c.vel.y);
  if (sp > 0.15) {
    const before = c.pos.x, beforeZ = c.pos.z;
    c.stepOffRoof = false; c.move(c.vel.x * dt, c.vel.y * dt);
    const moved = Math.hypot(c.pos.x - before, c.pos.z - beforeZ);
    if (wantMove && moved < sp * dt * 0.3) c.stuckT += dt; else c.stuckT = 0;
    if (c.stuckT > 1.2) unstick(c);
  } else c.stuckT = 0;
  c.moving = sp > 0.3; c.moveSpeed = sp;
  // facing: the person you're fighting, otherwise where you're going; the head tracks threats
  if (c.engage && c.target && c.target.alive) c.faceTowards(c.target.pos.x, c.target.pos.z, dt, 9);
  else if (sp > 0.5) c.faceTowards(c.pos.x + c.vel.x, c.pos.z + c.vel.y, dt, 5);
  else if (c.target && c.target.alive && c.distTo(c.target) < 14 && !c.humanoid.busy) c.faceTowards(c.target.pos.x, c.target.pos.z, dt, 2);
  if (c.target && c.target.alive && c.distTo(c.target) < 14) {
    let a = Math.atan2(c.target.pos.x - c.pos.x, c.target.pos.z - c.pos.z) - c.yaw; while (a > Math.PI) a -= 6.283; while (a < -Math.PI) a += 6.283; c.lookYaw = a;
  } else c.lookYaw = 0;
}

/** Next point to walk towards: straight if the way is clear, else along a flow field. */
function waypoint(c, tx, tz) {
  const W = c.game.world, grp = c.group;
  if (W.lineFree(c.pos.x, c.pos.z, tx, tz)) return null;
  if (grp && grp.field && Math.hypot(grp.goal.x - tx, grp.goal.z - tz) < 12) { const wp = W.fieldNext(grp.field, c.pos.x, c.pos.z); if (wp) return wp; }
  // personal field for other destinations (props, climb spots, retreat points), rate limited
  if (!c.ownField || Math.hypot(c.ownField.goal.x - tx, c.ownField.goal.z - tz) > 4) {
    if (c.fieldCd > 0) return null;
    c.ownField = W.flowField(tx, tz); c.fieldCd = 2.5;
  }
  return W.fieldNext(c.ownField, c.pos.x, c.pos.z);
}

function unstick(c) {
  const W = c.game.world, rng = c.rng; c.stuckT = 0;
  const dirs = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  for (const k of dirs) {
    const a = k * Math.PI / 4, x = c.pos.x + Math.cos(a) * 3.5, z = c.pos.z + Math.sin(a) * 3.5;
    if (W.lineFree(c.pos.x, c.pos.z, x, z)) { c.unstick = { x, z, t: rng.float(0.8, 1.6) }; c.ownField = null; return; }
  }
  const w = W.nearestWalkable(c.pos.x + rng.float(-4, 4), c.pos.z + rng.float(-4, 4), 10); c.unstick = { x: w.x, z: w.z, t: 1.2 };
}

function decide(c) {
  const g = c.game, world = g.world, grp = c.group, s = grp ? grp.strategy : null;
  const rng = c.rng, T = c.traits; const bias = g.biasFor(c.faction);
  const aggression = (s?.aggression ?? 0.5) * (0.8 + 0.4 * Math.max(0, bias + 0.5));
  c.engage = false; c.wantBlock = false; c.holdStill = false; c.stance = 0;
  const setDesired = (x, z, snap = false) => {
    // formation moves are followed with a personal reaction delay; engagements snap
    if (snap) c.desired.set(x, z); else { const k = Math.min(1, DECIDE / T.react); c.desired.x += (x - c.desired.x) * k; c.desired.y += (z - c.desired.y) * k; }
  };
  if (c.carried) {
    let hx = world.center.x - c.pos.x, hz = world.center.z - c.pos.z; const hl = Math.hypot(hx, hz) || 1;
    const home = world.nearestWalkable(c.pos.x + (hx / hl) * 10, c.pos.z + (hz / hl) * 10, 8);
    setDesired(home.x, home.z, true);
    if (g.beyond(c) < -7 || hl < 8) g.arrest(c, c.carried);
    return;
  }
  for (const col of world.collectibles) { if (col.alive && Math.hypot(col.x - c.pos.x, col.z - c.pos.z) < 1.1) g.pickupCollectible(c, col); }
  if (c.onRoof) {
    const r = c.onRoof; const C = world.center;
    const ex = C.x < r.x0 ? r.x0 + 1 : C.x > r.x1 ? r.x1 - 1 : Math.max(r.x0 + 1, Math.min(r.x1 - 1, c.pos.x));
    const ez = C.z < r.z0 ? r.z0 + 1 : C.z > r.z1 ? r.z1 - 1 : Math.max(r.z0 + 1, Math.min(r.z1 - 1, c.pos.z));
    setDesired(ex, ez, true);
    const t = nearestEnemy(c, 40); c.target = t;
    if (t && c.inventory.rock > 0 && rng.chance(0.18)) throwAt(c, 'rock', t);
    else if (t && c.inventory.molotov > 0 && rng.chance(0.05)) throwAt(c, 'molotov', t);
    if (!s?.climb || s.climb < 0.3) { if (rng.chance(0.05)) startDescend(c); }
    return;
  }
  const t = nearestEnemy(c, 30); c.target = t;
  const dT = t ? c.distTo(t) : 1e9;
  if (t && dT < 7) c.stance = 1;
  const looting = grp?.phase === 'loot';
  const hurt = c.hp < c.maxHp * T.hurtAt;

  // formation slot around the group's goal (rows behind the goal, spread sideways), with personal drift
  let slot = null;
  if (grp) {
    const F = grp.facing(); const px = -F.z, pz = F.x;
    const loose = c.faction === 'rioter' ? 1.5 : 1.0; // mobs are blobs, squads are lines
    const spread = grp.spreadHalf * (s?.spread ?? 1) * loose, depth = c.slot.sz * 7 * (s?.depth ?? 1) * loose + 0.5;
    const drift = c.faction === 'rioter' ? Math.sin(g.time * 0.3 + T.wanderPh) * 1.5 : 0;
    const sxp = grp.goal.x + px * (c.slot.sx * spread + drift) - F.x * depth + px * c.slot.jitter * 0.3;
    const szp = grp.goal.z + pz * (c.slot.sx * spread + drift) - F.z * depth + pz * c.slot.jitter * 0.3;
    slot = world.nearestWalkable(sxp, szp, 8);
    setDesired(slot.x, slot.z);
  } else setDesired(c.pos.x, c.pos.z, true);

  // hurt: pull back behind the group and recover
  if (hurt && grp && !looting) {
    c.retreating = true;
    const F = grp.facing(); const back = world.nearestWalkable(grp.goal.x - F.x * 12, grp.goal.z - F.z * 12, 8);
    setDesired(back.x, back.z, true);
    if (t && dT < c.reach + 0.3) attack(c, false);
    return;
  }
  c.retreating = false;

  // --- archetype specials ---
  const A = c.arch.id;
  if (A === 'snatch_squad' && t && (s?.snatch ?? 0.3) > 0.15) {
    const inside = -g.beyond(t);
    const playerOk = !t.isPlayer || g.director?.ending || (g.director?.progress ?? 0) > 0.88;
    const wantSnatch = playerOk && !c.snatchCd && inside > -7 && dT < 9 && (s?.snatch ?? 0.3) * (0.5 + aggression) > rng.float(0, 0.9);
    if (wantSnatch || c.snatching) {
      c.snatching = true; c.engage = true; setDesired(t.pos.x, t.pos.z, true);
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
      const tx = Math.max(b.x0, Math.min(b.x1, c.pos.x)), tz = Math.max(b.z0, Math.min(b.z1, c.pos.z));
      const ox = c.pos.x - tx, oz = c.pos.z - tz, l = Math.hypot(ox, oz) || 1;
      setDesired(tx + (ox / l) * 0.9, tz + (oz / l) * 0.9, true);
      if (l < 1.3) {
        c.faceTowards(tx, tz, 1, 1);
        const f = c.forward(); const hit = world.climbableAt(c.pos.x, c.pos.z, f.x, f.y);
        if (hit) { startClimb(c, hit); return; }
      }
      return;
    }
  }
  if (A === 'brawler' && t && dT < 14 && !c.heldProp && rng.chance(0.25 * aggression)) {
    const p = world.nearestProp(c.pos.x, c.pos.z, 4, (q) => q.kind === 'medium' && !q.held);
    if (p) { if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 1.6) { g.pickupProp(c, p); c.throwTimer = rng.float(0.6, 1.4); } else setDesired(p.x, p.z, true); return; }
  }
  if (c.heldProp) {
    c.throwTimer = (c.throwTimer ?? 1) - DECIDE;
    if (t) { c.engage = true; c.holdStill = true; }
    if (c.throwTimer <= 0 || !t) { g.throwProp(c, t ? 1 : 0.5); }
    return;
  }
  if (A === 'grenadier' && t && dT > 4 && dT < 20 && c.fireAmmo > 0 && rng.chance(0.1 * (s?.fire ?? 0.5) + 0.02)) {
    c.faceTowards(t.pos.x, t.pos.z, 1, 1); g.fireGun(c, t);
    c.holdStill = dT < 16; return;
  }
  if (A === 'instigator' && t && dT < 14 && rng.chance(0.04) && !c.humanoid.busy) c.humanoid.play('rally', { dur: 1.0, variant: 'rally' });

  // --- projectiles ---
  const fire = (s?.fire ?? 0.5) * (0.7 + 0.6 * Math.max(0, bias + 0.5));
  if (t && dT > 6 && dT < 20 && !c.humanoid.busy && !looting && !c.surge) {
    const inv = c.inventory;
    if (c.faction === 'rioter') {
      if (inv.molotov > 0 && rng.chance(0.025 * fire)) { throwAt(c, 'molotov', t); return; }
      if (inv.rock > 0 && rng.chance(0.1 * fire)) { throwAt(c, 'rock', t); return; }
    } else {
      if (inv.teargas > 0 && dT > 9 && rng.chance(0.02 * fire)) { throwAt(c, 'teargas', t); return; }
      if (inv.flashbang > 0 && dT > 7 && rng.chance(0.015 * fire)) { throwAt(c, 'flashbang', t); return; }
    }
  }
  // --- wrecking props (looting phase, scorched earth, and bored rioters) ---
  const nearGoal = grp ? Math.hypot(grp.goal.x - c.pos.x, grp.goal.z - c.pos.z) < 14 : true;
  if (c.faction === 'rioter' && (s?.wreck || looting || (nearGoal && rng.chance(0.03))) && (!t || dT > 6)) {
    const p = world.nearestProp(c.pos.x, c.pos.z, s?.wreck || looting ? 14 : 3, (q) => q.kind !== 'fragile' && !q.indestructible && !q.held && q.alive && (q.claimed === undefined || q.claimed === c.id || q.claimed < g.time - 4));
    if (p) {
      const dp = Math.hypot(p.x - c.pos.x, p.z - c.pos.z) - (p.radius || 0) * 0.5;
      p.claimed = c.id; p.claimedT = g.time;
      if (dp < c.reach) { c.faceTowards(p.x, p.z, 1, 1); c.engage = true; c.holdStill = true; attack(c, true); }
      else { // stand off the prop by its size so we can actually arrive next to it
        const ox = c.pos.x - p.x, oz = c.pos.z - p.z, ol = Math.hypot(ox, oz) || 1, stand = (p.radius || 0.5) * 0.5 + c.reach * 0.6;
        setDesired(p.x + (ox / ol) * stand, p.z + (oz / ol) * stand, true);
      }
      return;
    }
  }
  // --- melee engagement ---
  if (t) {
    const beyond = g.beyond(c);
    const maxBeyond = (s?.scatter ? 30 : s?.column ? 8 : 2.5 + aggression * 4) + (bias > 0 ? bias * 6 : 0);
    const inReach = dT < c.reach + t.radius + 0.1;
    if (c.faction === 'rioter') {
      // mob mentality: individuals surge at the enemy on their own courage, then fall back into the crowd
      if (inReach) {
        c.engage = true; c.holdStill = true; attack(c, false);
        if (!c.surge && c.backoff <= 0 && rng.chance(0.5)) c.surge = { t: rng.float(0.8, 2) };
        return;
      }
      const canSurge = c.backoff <= 0 && (beyond < maxBeyond || g.beyond(t) < 0 || looting) && !hurt;
      if (!c.surge && canSurge && dT < 3 + T.courage * 9 + (s?.column ? 6 : 0) && rng.chance(0.15 + T.courage * 0.35 * aggression)) c.surge = { t: rng.float(1.2, 2.8) };
      if (c.surge && dT < 16) { c.engage = true; setDesired(t.pos.x, t.pos.z, true); return; }
      if (c.backoff > 0 && dT < 7 && slot) {
        // fall back a few metres from the enemy while staying with the mob
        const ox = c.pos.x - t.pos.x, oz = c.pos.z - t.pos.z, ol = Math.hypot(ox, oz) || 1;
        const back = world.nearestWalkable(slot.x + (ox / ol) * 3, slot.z + (oz / ol) * 3, 6);
        setDesired(back.x, back.z, true); return;
      }
    } else {
      // discipline: hold the line and strike what comes within reach; only breakout/pulse strategies chase
      if (inReach) {
        c.engage = true; c.holdStill = true;
        if (A === 'front_echelon' && rng.chance(0.35) && !c.humanoid.busy) { c.wantBlock = true; }
        else if (A === 'front_echelon' && rng.chance(0.25) && !c.humanoid.busy) { c.humanoid.play('bash', { dur: 0.45, variant: 'bash', onHit: () => shieldBash(g, c) }); }
        else attack(c, false);
        return;
      }
      const chase = (s?.scatter ? 14 : s?.pulse ? 6 : 1.5) + aggression * 3;
      if (dT < chase && (beyond < maxBeyond || g.beyond(t) < 0)) { c.engage = true; setDesired(t.pos.x, t.pos.z, true); return; }
      if (A === 'front_echelon' && dT < 4 && rng.chance(0.3)) c.wantBlock = true;
    }
  }
  if (s?.counter) {
    for (const o of g.characters) if (o.alive && o.faction !== c.faction && o.carried && c.distTo(o) < 14) { c.engage = true; c.target = o; setDesired(o.pos.x, o.pos.z, true); return; }
  }
}

function attack(c) {
  if (c.attackCd > 0 || c.humanoid.busy) return;
  const g = c.game;
  c.attackCd = c.weapon.cooldown * (1.9 + c.rng.float(0, 0.9)) / (0.8 + 0.4 * c.strengthMult);
  c.humanoid.play('attack', { dur: Math.max(0.3, c.weapon.cooldown * 1.1), onHit: () => { if (c.alive) meleeStrike(g, c); } });
}

function throwAt(c, type, t) {
  const g = c.game;
  if (t.isPlayer) {
    const gap = g.director?.ending ? 1.5 : 5;
    if (g.time - (g.lastThrowAtPlayer || -99) < gap) {
      const alt = g.characters.find((o) => o !== t && o.alive && o.faction === t.faction && !o.carriedBy && c.distTo(o) < 20);
      if (!alt) return; t = alt;
    } else g.lastThrowAtPlayer = g.time;
  }
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
    if (c.game.beyond({ pos: { x: b.cx, z: b.cz }, faction: c.faction }) > 14) continue;
    const dx = Math.max(b.x0 - c.pos.x, 0, c.pos.x - b.x1), dz = Math.max(b.z0 - c.pos.z, 0, c.pos.z - b.z1);
    const d = Math.hypot(dx, dz) + (b.occupants || 0) * 6;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function startClimb(c, hit) {
  c.climbing = { target: hit.target, roofY: hit.roofY, x0: hit.x0, x1: hit.x1, z0: hit.z0, z1: hit.z1, dirY: 1 };
  c.moving = false; c.moveSpeed = 0; c.ducking = false; c.vel.set(0, 0);
  hit.target.occupants = (hit.target.occupants || 0) + 1;
}
export function startDescend(c) {
  const r = c.onRoof; if (!r) return;
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
    const cx = (cl.x0 + cl.x1) / 2, cz = (cl.z0 + cl.z1) / 2;
    const dx = cx - c.pos.x, dz = cz - c.pos.z, l = Math.hypot(dx, dz) || 1;
    c.pos.x += (dx / l) * 1.2; c.pos.z += (dz / l) * 1.2;
  } else if (c.y <= 0) {
    c.y = 0; c.climbing = null; c.climbCd = 3;
    if (cl.target) cl.target.occupants = Math.max(0, (cl.target.occupants || 0) - 1);
  }
}
