# Holograph

Type a differential equation and watch it move. Holograph turns ODEs and PDEs into hologram-style physical models: springs, pendulums, orbits, strings, membranes and heated plates.

**Live site:** https://takoodachi.github.io/holograph/

## Using it

- **Describe it in words**, e.g. "a pendulum 2 m long released from 60°, with friction, pushed every 3 seconds" or "a flu outbreak where people recover in 7 days". Holograph builds the equations, starting values and parameters, and loads them for you to tweak. This runs in your browser with no AI service: it recognises about 30 kinds of system, modifiers such as friction, a periodic push, insulated ends or 2D, and numbers with units.
- Type plain text (`y''+4y=0`, `u_t = u_xx`) or paste LaTeX (`\frac{d^2\theta}{dt^2}`, `\frac{\partial u}{\partial t}`, `\nabla^2 u`).
- Any other letter (`k`, `\omega`, `k_1`) becomes a slider, like in Desmos.
- Put one equation per row to make a system:
  - ODEs (Lorenz, SIR, Kepler), including coupled ones where every equation holds several second derivatives, like the double pendulum;
  - PDEs with several fields (Turing patterns, quantum ψ = u + iv), where each equation gives one field's time derivative.
- A 2D PDE without a time derivative (Laplace, Poisson) is solved as a steady state: it relaxes until it stops changing.
- Over 30 examples, grouped: mechanics, chaos, life & chemistry, circuits & cooling, heat & diffusion, waves.
- Holograph detects the equation type and picks a picture for it:

| Equation | Picture |
|---|---|
| 2nd-order ODE | mass on a spring or a pendulum |
| two angles, 2nd order | double pendulum |
| 1st-order ODE | liquid level in a tank |
| 2 unknowns | phase plane with a flowing vector field |
| 3 unknowns | 3D trajectory |
| 1D PDE (`u_t`, `u_tt`) | string or rod with its recent history |
| 2D PDE | wireframe membrane or plate |
| any equation | **Time axis**: the solution against t, computed ahead into the far future |

The Time axis view runs a second copy of the simulation ahead of the live one. Its **condense** slider goes from a linear window (t from 0 to 20) to all of time squeezed onto the axis, with ∞ at the end. A motion that keeps going forever, like a limit cycle or chaos, shows as a band between its extremes; one that settles shows as a flat line. ODEs plot each unknown against t; PDEs show a space-time surface u(x, t), or the middle slice for 2D problems.

In the view:

- Drag to orbit, and use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move around.
- **Click the graph** to pin a live readout of the value there. <kbd>Esc</kbd> clears it.
- **2D** flattens the picture: a side view, top-down heatmap or flat phase portrait. The 3D trajectory has no 2D form, and the app says so.
- Drag the right edge of the equation panel to widen it. Its text and math grow with it, up to 40% of the window. Double-click the edge to reset.
- **Settings** (top right) holds every preference. Right now that's the look: Hologram, Plain (no glow effects) or Light (light background).

Press <kbd>Space</kbd> to pause and <kbd>R</kbd> to restart.

## Run locally

It's a static site with no build step. The libraries (three.js, MathLive, math.js) load from a CDN.

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Tests

```bash
npm install
npm test
```

The tests cover:

- the equation reader: every notation and every example;
- the describer;
- the solvers, with physics checks: an oscillator's period, the exact heat decay rate, 2D wave stability, periodic advection, the double pendulum against its closed form, Poisson against its exact solution, and Schrödinger conserving probability;
- a short run of every example at the app's grid size.

## How it works

- `js/parse.js` converts LaTeX or plain text into a classified model and compiles it to fast JavaScript. Equations are linear in their highest derivatives, so a small linear solve handles coupled systems.
- `js/solver.js` runs RK4. Each step size is set from a power-iteration estimate of the system's stiffness. PDEs use finite differences with ghost cells for the boundary conditions, and several fields share one state array.
- `js/describe.js` turns a description into equations, using a vocabulary of systems, modifiers and quantities with units.
- `js/scene.js` draws the three.js hologram stage and the physical views.
- `js/app.js` handles the editor, sliders and playback. `js/presets.js` holds the examples.

Known limits:

- Complex-valued equations have to be split into real and imaginary fields (see the quantum example).
- A PDE system shows its first field; reorder the equations to show another.
- Steady states are 2D only. A 1D steady state is an ODE in x.
