// The Director steers a luck-based, pre-rolled result into a believable action round.
//
// Every frame it compares the player's money against the target earning curve for this
// round and sets a bias in [-1, 1] (positive = player's side should do better). The bias
// feeds: bot strength/speed/aggression, the front-line push model, strategy choice of
// uncommanded groups, reinforcements, and supply drops. As the round nears its result, it
// picks an "ending beat" that fits the situation (overrun & KO'd, snatched, gassed,
// clipped by a stray round, or an orderly round end) so the final number lands on the
// predetermined payout without looking scripted.
import { targetProgress } from './rtp.js';

export class Director {
  constructor(game, outcome) {
    this.game = game; this.o = outcome; this.t = 0; this.bias = 0; this.rawErr = 0;
    this.reinforceCd = 12; this.supplyCd = 6; this.ending = null; this.endingT = 0; this.failsafeArmed = false;
    this.log = [];
  }
  get progress() { return Math.min(1, this.game.money / this.o.payout); }
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
    if (!this.ending && p >= 0.9) this.chooseEnding();
    if (this.ending) this.runEnding(dt);
    // a real knockout/arrest close to the result IS the ending: let it land there
    const pl = g.player;
    if (pl && this.ending && !g.roundOver && pl.ko && !pl.knockedDownOnly && p >= 0.85) { g.money = this.o.payout; this.failsafe(); return; }
    // an ending beat that refuses to land gets forced
    if (this.ending && !g.roundOver && this.ending.t > 16 && p >= 0.85) { g.money = this.o.payout; this.failsafe(); return; }
    if (g.money >= this.o.payout - 1e-6 && !g.roundOver) {
      g.money = this.o.payout;
      // the number is final; wrap up with the chosen beat if it hasn't landed yet
      if (!this.ending) this.chooseEnding();
      this.failsafe();
    }
  }
  chooseEnding() {
    const g = this.game, pl = g.player; if (!pl) { this.ending = { kind: 'whistle', t: 0 }; return; }
    // decide from what is actually on screen: is the player's side pushing the line / thinning the enemy?
    const taken = pl.faction === 'rioter' ? g.R0 - g.meanFront() : g.meanFront() - g.R0;
    const winning = taken > 5 || g.enemyAliveRatio() < 0.4;
    const r = g.rng.next();
    let kind;
    if (winning && r < 0.55) kind = pl.faction === 'peacekeeper' ? 'dispersed' : 'broken';
    else if (pl.faction === 'rioter' && r < 0.35) kind = 'snatched';
    else if (r < 0.6) kind = 'overrun';
    else if (r < 0.8) kind = pl.faction === 'rioter' ? 'gassed' : 'torched';
    else kind = 'stray';
    this.ending = { kind, t: 0, done: false };
    g.log(`ending: ${kind} (bias ${this.bias.toFixed(2)})`);
  }
  runEnding(dt) {
    const g = this.game, e = this.ending, pl = g.player; e.t += dt;
    if (!pl || g.roundOver) return;
    switch (e.kind) {
      case 'overrun': // nearby enemies converge on the player, enemy side gets strong
        g.playerThreat = 14; this.bias = Math.min(this.bias, -0.8);
        break;
      case 'snatched': {
        g.playerThreat = 10; this.bias = Math.min(this.bias, -0.6);
        if (e.t > 1 && !e.sent) { e.sent = true; g.sendSnatchFor(pl); }
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
      case 'dispersed': case 'broken': this.bias = Math.max(this.bias, 0.6); g.playerThreat = -10; break;
      default: break;
    }
  }
  /** Money is at target: end now, with the most plausible beat for what's on screen. */
  failsafe() {
    const g = this.game, pl = g.player, e = this.ending;
    if (!pl) { g.endRound('whistle'); return; }
    if (pl.ko || pl.arrested) { g.endRound(pl.arrested ? 'arrested' : 'ko'); return; }
    if (e.kind === 'dispersed' || e.kind === 'broken') { g.endRound(e.kind); return; }
    // instant, plausible finisher: a stray rubber bullet / brick from above drops the player right now
    g.strayShot(pl, true);
    g.endRound(pl.faction === 'rioter' ? 'ko' : 'ko');
  }
}
