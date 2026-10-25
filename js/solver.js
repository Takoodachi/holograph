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

// ---------- condensed time axis ----------
// Axis position s = u / (1 + c·u), u = t/W. c = 0: a linear window [0, W]. c = 1: all of [0, ∞) squeezed onto [0, 1).
export const tau = (t, W, c) => t / W / (1 + (c * t) / W);
export const untau = (s, W, c) => (c * s >= 1 ? Infinity : (W * s) / (1 - c * s));

// "Nice" times (1, 2, 5 × 10^k) at least `gap` apart on the axis, plus ∞ at the end when fully condensed
export function timeTicks(W, c, gap = 0.08) {
  const out = [{ s: 0, t: 0 }];
  for (let e = -2; e <= 6; e++) {
    for (const m of [1, 2, 5]) {
      const t = m * 10 ** e, s = tau(t, W, c);
      if (s <= 1 && s - out.at(-1).s >= gap && (c < 1 || 1 - s >= gap)) out.push({ s, t });
    }
  }
  if (c >= 1) out.push({ s: 1, t: Infinity });
  return out;
}

// Runs its own copy of a simulation ahead in time, a few ms per call. Sample k+1 is taken W(1 + t/W)²/800 after
// sample k, so even fully condensed the axis gets ~800 evenly spread samples. Each sample keeps the values then and
// their min/max since the previous sample: a motion too fast to resolve that late still shows as a band.
export class Lookahead {
  constructor(sim, read, W, tMax = W * 500) {
    Object.assign(this, { sim, read, W, tMax, rows: [], next: 0, min: null, max: null, done: '' });
    sim.tap = (S, t) => this.record(S, t);
    this.record(sim.S, 0);
  }
  record(S, t) {
    const v = this.read(S);
    if (!v.every(Number.isFinite)) return; // blowing up: keep what was sane, pump() stops
    if (!this.min) { this.min = Float64Array.from(v); this.max = Float64Array.from(v); }
    else for (let i = 0; i < v.length; i++) { if (v[i] < this.min[i]) this.min[i] = v[i]; if (v[i] > this.max[i]) this.max[i] = v[i]; }
    if (t < this.next) return;
    this.rows.push({ t, v: Float64Array.from(v), min: this.min, max: this.max });
    this.min = this.max = null;
    this.next = t + (this.W * (1 + t / this.W) ** 2) / 800;
  }
  pump(budgetMs) {
    if (this.done) return;
    const reached = this.sim.advance(this.tMax - this.sim.t, budgetMs) >= 1;
    if (!this.sim.finite()) this.done = 'blew up';
    else if (reached) {
      this.done = 'done';
      this.next = 0; // close with the final state; the regular schedule may have stepped past the end
      this.record(this.sim.S, this.sim.t);
    }
  }
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

// bc: 'fixed' (edges held at their initial value), 'free' (zero slope) or 'periodic'.
// init: starting values by name, e.g. { u, u__t, v } as (x, y) => number; a missing one starts at 0.
// S holds each field's padded grid in turn (and right after it, ∂ₜ for a 2nd-order field). The first field comes
// first, so idx(i, j) reads it directly.
export function pdeSim(model, P, { n, a, b, bc }, init) {
  const dims = model.dims, fields = model.fields;
  const NX = n, NY = dims === 2 ? n : 1, dx = (b - a) / (bc === 'periodic' ? n : n - 1);
  const W = NX + 4, GY = dims === 2 ? 2 : 0, L = W * (NY + 2 * GY);
  const g = { NX, NY, W, GY, L, x0: a, dx, y0: a, dy: dims === 2 ? dx : 1 };
  const off = {}, blocks = [];
  for (const f of fields) {
    off[f.name] = blocks.length * L;
    blocks.push({ key: f.name, at: off[f.name] });
    if (f.tOrder === 2) blocks.push({ key: `${f.name}__t`, at: off[f.name] + L });
  }
  const kernel = model.kernel(g, off), idx = (i, j) => (j + GY) * W + i + 2;
  const S = new Float64Array(blocks.length * L), fixed = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const x = a + i * dx, y = a + j * g.dy, k = idx(i, j);
      for (const bl of blocks) S[bl.at + k] = init[bl.key]?.(x, y) ?? 0;
      if (bc === 'fixed' && (i === 0 || i === NX - 1 || (dims === 2 && (j === 0 || j === NY - 1)))) fixed.push(k);
    }
  }
  const f = (t, X, dX) => {
    for (const fl of fields) {
      const o = off[fl.name];
      fillGhosts(X.subarray(o, o + L), g, bc);
      if (fl.tOrder === 2) dX.set(X.subarray(o + L, o + 2 * L), o); // ∂ₜu is the stored velocity
    }
    kernel(P, t, X, dX);
    for (const bl of blocks) for (const k of fixed) dX[bl.at + k] = 0;
  };
  return Object.assign(new Sim(f, S, Infinity), { NX, NY, idx, x0: a, dx });
}
