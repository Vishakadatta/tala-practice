import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let leftGroup, rightGroup, rightInner;
let leftBones = {}, rightBones = {};
let rightRestQuats = {};
let ready = false;

const SKIN = 0xe2b08c;
const BG = 0xf6eee3;

const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const JOINTS = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

export async function init(canvas) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);

  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 10);
  camera.position.set(0.12, 0.08, 0.32);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = 0.08;
  controls.maxDistance = 0.5;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.minPolarAngle = Math.PI * 0.05;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xfff5e0, 0x8b7355, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(0.2, 0.5, 0.4);
  scene.add(key);

  addContactShadow();
  await loadHands();
  ready = true;
  animate();
}

function addContactShadow() {
  const sz = 128;
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0, 'rgba(60,40,30,0.15)');
  g.addColorStop(1, 'rgba(60,40,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, -0.04, 0);
  scene.add(plane);
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

  const BASE_Q = new THREE.Quaternion(-0.5, 0.5, 0.5, 0.5);

  const leftQ = BASE_Q.clone();
  leftQ.premultiply(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), -10 * Math.PI / 180
  ));
  leftGroup.quaternion.copy(leftQ);

  const rightQ = BASE_Q.clone();
  rightQ.premultiply(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), -85 * Math.PI / 180
  ));
  rightGroup.quaternion.copy(rightQ);

  leftGroup.position.set(0, -0.02, 0);
  rightGroup.position.set(0, REST_Y, 0);

  scene.add(leftGroup);
  scene.add(rightGroup);

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
        roughness: 1,
        metalness: 0,
        flatShading: true,
      });
    }
  });
}

// --- Posing ---

const LEFT_Y = -0.02;
const REST_Y = 0.025;
const CONTACT_Y = -0.005;
const HOVER_Y = 0.005;

let flexAxes = {};

function computeFlexAxes() {
  scene.updateMatrixWorld(true);

  const wp = new THREE.Vector3();
  const ip = new THREE.Vector3();
  const pp = new THREE.Vector3();
  rightBones.wrist.getWorldPosition(wp);
  rightBones['index-finger-metacarpal'].getWorldPosition(ip);
  rightBones['pinky-finger-metacarpal'].getWorldPosition(pp);

  const toIndex = ip.clone().sub(wp).normalize();
  const toPinky = pp.clone().sub(wp).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(toPinky, toIndex).normalize();

  for (const [name, bone] of Object.entries(rightBones)) {
    if (name === 'wrist') continue;

    const child = bone.children.find(c => c.isBone);
    if (!child) {
      const parentKey = name.replace('-tip', '-phalanx-distal');
      flexAxes[name] = flexAxes[parentKey]
        ? flexAxes[parentKey].clone()
        : new THREE.Vector3(1, 0, 0);
      continue;
    }

    const bw = new THREE.Vector3();
    const cw = new THREE.Vector3();
    bone.getWorldPosition(bw);
    child.getWorldPosition(cw);
    const along = cw.clone().sub(bw).normalize();

    const flexW = new THREE.Vector3().crossVectors(along, palmNormal);
    if (flexW.lengthSq() < 0.001) {
      flexAxes[name] = new THREE.Vector3(1, 0, 0);
      continue;
    }
    flexW.normalize();

    const bq = new THREE.Quaternion();
    bone.getWorldQuaternion(bq);
    const flexLocal = flexW.clone().applyQuaternion(bq.clone().invert()).normalize();

    flexAxes[name] = flexLocal;
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

  const axis = flexAxes[boneName] || new THREE.Vector3(1, 0, 0);
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

      flexFinger(target, -1.0, -0.8, -0.5);

      for (const f of FINGERS) {
        if (f === target) continue;
        flexFinger(f, 0.35, 0.25, 0.15);
      }
      break;
    }
  }
}

export function resetView() {
  camera.position.set(0.12, 0.08, 0.32);
  controls.target.set(0, 0, 0);
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
