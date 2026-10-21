// Mobs (rioters) and squads (peacekeepers). A group has a formation, a strategy and maybe a commander.
import { STRATEGIES, FACTIONS } from '../data/config.js';

export class Group {
  constructor(game, faction, index, anchorX) {
    this.game = game; this.faction = faction; this.index = index; this.dir = FACTIONS[faction].dir;
    this.name = faction === 'rioter' ? `Mob ${'ABC'[index]}` : `Squad ${index + 1}`;
    this.anchorX = anchorX; this.members = []; this.commander = null;
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

  /** The z where this group wants to hold its front row right now. */
  lineZ() {
    const g = this.game, s = this.strategy, front = g.front.z;
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
    // uncommanded groups pick sensible strategies on their own, nudged by the director bias
    if (!this.commander || !this.commander.alive) {
      this.strategyTimer -= dt;
      if (this.strategyTimer <= 0) this.autoStrategy();
    }
    if (!this.quelled && this.initialCount > 0) {
      const alive = this.conscious().length;
      const pushedHome = this.faction === 'rioter' ? this.game.front.z < this.game.world.regroup.rioter.z + 6 : this.game.front.z > this.game.world.regroup.peacekeeper.z - 6;
      if (alive <= Math.max(2, this.initialCount * 0.22) || pushedHome) { this.quelled = true; this.game.onGroupQuelled(this); }
    }
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
