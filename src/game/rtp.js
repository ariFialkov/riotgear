// Deterministic outcome. The round's result is drawn here, before anything else happens.
// The whole round then exists to make this number arrive on screen in a believable way.
//
// Multiplier distribution (of the stake), tuned to a 96% return-to-player:
//   bust     0.10–0.55x   46.3%
//   even-ish 0.55–1.25x   40.6%
//   good     1.25–4.00x   10.5%
//   big      4.00–12.0x   2.2%
//   huge    12.0–50.0x    0.4%

import { RNG } from '../core/rng.js';

export const RTP = 0.96;

const BANDS = [
  { p: 0.4634, lo: 0.10, hi: 0.55, curve: 1.0 },
  { p: 0.4056, lo: 0.55, hi: 1.25, curve: 1.0 },
  { p: 0.105,  lo: 1.25, hi: 4.00, curve: 2.2 },
  { p: 0.022,  lo: 4.00, hi: 12.0, curve: 2.6 },
  { p: 0.004,  lo: 12.0, hi: 50.0, curve: 3.0 },
];

export function bandMean(b) {
  // mean of lo + (hi-lo) * u^curve for u ~ U(0,1)
  return b.lo + (b.hi - b.lo) / (b.curve + 1);
}

export function expectedMultiplier() {
  return BANDS.reduce((s, b) => s + b.p * bandMean(b), 0);
}

/** Draws the round outcome from a seed. Returns {multiplier, payout, bandIndex, durationSec}. */
export function rollOutcome(seed, stake) {
  const rng = new RNG(seed);
  let r = rng.next();
  let band = BANDS[BANDS.length - 1], bandIndex = BANDS.length - 1;
  for (let i = 0; i < BANDS.length; i++) {
    if (r < BANDS[i].p) { band = BANDS[i]; bandIndex = i; break; }
    r -= BANDS[i].p;
  }
  const u = rng.next();
  const multiplier = band.lo + (band.hi - band.lo) * Math.pow(u, band.curve);
  const payout = Math.round(stake * multiplier * 100) / 100;
  // Expected round length: busts end fast; big wins run long. Small randomness so the same
  // multiplier does not always take the same time.
  // Every round gets at least about a minute of play; bigger results run longer.
  const base = 55 + 30 * Math.log1p(multiplier * 3);
  const durationSec = Math.max(50, Math.min(300, base * rng.float(0.9, 1.12)));
  return { multiplier, payout, bandIndex, durationSec, seed };
}

/**
 * Target earning curve: fraction of payout the player "should" have at time t of duration T.
 * Front-loaded a little (fast starts feel good), with an S-curve so endings don't look linear.
 */
export function targetProgress(t, T) {
  const x = Math.max(0, Math.min(1, t / T));
  const s = x * x * (3 - 2 * x);         // smoothstep
  return 0.75 * s + 0.25 * x;
}
