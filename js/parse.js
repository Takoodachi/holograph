// Equation front end: LaTeX (from MathLive) or plain text → classified model with compiled JS kernels.
// Derivatives become symbols "base__wrt": y'' → y__tt, ∂²u/∂x² → u__xx, u_{xy} → u__xy.
import { parse as mathParse } from 'mathjs';

export const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'];

// Math library the compiled code calls as F.name(...)
export const F = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sech: x => 1 / Math.cosh(x), csch: x => 1 / Math.sinh(x), coth: x => 1 / Math.tanh(x),
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, nthRoot: (x, n) => (x < 0 && n % 2 ? -((-x) ** (1 / n)) : x ** (1 / n)),
  abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max,
};
const TEX_FN = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', sgn: 'sign', lg: 'log10' };
const TEX_OP = { cdot: '*', times: '*', div: '/', lt: '<', gt: '>', le: '<=', leq: '<=', ge: '>=', geq: '>=', vert: '|', lvert: '|', rvert: '|', mid: '|' };
const VAR = String.raw`(\\[a-zA-Z]+|[a-zA-Z])`;
const bare = v => v.replace('\\', '');
const sortLetters = w => [...w].sort().join('');

// ---------- LaTeX → plain text ----------

function cleanup(s) {
  return s
    .replace(/\\placeholder(\[[^\]]*\])?\{[^}]*\}/g, () => { throw new Error('Fill in the empty box first'); })
    .replace(/\\(?:left|right|bigl?|bigr?|Bigl?|Bigr?|biggl?|biggr?)(?![a-zA-Z])\s*\.?/g, '')
    .replace(/\\[,;:! ]|\\q?quad(?![a-zA-Z])|~/g, ' ')
    .replace(/\\operatorname\s*\{([a-zA-Z]+)\}/g, '\\$1')
    .replace(/\\(?:mathrm|text|textrm|mathit|mathbf|mathsf|displaystyle)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\displaystyle/g, '')
    .replace(/\\differentialD/g, 'd').replace(/\\exponentialE/g, 'e').replace(/\\imaginaryI/g, 'i')
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\^\s*\{\s*((?:\\prime\s*|\\doubleprime\s*|'\s*)+)\}/g, (_, p) => "'".repeat(p.replace(/\\doubleprime/g, "''").match(/\\prime|'/g).length))
    .replace(/\^\s*\\prime/g, "'").replace(/\\doubleprime/g, "''").replace(/\\prime/g, "'");
}

// Dots, primes and ∇² are rewritten before the main scan. Primes get "@" = the independent variable, decided later.
function shorthand(s) {
  return s
    .replace(new RegExp(String.raw`\\(d{0,3})dot(?![a-zA-Z])\s*(?:\{\s*${VAR}\s*\}|${VAR})`, 'g'), (_, d, a, b) => ` ${bare(a || b)}__${'t'.repeat(d.length + 1)} `)
    .replace(new RegExp(VAR + String.raw`\s*('+)`, 'g'), (_, v, p) => ` ${bare(v)}__${'@'.repeat(p.length)} `)
    .replace(new RegExp(String.raw`\\nabla\s*\^\s*\{?\s*2\s*\}?\s*(?:\(\s*${VAR}\s*\)|${VAR})`, 'g'), (_, a, b) => ` (${bare(a || b)}__xx+${bare(a || b)}__yy) `);
}

// Read a TeX argument at s[i]: "{...}" or a single token. Returns [content, next index].
function group(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    for (let j = i, depth = 0; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    throw new Error('Unbalanced { }');
  }
  const m = /^\\[a-zA-Z]+|^./.exec(s.slice(i));
  if (!m) throw new Error('Something is missing at the end');
  return [m[0], i + m[0].length];
}

// "(...)" with matching parens, else a TeX argument
function parenArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '(') return group(s, i);
  for (let j = i, depth = 0; j < s.length; j++) {
    if (s[j] === '(') depth++;
    else if (s[j] === ')' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  throw new Error('Unbalanced ( )');
}

const NUM_RE = /^\s*(?:d|\\partial)\s*(?:\^\s*\{?\s*(\d)\s*\}?)?\s*(\\[a-zA-Z]+|[a-zA-Z])?\s*$/;
const DEN_PART = /(?:d|\\partial)\s*([a-zA-Z])\s*(?:\^\s*\{?\s*(\d)\s*\}?)?/g;
const DEN_RE = /^(?:\s*(?:d|\\partial)\s*[a-zA-Z]\s*(?:\^\s*\{?\s*\d\s*\}?)?)+\s*$/;

// \frac{d^2y}{dt^2}, \frac{\partial u}{\partial x}, \frac{d}{dt} (operator form: v undefined)
function leibniz(num, den) {
  const n = NUM_RE.exec(num);
  if (!n || !DEN_RE.test(den)) return null;
  let wrt = '';
  for (const m of den.matchAll(DEN_PART)) wrt += m[1].repeat(+(m[2] || 1));
  return { v: n[2], wrt: sortLetters(wrt) };
}

function tex(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\') {
      const cmd = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))?.[1] ?? '';
      i += cmd.length + 1;
      if (cmd === 'frac') {
        let num, den;
        [num, i] = group(s, i);
        [den, i] = group(s, i);
        const d = leibniz(num, den);
        if (!d) { out += `((${tex(num)})/(${tex(den)}))`; continue; }
        let v = d.v;
        if (!v) {
          const m = new RegExp(String.raw`^\s*(?:\(\s*${VAR}\s*\)|${VAR})`).exec(s.slice(i));
          if (!m) throw new Error('Put a function after d/dt, e.g. \\frac{d}{dt}x');
          v = m[1] || m[2];
          i += m[0].length;
        }
        out += ` ${bare(v)}__${d.wrt} `;
      } else if (cmd === 'sqrt') {
        let root = null, a;
        if (s[i] === '[') { const j = s.indexOf(']', i); root = s.slice(i + 1, j); i = j + 1; }
        [a, i] = group(s, i);
        out += root ? ` nthRoot(${tex(a)},${tex(root)})` : ` sqrt(${tex(a)})`;
      } else if (cmd === 'pi' || GREEK.includes(cmd)) out += ' ' + cmd;
      else if (TEX_OP[cmd]) out += TEX_OP[cmd];
      else if (TEX_FN[cmd] || cmd in F) {
        const fn = TEX_FN[cmd] || cmd;
        if (/^\s*\^/.test(s.slice(i))) { // \sin^2 x means (sin x)^2
          let p, arg;
          [p, i] = group(s, s.indexOf('^', i) + 1);
          [arg, i] = parenArg(s, i);
          out += ` (${fn}(${tex(arg)}))^(${tex(p)})`;
        } else out += ` ${fn} `;
      } else if (cmd === '{' || cmd === '}') out += cmd === '{' ? '(' : ')';
      else throw new Error(`Unsupported command \\${cmd}`);
    } else if (c === '^') {
      let a;
      [a, i] = group(s, i + 1);
      out += `^(${tex(a)})`;
    } else if (c === '_' && s[i + 1] === '_') {
      const m = /^__[a-z@]+/.exec(s.slice(i)); // a derivative token shorthand() already made: x__t, y__@@
      out += m[0] + ' ';
      i += m[0].length;
    } else if (c === '_') {
      // u_{xx} or plain u_xx is a partial derivative (a run of t/x/y); k_1 or T_a is just a name, and the subscript
      // ends there: \rho_0e^{x} is ρ₀·eˣ
      let a;
      const run = s[i + 1] !== '{' && /^[txy]+/.exec(s.slice(i + 1));
      if (run) { a = run[0]; i += 1 + a.length; } else [a, i] = group(s, i + 1);
      a = a.replace(/[\s{}\\]/g, '');
      out += (/^[txy]+$/.test(a) && /[a-zA-Z]$/.test(out) ? '__' + sortLetters(a) : '_' + a) + ' ';
    } else {
      out += c === '{' ? '(' : c === '}' ? ')' : c;
      i++;
    }
  }
  return out;
}

const FNS = Object.keys(F).join('|');
const KEEP = new Set([...GREEK, 'pi', 'e', ...Object.keys(F)]);
const NAMED = new RegExp(String.raw`^([a-zA-Z]*?)((?:${GREEK.join('|')}|[a-zA-Z])_{1,2}[a-zA-Z0-9@]+)$`);
const FN_ARG = new RegExp(String.raw`\b(${FNS})\s+(?![\s(])((?:\s*(?:\d+(?:\.\d+)?|(?!(?:${FNS})\b)[a-zA-Z][\w@]*))+)`, 'g');

// Desmos-style reading: "xy" is x·y, "k(x+1)" is k·(x+1), "sin x" is sin(x)
function tokens(p) {
  p = p.replace(/\|([^|]*)\|/g, ' abs($1) ');
  if (p.includes('|')) throw new Error('Unmatched | in absolute value');
  if (p.includes("'")) throw new Error("Primes go right after a variable, like y'");
  p = p.replace(/[a-zA-Z][a-zA-Z0-9_@]*/g, tok => {
    if (KEEP.has(tok)) return ` ${tok} `;
    const m = NAMED.exec(tok);
    if (m) return ` ${[...m[1]].join(' ')} ${m[2]} `;
    return ` ${tok.replace(/[a-zA-Z]/g, ' $& ')} `;
  });
  p = p.replace(/([a-zA-Z][a-zA-Z0-9_@]*)\s*\(/g, (_, id) => (id in F ? `${id}(` : `${id}*(`));
  return p.replace(FN_ARG, '$1($2)');
}

export const toPlain = latex => tokens(tex(shorthand(cleanup(latex))));

// ---------- plain text → JS ----------

const OPS = { '+': '+', '-': '-', '*': '*', '/': '/', '^': '**', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '==': '===', '!=': '!==', mod: '%' };

function emit(node, sym) {
  switch (node.type) {
    case 'ConstantNode':
      if (typeof node.value !== 'number') throw new Error(`Can't use "${node.value}" here`);
      return `(${node.value})`;
    case 'SymbolNode':
      if (node.name === 'pi') return 'Math.PI';
      if (node.name === 'e') return 'Math.E';
      if (node.name in F) throw new Error(`${node.name} needs an argument, e.g. ${node.name}(x)`);
      sym.add(node.name);
      return '$' + node.name;
    case 'ParenthesisNode':
      return emit(node.content, sym);
    case 'OperatorNode': {
      const a = node.args.map(n => emit(n, sym));
      if (a.length === 1 && (node.op === '-' || node.op === '+')) return `(${node.op}${a[0]})`;
      if (a.length !== 2 || !OPS[node.op]) throw new Error(`Can't use "${node.op}" here`);
      return `(${a[0]}${OPS[node.op]}${a[1]})`;
    }
    case 'FunctionNode':
      if (!(node.fn.name in F)) throw new Error(`Unknown function ${node.fn.name}`);
      return `F.${node.fn.name}(${node.args.map(n => emit(n, sym)).join(',')})`;
    default:
      throw new Error(`Can't use "${node.toString()}" here`);
  }
}

function toJS(plain) {
  let node;
  try { node = mathParse(plain); } catch (e) { throw new Error(`Couldn't read that (${e.message.replace(/\s*\(char \d+\)/, '')})`); }
  const sym = new Set();
  return { js: emit(node, sym), sym };
}

const declParams = params => [...params].map(p => `const $${p} = P[${JSON.stringify(p)}];`).join('\n');

// Constant or field expression, e.g. an initial condition u(x,0) = e^{-x^2}. args: coordinate names.
export function compileExpr(latex, args = []) {
  const plain = toPlain(latex).split(/(?<![<>!=])=(?!=)/).pop().replace(/@/g, 't');
  if (!plain.trim()) throw new Error('Empty');
  const { js, sym } = toJS(plain);
  if ([...sym].some(s => s.includes('__'))) throw new Error('No derivatives here');
  const params = [...sym].filter(s => !args.includes(s));
  const fn = new Function('F', 'P', ...args.map(a => '$' + a), `${declParams(params)}\nreturn +${js};`);
  return { fn: (P, ...a) => fn(F, P, ...a), params };
}

// ---------- classification ----------

export function analyze(sources) {
  const lines = sources.map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Type a differential equation, e.g. y''+4y=0");
  const plains = lines.map(toPlain);

  // Primes are taken w.r.t. t, unless the equation is clearly in x (e.g. Airy: y'' = xy)
  const ids = new Set(plains.join(' ').match(/[a-zA-Z][\w@]*/g));
  const wrt = new Set([...ids].flatMap(id => /__([a-z]+)$/.exec(id)?.[1].split('') ?? []));
  const indep = wrt.size ? (wrt.has('t') ? 't' : [...wrt][0])
    : !ids.has('t') && ids.has('x') && ![...ids].some(id => id.startsWith('x__')) ? 'x' : 't';

  const eqs = plains.map(p => {
    const sides = p.replace(/@/g, indep).split(/(?<![<>!=])=(?!=)/);
    if (sides.length > 2) throw new Error('Use one "=" per equation');
    if (sides.some(s => !s.trim())) throw new Error('One side of the "=" is empty');
    return toJS(sides.length === 2 ? `(${sides[0]}) - (${sides[1]})` : sides[0]);
  });

  const ders = [...new Set(eqs.flatMap(e => [...e.sym]))]
    .map(id => /^(.+?)__([a-z]+)$/.exec(id)).filter(Boolean)
    .map(m => ({ id: m[0], base: m[1], wrt: m[2] }));
  if (!ders.length) throw new Error("No derivative found. Try y', \\frac{dy}{dt} or u_t");
  const letters = new Set(ders.flatMap(d => [...d.wrt]));
  return letters.size > 1 ? pde(eqs, ders) : ode(eqs, ders, [...letters][0]);
}

// The equations are linear in the unknowns' highest derivatives h: G(h) = A·h + b, with b = G(0) and column j of A
// = G(e_j) − b. Gauss–Jordan solves A·h = −b, so coupled systems (double pendulum: θ″ and φ″ in both equations) just work.
export function solveLinear(cols, b) {
  const n = b.length, M = b.map((bi, i) => [...cols.map(c => c[i] - bi), -bi]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]); // a singular system gives NaN, which stops the run as "blew up"
}

function ode(eqs, ders, indep) {
  const vars = [...new Set(ders.map(d => d.base))];
  const order = Object.fromEntries(vars.map(v => [v, Math.max(...ders.filter(d => d.base === v).map(d => d.wrt.length))]));
  if (eqs.length !== vars.length) {
    throw new Error(`${eqs.length} equation${eqs.length > 1 ? 's' : ''} for ${vars.length} unknown${vars.length > 1 ? 's' : ''} (${vars.join(', ')})`);
  }
  const dname = (v, k) => (k ? `${v}__${indep.repeat(k)}` : v);
  const top = v => dname(v, order[v]);
  const state = vars.flatMap(v => Array.from({ length: order[v] }, (_, k) => dname(v, k)));

  const reserved = new Set([...state, ...vars.map(top), indep]);
  const params = [...new Set(eqs.flatMap(e => [...e.sym]))].filter(s => !reserved.has(s));

  const hs = vars.map(v => '$' + top(v)), all = `[${eqs.map(e => e.js).join(',')}]`;
  const body = [
    declParams(params),
    `const $${indep} = t;`,
    ...state.map((s, k) => `const $${s} = Y[${k}];`),
    `let ${hs.map(h => `${h} = 0`).join(', ')};`,
    ...vars.flatMap(v => Array.from({ length: order[v] - 1 }, (_, k) => `dY[${state.indexOf(dname(v, k))}] = $${dname(v, k + 1)};`)),
    `const b = ${all};`,
    ...hs.map((h, j) => `${h} = 1; const c${j} = ${all}; ${h} = 0;`),
    `const h = solve([${hs.map((_, j) => `c${j}`).join(',')}], b);`,
    ...vars.map((v, j) => `dY[${state.indexOf(dname(v, order[v] - 1))}] = h[${j}];`),
  ].join('\n');
  const fn = new Function('F', 'solve', 'P', 't', 'Y', 'dY', body);

  const n = state.length;
  const pick = k => (vars.length >= k ? vars.slice(0, k) : state.slice(0, k)).map(s => state.indexOf(s));
  const angle = /^(theta|vartheta|phi|varphi)$/.test(vars[0]) || eqs.some(e => /F\.(sin|cos)\(\$/.test(e.js));
  const views = [];
  if (vars.length === 1 && order[vars[0]] === 2) views.push(...(angle ? ['pendulum', 'spring'] : ['spring', 'pendulum']));
  if (vars.length === 2 && vars.every(v => order[v] === 2) && angle) views.push('pendulum2');
  if (n === 1) views.push('level');
  if (n >= 2) views.push('phase');
  if (n >= 3) views[vars.length === 3 || (vars.length === 1 && n === 3) ? 'unshift' : 'push']('attractor');
  views.push('timeline');

  const ord = ['', '1st', '2nd', '3rd'][Math.max(...Object.values(order))] ?? `${Math.max(...Object.values(order))}th`;
  return {
    kind: 'ode', indep, vars, order, state, params, views,
    deriv: (P, t, Y, dY) => fn(F, solveLinear, P, t, Y, dY),
    coords: { phase: pick(2), attractor: pick(3), uniform: vars.length >= 2 },
    label: vars.length > 1 ? `ODE system · ${vars.length} unknowns · ${vars.join(', ')}(${indep})` : `ODE · ${ord} order · ${vars[0]}(${indep})`,
  };
}

const SPACE = /^(x{1,4}|y{1,4}|xy)$/;

// One or more fields (u, v, …), each evolved by the equation holding its time derivative (u_t or u_tt).
// With no time derivative at all (2D, e.g. Laplace/Poisson) the field relaxes to the steady state instead:
// u_t = ±G with the sign that makes the leading spatial term diffusive, so the run converges to G = 0.
function pde(eqs, ders) {
  if (ders.some(d => d.wrt.includes('t') && /[xy]/.test(d.wrt))) throw new Error("Mixed time–space derivatives (like u_xt) aren't supported");
  const timeOrder = b => Math.max(0, ...ders.filter(d => d.base === b && /^t+$/.test(d.wrt)).map(d => d.wrt.length));
  const bases = [...new Set(ders.map(d => d.base))], steady = bases.every(b => !timeOrder(b));
  let fields;
  if (steady) {
    if (eqs.length > 1 || bases.length > 1) throw new Error('A steady-state problem (no time derivative) needs a single equation in one field');
    fields = [{ name: bases[0], tOrder: 0, eq: eqs[0] }];
  } else {
    if (eqs.length !== bases.length) throw new Error(`${eqs.length} equation${eqs.length > 1 ? 's' : ''} for ${bases.length} fields (${bases.join(', ')})`);
    fields = eqs.map(e => {
      const own = bases.filter(b => timeOrder(b) && e.sym.has(`${b}__${'t'.repeat(timeOrder(b))}`));
      if (own.length !== 1) throw new Error('Each equation should give the time derivative of one field, e.g. u_t = … and v_t = …');
      return { name: own[0], tOrder: timeOrder(own[0]), eq: e };
    });
    if (new Set(fields.map(f => f.name)).size < fields.length) throw new Error("Two equations give the same field's time derivative");
  }
  if (fields.some(f => f.tOrder > 2)) throw new Error('Time derivatives up to u_tt are supported');
  const space = [...new Set(ders.filter(d => !d.wrt.includes('t')).map(d => d.wrt))];
  const bad = space.find(w => !SPACE.test(w) || /[^xy]/.test(w));
  if (bad) throw new Error(`Unsupported derivative _${bad}. Use x and y up to 4th order`);
  const dims = space.some(w => w.includes('y')) ? 2 : 1;
  const ids = new Set(ders.map(d => d.id));
  const reserved = new Set(['t', 'x', ...(dims === 2 ? ['y'] : []), ...fields.map(f => f.name), ...ids]);
  const params = [...new Set(eqs.flatMap(e => [...e.sym]))].filter(s => !reserved.has(s));

  // g: padded grid { NX, NY, W, GY, L, x0, dx, y0, dy }; off[name]: where a field's values start in S (its ∂ₜ follows L later)
  const kernel = (g, off) => {
    const decl = fields.flatMap(f => [
      `const $${f.name} = S[k+${off[f.name]}];`,
      f.tOrder === 2 ? `const $${f.name}__t = S[k+${off[f.name] + g.L}];` : '',
      ...space.filter(w => ids.has(`${f.name}__${w}`)).map(w => `let $${f.name}__${w} = ${stencil(w, g, off[f.name])};`),
    ]);
    const solve = fields.map(f => {
      if (!f.tOrder) {
        const lead = ['xx', 'yy', 'xxxx', 'yyyy'].find(w => ids.has(`${f.name}__${w}`)), tok = `$${f.name}__${lead}`;
        return `{ const g0 = ${f.eq.js}; ${tok} += 1; const c = (${f.eq.js}) - g0; ${tok} -= 1; OUT[k+${off[f.name]}] = (c > 0 ? ${lead.length === 2 ? 1 : -1} : ${lead.length === 2 ? -1 : 1}) * g0; }`;
      }
      const H = `$${f.name}__${'t'.repeat(f.tOrder)}`, out = off[f.name] + (f.tOrder === 2 ? g.L : 0);
      return `{ let ${H} = 0; const g0 = ${f.eq.js}; ${H} = 1; OUT[k+${out}] = -g0 / ((${f.eq.js}) - g0); }`;
    });
    const body = `${declParams(params)}
const $t = t;
for (let j = 0; j < ${g.NY}; j++) {
  ${dims === 2 ? `const $y = ${g.y0} + j * ${g.dy};` : ''}
  for (let i = 0; i < ${g.NX}; i++) {
    const k = (j + ${g.GY}) * ${g.W} + i + 2;
    const $x = ${g.x0} + i * ${g.dx};
    ${decl.filter(Boolean).join('\n    ')}
    ${solve.join('\n    ')}
  }
}`;
    const fn = new Function('F', 'P', 't', 'S', 'OUT', body);
    return (P, t, S, OUT) => fn(F, P, t, S, OUT);
  };

  const u = fields[0].name, names = fields.map(f => f.name).join(', ');
  // a field driven by another field's spatial derivatives (Schrödinger's u_t = −βv_xx) behaves like a wave, not diffusion
  const cross = fields.some(f => [...f.eq.sym].some(s => /__[xy]+$/.test(s) && !s.startsWith(`${f.name}__`)));
  const kind = steady ? 'steady state' : fields.some(f => f.tOrder === 2) || cross ? 'wave-type'
    : space.some(w => w.length % 2 === 0) ? (fields.length > 1 ? 'reaction–diffusion' : 'diffusion-type') : 'transport-type';
  const where = `${dims === 2 ? 'x,y' : 'x'}${steady ? '' : ',t'}`;
  return {
    kind: 'pde', u, tOrder: fields[0].tOrder, fields: fields.map(({ name, tOrder }) => ({ name, tOrder })), steady, dims, space, params, kernel,
    views: [dims === 2 ? 'surface' : 'profile', 'timeline'],
    label: fields.length > 1 ? `PDE system · ${kind} · ${names}(${where}) · showing ${u}` : `PDE · ${kind} · ${u}(${where})`,
  };
}

// 2nd-order central differences on a grid padded with 2 ghost cells; the field's values start at S[off]
function stencil(w, g, off) {
  const W = g.W;
  if (w === 'xy') return `(S[k+${off + W + 1}]-S[k+${off + W - 1}]-S[k+${off - W + 1}]+S[k+${off - W - 1}])*${1 / (4 * g.dx * g.dy)}`;
  const s = w[0] === 'x' ? 1 : W, h = w[0] === 'x' ? g.dx : g.dy;
  const at = o => `S[k+${off + o * s}]`;
  return [
    `(${at(1)}-${at(-1)})*${1 / (2 * h)}`,
    `(${at(1)}-2*${at(0)}+${at(-1)})*${1 / h ** 2}`,
    `(${at(2)}-2*${at(1)}+2*${at(-1)}-${at(-2)})*${1 / (2 * h ** 3)}`,
    `(${at(2)}-4*${at(1)}+6*${at(0)}-4*${at(-1)}+${at(-2)})*${1 / h ** 4}`,
  ][w.length - 1];
}
