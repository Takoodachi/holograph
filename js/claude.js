// Optional Claude mode for "Describe it": free-form descriptions the built-in reader (describe.js) can't place.
// Runs in the browser with the user's own Anthropic key; the page has no server. Claude's answer is untrusted, so it
// goes through the same parser as typed equations before the app loads it, with one retry that shows Claude the error.
import { analyze, compileExpr } from './parse.js';
import { PRESETS } from './presets.js';

export const MODEL = 'claude-opus-5-5';

const EXAMPLES = ['Damped spring', 'Double pendulum', "Newton's cooling", 'Plucked string', 'Turing patterns', 'Steady heat (Laplace)', 'KdV solitons']
  .map(name => { const { group, ...p } = PRESETS.find(x => x.name === name); return p; });

const SYSTEM = String.raw`You turn a plain-English description of a physical or dynamical system into one simulation for Holograph, a browser app that solves ODEs and PDEs and animates them.

Answer with the JSON schema you are given:
- name: a short title, e.g. "Ball in a bowl".
- notes: a few short phrases naming your modelling choices and assumptions, e.g. "bowl shape y = x²/2", "light friction b = 0.2".
- eqs: the equations, one per entry, in LaTeX as MathLive writes it.
- params: a value for every parameter the equations and initial conditions use, and nothing else.
- ic: starting values, keyed by state name (see below).
- bc, domain: PDEs only. view: optional.

How the app reads LaTeX:
- Time is t. Time derivatives: \dot{x}, \ddot{x}, x', x'', \frac{dx}{dt}, \frac{d^2x}{dt^2}.
- Adjacent letters multiply: "kx" is k·x and "mg" is m·g. A name is one letter, a Greek letter command (\theta, \omega), or a letter or Greek letter with a subscript (k_1, T_a, F_0, \rho_0). Never use multi-letter names like "mass" or "Ta", and never use \text{}.
- Functions: \sin \cos \tan \sinh \cosh \tanh \exp \ln \log \sqrt{} \arctan, powers ^{...}, e^{...}, \pi, |x| for absolute value. A comparison is 1 or 0, so \left(\left|x\right|<0.3\right) is a step shape. Use \left( \right) or plain parentheses and \frac{a}{b}.
- One "=" per equation.

ODEs:
- One equation per unknown, any order. The equations must be linear in each unknown's highest derivative (that derivative may be multiplied by expressions in the other variables, as in the double pendulum), because the app solves for those derivatives.
- State names for ic: each unknown and its derivatives below the highest order, written name__t, name__tt. A second-order x has x and x__t; a second-order \theta has theta and theta__t; a first-order N has just N. ic values are numbers (LaTeX like 0.5\pi is fine).

PDEs:
- Fields like u(x,t) in 1D or u(x,y,t) in 2D. Partial derivatives are subscripts: u_t, u_{tt}, u_x, u_{xx}, u_{xxx}, u_{xxxx}, u_y, u_{yy}, u_{xy}, and \nabla^2u for u_{xx}+u_{yy}.
- Each equation contains exactly one field's time derivative, u_t or u_{tt} (at most second order in time); for several fields write one equation per field (v_t = …, u_t = …). The first field is the one shown. No mixed time-space derivatives such as u_{xt}.
- A 2D equation with no time derivative (u_{xx}+u_{yy}=0, \nabla^2u=f(x,y)) is a steady state: one equation, one field. The app relaxes it, and its ic is the boundary values and starting guess.
- ic keys: the field's name (u) as a LaTeX expression in x (and y), plus u__t when the equation has u_{tt}.
- domain: [start, end] for x (and y: 2D is square). Default [-1, 1]. The grid has 241 points in 1D and 81×81 in 2D, so keep features wider than about 1/40 of the domain.
- bc: "fixed" (edges keep their starting values), "free" (zero slope at the edges, insulated) or "periodic".

Views (pick one that fits, or omit and the app chooses):
- spring: one second-order unknown, shown as a mass on a spring. pendulum: one second-order angle. pendulum2: two second-order angles, a double pendulum.
- level: one first-order quantity (a tank, a population, a temperature). phase: two-state phase plane. attractor: 3D trajectory, three or more states.
- profile: 1D PDE. surface: 2D PDE. timeline: anything, plotted against time.

Choose parameter values that make the behaviour visible within about 20 time units and keep numbers moderate. Prefer the simplest model that captures the description. If it is not a dynamical system, build the closest simple one and say so in notes.

Valid examples (in the app's own format: your params and ic are lists of the same entries):
${JSON.stringify(EXAMPLES)}`;

const entries = (key, value, type) => ({
  type: 'array',
  items: { type: 'object', additionalProperties: false, required: [key, value], properties: { [key]: { type: 'string' }, [value]: { type } } },
});
// structured outputs need additionalProperties: false, so the maps params{} and ic{} travel as lists of entries
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'notes', 'eqs', 'params', 'ic'],
  properties: {
    name: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
    eqs: { type: 'array', items: { type: 'string' } },
    params: entries('name', 'value', 'number'),
    ic: entries('key', 'latex', 'string'),
    bc: { type: 'string', enum: ['fixed', 'free', 'periodic'] },
    domain: { type: 'array', items: { type: 'number' } },
    view: { type: 'string', enum: ['spring', 'pendulum', 'pendulum2', 'level', 'phase', 'attractor', 'profile', 'surface', 'timeline'] },
  },
};

// Claude's answer → an example-shaped object, checked by the app's own parser. Throws with a message Claude can act on.
export function toPreset(out) {
  const p = {
    name: String(out.name || 'Described system'), notes: (out.notes ?? []).map(String), eqs: out.eqs ?? [],
    params: Object.fromEntries((out.params ?? []).map(e => [e.name, e.value])),
    ic: Object.fromEntries((out.ic ?? []).map(e => [e.key, e.latex])),
  };
  const m = analyze(p.eqs);
  const keys = m.kind === 'pde' ? m.fields.flatMap(f => (f.tOrder === 2 ? [f.name, `${f.name}__t`] : [f.name])) : m.state;
  const used = new Set(m.params);
  for (const [k, latex] of Object.entries(p.ic)) {
    if (!keys.includes(k)) throw new Error(`ic has "${k}", but the state names are ${keys.join(', ')}`);
    try { compileExpr(latex, m.kind === 'pde' ? ['x', 'y'] : []).params.forEach(s => used.add(s)); } catch (e) { throw new Error(`ic ${k} = ${latex}: ${e.message}`); }
  }
  // an unused entry is harmless and dropped; a misspelt name ("Ta" for T_a) shows up as a used one with no value
  p.params = Object.fromEntries(Object.entries(p.params).filter(([k]) => used.has(k)));
  const missing = [...used].filter(k => !Number.isFinite(p.params[k]));
  if (missing.length) throw new Error(`No numeric value for ${missing.join(', ')}. The app reads these parameters: ${[...used].join(', ')}`);
  if (m.kind === 'pde') {
    if (out.bc) p.bc = out.bc;
    if (out.domain) {
      const [a, b] = out.domain;
      if (out.domain.length !== 2 || !(a < b) || !Number.isFinite(a + b)) throw new Error('domain must be [start, end] with start < end');
      p.domain = [a, b];
    }
  }
  if (m.views.includes(out.view)) p.view = out.view;
  return p;
}

// SDK errors carry the HTTP status; turn the common ones into something a user can act on
function apiMessage(e) {
  if (e.status === 401) return 'Anthropic rejected the API key. Check it in Settings.';
  if (e.status === 403) return `This API key can't use ${MODEL}.`;
  if (e.status === 429) return 'Your Anthropic key hit its rate limit. Wait a minute and try again.';
  if (e.status >= 500) return 'Claude is busy right now. Try again in a moment.';
  if (e.status) return `Anthropic API error ${e.status}: ${e.error?.error?.message ?? e.message}`;
  return "Couldn't reach the Anthropic API. Check your connection.";
}

async function ask(client, content) {
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }],
      // thinking is always on (adaptive) for this model; effort sets how hard it thinks
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // a safety decline re-runs on a fallback model
    });
  } catch (e) {
    throw new Error(apiMessage(e));
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to build that one. Try describing it differently.');
  if (res.stop_reason === 'max_tokens') throw new Error("Claude's answer was cut off. Try a shorter description.");
  return JSON.parse(res.content.find(b => b.type === 'text').text);
}

// Describe → example-shaped object. client is injectable for tests; the SDK loads only on first use.
export async function buildWithClaude(text, { apiKey, client } = {}) {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true }); // the user's own key, kept in their browser
  }
  let prompt = text, out;
  for (let attempt = 0; attempt < 2; attempt++) {
    out = await ask(client, prompt);
    try {
      return toPreset(out);
    } catch (e) {
      if (attempt) throw new Error(`Claude's equations didn't parse: ${e.message}`);
      prompt = `${text}\n\nYour previous answer was:\n${JSON.stringify(out)}\n\nThe app rejected it: ${e.message}\nFix that and answer again.`;
    }
  }
}
