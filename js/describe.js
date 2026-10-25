// Plain-English description → equations, as an example-shaped object the app loads like any example.
// It looks for what the system is (a spring, an epidemic, heat in a rod…), modifiers (friction, a periodic push,
// insulated ends…) and numbers with units ("2 kg", "every 3 seconds", "30 degrees"). Runs in the browser:
// no AI, no network. Returns null when it can't tell which system is meant.
import { PRESETS } from './presets.js';

const R = String.raw;
const N = String.raw`(-?\d+(?:\.\d+)?)`;
const example = name => PRESETS.find(p => p.name === name);
const fmt = v => String(+v.toPrecision(3));

// ---- numbers: the first match of each pattern wins
const QUANTITIES = {
  mass: [`${N}\\s*(?:kg|kilo)`, `mass (?:of |is |= ?)?${N}`],
  length: [`${N}\\s*(?:m|meters?|metres?)\\b(?!\\s*/)`, `length (?:of |is |= ?)?${N}`],
  k: [`(?:spring constant|stiffness)(?: of| is| =)?\\s*${N}`],
  damping: [`(?:damping|friction|drag)(?: coefficient)?(?: of| is| =)\\s*${N}`],
  period: [`every\\s*${N}\\s*(?:s|secs?|seconds?)\\b`, `period (?:of |is |= ?)?${N}`],
  hz: [`${N}\\s*hz\\b`],
  angle: [`${N}\\s*(?:°|degrees?\\b|deg\\b)(?!\\s*(?:c|celsius|f)\\b)`],
  percent: [`${N}\\s*%`],
  capacity: [`(?:carrying capacity|capacity|maximum|limit)(?: of| is| =| at)?\\s*${N}`],
  start: [`(?:start(?:s|ing)? (?:with|at)|initial(?:ly)?(?: value| population| amount)?(?: of| is| at| =)?)\\s*${N}`],
  halfLife: [`half[- ]life (?:of |is )?${N}`],
  recover: [`recover(?:s|y)?\\s*(?:in|after|within|takes)\\s*${N}\\s*days?`],
  r0: [`r0(?: of| is| =)?\\s*${N}`],
  speed: [`(?:speed|velocity|moving at|flows? at)(?: of| is| =)?\\s*${N}`],
  ohm: [`${N}\\s*(?:ohms?|Ω)`],
  farad: [`${N}\\s*farads?`],
  henry: [`${N}\\s*henr(?:y|ies)`],
  volt: [`${N}\\s*(?:v|volts?)\\b`],
  ambient: [`(?:room|air|surround\\w*|ambient|outside|environment)[^\\d-]{0,20}${N}`],
};
const GREEK_NAMES = 'alpha|beta|gamma|delta|epsilon|kappa|lambda|mu|nu|omega|rho|sigma|tau';

function readNumbers(s) {
  const n = {};
  for (const [key, pats] of Object.entries(QUANTITIES)) {
    for (const p of pats) {
      const m = new RegExp(p, 'i').exec(s);
      if (m) { n[key] = +m[1]; break; }
    }
  }
  n.temps = [...s.matchAll(new RegExp(`${N}\\s*(?:°\\s*c?|degrees?(?:\\s*c(?:elsius)?)?)`, 'gi'))].map(m => +m[1]);
  if (n.hz) n.omega = 2 * Math.PI * n.hz;
  else if (n.period) n.omega = 2 * Math.PI / n.period;
  // "k = 4", "omega = 2": named values go straight to parameters
  n.named = Object.fromEntries([...s.matchAll(new RegExp(`\\b(${GREEK_NAMES}|[a-zA-Z](?:_\\w+)?)\\s*=\\s*${N}`, 'g'))].map(m => [m[1], +m[2]]));
  return n;
}

// ---- modifiers
const MOD = {
  damped: /friction|damp|drag|air resistance|resistan|viscous|slows?(?:ing)? down|dies? (?:out|down)|los(?:es|ing) energy|in (?:water|oil|honey|syrup)/,
  driven: /driven|forc(?:ed|ing)|push(?:ed|es|ing)?|shak(?:en|es|ing)|periodic(?:ally)?|external force|kick(?:ed|s)?|motor|wiggl/,
  nonlinear: /nonlinear|non-linear|hardening|stiff(?:ening)? spring|duffing|large (?:swings?|amplitudes?)/,
  small: /small[- ](?:angle|swing|oscillation)s?|linear(?:ized|ised)?\b/,
  twoD: /\b2d\b|two[- ]dimension|plate|sheet|slab|square|membrane|drum|surface|pond|pool|trampoline|room|\bpan\b|disk|disc|tabletop|floor/,
  insulated: /insulat/,
  ring: /\bring\b|loop|circular|around a circle|periodic boundar/,
  limited: /limit|capacity|resources|logistic|crowd|max(?:imum)?|saturat|levels? off/,
  harvest: /harvest|fishing|hunt|cull|remov(?:e|ed|al)|caught/,
  noImmunity: /no immunity|re-?infect|\bsis\b|los(?:e|es|ing) immunity/,
  ac: /\bac\b|alternating|sinusoid|driven|forced|signal|oscillating (?:source|voltage)/,
  nearEnd: /near (?:the|one) end|close to (?:the|an) end|off[- ]cent(?:er|re)|edge/,
  oneEnd: /one end|left end|end (?:is|being) (?:heated|hot|warm)|heated (?:at|from) (?:one|the) end|hot end/,
  slowFall: /honey|syrup|oil|water|linear drag|stokes|slowly/,
};

// ---- systems, most specific first; each build returns { name, notes, eqs, params, ic, bc?, domain?, view? }
const as = (name, notes = [], extra = {}) => ({ ...structuredClone(example(name)), name, notes, ...extra });

const SYSTEMS = [
  { re: /circuit|capacitor|inductor|resistor|\brc\b|\brlc\b|\blc\b/, build: circuit },
  { re: /quantum|electron|schr[öo]dinger|wave ?function|tunnel/, build: () => as('Quantum tunneling', ['ψ = u + iv, showing u']) },
  { re: /turing|pattern|spots|stripes|zebra|leopard|gray[- ]scott|reaction[- ]diffusion|coral/, build: () => as('Turing patterns') },
  { re: /soliton|\bkdv\b|korteweg|canal|shallow water/, build: () => as('KdV solitons') },
  { re: /traffic|shock ?wave|burgers|cars? (?:on|in) (?:a|the) (?:road|highway|lane)/, build: () => as('Burgers shock') },
  { re: /kuramoto|sivashinsky|flame front|turbulen/, build: () => as('Kuramoto–Sivashinsky') },
  { re: /electric potential|electrostatic|potential (?:field|around)|charges?\b|poisson/, build: () => as('Electric potential') },
  { re: /(?:steady|equilibrium|long[- ]term|final|eventual)\s+(?:temperature|heat|state)|laplace/, build: () => as('Steady heat (Laplace)', ['steady state, top edge hot']) },
  // a small object cooling as a whole is Newton's law, not heat spreading through a body
  { re: /coffee|\btea\b|\bcup\b|\bmug\b|soup|thermometer|newton'?s law|\bcake\b|turkey|body temperature/, build: cooling },
  { re: /(?:heat|temperature|warm|cool|diffus|conduct)/, and: /\b(?:rod|bar|wire|pipe|beam|stick|poker|plate|sheet|slab|pan|square|metal|surface|disk|disc|tabletop|floor)\b/, build: heat },
  { re: /pollut|river|\bdye\b|smoke|\bink\b|carried|drift|advect|spill/, build: (s, n) => as('Pollutant in a river', [], speedParam(n, 'c')) },
  { re: /spread(?:ing|s)? (?:front|fire|invasion)|invasive|fisher|wave of advance|forest fire|\bgene\b/, build: () => as('Fisher–KPP front') },
  { re: /phase separat|alloy|domains?\b|allen|cahn|oil and water|demix/, build: () => as('Phase separation') },
  { re: /\bstring|guitar|violin|piano|cello|pluck|drum|membrane|trampoline|ripple|pond|pool|water surface|\bwaves?\b/, build: wave },
  { re: /double pendulum|two pendul|pendulum (?:on|hanging from|attached to) (?:a|another) pendulum/, build: (s, n) => as('Double pendulum', [], n.angle ? { ic: { theta: fmt(rad(n.angle)), theta__t: '0', phi: fmt(rad(n.angle) * 1.2), phi__t: '0' } } : {}) },
  { re: /pendulum|\bswing\b|clock bob/, build: pendulum },
  { re: /coupled (?:springs?|oscillat|mass)|two masses|masses (?:connected|linked|joined)/, build: () => as('Coupled oscillators') },
  { re: /epidemic|infect|disease|virus|\bflu\b|covid|outbreak|contagio|\bsir\b|\bsis\b|pandemic/, build: epidemic },
  { re: /predator|prey|fox(?:es)?|wolves|wolf|lynx|hares?\b|sharks?/, build: () => as('Predator–prey') },
  { re: /neuron|nerve|spik(?:e|ing)|action potential|heart ?beat|excitable/, build: () => as('Neuron spikes') },
  { re: /oscillating (?:chemical )?reaction|brusselator|belousov|chemical clock/, build: () => as('Brusselator reaction') },
  { re: /radioactiv|decay|half[- ]life|isotope|drug (?:in|leaving)|medicine|caffeine/, build: decay },
  { re: /population|bacteria|\bcells\b|species|rabbits?|\bfish\b|\bdeer\b|people|\bgrow/, build: population },
  { re: /cool|warm(?:s|ing)? up|oven|\bice\b/, build: cooling },
  { re: /fall(?:s|ing)?\b|drop(?:ped|s)?\b|skydiv|parachut|terminal velocity/, build: falling },
  { re: /orbit|planet|satellite|comet|\bmoon\b|kepler/, build: orbit },
  { re: /r[öo]ssler/, build: () => as('Rössler attractor') },
  { re: /lorenz|weather|convection|butterfly|chao/, build: () => as('Lorenz attractor') },
  { re: /duffing|double[- ]well/, build: () => as('Duffing oscillator') },
  { re: /van der pol|self[- ]sustain|limit cycle/, build: () => as('Van der Pol') },
  { re: /spring|oscillat|mass on|bounc|shock absorber|harmonic|vibrat|suspension|bungee/, build: spring },
];

const rad = deg => (deg * Math.PI) / 180;
const speedParam = (n, name) => (n.speed ? { params: { ...example('Pollutant in a river').params, [name]: n.speed } } : {});

function spring(s, n, has) {
  const params = { m: n.mass ?? 1, k: n.k ?? 4 }, notes = [];
  let lhs = R`m\ddot{x}`, rhs = '0';
  if (has.damped) { lhs += R`+c\dot{x}`; params.c = n.damping ?? 0.4; notes.push('friction'); }
  lhs += '+kx';
  if (has.nonlinear) { lhs += R`+\beta x^3`; params.beta = 1; notes.push('nonlinear spring'); }
  if (has.driven) { rhs = R`F_0\cos\left(\omega t\right)`; Object.assign(params, { F_0: 1, omega: n.omega ?? 2 }); notes.push(`pushed periodically (ω = ${fmt(params.omega)})`); }
  return { name: 'Mass on a spring', notes, eqs: [`${lhs}=${rhs}`], params, ic: { x: fmt(n.start ?? 1), x__t: '0' }, view: 'spring' };
}

function pendulum(s, n, has) {
  const params = { g: 9.81, L: n.length ?? 1 }, notes = [];
  let lhs = R`\ddot{\theta}`, rhs = '0';
  if (has.damped) { lhs += R`+b\dot{\theta}`; params.b = n.damping ?? 0.3; notes.push('friction'); }
  lhs += has.small ? R`+\frac{g}{L}\theta` : R`+\frac{g}{L}\sin\theta`;
  if (has.small) notes.push('small-angle approximation');
  if (has.driven) { rhs = R`A\cos\left(\omega t\right)`; Object.assign(params, { A: 1, omega: n.omega ?? Math.sqrt(9.81 / params.L) }); notes.push(`pushed periodically (ω = ${fmt(params.omega)})`); }
  const angle = n.angle !== undefined ? rad(n.angle) : 1;
  if (n.angle !== undefined) notes.push(`released from ${n.angle}°`);
  return { name: 'Pendulum', notes, eqs: [`${lhs}=${rhs}`], params, ic: { theta: fmt(angle), theta__t: '0' }, view: 'pendulum' };
}

function heat(s, n, has) {
  const twoD = has.twoD, notes = [twoD ? 'in 2D' : 'in 1D'];
  const bc = has.insulated ? 'free' : has.ring && !twoD ? 'periodic' : 'fixed';
  notes.push(bc === 'free' ? 'insulated edges' : bc === 'periodic' ? 'a closed loop' : 'edges held at their starting temperature');
  const u = twoD ? R`\left(\left|x\right|<0.3\right)\left(\left|y\right|<0.3\right)` : has.oneEnd ? R`e^{-40\left(x+1\right)^2}` : R`e^{-40x^2}`;
  if (has.oneEnd && !twoD) notes.push('heated at one end');
  return {
    name: twoD ? 'Heat in a plate' : 'Heat in a rod', notes,
    eqs: [twoD ? R`u_t=\alpha\left(u_{xx}+u_{yy}\right)` : R`u_t=\alpha u_{xx}`], params: { alpha: 0.02 }, ic: { u }, bc,
  };
}

function wave(s, n, has) {
  const twoD = has.twoD, pond = /pond|pool|ripple|water surface/.test(s), notes = [];
  const damped = has.damped || pond, lhs = damped ? R`u_{tt}+bu_t` : R`u_{tt}`;
  const params = { c: n.speed ?? 1, ...(damped ? { b: n.damping ?? 0.3 } : {}) };
  if (damped) notes.push(pond ? 'water losing energy' : 'friction');
  const at = has.nearEnd ? 0.6 : 0, u = twoD ? R`e^{-40\left(x^2+y^2\right)}` : R`e^{-80\left(x+${at}\right)^2}`;
  if (has.nearEnd && !twoD) notes.push('plucked near one end');
  return {
    name: twoD ? (pond ? 'Ripples on a pond' : 'Vibrating drum') : 'Vibrating string', notes,
    eqs: [twoD ? R`${lhs}=c^2\nabla^2u` : R`${lhs}=c^2u_{xx}`], params, ic: { u, u__t: '0' }, bc: pond ? 'free' : 'fixed',
  };
}

function epidemic(s, n, has) {
  const gamma = n.recover ? 1 / n.recover : 0.1, beta = n.r0 ? n.r0 * gamma : 0.5, notes = [];
  if (n.recover) notes.push(`recovery in ${n.recover} days (γ = ${fmt(gamma)})`);
  if (n.r0) notes.push(`R₀ = ${n.r0}`);
  const i0 = n.percent ? n.percent / 100 : 0.01;
  if (has.noImmunity) {
    notes.push('no lasting immunity (SIS)');
    return { name: 'SIS epidemic', notes, eqs: [R`S'=-\beta SI+\gamma I`, R`I'=\beta SI-\gamma I`], params: { beta, gamma }, ic: { S: fmt(1 - i0), I: fmt(i0) }, view: 'timeline' };
  }
  return { ...as('SIR epidemic', notes), params: { beta, gamma }, ic: { S: fmt(1 - i0), I: fmt(i0), R: '0' } };
}

function decay(s, n) {
  const lambda = n.halfLife ? Math.LN2 / n.halfLife : 0.3, notes = n.halfLife ? [`half-life ${n.halfLife} (λ = ${fmt(lambda)})`] : [];
  return { name: 'Exponential decay', notes, eqs: [R`N'=-\lambda N`], params: { lambda }, ic: { N: fmt(n.start ?? 100) }, view: 'timeline' };
}

function population(s, n, has) {
  const r = n.percent ? n.percent / 100 : 0.8, notes = [], params = { r };
  let eq = has.limited ? R`P'=rP\left(1-\frac{P}{K}\right)` : R`P'=rP`;
  notes.push(has.limited ? 'limited resources (logistic)' : 'unlimited growth');
  if (has.limited) params.K = n.capacity ?? 10;
  if (has.harvest) { eq += '-h'; params.h = 0.5; notes.push('harvesting'); }
  return { name: 'Population', notes, eqs: [eq], params, ic: { P: fmt(n.start ?? (has.limited ? params.K / 20 : 1)) } };
}

function circuit(s, n, has) {
  const rlc = /inductor|coil|\brlc\b|\blc\b/.test(s), notes = [rlc ? 'RLC' : 'RC'], src = has.ac ? R`V_0\cos\left(\omega t\right)` : 'V_0';
  if (has.ac) notes.push('alternating source');
  const params = { R: n.ohm ?? (rlc ? 0.3 : 1), C: n.farad ?? (rlc ? 0.25 : 0.5), V_0: n.volt ?? 5, ...(rlc ? { L: n.henry ?? 1 } : {}), ...(has.ac ? { omega: n.omega ?? 2 } : {}) };
  return rlc
    ? { name: 'RLC circuit', notes, eqs: [R`L\ddot{q}+R\dot{q}+\frac{q}{C}=${src}`], params, ic: { q: '0', q__t: '0' }, view: 'timeline' }
    : { name: 'RC circuit', notes, eqs: [R`RC\frac{dV}{dt}+V=${src}`], params, ic: { V: '0' } };
}

function cooling(s, n) {
  const [first, second] = n.temps, ambient = n.ambient ?? second ?? 20, start = first ?? 90;
  return { ...as("Newton's cooling", [`from ${start}° in surroundings at ${ambient}°`]), params: { k: 0.2, T_a: ambient }, ic: { T: fmt(start) } };
}

function falling(s, n, has) {
  const linear = has.slowFall, params = { g: 9.81, k: 0.25, m: n.mass ?? 1 };
  return {
    name: 'Falling with drag', notes: [linear ? 'drag ∝ v (slow, thick fluid)' : 'drag ∝ v² (air)'],
    eqs: [linear ? R`\frac{dv}{dt}=g-\frac{k}{m}v` : R`\frac{dv}{dt}=g-\frac{k}{m}v^2`], params, ic: { v: '0' }, view: 'timeline',
  };
}

function orbit(s) {
  const speed = /escape/.test(s) ? 1.5 : /circular/.test(s) ? 1 : 1.2;
  return as('Kepler orbit', [speed === 1.5 ? 'escape speed' : speed === 1 ? 'circular orbit' : 'elliptical orbit'], { ic: { x: '1', x__t: '0', y: '0', y__t: fmt(speed) } });
}

export function describe(text) {
  const s = text.toLowerCase();
  const sys = SYSTEMS.find(x => x.re.test(s) && (!x.and || x.and.test(s)));
  if (!sys) return null;
  const n = readNumbers(text), has = Object.fromEntries(Object.entries(MOD).map(([k, re]) => [k, re.test(s)]));
  const p = sys.build(s, n, has);
  p.params = { ...p.params, ...n.named };
  return p;
}

export const DESCRIBE_HINTS = ['a pendulum with friction, pushed every 2 seconds', 'heat in an insulated metal rod',
  'a guitar string plucked near the end', 'a flu outbreak where people recover in 7 days', 'coffee at 90 degrees in a 20 degree room',
  'rabbits growing 5% a year with a carrying capacity of 500', 'zebra stripe patterns'];
