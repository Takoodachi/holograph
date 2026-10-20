// Hologram stage (wireframe on black, Orano-style yellow accent, bloom + RGB split) and the physical views.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Field colour ramps, rest → strong: dark looks go navy → slate → amber (positive) / blue (negative); light goes grey → amber / navy.
// mesh: opacity of dense field meshes, which always blend normally: additively, thousands of overlapping lines burn out to white
// ink: line opacity multiplier; dark ink on a light page needs far more than light lines glowing on black
const HOLO = {
  bg: 0x07080d, line: 0xdfe6f2, accent: 0xffd84a, blend: THREE.AdditiveBlending, fx: true, mesh: 0.8, ink: 1,
  pos: [[0.05, 0.07, 0.14], [0.16, 0.2, 0.3], [0.32, 0.34, 0.4], [0.6, 0.42, 0.08]],
  neg: [[0.05, 0.07, 0.14], [0.08, 0.15, 0.32], [0.14, 0.28, 0.55], [0.24, 0.42, 0.75]],
};
export const LOOKS = {
  holo: HOLO,
  plain: { ...HOLO, fx: false },
  light: {
    bg: 0xf4f5f8, line: 0x1b2233, accent: 0xb07800, blend: THREE.NormalBlending, fx: false, mesh: 0.9, ink: 2.2,
    pos: [[0.3, 0.34, 0.42], [0.55, 0.4, 0.15], [0.8, 0.45, 0.02], [0.45, 0.22, 0]],
    neg: [[0.3, 0.34, 0.42], [0.2, 0.32, 0.6], [0.08, 0.25, 0.7], [0.02, 0.08, 0.35]],
  },
};
const T = { ...HOLO }; // current look; views read it when they're built

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), fog = new THREE.Fog(T.bg, 16, 42);
  scene.background = new THREE.Color(T.bg);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, maxPolarAngle: Math.PI * 0.495, minDistance: 3, maxDistance: 40, autoRotateSpeed: 0.6 });

  const floorMat = floorMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  // graph paper behind front-facing 2D views, where the floor is seen edge-on
  const paper = new THREE.LineSegments(new THREE.GridHelper(80, 80).geometry, lineMat(T.line, 0.07));
  paper.rotation.x = Math.PI / 2;
  paper.position.z = -30;
  paper.visible = false;
  const root = new THREE.Group();
  scene.add(floor, paper, root);

  const composer = new EffectComposer(renderer), pass = new RenderPass(scene, camera);
  composer.addPass(pass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.25);
  composer.addPass(bloom);
  const rgb = new ShaderPass(RGBShiftShader);
  rgb.uniforms.amount.value = 0.0011;
  composer.addPass(rgb);
  composer.addPass(new OutputPass());

  let current = null, flat = false, flatHalf = 1, aspect = 1, clickAt = -100;
  const target3D = new THREE.Vector3(), raycaster = new THREE.Raycaster();

  const fitOrtho = () => {
    Object.assign(ortho, { top: flatHalf, bottom: -flatHalf, left: -flatHalf * aspect, right: flatHalf * aspect });
    ortho.updateProjectionMatrix();
  };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    fitOrtho();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  return {
    root,
    show(view, keepCamera = false) {
      root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      root.clear();
      current = view(root);
      if (!keepCamera) {
        camera.position.set(...current.camera[0]);
        (flat ? target3D : controls.target).set(...current.camera[1]);
      }
      controls.autoRotate = !flat && !!current.spin;
      return current;
    },
    // Flat 2D: orthographic camera looking straight at the view's plane. Returns false if the view has no 2D form.
    setFlat(on) {
      const spec = current?.flat, ok = !on || !!spec;
      if (!ok) on = false;
      if (on && !flat) target3D.copy(controls.target);
      if (!on && flat) controls.target.copy(target3D);
      flat = on;
      if (on) {
        const { dir, center: c, w, h } = spec;
        flatHalf = Math.max(h / 2, w / 2 / aspect) * 1.08;
        fitOrtho();
        ortho.zoom = 1;
        ortho.up.set(...(dir === 'top' ? [0, 0, -1] : [0, 1, 0]));
        ortho.position.set(c[0], c[1] + (dir === 'top' ? 60 : 0), c[2] + (dir === 'top' ? 0 : 60));
        ortho.lookAt(...c);
        controls.target.set(...c);
      }
      controls.object = pass.camera = on ? ortho : camera;
      Object.assign(controls, { enableRotate: !on, maxPolarAngle: on ? Math.PI / 2 : Math.PI * 0.495, autoRotate: !on && !!current?.spin });
      scene.fog = on ? null : fog;
      paper.visible = on && spec.dir === 'front';
      spec?.hide?.forEach(o => { o.visible = !on; });
      return ok;
    },
    // WASD: fly forward/back and strafe in 3D; pan up/down/left/right in 2D
    move(keys, dt) {
      const cam = controls.object, m = cam.matrixWorld.elements;
      const fwd = flat ? new THREE.Vector3(m[4], m[5], m[6]) : new THREE.Vector3(-m[8], -m[9], -m[10]);
      const v = fwd.multiplyScalar(keys.has('w') - keys.has('s')).add(new THREE.Vector3(m[0], m[1], m[2]).multiplyScalar(keys.has('d') - keys.has('a')));
      if (!v.lengthSq()) return;
      const speed = flat ? (2 * flatHalf) / ortho.zoom * 0.35 : Math.max(3, cam.position.distanceTo(controls.target)) * 0.4;
      v.normalize().multiplyScalar(speed * dt);
      cam.position.add(v);
      controls.target.add(v);
      if (!flat && cam.position.y < 0.3) { const lift = 0.3 - cam.position.y; cam.position.y += lift; controls.target.y += lift; }
    },
    raycaster(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), controls.object);
      return raycaster;
    },
    // world point → canvas pixels, or null when it's behind the camera or off screen
    project(at) {
      const v = new THREE.Vector3(...at).project(controls.object);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    },
    ripple(at) {
      floorMat.uniforms.uClick.value.set(at[0], at[2]);
      clickAt = performance.now() / 1000;
    },
    setLook(name) {
      Object.assign(T, LOOKS[name]);
      scene.background.set(T.bg);
      fog.color.set(T.bg);
      floorMat.uniforms.uLine.value.set(T.line);
      floorMat.uniforms.uAccent.value.set(T.accent);
      floorMat.uniforms.uInk.value = T.ink;
      Object.assign(paper.material, { blending: T.blend, opacity: Math.min(1, 0.07 * T.ink), needsUpdate: true }).color.set(T.line);
      bloom.enabled = rgb.enabled = T.fx;
    },
    render(time) {
      floorMat.uniforms.uAge.value = time - clickAt;
      controls.update();
      composer.render();
    },
  };
}

// Analytic anti-aliased grid that fades into the dark; a yellow ripple spreads from where the graph was clicked
function floorMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uAge: { value: 100 }, uInk: { value: 1 }, uClick: { value: new THREE.Vector2() }, uLine: { value: new THREE.Color(T.line) }, uAccent: { value: new THREE.Color(T.accent) } },
    vertexShader: `varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uAge, uInk; uniform vec2 uClick; uniform vec3 uLine, uAccent; varying vec3 vP;
      float grid(vec2 p, float s) { vec2 q = p / s; vec2 g = abs(fract(q - .5) - .5) / fwidth(q); return 1. - min(min(g.x, g.y), 1.); }
      void main() {
        float fade = smoothstep(30., 3., length(vP.xz));
        float minor = grid(vP.xz, 1.) * .07 * uInk, major = grid(vP.xz, 5.) * .2 * uInk;
        float r = length(vP.xz - uClick);
        float ring = smoothstep(.5, 0., abs(r - uAge * 7.)) * smoothstep(1.3, .2, uAge) * smoothstep(9., 2., r);
        vec3 c = uLine * (minor + major) + uAccent * ring * (minor * 6. + major * 3. + .5);
        gl_FragColor = vec4(c, (minor + major + ring * .6) * fade);
      }`,
  });
}

// ---------- building blocks ----------

function lineMat(color = T.line, opacity = 0.5, vertexColors = false) {
  return new THREE.LineBasicMaterial({ color, opacity: Math.min(1, opacity * T.ink), vertexColors, transparent: true, depthWrite: false, blending: T.blend });
}
const wire = (geo, color, opacity) => new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMat(color, opacity));
const edges = (geo, color, opacity) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(color, opacity));
const segment = (a, b, color = T.line, opacity = 0.3) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), lineMat(color, opacity));

function dynLine(n, color, opacity, vertexColors = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (vertexColors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return new THREE.Line(g, lineMat(color, opacity, vertexColors));
}

// Fixed-length polyline that scrolls: push() appends, dropping the oldest point
function trail(n, color, opacity) {
  const line = dynLine(n, color, opacity), pos = line.geometry.attributes.position, a = pos.array;
  let count = 0;
  line.geometry.setDrawRange(0, 0);
  line.frustumCulled = false;
  line.push = (x, y, z) => {
    if (count < n) count++;
    else a.copyWithin(0, 3);
    a.set([x, y, z], (count - 1) * 3);
    line.geometry.setDrawRange(0, count);
    pos.needsUpdate = true;
  };
  return line;
}

function heat(s, out, o) {
  const ramp = s < 0 ? T.neg : T.pos, v = Math.min(Math.abs(s), 1) * 3, i = Math.min(Math.floor(v), 2), f = v - i;
  for (let c = 0; c < 3; c++) out[o + c] = ramp[i][c] + (ramp[i + 1][c] - ramp[i][c]) * f;
}

const half = (lo, hi, k) => Math.max((hi[k] - lo[k]) / 2, Math.abs(hi[k] + lo[k]) * 1e-3, 1e-6);
// Display only: within a millionth of its natural scale a value is round-off or has decayed away, so it reads 0.
// The simulation keeps the exact numbers; snapping them there would change the physics (decay, chaos, symmetry).
const fmt = (v, scale) => (!Number.isFinite(v) ? '–' : Math.abs(v) <= 1e-6 * scale ? '0' : String(+v.toPrecision(3)));
const clampIdx = (i, n) => Math.min(n - 1, Math.max(0, i));
const UP = new THREE.Vector3(0, 1, 0), FRONT = new THREE.Vector3(0, 0, 1);
const hitPlane = (rc, normal, at) => rc.ray.intersectPlane(new THREE.Plane(normal, -at), new THREE.Vector3());
// ODE object views: a click pins a live readout of the whole state to the moving object
const readout = (obj, { labels, lo, hi }) => () => S => ({ at: obj.position.toArray(), text: labels.map((l, k) => `${l} ${fmt(S[k], half(lo, hi, k))}`).join('   ') });

// ---------- views ----------
// (ctx) => (root) => { camera, update(S, t, dt), step?(S, t), flat?: {dir, center, w, h, hide?}, probe?(raycaster) → (S, t) => {at, text} }

export const VIEW_NAMES = { spring: 'Mass–spring', pendulum: 'Pendulum', level: 'Tank level', phase: 'Phase space', attractor: '3D trajectory', profile: 'String / rod', surface: 'Membrane / plate' };

export const VIEWS = {
  spring: ({ lo, hi, labels }) => root => {
    const s = 3 / Math.max(Math.abs(lo[0]), Math.abs(hi[0]), 1e-6), wallX = -6.5, y0 = 0.7;
    const box = new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2);
    const mass = new THREE.Group().add(wire(box, T.accent, 0.45), edges(box, T.accent, 1));
    const coil = dynLine(420, T.line, 0.9);
    const wall = wire(new THREE.BoxGeometry(0.4, 3, 3, 1, 5, 5), T.line, 0.25);
    wall.position.set(wallX - 0.2, 1.5, 0);
    const gate = edges(new THREE.PlaneGeometry(2.6, 2.6), T.accent, 0.25);
    gate.position.set(0, 1.3, 0);
    gate.rotation.y = Math.PI / 2;
    root.add(mass, coil, wall, gate, segment([wallX, 0.01, 1], [7, 0.01, 1]), segment([wallX, 0.01, -1], [7, 0.01, -1]));
    return {
      camera: [[1.5, 4.2, 12.5], [-0.8, 1.1, 0]],
      flat: { dir: 'front', center: [-1.5, 1.6, 0], w: 11.5, h: 4.5 },
      probe: readout(mass, { labels, lo, hi }),
      update(S) {
        const x = S[0] * s;
        mass.position.set(x, y0, 0);
        const pos = coil.geometry.attributes.position, n = pos.count, len = x - 0.7 - wallX;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1), a = f * 15 * 2 * Math.PI, r = f < 0.04 || f > 0.96 ? 0 : 0.42;
          pos.setXYZ(i, wallX + f * len, y0 + r * Math.sin(a), r * Math.cos(a));
        }
        pos.needsUpdate = true;
      },
    };
  },

  pendulum: ({ lo, hi, labels }) => root => {
    const L = 3.3, P = new THREE.Vector3(0, 4.7, 0);
    const bobGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const bob = new THREE.Group().add(wire(bobGeo, T.accent, 0.6));
    const rod = dynLine(2, T.line, 0.95), path = trail(140, T.accent, 0.35);
    const mount = wire(new THREE.BoxGeometry(2.4, 0.16, 0.7, 4, 1, 1), T.line, 0.35);
    mount.position.copy(P).add(new THREE.Vector3(0, 0.08, 0));
    const guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, L, L).getPoints(96)), lineMat(T.line, 0.1));
    guide.position.copy(P);
    root.add(bob, rod, path, mount, guide, segment([0, 0.01, 0], [0, P.y, 0], T.line, 0.08));
    const at = th => [P.x + L * Math.sin(th), P.y - L * Math.cos(th), 0];
    return {
      camera: [[0, 3.4, 11.5], [0, 2.6, 0]],
      flat: { dir: 'front', center: [0, 4.6, 0], w: 7.8, h: 7.8 },
      probe: readout(bob, { labels, lo, hi }),
      update(S) {
        const p = at(S[0]);
        bob.position.set(...p);
        rod.geometry.attributes.position.array.set([P.x, P.y, P.z, ...p]);
        rod.geometry.attributes.position.needsUpdate = true;
      },
      step: S => path.push(...at(S[0])),
    };
  },

  level: ({ lo, hi, labels }) => root => {
    const H = 5, R = 1.5, base = Math.min(lo[0], 0), span = Math.max(hi[0], 0) - base || 1;
    const tank = wire(new THREE.CylinderGeometry(R, R, H, 28, 10, true), T.line, 0.18);
    tank.position.y = H / 2;
    const fluid = wire(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 1, 28, 1), T.accent, 0.35);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, R * 0.93, R * 0.93).getPoints(64)), lineMat(T.accent, 1));
    ring.rotation.x = -Math.PI / 2;
    root.add(tank, fluid, ring);
    if (base < 0) {
      const zero = ring.clone();
      zero.material = lineMat(T.line, 0.5);
      zero.position.y = (-base / span) * H;
      root.add(zero);
    }
    return {
      camera: [[5, 5.5, 9.5], [0, 2.4, 0]],
      flat: { dir: 'front', center: [0, 2.6, 0], w: 4.5, h: 6 },
      probe: readout(ring, { labels, lo, hi }),
      update(S) {
        const h = Math.max(0.005, ((S[0] - base) / span) * H);
        fluid.scale.y = h;
        fluid.position.y = h / 2;
        ring.position.y = h;
      },
    };
  },

  phase: ({ lo, hi, coords, field, P, labels }) => root => {
    const [a, b] = coords.phase, ca = (lo[a] + hi[a]) / 2, cb = (lo[b] + hi[b]) / 2;
    // positions (orbits, populations) keep true proportions; (y, y') gets one scale per axis
    let sa = 5 / (half(lo, hi, a) * 1.25), sb = 5 / (half(lo, hi, b) * 1.25);
    if (coords.uniform) sa = sb = Math.min(sa, sb);
    const X = v => (v - ca) * sa, Z = v => -(v - cb) * sb, A = x => x / sa + ca, B = z => -z / sb + cb;
    const path = trail(2500, T.accent, 0.85);
    const head = wire(new THREE.OctahedronGeometry(0.16), T.accent, 1);
    root.add(path, head, edges(new THREE.PlaneGeometry(12.5, 12.5).rotateX(-Math.PI / 2), T.line, 0.3));
    if (lo[a] < 0 && hi[a] > 0) root.add(segment([X(0), 0.02, -6.25], [X(0), 0.02, 6.25], T.line, 0.25));
    if (lo[b] < 0 && hi[b] > 0) root.add(segment([-6.25, 0.02, Z(0)], [6.25, 0.02, Z(0)], T.line, 0.25));

    // 2D state: draw the vector field and let dust flow along it
    let arrows, dust;
    const Y = new Float64Array(2), dY = new Float64Array(2);
    const bgC = new THREE.Color(T.bg), lnC = new THREE.Color(T.line), acC = new THREE.Color(T.accent);
    const N = 21, M = 700;
    if (field) {
      arrows = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0xffffff, 0.8, true));
      arrows.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * N * 6), 3));
      arrows.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 6), 3));
      dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: T.line, size: 0.06, transparent: true, opacity: Math.min(1, 0.75 * T.ink), depthWrite: false, blending: T.blend }));
      // start scattered: all at the origin, they'd sit stacked on a fixed point there until their first respawn
      dust.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3).map((_, i) => (i % 3 === 1 ? 0.05 : (Math.random() - 0.5) * 12.5)), 3));
      dust.life = new Float32Array(M).map(() => Math.random() * 3);
      root.add(arrows, dust);
    }
    const vel = (x, z, t) => { Y[a] = A(x); Y[b] = B(z); field(P, t, Y, dY); return [dY[a] * sa, -dY[b] * sb]; };

    return {
      camera: [[0, 12.5, 8.5], [0, 0, 0.6]],
      flat: { dir: 'top', center: [0, 0, 0], w: 13, h: 13 },
      // a click reads the state at that point of the plane (and the flow there, when the state is 2D)
      probe(rc) {
        const hit = hitPlane(rc, UP, 0);
        if (!hit || Math.abs(hit.x) > 6.3 || Math.abs(hit.z) > 6.3) return null;
        const va = A(hit.x), vb = B(hit.z);
        return (S, t) => {
          let text = `${labels[a]} ${fmt(va, half(lo, hi, a))}   ${labels[b]} ${fmt(vb, half(lo, hi, b))}`;
          if (field) { Y[a] = va; Y[b] = vb; field(P, t, Y, dY); text += `   flow (${fmt(dY[a], half(lo, hi, a))}, ${fmt(dY[b], half(lo, hi, b))})`; }
          return { at: [hit.x, 0.05, hit.z], text };
        };
      },
      update(S, t, dt) {
        head.position.set(X(S[a]), 0.15, Z(S[b]));
        if (!field) return;
        const p = arrows.geometry.attributes.position.array, c = arrows.geometry.attributes.color.array, mags = [];
        for (let i = 0; i < N * N; i++) {
          const x = -6 + (12 * (i % N)) / (N - 1), z = -6 + (12 * Math.floor(i / N)) / (N - 1), [vx, vz] = vel(x, z, t), m = Math.hypot(vx, vz) || 1e-12;
          p.set([x - (0.17 * vx) / m, 0.03, z - (0.17 * vz) / m, x + (0.17 * vx) / m, 0.03, z + (0.17 * vz) / m], i * 6);
          mags.push(m);
        }
        const top = Math.max(...mags.filter(Number.isFinite)) || 1;
        // fade from the background: faint where the flow is slow, strong where it is fast (tail in ink, head in accent)
        mags.forEach((m, i) => {
          const k = Math.min(1, (0.3 + 0.7 * Math.sqrt(Math.min(m / top, 1))) * T.ink);
          c.set([bgC.r + (lnC.r - bgC.r) * k * 0.3, bgC.g + (lnC.g - bgC.g) * k * 0.3, bgC.b + (lnC.b - bgC.b) * k * 0.3,
            bgC.r + (acC.r - bgC.r) * k, bgC.g + (acC.g - bgC.g) * k, bgC.b + (acC.b - bgC.b) * k], i * 6);
        });
        arrows.geometry.attributes.position.needsUpdate = arrows.geometry.attributes.color.needsUpdate = true;
        const d = dust.geometry.attributes.position.array;
        for (let i = 0; i < M; i++) {
          dust.life[i] -= 1 / 60;
          let x = d[i * 3], z = d[i * 3 + 2];
          if (dust.life[i] < 0 || Math.abs(x) > 6.5 || Math.abs(z) > 6.5 || !Number.isFinite(x + z)) {
            x = (Math.random() - 0.5) * 12.5; z = (Math.random() - 0.5) * 12.5; dust.life[i] = 1 + Math.random() * 3;
          } else if (dt) {
            const [vx, vz] = vel(x, z, t);
            x += vx * dt; z += vz * dt;
          }
          d.set([x, 0.05, z], i * 3);
        }
        dust.geometry.attributes.position.needsUpdate = true;
      },
      step: S => path.push(X(S[a]), 0.06, Z(S[b])),
    };
  },

  // no 2D form: the motion needs all three axes
  attractor: ({ lo, hi, coords, labels }) => root => {
    const [a, b, c] = coords.attractor, ctr = k => (lo[k] + hi[k]) / 2;
    const s = 3.6 / Math.max(half(lo, hi, a), half(lo, hi, b), half(lo, hi, c));
    const at = S => [(S[a] - ctr(a)) * s, (S[c] - ctr(c)) * s + 4, (S[b] - ctr(b)) * s];
    const all = trail(9000, T.line, 0.28), recent = trail(260, T.accent, 1);
    const head = wire(new THREE.OctahedronGeometry(0.14), T.accent, 1);
    const frame = edges(new THREE.BoxGeometry(2 * half(lo, hi, a) * s, 2 * half(lo, hi, c) * s, 2 * half(lo, hi, b) * s), T.line, 0.12);
    frame.position.y = 4;
    root.add(all, recent, head, frame);
    return {
      camera: [[10, 7.5, 12], [0, 4, 0]],
      spin: true,
      probe: readout(head, { labels, lo, hi }),
      update: S => head.position.set(...at(S)),
      step(S) { const p = at(S); all.push(...p); recent.push(...p); },
    };
  },

  profile: ({ sim, lo, hi, signed }) => root => {
    const N = sim.NX, base = 2.4, X = i => -6 + (12 * i) / (N - 1), M = 72, span = (sim.dx * (N - 1)) / 2;
    let amp = Math.max(Math.abs(lo), Math.abs(hi), 1e-6);
    const curve = dynLine(N, T.accent, 1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.9, N - 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: T.mesh * 0.6, depthWrite: false })); // solid, so it blooms more than lines
    strip.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(2 * N * 3), 3));
    strip.position.set(0, 0.02, 1.6);
    const history = Array.from({ length: M }, (_, k) => { const l = dynLine(N, T.line, 0.32 * (1 - k / M) ** 1.5); l.position.z = -0.14 * (k + 1); return l; });
    root.add(curve, strip, ...history, segment([-6, base, 0], [6, base, 0], T.line, 0.18), segment([-6, 0, 0], [-6, base, 0], T.line, 0.25), segment([6, 0, 0], [6, base, 0], T.line, 0.25));
    let frame = 0;
    return {
      camera: [[0, 6, 12.5], [0, 1.7, -3]],
      // seen head-on the history lines would pile up on the curve, so 2D hides them
      flat: { dir: 'front', center: [0, 2.4, 0], w: 12.8, h: 4.8, hide: history },
      probe(rc) {
        const hit = hitPlane(rc, FRONT, 0);
        if (!hit || Math.abs(hit.x) > 6.2) return null;
        const i = clampIdx(Math.round(((hit.x + 6) / 12) * (N - 1)), N);
        return S => { const u = S[sim.idx(i, 0)]; return { at: [X(i), base + (u / amp) * 1.9, 0], text: `x ${fmt(sim.x0 + i * sim.dx, span)}   u ${fmt(u, amp)}` }; };
      },
      update(S, t, dt) {
        const pos = curve.geometry.attributes.position, col = strip.geometry.attributes.color.array;
        let peak = 0;
        for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(S[sim.idx(i, 0)]));
        if (peak > amp * 1.2) amp += (peak - amp) * 0.1;
        for (let i = 0; i < N; i++) {
          const u = S[sim.idx(i, 0)];
          pos.setXYZ(i, X(i), base + (u / amp) * 1.9, 0);
          heat(signed ? u / amp : (u - lo) / (Math.max(hi, amp) - lo || 1), col, i * 3);
          col.copyWithin(N * 3 + i * 3, i * 3, i * 3 + 3);
        }
        pos.needsUpdate = strip.geometry.attributes.color.needsUpdate = true;
        if (dt && frame++ % 3 === 0) {
          const oldest = history.pop();
          oldest.geometry.attributes.position.array.set(pos.array);
          oldest.geometry.attributes.position.needsUpdate = true;
          history.unshift(oldest);
          history.forEach((l, k) => { l.position.z = -0.14 * (k + 1); l.material.opacity = 0.32 * (1 - k / M) ** 1.5; });
        }
      },
    };
  },

  surface: ({ sim, lo, hi, signed }) => root => {
    const N = sim.NX, base = 1, X = i => -5 + (10 * i) / (N - 1), span = (sim.dx * (N - 1)) / 2;
    let amp = Math.max(Math.abs(lo), Math.abs(hi), 1e-6);
    const position = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3), color = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
    const lines = [], tris = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (i < N - 1) lines.push(k, k + 1);
        if (j < N - 1) lines.push(k, k + N);
        if (i < N - 1 && j < N - 1) tris.push(k, k + 1, k + N, k + 1, k + N + 1, k + N);
      }
    }
    const mk = idx => { const g = new THREE.BufferGeometry(); g.setAttribute('position', position); g.setAttribute('color', color); g.setIndex(idx); return g; };
    const mesh = new THREE.LineSegments(mk(lines), Object.assign(lineMat(0xffffff, T.mesh, true), { blending: THREE.NormalBlending }));
    const fill = new THREE.Mesh(mk(tris), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    mesh.frustumCulled = fill.frustumCulled = false;
    root.add(mesh, fill, edges(new THREE.PlaneGeometry(10.4, 10.4).rotateX(-Math.PI / 2), T.line, 0.3));
    return {
      camera: [[9.5, 8, 10.5], [0, 0.6, 0]],
      flat: { dir: 'top', center: [0, base, 0], w: 10.6, h: 10.6 },
      // hit the deformed surface if possible, else its rest plane; the readout then follows that grid point
      probe(rc) {
        fill.geometry.computeBoundingSphere();
        const hit = rc.intersectObject(fill)[0]?.point ?? hitPlane(rc, UP, base);
        if (!hit || Math.abs(hit.x) > 5.2 || Math.abs(hit.z) > 5.2) return null;
        const i = clampIdx(Math.round(((hit.x + 5) / 10) * (N - 1)), N), j = clampIdx(Math.round(((hit.z + 5) / 10) * (N - 1)), N);
        return S => {
          const u = S[sim.idx(i, j)];
          return { at: [X(i), base + (u / amp) * 1.8, X(j)], text: `x ${fmt(sim.x0 + i * sim.dx, span)}   y ${fmt(sim.x0 + j * sim.dx, span)}   u ${fmt(u, amp)}` };
        };
      },
      update(S) {
        let peak = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(S[sim.idx(i, j)]));
        if (peak > amp * 1.2) amp += (peak - amp) * 0.1;
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const u = S[sim.idx(i, j)], k = j * N + i;
            position.setXYZ(k, X(i), base + (u / amp) * 1.8, X(j));
            heat(signed ? u / amp : (u - lo) / (Math.max(hi, amp) - lo || 1), color.array, k * 3);
          }
        }
        position.needsUpdate = color.needsUpdate = true;
      },
    };
  },
};
