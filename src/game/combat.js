// Melee resolution with per-weapon mechanics, plus prop/building damage helpers used by everything.
import { WEAPONS } from '../data/config.js';

export function meleeStrike(game, attacker, { heldDown = false } = {}) {
  const w = attacker.weapon, E = game.effects;
  const f = attacker.forward();
  const ox = attacker.pos.x, oz = attacker.pos.z;
  const range = attacker.reach, arc = w.arc;
  let dmg = w.dmg * attacker.arch.stats.dmg * attacker.strengthMult * (attacker.isPlayer ? 1 : 0.7);
  const hitChars = [];
  const spin = attacker.humanoid.action?.variant === 'spin';
  for (const c of game.characters) {
    if (c === attacker || !c.alive || c.faction === attacker.faction || c.carriedBy) continue;
    if (Math.abs(c.y - attacker.y) > 1.4) continue;
    const dx = c.pos.x - ox, dz = c.pos.z - oz, d = Math.hypot(dx, dz);
    if (d > range + c.radius) continue;
    const dot = (f.x * dx + f.y * dz) / (d || 1);
    if (!spin && dot < Math.cos(arc / 2)) continue;
    hitChars.push(c);
    if (w.mech !== 'sweep' && w.mech !== 'slam' && w.mech !== 'spray' && !spin) break; // single target for most
  }
  let anyHit = false;
  for (const c of hitChars) {
    let d = dmg, knock = w.knock, opts = {};
    switch (w.mech) {
      case 'combo':
        if (attacker.comboTarget === c) attacker.comboCount = Math.min(6, attacker.comboCount + 1); else { attacker.comboTarget = c; attacker.comboCount = 0; }
        d *= 1 + attacker.comboCount * 0.22; break;
      case 'spray': opts = { blind: 2.5, slow: 2.0 }; knock = 0.05; break;
      case 'stun': opts = { stun: 1.1 }; break;
      case 'pulse':
        attacker.hitsSincePulse++;
        if (attacker.hitsSincePulse >= 3) { attacker.hitsSincePulse = 0; pulse(game, attacker, 3.2, dmg * 0.6); }
        break;
      case 'slam':
        if (attacker.humanoid.action?.variant === 'overhead') { opts = { knockdown: 1.4 }; }
        break;
      case 'flurry': d *= heldDown ? 0.75 : 1; break;
      default: break;
    }
    c.takeHit(d, attacker, knock, opts);
    E.hit(c.pos.x, c.y + 1.2, c.pos.z, w.mech === 'spray' ? '#ffd27a' : w.mech === 'pulse' || w.mech === 'stun' ? '#7fd0ff' : '#ffffff');
    anyHit = true;
  }
  if (w.mech === 'slam' && attacker.humanoid.action?.variant === 'overhead') {
    E.dust(ox + f.x * 1.2, 0.2, oz + f.y * 1.2, 14, 1.2);
    for (const c of game.characters) if (c !== attacker && c.alive && c.faction !== attacker.faction && c.distTo(attacker) < 2.6 && !hitChars.includes(c)) c.takeHit(dmg * 0.3, attacker, 1.5, { knockdown: 1.0 });
  }
  // props and buildings in front
  const px = ox + f.x * (range * 0.7), pz = oz + f.y * (range * 0.7);
  const propBonus = w.propBonus || 1;
  const prop = game.world.nearestProp(px, pz, range * 0.9 + 0.4, (p) => p.kind !== 'fragile' || Math.abs(p.y - (attacker.y + 1.5)) < 2);
  if (prop && !prop.held) { game.damageProp(prop, dmg * 1.4 * propBonus, attacker); anyHit = true; }
  else {
    const b = game.world.buildingNear(px, pz, 0.9);
    if (b && !attacker.onRoof) { game.damageBuilding(b, dmg * 0.35 * propBonus, attacker); E.debris(px, attacker.y + 1.3, pz, '#c9b99a', 5, 0.4); anyHit = true; }
  }
  return anyHit;
}

export function pulse(game, attacker, radius, dmg) {
  const E = game.effects;
  E.flash(attacker.pos.x, 1, attacker.pos.z, 0.2);
  E.p.burst(attacker.pos.x, 1, attacker.pos.z, 40, () => ({ vx: game.rng.float(-6, 6), vy: game.rng.float(0, 2), vz: game.rng.float(-6, 6), color: '#3d8bff', size: 0.5, life: 0.4 }));
  for (const c of game.characters) if (c !== attacker && c.alive && c.faction !== attacker.faction && c.distTo(attacker) < radius) c.takeHit(dmg, attacker, 2.2, { knockdown: 1.3 });
}

export function shieldBash(game, attacker) {
  const f = attacker.forward();
  for (const c of game.characters) {
    if (c === attacker || !c.alive || c.faction === attacker.faction) continue;
    const dx = c.pos.x - attacker.pos.x, dz = c.pos.z - attacker.pos.z, d = Math.hypot(dx, dz);
    if (d > 2.0) continue;
    if ((f.x * dx + f.y * dz) / (d || 1) < 0.5) continue;
    c.takeHit(10 * attacker.strengthMult, attacker, 3.2, { stun: 0.6 });
    game.effects.hit(c.pos.x, 1.2, c.pos.z, '#9bc4e8');
  }
  const prop = game.world.nearestProp(attacker.pos.x + f.x, attacker.pos.z + f.y, 1.6, (p) => p.kind !== 'fragile');
  if (prop) game.damageProp(prop, 12, attacker);
}
