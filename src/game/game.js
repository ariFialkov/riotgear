// Round orchestration: builds the world, spawns groups, runs the sim loop, economy, events and endings.
import * as THREE from 'three';
import { World } from '../world/city.js';
import { Effects } from './effects.js';
import { Projectiles } from './projectiles.js';
import { Character } from '../entities/character.js';
import { Group } from '../entities/groups.js';
import { updateBot, startDescend } from '../entities/botai.js';
import { PlayerController } from '../entities/player.js';
import { FollowCamera } from '../core/camera.js';
import { Director } from './director.js';
import { rollOutcome } from './rtp.js';
import { RNG, hashString } from '../core/rng.js';
import { FACTIONS, ARCHETYPES, ECONOMY, M_TO_FT, PROJECTILES, WEAPONS } from '../data/config.js';
import { mat } from '../world/props.js';

export class Game {
  constructor({ scene, camera, renderer, hud, input, quality, seed, selection, spectate = false, world = null, spawns = null }) {
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.hud = hud; this.input = input; this.quality = quality;
    this.seed = seed; this.rng = new RNG(seed); this.spectate = spectate; this.selection = selection; this.presetSpawns = spawns;
    this.characters = []; this.groups = []; this.gasOwners = []; this.messages = [];
    this.time = 0; this.money = 0; this.roundOver = false; this.playerThreat = -6; this.debugLog = [];
    this.fronts = null; // contested perimeter radius per sector, created after the world
    this.stats = { advance: 0, linePush: 0, kos: 0, props: 0, loot: 0, quelled: 0, buildings: 0 };
    this.botApi = { startDescend };
    this.world = world || new World(scene, this.rng.fork('world'), quality);
    this.effects = new Effects(scene, this.rng.fork('fx'));
    this.fronts = Array.from({ length: this.world.SECTORS }, () => ({ r: this.world.R0, vel: 0 }));
    this.R0 = this.world.R0;
    this.projectiles = new Projectiles(this);
    this.spawnGroups();
    if (!spectate) {
      const sel = selection;
      this.playerFaction = sel.faction; this.enemyFaction = sel.faction === 'rioter' ? 'peacekeeper' : 'rioter';
      this.stake = sel.stake;
      this.outcome = rollOutcome(hashString('outcome:' + seed), sel.stake);
      this.director = new Director(this, this.outcome);
      // Hidden pace: all earnings in a round are scaled so that natural play lands near the result
      // around the intended duration, so the director only has to nudge rather than wrench.
      const T = this.outcome.durationSec, natural = ECONOMY.perSecondAlive * T + 0.0045 * T;
      this.payScale = Math.max(0.15, Math.min(12, this.outcome.multiplier / natural));
      const home = this.groups.filter((g) => g.faction === sel.faction)[0];
      const W = this.world, sp = this.placeNear(home.spawn, 3);
      const yaw = Math.atan2(W.center.x - sp.x, W.center.z - sp.z) + (sel.faction === 'rioter' ? 0 : Math.PI);
      this.player = new Character(this, { archetype: sel.archetype, weaponId: sel.weapon, isPlayer: true, x: sp.x, z: sp.z, yaw, name: 'You', bandana: '#ff2d55' });
      this.addCharacter(this.player);
      home.add(this.player);
      this.controller = new PlayerController(this, this.player, input, null);
      this.followCam = new FollowCamera(camera, this.world); this.controller.cam = this.followCam; this.followCam.snapTo(this.player);
      if (this.player.arch.smokestick) this.effects.smokeStick(this.player.humanoid.smokeTip, '#ff2d55');
    } else {
      this.playerFaction = 'rioter'; this.enemyFaction = 'peacekeeper'; this.player = null;
      this.spectateT = 0;
    }
    this.lastFrontForPush = 0;
  }

  /** The sector front that matters to the player (their group's approach). */
  get front() { const k = this.player?.group ? this.player.group.sector : 0; return this.fronts[k]; }
  frontAt(x, z) { return this.fronts[this.world.sectorOf(x, z)].r; }
  meanFront() { return this.fronts.reduce((a, f) => a + f.r, 0) / this.fronts.length; }
  /** How far (m) a character stands past the contested perimeter into enemy ground (negative = own side). */
  beyond(c) { const d = this.world.distToCenter(c.pos.x, c.pos.z), r = this.frontAt(c.pos.x, c.pos.z); return c.faction === 'rioter' ? r - d : d - r; }
  /** Ground taken by the player's group past the original perimeter (m). */
  groupPush(grp) { const r = this.fronts[grp.sector].r; return grp.faction === 'rioter' ? Math.max(0, this.R0 - r) : Math.max(0, r - this.R0); }
  playerAdvance() { const pl = this.player, d = this.world.distToCenter(pl.pos.x, pl.pos.z); return pl.faction === 'rioter' ? Math.max(0, this.R0 - d) : Math.max(0, d - this.R0); }
  coreTaken() { return this.meanFront() < 14; }

  // ---------- setup ----------
  spawnGroups() {
    const rng = this.rng.fork('spawn'), q = this.quality.bots, W = this.world;
    const coreField = W.flowField(W.center.x, W.center.z);
    const place = (sp, spread) => { // a walkable spot near sp that can reach the core
      for (let i = 0; i < 10; i++) { const p = W.nearestWalkable(sp.x + rng.float(-spread, spread), sp.z + rng.float(-spread, spread), 10); if (W.reachable(coreField, p.x, p.z)) return p; }
      return W.nearestWalkable(sp.x, sp.z, 20);
    };
    this.placeNear = place;
    const mk = (faction, count, spawns, sectors) => {
      const arches = FACTIONS[faction].archetypes, npc = FACTIONS[faction].npcArchetype;
      spawns.forEach((sp, gi) => {
        const grp = new Group(this, faction, gi, sp, sectors[gi]); this.groups.push(grp);
        const n = Math.max(4, Math.round(count / spawns.length));
        for (let i = 0; i < n; i++) {
          const isBot = rng.chance(faction === 'rioter' ? 0.42 : 0.8);
          const archetype = isBot ? rng.pick(arches) : npc;
          const weapons = WEAPONS[faction]; const w = isBot ? rng.pick(weapons.slice(0, 4)).id : weapons[0].id;
          const p = place(sp, 7);
          const yaw = Math.atan2(W.center.x - p.x, W.center.z - p.z) + (faction === 'rioter' ? 0 : Math.PI);
          const c = new Character(this, { archetype, weaponId: w, x: p.x, z: p.z, yaw, bandana: isBot ? null : undefined, name: isBot ? botName(rng) : null });
          if (c.arch.smokestick) this.effects.smokeStick(c.humanoid.smokeTip, rng.pick(['#ff2d55', '#2e7dff', '#ffb02e', '#7cff2e']));
          this.addCharacter(c); grp.add(c);
        }
      });
    };
    // squads: four posts in the plaza, each facing a quadrant of the city
    const core = [[-12, -8], [12, -8], [-12, 14], [12, 14]].map(([x, z]) => W.nearestWalkable(W.center.x + x, W.center.z + z, 8));
    mk('peacekeeper', q.peacekeeper, core, core.map((p) => W.sectorOf(p.x, p.z)));
    // mobs: well separated edges of the city; they loot first, then choose an approach
    const spots = this.presetSpawns || W.mobSpawnSpots(rng, 4);
    mk('rioter', q.rioter, spots, spots.map((p) => W.sectorOf(p.x, p.z)));
    for (const g of this.groups) if (g.faction === 'peacekeeper') g.setStrategy('slow_advance');
  }
  addCharacter(c) { this.characters.push(c); this.scene.add(c.mesh); }
  removeCharacter(c) { c.removed = true; this.scene.remove(c.mesh); if (c.group) { const i = c.group.members.indexOf(c); if (i >= 0) c.group.members.splice(i, 1); } }

  // ---------- director-facing API ----------
  sideMult(faction) {
    const b = this.director ? this.director.bias : 0;
    const s = faction === this.playerFaction ? b : -b;
    return 1 + 0.55 * s;
  }
  biasFor(faction) { return this.director ? (faction === this.playerFaction ? this.director.bias : -this.director.bias) : 0; }
  enemyAliveRatio() { const e = this.characters.filter((c) => c.faction === this.enemyFaction); return e.filter((c) => c.alive).length / Math.max(1, e.length); }
  reinforce(faction, n) {
    const grp = this.groups.filter((g) => g.faction === faction && !g.quelled).sort((a, b) => a.conscious().length - b.conscious().length)[0]; if (!grp) return;
    const present = this.characters.filter((c) => c.faction === faction && !c.removed && !c.arrested).length;
    if (present + n > this.quality.bots[faction] * 1.25) return; // don't flood the map
    const rng = this.rng;
    // building a character is not free (meshes + materials), so spawn one per frame instead of a burst
    this.spawnQueue = this.spawnQueue || [];
    for (let i = 0; i < n; i++) this.spawnQueue.push({ faction, grp });
    this.hud.toast(faction === 'peacekeeper' ? 'Police reinforcements at the command post' : 'More rioters pouring in from the edges', faction === this.playerFaction ? 'good' : 'bad');
  }
  processSpawnQueue() {
    const q = this.spawnQueue; if (!q || !q.length) return;
    const { faction, grp } = q.shift(); const rng = this.rng, W = this.world;
    const isBot = rng.chance(0.5);
    const p = this.placeNear(grp.spawn, 6);
    const c = new Character(this, { archetype: isBot ? rng.pick(FACTIONS[faction].archetypes) : FACTIONS[faction].npcArchetype, weaponId: rng.pick(WEAPONS[faction].slice(0, 3)).id, x: p.x, z: p.z, yaw: Math.atan2(W.center.x - p.x, W.center.z - p.z), name: isBot ? botName(rng) : null });
    this.addCharacter(c); grp.add(c);
  }
  dropSupply(near) {
    const types = near.faction === 'rioter' ? ['rock', 'rock', 'molotov'] : ['teargas', 'flashbang'];
    for (let i = 0; i < 2; i++) this.world.spawnCollectible(this.rng.pick(types), near.pos.x + this.rng.float(-8, 8), near.pos.z + this.rng.float(-8, 8));
  }
  /** The nearest enemies drop what they're doing and come for the player (overrun ending). */
  sendMobFor(pl) {
    const s = this.characters.filter((c) => c.alive && c.faction !== pl.faction && !c.onRoof && c.distTo(pl) < 45).sort((a, b) => a.distTo(pl) - b.distTo(pl)).slice(0, 6);
    for (const c of s) { c.hunting = pl; c.huntT = 25; }
  }
  sendSnatchFor(pl) {
    const s = this.characters.filter((c) => c.alive && c.faction !== pl.faction && c.arch.id === 'snatch_squad').sort((a, b) => a.distTo(pl) - b.distTo(pl)).slice(0, 2);
    for (const c of s) { c.snatching = true; c.target = pl; c.snatchCd = 0; c.hunting = pl; c.huntT = 30; }
  }
  lobAt(pl, type) {
    const thrower = this.characters.filter((c) => c.alive && c.faction !== pl.faction && c.distTo(pl) > 6 && c.distTo(pl) < 30).sort((a, b) => a.distTo(pl) - b.distTo(pl))[0];
    const from = thrower ? thrower.humanoid.handWorld() : new THREE.Vector3(pl.pos.x + this.rng.float(-10, 10), 8, pl.pos.z + pl.dir * 20);
    if (thrower) { thrower.humanoid.play('throw', { dur: 0.6, variant: 'throw' }); thrower.faceTowards(pl.pos.x, pl.pos.z, 1, 1); from.y += 0.5; }
    this.projectiles.launchAt(type, thrower || null, from, new THREE.Vector3(pl.pos.x, pl.y + 0.5, pl.pos.z));
  }
  /** A stray rubber bullet (vs rioters) or a brick from a rooftop (vs peacekeepers). */
  strayShot(pl, instant = false) {
    const type = pl.faction === 'rioter' ? 'bullet' : 'rock';
    const W = this.world; let tx = W.center.x - pl.pos.x, tz = W.center.z - pl.pos.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (pl.faction === 'peacekeeper') { tx = -tx; tz = -tz; } // the enemy is outward for peacekeepers
    const reach = type === 'rock' ? 4 : 18;
    const from = new THREE.Vector3(pl.pos.x + tx * reach + this.rng.float(-4, 4), pl.y + (type === 'rock' ? 9 : 1.2), pl.pos.z + tz * reach + this.rng.float(-4, 4));
    const dir = new THREE.Vector3(pl.pos.x, pl.y + 1, pl.pos.z).sub(from);
    const shooter = this.characters.filter((c) => c.alive && c.faction !== pl.faction).sort((a, b) => a.distTo(pl) - b.distTo(pl))[0] || null;
    if (instant) {
      pl.takeHit(pl.hp + 1, shooter, 1.5, { silent: false });
      this.effects.hit(pl.pos.x, pl.y + 1.2, pl.pos.z, '#fff'); this.hud.flash(0.5);
      this.hud.toast(type === 'bullet' ? 'Stray rubber round. Lights out.' : 'A brick from the rooftops. Lights out.', 'bad');
      return;
    }
    if (type === 'bullet') { dir.normalize().multiplyScalar(40); const p = this.projectiles.spawn('bullet', shooter, from, dir); p.def = { dmg: 60 }; }
    else { this.projectiles.launchAt('rock', shooter, from, new THREE.Vector3(pl.pos.x, pl.y + 0.5, pl.pos.z)); }
  }

  // ---------- gameplay events ----------
  log(s) { this.debugLog.push(`${this.time.toFixed(1)}s ${s}`); }
  award(amount, label, kind = 'money') {
    if (this.roundOver || !this.player || amount <= 0) return;
    const target = this.outcome.payout;
    if (this.director?.frozen) return;
    // while the ending beat plays out, income slows so the finish has time to land naturally
    const damp = this.director?.ending ? 0.35 : 1;
    const add = Math.min(amount * this.stake * (this.payScale || 1) * damp, target - this.money);
    this.money += add;
    if (label) this.hud.popup(label, add);
  }
  onKnockout(c, by) {
    if (c.isPlayer) {
      this.hud.toast(c.arrested ? 'Arrested' : 'Knocked out', 'bad');
      if (!this.roundOver && this.money < this.outcome.payout - 1e-6) this.hud.koOverlay(true);
      return;
    }
    if (by && by.isPlayer) { this.stats.kos++; this.award(ECONOMY.knockout, `KO ${c.name}`); by.kills++; }
    if (c.isBot && by) this.hud.feed(`${by.isPlayer ? 'You' : by.name} knocked out ${c.name}`);
  }
  onGroupQuelled(grp) {
    if (grp.faction === 'rioter') {
      this.hud.toast(`${grp.name} quelled`, this.playerFaction === 'peacekeeper' ? 'good' : 'bad');
      if (this.playerFaction === 'peacekeeper') { this.stats.quelled++; this.award(ECONOMY.quellMob, `${grp.name} quelled`); }
    } else this.hud.toast(`${grp.name} has fallen back`, this.playerFaction === 'rioter' ? 'good' : 'bad');
  }
  grab(c, t) {
    if (t.carriedBy || !t.alive) return;
    c.carried = t; t.carriedBy = c; t.ko = true; t.koTimer = 99; t.releaseAll();
    if (t.isPlayer) this.hud.toast('Snatched! Being dragged behind the line', 'bad');
  }
  arrest(c, t) {
    if (!t) return;
    c.carried = null; t.carriedBy = null; t.arrest();
    this.effects.puff(t.pos.x, 1, t.pos.z, '#9bc4e8');
    if (c.isPlayer) { this.stats.kos++; this.award(ECONOMY.knockout * 1.3, `Arrested ${t.name}`); }
    if (t.isPlayer) { this.hud.koOverlay(false); this.endRound('arrested'); return; }
    t.mesh.position.set(c.pos.x, 0, c.pos.z); t.mesh.rotation.set(Math.PI / 2 * 0.9, c.yaw, 0);
    t.mesh.visible = false; this.removeCharacter(t);
    if (!c.isPlayer && this.rng.chance(0.3)) this.hud.feed(`${c.name} arrested ${t.name}`);
  }
  pickupCollectible(c, col) {
    col.alive = false; this.scene.remove(col.mesh); this.world.group.remove(col.mesh);
    const def = PROJECTILES[col.type];
    if (def.faction === c.faction) { c.inventory[col.type] = (c.inventory[col.type] || 0) + (col.type === 'rock' ? 2 : 1); if (c.isPlayer) { this.hud.refreshAmmo(); this.hud.toast(`+${col.type === 'rock' ? 2 : 1} ${def.name}`); } }
    else if (c.isPlayer) this.hud.toast(`Picked up ${def.name} (not yours to use)`);
  }
  pickupProp(c, p) {
    if (p.held) return; p.held = true; c.heldProp = p; this.world.markProp(p, 0);
    c.humanoid.play('grab', { dur: 0.4, variant: 'grab' });
  }
  throwProp(c, power) {
    const p = c.heldProp; if (!p) return; c.heldProp = null; p.held = true;
    const f = c.forward();
    const from = new THREE.Vector3(c.pos.x + f.x * 0.8, c.y + c.humanoid.height + 0.2, c.pos.z + f.y * 0.8);
    c.humanoid.play('throw', { dur: 0.5, variant: 'overhead' });
    const sp = 7 + 9 * power / Math.sqrt(p.throwMass);
    this.projectiles.spawn('prop', c, from, new THREE.Vector3(f.x * sp, 3 + 5 * power, f.y * sp), { prop: p, power });
    if (c.isPlayer) this.hud.charge(0);
  }
  fireGun(c, t) {
    if (c.fireAmmo <= 0) { if (c.reloadT <= 0) c.reloadT = 1.4; return; }
    c.fireAmmo--; if (c.fireAmmo === 0) c.reloadT = 1.4;
    c.humanoid.play('fire', { dur: 0.15, variant: 'fire' });
    const from = new THREE.Vector3(); c.humanoid.gun.getWorldPosition(from); from.y = Math.max(from.y, c.y + 1.3);
    let dir;
    if (t) dir = new THREE.Vector3(t.pos.x - from.x, (t.y + 1.0) - from.y, t.pos.z - from.z); else { const f = c.forward(); dir = new THREE.Vector3(f.x, 0, f.y); }
    dir.normalize(); dir.x += this.rng.float(-0.04, 0.04); dir.z += this.rng.float(-0.04, 0.04);
    dir.multiplyScalar(45);
    this.projectiles.spawn('bullet', c, from, dir);
    this.effects.sparks(from.x, from.y, from.z, '#ffd27a', 3);
    if (c.isPlayer) this.hud.refreshAmmo();
  }
  loot(c, p) {
    if (!p.alive) return; p.alive = false; this.world.group.remove(p.group);
    this.effects.sparks(p.x, 1, p.z, '#ffd700', 12);
    if (c.isPlayer) { this.stats.loot++; this.award(p.lootValue || ECONOMY.loot, `Looted ${p.type}`); }
  }
  takeCommand(c, grp) {
    if (grp.commander && grp.commander.isPlayer) return;
    if (c.commandOf) c.commandOf.commander = null;
    grp.commander = c; c.commandOf = grp;
    if (c.arch.id === 'instigator') { c.humanoid.play('rally', { dur: 1.2, variant: 'rally' }); this.effects.p.burst(c.pos.x, 2, c.pos.z, 30, () => ({ vx: this.rng.float(-2, 2), vy: this.rng.float(1, 4), vz: this.rng.float(-2, 2), color: '#ff2d55', size: 0.8, life: 1.2, grow: 1 })); this.hud.toast(`${grp.name} is yours! Rally cry.`, 'good'); this.audioCue && this.audioCue('rally'); }
    else this.hud.toast(`${grp.name} under your command`, 'good');
    this.hud.strategy(grp, grp.strategy);
  }
  groupNear(c, maxD, filter) {
    let best = null, bd = maxD;
    for (const g of this.groups) {
      if (g.faction !== c.faction || g.quelled || (filter && !filter(g))) continue;
      for (const m of g.members) { if (m === c || !m.alive) continue; const d = m.distTo(c); if (d < bd) { bd = d; best = g; } }
    }
    return best;
  }
  nearby(c, r) { // simple radius query (character count is small enough)
    const out = []; for (const o of this.characters) if (o !== c && !o.removed && Math.abs(o.pos.x - c.pos.x) < r && Math.abs(o.pos.z - c.pos.z) < r) out.push(o); return out;
  }

  // ---------- destruction ----------
  damageProp(p, dmg, by) {
    if (!p.alive || p.indestructible) return;
    p.hp -= dmg; const E = this.effects;
    if (p.kind === 'fragile') { this.destroyProp(p, by); return; }
    E.debris(p.x, (p.height || 1) * 0.6, p.z, p.type === 'car' ? '#999' : '#8a7a66', 5, 0.5);
    if (p.hp <= 0) this.destroyProp(p, by);
  }
  destroyProp(p, by, thrown = false) {
    if (!p.alive) return; p.alive = false;
    const E = this.effects, px = p.group.position.x, pz = p.group.position.z, py = p.group.position.y;
    if (p.kind === 'fragile') { E.glass(px, py, pz); this.world.group.remove(p.group); }
    else {
      E.debris(px, (p.height || 1) * 0.5 + py, pz, p.type === 'car' ? '#777' : '#8a6a4a', 24, 1);
      E.dust(px, 0.3, pz, 12, 1.2);
      if (p.burnable && !thrown) E.fire(px, 0, pz, Math.max(1, p.radius * 0.8), 10, null);
      // leave it as wreckage: squash + darken
      p.group.scale.y = 0.25; p.group.position.y = 0; p.group.rotation.z = this.rng.float(-0.3, 0.3);
      p.group.traverse((o) => { if (o.isMesh) o.material = mat('#3a3632'); });
      if (p.blocking) this.world.markProp(p, 0);
      if (thrown) { this.world.group.remove(p.group); this.scene.remove(p.group); }
    }
    if (by && by.isPlayer) { this.stats.props++; this.award(p.value, `Wrecked ${p.type}`); }
  }
  damageBuilding(b, dmg, by) {
    if (!b.alive) return; b.hp -= dmg; b.lastHitBy = by || b.lastHitBy;
    if (b.hp <= 0) this.collapseBuilding(b, by || b.lastHitBy);
    else if (by && by.isPlayer) this.hud.buildingHealth(b);
  }
  igniteNear(x, z, r, by) {
    const b = this.world.buildingNear(x, z, r);
    if (b && b.front && b.alive && b.burning <= 0) {
      b.burning = 8; b.lastHitBy = by || b.lastHitBy;
      const fx = Math.max(b.x0 + 1, Math.min(b.x1 - 1, x)), fz = Math.max(b.z0 + 1, Math.min(b.z1 - 1, z));
      this.effects.fire(fx, 3.5, fz, 2.2, 8, (dt) => { if (b.alive) this.damageBuilding(b, 11 * dt, b.lastHitBy); });
      if (by && by.isPlayer) this.hud.toast('Building on fire!', 'good');
    }
    for (const p of this.world.props) if (p.alive && p.burnable && !p.indestructible && Math.hypot(p.x - x, p.z - z) < r) { this.damageProp(p, 40, by); }
  }
  collapseBuilding(b, by) {
    b.alive = false; b.climbable = false;
    const E = this.effects, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    E.dust(cx, 1, cz, 120, 4, '#b8ad98'); E.debris(cx, b.h * 0.5, cz, 60, 2);
    this.collapsing = this.collapsing || []; this.collapsing.push({ b, t: 0 });
    for (const c of this.characters) if (c.onRoof && c.onRoof.target === b) { c.onRoof = null; c.falling = true; c.knockOut(by); }
    if (by && by.isPlayer) { this.stats.buildings++; this.award(b.value, 'Building collapsed!'); this.hud.toast('BUILDING DOWN', 'good'); }
    this.followCam && (this.followCam.shake = 1.2);
    this.hud.feed('A building collapsed on the square');
  }

  // ---------- front line model ----------
  updateFront(dt) {
    const W = this.world, n = this.fronts.length;
    const R = new Float32Array(n), P = new Float32Array(n);
    for (const c of this.characters) {
      if (!c.alive || c.onRoof || (c.group && c.group.phase === 'loot')) continue;
      const k = W.sectorOf(c.pos.x, c.pos.z); const fr = this.fronts[k].r;
      const d = Math.abs(W.distToCenter(c.pos.x, c.pos.z) - fr); if (d > 16) continue;
      const s = c.group?.strategy; const push = (s?.push ?? 0.5);
      let w = (1 - d / 16) * (0.5 + push) * c.strengthMult * (c.arch.build === 'heavy' ? 1.4 : 1);
      if (c.isPlayer) w *= 2.5;
      if (c.faction === 'rioter') R[k] += w; else P[k] += w;
    }
    for (let k = 0; k < n; k++) {
      const f = this.fronts[k];
      let net = (P[k] - R[k]) * 0.045; // positive = perimeter grows outward (peacekeepers winning)
      if (P[k] > 0 && R[k] === 0) net += 0.35; if (R[k] > 0 && P[k] === 0) net -= 0.5;
      // an empty sector slowly relaxes back towards the core's natural perimeter
      if (P[k] === 0 && R[k] === 0) net += (this.R0 - f.r) * 0.01;
      for (const j of [(k + n - 1) % n, (k + 1) % n]) { const dr = this.fronts[j].r - f.r; if (dr < -22) net -= 0.15; if (dr > 22) net += 0.15; }
      const want = Math.max(-1.1, Math.min(1.1, net));
      f.vel += (want - f.vel) * Math.min(1, dt * 1.5);
      f.r = Math.max(8, Math.min(125, f.r + f.vel * dt));
    }
  }

  // ---------- main loop ----------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.world.update(dt); this.effects.update(dt); this.processSpawnQueue();
    if (this.player && !this.roundOver) {
      this.input.update(dt);
      this.controller.update(dt);
    }
    for (const c of this.characters) { if (c.removed) continue; if (!c.isPlayer) updateBot(c, dt); c.update(dt); }
    this.projectiles.update(dt);
    for (const g of this.groups) g.update(dt);
    this.updateFront(dt);
    // gas effects
    for (let i = this.gasOwners.length - 1; i >= 0; i--) {
      const gs = this.gasOwners[i]; gs.t -= dt; if (gs.t <= 0) { this.gasOwners.splice(i, 1); continue; }
      for (const c of this.characters) if (c.alive && !c.onRoof && c.faction !== (gs.owner?.faction || 'peacekeeper') && Math.hypot(c.pos.x - gs.x, c.pos.z - gs.z) < gs.r) {
        c.slow = Math.max(c.slow, 0.5); c.blind = Math.max(c.blind, 0.4);
        c.hp -= 1.5 * dt; c.lastHitBy = gs.owner || c.lastHitBy; if (c.hp <= 0 && !c.ko) c.knockOut(gs.owner);
        if (c.isPlayer) this.hud.gas(true);
      }
    }
    if (this.collapsing) for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const cb = this.collapsing[i]; cb.t += dt; const m = cb.b.mesh; if (m) { m.scale.y = Math.max(0.12, 1 - cb.t / 1.6); m.position.y = -cb.t * 0.3; }
      if (cb.t > 1.8) this.collapsing.splice(i, 1);
    }
    // characters that fall off buildings or get thrown from roofs by debris
    // economy
    if (this.player && !this.roundOver) {
      const pl = this.player, dir = pl.dir;
      if (pl.alive) this.award(ECONOMY.perSecondAlive * dt, null);
      const adv = this.playerAdvance() * M_TO_FT;
      if (adv > this.stats.advance) { this.award(ECONOMY.perFtAdvance * (adv - this.stats.advance), null); this.stats.advance = adv; }
      const push = (pl.group ? this.groupPush(pl.group) : 0) * M_TO_FT;
      if (push > this.stats.linePush) { this.award(ECONOMY.perFtLinePush * (push - this.stats.linePush), null); this.stats.linePush = push; }
      this.director.update(dt);
      if (pl.ko && !pl.arrested && pl.koTimer < 0.05 && !this.roundOver) this.hud.koOverlay(false);
      this.followCam.update(dt, pl, this.input);
      this.hud.update(this); this.hud.minimap?.update(this, dt);
      if (this.effects.flashLevel > 0) this.hud.flash(this.effects.flashLevel * 0.6);
    } else if (this.spectate) {
      this.spectateT += dt;
      const a = this.spectateT * 0.08;
      const C = this.world.center, rr = Math.max(30, this.meanFront() + 10);
      this.camera.position.lerp(new THREE.Vector3(C.x + Math.cos(a) * rr, 18 + Math.sin(a * 0.7) * 4 + rr * 0.25, C.z + Math.sin(a) * rr), Math.min(1, dt * 1.5));
      this.camera.lookAt(C.x, 1, C.z);
      this.hud.update(this); this.hud.minimap?.update(this, dt);
    }
    // sun shadow follows the action
    if (this.sun) { const fx = this.player ? this.player.pos : this.world.center; this.sun.position.set(fx.x + 60, 90, fx.z + 30); this.sun.target.position.set(fx.x, 0, fx.z); this.sun.target.updateMatrixWorld(); }
  }

  endRound(reason) {
    if (this.roundOver) return; this.roundOver = true; this.reason = reason;
    if (this.player) { this.money = this.outcome.payout; this.player.humanoid.play('hurt', { dur: 0.1, variant: 'hurt' }); }
    this.input.enabled = false; this.hud.koOverlay(false);
    setTimeout(() => this.onEnd && this.onEnd(reason), reason === 'dispersed' || reason === 'broken' || reason === 'whistle' ? 1800 : 2400);
  }

  dispose() {
    this.scene.remove(this.world.group); this.scene.remove(this.effects.p.points);
    for (const l of this.effects.lightPool) this.scene.remove(l);
    for (const c of this.characters) this.scene.remove(c.mesh);
    for (const p of this.projectiles.list) this.scene.remove(p.mesh);
    for (const g of this.effects.gases) this.scene.remove(g.mesh);
  }
}

const NAMES = ['Dax', 'Nico', 'Rafa', 'Ines', 'Marta', 'Jordi', 'Pau', 'Leo', 'Zoe', 'Hugo', 'Alba', 'Biel', 'Luca', 'Noa', 'Teo', 'Mila', 'Oriol', 'Vera', 'Kai', 'Sol', 'Enzo', 'Lia', 'Max', 'Ona', 'Iker', 'Jana', 'Pol', 'Nil', 'Aina', 'Roc'];
const TAGS = ['_x', '99', 'TV', '_', '2k', 'z', '77', 'GG', 'ok', '!!'];
const usedNames = new Set();
function botName(rng) {
  for (let i = 0; i < 20; i++) { const n = rng.pick(NAMES) + (i > 0 || rng.chance(0.5) ? rng.pick(TAGS) : ''); if (!usedNames.has(n)) { usedNames.add(n); return n; } }
  return rng.pick(NAMES) + rng.int(10, 99);
}
