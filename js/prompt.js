// What every AI provider is told and must return. Shared by the browser (ai.js) and the free Qwen Worker (worker/),
// so it has no browser-only imports.
import { PRESETS } from './presets.js';

const EXAMPLES = ['Damped spring', 'Double pendulum', "Newton's cooling", 'Plucked string', 'Turing patterns', 'Steady heat (Laplace)', 'KdV solitons']
  .map(name => { const { group, ...p } = PRESETS.find(x => x.name === name); return p; });

export const SYSTEM = String.raw`You turn a plain-English description of a physical or dynamical system into one simulation for Holograph, a browser app that solves ODEs and PDEs and animates them.

Answer with the JSON schema you are given:
- name: a short title, e.g. "Ball in a bowl".
- notes: a few short phrases naming your modelling choices and assumptions, e.g. "bowl shape y = x²/2", "light friction b = 0.2".
- eqs: the equations, one per entry, in LaTeX as MathLive writes it.
- params: a value for every parameter the equations and initial conditions use, and nothing else.
- ic: starting values, keyed by state name (see below).
- bc, domain: PDEs only; null for ODEs. view: null lets the app choose.

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

Views (pick one that fits, or null and the app chooses):
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
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
// Structured outputs need additionalProperties: false, so the maps params{} and ic{} travel as lists of entries.
// OpenAI's strict mode needs every field required, so the optional ones are nullable instead.
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'notes', 'eqs', 'params', 'ic', 'bc', 'domain', 'view'],
  properties: {
    name: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
    eqs: { type: 'array', items: { type: 'string' } },
    params: entries('name', 'value', 'number'),
    ic: entries('key', 'latex', 'string'),
    bc: nullable({ type: 'string', enum: ['fixed', 'free', 'periodic'] }),
    domain: nullable({ type: 'array', items: { type: 'number' } }),
    view: nullable({ type: 'string', enum: ['spring', 'pendulum', 'pendulum2', 'level', 'phase', 'attractor', 'profile', 'surface', 'timeline'] }),
  },
};
