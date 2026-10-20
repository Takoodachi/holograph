// Time integration: classic RK4, with the step size picked from the system's stiffness.

function rk4(f, t, S, h, k) {
  const n = S.length, { k1, k2, k3, k4, tmp } = k;
  f(t, S, k1);
  for (let i = 0; i < n; i++) tmp[i] = S[i] + (h / 2) * k1[i];
  f(t + h / 2, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = S[i] + (h / 2) * k2[i];
  f(t + h / 2, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = S[i] + h * k3[i];
  f(t + h, tmp, k4);
  for (let i = 0; i < n; i++) S[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

// Largest |eigenvalue| of the Jacobian of f at S, by power iteration. The geometric mean over the
// last iterations also handles the ±iω eigenvalue pairs of wave equations.
export function stiffness(f, t, S, iters = 24) {
  const n = S.length, f0 = new Float64Array(n), f1 = new Float64Array(n), v = new Float64Array(n), Sp = new Float64Array(n);
  f(t, S, f0);
  let big = 1;
  for (let i = 0; i < n; i++) big = Math.max(big, Math.abs(S[i]));
  const eps = 1e-7 * big;
  for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;
  let logSum = 0, counted = 0;
  for (let it = 0; it < iters; it++) {
    let nv = 0;
    for (let i = 0; i < n; i++) nv += v[i] * v[i];
    if (!nv) return 0;
    nv = Math.sqrt(nv);
    for (let i = 0; i < n; i++) Sp[i] = S[i] + (eps * v[i]) / nv;
    f(t, Sp, f1);
    let nj = 0;
    for (let i = 0; i < n; i++) { v[i] = (f1[i] - f0[i]) / eps; nj += v[i] * v[i]; }
    if (it >= iters / 2) { logSum += Math.log(Math.sqrt(nj) || 1e-300); counted++; }
  }
  return Math.exp(logSum / counted);
}

export class Sim {
  constructor(f, S, hMax) {
    const n = S.length, z = () => new Float64Array(n);
    Object.assign(this, { f, S, hMax, t: 0, h: hMax, frame: 0, k: { k1: z(), k2: z(), k3: z(), k4: z(), tmp: z() } });
  }
  retune() {
    const rho = stiffness(this.f, this.t, this.S);
    this.h = Math.min(this.hMax, rho ? 1 / rho : Infinity); // RK4 is stable to |hλ| ≈ 2.8; 1 leaves margin
  }
  // Advance simulated time by dt within a compute budget. Returns the fraction of dt achieved (<1 = slow motion).
  advance(dt, budgetMs = 12) {
    if (this.frame++ % 30 === 0) this.retune();
    const steps = Math.max(1, Math.ceil(dt / this.h - 1e-9)), h = dt / steps, start = performance.now();
    let done = 0;
    while (done < steps) {
      rk4(this.f, this.t, this.S, h, this.k);
      this.t += h;
      done++;
      this.tap?.(this.S, this.t);
      if (performance.now() - start > budgetMs) break;
    }
    return done / steps;
  }
  finite() {
    for (let i = 0; i < this.S.length; i++) if (!Number.isFinite(this.S[i])) return false;
    return true;
  }
}

export const odeSim = (model, P, Y0) => new Sim((t, Y, dY) => model.deriv(P, t, Y, dY), Float64Array.from(Y0), 0.01);

// Quick look ahead so views can size themselves to the motion: per-component min/max over 0..T
export function scan(model, P, Y0, T = 40, maxSteps = 20000) {
  const sim = odeSim(model, P, Y0);
  sim.retune();
  const h = Math.max(sim.h, T / maxSteps), lo = Float64Array.from(Y0), hi = Float64Array.from(Y0), start = performance.now();
  for (let t = 0; t < T && performance.now() - start < 60; t += h) {
    sim.advance(h, Infinity);
    if (!sim.finite()) break;
    sim.S.forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
  }
  return { lo, hi };
}

// Grid padded with 2 ghost cells per side; ghosts encode the boundary condition.
function fillGhosts(U, g, bc) {
  const { NX, NY, W, GY } = g;
  for (let j = 0; j < NY; j++) {
    const r = (j + GY) * W + 2, e = r + NX - 1;
    for (let k = 1; k <= 2; k++) {
      if (bc === 'periodic') { U[r - k] = U[e + 1 - k]; U[e + k] = U[r + k - 1]; }
      else if (bc === 'free') { U[r - k] = U[r + k]; U[e + k] = U[e - k]; }
      else { U[r - k] = 2 * U[r] - U[r + k]; U[e + k] = 2 * U[e] - U[e - k]; }
    }
  }
  if (!GY) return;
  for (let i = 0; i < W; i++) {
    const r = GY * W + i, e = r + (NY - 1) * W;
    for (let k = 1; k <= 2; k++) {
      if (bc === 'periodic') { U[r - k * W] = U[e - (k - 1) * W]; U[e + k * W] = U[r + (k - 1) * W]; }
      else if (bc === 'free') { U[r - k * W] = U[r + k * W]; U[e + k * W] = U[e - k * W]; }
      else { U[r - k * W] = 2 * U[r] - U[r + k * W]; U[e + k * W] = 2 * U[e] - U[e - k * W]; }
    }
  }
}

// bc: 'fixed' (ends held at their initial value), 'free' (zero slope) or 'periodic'
export function pdeSim(model, P, { n, a, b, bc }, u0, v0) {
  const two = model.tOrder === 2, dims = model.dims;
  const NX = n, NY = dims === 2 ? n : 1, dx = (b - a) / (bc === 'periodic' ? n : n - 1);
  const g = { NX, NY, W: NX + 4, GY: dims === 2 ? 2 : 0, x0: a, dx, y0: a, dy: dims === 2 ? dx : 1 };
  const L = g.W * (NY + 2 * g.GY), kernel = model.kernel(g);
  const idx = (i, j) => (j + g.GY) * g.W + i + 2;
  const S = new Float64Array(two ? 2 * L : L), fixed = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const x = a + i * dx, y = a + j * g.dy;
      S[idx(i, j)] = u0(x, y);
      if (two) S[L + idx(i, j)] = v0(x, y);
      if (bc === 'fixed' && (i === 0 || i === NX - 1 || (dims === 2 && (j === 0 || j === NY - 1)))) fixed.push(idx(i, j));
    }
  }
  const f = (t, X, dX) => {
    const U = X.subarray(0, L);
    fillGhosts(U, g, bc);
    if (two) {
      dX.set(X.subarray(L), 0);
      kernel(P, t, U, X.subarray(L), dX.subarray(L));
      for (const k of fixed) dX[k] = dX[L + k] = 0;
    } else {
      kernel(P, t, U, null, dX);
      for (const k of fixed) dX[k] = 0;
    }
  };
  return Object.assign(new Sim(f, S, Infinity), { NX, NY, idx });
}
