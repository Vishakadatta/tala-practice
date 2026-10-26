import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let leftGroup, rightGroup, rightInner;
let leftBones = {}, rightBones = {};
let rightRestQuats = {};
let ready = false;

const SKIN = 0xd4a574;
const ALTA = 0xc23616;
const GOLD = 0xb8963e;
const BG = 0xf5f0e8;

const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const JOINTS = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

export async function init(canvas) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);

  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 10);
  camera.position.set(0.2, 0.03, 0.32);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.005, -0.01);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = 0.08;
  controls.maxDistance = 0.5;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.minPolarAngle = Math.PI * 0.05;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xfff5e0, 1.0);
  key.position.set(0.3, 0.6, 0.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8dcc8, 0.4);
  fill.position.set(-0.2, 0.3, -0.4);
  scene.add(fill);

  await loadHands();
  ready = true;
  animate();
}

async function loadHands() {
  const loader = new GLTFLoader();
  const [lg, rg] = await Promise.all([
    loader.loadAsync('assets/hands/left.glb'),
    loader.loadAsync('assets/hands/right.glb'),
  ]);

  const leftScene = lg.scene;
  const rightScene = rg.scene;

  leftScene.traverse(n => { if (n.isBone) leftBones[n.name] = n; });
  rightScene.traverse(n => { if (n.isBone) rightBones[n.name] = n; });

  buildHierarchy(leftBones);
  buildHierarchy(rightBones);

  setSkin(leftScene);
  setSkin(rightScene);

  leftGroup = new THREE.Group();
  rightGroup = new THREE.Group();
  rightInner = new THREE.Group();

  leftGroup.add(leftScene);
  rightInner.add(rightScene);
  rightGroup.add(rightInner);

  // Quaternion that maps:
  //   model -Y (fingers) → world -Z (away from camera)
  //   left palm (-X) → world +Y (up)
  //   right palm (+X) → world -Y (down)
  const q = new THREE.Quaternion(-0.5, 0.5, 0.5, 0.5);
  leftGroup.quaternion.copy(q);
  rightGroup.quaternion.copy(q);

  leftGroup.position.set(0, -0.06, 0.03);
  rightGroup.position.set(0, 0.07, 0.03);

  scene.add(leftGroup);
  scene.add(rightGroup);

  addAlta(leftBones);
  addAlta(rightBones);
  addPalmCircle(leftBones);
  addBangle(leftBones.wrist);
  addBangle(rightBones.wrist);

  // Force matrix update after re-parenting
  scene.updateMatrixWorld(true);

  for (const [name, bone] of Object.entries(rightBones)) {
    rightRestQuats[name] = bone.quaternion.clone();
  }

  computeFlexAxes();
}

function buildHierarchy(bones) {
  for (const finger of FINGERS) {
    const chain = ['wrist'];
    for (const joint of JOINTS) {
      if (finger === 'thumb' && joint === 'phalanx-intermediate') continue;
      const name = `${finger}-${joint}`;
      if (bones[name]) chain.push(name);
    }
    for (let i = 1; i < chain.length; i++) {
      const parent = bones[chain[i - 1]];
      const child = bones[chain[i]];
      if (child.parent !== parent) parent.attach(child);
    }
  }
}

function setSkin(root) {
  root.traverse(n => {
    if (n.isMesh) {
      n.material = new THREE.MeshStandardMaterial({
        color: SKIN,
        roughness: 0.65,
        metalness: 0.02,
      });
    }
  });
}

function addAlta(bones) {
  const mat = new THREE.MeshStandardMaterial({ color: ALTA, roughness: 0.5 });
  for (const finger of FINGERS) {
    const tip = bones[`${finger}-tip`];
    if (!tip) continue;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), mat);
    tip.add(dot);
  }
}

function addPalmCircle(bones) {
  const mat = new THREE.MeshStandardMaterial({
    color: ALTA, roughness: 0.5, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.01, 16), mat);
  const mid = bones['middle-finger-metacarpal'];
  if (mid) {
    disc.position.set(0, -0.02, 0);
    mid.add(disc);
  }
}

function addBangle(wrist) {
  if (!wrist) return;
  const mat = new THREE.MeshStandardMaterial({
    color: GOLD, metalness: 0.6, roughness: 0.35,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.002, 12, 48), mat);
  torus.rotation.y = -Math.PI / 2;
  wrist.add(torus);
}

// --- Posing ---

const REST_Y = 0.07;
const CONTACT_Y = -0.04;
const HOVER_Y = 0.02;

let flexAxes = {};

function computeFlexAxes() {
  for (const name of Object.keys(rightBones)) {
    if (name === 'wrist') continue;
    flexAxes[name] = new THREE.Vector3(1, 0, 0);
  }
}

function resetRightBones() {
  for (const [name, q] of Object.entries(rightRestQuats)) {
    rightBones[name].quaternion.copy(q);
  }
  rightInner.quaternion.identity();
  rightGroup.position.y = REST_Y;
}

function flexBone(boneName, angle) {
  const bone = rightBones[boneName];
  const rest = rightRestQuats[boneName];
  if (!bone || !rest) return;

  let axis = flexAxes[boneName];
  if (!axis) {
    axis = new THREE.Vector3(0, 0, -1);
  }
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  bone.quaternion.copy(rest.clone().multiply(delta));
}

function flexFinger(finger, proxAngle, interAngle, distAngle) {
  const prox = `${finger}-phalanx-proximal`;
  const inter = `${finger}-phalanx-intermediate`;
  const dist = `${finger}-phalanx-distal`;

  if (proxAngle !== 0) flexBone(prox, proxAngle);
  if (interAngle !== 0 && rightBones[inter]) flexBone(inter, interAngle);
  if (distAngle !== 0) flexBone(dist, distAngle);
}

export function setPose(poseName) {
  if (!ready) return;
  resetRightBones();

  switch (poseName) {
    case 'REST':
      break;

    case 'CLAP':
      rightGroup.position.y = CONTACT_Y;
      break;

    case 'WAVE':
      rightInner.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      rightGroup.position.y = CONTACT_Y;
      break;

    case 'FINGER_LITTLE':
    case 'FINGER_RING':
    case 'FINGER_MIDDLE':
    case 'FINGER_INDEX':
    case 'FINGER_THUMB': {
      rightGroup.position.y = HOVER_Y;

      const fingerMap = {
        FINGER_LITTLE: 'pinky-finger',
        FINGER_RING: 'ring-finger',
        FINGER_MIDDLE: 'middle-finger',
        FINGER_INDEX: 'index-finger',
        FINGER_THUMB: 'thumb',
      };
      const target = fingerMap[poseName];

      // Curl target finger down toward palm
      flexFinger(target, -1.0, -0.7, -0.4);

      // Lift other fingers up
      for (const f of FINGERS) {
        if (f === target) continue;
        flexFinger(f, 0.4, 0.3, 0.2);
      }
      break;
    }
  }
}

export function resetView() {
  camera.position.set(0.2, 0.03, 0.32);
  controls.target.set(0, 0.005, -0.01);
  controls.update();
}

export function resize(w, h) {
  if (!camera) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

export function setVisible(v) {
  if (leftGroup) leftGroup.visible = v;
  if (rightGroup) rightGroup.visible = v;
}

export function isReady() { return ready; }


function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
