# Holograph

Type a differential equation and watch it move. Holograph turns ODEs and PDEs into hologram-style physical models: springs, pendulums, orbits, strings, membranes and heated plates.

**Live site:** https://takoodachi.github.io/holograph/

## Using it

- Type plain text (`y''+4y=0`, `u_t = u_xx`) or paste LaTeX (`\frac{d^2\theta}{dt^2}`, `\frac{\partial u}{\partial t}`, `\nabla^2 u`).
- Any other letter (`k`, `\omega`, `k_1`) becomes a slider, like in Desmos.
- Put one equation per row to make a system (Lorenz, predator–prey, Kepler).
- Holograph detects the equation type and picks a picture for it:

| Equation | Picture |
|---|---|
| 2nd-order ODE | mass on a spring or a pendulum |
| 1st-order ODE | liquid level in a tank |
| 2 unknowns | phase plane with a flowing vector field |
| 3 unknowns | 3D trajectory |
| 1D PDE (`u_t`, `u_tt`) | string or rod with its recent history |
| 2D PDE | wireframe membrane or plate |

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

The tests cover the equation reader (every notation and every example) and the solvers, including physics checks: an oscillator's period, the exact heat decay rate, 2D wave stability and periodic advection.

## How it works

- `js/parse.js` converts LaTeX or plain text into a classified model and compiles it to fast JavaScript.
- `js/solver.js` runs RK4. Each step size is set from a power-iteration estimate of the system's stiffness. PDEs use finite differences with ghost cells for the boundary conditions.
- `js/scene.js` draws the three.js hologram stage and the physical views.
- `js/app.js` handles the editor, sliders and playback. `js/presets.js` holds the examples.

Known limits: no steady-state (elliptic) PDEs, no systems of PDEs, and no complex-valued equations.
