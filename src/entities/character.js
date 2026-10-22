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
    this.vy = 0; this.y = 0; this.onRoof = null; this.airborne = false; this.climbing = null; this.ducking = false; this.blocking = false;
    this.carried = null; this.carriedBy = null; this.heldProp = null; this.holdCharge = 0;
    this.group = null; this.slot = null; this.strategy = null; this.commandOf = null;
    this.moveSpeed = 0; this.moving = false; this.stance = 0;
    this.knockVel = new THREE.Vector2(); this.lastHitBy = null; this.kills = 0;
    this.aiTimer = this.rng.float(0, 0.3); this.target = null; this.desired = new THREE.Vector2(x, z);
    this.vel = new THREE.Vector2(); this.stuckT = 0; this.lookYaw = 0;
    // individuality: every bot moves, reacts and commits a little differently
    const courageBase = { brawler: 0.9, instigator: 0.7, looter: 0.45, rioter_npc: 0.5, front_echelon: 0.85, snatch_squad: 0.8, commander: 0.7, grenadier: 0.4, peacekeeper_npc: 0.55 }[archetype] ?? 0.5;
    this.traits = { speed: this.rng.float(0.86, 1.14), courage: Math.max(0.1, Math.min(1, courageBase + this.rng.float(-0.18, 0.18))), spacing: this.rng.float(0.95, 1.45), react: this.rng.float(0.1, 0.5), wanderPh: this.rng.float(0, 6.28), fidgetT: this.rng.float(2, 7), hurtAt: this.rng.float(0.28, 0.45), climber: archetype === 'looter' && this.rng.chance(0.65) };
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
  /** Move in world xz. On the ground: street collision. Off the ground: the rooftop height map. */
  move(dx, dz) {
    if (this.y > 0.05 || this.vy > 0) {
      const looter = this.arch.id === 'looter';
      const step = this.airborne ? (looter ? 1.25 : 0.35) : 0.6; // airborne looters catch ledges and mantle up
      this.world.moveElevated(this.pos, dx, dz, this.isPlayer ? this.radius : this.radius * 0.6, this.y, step, this.isPlayer ? Infinity : 3.5);
      return;
    }
    this.world.moveWithCollision(this.pos, dx, dz, this.radius);
  }
  /** Touching down after a jump or drop: hard landings hurt (looters roll out of them). */
  land(vy) {
    if (vy < -11) {
      const dmg = (-vy - 11) * 4 * (this.arch.id === 'looter' ? 0.35 : 1);
      if (dmg > 2) this.takeHit(dmg, null, 0, { silent: true, stun: Math.min(0.8, dmg / 60) });
      this.game.effects.dust(this.pos.x, this.y + 0.1, this.pos.z, 8, 0.8);
    }
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
    // catch your breath: slow recovery when nobody is in your face
    if (this.alive && this.stance === 0 && this.burn <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + (this.isPlayer ? 2.5 : 2) * dt);
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
      this.airborne = false; // y driven by climbStep
    } else if (!this.carriedBy) {
      const ground = this.world.groundUnder(this.pos.x, this.pos.z, 0.22);
      if (this.vy > 0 || this.y > ground + 0.6) {
        this.vy -= 22 * dt; this.y += this.vy * dt;
        if (this.y <= ground) { this.y = ground; this.land(this.vy); this.vy = 0; }
      } else { this.y = ground; this.vy = 0; } // standing, stepping down small ledges, or mantling up
      this.airborne = this.y > ground + 0.02;
      this.onRoof = !this.airborne && ground > 0.5 ? this.world.surfaceObjAt(this.pos.x, this.pos.z) : null;
      // rooftop launch points: looters rip up roof tiles for ammo
      if (this.onRoof && this.arch.id === 'looter' && this.alive) {
        this.tileT = (this.tileT ?? 6) - dt;
        if (this.tileT <= 0) { this.tileT = this.isPlayer ? 5 : 7; if ((this.inventory.rock || 0) < 4) { this.inventory.rock = (this.inventory.rock || 0) + 1; if (this.isPlayer) { this.game.hud.refreshAmmo(); this.game.hud.popup('Roof tile', 0); } } }
      }
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
      lookYaw: this.lookYaw, hurt: this.hp < this.maxHp * 0.35, airborne: this.airborne && !this.ko,
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
