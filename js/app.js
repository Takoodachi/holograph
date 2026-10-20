import { analyze, compileExpr, GREEK, F } from './parse.js';
import { odeSim, pdeSim, scan } from './solver.js';
import { createStage, VIEWS, VIEW_NAMES, LOOKS } from './scene.js';
import { PRESETS } from './presets.js';

await customElements.whenDefined('math-field');
// MathLive guesses asset paths from its script URL, which is wrong for the root-level CDN build
MathfieldElement.fontsDirectory = 'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/fonts/';
MathfieldElement.soundsDirectory = null;

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
const GREEK_CHARS = [...'αβγδεεζηθϑικλμνξρστυφφχψωΓΔΘΛΞΠΣΦΨΩ'];
const glyph = n => GREEK_CHARS[GREEK.indexOf(n)] ?? n;
const fmt = v => String(+v.toPrecision(4));

const state = {
  model: null, view: null, sim: null, view3d: null, ctx: null, broken: false,
  P: {}, range: {}, ic: {}, bc: 'fixed', domain: [-1, 1],
  playing: true, speed: 1, trace: [],
  flat: false, probe: null, held: new Set(),
};
const stage = createStage($('#stage'));

// MathLive's letter shortcuts silently rewrite input (xx → ×, uu → ∪, km → unit…). Keep only Greek and function names.
const SHORTCUTS = new Set([...GREEK, 'pi', ...Object.keys(F), 'arcsin', 'arccos', 'arctan']);

function mathField(latex, label, onInput) {
  const mf = document.createElement('math-field');
  mf.addEventListener('mount', () => {
    mf.inlineShortcuts = Object.fromEntries(Object.entries(mf.inlineShortcuts).filter(([k]) => !/[a-zA-Z]/.test(k) || SHORTCUTS.has(k)));
  }, { once: true });
  mf.value = latex;
  mf.mathVirtualKeyboardPolicy = 'manual';
  mf.setAttribute('aria-label', label);
  mf.addEventListener('input', onInput);
  mf.addEventListener('keydown', e => {
    if (e.key.length !== 1 || /[a-zA-Z0-9]/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    // y'' as one ^{\prime\prime}, not two stacked superscripts
    if (e.key === "'" && /\^\{(\\prime)+\}$/.test(mf.getValue(0, mf.position, 'latex'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      mf.executeCommand('moveToPreviousChar');
      mf.insert('\\prime');
      mf.executeCommand('moveAfterParent');
      mf.dispatchEvent(new Event('input'));
      return;
    }
    // Subscripts hold only letters and digits (as in Desmos): any other key first steps out, so u_xx= doesn't become u_{xx=}
    const p = mf.position;
    mf.executeCommand('moveAfterParent');
    if (mf.position === p || !/_(\{[a-zA-Z0-9]*\}|[a-zA-Z0-9])$/.test(mf.getValue(0, mf.position, 'latex'))) mf.position = p;
    else if (e.key === ' ') e.preventDefault();
  }, true);
  return mf;
}

function status(msg, err = false) {
  $('#status').textContent = msg;
  $('#status').classList.toggle('err', err);
}

// Small notice in the top-right corner; toast('') hides it
let toastTimer;
function toast(msg, ms = 4000) {
  $('#toast').textContent = msg;
  $('#toast').hidden = !msg;
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, ms);
}

// Virtual keyboard: one click outside it shows a hint, a second click (within 3 s) closes it
let armed = false, disarm;
addEventListener('pointerdown', e => {
  const kb = window.mathVirtualKeyboard;
  if (!kb?.visible) return;
  clearTimeout(disarm);
  if (e.target.closest?.('.ML__keyboard, math-field')) {
    armed = false;
    toast('');
  } else if (armed) {
    kb.hide();
    armed = false;
    toast('');
  } else {
    armed = true;
    toast('Click again to close the keyboard', 3000);
    disarm = setTimeout(() => { armed = false; }, 3000);
  }
}, true);

// ---------- equations ----------
const eqList = $('#eqs');
let timer;
const later = fn => { clearTimeout(timer); timer = setTimeout(fn, 300); };

function addEq(latex = '') {
  const row = el('div', 'eq-row'), del = el('button', 'icon', '×');
  const mf = mathField(latex, 'Differential equation', () => later(rebuild));
  del.setAttribute('aria-label', 'Remove equation');
  del.onclick = () => { row.remove(); renumber(); later(rebuild); };
  row.append(el('span', 'eq-idx'), mf, del);
  eqList.append(row);
  renumber();
  return mf;
}
function renumber() {
  [...eqList.children].forEach((r, i) => { r.querySelector('.eq-idx').textContent = String(i + 1).padStart(2, '0'); });
}
$('#add-eq').onclick = () => addEq().focus();

function rebuild() {
  try {
    state.model = analyze([...eqList.querySelectorAll('math-field')].map(m => m.value));
  } catch (e) {
    return status(e.message, true);
  }
  const m = state.model;
  if (!m.views.includes(state.view)) state.view = m.views[0];
  $('#bc-sec').hidden = m.kind !== 'pde';
  $('#domain-label').textContent = m.dims === 2 ? 'x, y ∈' : 'x ∈';
  renderViews();
  renderICs();
  reset();
}

function renderViews() {
  const box = $('#views');
  box.replaceChildren(...state.model.views.map(v => {
    const b = el('button', v === state.view ? 'on' : '', VIEW_NAMES[v]);
    b.onclick = () => { state.view = v; renderViews(); reset(); };
    return b;
  }));
  $('#view-sec').hidden = state.model.views.length < 2;
}

// ---------- initial conditions ----------
function icSpecs(m) {
  if (m.kind === 'pde') {
    const at = m.dims === 2 ? '(x,y,0)' : '(x,0)';
    return [
      { key: 'u0', label: `${glyph(m.u)}${at}`, def: m.dims === 2 ? String.raw`e^{-30\left(x^2+y^2\right)}` : String.raw`e^{-30x^2}` },
      ...(m.tOrder === 2 ? [{ key: 'v0', label: `∂ₜ${glyph(m.u)}${at}`, def: '0' }] : []),
    ];
  }
  return m.state.map(s => {
    const [v, d = ''] = s.split('__');
    return { key: s, label: `${glyph(v)}${['', '′', '″', '‴'][d.length] ?? `⁽${d.length}⁾`}(0)`, def: d ? '0' : '1' };
  });
}

function renderICs() {
  $('#ics').replaceChildren(...icSpecs(state.model).map(({ key, label, def }) => {
    state.ic[key] ??= def;
    const row = el('div', 'ic-row');
    row.append(el('span', 'ic-label', `${label} =`), mathField(state.ic[key], `Initial condition ${label}`, e => { state.ic[key] = e.target.value; later(reset); }));
    return row;
  }));
}

function compileICs(m) {
  const fn = {}, params = new Set();
  for (const { key, label } of icSpecs(m)) {
    try {
      const c = compileExpr(state.ic[key] || '0', m.kind === 'pde' ? ['x', 'y'] : []);
      fn[key] = c.fn;
      c.params.forEach(p => params.add(p));
    } catch (e) {
      throw new Error(`${label}: ${e.message}`);
    }
  }
  return { fn, params };
}

// ---------- parameters (Desmos-style: every unknown letter gets a slider) ----------
function renderParams(names) {
  $('#param-sec').hidden = !names.length;
  $('#params').replaceChildren(...names.map(n => {
    const v = (state.P[n] ??= 1);
    const [lo, hi] = (state.range[n] ??= v > 0 ? [0, 4 * v] : v < 0 ? [4 * v, 0] : [-5, 5]);
    const row = el('div', 'param'), name = el('span', 'name'), slider = el('input'), num = el('input', 'num');
    const [base, sub] = n.split('_');
    name.append(glyph(base));
    if (sub) name.append(el('sub', '', sub));
    name.title = n;
    Object.assign(slider, { type: 'range', min: lo, max: hi, step: (hi - lo) / 400, value: v });
    Object.assign(num, { type: 'number', step: 'any', value: fmt(v) });
    slider.setAttribute('aria-label', `Parameter ${n}`);
    num.setAttribute('aria-label', `Parameter ${n} value`);
    const set = x => { state.P[n] = x; if (state.sim) state.sim.frame = 0; }; // frame 0 → re-check the stable step size now
    slider.oninput = () => { set(+slider.value); num.value = fmt(+slider.value); };
    num.onchange = () => {
      const x = parseFloat(num.value);
      if (!Number.isFinite(x)) return void (num.value = fmt(state.P[n]));
      if (x < +slider.min) slider.min = state.range[n][0] = x;
      if (x > +slider.max) slider.max = state.range[n][1] = x;
      slider.value = x;
      set(x);
    };
    row.append(name, slider, num);
    return row;
  }));
}

// ---------- domain & boundary ----------
function syncBoundaryUI() {
  $('#dom-a').value = state.domain[0];
  $('#dom-b').value = state.domain[1];
  document.querySelectorAll('#bcs button').forEach(b => b.classList.toggle('on', b.dataset.bc === state.bc));
}
document.querySelectorAll('#bcs button').forEach(b => { b.onclick = () => { state.bc = b.dataset.bc; syncBoundaryUI(); reset(); }; });
for (const id of ['#dom-a', '#dom-b']) {
  $(id).onchange = () => {
    const a = parseFloat($('#dom-a').value), b = parseFloat($('#dom-b').value);
    if (Number.isFinite(a) && Number.isFinite(b) && a < b) { state.domain = [a, b]; reset(); }
    else { status('The domain needs start < end', true); syncBoundaryUI(); }
  };
}

// ---------- simulation ----------
function reset() {
  const m = state.model;
  if (!m) return;
  let ics;
  try { ics = compileICs(m); } catch (e) { return status(e.message, true); }
  renderParams([...new Set([...m.params, ...ics.params])]);
  const P = state.P;

  if (m.kind === 'ode') {
    const Y0 = m.state.map(s => ics.fn[s](P));
    if (Y0.some(v => !Number.isFinite(v))) return status('Initial conditions must be finite numbers', true);
    const { lo, hi } = scan(m, P, Y0);
    state.sim = odeSim(m, P, Y0);
    state.ctx = { lo, hi, P, coords: m.coords, field: m.state.length === 2 ? m.deriv : null, labels: icSpecs(m).map(s => s.label.replace('(0)', '')) };
  } else {
    const [a, b] = state.domain;
    const sim = pdeSim(m, P, { n: m.dims === 2 ? 81 : 241, a, b, bc: state.bc }, (x, y) => ics.fn.u0(P, x, y), (x, y) => ics.fn.v0?.(P, x, y) ?? 0);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) { const u = sim.S[sim.idx(i, j)]; lo = Math.min(lo, u); hi = Math.max(hi, u); }
    if (!Number.isFinite(lo + hi)) return status(`${glyph(m.u)}(x,0) is not finite everywhere on the domain`, true);
    if (hi - lo < 1e-9) { lo = Math.min(lo, -1); hi = Math.max(hi, 1); }
    state.sim = sim;
    state.ctx = { sim, lo, hi, signed: m.tOrder === 2 || lo < 0 };
  }
  state.broken = false;
  status(m.label);
  $('#hud-kind').textContent = m.label;
  $('#hud-view').textContent = VIEW_NAMES[state.view];
  showView();
  state.trace = [];
  $('#scope-box').hidden = m.kind !== 'ode';
  if (m.kind === 'ode') $('#scope-legend').replaceChildren(...scopeComps(m).map((k, i) => {
    return el('span', `s${i}`, icSpecs(m)[k].label.replace('(0)', '(t)'));
  }));
}

// (Re)build the view for the current simulation: drops the probe and re-applies 2D where the view has a 2D form
function showView(keepCamera = false) {
  state.view3d = stage.show(VIEWS[state.view](state.ctx), keepCamera);
  state.sim.tap = state.view3d.step;
  state.probe = null;
  applyFlat();
}

function applyFlat() {
  if (!stage.setFlat(state.flat)) {
    state.flat = false;
    const alt = state.model.views.includes('phase') ? ' Try Phase space for a 2D view.' : '';
    toast(`2D isn't possible for the ${VIEW_NAMES[state.view]}: its motion needs all three axes.${alt}`);
  }
  document.querySelectorAll('#dims button').forEach(b => b.classList.toggle('on', (b.dataset.flat === '1') === state.flat));
}
document.querySelectorAll('#dims button').forEach(b => {
  b.onclick = () => { state.flat = b.dataset.flat === '1'; if (state.view3d) applyFlat(); };
});

// Click (not drag) on the graph: a ripple spreads from that point and a live readout of the value there is pinned to it
const canvas = $('#stage');
let press = null;
canvas.addEventListener('pointerdown', e => { press = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!press || !state.view3d || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5 || performance.now() - press.t > 500) return;
  state.probe = state.view3d.probe?.(stage.raycaster(e.clientX, e.clientY)) ?? null;
  if (state.probe && !state.broken) stage.ripple(state.probe(state.sim.S, state.sim.t).at);
});

// ---------- transport ----------
function setPlaying(on) {
  state.playing = on;
  $('#play').textContent = on ? 'Pause' : 'Play';
}
$('#play').onclick = () => {
  if (state.broken) reset();
  setPlaying(!state.playing);
};
$('#reset').onclick = () => { reset(); setPlaying(true); };
$('#speeds').replaceChildren(...[0.25, 0.5, 1, 2, 4].map(s => {
  const b = el('button', s === 1 ? 'on' : '', `${s}×`);
  b.setAttribute('aria-label', `Speed ${s} times`);
  b.onclick = () => {
    state.speed = s;
    document.querySelectorAll('#speeds button').forEach(x => x.classList.toggle('on', x === b));
  };
  return b;
}));
// WASD moves through the scene (held keys are applied every frame); Esc removes the readout
const MOVE = new Set(['w', 'a', 's', 'd']);
addEventListener('keydown', e => {
  if (e.target.closest?.('math-field, input') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (MOVE.has(k)) { state.held.add(k); e.preventDefault(); return; }
  if (k === 'escape') state.probe = null;
  if (e.target.closest?.('button')) return;
  if (e.code === 'Space') { e.preventDefault(); $('#play').click(); }
  if (k === 'r') $('#reset').click();
});
addEventListener('keyup', e => state.held.delete(e.key.toLowerCase()));
addEventListener('blur', () => state.held.clear());

// ---------- scope: the ODE's signals over the last 10 s ----------
let scopeInk = { colors: [], grid: '' }; // read from the CSS theme in setLook()
const scopeComps = m => (m.vars.length > 1 ? m.vars.map(v => m.state.indexOf(v)) : [0, 1].filter(k => k < m.state.length)).slice(0, 3);
const scopeCanvas = $('#scope'), g2 = scopeCanvas.getContext('2d');

function drawScope(record) {
  const m = state.model, { sim, ctx } = state;
  if (m.kind !== 'ode' || scopeCanvas.offsetParent === null) return;
  const comps = scopeComps(m);
  if (record || !state.trace.length) state.trace.push([sim.t, ...comps.map(k => sim.S[k])]);
  if (state.trace.length > 1500) state.trace.shift();
  const dpr = devicePixelRatio, w = scopeCanvas.clientWidth, h = scopeCanvas.clientHeight;
  if (scopeCanvas.width !== w * dpr) { scopeCanvas.width = w * dpr; scopeCanvas.height = h * dpr; }
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.clearRect(0, 0, w, h);
  g2.strokeStyle = scopeInk.grid;
  g2.lineWidth = 1;
  for (let k = 1; k < 4; k++) { g2.beginPath(); g2.moveTo(0, (h * k) / 4); g2.lineTo(w, (h * k) / 4); g2.stroke(); }
  const span = 10, now = sim.t;
  comps.forEach((k, c) => {
    const lo = ctx.lo[k], hi = ctx.hi[k], mid = (lo + hi) / 2, half = Math.max((hi - lo) / 2, 1e-9) * 1.15;
    g2.strokeStyle = scopeInk.colors[c];
    g2.globalAlpha = c ? 0.6 : 1;
    g2.beginPath();
    state.trace.forEach(([t, ...v], i) => {
      const x = w - ((now - t) / span) * w, y = h / 2 - ((v[c] - mid) / half) * (h / 2 - 6);
      i ? g2.lineTo(x, y) : g2.moveTo(x, y);
    });
    g2.stroke();
  });
  g2.globalAlpha = 1;
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  const { sim, view3d } = state;
  if (sim && view3d && !state.broken) {
    let dt = 0;
    if (state.playing) {
      const want = real * state.speed, got = sim.advance(want);
      dt = want * got;
      $('#rate').textContent = got < 0.95 ? `slow motion ×${got.toFixed(2)}` : '';
      if (!sim.finite()) {
        state.broken = true;
        setPlaying(false);
        status(`The solution blew up near t = ${sim.t.toPrecision(3)}. Try gentler parameters, then restart.`, true);
      }
    }
    if (!state.broken) {
      view3d.update(sim.S, sim.t, dt);
      drawScope(dt > 0);
    }
    $('#clock').textContent = `t = ${sim.t.toFixed(2)}`;
  }
  const probe = state.probe && !state.broken ? state.probe(sim.S, sim.t) : null, at = probe && stage.project(probe.at), tag = $('#probe');
  tag.hidden = !at;
  if (at) Object.assign(tag, { textContent: probe.text }).style.cssText = `left:${at.x}px;top:${at.y}px`;
  if (state.held.size) stage.move(state.held, real);
  stage.render(now / 1000);
}

// ---------- look: hologram / plain / light ----------
function setLook(look) {
  if (!LOOKS[look]) look = 'holo';
  document.documentElement.dataset.look = look;
  try { localStorage.setItem('holograph.look', look); } catch {}
  document.querySelectorAll('#looks button').forEach(b => b.classList.toggle('on', b.dataset.look === look));
  stage.setLook(look);
  const css = getComputedStyle(document.documentElement);
  scopeInk = { colors: ['--accent', '--text', '--blue'].map(v => css.getPropertyValue(v).trim()), grid: css.getPropertyValue('--line').trim() };
  if (state.ctx) showView(true); // rebuild the view in the new colours; the simulation and camera carry on
}
document.querySelectorAll('#looks button').forEach(b => { b.onclick = () => setLook(b.dataset.look); });
let savedLook = null;
try { savedLook = localStorage.getItem('holograph.look'); } catch {}
setLook(savedLook);

// ---------- examples ----------
function load(p) {
  eqList.replaceChildren();
  p.eqs.forEach(e => addEq(e));
  for (const k in p.params) delete state.range[k];
  Object.assign(state.P, p.params);
  Object.assign(state.ic, p.ic);
  state.bc = p.bc ?? 'fixed';
  state.domain = p.domain ?? [-1, 1];
  state.view = p.view ?? null;
  syncBoundaryUI();
  rebuild();
  setPlaying(true);
}
$('#examples').replaceChildren(...PRESETS.map(p => {
  const b = el('button', 'example');
  b.append(el('small', '', p.bc ? 'PDE' : p.eqs.length > 1 ? 'SYSTEM' : 'ODE'), p.name);
  b.onclick = () => load(p);
  return b;
}));

load(PRESETS[0]);
requestAnimationFrame(frame);
