import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../js/parse.js';
import { odeSim, pdeSim, tau, untau, timeTicks, Lookahead } from '../js/solver.js';

const run = (sim, T) => { while (sim.t < T - 1e-9) sim.advance(Math.min(1 / 60, T - sim.t), Infinity); };

test('harmonic oscillator returns to its start after one period', () => {
  const sim = odeSim(analyze(["y''+4y=0"]), {}, [1, 0]);
  run(sim, Math.PI);
  assert.ok(Math.abs(sim.S[0] - 1) < 1e-6 && Math.abs(sim.S[1]) < 1e-5, String(sim.S));
});

test('heat equation: sin mode decays at the analytic rate (fixed ends)', () => {
  const m = analyze(['u_t=\\alpha u_{xx}']), alpha = 0.5;
  const sim = pdeSim(m, { alpha }, { n: 101, a: 0, b: 1, bc: 'fixed' }, x => Math.sin(Math.PI * x));
  run(sim, 0.2);
  const mid = sim.S[sim.idx(50, 0)], exact = Math.exp(-alpha * Math.PI ** 2 * 0.2);
  assert.ok(Math.abs(mid - exact) < 1e-3, `${mid} vs ${exact}`);
  assert.ok(sim.h < 0.5 * (0.01 ** 2) / alpha * 2.8, 'step is inside the stability limit');
});

test('2D wave stays bounded and conserves rough amplitude (stiffness-based step)', () => {
  const m = analyze(['u_{tt}=c^2\\nabla^2u']);
  const sim = pdeSim(m, { c: 1 }, { n: 41, a: -1, b: 1, bc: 'fixed' }, (x, y) => Math.exp(-30 * (x * x + y * y)), () => 0);
  run(sim, 3);
  let max = 0;
  for (let j = 0; j < 41; j++) for (let i = 0; i < 41; i++) max = Math.max(max, Math.abs(sim.S[sim.idx(i, j)]));
  assert.ok(sim.finite() && max < 1.5, `max |u| = ${max}`);
});

test('periodic advection carries a bump once around the domain', () => {
  const m = analyze(['u_t+u_x=0']);
  const bump = x => Math.exp(-40 * x * x);
  const sim = pdeSim(m, {}, { n: 200, a: -1, b: 1, bc: 'periodic' }, bump);
  run(sim, 2);
  assert.ok(Math.abs(sim.S[sim.idx(100, 0)] - 1) < 0.05, String(sim.S[sim.idx(100, 0)]));
});

test('condensed time axis: linear at c=0, [0,∞) at c=1, ticks spaced and ending at ∞', () => {
  assert.equal(tau(20, 20, 0), 1);
  assert.equal(tau(20, 20, 1), 0.5);
  assert.equal(untau(1, 20, 1), Infinity);
  assert.ok(Math.abs(untau(tau(37, 20, 0.7), 20, 0.7) - 37) < 1e-9);
  const ticks = timeTicks(20, 1);
  assert.equal(ticks.at(-1).t, Infinity);
  ticks.slice(1).forEach((k, i) => assert.ok(k.s - ticks[i].s >= 0.08 - 1e-12, 'ticks overlap'));
  assert.ok(timeTicks(20, 0).every(k => k.s <= 1 && k.t <= 20), 'linear window stops at W');
});

test('look-ahead: a damped oscillator settles to 0; an undamped one keeps a ±1 band far in the future', () => {
  const damped = new Lookahead(odeSim(analyze(["y''+0.5y'+4y=0"]), {}, [1, 0]), S => [S[0]], 20, 2000);
  damped.pump(Infinity);
  const end = damped.rows.at(-1);
  assert.ok(damped.done === 'done' && end.t >= 2000 - 1e-6, String(end.t));
  assert.ok(Math.abs(end.v[0]) < 1e-6 && end.max[0] - end.min[0] < 1e-6);
  assert.ok(damped.rows.length < 1000, `${damped.rows.length} samples`);
  const free = new Lookahead(odeSim(analyze(["y''+4y=0"]), {}, [1, 0]), S => [S[0]], 20, 2000);
  free.pump(Infinity);
  const late = free.rows.at(-1);
  assert.ok(late.min[0] < -0.99 && late.max[0] > 0.99, `${late.min[0]} … ${late.max[0]}`);
});
