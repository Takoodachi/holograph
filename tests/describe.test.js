import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, compileExpr } from '../js/parse.js';
import { describe, DESCRIBE_HINTS } from '../js/describe.js';

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
// what the app does with a description: build, then parse the equations and every starting value
const build = text => {
  const p = describe(text);
  assert.ok(p, `nothing built for "${text}"`);
  const m = analyze(p.eqs);
  for (const v of Object.values(p.ic)) assert.ok(Number.isFinite(compileExpr(v, ['x', 'y']).fn(p.params, 0.1, 0.2)), `${text}: ${v}`);
  if (p.view) assert.ok(m.views.includes(p.view), `${text}: view ${p.view}`);
  return { p, m };
};

test('spring: mass in kg, friction, a push every 3 s', () => {
  const { p, m } = build('a damped spring with a 2 kg mass pushed every 3 seconds');
  assert.equal(p.params.m, 2);
  near(p.params.omega, (2 * Math.PI) / 3);
  assert.ok('c' in p.params && m.params.includes('omega'));
});

test('pendulum: length, release angle, friction; small-angle switch', () => {
  const { p } = build('a pendulum 1.5 m long released from 30° with friction');
  assert.equal(p.params.L, 1.5);
  near(+p.ic.theta, Math.PI / 6);
  assert.ok(p.eqs[0].includes('\\sin') && 'b' in p.params);
  assert.ok(!build('a small angle pendulum').p.eqs[0].includes('\\sin'));
  assert.equal(build('a double pendulum').m.views[0], 'pendulum2');
});

test('heat: rod vs plate, insulated vs fixed edges', () => {
  const rod = build('heat spreading along an insulated metal rod');
  assert.equal(rod.m.dims, 1);
  assert.equal(rod.p.bc, 'free');
  const plate = build('heat in a square metal plate');
  assert.equal(plate.m.dims, 2);
  assert.equal(plate.p.bc, 'fixed');
});

test('waves: plucked string, drum, pond', () => {
  const s = build('a guitar string plucked near the end');
  assert.equal(s.m.tOrder, 2);
  assert.equal(s.m.dims, 1);
  assert.equal(build('a vibrating drum').m.dims, 2);
  assert.equal(build('ripples on a pond').p.bc, 'free');
});

test('biology: epidemic recovery time, growth rate and capacity', () => {
  const flu = build('a flu outbreak where people recover in 7 days');
  near(flu.p.params.gamma, 1 / 7);
  assert.deepEqual(flu.m.vars, ['S', 'I', 'R']);
  const pop = build('rabbits growing 5% a year with a carrying capacity of 500');
  assert.equal(pop.p.params.r, 0.05);
  assert.equal(pop.p.params.K, 500);
  assert.equal(build('a fish population with fishing').p.eqs[0].endsWith('-h'), true);
});

test('everyday physics: cooling coffee, falling, circuits, decay', () => {
  const coffee = build('coffee at 90 degrees cooling in a 20 degree room');
  assert.equal(coffee.p.ic.T, '90');
  assert.equal(coffee.p.params.T_a, 20);
  assert.equal(build('a skydiver falling with air resistance').p.view, 'timeline');
  assert.match(build('an RLC circuit with an alternating source').p.eqs[0], /cos/);
  assert.equal(build('a capacitor charges through a resistor').p.name, 'RC circuit');
  near(build('a radioactive isotope with a half-life of 10').p.params.lambda, Math.LN2 / 10);
});

test('fields and patterns; named values override', () => {
  assert.equal(build('zebra stripe patterns').m.fields.length, 2);
  assert.equal(build('quantum tunneling of an electron').m.fields.length, 2);
  assert.ok(build('the steady temperature in a plate').m.steady);
  assert.equal(build('a spring with k = 9').p.params.k, 9);
});

test('every hint builds, and gibberish builds nothing', () => {
  for (const h of DESCRIBE_HINTS) build(h);
  assert.equal(describe('purple elephant sandwich'), null);
});
