# Holograph

Type a differential equation and watch it move. Holograph turns ODEs and PDEs into hologram-style physical models: springs, pendulums, orbits, strings, membranes and heated plates.

**Live site:** https://takoodachi.github.io/holograph/

## Using it

- **Describe it in words**, e.g. "a pendulum 2 m long released from 60°, with friction, pushed every 3 seconds" or "a flu outbreak where people recover in 7 days". Holograph builds the equations, starting values and parameters, and loads them for you to tweak. This runs in your browser with no AI service: it recognises about 30 kinds of system, modifiers such as friction, a periodic push, insulated ends or 2D, and numbers with units. For anything else, add your own Anthropic API key and Claude builds it (see [Claude mode](#claude-mode-optional)).
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
- **Settings** (top right) holds every preference: the look (Hologram, Plain with no glow effects, or Light with a light background) and the optional Anthropic API key.

Press <kbd>Space</kbd> to pause and <kbd>R</kbd> to restart.

## Claude mode (optional)

"Describe it" tries the built-in reader first. When the reader doesn't recognise a description, such as "a ball rolling in a bowl with a little friction", Claude can build the system instead:

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys). Give its workspace a low monthly spend limit.
2. Open **Settings** and paste the key under **Claude (optional)**.
3. Describe the system and press **Build**. To get Claude's version of a description the reader already handled, click **Ask Claude instead**.

What to know:

- **Your key stays in your browser.** It's saved in this browser's localStorage, and the page sends it only to `api.anthropic.com`. Holograph has no server, so nobody else ever receives it. Any script on the page or browser extension could still read it, which is why the spend limit matters. Clear the field to remove the key.
- **Cost:** each build is one call to Claude Opus 5.5 (`claude-opus-5-5`), about 3–6¢, charged to your key. A failed check adds a second call.
- **What Claude builds is checked before it loads.** Claude returns the same shape as an example: equations, parameters, starting values and, for PDEs, boundary and domain. Holograph runs it through its own equation parser and compiler. If that fails, Claude gets one retry with the parser's error. If the retry also fails, you see the error and nothing is loaded.
- Builds made by Claude are tagged **Claude** under the box. AI can be wrong, so check the equations.
- If Claude's safety checks decline a request, it is re-run on a fallback model (the API's `fallbacks: "default"` option). If that also declines, you see a message.

### Under the hood

`js/claude.js` uses the official SDK (`@anthropic-ai/sdk`, loaded from jsdelivr through the import map only on first use, with `dangerouslyAllowBrowser: true`). It also uses structured output (`output_config.format`): a JSON schema that returns `params` and `ic` as lists of entries, because the schema can't express free-form maps. The system prompt lists exactly what `js/parse.js` accepts. `tests/claude.test.js` mocks the API client and covers the validation, the retry, refusals and API errors.

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
- Claude mode with the API mocked: answers that fail the parser are caught and retried once, and refusals and API errors become readable messages;
- the solvers, with physics checks: an oscillator's period, the exact heat decay rate, 2D wave stability, periodic advection, the double pendulum against its closed form, Poisson against its exact solution, and Schrödinger conserving probability;
- a short run of every example at the app's grid size.

## How it works

- `js/parse.js` converts LaTeX or plain text into a classified model and compiles it to fast JavaScript. Equations are linear in their highest derivatives, so a small linear solve handles coupled systems.
- `js/solver.js` runs RK4. Each step size is set from a power-iteration estimate of the system's stiffness. PDEs use finite differences with ghost cells for the boundary conditions, and several fields share one state array.
- `js/describe.js` turns a description into equations, using a vocabulary of systems, modifiers and quantities with units.
- `js/claude.js` is the optional Claude mode for descriptions the built-in reader doesn't recognise.
- `js/scene.js` draws the three.js hologram stage and the physical views.
- `js/app.js` handles the editor, sliders and playback. `js/presets.js` holds the examples.

Known limits:

- Complex-valued equations have to be split into real and imaginary fields (see the quantum example).
- A PDE system shows its first field; reorder the equations to show another.
- Steady states are 2D only. A 1D steady state is an ODE in x.
