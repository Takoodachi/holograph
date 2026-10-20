// Hologram stage (wireframe on black, Orano-style yellow accent, bloom + RGB split) and the physical views.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BG = 0x07080d, LINE = 0xdfe6f2, ACCENT = 0xffd84a;

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 16, 42);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, maxPolarAngle: Math.PI * 0.495, minDistance: 3, maxDistance: 40, autoRotateSpeed: 0.6 });

  const floorMat = floorMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const root = new THREE.Group();
  scene.add(root);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.12));
  const rgb = new ShaderPass(RGBShiftShader);
  rgb.uniforms.amount.value = 0.0011;
  composer.addPass(rgb);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  return {
    root,
    show(view) {
      root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      root.clear();
      const v = view(root);
      camera.position.set(...v.camera[0]);
      controls.target.set(...v.camera[1]);
      controls.autoRotate = !!v.spin;
      return v;
    },
    render(time) {
      floorMat.uniforms.uTime.value = time;
      controls.update();
      composer.render();
    },
  };
}

// Analytic anti-aliased grid that fades into the dark, with a slow yellow scan pulse
function floorMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLine: { value: new THREE.Color(LINE) }, uAccent: { value: new THREE.Color(ACCENT) } },
    vertexShader: `varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uLine, uAccent; varying vec3 vP;
      float grid(vec2 p, float s) { vec2 q = p / s; vec2 g = abs(fract(q - .5) - .5) / fwidth(q); return 1. - min(min(g.x, g.y), 1.); }
      void main() {
        float d = length(vP.xz), fade = smoothstep(30., 3., d);
        float minor = grid(vP.xz, 1.) * .07, major = grid(vP.xz, 5.) * .2;
        float ring = smoothstep(.6, 0., abs(d - mod(uTime * 5., 45.)));
        vec3 c = uLine * (minor + major) + uAccent * ring * (minor * 5. + major * 2. + .03);
        gl_FragColor = vec4(c, (minor + major + ring * .25) * fade);
      }`,
  });
}

// ---------- building blocks ----------

const lineMat = (color = LINE, opacity = 0.5, vertexColors = false) =>
  new THREE.LineBasicMaterial({ color, opacity, vertexColors, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const wire = (geo, color, opacity) => new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMat(color, opacity));
const edges = (geo, color, opacity) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(color, opacity));
const segment = (a, b, color = LINE, opacity = 0.3) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), lineMat(color, opacity));

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

// Field colour: dim navy at rest → white → yellow (positive) or ice blue (negative)
const POS = [[0.08, 0.11, 0.2], [0.42, 0.48, 0.62], [0.92, 0.94, 0.98], [1, 0.84, 0.25]];
const NEG = [[0.08, 0.11, 0.2], [0.2, 0.36, 0.6], [0.45, 0.72, 1], [0.8, 0.93, 1]];
function heat(s, out, o) {
  const ramp = s < 0 ? NEG : POS, v = Math.min(Math.abs(s), 1) * 3, i = Math.min(Math.floor(v), 2), f = v - i;
  for (let c = 0; c < 3; c++) out[o + c] = ramp[i][c] + (ramp[i + 1][c] - ramp[i][c]) * f;
}

const half = (lo, hi, k) => Math.max((hi[k] - lo[k]) / 2, Math.abs(hi[k] + lo[k]) * 1e-3, 1e-6);

// ---------- views: (ctx) => (root) => { camera, update(S, t, dt), step?(S, t) } ----------

export const VIEW_NAMES = { spring: 'Mass–spring', pendulum: 'Pendulum', level: 'Tank level', phase: 'Phase space', attractor: '3D trajectory', profile: 'String / rod', surface: 'Membrane / plate' };

export const VIEWS = {
  spring: ({ lo, hi }) => root => {
    const s = 3 / Math.max(Math.abs(lo[0]), Math.abs(hi[0]), 1e-6), wallX = -6.5, y0 = 0.7;
    const box = new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2);
    const mass = new THREE.Group().add(wire(box, ACCENT, 0.45), edges(box, ACCENT, 1));
    const coil = dynLine(420, LINE, 0.9);
    const wall = wire(new THREE.BoxGeometry(0.4, 3, 3, 1, 5, 5), LINE, 0.25);
    wall.position.set(wallX - 0.2, 1.5, 0);
    const gate = edges(new THREE.PlaneGeometry(2.6, 2.6), ACCENT, 0.25);
    gate.position.set(0, 1.3, 0);
    gate.rotation.y = Math.PI / 2;
    root.add(mass, coil, wall, gate, segment([wallX, 0.01, 1], [7, 0.01, 1]), segment([wallX, 0.01, -1], [7, 0.01, -1]));
    return {
      camera: [[1.5, 4.2, 12.5], [-0.8, 1.1, 0]],
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

  pendulum: () => root => {
    const L = 3.3, P = new THREE.Vector3(0, 4.7, 0);
    const bobGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const bob = new THREE.Group().add(wire(bobGeo, ACCENT, 0.6));
    const rod = dynLine(2, LINE, 0.95), path = trail(140, ACCENT, 0.35);
    const mount = wire(new THREE.BoxGeometry(2.4, 0.16, 0.7, 4, 1, 1), LINE, 0.35);
    mount.position.copy(P).add(new THREE.Vector3(0, 0.08, 0));
    const guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, L, L).getPoints(96)), lineMat(LINE, 0.1));
    guide.position.copy(P);
    root.add(bob, rod, path, mount, guide, segment([0, 0.01, 0], [0, P.y, 0], LINE, 0.08));
    const at = th => [P.x + L * Math.sin(th), P.y - L * Math.cos(th), 0];
    return {
      camera: [[0, 3.4, 11.5], [0, 2.6, 0]],
      update(S) {
        const p = at(S[0]);
        bob.position.set(...p);
        rod.geometry.attributes.position.array.set([P.x, P.y, P.z, ...p]);
        rod.geometry.attributes.position.needsUpdate = true;
      },
      step: S => path.push(...at(S[0])),
    };
  },

  level: ({ lo, hi }) => root => {
    const H = 5, R = 1.5, base = Math.min(lo[0], 0), span = Math.max(hi[0], 0) - base || 1;
    const tank = wire(new THREE.CylinderGeometry(R, R, H, 28, 10, true), LINE, 0.18);
    tank.position.y = H / 2;
    const fluid = wire(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 1, 28, 1), ACCENT, 0.35);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, R * 0.93, R * 0.93).getPoints(64)), lineMat(ACCENT, 1));
    ring.rotation.x = -Math.PI / 2;
    root.add(tank, fluid, ring);
    if (base < 0) {
      const zero = ring.clone();
      zero.material = lineMat(LINE, 0.5);
      zero.position.y = (-base / span) * H;
      root.add(zero);
    }
    return {
      camera: [[5, 5.5, 9.5], [0, 2.4, 0]],
      update(S) {
        const h = Math.max(0.005, ((S[0] - base) / span) * H);
        fluid.scale.y = h;
        fluid.position.y = h / 2;
        ring.position.y = h;
      },
    };
  },

  phase: ({ lo, hi, coords, field, P }) => root => {
    const [a, b] = coords.phase, ca = (lo[a] + hi[a]) / 2, cb = (lo[b] + hi[b]) / 2;
    // positions (orbits, populations) keep true proportions; (y, y') gets one scale per axis
    let sa = 5 / (half(lo, hi, a) * 1.25), sb = 5 / (half(lo, hi, b) * 1.25);
    if (coords.uniform) sa = sb = Math.min(sa, sb);
    const X = v => (v - ca) * sa, Z = v => -(v - cb) * sb, A = x => x / sa + ca, B = z => -z / sb + cb;
    const path = trail(2500, ACCENT, 0.85);
    const head = wire(new THREE.OctahedronGeometry(0.16), ACCENT, 1);
    root.add(path, head, edges(new THREE.PlaneGeometry(12.5, 12.5).rotateX(-Math.PI / 2), LINE, 0.3));
    if (lo[a] < 0 && hi[a] > 0) root.add(segment([X(0), 0.02, -6.25], [X(0), 0.02, 6.25], LINE, 0.25));
    if (lo[b] < 0 && hi[b] > 0) root.add(segment([-6.25, 0.02, Z(0)], [6.25, 0.02, Z(0)], LINE, 0.25));

    // 2D state: draw the vector field and let dust flow along it
    let arrows, dust, Y = new Float64Array(2), dY = new Float64Array(2);
    const N = 21, M = 700;
    if (field) {
      arrows = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0xffffff, 0.8, true));
      arrows.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * N * 6), 3));
      arrows.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 6), 3));
      dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: LINE, size: 0.06, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
      dust.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
      dust.life = new Float32Array(M).map(() => Math.random() * 3);
      root.add(arrows, dust);
    }
    const vel = (x, z, t) => { Y[a] = A(x); Y[b] = B(z); field(P, t, Y, dY); return [dY[a] * sa, -dY[b] * sb]; };

    return {
      camera: [[0, 12.5, 8.5], [0, 0, 0.6]],
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
        mags.forEach((m, i) => { const k = 0.15 + 0.85 * Math.sqrt(Math.min(m / top, 1)); c.set([k * 0.25, k * 0.28, k * 0.35, k, k * 0.86, k * 0.4], i * 6); });
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

  attractor: ({ lo, hi, coords }) => root => {
    const [a, b, c] = coords.attractor, ctr = k => (lo[k] + hi[k]) / 2;
    const s = 3.6 / Math.max(half(lo, hi, a), half(lo, hi, b), half(lo, hi, c));
    const at = S => [(S[a] - ctr(a)) * s, (S[c] - ctr(c)) * s + 4, (S[b] - ctr(b)) * s];
    const all = trail(9000, LINE, 0.28), recent = trail(260, ACCENT, 1);
    const head = wire(new THREE.OctahedronGeometry(0.14), ACCENT, 1);
    const frame = edges(new THREE.BoxGeometry(2 * half(lo, hi, a) * s, 2 * half(lo, hi, c) * s, 2 * half(lo, hi, b) * s), LINE, 0.12);
    frame.position.y = 4;
    root.add(all, recent, head, frame);
    return {
      camera: [[10, 7.5, 12], [0, 4, 0]],
      spin: true,
      update: S => head.position.set(...at(S)),
      step(S) { const p = at(S); all.push(...p); recent.push(...p); },
    };
  },

  profile: ({ sim, lo, hi, signed }) => root => {
    const N = sim.NX, base = 2.4, X = i => -6 + (12 * i) / (N - 1), M = 72;
    let amp = Math.max(Math.abs(lo), Math.abs(hi), 1e-6);
    const curve = dynLine(N, ACCENT, 1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.9, N - 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    strip.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(2 * N * 3), 3));
    strip.position.set(0, 0.02, 1.6);
    const history = Array.from({ length: M }, (_, k) => { const l = dynLine(N, LINE, 0.32 * (1 - k / M) ** 1.5); l.position.z = -0.14 * (k + 1); return l; });
    root.add(curve, strip, ...history, segment([-6, base, 0], [6, base, 0], LINE, 0.18), segment([-6, 0, 0], [-6, base, 0], LINE, 0.25), segment([6, 0, 0], [6, base, 0], LINE, 0.25));
    let frame = 0;
    return {
      camera: [[0, 6, 12.5], [0, 1.7, -3]],
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
    const N = sim.NX, base = 1, X = i => -5 + (10 * i) / (N - 1);
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
    const mesh = new THREE.LineSegments(mk(lines), lineMat(0xffffff, 0.85, true));
    const fill = new THREE.Mesh(mk(tris), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.frustumCulled = fill.frustumCulled = false;
    root.add(mesh, fill, edges(new THREE.PlaneGeometry(10.4, 10.4).rotateX(-Math.PI / 2), LINE, 0.3));
    return {
      camera: [[9.5, 8, 10.5], [0, 0.6, 0]],
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
