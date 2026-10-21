import test from 'node:test';
import assert from 'node:assert/strict';
import { rollOutcome, expectedMultiplier, RTP } from '../src/game/rtp.js';

test('expected multiplier is within 1% of RTP', () => {
  const e = expectedMultiplier();
  assert.ok(Math.abs(e - RTP) < 0.01, `expected ${e} ~ ${RTP}`);
});

test('empirical RTP over many rounds is close to target', () => {
  let sum = 0; const n = 200000;
  for (let i = 0; i < n; i++) sum += rollOutcome(i * 7919 + 13, 1).multiplier;
  const avg = sum / n;
  assert.ok(Math.abs(avg - RTP) < 0.02, `empirical ${avg}`);
});

test('same seed gives the same outcome', () => {
  const a = rollOutcome(12345, 5), b = rollOutcome(12345, 5);
  assert.equal(a.payout, b.payout);
  assert.equal(a.durationSec, b.durationSec);
});

test('payout scales with stake', () => {
  const a = rollOutcome(777, 1), b = rollOutcome(777, 25);
  assert.ok(Math.abs(b.payout - a.payout * 25) < 0.3);
});
