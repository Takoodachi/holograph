// Examples gallery. Equations are LaTeX exactly as MathLive shows them; ic keys are state names (ODE) or u0/v0 (PDE).
const R = String.raw;

export const PRESETS = [
  { name: 'Damped spring', eqs: [R`m\ddot{x}+c\dot{x}+kx=0`], params: { m: 1, c: 0.4, k: 6 }, ic: { x: '1', x__t: '0' } },
  { name: 'Nonlinear pendulum', eqs: [R`\frac{d^2\theta}{dt^2}+\frac{g}{L}\sin\theta=0`], params: { g: 9.81, L: 2 }, ic: { theta: R`0.9\pi`, theta__t: '0' } },
  { name: 'Driven resonance', eqs: [R`y''+0.1y'+4y=\cos\left(\omega t\right)`], params: { omega: 2 }, ic: { y: '0', y__t: '0' }, view: 'spring' },
  { name: 'Van der Pol', eqs: [R`x''-\mu\left(1-x^2\right)x'+x=0`], params: { mu: 1.5 }, ic: { x: '0.5', x__t: '0' }, view: 'phase' },
  { name: 'Logistic growth', eqs: [R`\frac{dP}{dt}=rP\left(1-\frac{P}{K}\right)`], params: { r: 0.8, K: 10 }, ic: { P: '0.5' } },
  { name: 'Predator–prey', eqs: [R`x'=\alpha x-\beta xy`, R`y'=\delta xy-\gamma y`], params: { alpha: 1.1, beta: 0.4, delta: 0.1, gamma: 0.4 }, ic: { x: '10', y: '10' } },
  { name: 'Lorenz attractor', eqs: [R`\dot{x}=\sigma\left(y-x\right)`, R`\dot{y}=x\left(\rho-z\right)-y`, R`\dot{z}=xy-\beta z`], params: { sigma: 10, rho: 28, beta: 8 / 3 }, ic: { x: '1', y: '1', z: '1' } },
  { name: 'Kepler orbit', eqs: [R`x''=-\frac{GMx}{\left(x^2+y^2\right)^{\frac{3}{2}}}`, R`y''=-\frac{GMy}{\left(x^2+y^2\right)^{\frac{3}{2}}}`], params: { G: 1, M: 1 }, ic: { x: '1', x__t: '0', y: '0', y__t: '1.2' } },
  { name: 'Heat in a rod', eqs: [R`\frac{\partial u}{\partial t}=\alpha\frac{\partial^2u}{\partial x^2}`], params: { alpha: 0.02 }, ic: { u0: R`e^{-40x^2}+0.6e^{-300\left(x-0.55\right)^2}` }, bc: 'fixed' },
  { name: 'Plucked string', eqs: [R`u_{tt}=c^2u_{xx}`], params: { c: 1 }, ic: { u0: R`e^{-80\left(x+0.4\right)^2}`, v0: '0' }, bc: 'fixed' },
  { name: 'Burgers shock', eqs: [R`u_t+uu_x=\nu u_{xx}`], params: { nu: 0.01 }, ic: { u0: R`\sin\left(\pi x\right)` }, bc: 'periodic' },
  { name: 'Fisher–KPP front', eqs: [R`u_t=Du_{xx}+ru\left(1-u\right)`], params: { D: 0.005, r: 2 }, ic: { u0: R`e^{-300x^2}` }, bc: 'free' },
  { name: 'KdV solitons', eqs: [R`u_t+6uu_x+u_{xxx}=0`], params: {}, ic: { u0: R`\frac{4}{\cosh^2\left(\sqrt{2}\left(x+6\right)\right)}+\frac{1}{\cosh^2\left(\frac{x}{\sqrt{2}}\right)}` }, bc: 'periodic', domain: [-10, 10] },
  { name: 'Drumhead', eqs: [R`\frac{\partial^2u}{\partial t^2}=c^2\nabla^2u`], params: { c: 1 }, ic: { u0: R`e^{-40\left(\left(x-0.3\right)^2+y^2\right)}`, v0: '0' }, bc: 'fixed' },
  { name: 'Heat on a plate', eqs: [R`u_t=\alpha\left(u_{xx}+u_{yy}\right)`], params: { alpha: 0.02 }, ic: { u0: R`\left(\left|x\right|<0.4\right)\left(\left|y\right|<0.4\right)` }, bc: 'fixed' },
];
