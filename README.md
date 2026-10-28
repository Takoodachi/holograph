# Holograph

Type a differential equation and watch it move. Holograph turns ODEs and PDEs into hologram-style physical models: springs, pendulums, orbits, strings, membranes and heated plates.

**Live site:** https://takoodachi.github.io/holograph/

## Using it

- **Describe it in words**, e.g. "a pendulum 2 m long released from 60°, with friction, pushed every 3 seconds" or "a flu outbreak where people recover in 7 days". Holograph builds the equations, starting values and parameters, and loads them for you to tweak. This runs in your browser with no AI service: it recognises about 30 kinds of system, modifiers such as friction, a periodic push, insulated ends or 2D, and numbers with units. For anything else, an AI builds it: Qwen for free, or Claude, GPT or Gemini with your own key (see [AI mode](#ai-mode)).
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
- **Settings** (top right) holds every preference: the look (Hologram, Plain with no glow effects, or Light with a light background) and which AI builds descriptions, with your key for the paid ones.

Press <kbd>Space</kbd> to pause and <kbd>R</kbd> to restart.

## AI mode

"Describe it" tries the built-in reader first. When the reader doesn't recognise a description, such as "a ball rolling in a bowl with a little friction", an AI model builds the system instead. Pick the AI in **Settings**:

| Choice | Model | Key |
|---|---|---|
| **Qwen · free** (default) | Qwen3 30B, `@cf/qwen/qwen3-30b-a3b-fp8`, through Holograph's Cloudflare Worker | none |
| Claude (Anthropic) | Claude Opus 5.5, `claude-opus-5-5` | yours, from [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| GPT (OpenAI) | GPT-6 Astra, `gpt-6-astra` | yours, from [platform.openai.com](https://platform.openai.com/api-keys) |
| Gemini (Google) | Gemini 4 Argon, `gemini-4-argon` | yours, from [aistudio.google.com](https://aistudio.google.com/apikey) |

To use your own key, create one with your provider, give it a low monthly spend limit, pick the provider in **Settings** and paste the key. To get the AI's version of a description the reader already handled, click **Ask … instead**.

What to know:

- **The free Qwen** needs nothing from you. Each visitor gets 10 requests a day (a build that needs its retry uses two), and all visitors share Cloudflare's free daily allowance, roughly 50–100 builds. When either runs out, the app says so; it resets at midnight UTC. Your description goes to Holograph's Worker and Cloudflare Workers AI.
- **Your keys stay in your browser.** Each provider's key is saved separately in this browser's localStorage, and the page sends it only to that provider's API. Holograph has no server, so nobody else ever receives it. Any script on the page or browser extension could still read it, which is why the spend limit matters. Clear the field to remove a key.
- **Cost with your own key:** each build is one call to the chosen model, typically a few cents, charged to your key. A failed check adds a second call.
- **What the AI builds is checked before it loads.** It returns the same shape as an example: equations, parameters, starting values and, for PDEs, boundary and domain. Holograph runs it through its own equation parser and compiler. If that fails, the model gets one retry with the parser's error. If the retry also fails, you see the error and nothing is loaded.
- Builds made by AI are tagged with the provider's name under the box. AI can be wrong, so check the equations.
- If Claude's safety checks decline a request, it is re-run on a fallback model (the API's `fallbacks: "default"` option). A refusal from any provider shows as a message.

### Under the hood

`js/ai.js` holds one entry per provider. Claude uses Anthropic's official SDK (`@anthropic-ai/sdk`, loaded from jsdelivr through the import map only on first use, with `dangerouslyAllowBrowser: true`). The others share one `fetch` call in the Chat Completions format: GPT directly, Gemini through its OpenAI-compatible endpoint, and Qwen through the Worker, which answers in the same shape. Another OpenAI-compatible provider is one more entry.

Every provider gets the same system prompt and structured-output JSON schema from `js/prompt.js`. The prompt lists exactly what `js/parse.js` accepts. The schema returns `params` and `ic` as lists of entries, because it can't express free-form maps, and every field is required with the optional ones nullable, because OpenAI's strict mode demands that. Qwen on Workers AI doesn't enforce a schema, so the Worker puts the schema in the prompt, and the app pulls the JSON out of the reply (skipping any reasoning or code fences) before checking it.

### The free Qwen Worker

`worker/` is a Cloudflare Worker on the free Workers plan, so it can't run up a bill: past the daily allowance, Workers AI refuses requests until midnight UTC. It holds no secret (the model is reached through the Workers AI binding), only answers requests from takoodachi.github.io and `localhost:5173`, and always runs Holograph's own prompt, so it can't be used as a general chatbot. A KV namespace counts each visitor's requests per day.

To deploy your own copy:

1. Create a free Cloudflare account.
2. Log in and deploy from `worker/`. The first deploy creates the KV namespace; put its id in `wrangler.jsonc`.

   ```bash
   npx wrangler@4.150.0 login
   ```

   ```bash
   npx wrangler@4.150.0 deploy
   ```

3. Put the Worker's address in `PROVIDERS.qwen.url` in `js/ai.js`, and your site's address in `ORIGINS` in `worker/index.js`.

`tests/ai.test.js` mocks each API and covers the validation, the retry, refusals and API errors. `tests/worker.test.js` runs the Worker with Workers AI and KV faked.

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
- AI mode with each API mocked: answers that fail the parser are caught and retried once, and refusals and API errors become readable messages;
- the free Qwen Worker: only Holograph may use it, the per-visitor daily limit, and a spent allowance;
- the solvers, with physics checks: an oscillator's period, the exact heat decay rate, 2D wave stability, periodic advection, the double pendulum against its closed form, Poisson against its exact solution, and Schrödinger conserving probability;
- a short run of every example at the app's grid size.

## How it works

- `js/parse.js` converts LaTeX or plain text into a classified model and compiles it to fast JavaScript. Equations are linear in their highest derivatives, so a small linear solve handles coupled systems.
- `js/solver.js` runs RK4. Each step size is set from a power-iteration estimate of the system's stiffness. PDEs use finite differences with ghost cells for the boundary conditions, and several fields share one state array.
- `js/describe.js` turns a description into equations, using a vocabulary of systems, modifiers and quantities with units.
- `js/ai.js` is the AI mode (free Qwen, or Claude, GPT or Gemini with your key) for descriptions the built-in reader doesn't recognise; `js/prompt.js` is what every model is told, and `worker/` is the free Qwen's Cloudflare Worker.
- `js/scene.js` draws the three.js hologram stage and the physical views.
- `js/app.js` handles the editor, sliders and playback. `js/presets.js` holds the examples.

Known limits:

- Complex-valued equations have to be split into real and imaginary fields (see the quantum example).
- A PDE system shows its first field; reorder the equations to show another.
- Steady states are 2D only. A 1D steady state is an ODE in x.
