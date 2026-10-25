import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, compileExpr, toPlain } from '../js/parse.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const d = (m, P, t, Y) => { const dY = Y.map(() => 0); m.deriv(P, t, Y, dY); return dY; };

test('spring: dot notation, implicit products, parameters', () => {
  const m = analyze([String.raw`m\ddot{x}+c\dot{x}+kx=0`]);
  assert.equal(m.kind, 'ode');
  assert.deepEqual(m.state, ['x', 'x__t']);
  assert.deepEqual(m.params.sort(), ['c', 'k', 'm']);
  assert.deepEqual(d(m, { m: 2, c: 1, k: 8 }, 0, [1, 0.5]), [0.5, (-0.5 - 8) / 2]);
  assert.equal(m.views[0], 'spring');
});

test('plain-text primes and MathLive ^{\\prime} are the same thing', () => {
  for (const src of ["y''+0.5y'+4y=0", String.raw`y^{\prime\prime}+0.5y^{\prime}+4y=0`]) {
    const m = analyze([src]);
    assert.deepEqual(m.state, ['y', 'y__t']);
    assert.deepEqual(d(m, {}, 0, [1, 2]), [2, -1 - 4]);
  }
});

test('pendulum: Leibniz fraction, \\sin\\theta, \\frac{g}{L}', () => {
  const m = analyze([String.raw`\frac{d^2\theta}{dt^2}+\frac{g}{L}\sin\theta=0`]);
  assert.deepEqual(m.state, ['theta', 'theta__t']);
  assert.equal(m.views[0], 'pendulum');
  near(d(m, { g: 9.81, L: 2 }, 0, [1, 0])[1], -9.81 / 2 * Math.sin(1));
});

test('logistic with \\left( \\right) and rP(...) as a product', () => {
  const m = analyze([String.raw`\frac{dP}{dt}=rP\left(1-\frac{P}{K}\right)`]);
  assert.deepEqual(m.views, ['level', 'timeline']);
  near(d(m, { r: 2, K: 10 }, 0, [4])[0], 2 * 4 * (1 - 0.4));
});

test('Lorenz system: xy is x·y, three equations, greek parameters', () => {
  const m = analyze([String.raw`\dot{x}=\sigma\left(y-x\right)`, String.raw`\dot{y}=x\left(\rho-z\right)-y`, String.raw`\dot{z}=xy-\beta z`]);
  assert.deepEqual(m.state, ['x', 'y', 'z']);
  assert.deepEqual(m.params.sort(), ['beta', 'rho', 'sigma']);
  assert.equal(m.views[0], 'attractor');
  assert.deepEqual(d(m, { sigma: 10, rho: 28, beta: 2 }, 0, [1, 2, 3]), [10, 1 * 25 - 2, 2 - 6]);
});

test('coupled system using another unknown’s derivative', () => {
  const m = analyze(["x'=y", "y'=-x-cx'"]);
  assert.deepEqual(d(m, { c: 0.5 }, 0, [1, 2]), [2, -1 - 0.5 * 2]);
});

test('forced oscillator uses t; Airy equation is in x', () => {
  const f = analyze([String.raw`y''+y=\cos\left(\omega t\right)`]);
  assert.equal(f.indep, 't');
  near(d(f, { omega: 2 }, 1, [0, 0])[1], Math.cos(2));
  const a = analyze(["y''=xy"]);
  assert.equal(a.indep, 'x');
  assert.deepEqual(a.params, []);
});

test('heat equation from \\partial LaTeX', () => {
  const m = analyze([String.raw`\frac{\partial u}{\partial t}=\alpha\frac{\partial^2u}{\partial x^2}`]);
  assert.equal(m.kind, 'pde');
  assert.equal(m.tOrder, 1);
  assert.equal(m.dims, 1);
  assert.deepEqual(m.params, ['alpha']);
  // u = x² on a padded 1D grid → u_t = α·2
  const NX = 5, dx = 0.5, x0 = -1, g = { NX, NY: 1, W: NX + 4, GY: 0, L: NX + 4, x0, dx, y0: 0, dy: 1 };
  const U = new Float64Array(g.W).map((_, k) => (x0 + (k - 2) * dx) ** 2), OUT = new Float64Array(g.W);
  m.kernel(g, { u: 0 })({ alpha: 3 }, 0, U, OUT);
  for (let i = 0; i < NX; i++) near(OUT[i + 2], 6);
});

test('double pendulum: both equations hold both θ″ and φ″ (solved together)', () => {
  const m = analyze([
    String.raw`2\ddot{\theta}+\ddot{\phi}\cos\left(\theta-\phi\right)+\dot{\phi}^2\sin\left(\theta-\phi\right)+\frac{2g}{L}\sin\theta=0`,
    String.raw`\ddot{\phi}+\ddot{\theta}\cos\left(\theta-\phi\right)-\dot{\theta}^2\sin\left(\theta-\phi\right)+\frac{g}{L}\sin\phi=0`,
  ]);
  assert.deepEqual(m.state, ['theta', 'theta__t', 'phi', 'phi__t']);
  assert.equal(m.views[0], 'pendulum2');
  // closed form for equal masses and lengths (g/L = 1)
  const [a, wa, b, wb] = [0.7, 0.3, -0.4, 1.1], s = Math.sin(a - b), c = Math.cos(a - b), den = 2 - c ** 2;
  const a2 = (-(wb ** 2) * s - 2 * Math.sin(a) - c * (wa ** 2 * s - Math.sin(b))) / den;
  const b2 = (2 * wa ** 2 * s - 2 * Math.sin(b) + c * (wb ** 2 * s + 2 * Math.sin(a))) / den;
  const dY = d(m, { g: 1, L: 1 }, 0, [a, wa, b, wb]);
  near(dY[1], a2);
  near(dY[3], b2);
});

test('PDE systems: each equation evolves its own field', () => {
  const m = analyze(['u_t=Du_{xx}-uv^2+F\\left(1-u\\right)', 'v_t=Ev_{xx}+uv^2-\\left(F+k\\right)v']);
  assert.deepEqual(m.fields.map(f => f.name), ['u', 'v']);
  assert.deepEqual(m.params.sort(), ['D', 'E', 'F', 'k']);
  assert.match(m.label, /PDE system · reaction–diffusion/);
  assert.match(analyze(['u_t=-\\beta v_{xx}', 'v_t=\\beta u_{xx}']).label, /wave-type/);
  assert.throws(() => analyze(['u_t=v_{xx}', 'u_t=u_{xx}']), /same field|time derivative of one field/);
});

test('a subscript ends where the name does: ρ₀eˣ, k₁x; plain u_xx is still ∂²u/∂x²', () => {
  assert.deepEqual(analyze([String.raw`u_t=u_{xx}+\rho_0e^{x}`]).params, ['rho_0']);
  assert.deepEqual(analyze(["y'=k_1x+t"]).params, ['k_1', 'x']);
  assert.deepEqual(analyze(['u_t=u_xx']).space, ['xx']);
});

test('steady state: Laplace in 2D relaxes, 1D steady equations stay ODEs in x', () => {
  const m = analyze(['u_{xx}+u_{yy}=0']);
  assert.ok(m.steady && m.dims === 2);
  assert.match(m.label, /steady state · u\(x,y\)$/);
  assert.equal(analyze(["y''=-2"]).kind, 'ode');
});

test('wave, Burgers (uu_x), 2D ∇², KdV with \\cosh^2', () => {
  assert.equal(analyze(['u_{tt}=c^2u_{xx}']).tOrder, 2);
  const b = analyze([String.raw`u_t+uu_x=\nu u_{xx}`]);
  assert.deepEqual(b.space.sort(), ['x', 'xx']);
  assert.deepEqual(b.params, ['nu']);
  const w = analyze([String.raw`\frac{\partial^2u}{\partial t^2}=c^2\nabla^2u`]);
  assert.equal(w.dims, 2);
  assert.equal(analyze(['u_t+6uu_x+u_{xxx}=0']).kind, 'pde');
  near(compileExpr(String.raw`\frac{2}{\cosh^{2}\left(x\right)}`, ['x']).fn({}, 0.5), 2 / Math.cosh(0.5) ** 2);
});

test('initial-condition expressions: |x|, comparisons, \\sin x, params', () => {
  const step = compileExpr(String.raw`\left(\left|x\right|<0.3\right)`, ['x']);
  assert.equal(step.fn({}, 0.1), 1);
  assert.equal(step.fn({}, 0.5), 0);
  const s = compileExpr(String.raw`A\sin\pi x`, ['x']);
  assert.deepEqual(s.params, ['A']);
  near(s.fn({ A: 2 }, 0.5), 2);
  near(compileExpr(String.raw`\frac{\pi}{2}`).fn({}), Math.PI / 2);
});

test('helpful errors', () => {
  assert.throws(() => analyze(['y=3x']), /No derivative/);
  assert.deepEqual(analyze(["x'=y"]).params, ['y']); // undefined names become slider parameters, like Desmos
  assert.throws(() => analyze(["x'=y", "y'=x", "z=1"]), /3 equations for 2 unknowns/);
  assert.throws(() => analyze(['u_{xx}+u_{yy}=0', 'v_{xx}=1']), /single equation/);
  assert.throws(() => analyze([String.raw`y'=\placeholder{}`]), /empty box/);
  assert.equal(toPlain("k_1 x").includes('k_1'), true);
});

test('every example parses and its initial conditions compile', async () => {
  const { PRESETS } = await import('../js/presets.js');
  for (const p of PRESETS) {
    const m = analyze(p.eqs);
    assert.equal(m.kind, p.bc ? 'pde' : 'ode', p.name);
    for (const v of Object.values(p.ic)) assert.ok(Number.isFinite(compileExpr(v, ['x', 'y']).fn(p.params, 0.1, 0.2)), p.name);
    if (p.view) assert.ok(m.views.includes(p.view), p.name);
  }
});
