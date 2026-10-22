// The Director steers a luck-based, pre-rolled result into a believable action round.
//
// Every frame it compares the player's money against the target earning curve for this
// round and sets a bias in [-1, 1] (positive = player's side should do better). The bias
// feeds: bot strength/speed/aggression, the front-line push model, strategy choice of
// uncommanded groups, reinforcements, and supply drops. As the round nears its result, it
// picks an "ending beat" that fits the situation (overrun & KO'd, snatched, gassed,
// clipped by a stray round, or an orderly round end) so the final number lands on the
// predetermined payout without looking scripted.
import { targetProgress, BIG_WIN } from './rtp.js';

export class Director {
  constructor(game, outcome) {
    this.game = game; this.o = outcome; this.t = 0; this.bias = 0; this.rawErr = 0;
    this.reinforceCd = 12; this.supplyCd = 6; this.ending = null; this.endingT = 0; this.failsafeArmed = false;
    this.log = [];
  }
  get progress() { return Math.min(1, this.game.money / this.o.payout); }
  /**
   * How the battle should visibly lean for the player's side, independent of the money control:
   * losing bets drift against you, winning bets drift your way, big wins turn into a rout late on.
   */
  get lean() {
    const m = this.o.multiplier, late = Math.min(1, this.t / this.o.durationSec);
    if (m >= BIG_WIN) return 0.25 + 0.55 * late;
    if (m >= 1) return 0.1 + 0.15 * late;
    return -0.1 - 0.25 * late;
  }
  update(dt) {
    const g = this.game; this.t += dt;
    const T = this.o.durationSec;
    const want = targetProgress(this.t, T);
    const err = this.progress - want;           // >0 : player ahead of script
    this.rawErr = err;
    // bias target: push back when ahead, help when behind. Stronger late in the round.
    const late = Math.min(1, this.t / T);
    let target = -err * (5 + 4 * late);
    // if the round is running long past its duration and the player is still short, help a lot
    if (this.t > T * 1.15 && this.progress < 0.95) target += (this.t / T - 1.15) * 2.5;
    target = Math.max(-1, Math.min(1, target));
    this.bias += (target - this.bias) * Math.min(1, dt * 0.6);

    // reinforcements: arrive from the far edge when one side needs a visible boost
    this.reinforceCd -= dt;
    if (this.reinforceCd <= 0) {
      if (this.bias < -0.45) { g.reinforce(g.enemyFaction, 4 + Math.floor(-this.bias * 5)); this.reinforceCd = 16; }
      else if (this.bias > 0.45) { g.reinforce(g.playerFaction, 3 + Math.floor(this.bias * 4)); this.reinforceCd = 16; }
      else this.reinforceCd = 4;
    }
    // supply: more collectibles near the player when they need to earn faster
    this.supplyCd -= dt;
    if (this.supplyCd <= 0) {
      this.supplyCd = this.bias > 0.2 ? 5 : 12;
      if (this.bias > 0.1 && g.player) g.dropSupply(g.player);
    }

    // ---- endings ----
    const p = this.progress;
    if (!this.ending && p >= 0.8) this.chooseEnding();
    if (this.ending) this.runEnding(dt);
    const pl = g.player;
    // a real knockout/arrest close to the result IS the ending: let it land there
    if (pl && this.ending && !g.roundOver && pl.ko && !pl.knockedDownOnly && !pl.carriedBy && p >= 0.8) { g.money = this.o.payout; this.finish(); return; }
    // being dragged off by a snatch squad: let the arrest complete (it ends the round itself)
    if (pl && pl.carriedBy && !g.roundOver) { g.money = Math.max(g.money, this.o.payout * 0.97); this.carriedT = (this.carriedT || 0) + dt; if (this.carriedT > 14) g.arrest(pl.carriedBy, pl); return; }
    if (g.money >= this.o.payout - 1e-6 && !g.roundOver) {
      g.money = this.o.payout;
      if (!this.ending) this.chooseEnding();
      // the number is final: freeze it and give the beat a few more seconds to land on its own
      if (!this.frozen) { this.frozen = true; this.frozenT = 0; }
      this.frozenT += dt;
      if (this.ending.kind === 'dispersed' || this.ending.kind === 'broken' || this.ending.kind === 'whistle') { this.finish(); return; }
      if (this.frozenT > 6) this.failsafe();
    }
    // an ending beat that refuses to land for a long time gets forced
    if (this.ending && !g.roundOver && this.ending.t > 40 && p >= 0.8) { g.money = this.o.payout; this.failsafe(); }
  }
  chooseEnding() {
    const g = this.game, pl = g.player; if (!pl) { this.ending = { kind: 'whistle', t: 0 }; return; }
    // The bet decides it: only a big win ends with the player's side winning the battle.
    // Every other result (losses and small wins alike) ends with the player put down or arrested.
    let kind;
    if (this.o.multiplier >= BIG_WIN) kind = pl.faction === 'peacekeeper' ? 'dispersed' : 'broken';
    else {
      // losing beats: mostly physical (beaten up / snatched), sometimes gas or fire, rarely a stray
      const u = g.rng.next();
      if (pl.faction === 'rioter') kind = u < 0.38 ? 'snatched' : u < 0.7 ? 'overrun' : u < 0.87 ? 'gassed' : 'stray';
      else kind = u < 0.55 ? 'overrun' : u < 0.8 ? 'torched' : 'stray';
    }
    this.ending = { kind, t: 0, done: false };
    g.log(`ending: ${kind} (bias ${this.bias.toFixed(2)})`);
  }
  runEnding(dt) {
    const g = this.game, e = this.ending, pl = g.player; e.t += dt;
    if (!pl || g.roundOver) return;
    switch (e.kind) {
      case 'overrun': // nearby enemies converge on the player and beat them down
        g.playerThreat = 18; this.bias = Math.min(this.bias, -0.8);
        if (e.t > 1 && !e.sent) { e.sent = true; g.sendMobFor(pl); }
        if (e.t > 10 && !e.sent2) { e.sent2 = true; g.sendMobFor(pl); }
        break;
      case 'snatched': {
        g.playerThreat = 12; this.bias = Math.min(this.bias, -0.6);
        if (e.t > 1 && !e.sent) { e.sent = true; g.sendSnatchFor(pl); }
        if (e.t > 12 && !e.sent2) { e.sent2 = true; g.sendSnatchFor(pl); }
        break;
      }
      case 'gassed': case 'torched': {
        if (e.t > 1.5 && !e.sent) { e.sent = true; g.lobAt(pl, e.kind === 'gassed' ? 'teargas' : 'molotov'); g.lobAt(pl, e.kind === 'gassed' ? 'flashbang' : 'rock'); }
        if (e.t > 6 && !e.sent2) { e.sent2 = true; g.lobAt(pl, e.kind === 'gassed' ? 'teargas' : 'molotov'); }
        g.playerThreat = 8; this.bias = Math.min(this.bias, -0.5);
        break;
      }
      case 'stray': {
        if (e.t > 2 && !e.sent) { e.sent = true; g.strayShot(pl); }
        if (e.t > 7 && !e.sent2) { e.sent2 = true; g.strayShot(pl); }
        break;
      }
      case 'dispersed': case 'broken': this.bias = Math.max(this.bias, 0.6); g.playerThreat = -14; break;
      default: break;
    }
  }
  finish() {
    const g = this.game, pl = g.player, e = this.ending;
    if (!pl) { g.endRound('whistle'); return; }
    if (pl.arrested) { g.endRound('arrested'); return; }
    if (pl.carriedBy) return; // the arrest will end it
    if (pl.ko) { g.endRound('ko'); return; }
    g.endRound(e.kind === 'dispersed' || e.kind === 'broken' ? e.kind : 'whistle');
  }
  /** Money is at target and the beat hasn't landed: finish with whatever is most plausible right now. */
  failsafe() {
    const g = this.game, pl = g.player, e = this.ending;
    if (!pl) { g.endRound('whistle'); return; }
    if (pl.carriedBy) { g.arrest(pl.carriedBy, pl); return; }
    if (pl.ko || pl.arrested) { this.finish(); return; }
    if (e.kind === 'dispersed' || e.kind === 'broken') { g.endRound(e.kind); return; }
    const enemies = g.characters.filter((c) => c.alive && c.faction !== pl.faction).sort((a, b) => a.distTo(pl) - b.distTo(pl));
    const near = enemies[0];
    const snatcher = enemies.find((c) => c.arch.id === 'snatch_squad' && c.distTo(pl) < 9);
    if (pl.faction === 'rioter' && snatcher) { g.grab(snatcher, pl); g.arrest(snatcher, pl); return; } // arrest ends the round
    if (near && near.distTo(pl) < 5) { // the people on top of you finish it
      near.faceTowards(pl.pos.x, pl.pos.z, 1, 1); near.humanoid.play('attack', { dur: 0.4 });
      pl.takeHit(pl.hp + 1, near, 1.5); g.effects.hit(pl.pos.x, pl.y + 1.2, pl.pos.z, '#fff');
      g.hud.toast(`${near.name} put you down`, 'bad'); g.endRound('ko'); return;
    }
    g.strayShot(pl, true);
    g.endRound('ko');
  }
}
