// Player controller: movement, jump/duck, melee, throws, and the archetype ability (Z / UI button).
import * as THREE from 'three';
import { meleeStrike, shieldBash } from '../game/combat.js';
import { startClimb, climbStep, startDescend } from './botai.js';

export class PlayerController {
  constructor(game, character, input, camera) {
    this.game = game; this.c = character; this.input = input; this.cam = camera;
    this.vy = 0; this.holdT = 0; this.commandCandidate = null; this.fireT = 0; this.flurryT = 0;
  }
  update(dt) {
    const c = this.c, g = this.game, inp = this.input;
    const events = inp.drain();
    if (c.ko || c.arrested) { c.moving = false; c.moveSpeed = 0; return; }
    // camera-relative movement
    const yaw = this.cam.yaw + Math.PI; // forward direction = away from camera
    const mx = inp.move.x, my = inp.move.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const l = Math.hypot(dx, dz);
    const stunned = c.stun > 0;

    if (c.climbing) {
      // looter climbing: forward = up, backward = down
      const want = my > 0.3 ? 1 : my < -0.3 ? -1 : 0;
      if (!inp.abilityDown && c.y > 0.1 && c.y < c.climbing.roofY - 0.1) { // let go: drop down
        c.climbing = null; c.vy = 0;
      } else climbStep(c, dt, want);
      return;
    }

    this.cam.inputFwd = my; this.cam.inputSide = mx;
    c.running = l > 0.05 && inp.run && !stunned && !c.ducking && !c.heldProp && !c.carried;
    if (l > 0.05 && !stunned) {
      const sp = c.speed * Math.min(1, l) * (c.running ? 1.75 : 1);
      c.move((dx / l) * sp * dt, (dz / l) * sp * dt);
      c.moving = true; c.moveSpeed = sp;
      if (!this.engageFacing) c.faceTowards(c.pos.x + dx, c.pos.z + dz, dt, 16);
    } else { c.moving = false; c.moveSpeed = 0; }
    this.engageFacing = false;

    // jump
    for (const e of events) {
      if (e.type === 'jump' && !c.airborne && !stunned && !c.carried && !c.heldProp) {
        // looters are built for rooftops: a much bigger running leap
        c.vy = c.arch.id === 'looter' ? (c.running ? 8.6 : 7.8) : 7.2; c.ducking = false;
        c.onRoof = null; c.airborne = true;
      }
      if (e.type === 'duck') { c.ducking = !c.ducking; }
      if (e.type === 'attack') { if (!this.attack()) this.queued = { e, t: 0 }; }
      if (e.type === 'throw') { if (!this.throw(e)) this.queued = { e, t: 0 }; }
      if (e.type === 'abilityDown') this.abilityDown();
      if (e.type === 'abilityTap') this.abilityTap();
      if (e.type === 'abilityRelease') this.abilityRelease(e.held);
    }
    // input buffering: an attack/throw that arrived mid-animation fires as soon as the current action ends
    if (this.queued) {
      this.queued.t += dt;
      const ok = this.queued.e.type === 'attack' ? this.attack() : this.throw(this.queued.e);
      if (ok || this.queued.t > 0.6) this.queued = null;
    }
    // held attack for continuous weapons
    if (inp.attackHeld && (c.weapon.mech === 'flurry' || c.weapon.mech === 'spray')) this.attack(true);
    // ability hold behaviours
    if (inp.abilityDown) this.abilityHeld(dt);
    c.stance = this.nearestInCone(8, 6.3) ? 1 : 0;
    // auto pickup collectibles
    for (const col of g.world.collectibles) if (col.alive && Math.hypot(col.x - c.pos.x, col.z - c.pos.z) < 1.3 && Math.abs(c.y) < 1) g.pickupCollectible(c, col);
    // snatch: auto-arrest when we're well behind our line with someone carried
    if (c.carried && g.beyond(c) < -7) g.arrest(c, c.carried);
  }

  attack(held = false) {
    const c = this.c, g = this.game;
    if (c.attackCd > 0 || c.humanoid.busy || c.stun > 0 || c.carried || c.heldProp || c.climbing) return false;
    if (c.blocking) return false;
    // face the nearest enemy in a wide cone in front so taps feel sticky
    const t = this.nearestInCone(c.reach + 1.2, 1.6);
    if (t) { c.faceTowards(t.pos.x, t.pos.z, 1, 1); }
    const dur = c.weapon.mech === 'flurry' ? 0.22 : c.weapon.mech === 'spray' ? 0.2 : Math.max(0.3, c.weapon.cooldown * 1.1);
    c.attackCd = c.weapon.cooldown;
    c.humanoid.play('attack', { dur, onHit: () => { if (c.alive) meleeStrike(g, c, { heldDown: held }); } });
    return true;
  }
  nearestInCone(range, arc) {
    const c = this.c; let best = null, bd = range; const f = c.forward();
    for (const o of this.game.characters) {
      if (o === c || !o.alive || o.faction === c.faction || o.carriedBy) continue;
      const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d > bd) continue; if ((f.x * dx + f.y * dz) / (d || 1) < Math.cos(arc / 2)) continue;
      bd = d; best = o;
    }
    return best;
  }
  throw(e) {
    const c = this.c, g = this.game;
    if (c.stun > 0 || c.carried || c.heldProp || c.climbing) return true; // drop silently
    if (c.humanoid.busy) return false; // buffer it
    const types = c.faction === 'rioter' ? ['molotov', 'rock'] : ['flashbang', 'teargas'];
    const type = this.game.hud.selectedThrow && c.inventory[this.game.hud.selectedThrow] > 0 ? this.game.hud.selectedThrow : types.find((t) => c.inventory[t] > 0);
    if (!type) { g.hud.toast('No projectiles. Find floating supplies.'); return true; }
    let dx, dz;
    if (e.forward) { const f = c.forward(); dx = f.x; dz = f.y; }
    else { // swipe vector in screen space -> world (screen up = camera forward)
      const yaw = this.cam.yaw + Math.PI; const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
      dx = fx * -e.sy + rx * e.sx; dz = fz * -e.sy + rz * e.sx;
    }
    c.inventory[type]--; g.hud.refreshAmmo();
    c.faceTowards(c.pos.x + dx, c.pos.z + dz, 1, 1);
    const power = 0.35 + 0.65 * (e.power ?? 0.6);
    c.humanoid.play('throw', { dur: 0.5, variant: 'throw', onHit: () => {
      const from = c.humanoid.handWorld(); from.y = Math.max(from.y, c.y + 1.5);
      g.projectiles.launchDir(type, c, from, dx, dz, power);
    } });
    return true;
  }

  // ---- abilities ----
  abilityDown() {
    const c = this.c, g = this.game, A = c.arch.id;
    this.holdT = 0;
    if (A === 'front_echelon') c.blocking = true;
    if (A === 'grenadier') this.fireGun();
    if (A === 'brawler' && !c.heldProp) {
      const p = g.world.nearestProp(c.pos.x, c.pos.z, 2.2, (q) => q.kind === 'medium' && !q.held);
      if (p) { c.faceTowards(p.x, p.z, 1, 1); g.pickupProp(c, p); c.holdCharge = 0; g.hud.toast('Charging… release to throw'); }
      else g.hud.toast('No prop to pick up nearby (barriers, benches, boxes)');
    }
    if (A === 'looter') this.climbTried = false; // climbing starts on a short hold so a tap can still loot
  }
  abilityHeld(dt) {
    const c = this.c, g = this.game, A = c.arch.id; this.holdT += dt;
    if (A === 'looter' && !this.climbTried && this.holdT > 0.22 && !c.climbing) {
      this.climbTried = true;
      if (c.onRoof) { // climb down the nearest wall if we're at an edge
        const ex = g.world.roofExitNear(c.pos.x, c.pos.z, 1.6);
        if (ex) { startDescend(c, ex); g.hud.toast('Climbing down'); }
        else g.hud.toast('Get to a roof edge to climb down, or jump across to the next roof');
      } else if (!c.airborne) {
        const f = c.forward(); const hit = g.world.climbableAt(c.pos.x, c.pos.z, f.x, f.y);
        if (hit) { startClimb(c, hit); if (!this.climbHinted) { this.climbHinted = true; g.hud.toast('Climbing: push forward to go up, back to go down'); } }
        else g.hud.toast('Face a building wall or the monument to climb');
      }
    }
    if (A === 'grenadier') { this.fireT -= dt; if (this.fireT <= 0 && this.holdT > 0.25) { this.fireGun(); } }
    if (A === 'brawler' && c.heldProp) { c.holdCharge = Math.min(1.6, c.holdCharge + dt); g.hud.charge(c.holdCharge / 1.6); }
    if (A === 'commander' || A === 'instigator') {
      const grp = g.groupNear(c, 14, (gr) => gr.commander !== c);
      this.commandCandidate = grp;
      if (grp) { g.hud.charge(Math.min(1, this.holdT / 1.1), `Taking command of ${grp.name}`); if (this.holdT >= 1.1) { g.takeCommand(c, grp); this.holdT = -10; g.hud.charge(0); } }
      else if (!c.commandOf) g.hud.charge(0, 'No mob/squad in range');
    }
    if (A === 'snatch_squad' && !c.carried) {
      const t = this.nearestInCone(2.0, 1.4);
      if (t && !t.onRoof && !c.humanoid.busy && this.holdT > 0.15) {
        c.faceTowards(t.pos.x, t.pos.z, 1, 1);
        c.humanoid.play('grab', { dur: 0.7, variant: 'grab', onHit: () => { if (t.alive && c.distTo(t) < 2.2 && !t.carriedBy) { g.grab(c, t); g.hud.toast('Restrained! Drag them behind the line'); } } });
      }
    }
  }
  abilityTap() {
    const c = this.c, g = this.game, A = c.arch.id;
    if (A === 'commander' || A === 'instigator') {
      if (c.commandOf && c.commandOf.commander === c) { const s = c.commandOf.cycleStrategy(); g.hud.strategy(c.commandOf, s); g.hud.toast(`${c.commandOf.name}: ${s.name}`); }
      else g.hud.toast('Hold to take command of a nearby ' + (A === 'commander' ? 'squad' : 'mob'));
    }
    if (A === 'front_echelon') { c.blocking = false; if (!c.humanoid.busy) c.humanoid.play('bash', { dur: 0.45, variant: 'bash', onHit: () => shieldBash(g, c) }); }
    if (A === 'looter') {
      if (c.climbing) return;
      const p = g.world.nearestProp(c.pos.x, c.pos.z, 1.9, (q) => q.lootable);
      if (p) { c.faceTowards(p.x, p.z, 1, 1); c.humanoid.play('loot', { dur: 0.5, variant: 'loot', onHit: () => g.loot(c, p) }); }
      else g.hud.toast('Nothing to loot here (jewelry, art, café stuff)');
    }
    if (A === 'brawler' && c.heldProp) g.throwProp(c, 0.3);
    if (A === 'snatch_squad' && c.carried) g.arrest(c, c.carried);
    if (A === 'grenadier') { /* fired on press */ }
  }
  abilityRelease(held) {
    const c = this.c, g = this.game, A = c.arch.id;
    if (A === 'front_echelon') c.blocking = false;
    if (A === 'brawler' && c.heldProp) { g.throwProp(c, Math.min(1, c.holdCharge / 1.6)); g.hud.charge(0); }
    if (A === 'commander' || A === 'instigator') g.hud.charge(0);
    if (A === 'looter' && c.climbing) { /* letting go handled in update */ }
  }
  fireGun() {
    const c = this.c, g = this.game;
    if (c.fireAmmo <= 0) { if (c.reloadT <= 0) { c.reloadT = 1.4; g.hud.toast('Reloading…'); } return; }
    this.fireT = 0.14;
    const t = this.nearestInCone(24, 0.9);
    if (t) c.faceTowards(t.pos.x, t.pos.z, 1, 1);
    g.fireGun(c, t);
  }
}
