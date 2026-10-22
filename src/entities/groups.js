// Mobs (rioters) and squads (peacekeepers).
// Squads start concentrated in the core (the plaza) and fan out through the streets to quell mobs and
// take ground. Mobs spawn at the edges of the city, loot and gather for a while, then pick an approach
// (an angular sector around the core) and push through the perimeter towards the centre.
import { STRATEGIES, FACTIONS } from '../data/config.js';

export class Group {
  constructor(game, faction, index, spawn, sector) {
    this.game = game; this.faction = faction; this.index = index; this.dir = FACTIONS[faction].dir;
    this.name = faction === 'rioter' ? `Mob ${'ABCDE'[index]}` : `Squad ${index + 1}`;
    this.spawn = spawn; this.sector = sector; this.members = []; this.commander = null;
    this.strategies = STRATEGIES[faction]; this.strategy = this.strategies[0];
    this.initialCount = 0; this.quelled = false; this.pulseT = game.rng.float(0, 6);
    this.strategyTimer = game.rng.float(10, 25); this.sectorTimer = game.rng.float(20, 35); this.leadT = 0;
    this.phase = faction === 'rioter' ? 'loot' : 'advance';
    this.phaseT = faction === 'rioter' ? game.rng.float(18, 38) : 0;
    this.goal = { x: spawn.x, z: spawn.z }; this.target = { x: spawn.x, z: spawn.z }; this.field = null; this.fieldT = 0; this.spreadHalf = 6;
    this.routeField = null; this.routeT = 0; this.centroid = { x: spawn.x, z: spawn.z };
    if (faction === 'rioter') this.setStrategy('scorched');
  }
  add(c) { c.group = this; this.members.push(c); this.initialCount++; this.assignSlots(); }
  assignSlots() {
    const front = { front_echelon: 0.05, brawler: 0.05, rioter_npc: 0.35, peacekeeper_npc: 0.45, snatch_squad: 0.3, looter: 0.5, instigator: 0.7, commander: 0.75, grenadier: 0.9 };
    const n = this.members.length;
    const sorted = [...this.members].sort((a, b) => (front[a.arch.id] ?? 0.5) - (front[b.arch.id] ?? 0.5));
    const rows = Math.max(2, Math.ceil(n / 7));
    sorted.forEach((c, i) => {
      const row = Math.floor(i / 7), col = i % 7, cols = Math.min(7, n - row * 7);
      const sx = cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0;
      const sz = rows > 1 ? row / (rows - 1) : 0;
      c.slot = { sx: sx + c.rng.float(-0.12, 0.12), sz: sz + c.rng.float(0, 0.15), jitter: c.rng.float(-0.6, 0.6) };
    });
  }
  conscious() { return this.members.filter((m) => m.alive); }
  setStrategy(s) { this.strategy = typeof s === 'string' ? this.strategies.find((x) => x.id === s) : s; this.strategyTimer = this.game.rng.float(14, 30); }
  cycleStrategy() { const i = this.strategies.indexOf(this.strategy); this.setStrategy(this.strategies[(i + 1) % this.strategies.length]); return this.strategy; }
  get sectorName() { return this.game.world.sectorName(this.sector) + ' approach'; }
  get corridorName() { return this.sectorName; }
  frontR() { return this.game.fronts[this.sector].r; }
  /** Unit vector pointing from this group's goal towards the enemy (mobs: inward, squads: outward). */
  facing() {
    const W = this.game.world; let dx = W.center.x - this.goal.x, dz = W.center.z - this.goal.z; const l = Math.hypot(dx, dz);
    if (l < 4) { const a = W.sectorAngle(this.sector); dx = -Math.cos(a); dz = -Math.sin(a); } else { dx /= l; dz /= l; }
    return this.faction === 'rioter' ? { x: dx, z: dz } : { x: -dx, z: -dz };
  }
  /** Where the group wants to stand right now, derived from phase, strategy and its sector's front. */
  computeGoal() {
    const g = this.game, W = g.world, s = this.strategy, r = this.frontR();
    if (this.phase === 'loot') return { x: this.spawn.x, z: this.spawn.z };
    if (s.regroup) return this.faction === 'rioter' ? { x: this.spawn.x, z: this.spawn.z } : W.sectorPoint(this.sector, 12);
    let off = 2;
    if (s.wall) off = 6;
    if (s.pulse) off = 3 + Math.sin(this.pulseT * 0.8) * 3;
    if (s.column) off = -3;
    if (s.scatter) off = -5;
    const radius = this.faction === 'rioter' ? r + off : Math.max(8, r - off);
    return W.sectorPoint(this.sector, radius);
  }
  update(dt) {
    const g = this.game, W = g.world; this.pulseT += dt;
    if (this.phase === 'loot') { this.phaseT -= dt; if (this.phaseT <= 0) { this.phase = 'advance'; this.autoSector(true); this.setStrategy(g.rng.pick(['shelling', 'blitz', 'shelling'])); g.hud.feed(`${this.name} moving on the ${W.sectorName(this.sector)} approach`); } }
    if (!this.commander || !this.commander.alive) {
      this.strategyTimer -= dt; if (this.strategyTimer <= 0 && this.phase !== 'loot') this.autoStrategy();
      this.sectorTimer -= dt; if (this.sectorTimer <= 0) { this.sectorTimer = g.rng.float(25, 40); if (this.phase !== 'loot') this.autoSector(); }
    } else {
      // a commanded group follows its commander into whichever approach they lead it to
      if (this.phase === 'loot') { this.phase = 'advance'; this.setStrategy(this.faction === 'rioter' ? 'shelling' : 'slow_advance'); }
      const cs = W.sectorOf(this.commander.pos.x, this.commander.pos.z);
      this.leadT = cs !== this.sector && W.distToCenter(this.commander.pos.x, this.commander.pos.z) > 10 ? this.leadT + dt : 0;
      if (this.leadT > 2.5) { this.moveTo(cs, true); this.leadT = 0; }
    }
    // flanked: the enemy has pushed a neighbouring sector well past ours
    if (!this.strategy.regroup && !this.commander?.isPlayer && this.phase !== 'loot') {
      const r = this.frontR(), n = g.fronts.length;
      for (const j of [(this.sector + n - 1) % n, (this.sector + 1) % n]) {
        const rj = g.fronts[j].r;
        // flanked only when the neighbouring approach has genuinely been pushed into our ground, not just
        // because we advanced further than they did
        const flanked = this.faction === 'rioter' ? (rj > g.world.R0 + 12 && rj - r > 22) : (rj < g.world.R0 - 12 && r - rj > 22);
        if (flanked && g.rng.chance(dt * 0.25)) { this.setStrategy(this.faction === 'rioter' ? 'retreat' : 'fallback'); g.hud.feed(`${this.name} flanked, falling back`); }
      }
    }
    // centroid of the conscious members
    const m = this.conscious();
    if (m.length) { this.centroid.x = m.reduce((a, c) => a + c.pos.x, 0) / m.length; this.centroid.z = m.reduce((a, c) => a + c.pos.z, 0) / m.length; }
    // the group's goal flows along a street route towards where it wants to be, at a group pace,
    // and waits when the body of the group falls behind. Members steer around the moving goal.
    const want = this.computeGoal(); this.routeT -= dt; this.fieldT -= dt;
    if (!this.routeField || Math.hypot(want.x - this.target.x, want.z - this.target.z) > 6 || this.routeT <= 0) {
      let tgt = want;
      for (let k = 0; k < 4; k++) { // make sure the destination is reachable from where the group is
        const f = W.flowField(tgt.x, tgt.z);
        if (W.reachable(f, this.centroid.x, this.centroid.z)) { this.routeField = f; break; }
        const a = Math.atan2(tgt.z - W.center.z, tgt.x - W.center.x), r = Math.hypot(tgt.x - W.center.x, tgt.z - W.center.z);
        tgt = W.nearestWalkable(W.center.x + Math.cos(a) * Math.max(10, r - 10), W.center.z + Math.sin(a) * Math.max(10, r - 10), 16);
        if (k === 3) this.routeField = f;
      }
      this.target = tgt; this.routeT = 6;
    }
    const lag = Math.hypot(this.goal.x - this.centroid.x, this.goal.z - this.centroid.z);
    const paceBase = this.faction === 'rioter' ? (this.strategy.column ? 2.6 : 2.1) : 1.3;
    const pace = lag > 20 ? 0 : lag > 12 ? paceBase * 0.45 : paceBase;
    let step = pace * dt;
    while (step > 0.01) {
      const wp = W.fieldNext(this.routeField, this.goal.x, this.goal.z);
      const tx = wp ? wp.x : this.target.x, tz = wp ? wp.z : this.target.z;
      const dx = tx - this.goal.x, dz = tz - this.goal.z, l = Math.hypot(dx, dz);
      if (l < 0.05) break;
      const mv = Math.min(step, l); this.goal.x += (dx / l) * mv; this.goal.z += (dz / l) * mv; step -= mv;
      if (!wp) break;
    }
    if (!this.field || this.fieldT <= 0) { this.field = W.flowField(this.goal.x, this.goal.z); this.fieldT = 0.6; }
    // quelled / fallen back
    if (!this.quelled && this.initialCount > 0) {
      const alive = this.conscious().length;
      const pushedOut = this.faction === 'rioter' ? this.frontR() > 112 && this.phase !== 'loot' : this.frontR() < 10;
      this.collapsedT = (alive <= Math.max(2, this.initialCount * 0.25) || pushedOut) ? (this.collapsedT || 0) + dt : 0;
      if (this.collapsedT > 6) { this.quelled = true; this.game.onGroupQuelled(this); }
    }
  }
  moveTo(sector, led = false) {
    if (sector === this.sector) return;
    const from = this.sectorName; this.sector = sector;
    const g = this.game;
    g.hud.feed(`${this.name} ${led ? 'led' : 'shifting'}: ${from} → ${this.sectorName}`);
    if (this.members.includes(g.player)) g.hud.toast(`${this.name} heading for the ${this.sectorName}`);
  }
  /** Rioters look for weakly held approaches near them; peacekeepers cover the approaches under pressure. */
  autoSector(initial = false) {
    const g = this.game, W = g.world, rng = g.rng, n = W.SECTORS;
    const weight = (faction, k) => g.characters.reduce((sum, c) => sum + (c.alive && c.faction === faction && c.group && c.group.sector === k && c.group.phase !== 'loot' ? 1 : 0), 0);
    const mySector = W.sectorOf(this.spawn.x, this.spawn.z);
    let best = this.sector, bestScore = -1e9;
    for (let k = 0; k < n; k++) {
      const own = weight(this.faction, k) - (k === this.sector ? this.conscious().length : 0);
      const enemy = weight(this.faction === 'rioter' ? 'peacekeeper' : 'rioter', k);
      const angDist = Math.min(Math.abs(k - mySector), n - Math.abs(k - mySector));
      let score;
      if (this.faction === 'rioter') score = (enemy === 0 ? 12 : 0) - enemy * 1.5 - own * 0.8 - angDist * 3.5 + (W.R0 - g.fronts[k].r) * 0.1;
      else score = enemy * 2.0 - own * 1.6 + (g.fronts[k].r - W.R0) * -0.08;
      if (k === this.sector && !initial) score += this.faction === 'rioter' ? 8 : 13;
      score += rng.float(-2, 2);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (best !== this.sector) { if (initial) this.sector = best; else this.moveTo(best); }
  }
  autoStrategy() {
    const rng = this.game.rng, bias = this.game.biasFor(this.faction);
    const alive = this.conscious().length / Math.max(1, this.initialCount);
    const pool = [];
    // retreating only makes sense when the group is actually in the fight (near the perimeter)
    const nearAction = Math.abs(this.game.world.distToCenter(this.centroid.x, this.centroid.z) - this.frontR()) < 25;
    if (this.faction === 'peacekeeper') {
      if (bias > 0.3) pool.push('breakout', 'pulse', 'slow_advance'); else if (bias < -0.3) pool.push('collapse_wall', 'anchor_lob', 'fallback'); else pool.push('slow_advance', 'anchor_lob', 'pulse', 'collapse_wall');
      if (alive < 0.4 && bias < 0) pool.push('fallback', 'fallback');
      if (!nearAction) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === 'fallback') pool.splice(i, 1); if (!pool.length) pool.push('slow_advance'); }
    } else {
      if (bias > 0.3) pool.push('blitz', 'shelling', 'scorched'); else if (bias < -0.3) pool.push('retreat', 'highground', 'shelling'); else pool.push('shelling', 'highground', 'blitz', 'countersnatch', 'scorched');
      if (alive < 0.4 && bias < 0) pool.push('retreat', 'retreat');
      if (!nearAction) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === 'retreat') pool.splice(i, 1); if (!pool.length) pool.push('shelling'); }
    }
    this.setStrategy(rng.pick(pool));
  }
}
