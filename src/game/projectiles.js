// Thrown objects: rocks, molotovs, tear gas, flashbangs, rubber bullets, and thrown props.
import * as THREE from 'three';
import { PROJECTILES } from '../data/config.js';
import { mat, sph, cyl, box } from '../world/props.js';

export class Projectiles {
  constructor(game) { this.game = game; this.list = []; }

  /** Launch toward a world point with a ballistic arc. */
  launchAt(type, owner, from, target, opts = {}) {
    const def = PROJECTILES[type] || { speed: 16, mass: 0.6, dmg: 10, color: '#fff' };
    const dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz) || 1;
    const g = 18, speed = Math.min(def.speed * 1.25, Math.max(8, Math.sqrt(dist * g * 1.15)));
    // choose arc angle for range (low arc)
    const s2 = speed * speed, root = s2 * s2 - g * (g * dist * dist + 2 * (target.y - from.y) * s2);
    const ang = root >= 0 ? Math.atan((s2 - Math.sqrt(root)) / (g * dist)) : 0.6;
    const vx = (dx / dist) * Math.cos(ang) * speed, vz = (dz / dist) * Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    return this.spawn(type, owner, from, new THREE.Vector3(vx, vy, vz), opts);
  }
  launchDir(type, owner, from, dirX, dirZ, power = 1, opts = {}) {
    const def = PROJECTILES[type] || { speed: 16 };
    const sp = def.speed * (0.6 + 0.6 * power), l = Math.hypot(dirX, dirZ) || 1;
    const vy = opts.flat ? 0.5 : 4 + 4 * power;
    return this.spawn(type, owner, from, new THREE.Vector3((dirX / l) * sp, vy, (dirZ / l) * sp), opts);
  }
  spawn(type, owner, from, vel, opts = {}) {
    const def = PROJECTILES[type] || {};
    let mesh;
    if (opts.prop) mesh = opts.prop.group;
    else if (type === 'rock') mesh = sph(0.13, mat('#8a8a80'));
    else if (type === 'molotov') { mesh = new THREE.Group(); mesh.add(cyl(0.06, 0.28, mat('#4a7a3a', { transparent: true, opacity: 0.85 }))); const f = sph(0.08, mat('#ffb02e', { emissive: '#ff8c1a', emissiveIntensity: 2 }), 0, 0.2, 0); mesh.add(f); }
    else if (type === 'teargas') { mesh = cyl(0.06, 0.22, mat('#6b7a6b')); }
    else if (type === 'flashbang') { mesh = cyl(0.05, 0.18, mat('#333')); }
    else if (type === 'bullet') { mesh = sph(0.07, mat('#222')); }
    else mesh = sph(0.12, mat('#999'));
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    const p = { type, owner, mesh, vel, pos: mesh.position, t: 0, def, prop: opts.prop || null, power: opts.power ?? 1, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), dead: false, bullet: type === 'bullet' };
    this.list.push(p); return p;
  }

  update(dt) {
    const g = this.game, E = g.effects;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      if (!p.bullet) p.vel.y -= 18 * dt;
      const steps = p.bullet ? 3 : 1;
      let hit = null;
      for (let s = 0; s < steps && !hit; s++) {
        p.pos.addScaledVector(p.vel, dt / steps);
        if (!p.prop && !p.bullet) { p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.z += p.spin.z * dt; }
        else if (p.prop) { p.mesh.rotation.x += 3 * dt; }
        // hit characters
        const r = p.prop ? 1.2 : p.bullet ? 0.45 : 0.55;
        for (const c of g.characters) {
          if (!c.alive || c === p.owner || c.carriedBy) continue;
          if (p.owner && c.faction === p.owner.faction && !p.prop) continue;
          const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, dy = (c.y + 0.9) - p.pos.y;
          if (dx * dx + dz * dz < r * r && Math.abs(dy) < 1.2) { hit = { char: c }; break; }
        }
        if (hit) break;
        // world collisions
        if (p.pos.y <= 0.05) { hit = { ground: true }; break; }
        if (p.pos.y < 30 && g.world.blockedAt(p.pos.x, p.pos.z) && p.t > 0.08) {
          const b = g.world.buildingNear(p.pos.x, p.pos.z, 0.6);
          if (b && b.h > p.pos.y) { hit = { building: b }; break; }
          const prop = g.world.nearestProp(p.pos.x, p.pos.z, 1.6, (q) => q.blocking && q !== p.prop);
          if (prop && p.pos.y < prop.height + 0.5) { hit = { prop }; break; }
          if (!b && !prop) { hit = { ground: true }; break; }
        }
        if (p.t > 8) { hit = { ground: true }; }
      }
      if (hit) { this.impact(p, hit); p.dead = true; }
      if (p.dead) {
        if (!p.prop) g.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  impact(p, hit) {
    const g = this.game, E = g.effects, x = p.pos.x, y = Math.max(0.1, p.pos.y), z = p.pos.z;
    const def = p.def, owner = p.owner;
    if (p.prop) {
      // thrown prop: heavy blunt hit + damage props/buildings it lands on; the prop itself breaks
      const dmg = 30 + 20 * p.prop.throwMass * p.power;
      if (hit.char) hit.char.takeHit(dmg, owner, 2.5, { knockdown: 1.5 });
      for (const c of g.characters) if (c.alive && c !== owner && c.distTo({ pos: p.pos }) < 1.8 && !hit.char) c.takeHit(dmg * 0.6, owner, 2, { knockdown: 1.2 });
      if (hit.building) g.damageBuilding(hit.building, 25 * p.prop.throwMass, owner);
      if (hit.prop) g.damageProp(hit.prop, 60, owner);
      g.destroyProp(p.prop, owner, true);
      E.debris(x, y, z, '#8a7a66', 20, 1.2);
      return;
    }
    switch (p.type) {
      case 'rock':
        if (hit.char) { hit.char.takeHit(def.dmg, owner, 1.0, { stun: 0.2 }); E.hit(x, y, z, '#ddd'); }
        else { E.debris(x, y, z, '#8a8a80', 6, 0.5); if (hit.building) g.damageBuilding(hit.building, 2, owner); if (hit.prop) g.damageProp(hit.prop, 18, owner); }
        this.checkWindows(x, y, z, owner, 1.2);
        break;
      case 'bullet':
        if (hit.char) { hit.char.takeHit(def?.dmg ?? 9, owner, 0.8, { stun: 0.3 }); E.hit(x, y, z, '#fff'); }
        else { E.sparks(x, y, z, '#ddd', 4); if (hit.prop) g.damageProp(hit.prop, 8, owner); }
        this.checkWindows(x, y, z, owner, 0.8);
        break;
      case 'molotov': {
        E.debris(x, y, z, '#ff8c1a', 20, 0.8); E.glass(x, y, z);
        E.fire(x, 0, z, def.radius, def.fire, (dt) => {
          for (const c of g.characters) if (c.alive && !c.onRoof && Math.hypot(c.pos.x - x, c.pos.z - z) < def.radius + 0.4) { if (c.burn <= 0) c.lastHitBy = owner; c.burn = Math.max(c.burn, 2.5); c.lastHitBy = owner || c.lastHitBy; }
        });
        if (hit.char) hit.char.takeHit(def.dmg, owner, 0.6);
        g.igniteNear(x, z, def.radius + 2, owner);
        this.checkWindows(x, y, z, owner, 3);
        g.flashMessage && g.flashMessage(null);
        break;
      }
      case 'teargas':
        E.gas(x, z, def.radius, def.gas); E.puff(x, y, z, '#e6e6d2');
        if (hit.char) hit.char.takeHit(def.dmg, owner, 0.3);
        g.gasOwners.push({ x, z, r: def.radius, owner, t: def.gas });
        break;
      case 'flashbang':
        E.flash(x, 1.2, z, 1);
        for (const c of g.characters) {
          if (!c.alive) continue;
          const d = Math.hypot(c.pos.x - x, c.pos.z - z);
          if (d < def.radius) { c.takeHit(def.dmg, owner, 0.3, { stun: def.flash * (1 - d / def.radius) + 0.5, silent: true }); c.lastHitBy = owner || c.lastHitBy; }
        }
        if (g.player && Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < def.radius + 3) g.hud.flash(1);
        this.checkWindows(x, y, z, owner, 2.5);
        break;
      default: break;
    }
  }
  checkWindows(x, y, z, owner, r) {
    for (const p of this.game.world.props) {
      if (!p.alive || p.kind !== 'fragile') continue;
      if (Math.hypot(p.x - x, p.z - z) < r) this.game.damageProp(p, 5, owner);
    }
  }
}
