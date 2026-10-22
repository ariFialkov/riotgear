// A character in the round: player, bot "multiplayer" archetype, or NPC. Owns a Humanoid for visuals.
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { ARCHETYPES, WEAPONS, FACTIONS } from '../data/config.js';

const BASE_HP = 140, BASE_SPEED = 3.7;
let NEXT_ID = 1;

export class Character {
  constructor(game, { archetype, weaponId = null, isPlayer = false, x = 0, z = 0, yaw = 0, bandana = null, name = null }) {
    this.id = NEXT_ID++;
    this.game = game; this.world = game.world; this.rng = game.rng.fork('char' + this.id);
    this.arch = ARCHETYPES[archetype]; this.faction = this.arch.faction; this.dir = FACTIONS[this.faction].dir;
    this.isPlayer = isPlayer; this.isBot = !isPlayer && !this.arch.npc; this.isNpc = !!this.arch.npc;
    this.name = name || this.arch.name;
    const w = weaponId || (this.faction === 'rioter' ? 'plank' : 'baton');
    this.weapon = WEAPONS[this.faction].find((d) => d.id === w) || WEAPONS[this.faction][0];
    this.humanoid = new Humanoid({ archetype, weapon: this.weapon.id, rng: this.rng, isPlayer, bandana });
    this.mesh = this.humanoid.root; this.mesh.position.set(x, 0, z); this.mesh.rotation.y = yaw;
    this.pos = this.mesh.position; this.yaw = yaw;
    this.maxHp = BASE_HP * this.arch.stats.hp; this.hp = this.maxHp;
    this.baseSpeed = BASE_SPEED * this.arch.stats.speed;
    this.mass = this.arch.stats.mass;
    this.radius = 0.38 * (this.arch.build === 'heavy' ? 1.2 : 1);
    this.inventory = { ...(this.arch.projectiles || {}) };
    this.ko = false; this.koTimer = 0; this.koCount = 0; this.arrested = false; this.removed = false;
    this.stun = 0; this.blind = 0; this.slow = 0; this.burn = 0; this.flash = 0;
    this.attackCd = 0; this.comboTarget = null; this.comboCount = 0; this.hitsSincePulse = 0;
    this.vy = 0; this.y = 0; this.onRoof = null; this.climbing = null; this.ducking = false; this.blocking = false;
    this.carried = null; this.carriedBy = null; this.heldProp = null; this.holdCharge = 0;
    this.group = null; this.slot = null; this.strategy = null; this.commandOf = null;
    this.moveSpeed = 0; this.moving = false; this.stance = 0;
    this.knockVel = new THREE.Vector2(); this.lastHitBy = null; this.kills = 0;
    this.aiTimer = this.rng.float(0, 0.3); this.target = null; this.desired = new THREE.Vector2(x, z);
    this.reach = this.weapon.range + (this.arch.build === 'heavy' ? 0.15 : 0);
    this.conscious = true;
    this.fireAmmo = this.arch.gun ? 8 : 0; this.reloadT = 0;
    this.smokeColor = bandana;
  }

  get alive() { return !this.ko && !this.arrested && !this.removed; }
  get strengthMult() { return this.game.sideMult(this.faction); }
  get speed() {
    let s = this.baseSpeed * (0.85 + 0.15 * this.strengthMult);
    if (this.slow > 0) s *= 0.55; if (this.blind > 0) s *= 0.7; if (this.ducking) s *= 0.55;
    if (this.heldProp) s *= 0.7; if (this.carried) s *= 0.8; if (this.blocking) s *= 0.5;
    return s;
  }
  faceTowards(x, z, dt = 1, rate = 14) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }
  forward() { return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw)); }
  distTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }

  /** Move in world xz with collision, roof constraints. dx/dz already scaled by dt. */
  move(dx, dz) {
    if (this.onRoof) {
      const r = this.onRoof;
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      if (nx > r.x0 + 0.4 && nx < r.x1 - 0.4 && nz > r.z0 + 0.4 && nz < r.z1 - 0.4) { this.pos.x = nx; this.pos.z = nz; }
      else if (this.stepOffRoof) { this.pos.x = nx; this.pos.z = nz; this.onRoof = null; this.falling = true; }
      return;
    }
    this.world.moveWithCollision(this.pos, dx, dz, this.radius);
  }

  takeHit(dmg, from, knock = 1, opts = {}) {
    if (!this.alive) return false;
    const bias = from && from.faction !== this.faction ? from.strengthMult / this.strengthMult : 1;
    let d = dmg * bias;
    if (this.blocking && from && this.facingDot(from) > 0.2) { d *= 0.15; knock *= 0.2; this.game.effects.sparks(this.pos.x, 1.2, this.pos.z, '#9bc4e8', 6); }
    if (this.onRoof) knock *= 0.3;
    this.hp -= d; this.lastHitBy = from || this.lastHitBy;
    if (opts.stun) this.stun = Math.max(this.stun, opts.stun);
    if (opts.blind) this.blind = Math.max(this.blind, opts.blind);
    if (opts.slow) this.slow = Math.max(this.slow, opts.slow);
    if (from) {
      const dx = this.pos.x - from.pos.x, dz = this.pos.z - from.pos.z, l = Math.hypot(dx, dz) || 1;
      this.knockVel.x += (dx / l) * knock * 4 / this.mass; this.knockVel.y += (dz / l) * knock * 4 / this.mass;
    }
    if (!this.humanoid.action && !opts.silent) this.humanoid.play('hurt', { dur: 0.25, variant: 'hurt' });
    if (this.heldProp && d > 8) this.dropProp();
    if (this.hp <= 0) this.knockOut(from, opts.knockdown ? 2.5 : null);
    else if (opts.knockdown) { this.knockdown(opts.knockdown); }
    return true;
  }
  facingDot(o) { const f = this.forward(); const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1; return (f.x * dx + f.y * dz) / l; }

  knockdown(sec) { // brief floor time without counting as a KO
    if (this.ko) return;
    this.ko = true; this.koTimer = sec; this.knockedDownOnly = true; this.humanoid.fallDir = this.rng.chance(0.5) ? 1 : -1;
    this.releaseAll();
  }
  knockOut(by, revive = null) {
    if (this.ko && !this.knockedDownOnly) return;
    this.ko = true; this.knockedDownOnly = false; this.koCount++;
    this.koTimer = revive ?? (this.isPlayer ? 4.5 : this.rng.float(7, 14));
    this.humanoid.fallDir = this.rng.chance(0.5) ? 1 : -1;
    this.releaseAll();
    this.game.onKnockout(this, by);
  }
  releaseAll() {
    if (this.carried) { const c = this.carried; this.carried = null; c.carriedBy = null; c.mesh.position.copy(this.pos); this.game.scene.add(c.mesh); c.ko = true; c.koTimer = 2; }
    if (this.heldProp) this.dropProp();
    this.climbing = null; this.blocking = false; this.ducking = false;
  }
  revive() {
    this.ko = false; this.hp = Math.max(this.maxHp * 0.45, this.hp); this.stun = 0; this.blind = 0; this.knockedDownOnly = false;
    if (this.hp < 1) this.hp = this.maxHp * 0.45;
  }
  arrest() {
    this.arrested = true; this.ko = true; this.koTimer = 1e9; this.conscious = false;
  }
  dropProp() {
    const p = this.heldProp; if (!p) return; this.heldProp = null;
    p.group.position.set(this.pos.x + Math.sin(this.yaw) * 1.2, 0, this.pos.z + Math.cos(this.yaw) * 1.2);
    p.x = p.group.position.x; p.z = p.group.position.z; p.group.rotation.set(0, this.yaw, 0); p.held = false;
    this.world.markProp(p, 1);
  }

  update(dt) {
    const H = this.humanoid;
    // timers
    if (this.stun > 0) this.stun -= dt; if (this.blind > 0) this.blind -= dt; if (this.slow > 0) this.slow -= dt;
    if (this.flash > 0) this.flash -= dt; if (this.attackCd > 0) this.attackCd -= dt;
    if (this.burn > 0) { this.burn -= dt; if (this.alive) { this.hp -= 4 * dt; if (this.hp <= 0) this.knockOut(this.lastHitBy); } if (this.rng.chance(0.4)) this.game.effects.p.emit(this.pos.x + this.rng.float(-0.3, 0.3), this.y + 1 + this.rng.float(0, 0.8), this.pos.z + this.rng.float(-0.3, 0.3), { vy: 2, color: '#ff8c1a', size: 0.5, life: 0.4 }); }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.fireAmmo = 8; }
    if (this.ko) {
      this.koTimer -= dt;
      if (this.koTimer <= 0 && !this.arrested) this.revive();
    }
    // knockback velocity
    if (this.knockVel.lengthSq() > 1e-4 && !this.carriedBy) {
      this.move(this.knockVel.x * dt, this.knockVel.y * dt);
      this.knockVel.multiplyScalar(Math.max(0, 1 - dt * 7));
    }
    // vertical: jump / fall / roof
    if (this.climbing) {
      // handled by controller (y moves)
    } else if (this.onRoof) {
      this.y = this.onRoof.roofY; this.vy = 0;
    } else {
      this.vy -= 22 * dt; this.y += this.vy * dt;
      if (this.y <= 0) { if (this.falling && this.vy < -9) this.takeHit(10, null, 0, { silent: true }); this.y = 0; this.vy = 0; this.falling = false; }
    }
    if (this.carriedBy) {
      const c = this.carriedBy; this.ko = true; this.koTimer = 2;
    } else {
      this.mesh.position.y = this.y;
    }
    this.mesh.rotation.y = this.yaw;
    // bots/npcs near enemies raise a stance
    H.update(dt, {
      speed: this.moveSpeed, moving: this.moving, duck: this.ducking, jumpY: 0, ko: this.ko, climbing: !!this.climbing,
      blocking: this.blocking, carrying: !!this.carried, holding: !!this.heldProp, stunned: this.stun > 0 && !this.ko, stance: this.stance,
    });
    if (this.heldProp) {
      const p = this.heldProp; p.group.position.set(this.pos.x, this.y + this.humanoid.height + 0.2, this.pos.z); p.group.rotation.y = this.yaw;
    }
    if (this.carried) {
      const c = this.carried;
      c.mesh.position.set(this.pos.x + Math.sin(this.yaw) * 0.7, this.y + 0.9, this.pos.z + Math.cos(this.yaw) * 0.7);
      c.mesh.rotation.set(Math.PI / 2 * 0.9, this.yaw, 0);
      c.pos.x = c.mesh.position.x; c.pos.z = c.mesh.position.z;
    }
  }
}
