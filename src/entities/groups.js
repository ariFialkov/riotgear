// Mobs (rioters) and squads (peacekeepers). A group has a formation, a strategy and maybe a commander.
import { STRATEGIES, FACTIONS } from '../data/config.js';

export class Group {
  constructor(game, faction, index, corridor) {
    this.game = game; this.faction = faction; this.index = index; this.dir = FACTIONS[faction].dir;
    this.name = faction === 'rioter' ? `Mob ${'ABCDE'[index]}` : `Squad ${index + 1}`;
    this.corridor = corridor; this.anchorX = 0; this.corridorTimer = game.rng.float(18, 30); this.leadT = 0;
    this.members = []; this.commander = null;
    this.strategies = STRATEGIES[faction]; this.strategy = this.strategies[0];
    this.initialCount = 0; this.quelled = false; this.pulseT = game.rng.float(0, 6);
    this.strategyTimer = game.rng.float(10, 25);
    this.spreadHalf = 6;
  }
  add(c) { c.group = this; this.members.push(c); this.initialCount++; this.assignSlots(); }
  assignSlots() {
    // rank members: shield/brawlers to the front, grenadiers/instigators to the back
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

  get corridorName() { return this.game.world.corridors[this.corridor].name; }
  /** The z where this group wants to hold its front row right now. */
  lineZ() {
    const g = this.game, s = this.strategy, front = g.fronts[this.corridor].z;
    const own = -this.dir; // towards own side
    if (s.regroup) return g.world.regroup[this.faction].z;
    let off = 1.6;
    if (s.wall) off = 5;
    if (s.pulse) off = 2.5 + Math.sin(this.pulseT * 0.8) * 3.0;
    if (s.column) off = -2.5;
    if (s.scatter) off = -4;
    off *= 1 + 0.3 * (1 - Math.min(1, s.push + 0.5));
    return front + own * off;
  }
  update(dt) {
    this.pulseT += dt;
    const g = this.game;
    // uncommanded groups pick sensible strategies and corridors on their own, nudged by the director bias
    if (!this.commander || !this.commander.alive) {
      this.strategyTimer -= dt;
      if (this.strategyTimer <= 0) this.autoStrategy();
      this.corridorTimer -= dt;
      if (this.corridorTimer <= 0) { this.corridorTimer = g.rng.float(25, 40); this.autoCorridor(); }
    } else {
      // a commanded group follows its commander into whichever corridor they lead it to
      const cc = g.world.corridorAt(this.commander.pos.x, this.commander.pos.z);
      this.leadT = cc !== this.corridor ? this.leadT + dt : 0;
      if (this.leadT > 2.5) { this.moveTo(cc, true); this.leadT = 0; }
    }
    // flanked: the enemy has pushed a neighbouring corridor well past our line
    if (!this.strategy.regroup && !this.commander?.isPlayer) {
      const f = g.fronts[this.corridor].z;
      for (const j of [this.corridor - 1, this.corridor + 1]) {
        if (j < 0 || j >= g.fronts.length) continue;
        if ((g.fronts[j].z - f) * -this.dir > 22 && g.rng.chance(dt * 0.3)) { this.setStrategy(this.faction === 'rioter' ? 'retreat' : 'fallback'); g.hud.feed(`${this.name} flanked on ${this.corridorName}, falling back`); }
      }
    }
    if (!this.quelled && this.initialCount > 0) {
      const alive = this.conscious().length;
      const fz = this.game.fronts[this.corridor].z;
      const pushedHome = this.faction === 'rioter' ? fz < this.game.world.regroup.rioter.z + 6 : fz > this.game.world.regroup.peacekeeper.z - 6;
      // a group is quelled only after staying collapsed for a while (KO'd members get back up)
      this.collapsedT = (alive <= Math.max(2, this.initialCount * 0.25) || pushedHome) ? (this.collapsedT || 0) + dt : 0;
      if (this.collapsedT > 6) { this.quelled = true; this.game.onGroupQuelled(this); }
    }
  }
  moveTo(corridor, led = false) {
    if (corridor === this.corridor) return;
    const from = this.corridorName; this.corridor = corridor;
    const g = this.game;
    g.hud.feed(`${this.name} ${led ? 'led' : 'moving'} ${from} → ${this.corridorName}`);
    if (this.members.includes(g.player)) g.hud.toast(`${this.name} heading for ${this.corridorName}`);
  }
  /** Rioters look for weakly held corridors; peacekeepers cover corridors the rioters are pushing. */
  autoCorridor() {
    const g = this.game, W = g.world, rng = g.rng;
    const strength = (faction, i) => g.characters.reduce((sum, c) => sum + (c.alive && c.faction === faction && c.group && c.group.corridor === i ? 1 : 0), 0);
    const n = W.corridors.length; let best = this.corridor, bestScore = -1e9;
    for (let i = 0; i < n; i++) {
      const own = strength(this.faction, i) - (i === this.corridor ? this.conscious().length : 0);
      const enemy = strength(this.faction === 'rioter' ? 'peacekeeper' : 'rioter', i);
      const frontGain = (g.fronts[i].z - g.fronts[this.corridor].z) * this.dir; // how much further forward that corridor already is
      let score;
      if (this.faction === 'rioter') score = (enemy === 0 ? 14 : 0) - enemy * 1.6 - own * 0.9 + frontGain * 0.15 + (i === W.avenueIndex ? 3 : 0);
      else score = enemy * 1.8 - own * 1.4 + (i === W.avenueIndex ? 4 : 0) - frontGain * 0.1;
      if (i === this.corridor) score += 9; // inertia: redeploying the whole group is a big decision
      score += rng.float(-2.5, 2.5);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best !== this.corridor) this.moveTo(best);
  }
  autoStrategy() {
    const rng = this.game.rng, bias = this.game.biasFor(this.faction); // >0 = this side should do better
    const alive = this.conscious().length / Math.max(1, this.initialCount);
    const pool = [];
    if (this.faction === 'peacekeeper') {
      if (bias > 0.3) pool.push('breakout', 'pulse', 'slow_advance'); else if (bias < -0.3) pool.push('collapse_wall', 'anchor_lob', 'fallback'); else pool.push('slow_advance', 'anchor_lob', 'pulse', 'collapse_wall');
      if (alive < 0.4 && bias < 0) pool.push('fallback', 'fallback');
    } else {
      if (bias > 0.3) pool.push('blitz', 'shelling', 'scorched'); else if (bias < -0.3) pool.push('retreat', 'highground', 'shelling'); else pool.push('shelling', 'highground', 'blitz', 'countersnatch', 'scorched');
      if (alive < 0.4 && bias < 0) pool.push('retreat', 'retreat');
    }
    this.setStrategy(rng.pick(pool));
  }
}
