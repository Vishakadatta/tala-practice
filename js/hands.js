import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Scene layout (world space, performer's point of view):
//   +Y up, -Z away from the performer, +X to the performer's right.
//   Left hand: palm up, fingers pointing forward-right. It never moves.
//   Right hand: palm down above it, fingers pointing forward-left, so the two
//   hands cross like an X with the palms centred on each other.
//
// Model space of the WebXR generic-hand files (both hands):
//   fingers point -Y, thumb side is -Z, palm faces +X (left) / -X (right).
// ---------------------------------------------------------------------------

// --- Constants ----------------------------------------------------------------

const SKIN          = 0xe2b08c;
const BG            = 0xf6eee3;

const FINGERS       = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const JOINTS        = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const THUMB_JOINTS  = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];

const LEFT_YAW      = 32;     // degrees: left fingers turn this far to the right of "forward"
const RIGHT_YAW     = 38;     // degrees: right fingers turn this far to the left of "forward"
const LEFT_ROLL     = 8;      // degrees: left palm tilts slightly toward the performer
const PALM_GAP      = 0.027;  // metres between the two palm centres at contact (hand thickness)
const REST_LIFT     = 0.04;   // metres above contact when resting
const FINGER_HOVER  = 0.03;
const FINGER_SLIDE  = -0.045; // right hand slides back so its fingertips land on the left palm
const TIP_TARGET_Y  = 0.019;  // y-threshold: tip lands on left-palm surface
const SOLVE_ITERS   = 24;     // bisection iterations for tap-angle solver
const SOLVE_HI      = 1.6;    // radians — upper bound for curl search
const THUMB_ADDUCT  = -0.4;   // radians: right thumb adduction at rest (negative = toward palm)

const RELAXED       = [0.15, 0.18, 0.1];
const LIFTED        = [-0.38, -0.08, 0.0];
const TAP_SHAPE     = [1, 0.4, 0.2];   // proportional curl; magnitude solved per finger
const tapAngles     = {};               // finger -> [p, i, d] solved to place tip on left palm

const CAM_POS       = new THREE.Vector3(0.25, 0.13, -0.17);
const CAM_TARGET    = new THREE.Vector3(0.0, 0.012, -0.02);

const FINGER_OF = {
  FINGER_LITTLE: 'pinky-finger',
  FINGER_RING:   'ring-finger',
  FINGER_MIDDLE: 'middle-finger',
  FINGER_INDEX:  'index-finger',
  FINGER_THUMB:  'thumb',
};

// --- Module state (scene graph, bone tables) ----------------------------------

let scene, camera, renderer, controls;
let leftGroup, rightGroup, rightFlip;
const bones     = { left: {}, right: {} };
const restQuats = { left: {}, right: {} };
const flexAxes  = { left: {}, right: {} };
let rightFingerDir = new THREE.Vector3();
const rightBase    = new THREE.Vector3();
let ready = false;

let clock    = () => performance.now() / 1000;
let timeline = [];    // [{ t, state, predicted? }] sorted by t
let current  = null;  // last rendered state

export function setClock(fn) { clock = fn; }

// --- Initialisation -----------------------------------------------------------

export async function init(canvas) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);

  camera = new THREE.PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight, 0.01, 10);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.1;
  controls.enablePan      = false;
  controls.minDistance    = 0.15;
  controls.maxDistance    = 0.6;
  controls.minPolarAngle  = Math.PI * 0.08;
  controls.maxPolarAngle  = Math.PI * 0.48;
  resetView();

  scene.add(new THREE.HemisphereLight(0xfff6ea, 0xf0e2d0, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(0.3, 0.6, 0.35);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff0e0, 0.6);
  rim.position.set(-0.4, 0.3, -0.5);
  scene.add(rim);

  addContactShadow();
  await loadHands();

  current  = poseState('REST');
  timeline = [{ t: -Infinity, state: current }];
  applyState(current);

  ready = true;
  renderer.setAnimationLoop(frame);
  if (location.search.includes('debug')) {
    window.__handsDbg = () => ({ now: clock(), events: timeline.map(e => e.t), flip: current.flip, y: current.y });
  }
}

// Soft radial gradient beneath the hands for a grounded look.
function addContactShadow() {
  const sz  = 256;
  const c   = document.createElement('canvas');
  c.width   = sz;
  c.height  = sz;
  const ctx = c.getContext('2d');
  const g   = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0,   'rgba(80,55,35,0.16)');
  g.addColorStop(0.6, 'rgba(80,55,35,0.06)');
  g.addColorStop(1,   'rgba(80,55,35,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);

  const mat   = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, -0.045, -0.02);
  scene.add(plane);
}

async function loadHands() {
  const loader  = new GLTFLoader();
  const [lg, rg] = await Promise.all([
    loader.loadAsync('assets/hands/left.glb'),
    loader.loadAsync('assets/hands/right.glb'),
  ]);

  for (const [side, gltf] of [['left', lg], ['right', rg]]) {
    gltf.scene.traverse(n => {
      if (n.isBone) bones[side][n.name] = n;
      if (n.isMesh) {
        n.frustumCulled = false;
        n.material = new THREE.MeshStandardMaterial({
          color: SKIN, roughness: 1, metalness: 0, flatShading: true,
        });
      }
    });
    buildHierarchy(bones[side]);
  }

  const leftScene  = centreOnPalm(lg.scene, bones.left);
  const rightScene = centreOnPalm(rg.scene, bones.right);

  leftGroup = new THREE.Group();
  leftGroup.add(leftScene);
  leftGroup.quaternion.copy(orientation(LEFT_YAW, LEFT_ROLL));

  rightFlip = new THREE.Group();   // rotates about the finger axis for the wave gesture
  rightFlip.add(rightScene);
  rightGroup = new THREE.Group();
  rightGroup.add(rightFlip);
  rightGroup.quaternion.copy(orientation(-RIGHT_YAW, 0));
  rightFingerDir = fingerDirection(-RIGHT_YAW);
  rightBase.set(0, PALM_GAP, 0);
  rightGroup.position.copy(rightBase);

  scene.add(leftGroup, rightGroup);
  scene.updateMatrixWorld(true);

  for (const side of ['left', 'right']) {
    for (const [name, b] of Object.entries(bones[side])) restQuats[side][name] = b.quaternion.clone();
    computeFlexAxes(side);
  }

  solveTaps();

  // Slightly cupped resting pose — a dead-flat hand looks unnatural.
  for (const f of FINGERS) {
    if (f === 'thumb') setFinger('left', f, [0.3, 0.25, 0.05]);
    else               setFinger('left', f, [0.12, 0.14, 0.08]);
  }
  // The left thumb always pokes through the right palm; hide it entirely.
  // A real clapping hand naturally tucks its thumb inward, so this is correct.
  for (const jt of THUMB_JOINTS) {
    if (bones.left[jt]) bones.left[jt].scale.setScalar(0);
  }
  // Right thumb: adduct slightly so it doesn't spike outward.
  adductThumb('right', THUMB_ADDUCT);
}

// --- Geometry helpers ---------------------------------------------------------

// Centre a hand model on its palm so rotations happen about the palm, not the VR origin.
function centreOnPalm(root, b) {
  root.updateMatrixWorld(true);
  const w = new THREE.Vector3();
  const m = new THREE.Vector3();
  b.wrist.getWorldPosition(w);
  b['middle-finger-phalanx-proximal'].getWorldPosition(m);
  root.position.sub(w.add(m).multiplyScalar(0.5));
  const holder = new THREE.Group();
  holder.add(root);
  return holder;
}

// Unit vector in world space along the finger direction for a given yaw.
function fingerDirection(yawDeg) {
  const a = THREE.MathUtils.degToRad(yawDeg);
  return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
}

// Quaternion that places the hand model at the correct yaw and optional roll.
function orientation(yawDeg, rollDeg) {
  const up    = new THREE.Vector3(0, 1, 0);
  const f     = fingerDirection(yawDeg);
  const yAxis = f.clone().negate();                  // model +Y = away from fingertips
  const zAxis = new THREE.Vector3().crossVectors(up, yAxis);
  const q     = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(up, yAxis, zAxis));
  if (rollDeg) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(f, THREE.MathUtils.degToRad(rollDeg)));
  }
  return q;
}

// Ensure each finger's joints are parented in wrist → metacarpal → … → tip order.
function buildHierarchy(b) {
  for (const finger of FINGERS) {
    const chain = ['wrist'];
    for (const joint of JOINTS) {
      const name = `${finger}-${joint}`;
      if (b[name]) chain.push(name);
    }
    for (let i = 1; i < chain.length; i++) {
      const parent = b[chain[i - 1]];
      const child  = b[chain[i]];
      if (child.parent !== parent) parent.attach(child);
    }
  }
}

// Compute the palm normal in world space for a given side.
// Positive direction = out of the palm face (toward the "clapping" side).
function palmNormalWorld(side) {
  const b   = bones[side];
  const wp  = new THREE.Vector3();
  const ip  = new THREE.Vector3();
  const pp  = new THREE.Vector3();
  b.wrist.getWorldPosition(wp);
  b['index-finger-metacarpal'].getWorldPosition(ip);
  b['pinky-finger-metacarpal'].getWorldPosition(pp);
  const n = new THREE.Vector3()
    .crossVectors(pp.sub(wp).normalize(), ip.sub(wp).normalize())
    .normalize();
  if (side === 'left') n.negate(); // mirrored model: keep "positive = curl toward palm"
  return n;
}

// Pre-compute the local-space flex axis for every bone (used by setFinger).
function computeFlexAxes(side) {
  const b      = bones[side];
  const normal = palmNormalWorld(side);

  for (const [name, bone] of Object.entries(b)) {
    if (name === 'wrist') continue;
    const child = bone.children.find(c => c.isBone);
    if (!child) continue;
    const bw    = new THREE.Vector3();
    const cw    = new THREE.Vector3();
    bone.getWorldPosition(bw);
    child.getWorldPosition(cw);
    const axisW = new THREE.Vector3().crossVectors(cw.sub(bw).normalize(), normal);
    if (axisW.lengthSq() < 1e-6) continue;
    axisW.normalize();
    const bq = new THREE.Quaternion();
    bone.getWorldQuaternion(bq);
    flexAxes[side][name] = axisW.applyQuaternion(bq.invert()).normalize();
  }
}

// Rotate the thumb metacarpal around the palm normal to adduct/abduct the thumb.
// Positive angle swings the thumb toward the index finger (adduction).
function adductThumb(side, angle) {
  const b  = bones[side];
  const mc = b['thumb-metacarpal'];
  if (!mc) return;
  const normal   = palmNormalWorld(side);
  const wq       = new THREE.Quaternion();
  mc.getWorldQuaternion(wq);
  const axisLocal = normal.applyQuaternion(wq.invert()).normalize();
  mc.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisLocal, angle));
  // Bake into restQuats so animations always start from the tucked position.
  restQuats[side]['thumb-metacarpal'] = mc.quaternion.clone();
}

// Apply [proximal, intermediate, distal] curl angles (radians) to one finger.
// Positive values curl the finger toward the palm.
function setFinger(side, finger, angles) {
  const names = finger === 'thumb'
    ? ['thumb-phalanx-proximal', 'thumb-phalanx-distal', null]
    : [`${finger}-phalanx-proximal`, `${finger}-phalanx-intermediate`, `${finger}-phalanx-distal`];
  names.forEach((n, i) => {
    if (!n) return;
    const bone = bones[side][n];
    const rest = restQuats[side][n];
    const axis = flexAxes[side][n];
    if (!bone || !rest || !axis) return;
    bone.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, -angles[i]));
  });
}

// Bisection: find the curl magnitude that puts each right fingertip on the left palm.
function solveTaps() {
  const tip = new THREE.Vector3();
  for (const f of FINGERS) {
    let lo = 0;
    let hi = SOLVE_HI;
    for (let it = 0; it < SOLVE_ITERS; it++) {
      const k  = (lo + hi) / 2;
      const st = poseState('REST');
      st.y     = FINGER_HOVER;
      st.slide = FINGER_SLIDE;
      for (const g of FINGERS) st.fingers[g] = LIFTED.slice();
      st.fingers[f] = TAP_SHAPE.map(v => v * k);
      applyState(st);
      scene.updateMatrixWorld(true);
      bones.right[`${f}-tip`].getWorldPosition(tip);
      if (tip.y > TIP_TARGET_Y) lo = k; else hi = k;
    }
    tapAngles[f] = TAP_SHAPE.map(v => v * (lo + hi) / 2);
  }
}

// --- Pose system --------------------------------------------------------------

// Build a complete pose state object from a gesture name.
function poseState(name) {
  const s = { y: 0, slide: 0, flip: 0, strike: true, fingers: {} };
  for (const f of FINGERS) s.fingers[f] = RELAXED.slice();
  switch (name) {
    case 'CLAP': break;
    case 'WAVE': s.flip = Math.PI; break;
    case 'NONE':
    case 'REST':
      s.y      = REST_LIFT;
      s.strike = false;
      break;
    default:
      if (FINGER_OF[name]) {
        s.y    = FINGER_HOVER;
        s.slide = FINGER_SLIDE;
        for (const f of FINGERS) s.fingers[f] = LIFTED.slice();
        s.fingers[FINGER_OF[name]] = tapAngles[FINGER_OF[name]].slice();
      }
  }
  return s;
}

// Smoothstep easing (C1 continuous).
function lerp(a, b, u)    { return a + (b - a) * u; }
function smooth(e0, e1, x) {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

// Interpolate between two pose states.
// The arc height scales with the beat duration so fast tempos stay snappy.
function blend(s0, s1, u, dur) {
  const lift = s1.strike ? Math.min(0.025, Math.max(0.005, 0.03 * dur)) : 0;
  const out  = {
    y:       lerp(s0.y,     s1.y,     smooth(0,    1,    u)) + lift * Math.sin(Math.PI * Math.pow(u, 0.85)),
    slide:   lerp(s0.slide, s1.slide, smooth(0.05, 0.8,  u)),
    flip:    lerp(s0.flip,  s1.flip,  smooth(0.15, 0.8,  u)),
    strike:  s1.strike,
    fingers: {},
  };
  const fu = smooth(0.25, 0.97, u);
  for (const f of FINGERS) out.fingers[f] = s0.fingers[f].map((v, i) => lerp(v, s1.fingers[f][i], fu));
  return out;
}

// Apply a pose state to the Three.js scene graph.
const UP = new THREE.Vector3(0, 1, 0);
function applyState(s) {
  rightGroup.position.copy(rightBase)
    .addScaledVector(UP, s.y)
    .addScaledVector(rightFingerDir, s.slide);
  rightFlip.quaternion.setFromAxisAngle(UP, s.flip);
  for (const f of FINGERS) setFinger('right', f, s.fingers[f]);
}

// Animation loop: interpolate timeline and render.
function frame() {
  if (ready && timeline.length) {
    const now = clock();
    while (timeline.length > 1 && timeline[1].t <= now) timeline.shift();
    const e0 = timeline[0];
    const e1 = timeline[1];
    if (e1) {
      const t0  = Number.isFinite(e0.t) ? e0.t : e1.t - 0.4;
      const dur = Math.max(0.05, e1.t - t0);
      current   = blend(e0.state, e1.state, Math.min(1, Math.max(0, (now - t0) / dur)), dur);
    } else {
      current = e0.state;
    }
    applyState(current);
  }
  controls.update();
  renderer.render(scene, camera);
}

// --- Public API ---------------------------------------------------------------

/** Snap to a named gesture pose immediately (no motion). */
export function setPose(name) {
  if (!ready) return;
  current  = poseState(name);
  timeline = [{ t: -Infinity, state: current }];
  applyState(current);
}

/**
 * Schedule a gesture to arrive exactly at `time` (audio clock, seconds).
 * `predicted` marks a look-ahead guess that will be replaced when the real
 * beat is scheduled.
 */
export function schedulePose(name, time, predicted = false) {
  if (!ready) return;
  timeline = timeline.filter((e, i) => i === 0 || !e.predicted);
  timeline.push({ t: time, state: poseState(name), predicted });
  timeline.sort((a, b) => a.t - b.t);
}

/** Smoothly return to rest from the current position. */
export function settle() {
  if (!ready) return;
  const now = clock();
  timeline  = [{ t: now, state: current }, { t: now + 0.35, state: poseState('REST') }];
}

/** Restore the default camera position and framing. */
export function resetView() {
  const m = location.search.match(/cam=([-\d.]+),([-\d.]+),([-\d.]+)/);
  if (m) CAM_POS.set(+m[1], +m[2], +m[3]);
  fitDistance();
}

// Scale camera distance so both hands stay in frame on narrow viewports.
function fitDistance() {
  const scale = Math.max(1.12, 2.1 / camera.aspect);
  const dir   = CAM_POS.clone().sub(CAM_TARGET);
  camera.position.copy(CAM_TARGET).addScaledVector(dir, scale);
  controls.target.copy(CAM_TARGET);
  controls.update();
}

export function resize(w, h) {
  if (!camera) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  fitDistance();
}

export function setVisible(v) {
  if (leftGroup)  leftGroup.visible  = v;
  if (rightGroup) rightGroup.visible = v;
}

export function isReady() { return ready; }
