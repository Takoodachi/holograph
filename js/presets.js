// Examples gallery, in groups. Equations are LaTeX exactly as MathLive shows them. ic keys are state names:
// x, x__t for an ODE; a PDE field's name (u, v) for its starting values and u__t for its starting rate.
const R = String.raw;
const seed = R`\left(\left(\left|x\right|<0.1\right)\left(\left|y\right|<0.1\right)+\left(\left|x-0.5\right|<0.06\right)\left(\left|y-0.3\right|<0.06\right)\right)`;

export const PRESETS = [
  // ---- mechanics
  { group: 'Mechanics', name: 'Damped spring', eqs: [R`m\ddot{x}+c\dot{x}+kx=0`], params: { m: 1, c: 0.4, k: 6 }, ic: { x: '1', x__t: '0' } },
  { group: 'Mechanics', name: 'Nonlinear pendulum', eqs: [R`\frac{d^2\theta}{dt^2}+\frac{g}{L}\sin\theta=0`], params: { g: 9.81, L: 2 }, ic: { theta: R`0.9\pi`, theta__t: '0' } },
  {
    group: 'Mechanics', name: 'Double pendulum',
    eqs: [R`2\ddot{\theta}+\ddot{\phi}\cos\left(\theta-\phi\right)+\dot{\phi}^2\sin\left(\theta-\phi\right)+\frac{2g}{L}\sin\theta=0`,
      R`\ddot{\phi}+\ddot{\theta}\cos\left(\theta-\phi\right)-\dot{\theta}^2\sin\left(\theta-\phi\right)+\frac{g}{L}\sin\phi=0`],
    params: { g: 9.81, L: 1 }, ic: { theta: '2', theta__t: '0', phi: '2.5', phi__t: '0' },
  },
  { group: 'Mechanics', name: 'Driven resonance', eqs: [R`y''+0.1y'+4y=\cos\left(\omega t\right)`], params: { omega: 2 }, ic: { y: '0', y__t: '0' }, view: 'spring' },
  { group: 'Mechanics', name: 'Coupled oscillators', eqs: [R`x''=-kx+\kappa\left(y-x\right)`, R`y''=-ky-\kappa\left(y-x\right)`], params: { k: 4, kappa: 0.4 }, ic: { x: '1', x__t: '0', y: '0', y__t: '0' }, view: 'timeline' },
  { group: 'Mechanics', name: 'Falling with air drag', eqs: [R`\frac{dv}{dt}=g-\frac{k}{m}v^2`], params: { g: 9.81, k: 0.25, m: 1 }, ic: { v: '0' }, view: 'timeline' },
  { group: 'Mechanics', name: 'Kepler orbit', eqs: [R`x''=-\frac{GMx}{\left(x^2+y^2\right)^{\frac{3}{2}}}`, R`y''=-\frac{GMy}{\left(x^2+y^2\right)^{\frac{3}{2}}}`], params: { G: 1, M: 1 }, ic: { x: '1', x__t: '0', y: '0', y__t: '1.2' } },

  // ---- chaos
  { group: 'Chaos', name: 'Lorenz attractor', eqs: [R`\dot{x}=\sigma\left(y-x\right)`, R`\dot{y}=x\left(\rho-z\right)-y`, R`\dot{z}=xy-\beta z`], params: { sigma: 10, rho: 28, beta: 8 / 3 }, ic: { x: '1', y: '1', z: '1' } },
  { group: 'Chaos', name: 'Rössler attractor', eqs: [R`\dot{x}=-y-z`, R`\dot{y}=x+ay`, R`\dot{z}=b+z\left(x-c\right)`], params: { a: 0.2, b: 0.2, c: 5.7 }, ic: { x: '1', y: '1', z: '0' } },
  { group: 'Chaos', name: 'Duffing oscillator', eqs: [R`\ddot{x}+\delta\dot{x}-x+x^3=\gamma\cos\left(\omega t\right)`], params: { delta: 0.3, gamma: 0.5, omega: 1.2 }, ic: { x: '1', x__t: '0' }, view: 'phase' },
  { group: 'Chaos', name: 'Van der Pol', eqs: [R`x''-\mu\left(1-x^2\right)x'+x=0`], params: { mu: 1.5 }, ic: { x: '0.5', x__t: '0' }, view: 'phase' },
  { group: 'Chaos', name: 'Kuramoto–Sivashinsky', eqs: [R`u_t+u_{xx}+u_{xxxx}+uu_x=0`], params: {}, ic: { u: R`\cos\left(\frac{x}{16}\right)\left(1+\sin\left(\frac{x}{16}\right)\right)` }, bc: 'periodic', domain: [0, 100.53], view: 'timeline' },

  // ---- life & chemistry
  { group: 'Life & chemistry', name: 'Logistic growth', eqs: [R`\frac{dP}{dt}=rP\left(1-\frac{P}{K}\right)`], params: { r: 0.8, K: 10 }, ic: { P: '0.5' } },
  { group: 'Life & chemistry', name: 'Predator–prey', eqs: [R`x'=\alpha x-\beta xy`, R`y'=\delta xy-\gamma y`], params: { alpha: 1.1, beta: 0.4, delta: 0.1, gamma: 0.4 }, ic: { x: '10', y: '10' } },
  { group: 'Life & chemistry', name: 'SIR epidemic', eqs: [R`S'=-\beta SI`, R`I'=\beta SI-\gamma I`, R`R'=\gamma I`], params: { beta: 0.5, gamma: 0.1 }, ic: { S: '0.99', I: '0.01', R: '0' }, view: 'timeline' },
  { group: 'Life & chemistry', name: 'Neuron spikes', eqs: [R`v'=v-\frac{v^3}{3}-w+I`, R`w'=\epsilon\left(v+a-bw\right)`], params: { I: 0.5, epsilon: 0.08, a: 0.7, b: 0.8 }, ic: { v: '0', w: '0' }, view: 'timeline' },
  { group: 'Life & chemistry', name: 'Brusselator reaction', eqs: [R`x'=a-\left(b+1\right)x+x^2y`, R`y'=bx-x^2y`], params: { a: 1, b: 3 }, ic: { x: '1', y: '1' }, view: 'phase' },
  { group: 'Life & chemistry', name: 'Fisher–KPP front', eqs: [R`u_t=Du_{xx}+ru\left(1-u\right)`], params: { D: 0.005, r: 2 }, ic: { u: R`e^{-300x^2}` }, bc: 'free' },
  {
    group: 'Life & chemistry', name: 'Turing patterns',
    // Gray–Scott with a rate λ setting the clock; v (shown) first
    eqs: [R`v_t=D_v\nabla^2v+\lambda\left(uv^2-\left(F+k\right)v\right)`, R`u_t=D_u\nabla^2u+\lambda\left(F\left(1-u\right)-uv^2\right)`],
    params: { D_v: 0.00625, D_u: 0.0125, lambda: 100, F: 0.037, k: 0.06 }, ic: { v: R`0.25${seed}`, u: R`1-0.5${seed}` }, bc: 'periodic',
  },

  // ---- circuits & heat transfer
  { group: 'Circuits & cooling', name: 'RC circuit', eqs: [R`RC\frac{dV}{dt}+V=V_0`], params: { R: 1, C: 0.5, V_0: 5 }, ic: { V: '0' } },
  { group: 'Circuits & cooling', name: 'RLC circuit', eqs: [R`L\ddot{q}+R\dot{q}+\frac{q}{C}=V_0\cos\left(\omega t\right)`], params: { L: 1, R: 0.3, C: 0.25, V_0: 1, omega: 2 }, ic: { q: '0', q__t: '0' }, view: 'timeline' },
  { group: 'Circuits & cooling', name: "Newton's cooling", eqs: [R`T'=-k\left(T-T_a\right)`], params: { k: 0.2, T_a: 20 }, ic: { T: '90' } },

  // ---- heat & diffusion
  { group: 'Heat & diffusion', name: 'Heat in a rod', eqs: [R`\frac{\partial u}{\partial t}=\alpha\frac{\partial^2u}{\partial x^2}`], params: { alpha: 0.02 }, ic: { u: R`e^{-40x^2}+0.6e^{-300\left(x-0.55\right)^2}` }, bc: 'fixed' },
  { group: 'Heat & diffusion', name: 'Heat on a plate', eqs: [R`u_t=\alpha\left(u_{xx}+u_{yy}\right)`], params: { alpha: 0.02 }, ic: { u: R`\left(\left|x\right|<0.4\right)\left(\left|y\right|<0.4\right)` }, bc: 'fixed' },
  { group: 'Heat & diffusion', name: 'Pollutant in a river', eqs: [R`u_t+cu_x=Du_{xx}`], params: { c: 0.3, D: 0.005 }, ic: { u: R`e^{-200\left(x+0.6\right)^2}` }, bc: 'periodic' },
  { group: 'Heat & diffusion', name: 'Phase separation', eqs: [R`u_t=\epsilon^2u_{xx}+u-u^3`], params: { epsilon: 0.03 }, ic: { u: R`0.1\sin\left(9\pi x\right)+0.05\cos\left(5\pi x\right)` }, bc: 'free' },
  { group: 'Heat & diffusion', name: 'Steady heat (Laplace)', eqs: [R`u_{xx}+u_{yy}=0`], params: {}, ic: { u: R`\left(y>0.98\right)` }, bc: 'fixed' },
  { group: 'Heat & diffusion', name: 'Electric potential', eqs: [R`\nabla^2u=\rho_0e^{-60\left(\left(x+0.3\right)^2+y^2\right)}-\rho_0e^{-60\left(\left(x-0.3\right)^2+y^2\right)}`], params: { rho_0: 50 }, ic: { u: '0' }, bc: 'fixed' },

  // ---- waves
  { group: 'Waves', name: 'Plucked string', eqs: [R`u_{tt}=c^2u_{xx}`], params: { c: 1 }, ic: { u: R`e^{-80\left(x+0.4\right)^2}`, u__t: '0' }, bc: 'fixed' },
  { group: 'Waves', name: 'Drumhead', eqs: [R`\frac{\partial^2u}{\partial t^2}=c^2\nabla^2u`], params: { c: 1 }, ic: { u: R`e^{-40\left(\left(x-0.3\right)^2+y^2\right)}`, u__t: '0' }, bc: 'fixed' },
  { group: 'Waves', name: 'Burgers shock', eqs: [R`u_t+uu_x=\nu u_{xx}`], params: { nu: 0.01 }, ic: { u: R`\sin\left(\pi x\right)` }, bc: 'periodic' },
  { group: 'Waves', name: 'KdV solitons', eqs: [R`u_t+6uu_x+u_{xxx}=0`], params: {}, ic: { u: R`\frac{4}{\cosh^2\left(\sqrt{2}\left(x+6\right)\right)}+\frac{1}{\cosh^2\left(\frac{x}{\sqrt{2}}\right)}` }, bc: 'periodic', domain: [-10, 10] },
  {
    group: 'Waves', name: 'Quantum tunneling',
    // ψ = u + iv in iψ_t = −βψ_xx + Vψ, a wave packet meeting a thin barrier; showing u = Re ψ
    eqs: [R`u_t=-\beta v_{xx}+V_0\left(\left|x\right|<0.03\right)v`, R`v_t=\beta u_{xx}-V_0\left(\left|x\right|<0.03\right)u`],
    params: { beta: 0.01, V_0: 20 }, ic: { u: R`e^{-60\left(x+0.5\right)^2}\cos\left(40x\right)`, v: R`e^{-60\left(x+0.5\right)^2}\sin\left(40x\right)` }, bc: 'fixed',
  },
];
